# Native Clients Guide

SecureYeoman ships two native client shells that wrap the compiled dashboard SPA:

- **Desktop** — Tauri v2 (macOS, Windows, Linux) — `packages/desktop/`
- **Mobile** — Capacitor v6 (iOS, Android) — `packages/mobile/`

Neither shell contains application logic. Both load `packages/dashboard/dist` as their web
content. Build the dashboard first before working with either native client.

---

## Prerequisites

### Desktop (Tauri)

| Requirement | Version | Install |
|-------------|---------|---------|
| Rust toolchain | stable | `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh` |
| Tauri CLI | ^2 | installed via `npm install` in `packages/desktop` |
| **macOS only** | Xcode Command Line Tools | `xcode-select --install` |
| **Windows only** | WebView2 Runtime | included in Windows 11; [download for Win 10](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) |
| **Linux only** | WebKitGTK | `sudo apt install libwebkit2gtk-4.1-dev libssl-dev` (Debian/Ubuntu) |

### Mobile (Capacitor)

| Requirement | Platform | Notes |
|-------------|----------|-------|
| Node 20+ | both | already required by SecureYeoman |
| Xcode 15+ | iOS | Mac only; requires Apple Developer account for device builds |
| Android Studio Hedgehog+ | Android | any OS |
| CocoaPods | iOS | `sudo gem install cocoapods` |

---

## Desktop Setup

### 1. Install desktop dependencies

```bash
cd packages/desktop
npm install
```

### 2. Provide app icons (required for production builds)

See `packages/desktop/src-tauri/icons/README.md` for the full list. Tauri CLI can generate
all sizes from a single 512×512 PNG:

```bash
npx @tauri-apps/cli icon path/to/icon-512.png
```

### 3. Run in development mode

The Vite dev server must be running on port 3000:

```bash
# Terminal 1 — dashboard dev server
npm run dev:dashboard

# Terminal 2 — Tauri shell (hot-reload)
npm run dev:desktop
```

Or use the root shortcut:

```bash
npm run dev:desktop   # starts tauri dev (dashboard must already be running)
```

### 4. Production build

```bash
npm run build:dashboard   # compile dashboard SPA into packages/dashboard/dist
npm run build:desktop     # tauri build → packages/desktop/src-tauri/target/release/bundle/
```

Output bundles:
- macOS: `.dmg` + `.app`
- Windows: `.msi` + `.exe` (NSIS)
- Linux: `.deb` + `.AppImage`

### Configuration

Edit `packages/desktop/src-tauri/tauri.conf.json` to:
- Change the window title or default size
- Enable/disable the system tray icon
- Add Tauri IPC commands (register in `main.rs` and declare in `allowlist`)

---

## Mobile Setup

### 1. Install mobile dependencies

```bash
cd packages/mobile
npm install
```

### 2. Add native platforms (one-time per checkout)

```bash
npm run add:ios      # generates packages/mobile/ios/
npm run add:android  # generates packages/mobile/android/
```

> The generated `ios/` and `android/` directories are excluded from git. Re-run this step on a
> fresh checkout.

### 3. Build the dashboard and sync

After every dashboard change:

```bash
npm run build:dashboard   # from repo root
cd packages/mobile
npm run sync              # npx cap sync — copies dist into ios/ and android/
```

### 4. Open in native IDE

```bash
npm run open:ios       # opens Xcode
npm run open:android   # opens Android Studio
```

Build and run from the native IDE as usual.

### Live-Reload Development

Point Capacitor at your local Vite dev server for instant hot-reload on device:

1. Start the dashboard dev server: `npm run dev:dashboard`
2. Find your machine's LAN IP: `ipconfig getifaddr en0` (macOS) or `ip route get 1 | awk '{print $7}'` (Linux)
3. Edit `packages/mobile/capacitor.config.ts`:

```typescript
server: {
  url: 'http://192.168.1.42:3000',  // replace with your IP
  cleartext: true,
},
```

4. `npm run sync` then open in Xcode / Android Studio and run on device/simulator.

> Revert `capacitor.config.ts` before a production build — leave `server.url` commented out.

### Adding Native Plugins

Install Capacitor plugins as needed:

```bash
npm install @capacitor/push-notifications @capacitor/biometric-auth
npm run sync
```

See the [Capacitor plugins registry](https://capacitorjs.com/docs/plugins) for the full list.

---

## Project Structure

```
packages/
  desktop/
    package.json              ← npm scripts (dev, build, tauri)
    .gitignore
    src-tauri/
      tauri.conf.json         ← window config, bundle targets, tray icon
      Cargo.toml              ← Rust dependencies (tauri, tauri-plugin-shell)
      build.rs                ← tauri_build::build()
      src/
        main.rs               ← tauri::Builder entry point + compile tests
      icons/
        README.md             ← icon requirements and generation instructions
  mobile/
    package.json              ← npm scripts (sync, open:ios, open:android, add:*)
    capacitor.config.ts       ← appId, appName, webDir, optional server.url
    capacitor.config.test.ts  ← Vitest assertions on config values
    .gitignore
    ios/                      ← generated by `npx cap add ios`   (not in git)
    android/                  ← generated by `npx cap add android` (not in git)
```

---

## Verification

```bash
# Mobile config test (Vitest)
npx vitest run packages/mobile/capacitor.config.test.ts

# Desktop Rust compile check (requires Rust)
cd packages/desktop && cargo check
```

---

## Troubleshooting

### `tauri build` fails with "icon not found"

Place the required icon files in `packages/desktop/src-tauri/icons/` — see the README there.
Use `npx @tauri-apps/cli icon` to generate all sizes from a source PNG.

### `cap sync` fails with "webDir does not exist"

Build the dashboard first: `npm run build:dashboard` from the repo root.

### iOS build fails with "CocoaPods not found"

```bash
sudo gem install cocoapods
cd packages/mobile/ios/App && pod install
```

### WebKitGTK not found (Linux)

```bash
sudo apt install libwebkit2gtk-4.1-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
```

---

## See Also

- [ADR 167 — Native Clients](../adr/167-native-clients.md)
- [Tauri v2 Documentation](https://tauri.app/start/)
- [Capacitor v6 Documentation](https://capacitorjs.com/docs)
- [Dashboard Performance Guide](./dashboard-performance.md)
