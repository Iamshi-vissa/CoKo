// Focused-window detection with no native modules, so nothing has to compile.
//   Windows: one long-lived PowerShell process that calls user32 and prints JSON
//   macOS:   `lsappinfo` (no extra permissions needed)
//   Linux:   `xprop` on X11 (Wayland exposes no other apps' windows)
import { spawn, execFile } from 'node:child_process';
import readline from 'node:readline';

const run = (cmd, args) => new Promise((resolve) => {
  execFile(cmd, args, { timeout: 1500, windowsHide: true }, (err, out) => resolve(err ? '' : String(out)));
});

// ---------------------------------------------------------------- Windows
const PS_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
Add-Type @"
using System; using System.Runtime.InteropServices; using System.Text;
public static class W {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint p);
}
"@
while ($true) {
  $line = [Console]::In.ReadLine(); if ($line -eq $null) { break }
  $h = [W]::GetForegroundWindow(); $sb = New-Object System.Text.StringBuilder 512
  [void][W]::GetWindowText($h, $sb, 512); $procId = 0; [void][W]::GetWindowThreadProcessId($h, [ref]$procId)
  $p = Get-Process -Id $procId
  $name = if ($p.MainModule.FileVersionInfo.FileDescription) { $p.MainModule.FileVersionInfo.FileDescription } else { $p.ProcessName }
  [Console]::Out.WriteLine((@{ app = $name; title = $sb.ToString() } | ConvertTo-Json -Compress))
}`;

let ps = null, waiters = [];
function winProc() {
  if (ps && !ps.killed) return ps;
  ps = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', PS_SCRIPT], { windowsHide: true });
  readline.createInterface({ input: ps.stdout }).on('line', (line) => {
    const w = waiters.shift();
    try { w?.(JSON.parse(line)); } catch { w?.(null); }
  });
  ps.on('exit', () => { ps = null; waiters.splice(0).forEach((w) => w(null)); });
  return ps;
}
function windowsActive() {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(null), 2500);
    waiters.push((v) => { clearTimeout(t); resolve(v); });
    try { winProc().stdin.write('\n'); } catch { resolve(null); }
  });
}

// ---------------------------------------------------------------- macOS
async function macActive() {
  const asn = (await run('lsappinfo', ['front'])).trim();
  if (!asn) return null;
  const info = await run('lsappinfo', ['info', '-only', 'name', asn]);
  const m = info.match(/"LSDisplayName"="([^"]*)"|"name"="([^"]*)"/i) || info.match(/=\s*"([^"]+)"/);
  return { app: m ? (m[1] || m[2] || m[0]) : 'Unknown', title: '' };
}

// ---------------------------------------------------------------- Linux (X11)
async function linuxActive() {
  if (process.env.WAYLAND_DISPLAY && !process.env.DISPLAY) return null;
  const root = await run('xprop', ['-root', '_NET_ACTIVE_WINDOW']);
  const id = root.match(/window id # (0x[0-9a-f]+)/i)?.[1];
  if (!id || id === '0x0') return null;
  const props = await run('xprop', ['-id', id, 'WM_CLASS', '_NET_WM_NAME', 'WM_NAME']);
  const cls = props.match(/WM_CLASS\(STRING\) = "([^"]*)", "([^"]*)"/);
  const title = props.match(/_NET_WM_NAME\(UTF8_STRING\) = "(.*)"/)?.[1] ?? props.match(/WM_NAME\(\w+\) = "(.*)"/)?.[1] ?? '';
  return { app: cls ? cls[2] || cls[1] : 'Unknown', title };
}

export async function getActiveWindow() {
  try {
    const w = process.platform === 'win32' ? await windowsActive()
      : process.platform === 'darwin' ? await macActive()
      : await linuxActive();
    return w && w.app ? { app: String(w.app).slice(0, 80), title: String(w.title || '').slice(0, 200) } : { app: 'Unknown', title: '' };
  } catch {
    return { app: 'Unknown', title: '' };
  }
}

export function stopActiveWindow() { try { ps?.kill(); } catch { /* already gone */ } }
