//! Background tracker: every few seconds it samples the active window, idle
//! time and battery, writes the results to SQLite, sends desktop notifications
//! and pushes a live status to the UI so the mascot can react.

use crate::{db, profiles, AppState};
use serde::Serialize;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_notification::NotificationExt;

const TICK_SECS: u64 = 5;

#[derive(Serialize, Clone, Default, Debug)]
pub struct LiveStatus {
    /// "active" | "away"
    pub state: String,
    pub app: String,
    pub title: String,
    pub category: String,
    pub idle_secs: u64,
    pub continuous_active_secs: u64,
    pub battery_percent: Option<f32>,
    pub charging: Option<bool>,
    pub today_active_secs: i64,
    pub today_focus_secs: i64,
    pub goal_secs: i64,
    pub session_start: i64,
}

#[derive(Serialize, Clone)]
pub struct CokoEvent {
    /// break | battery_low | battery_critical | battery_full | plugged | unplugged |
    /// goal | worklog | welcome_back | away
    pub kind: String,
    pub message: String,
}

fn notify(app: &AppHandle, title: &str, body: &str) {
    let _ = app.notification().builder().title(title).body(body).show();
}

fn event(app: &AppHandle, kind: &str, message: String) {
    let _ = app.emit("coko-event", CokoEvent { kind: kind.into(), message });
}

pub fn fmt_dur(secs: i64) -> String {
    let h = secs / 3600;
    let m = (secs % 3600) / 60;
    if h > 0 { format!("{h}h {m}m") } else { format!("{m}m") }
}

fn read_battery() -> Option<(f32, bool)> {
    let manager = starship_battery::Manager::new().ok()?;
    let mut batteries = manager.batteries().ok()?;
    let b = batteries.next()?.ok()?;
    let pct = b.state_of_charge().value * 100.0;
    let charging = matches!(
        b.state(),
        starship_battery::State::Charging | starship_battery::State::Full
    );
    Some((pct, charging))
}

fn idle_seconds() -> u64 {
    user_idle::UserIdle::get_time().map(|t| t.as_seconds()).unwrap_or(0)
}

fn active_window() -> (String, String) {
    match active_win_pos_rs::get_active_window() {
        Ok(w) => {
            let mut name = w.app_name.trim().to_string();
            if name.is_empty() {
                name = w
                    .process_path
                    .file_stem()
                    .map(|s| s.to_string_lossy().to_string())
                    .unwrap_or_else(|| "Unknown".into());
            }
            (name, w.title)
        }
        Err(_) => ("Unknown".into(), String::new()),
    }
}

