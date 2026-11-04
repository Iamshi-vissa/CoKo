mod db;
mod profiles;
mod tracker;

use rusqlite::Connection;
use serde::Serialize;
use std::sync::{Arc, Mutex};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, PhysicalPosition, RunEvent, State, WebviewWindow, WindowEvent,
};
use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_notification::NotificationExt;

pub struct AppState {
    pub db: Arc<Mutex<Connection>>,
    pub settings: Arc<Mutex<db::Settings>>,
    pub live: Arc<Mutex<tracker::LiveStatus>>,
    pub session_id: i64,
    pub session_start: i64,
}

type CmdResult<T> = Result<T, String>;

fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

// ------------------------------------------------------------------ windows

/// Widget window size in logical pixels; keep in sync with tauri.conf.json.
const WIDGET_W: f64 = 210.0;
const WIDGET_H: f64 = 230.0;

fn window(app: &AppHandle, label: &str) -> Option<WebviewWindow> {
    app.get_webview_window(label)
}

/// Place the dashboard next to the widget (to its left if there is room,
/// otherwise to its right), bottom-aligned and clamped to the screen.
fn place_dashboard(app: &AppHandle) -> tauri::Result<()> {
    let (Some(widget), Some(main)) = (window(app, "widget"), window(app, "main")) else { return Ok(()) };
    if !widget.is_visible()? {
        main.center()?;
        return Ok(());
    }
    let wp = widget.outer_position()?;
    let Some(mon) = widget.current_monitor()?.or(widget.primary_monitor()?) else { return Ok(()) };
    let sf = mon.scale_factor();
    let mut ws = widget.outer_size()?;
    if ws.width == 0 {
        ws = tauri::PhysicalSize::new((WIDGET_W * sf) as u32, (WIDGET_H * sf) as u32);
    }
    let mut ms = main.outer_size()?;
    if ms.width == 0 {
        ms = tauri::PhysicalSize::new((1040.0 * sf) as u32, (700.0 * sf) as u32);
    }
    let area = mon.work_area();
    let (ax, ay) = (area.position.x, area.position.y);
    let (aw, ah) = (area.size.width as i32, area.size.height as i32);
    let (mw, mh) = (ms.width as i32, ms.height as i32);
    let gap = (12.0 * sf) as i32;

    let mut x = if wp.x - mw - gap >= ax { wp.x - mw - gap } else { wp.x + ws.width as i32 + gap };
    let mut y = wp.y + ws.height as i32 - mh;
    x = x.clamp(ax, (ax + aw - mw).max(ax));
    y = y.clamp(ay, (ay + ah - mh).max(ay));
    main.set_position(PhysicalPosition::new(x, y))
}

fn show_dashboard(app: &AppHandle) {
    if let Some(main) = window(app, "main") {
        let _ = place_dashboard(app);
        let _ = main.show();
        let _ = main.unminimize();
        let _ = main.set_focus();
        let _ = app.emit_to("main", "dashboard-shown", ());
    }
}

fn set_widget_visible(app: &AppHandle, visible: bool) {
    if let Some(w) = window(app, "widget") {
        let _ = if visible { w.show() } else { w.hide() };
    }
}

/// First run: put the widget in the bottom-right corner, above the taskbar or dock.
fn position_widget(app: &AppHandle, settings: &db::Settings) -> tauri::Result<()> {
    let Some(w) = window(app, "widget") else { return Ok(()) };
    if let (Some(x), Some(y)) = (settings.widget_x, settings.widget_y) {
        // Only restore the saved spot if it is still on a connected monitor.
        let on_screen = w.available_monitors()?.iter().any(|m| {
            let (p, s) = (m.position(), m.size());
            x >= p.x - 50 && y >= p.y - 50 && x < p.x + s.width as i32 && y < p.y + s.height as i32
        });
        if on_screen {
            return w.set_position(PhysicalPosition::new(x, y));
        }
    }
    if let Some(mon) = w.primary_monitor()? {
        let area = mon.work_area();
        // outer_size() can still be 0 before the window is first drawn (Linux),
        // so use the configured size.
        let sf = mon.scale_factor();
        let (ww, wh) = ((WIDGET_W * sf) as i32, (WIDGET_H * sf) as i32);
        let margin = (24.0 * sf) as i32;
        let x = area.position.x + area.size.width as i32 - ww - margin;
        let y = area.position.y + area.size.height as i32 - wh - margin;
        w.set_position(PhysicalPosition::new(x, y))?;
    }
    Ok(())
}

// ------------------------------------------------------------------ commands

#[derive(Serialize)]
struct Bootstrap {
    settings: db::Settings,
    profiles: &'static [profiles::Profile],
    status: tracker::LiveStatus,
}

#[tauri::command]
fn bootstrap(state: State<AppState>) -> Bootstrap {
    Bootstrap {
        settings: state.settings.lock().unwrap().clone(),
        profiles: profiles::PROFILES,
        status: state.live.lock().unwrap().clone(),
    }
}

#[tauri::command]
fn save_settings(app: AppHandle, state: State<AppState>, mut settings: db::Settings) -> CmdResult<db::Settings> {
    {
        // The widget position is owned by the backend; keep the latest value.
        let cur = state.settings.lock().unwrap();
        settings.widget_x = cur.widget_x;
        settings.widget_y = cur.widget_y;
    }
    db::save_settings(&state.db.lock().unwrap(), &settings).map_err(err)?;
    *state.settings.lock().unwrap() = settings.clone();
    set_widget_visible(&app, settings.show_widget);
    let _ = app.emit("settings-changed", settings.clone());
    Ok(settings)
}

