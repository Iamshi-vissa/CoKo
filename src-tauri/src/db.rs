//! SQLite storage for sessions, app usage, daily stats, battery samples,
//! journal entries and settings. Everything stays on the user's machine.

use chrono::{Local, NaiveDate};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::path::Path;

pub fn now_ts() -> i64 {
    Local::now().timestamp()
}

pub fn today() -> String {
    Local::now().format("%Y-%m-%d").to_string()
}

pub fn open(path: &Path) -> rusqlite::Result<Connection> {
    let conn = Connection::open(path)?;
    conn.execute_batch(
        r#"
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            start_ts INTEGER NOT NULL,
            last_seen_ts INTEGER NOT NULL,
            end_ts INTEGER,
            end_reason TEXT
        );
        CREATE TABLE IF NOT EXISTS app_usage (
            date TEXT NOT NULL,
            app TEXT NOT NULL,
            category TEXT NOT NULL DEFAULT 'neutral',
            seconds INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (date, app)
        );
        CREATE TABLE IF NOT EXISTS day_stats (
            date TEXT PRIMARY KEY,
            active_secs INTEGER NOT NULL DEFAULT 0,
            idle_secs INTEGER NOT NULL DEFAULT 0,
            focus_secs INTEGER NOT NULL DEFAULT 0,
            distraction_secs INTEGER NOT NULL DEFAULT 0,
            first_seen INTEGER,
            last_seen INTEGER
        );
        CREATE TABLE IF NOT EXISTS battery_log (
            ts INTEGER NOT NULL,
            percent REAL NOT NULL,
            charging INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS journal (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            ts INTEGER NOT NULL,
            kind TEXT NOT NULL DEFAULT 'note',
            mood TEXT,
            text TEXT NOT NULL,
            done INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        "#,
    )?;
    Ok(conn)
}

// ---------------------------------------------------------------- sessions

/// Close any session left open by a crash, shutdown or logout, using the last
/// heartbeat as its end time. Then start a new session.
pub fn start_session(conn: &Connection) -> rusqlite::Result<i64> {
    conn.execute(
        "UPDATE sessions SET end_ts = last_seen_ts, end_reason = 'shutdown/logout'
         WHERE end_ts IS NULL",
        [],
    )?;
    let now = now_ts();
    conn.execute(
        "INSERT INTO sessions (start_ts, last_seen_ts) VALUES (?1, ?1)",
        params![now],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn heartbeat(conn: &Connection, session_id: i64) -> rusqlite::Result<()> {
    conn.execute(
        "UPDATE sessions SET last_seen_ts = ?1 WHERE id = ?2",
        params![now_ts(), session_id],
    )?;
    Ok(())
}

pub fn end_session(conn: &Connection, session_id: i64, reason: &str) -> rusqlite::Result<()> {
    let now = now_ts();
    conn.execute(
        "UPDATE sessions SET last_seen_ts = ?1, end_ts = ?1, end_reason = ?2 WHERE id = ?3",
        params![now, reason, session_id],
    )?;
    Ok(())
}

// ---------------------------------------------------------------- activity

pub fn add_active(conn: &Connection, app: &str, category: &str, secs: i64) -> rusqlite::Result<()> {
    let date = today();
    let now = now_ts();
    conn.execute(
        "INSERT INTO app_usage (date, app, category, seconds) VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(date, app) DO UPDATE SET seconds = seconds + ?4, category = ?3",
        params![date, app, category, secs],
    )?;
    let (focus, distraction) = match category {
        "focus" => (secs, 0),
        "distraction" => (0, secs),
        _ => (0, 0),
    };
    conn.execute(
        "INSERT INTO day_stats (date, active_secs, focus_secs, distraction_secs, first_seen, last_seen)
         VALUES (?1, ?2, ?3, ?4, ?5, ?5)
         ON CONFLICT(date) DO UPDATE SET
            active_secs = active_secs + ?2,
            focus_secs = focus_secs + ?3,
            distraction_secs = distraction_secs + ?4,
            first_seen = COALESCE(first_seen, ?5),
            last_seen = ?5",
        params![date, secs, focus, distraction, now],
    )?;
    Ok(())
}

pub fn add_idle(conn: &Connection, secs: i64) -> rusqlite::Result<()> {
    let now = now_ts();
    conn.execute(
        "INSERT INTO day_stats (date, idle_secs, first_seen, last_seen) VALUES (?1, ?2, ?3, ?3)
         ON CONFLICT(date) DO UPDATE SET idle_secs = idle_secs + ?2, last_seen = ?3",
        params![today(), secs, now],
    )?;
    Ok(())
}

pub fn log_battery(conn: &Connection, percent: f32, charging: bool) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO battery_log (ts, percent, charging) VALUES (?1, ?2, ?3)",
        params![now_ts(), percent, charging as i32],
    )?;
    Ok(())
}

// ---------------------------------------------------------------- reports

#[derive(Serialize, Default, Clone)]
pub struct AppRow {
    pub app: String,
    pub category: String,
    pub seconds: i64,
}

#[derive(Serialize, Default, Clone)]
pub struct SessionRow {
    pub id: i64,
    pub start_ts: i64,
    pub end_ts: Option<i64>,
    pub last_seen_ts: i64,
    pub end_reason: Option<String>,
}

#[derive(Serialize, Default, Clone)]
pub struct DaySummary {
    pub date: String,
    pub active_secs: i64,
    pub idle_secs: i64,
    pub focus_secs: i64,
    pub distraction_secs: i64,
    pub first_seen: Option<i64>,
    pub last_seen: Option<i64>,
    pub apps: Vec<AppRow>,
    pub sessions: Vec<SessionRow>,
}

pub fn day_totals(conn: &Connection, date: &str) -> rusqlite::Result<DaySummary> {
    let mut s = conn
        .query_row(
            "SELECT active_secs, idle_secs, focus_secs, distraction_secs, first_seen, last_seen
             FROM day_stats WHERE date = ?1",
            params![date],
            |r| {
                Ok(DaySummary {
                    date: date.to_string(),
                    active_secs: r.get(0)?,
                    idle_secs: r.get(1)?,
                    focus_secs: r.get(2)?,
                    distraction_secs: r.get(3)?,
                    first_seen: r.get(4)?,
                    last_seen: r.get(5)?,
                    ..Default::default()
                })
            },
        )
        .optional()?
        .unwrap_or_else(|| DaySummary { date: date.to_string(), ..Default::default() });
    s.date = date.to_string();
    Ok(s)
}

pub fn day_summary(conn: &Connection, date: &str) -> rusqlite::Result<DaySummary> {
    let mut s = day_totals(conn, date)?;

    let mut stmt = conn.prepare(
        "SELECT app, category, seconds FROM app_usage WHERE date = ?1 ORDER BY seconds DESC LIMIT 12",
    )?;
    s.apps = stmt
        .query_map(params![date], |r| {
            Ok(AppRow { app: r.get(0)?, category: r.get(1)?, seconds: r.get(2)? })
        })?
        .collect::<Result<_, _>>()?;

    // Sessions that overlap the given local day.
    let day = NaiveDate::parse_from_str(date, "%Y-%m-%d").unwrap_or_else(|_| Local::now().date_naive());
    let start = day
        .and_hms_opt(0, 0, 0)
        .unwrap()
        .and_local_timezone(Local)
        .earliest()
        .map(|d| d.timestamp())
        .unwrap_or(0);
    let end = start + 86_400;
    let mut stmt = conn.prepare(
        "SELECT id, start_ts, end_ts, last_seen_ts, end_reason FROM sessions
         WHERE start_ts < ?2 AND COALESCE(end_ts, last_seen_ts) >= ?1 ORDER BY start_ts",
    )?;
    s.sessions = stmt
        .query_map(params![start, end], |r| {
            Ok(SessionRow {
                id: r.get(0)?,
                start_ts: r.get(1)?,
                end_ts: r.get(2)?,
                last_seen_ts: r.get(3)?,
                end_reason: r.get(4)?,
            })
        })?
        .collect::<Result<_, _>>()?;
    Ok(s)
}

#[derive(Serialize)]
pub struct WeekDay {
    pub date: String,
    pub active_secs: i64,
    pub focus_secs: i64,
}

pub fn week(conn: &Connection) -> rusqlite::Result<Vec<WeekDay>> {
    let today = Local::now().date_naive();
    let mut out = Vec::with_capacity(7);
    for i in (0..7).rev() {
        let d = (today - chrono::Duration::days(i)).format("%Y-%m-%d").to_string();
        let t = day_totals(conn, &d)?;
        out.push(WeekDay { date: d, active_secs: t.active_secs, focus_secs: t.focus_secs });
    }
    Ok(out)
}

// ---------------------------------------------------------------- journal

#[derive(Serialize, Deserialize, Clone)]
pub struct JournalEntry {
    pub id: i64,
    pub date: String,
    pub ts: i64,
    pub kind: String,
    pub mood: Option<String>,
    pub text: String,
    pub done: bool,
}

pub fn add_journal(conn: &Connection, kind: &str, mood: Option<&str>, text: &str) -> rusqlite::Result<i64> {
    conn.execute(
        "INSERT INTO journal (date, ts, kind, mood, text) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![today(), now_ts(), kind, mood, text],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn list_journal(conn: &Connection, date: &str) -> rusqlite::Result<Vec<JournalEntry>> {
    let mut stmt = conn.prepare(
        "SELECT id, date, ts, kind, mood, text, done FROM journal WHERE date = ?1 ORDER BY ts DESC",
    )?;
    let rows = stmt
        .query_map(params![date], |r| {
            Ok(JournalEntry {
                id: r.get(0)?,
                date: r.get(1)?,
                ts: r.get(2)?,
                kind: r.get(3)?,
                mood: r.get(4)?,
                text: r.get(5)?,
                done: r.get::<_, i64>(6)? != 0,
            })
        })?
        .collect::<Result<_, _>>()?;
    Ok(rows)
}

pub fn toggle_task(conn: &Connection, id: i64) -> rusqlite::Result<()> {
    conn.execute("UPDATE journal SET done = 1 - done WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn delete_journal(conn: &Connection, id: i64) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM journal WHERE id = ?1", params![id])?;
    Ok(())
}

// ---------------------------------------------------------------- settings

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(default)]
pub struct Settings {
    pub profile: String,
    pub mascot_name: String,
    pub user_name: String,
    pub daily_goal_hours: Option<f64>,
    pub break_minutes: Option<u64>,
    pub notify_battery: bool,
    pub notify_breaks: bool,
    pub notify_worklog: bool,
    pub low_battery_percent: f32,
    pub onboarded: bool,
    pub show_widget: bool,
    pub widget_x: Option<i32>,
    pub widget_y: Option<i32>,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            profile: "developer".into(),
            mascot_name: "Koko".into(),
            user_name: String::new(),
            daily_goal_hours: None,
            break_minutes: None,
            notify_battery: true,
            notify_breaks: true,
            notify_worklog: true,
            low_battery_percent: 20.0,
            onboarded: false,
            show_widget: true,
            widget_x: None,
            widget_y: None,
        }
    }
}

pub fn load_settings(conn: &Connection) -> Settings {
    conn.query_row("SELECT value FROM settings WHERE key = 'app'", [], |r| r.get::<_, String>(0))
        .ok()
        .and_then(|v| serde_json::from_str(&v).ok())
        .unwrap_or_default()
}

pub fn save_settings(conn: &Connection, s: &Settings) -> rusqlite::Result<()> {
    let v = serde_json::to_string(s).unwrap_or_default();
    conn.execute(
        "INSERT INTO settings (key, value) VALUES ('app', ?1)
         ON CONFLICT(key) DO UPDATE SET value = ?1",
        params![v],
    )?;
    Ok(())
}
