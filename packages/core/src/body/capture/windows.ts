/**
 * Window & Display Enumeration Driver
 *
 * Platform-dispatched via subprocess:
 *   Linux:   wmctrl -lG (windows), xrandr (displays)
 *   macOS:   osascript AppleScript (windows), system_profiler SPDisplaysDataType (displays)
 *   Windows: PowerShell Get-Process (windows), Get-CimInstance Win32_DesktopMonitor (displays)
 *
 * Returns WindowInfo[] and DisplayInfo[] matching types from body/types.ts.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { WindowInfo, DisplayInfo } from '../types.js';

const execFileAsync = promisify(execFile);

const EXEC_TIMEOUT_MS = 8_000;

// ── Linux ────────────────────────────────────────────────────────────────────

async function listWindowsLinux(): Promise<WindowInfo[]> {
  try {
    const { stdout } = await execFileAsync('wmctrl', ['-lG'], { timeout: EXEC_TIMEOUT_MS });
    const windows: WindowInfo[] = [];
    for (const line of stdout.split('\n')) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 8) continue;
      const [id, , x, y, width, height, , ...titleParts] = parts;
      windows.push({
        id: id ?? '',
        title: titleParts.join(' '),
        appName: titleParts.join(' '),
        bounds: {
          x: parseInt(x ?? '0', 10),
          y: parseInt(y ?? '0', 10),
          width: parseInt(width ?? '0', 10),
          height: parseInt(height ?? '0', 10),
        },
        isVisible: true,
        isSystemWindow: false,
      });
    }
    return windows;
  } catch {
    return [];
  }
}

async function listDisplaysLinux(): Promise<DisplayInfo[]> {
  try {
    const { stdout } = await execFileAsync('xrandr', ['--query'], { timeout: EXEC_TIMEOUT_MS });
    const displays: DisplayInfo[] = [];
    let index = 0;
    for (const line of stdout.split('\n')) {
      // Match lines like: eDP-1 connected primary 1920x1080+0+0
      const match = /^(\S+)\s+connected.*?(\d+x\d+\+\d+\+\d+)/.exec(line);
      if (match) {
        const name = match[1] ?? `Display ${index}`;
        const geom = match[2] ?? '0x0+0+0';
        const [wh, x, y] = geom.split('+');
        const [w, h] = (wh ?? '0x0').split('x');
        const _primary = line.includes('primary');
        displays.push({
          id: String(index),
          name,
          bounds: {
            x: parseInt(x ?? '0', 10),
            y: parseInt(y ?? '0', 10),
            width: parseInt(w ?? '0', 10),
            height: parseInt(h ?? '0', 10),
          },
          scaleFactor: 1,
          isPrimary: line.includes('primary'),
        });
        index++;
      }
    }
    return displays;
  } catch {
    return [];
  }
}

// ── macOS ────────────────────────────────────────────────────────────────────

async function listWindowsMacOS(): Promise<WindowInfo[]> {
  const script = `
    set output to ""
    tell application "System Events"
      set appList to every application process whose visible is true
      repeat with proc in appList
        set appName to name of proc
        try
          set wins to every window of proc
          repeat with win in wins
            set winTitle to name of win
            set winPos to position of win
            set winSz to size of win
            set wx to item 1 of winPos
            set wy to item 2 of winPos
            set ww to item 1 of winSz
            set wh to item 2 of winSz
            set output to output & appName & "|" & winTitle & "|" & wx & "|" & wy & "|" & ww & "|" & wh & "\n"
          end repeat
        end try
      end repeat
    end tell
    return output
  `;
  try {
    const { stdout } = await execFileAsync('osascript', ['-e', script], {
      timeout: EXEC_TIMEOUT_MS,
    });
    const windows: WindowInfo[] = [];
    let idx = 0;
    for (const line of stdout.split('\n')) {
      const parts = line.trim().split('|');
      if (parts.length < 6) continue;
      const [app, title, x, y, w, h] = parts;
      windows.push({
        id: String(idx++),
        title: title ?? '',
        appName: app ?? '',
        bounds: {
          x: parseInt(x ?? '0', 10),
          y: parseInt(y ?? '0', 10),
          width: parseInt(w ?? '0', 10),
          height: parseInt(h ?? '0', 10),
        },
        isVisible: true,
        isSystemWindow: false,
      });
    }
    return windows;
  } catch {
    return [];
  }
}

async function listDisplaysMacOS(): Promise<DisplayInfo[]> {
  try {
    const { stdout } = await execFileAsync('system_profiler', ['SPDisplaysDataType', '-json'], {
      timeout: EXEC_TIMEOUT_MS,
    });
    const data = JSON.parse(stdout) as {
      SPDisplaysDataType?: {
        spdisplays_ndrvs?: { _name: string; spdisplays_resolution?: string }[];
      }[];
    };
    const displays: DisplayInfo[] = [];
    let idx = 0;
    for (const gpuEntry of data.SPDisplaysDataType ?? []) {
      for (const display of gpuEntry.spdisplays_ndrvs ?? []) {
        displays.push({
          id: String(idx),
          name: display._name,
          bounds: { x: 0, y: 0, width: 0, height: 0 },
          scaleFactor: 1,
          isPrimary: idx === 0,
        });
        idx++;
      }
    }
    return displays;
  } catch {
    return [];
  }
}

// ── Windows ──────────────────────────────────────────────────────────────────

async function listWindowsWin(): Promise<WindowInfo[]> {
  const script = `
    Add-Type -AssemblyName System.Windows.Forms
    $procs = Get-Process | Where-Object { $_.MainWindowTitle -ne '' } | Select-Object Id, MainWindowTitle
    foreach ($p in $procs) {
      $hwnd = $p.MainWindowHandle
      $rect = New-Object System.Drawing.Rectangle
      Write-Output "$($p.Id)|$($p.MainWindowTitle)|0|0|800|600"
    }
  `;
  try {
    const { stdout } = await execFileAsync('powershell', ['-NonInteractive', '-Command', script], {
      timeout: EXEC_TIMEOUT_MS,
    });
    const windows: WindowInfo[] = [];
    for (const line of stdout.split('\n')) {
      const parts = line.trim().split('|');
      if (parts.length < 6) continue;
      const [id, title, x, y, w, h] = parts;
      windows.push({
        id: id ?? '',
        title: title ?? '',
        appName: title ?? '',
        bounds: {
          x: parseInt(x ?? '0', 10),
          y: parseInt(y ?? '0', 10),
          width: parseInt(w ?? '0', 10),
          height: parseInt(h ?? '0', 10),
        },
        isVisible: true,
        isSystemWindow: false,
      });
    }
    return windows;
  } catch {
    return [];
  }
}

async function listDisplaysWin(): Promise<DisplayInfo[]> {
  const script = `
    $monitors = Get-CimInstance -ClassName Win32_DesktopMonitor
    foreach ($m in $monitors) {
      Write-Output "$($m.DeviceID)|$($m.Name)|$($m.ScreenWidth)|$($m.ScreenHeight)"
    }
  `;
  try {
    const { stdout } = await execFileAsync('powershell', ['-NonInteractive', '-Command', script], {
      timeout: EXEC_TIMEOUT_MS,
    });
    const displays: DisplayInfo[] = [];
    let idx = 0;
    for (const line of stdout.split('\n')) {
      const parts = line.trim().split('|');
      if (parts.length < 4) continue;
      const [id, name, w, h] = parts;
      displays.push({
        id: id ?? String(idx),
        name: name ?? `Monitor ${idx}`,
        bounds: { x: 0, y: 0, width: parseInt(w ?? '0', 10), height: parseInt(h ?? '0', 10) },
        scaleFactor: 1,
        isPrimary: idx === 0,
      });
      idx++;
    }
    return displays;
  } catch {
    return [];
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

export async function listWindows(): Promise<WindowInfo[]> {
  switch (process.platform) {
    case 'darwin':
      return listWindowsMacOS();
    case 'win32':
      return listWindowsWin();
    default:
      return listWindowsLinux();
  }
}

export async function listDisplays(): Promise<DisplayInfo[]> {
  switch (process.platform) {
    case 'darwin':
      return listDisplaysMacOS();
    case 'win32':
      return listDisplaysWin();
    default:
      return listDisplaysLinux();
  }
}
