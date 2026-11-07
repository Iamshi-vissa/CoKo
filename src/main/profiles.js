// The five CoKo types. Each one changes goals, break reminders, how apps
// are classified, the colour theme, journal prompts and what the mascot says.

export const PROFILES = [
  {
    id: 'student', name: 'Student', emoji: '📚',
    tagline: 'Study streaks, focus blocks and assignment check-ins',
    accent: '#ff7eb6', goalHours: 4, breakMinutes: 45, idleSeconds: 180,
    focus: ['notion', 'obsidian', 'word', 'docs', 'pdf', 'acrobat', 'onenote', 'anki', 'zotero', 'khan', 'coursera', 'classroom', 'moodle', 'canvas', 'quizlet'],
    distraction: ['youtube', 'netflix', 'instagram', 'tiktok', 'discord', 'steam', 'reddit'],
    prompts: ['What did you learn today?', 'Which topic still feels confusing?', "What's due this week?"],
    cheers: ['Study mode: ON! You\'ve got this!', 'Big brain time~', 'One more chapter? I believe in you!'],
  },
  {
    id: 'developer', name: 'Developer', emoji: '💻',
    tagline: 'Coding time, deep-work sessions and ship logs',
    accent: '#7aa2ff', goalHours: 6, breakMinutes: 60, idleSeconds: 300,
    focus: ['code', 'visual studio', 'intellij', 'idea', 'pycharm', 'webstorm', 'rustrover', 'cursor', 'zed', 'vim', 'nvim', 'emacs', 'terminal', 'iterm', 'warp', 'powershell', 'cmd.exe', 'konsole', 'alacritty', 'kitty', 'github', 'gitlab', 'postman', 'docker', 'stack overflow'],
    distraction: ['youtube', 'netflix', 'instagram', 'steam', 'reddit', 'twitter'],
    prompts: ['What did you ship today?', 'Any bug that fought back?', "What's next on the backlog?"],
    cheers: ['Compiling happiness... done!', 'Zero warnings, full vibes!', "You're in the flow, keep going!"],
  },
  {
    id: 'freelancer', name: 'Freelancer', emoji: '🎨',
    tagline: 'Billable hours, client work and earnings notes',
    accent: '#ffb547', goalHours: 5, breakMinutes: 50, idleSeconds: 240,
    focus: ['figma', 'photoshop', 'illustrator', 'premiere', 'after effects', 'davinci', 'blender', 'canva', 'code', 'word', 'excel', 'sheets', 'docs', 'upwork', 'fiverr'],
    distraction: ['youtube', 'netflix', 'instagram', 'tiktok', 'reddit', 'steam'],
    prompts: ['Which client did you work for today?', 'How many billable hours?', 'Any invoice to send?'],
    cheers: ['Clients are lucky to have you!', 'Cha-ching! Hours logged~', 'Boss mode activated!'],
  },
  {
    id: 'office', name: 'Office', emoji: '💼',
    tagline: 'Work hours, meetings and end-of-day reports',
    accent: '#4fd1a5', goalHours: 8, breakMinutes: 60, idleSeconds: 300,
    focus: ['outlook', 'teams', 'slack', 'zoom', 'meet', 'excel', 'word', 'powerpoint', 'sheets', 'docs', 'jira', 'confluence', 'sap', 'salesforce'],
    distraction: ['youtube', 'netflix', 'instagram', 'steam', 'reddit'],
    prompts: ['What did you finish today?', 'Any meeting follow-ups?', 'Top priority for tomorrow?'],
    cheers: ['Meeting survived! Great job!', 'Inbox hero~', 'Almost clock-out time, hang in there!'],
  },
  {
    id: 'personal', name: 'Personal', emoji: '🌸',
    tagline: 'Screen-time balance, habits and a gentle journal',
    accent: '#b48cff', goalHours: 3, breakMinutes: 40, idleSeconds: 180,
    focus: ['notion', 'obsidian', 'kindle', 'duolingo', 'calendar', 'notes'],
    distraction: ['youtube', 'netflix', 'instagram', 'tiktok', 'reddit', 'steam'],
    prompts: ['How are you feeling today?', "One thing you're grateful for?", 'Did you drink enough water?'],
    cheers: ["You're doing amazing~", 'Remember to stretch!', 'Yay, a cozy day together!'],
  },
];

export const getProfile = (id) => PROFILES.find((p) => p.id === id) || PROFILES[1];

export function classify(profile, app, title) {
  const hay = ` ${String(app).toLowerCase()} ${String(title).toLowerCase()} `;
  if (profile.distraction.some((k) => hay.includes(k))) return 'distraction';
  if (profile.focus.some((k) => hay.includes(k))) return 'focus';
  return 'neutral';
}
