# WebOS Overlay Menu & App Hibernation

A clean, Apple TV-inspired custom menu for **rooted LG webOS TVs** that preserves and hibernates active applications instead of killing them.

---

## The Problem on a Stock TV
By default, webOS enforces a strict **1 full-screen "card" application limit**. When opening any custom launcher or menu, webOS's System Application Manager (SAM) immediately terminates (`closeApp`) the active app (YouTube, Netflix, Plex, games) to free RAM.

## The Solution
1. **Overlay Window Mode**: Configured with `"defaultWindowType": "overlay"` in `appinfo.json`. WebOS renders the menu on top without closing the active card application.
2. **Dynamic Ambient Glow**: OLED black background (`#000`) with real-time icon color sampling and smooth radial glow crossfades.
3. **Automated App Freezer (`SIGSTOP` / `SIGCONT`)**:
   * Opening the menu triggers a local root daemon (`autofreeze.js` on `127.0.0.1:1843`) that sends `SIGSTOP` to the active background app.
   * Background CPU drops to **0.0%**, audio mutes, and video holds its frame in RAM.
   * Closing the menu (via `Back`, `Esc`, or selecting an app) triggers `SIGCONT`, resuming playback instantly without reloading.
4. **Virtual Memory Expansion**: Automatically mounts a 512MB swap file (`/media/internal/swapfile`) at boot to prevent Low Memory Killer (LMK) eviction.
5. **Key Interception**: Intercepts the remote Menu / Home button via `org.webosbrew.inputhook`.

---

## Setup Guide for a New TV

### 1. Root & Prep the New TV
1. Root the TV using [RootMyTV](https://rootmy.tv) or [SlopBro](https://github.com/throwaway96/slopbro) (webOS 4–11).
2. Install the **Homebrew Channel** (`webosbrew`) and enable **SSH Server** and **Telnet** in its settings.
3. Verify SSH connection from your computer:
   ```bash
   ssh root@<NEW_TV_IP> "uname -a"
   ```

### 2. Sync App List & Icons
Run the sync script to pull all installed apps, inputs, and icon graphics from the new TV:
```bash
python3 sync-apps.py <NEW_TV_IP>
```

### 3. Build & Deploy Everything
Run the one-command deployment script:
```bash
./deploy-root-daemon.sh <NEW_TV_IP> install
```
This script will:
* Build the updated overlay `.ipk` package via `@webos-tools/cli`.
* Install the app on the TV via `luna://com.webos.appInstallService/dev/install`.
* Deploy and mount the 512MB swap helper to `/var/lib/webosbrew/init.d/80-enable-swap.sh`.
* Deploy and start the autofreeze daemon to `/var/lib/webosbrew/init.d/85-autofreeze.sh`.

### 4. Configure Remote Button Mapping
On the TV, install **Input Hook** (`org.webosbrew.inputhook`) via the Homebrew Channel, then configure your desired shortcut in `/home/root/.config/lginputhook/config.json`:
```json
{
  "125": { "action": "launch", "id": "com.gathin.tvhome" },
  "773": { "action": "launch", "id": "com.gathin.tvhome" }
}
```
*(Key `125` is the Home button; `773` is Guide / User menu).*

---

## Inspiration & Related Repositories (Ideas to Explore)

* **[`Gathin23/cleanyourtv`](https://github.com/Gathin23/cleanyourtv)** *(formerly `tv-vibehack`)*:
  > *"Strip the bloatware from any TV and replace the ad-filled home screen with a clean launcher that looks like an Apple TV."*
  * **Idea borrowed**: The sleek, minimalist Apple TV UI layout, focused tile scaling, and sound effects profile (`spanda`).
* **[`zzeppieri/webos-custom-home`](https://github.com/zzeppieri/webos-custom-home)**:
  > *"An ad-free, minimal custom home screen built for rooted LG webOS TVs with boot autostart and HOME-button takeover."*
  * **Ideas to explore**: Reading raw `/dev/input/event*` kernel structs directly for zero-delay key listening, and using non-destructive directory bind-mounts to block telemetry and ads.
* **[`rorygallagher2024/glasshouse`](https://github.com/rorygallagher2024/glasshouse)**:
  > *"A live local dashboard and control panel for rooted LG webOS TVs with deep system debloating and RAM optimization."*
  * **Ideas to explore**: Disabling unused background LG store scrapers and telemetry to free up an extra 200MB–400MB of physical RAM; built-in OLED panel care metrics.
* **[`rudra-avatar/Hearth`](https://github.com/rudra-avatar/Hearth)** *(formerly `webos-custom-launcher`)*:
  > *"A lightweight custom launcher for older, resource-constrained LG TVs."*
  * **Ideas to explore**: Mapping the custom launcher as an active TV Input Source rather than an app card for instant wake-on-boot without stock launcher flashes.

---

## Controls
* **Navigate**: D-Pad Arrow Keys
* **Select**: OK / Wheel Click
* **Reorder Tiles**: Long-press OK
* **Dismiss Menu**: `Back` (key 461) or `Esc` (key 27)

## Diagnostics & Status
```bash
# Check autofreeze logs
ssh root@<NEW_TV_IP> "cat /tmp/autofreeze.log"

# Check active swap memory
ssh root@<NEW_TV_IP> "swapon -s"

# Check daemon status
ssh root@<NEW_TV_IP> "/var/lib/webosbrew/init.d/85-autofreeze.sh status"
```
