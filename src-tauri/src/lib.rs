mod db;
mod profiles;
mod tracker;

use rusqlite::Connection;
use serde::Serialize;
use std::sync::{Arc, Mutex};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, RunEvent, State, WindowEvent,
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
fn save_settings(state: State<AppState>, settings: db::Settings) -> CmdResult<db::Settings> {
    db::save_settings(&state.db.lock().unwrap(), &settings).map_err(err)?;
    *state.settings.lock().unwrap() = settings.clone();
    Ok(settings)
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

fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

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
                settings: Arc::new(Mutex::new(settings)),
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

            // Tray icon: CoKo keeps tracking while the window is hidden.
            let open = MenuItem::with_id(app, "open", "Open CoKo", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit CoKo", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &quit])?;
            TrayIconBuilder::with_id("coko-tray")
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("CoKo is tracking your day")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, e| match e.id.as_ref() {
                    "open" => show_main(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, e| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = e {
                        show_main(tray.app_handle());
                    }
                })
                .build(app)?;

            if std::env::args().any(|a| a == "--minimized") {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.hide();
                }
            }

            tracker::spawn(app.handle().clone());
            Ok(())
        })
        .on_window_event(|window, event| {
            // Closing the window hides it to the tray instead of quitting.
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            bootstrap,
            save_settings,
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