pub fn spawn(app: AppHandle) {
    std::thread::spawn(move || {
        let state = app.state::<AppState>();
        let mut continuous: u64 = 0;
        let mut was_away = false;
        let mut away_since: i64 = 0;
        let mut last_battery: Option<(f32, bool)> = None;
        let mut warned_low = false;
        let mut warned_critical = false;
        let mut warned_full = false;
        let mut goal_date = String::new();
        let mut last_worklog = db::now_ts();
        let mut tick: u64 = 0;

        loop {
            std::thread::sleep(Duration::from_secs(TICK_SECS));
            tick += 1;

            let settings = state.settings.lock().unwrap().clone();
            let profile = profiles::get(&settings.profile);
            let goal_secs = (settings.daily_goal_hours.unwrap_or(profile.daily_goal_hours) * 3600.0) as i64;
            let break_secs = settings.break_minutes.unwrap_or(profile.break_minutes) * 60;

            // ------------------------------------------------ activity / idle
            let idle = idle_seconds();
            let away = idle >= profile.idle_seconds;
            let (app_name, title, category) = if away {
                (String::new(), String::new(), "away".to_string())
            } else {
                let (a, t) = active_window();
                let c = profiles::classify(profile, &a, &t).to_string();
                (a, t, c)
            };

            {
                let conn = state.db.lock().unwrap();
                if away {
                    let _ = db::add_idle(&conn, TICK_SECS as i64);
                } else {
                    let _ = db::add_active(&conn, &app_name, &category, TICK_SECS as i64);
                }
                if tick % 6 == 0 {
                    let _ = db::heartbeat(&conn, state.session_id);
                }
            }

            if away {
                if !was_away {
                    event(&app, "away", "Zzz... I'll wait right here.".into());
                    away_since = db::now_ts() - idle as i64;
                }
                continuous = 0;
                was_away = true;
            } else {
                if was_away {
                    let gone = db::now_ts() - away_since;
                    event(&app, "welcome_back", format!("Welcome back! You were away for {}. I missed you~", fmt_dur(gone)));
                }
                was_away = false;
                continuous += TICK_SECS;
                if continuous >= break_secs && break_secs > 0 {
                    continuous = 0;
                    if settings.notify_breaks {
                        let msg = format!(
                            "You've been going for {} straight. Stretch, sip some water and rest your eyes!",
                            fmt_dur(break_secs as i64)
                        );
                        notify(&app, &format!("{} says: break time!", settings.mascot_name), &msg);
                        event(&app, "break", msg);
                    }
                }
            }

            // ------------------------------------------------ daily totals / goal / work log
            let (today_active, today_focus, top_app) = {
                let conn = state.db.lock().unwrap();
                let s = db::day_summary(&conn, &db::today()).unwrap_or_default();
                (s.active_secs, s.focus_secs, s.apps.first().map(|a| a.app.clone()))
            };

            let today = db::today();
            if goal_date != today && today_active >= goal_secs && goal_secs > 0 {
                goal_date = today.clone();
                let msg = format!("Daily goal of {} reached! You're amazing!", fmt_dur(goal_secs));
                notify(&app, "Goal complete!", &msg);
                event(&app, "goal", msg);
            }

            let now = db::now_ts();
            if now - last_worklog >= 3600 {
                last_worklog = now;
                if settings.notify_worklog && today_active > 0 {
                    let msg = format!(
                        "Today: {} active, {} focused{}.",
                        fmt_dur(today_active),
                        fmt_dur(today_focus),
                        top_app.map(|a| format!(" — most used: {a}")).unwrap_or_default()
                    );
                    notify(&app, "Hourly work log", &msg);
                    event(&app, "worklog", msg);
                }
            }

            // ------------------------------------------------ battery (every 30 s)
            if tick % 6 == 1 {
                let battery = read_battery();
                if let Some((pct, charging)) = battery {
                    if let Some((_, was_charging)) = last_battery {
                        if charging && !was_charging {
                            event(&app, "plugged", "Yum, power! Thank you~".into());
                        } else if !charging && was_charging {
                            event(&app, "unplugged", "Unplugged! I'll keep an eye on the battery.".into());
                        }
                    }
                    if charging {
                        warned_low = false;
                        warned_critical = false;
                        if pct >= 99.0 && !warned_full && settings.notify_battery {
                            warned_full = true;
                            notify(&app, "Battery full", "Fully charged — you can unplug now.");
                            event(&app, "battery_full", "Battery is full! You can unplug me~".into());
                        }
                    } else {
                        warned_full = false;
                        if pct <= 10.0 && !warned_critical && settings.notify_battery {
                            warned_critical = true;
                            let msg = format!("Battery critical: {:.0}%! Please plug in right now!", pct);
                            notify(&app, "Battery critical", &msg);
                            event(&app, "battery_critical", msg);
                        } else if pct <= settings.low_battery_percent && !warned_low && settings.notify_battery {
                            warned_low = true;
                            let msg = format!("Battery at {:.0}%. Time to find a charger!", pct);
                            notify(&app, "Low battery", &msg);
                            event(&app, "battery_low", msg);
                        }
                    }
                    if tick % 60 == 1 {
                        let conn = state.db.lock().unwrap();
                        let _ = db::log_battery(&conn, pct, charging);
                    }
                }
                last_battery = battery;
            }

            // ------------------------------------------------ push live status
            let live = LiveStatus {
                state: if away { "away".into() } else { "active".into() },
                app: app_name,
                title,
                category,
                idle_secs: idle,
                continuous_active_secs: continuous,
                battery_percent: last_battery.map(|b| b.0),
                charging: last_battery.map(|b| b.1),
                today_active_secs: today_active,
                today_focus_secs: today_focus,
                goal_secs,
                session_start: state.session_start,
            };
            *state.live.lock().unwrap() = live.clone();
            let _ = app.emit("coko-status", live);
        }
    });
}
