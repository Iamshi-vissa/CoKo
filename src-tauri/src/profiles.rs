//! The five CoKo personality / tracking profiles.
//! Each profile changes goals, break reminders, how apps are categorised,
//! the accent colour and what the mascot says.

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct Profile {
    pub id: &'static str,
    pub name: &'static str,
    pub tagline: &'static str,
    pub accent: &'static str,
    /// Default daily active-time goal in hours.
    pub daily_goal_hours: f64,
    /// Remind to take a break after this many minutes of continuous activity.
    pub break_minutes: u64,
    /// Seconds without input before the user is considered "away".
    pub idle_seconds: u64,
    /// Lower-case keywords; an app/window matching any of them counts as "focus" time.
    pub focus_keywords: &'static [&'static str],
    /// Keywords that count as "distraction" time.
    pub distraction_keywords: &'static [&'static str],
    pub journal_prompts: &'static [&'static str],
    pub cheers: &'static [&'static str],
}

pub const PROFILES: &[Profile] = &[
    Profile {
        id: "student",
        name: "Student",
        tagline: "Study streaks, focus blocks and assignment check-ins",
        accent: "#ff7eb6",
        daily_goal_hours: 4.0,
        break_minutes: 45,
        idle_seconds: 180,
        focus_keywords: &["notion", "obsidian", "word", "docs", "pdf", "acrobat", "onenote", "anki", "zotero", "khan", "coursera", "classroom", "moodle", "canvas"],
        distraction_keywords: &["youtube", "netflix", "instagram", "tiktok", "discord", "steam", "reddit"],
        journal_prompts: &["What did you learn today?", "Which topic still feels confusing?", "What's due this week?"],
        cheers: &["Study mode: ON! You've got this!", "Big brain time~", "One more chapter? I believe in you!"],
    },
    Profile {
        id: "developer",
        name: "Developer",
        tagline: "Coding time, deep-work sessions and commit-day logs",
        accent: "#7aa2ff",
        daily_goal_hours: 6.0,
        break_minutes: 60,
        idle_seconds: 300,
        focus_keywords: &["code", "visual studio", "intellij", "idea", "pycharm", "webstorm", "rustrover", "vim", "nvim", "emacs", "terminal", "iterm", "warp", "powershell", "konsole", "alacritty", "kitty", "github", "gitlab", "postman", "docker"],
        distraction_keywords: &["youtube", "netflix", "twitter", " x ", "instagram", "steam", "reddit"],
        journal_prompts: &["What did you ship today?", "Any bug that fought back?", "What's next on the backlog?"],
        cheers: &["Compiling happiness... done!", "Zero warnings, full vibes!", "You're in the flow — keep going!"],
    },
    Profile {
        id: "freelancer",
        name: "Freelancer",
        tagline: "Billable hours, client work and daily earnings notes",
        accent: "#ffb547",
        daily_goal_hours: 5.0,
        break_minutes: 50,
        idle_seconds: 240,
        focus_keywords: &["figma", "photoshop", "illustrator", "premiere", "after effects", "davinci", "blender", "code", "word", "excel", "sheets", "docs", "upwork", "fiverr"],
        distraction_keywords: &["youtube", "netflix", "instagram", "tiktok", "reddit", "steam"],
        journal_prompts: &["Which client did you work for today?", "How many billable hours?", "Any invoice to send?"],
        cheers: &["Clients are lucky to have you!", "Cha-ching! Hours logged~", "Boss mode activated!"],
    },
    Profile {
        id: "office",
        name: "Office",
        tagline: "Work hours, meetings and end-of-day reports",
        accent: "#4fd1a5",
        daily_goal_hours: 8.0,
        break_minutes: 60,
        idle_seconds: 300,
        focus_keywords: &["outlook", "teams", "slack", "zoom", "meet", "excel", "word", "powerpoint", "sheets", "docs", "jira", "confluence", "sap", "salesforce"],
        distraction_keywords: &["youtube", "netflix", "instagram", "steam", "reddit"],
        journal_prompts: &["What did you finish today?", "Any meeting follow-ups?", "Top priority for tomorrow?"],
        cheers: &["Meeting survived! Great job!", "Inbox hero~", "Almost clock-out time, hang in there!"],
    },
    Profile {
        id: "personal",
        name: "Personal",
        tagline: "Screen-time balance, habits and a gentle daily journal",
        accent: "#b48cff",
        daily_goal_hours: 3.0,
        break_minutes: 40,
        idle_seconds: 180,
        focus_keywords: &["notion", "obsidian", "kindle", "duolingo", "spotify", "calendar", "notes"],
        distraction_keywords: &["youtube", "netflix", "instagram", "tiktok", "reddit", "steam"],
        journal_prompts: &["How are you feeling today?", "One thing you're grateful for?", "Did you drink enough water?"],
        cheers: &["You're doing amazing, sweetie~", "Remember to stretch!", "Yay, a cozy day together!"],
    },
];

pub fn get(id: &str) -> &'static Profile {
    PROFILES.iter().find(|p| p.id == id).unwrap_or(&PROFILES[1])
}

/// Classify an app into focus / distraction / neutral for the given profile.
pub fn classify(profile: &Profile, app: &str, title: &str) -> &'static str {
    let hay = format!(" {} {} ", app.to_lowercase(), title.to_lowercase());
    if profile.distraction_keywords.iter().any(|k| hay.contains(k)) {
        "distraction"
    } else if profile.focus_keywords.iter().any(|k| hay.contains(k)) {
        "focus"
    } else {
        "neutral"
    }
}
