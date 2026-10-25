# WebOS Overlay Menu & App Switcher

A fast, Apple TV-inspired custom menu and app switcher for **LG webOS TVs** that preserves running applications (YouTube, Netflix, Plex, HDMI inputs) instead of killing them. Works on both **rooted** and **unrooted** TVs.

---

## The Problem on a Stock TV
By default, webOS enforces a strict **1 full-screen "card" application limit**. When opening any custom launcher or menu, webOS's System Application Manager (SAM) immediately terminates (`closeApp`) the active card app to free RAM.

## The Solution
1. **Overlay Window Mode**: Configured with `"defaultWindowType": "overlay"` and `"transparent": true` in `appinfo.json`. WebOS renders the menu on top of active card applications without closing them.
2. **Zero-Polling Auto-Translation (`app/i18n.js`)**:
   * Reads UI locale with **zero CPU/network overhead** and **zero polling**.
   * Instant sub-millisecond RAM check via `localStorage` cache and `navigator.language` (set automatically by webOS WebAppMgr with `--lang=<code`).
   * One single one-shot query to `luna://com.webos.settingsservice/getSystemSettings` on initial boot.
   * Modular translation dictionary in `app/i18n.js` (`en`, `vi`, `es`, `fr`, `de`, `ja`, `zh`, `ko`).
3. **OLED Black UI & Dynamic Ambient Glow**: True OLED black background (`#000`) with real-time icon color sampling and smooth radial glow crossfades.
4. **Quick Dismissal**: Pressing `Back` (key 461) or `Esc` (key 27) closes the overlay and immediately restores focus to the running background app.
5. **Virtual Memory Expansion (Rooted)**: Automatically mounts a 512MB swap file (`/media/internal/swapfile`) at boot to prevent Low Memory Killer (LMK) eviction.

---

## Setup: Route A — Non-Rooted TV (Developer Mode)

No root or jailbreak required!

### 1. Enable Developer Mode on TV
1. Install the **Developer Mode** app from the LG Content Store.
2. Log in with your free LG Developer account and toggle **Dev Mode Status** to `ON`.
3. Note the TV IP address and passphrase displayed in the app.

### 2. Build & Install
From your computer:
```bash
# 1. Sync app tiles and icons from the TV
python3 sync-apps.py <TV_IP>

# 2. Package the overlay app
npx -y -p @webos-tools/cli ares-package app -o build

# 3. Setup device target and install
npx -y -p @webos-tools/cli ares-setup-device -a lgtv -i "{'host':'<TV_IP>','port':'9922','username':'prisoner'}"
npx -y -p @webos-tools/cli ares-install -d lgtv build/com.gathin.tvhome_*.ipk
```

### 3. Set Quick Access Remote Shortcut
1. Launch the app once from the TV app list.
2. While the overlay is open, **press and hold any number key (1–9)** on your LG Magic Remote to bind it to Quick Access (e.g., hold `1`).
3. Now, whenever you are watching YouTube, Netflix, or HDMI, hold `1` to pop up the menu overlay without stopping playback. Press `Back` to dismiss.

---

## Setup: Route B — Rooted TV (webosbrew)

For TVs rooted via [RootMyTV](https://rootmy.tv) or [SlopBro](https://github.com/throwaway96/slopbro).

### 1. Build & Deploy Everything
Run the one-command deployment script:
```bash
# Sync installed apps & icons
python3 sync-apps.py <TV_IP>

# Build, install IPK, and enable 512MB swap
./deploy-root-daemon.sh <TV_IP> install
```

### 2. Remote Button Remapping (Input Hook)
Install **Input Hook** (`org.webosbrew.inputhook`) via the Homebrew Channel, then configure `/home/root/.config/lginputhook/config.json`:
```json
{
  "125": { "action": "launch", "id": "com.gathin.tvhome" },
  "773": { "action": "launch", "id": "com.gathin.tvhome" }
}
```
*(Key `125` is the Home button; `773` is Guide / User menu).*

---

## Controls
* **Navigate**: D-Pad Arrow Keys
* **Select / Launch**: OK / Wheel Click
* **Reorder Tiles**: Long-press OK
* **Dismiss Overlay**: `Back` (key 461) or `Esc` (key 27)

---

## Inspiration & Related Repositories (Ideas to Explore)

* **[`Gathin23/cleanyourtv`](https://github.com/Gathin23/cleanyourtv)** *(formerly `tv-vibehack`)*:
  > *"Strip the bloatware from any TV and replace the ad-filled home screen with a clean launcher that looks like an Apple TV."*
  * **Ideas borrowed**: Apple TV UI aesthetics, layout, tile focus animations, and procedural sound synthesizer (`spanda`).
* **[`zzeppieri/webos-custom-home`](https://github.com/zzeppieri/webos-custom-home)**:
  > *"An ad-free, minimal custom home screen built for rooted LG webOS TVs with boot autostart and HOME-button takeover."*
  * **Ideas to explore**: Reading raw `/dev/input/event*` kernel structs directly for zero-delay key listening, and non-destructive directory bind-mounts to block telemetry and ads.
* **[`rorygallagher2024/glasshouse`](https://github.com/rorygallagher2024/glasshouse)**:
  > *"A live local dashboard and control panel for rooted LG webOS TVs with deep system debloating and RAM optimization."*
  * **Ideas to explore**: Disabling unused background LG store scrapers and telemetry to free up 200MB–400MB of physical RAM; built-in OLED panel care metrics.
* **[`rudra-avatar/Hearth`](https://github.com/rudra-avatar/Hearth)** *(formerly `webos-custom-launcher`)*:
  > *"A lightweight custom launcher for older, resource-constrained LG TVs."*
  * **Ideas to explore**: Mapping the custom launcher as an active TV Input Source rather than an app card for instant wake-on-boot without stock launcher flashes.