#[tauri::command]
fn toggle_dashboard(app: AppHandle) {
    if let Some(main) = window(&app, "main") {
        let visible = main.is_visible().unwrap_or(false);
        let minimized = main.is_minimized().unwrap_or(false);
        if visible && !minimized {
            let _ = main.hide();
        } else {
            show_dashboard(&app);
        }
    }
}

#[tauri::command]
fn hide_dashboard(app: AppHandle) {
    if let Some(main) = window(&app, "main") {
        let _ = main.hide();
    }
}

#[tauri::command]
fn day_summary(state: State<AppState>, date: Option<String>) -> CmdResult<db::DaySummary> {
    let date = date.unwrap_or_else(db::today);
    db::day_summary(&state.db.lock().unwrap(), &date).map_err(err)
}

#[tauri::command]
fn week_summary(state: State<AppState>) -> CmdResult<Vec<db::WeekDay>> {
    db::week(&state.db.lock().unwrap()).map_err(err)
}

#[tauri::command]
fn add_journal(state: State<AppState>, kind: String, mood: Option<String>, text: String) -> CmdResult<i64> {
    let text = text.trim();
    if text.is_empty() {
        return Err("Entry is empty".into());
    }
    db::add_journal(&state.db.lock().unwrap(), &kind, mood.as_deref(), text).map_err(err)
}

#[tauri::command]
fn list_journal(state: State<AppState>, date: Option<String>) -> CmdResult<Vec<db::JournalEntry>> {
    let date = date.unwrap_or_else(db::today);
    db::list_journal(&state.db.lock().unwrap(), &date).map_err(err)
}

#[tauri::command]
fn toggle_task(state: State<AppState>, id: i64) -> CmdResult<()> {
    db::toggle_task(&state.db.lock().unwrap(), id).map_err(err)
}

#[tauri::command]
fn delete_journal(state: State<AppState>, id: i64) -> CmdResult<()> {
    db::delete_journal(&state.db.lock().unwrap(), id).map_err(err)
}

#[tauri::command]
fn test_notification(app: AppHandle, state: State<AppState>) -> CmdResult<()> {
    let name = state.settings.lock().unwrap().mascot_name.clone();
    app.notification()
        .builder()
        .title(format!("Hi from {name}!"))
        .body("Notifications are working. I'll ping you about breaks, battery and work logs.")
        .show()
        .map_err(err)
}

// ------------------------------------------------------------------ app

pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, Some(vec!["--minimized"])))
        .setup(|app| {
            // Database in the OS app-data folder.
            let dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&dir)?;
            let conn = db::open(&dir.join("coko.sqlite3"))?;
            let settings = db::load_settings(&conn);
            let session_id = db::start_session(&conn)?;
            let session_start = db::now_ts();

            app.manage(AppState {
                db: Arc::new(Mutex::new(conn)),
                settings: Arc::new(Mutex::new(settings.clone())),
                live: Arc::new(Mutex::new(tracker::LiveStatus { session_start, ..Default::default() })),
                session_id,
                session_start,
            });

            // Start with the OS so each login is recorded as a session.
            {
                use tauri_plugin_autostart::ManagerExt;
                let al = app.autolaunch();
                if !al.is_enabled().unwrap_or(false) {
                    let _ = al.enable();
                }
            }

            // Floating widget.
            let handle = app.handle().clone();
            let _ = position_widget(&handle, &settings);
            set_widget_visible(&handle, settings.show_widget);

            // First run: open the dashboard so the user can pick a CoKo type.
            if !settings.onboarded {
                show_dashboard(&handle);
            }

            // Tray icon: CoKo keeps tracking while its windows are hidden.
            let open = MenuItem::with_id(app, "open", "Open dashboard", true, None::<&str>)?;
            let widget = MenuItem::with_id(app, "widget", "Show / hide widget", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit CoKo", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &widget, &quit])?;
            TrayIconBuilder::with_id("coko-tray")
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("CoKo is tracking your day")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, e| match e.id.as_ref() {
                    "open" => show_dashboard(app),
                    "widget" => {
                        let state = app.state::<AppState>();
                        let mut s = state.settings.lock().unwrap();
                        s.show_widget = !s.show_widget;
                        let _ = db::save_settings(&state.db.lock().unwrap(), &s);
                        set_widget_visible(app, s.show_widget);
                        let _ = app.emit("settings-changed", s.clone());
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, e| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = e {
                        show_dashboard(tray.app_handle());
                    }
                })
                .build(app)?;

            tracker::spawn(handle);
            Ok(())
        })
        .on_window_event(|window, event| match event {
            // Closing either window just hides it; quit from the tray menu.
            WindowEvent::CloseRequested { api, .. } => {
                api.prevent_close();
                let _ = window.hide();
            }
            // Remember where the user dropped the widget.
            WindowEvent::Moved(pos) if window.label() == "widget" => {
                let state = window.state::<AppState>();
                let mut s = state.settings.lock().unwrap();
                if s.widget_x != Some(pos.x) || s.widget_y != Some(pos.y) {
                    s.widget_x = Some(pos.x);
                    s.widget_y = Some(pos.y);
                    let _ = db::save_settings(&state.db.lock().unwrap(), &s);
                }
            }
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![
            bootstrap,
            save_settings,
            toggle_dashboard,
            hide_dashboard,
            day_summary,
            week_summary,
            add_journal,
            list_journal,
            toggle_task,
            delete_journal,
            test_notification
        ])
        .build(tauri::generate_context!())
        .expect("error while building CoKo");

    app.run(|app, event| {
        if let RunEvent::Exit = event {
            let state = app.state::<AppState>();
            let _ = db::end_session(&state.db.lock().unwrap(), state.session_id, "quit");
        }
    });
}
