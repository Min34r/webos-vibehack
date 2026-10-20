# webos-vibehack

An Apple TV-style home screen for LG TVs. It's a webOS port of the launcher from
[tv-vibehack](https://github.com/Gathin23/tv-vibehack), which does the same for Android TVs.

![The launcher running on an LG OLED C6](docs/screenshot.jpg)

Tested on an LG OLED C6 (OLED55C6XLA, webOS 26, firmware 43.21.79) and an LG OLED C4
(OLED48C44LA, webOS 24, firmware 43.21.73).

This fork of [OmkarK97/webos-vibehack](https://github.com/OmkarK97/webos-vibehack) adds:

- **Home without another device**: the Home watcher runs on the TV itself, as a service inside the
  launcher's package, and starts on its own after a reboot, even from a cold start.
- **No Developer Mode expiry**: the same service extends the Developer Mode session once a day.
- **Apps sync on the TV**: apps you install or remove show up in the launcher by themselves.
- **Sharp, smooth tiles**: vector logos instead of the TV's 130px icons, and 60 fps navigation.
- **Sounds**: soft interface sounds on the remote's keys.
- **An LG button**, a French interface and renamable tiles.

## What's different from Android

webOS is more locked down than Android TV, so three things work differently:

| | Android TV | LG webOS |
|---|---|---|
| Install | ADB, no account | LG's **Developer Mode** app (free LG developer account) |
| App list | read on the TV | webOS won't let an app list installed apps: `sync-apps.py` bundles them in, then the service keeps the list current |
| Home button | the launcher *is* Home | webOS always opens LG's home; a service on the TV switches straight back (0.1 to 0.2 s) |

There's no debloat step: webOS has no ADB-style package disabling. Turn off LG's ads in the TV's
own settings instead (see [Cleaning up LG's home](#cleaning-up-lgs-home)).

Nothing is rooted. Developer Mode is LG's official way to install your own apps, firmware updates
keep working, and deleting the Developer Mode app removes everything.

## Setup

You need a Mac on the same Wi-Fi as the TV, with Node.js (for LG's `ares` CLI) and Python 3. The
steps are macOS only for now: `install.sh` makes the app icon with `sips`. Install the CLI once with
`npm install -g @webos-tools/cli` (`npx` can misread the `-i` option of `ares-setup-device`).

**1. Developer Mode on the TV**

1. Create a free account at [webostv.developer.lge.com](https://webostv.developer.lge.com).
2. On the TV, install **Developer Mode** from the LG Content Store and sign in.
3. Turn on **Dev Mode Status** (the TV restarts), open the app again and turn on **Key Server**.
   Note the **IP address** and **Passphrase** it shows.

**2. Connect your computer** (once)

```bash
export TV_HOST=192.168.1.50                       # the IP from the Developer Mode app
ares-setup-device -a lgtv -i "{'host':'$TV_HOST','port':'9922','username':'prisoner'}"
ares-novacom --device lgtv --getkey        # type the passphrase
ares-setup-device -m lgtv -i "{'privatekey':'lgtv_webos','passphrase':'ABC123'}"
```

**3. Install**

```bash
git clone https://github.com/simrgt/webos-vibehack.git
cd webos-vibehack
python3 -m venv venv && venv/bin/pip install websockets
TV_HOST=192.168.1.50 ./install.sh
```

The first run shows an "allow this device?" prompt on the TV: accept it. That pairing lets
`sync-apps.py` read your apps and icons, and the Home service reuses it. `install.sh` then packages
the app and its service, installs it and opens it. Apps you install or remove later show up by
themselves (see [App list](#app-list)); run it again after changing `config.js`, or to give a new
app a vector logo.

**4. A one-press shortcut**

With the launcher open, hold a number key on the remote (say **1**) and assign it. From then on,
holding 1 opens the launcher from anywhere.

## The Home button

webOS hard-wires Home to LG's home, and blocks Developer Mode apps from seeing which app is in front.
The TV's own remote-control service (the one LG's phone app uses) can, though, and a Developer Mode
service may connect to it from inside the TV. [`service/`](service/) does that: it watches the
foreground app and, the moment LG's home appears, opens the launcher on top. LG's home shows for
0.1 to 0.2 s; holding the number key assigned to the launcher skips it altogether.

- **Press Home twice** within three seconds, or pick **LG** at the top of the launcher, to stay on
  LG's home, for its menus.
- **Power on**: from standby the service is still running. From a cold start (the TV unplugged), a
  persistent Activity Manager activity starts it again, and it opens the launcher over whatever the
  TV picked (an input, Live TV, LG's home), but not over an app that a remote button such as
  Netflix powered it on into.
- **Developer Mode session**: the service extends it once a day, as **Extend Session Time** does.
- When the service isn't running, Home simply opens LG's home as usual.

Its log is on the TV, readable over the Developer Mode SSH (port 9922, user `prisoner`):
`/media/developer/apps/usr/palm/services/com.gathin.tvhome.service/service.log`.

[`home-watch.py`](home-watch.py) is the same watcher for another always-on device on the network,
from before the service. On a Mac, `TV_HOST=192.168.1.50 ./home-watch-mac.sh` installs it as a
background service (`./home-watch-mac.sh uninstall` removes it).

## App list

The service also subscribes to the TV's app list, which pushes a change only when an app is
installed, removed or updated: nothing polls. The launcher opens at once with the list bundled by
`install.sh`, then asks the service, and rebuilds the grid only when the two differ (an unchanged
list costs nothing). Bundled logos and icons still win; the service fetches the TV's 130px icon
only for an app installed since, until `tools/make_logos.py` gives it a logo. Measured on a C4:
the service stays at about 25 MB and the launcher at about 45 MB, as before.

## Using it

Same as the [Android launcher](https://github.com/Gathin23/tv-vibehack#the-launcher): a dock of four apps with the focused app's name above it and a glow
in its colour, the rest of your apps in a grid below, and Inputs (HDMI ports and Live TV), Wi-Fi,
Settings and LG (LG's own home) at the top. The header slides away when the grid scrolls into it.

**Rearrange tiles on the TV**: hold **OK** on a tile until it wiggles, move it with the arrows
(into the top row puts it in the dock), then **OK** to place it or **Back** to cancel. The order is
saved on the TV.

**Configure** in [`app/config.js`](app/config.js): the starting dock, apps to hide, names to show
instead of the TV's (`titles`), the Live TV app, the number of columns and the sound volume
(`sounds`, 0 to turn them off). App ids come from `venv/bin/python sync-apps.py $TV_HOST --list`.
Changing `dockApps` resets an order arranged on the TV.

**Sounds**: arrows tick when focus moves and thud at an edge, OK and Back have their own, and so do
picking a tile up and putting it down. They are synthesised with
[spanda](https://github.com/rittikbasu/spanda)'s "lush" profile, so there are no audio files.

**Logos**: the TV only hands out 130px icons, blurry once scaled up to a tile. `sync-apps.py` uses
`app/logos/<app id>.svg` instead whenever it exists. [`tools/make_logos.py`](tools/make_logos.py)
builds those tiles from logos on Wikimedia Commons: add a line for a new app, run it, then
`./install.sh`.

**Resolution and speed**: the launcher draws at 1920x1080 and the TV scales it to the panel, as
LG's own home does. Tiles, the focus glass and the title are GPU layers (tiles drawn at their
focused size, so they stay sharp) and the colour glow is drawn at a quarter size, so moving around
redraws almost nothing. Behind another app the launcher stops its clock and closes its audio
context. Measured on a C4: 60 fps along the dock with no late frame, about 44 MB and under half a second
to open (tile colours are sampled on CPU canvases: GPU read-backs took ~30 ms a tile).
Setting `resolution` to `3840x2160` in `appinfo.json` makes `app.js` zoom the layout x2 for native
4K: sharper text, but 57-58 fps and about 77 MB.

## Cleaning up LG's home

For when you do land on it. Names vary a little by webOS version:

- **Settings → General → System → Additional Settings → Home Settings**: turn off **Home
  Promotion** and **Content Recommendation**.
- **Settings → Support → Privacy & Terms → User Agreements**: untick **Viewing Information** and
  **Interest-Based Recommendations**.

## Troubleshooting

- **Pairing fails with "403 Pairing rejected: blacklisted certificate detected".** Newer firmware
  rejects the signed manifest that open-source LG clients share. `lgtv.py` pairs with an unsigned
  one, which still works.
- **No pairing prompt on the TV.** Turn on the TV's option for connecting from mobile apps (on the
  C6: Settings → General → Devices → External Devices; named "LG Connect Apps" or similar).
- **`ares` says "All configured authentication methods failed".** The device profile is missing
  its key: run the third command in step 2 again.
- **Apps stop opening after a while.** Developer Mode sessions expire after about 1000 hours. The
  Home service extends it every day the TV is on; if the TV stayed off longer than that, open the
  Developer Mode app, sign in again and run `./install.sh`.
- **Home opens LG's home after a power cut.** Open the launcher once (the number-key shortcut): it
  starts the service again. The service log says why it stopped.

## Files

| File | What it does |
|---|---|
| [`app/`](app/) | The launcher: `index.html`, `style.css`, `app.js`, `config.js`, `appinfo.json` |
| [`app/logos/`](app/logos/) | Vector tiles that replace the TV's icons, built by `tools/make_logos.py` |
| [`app/vendor/spanda.js`](app/vendor/spanda.js) | spanda, the interface sound synthesiser (MIT) |
| [`service/`](service/) | Runs on the TV: the Home watcher, the app list and the Developer Mode keep-alive |
| [`tools/make_logos.py`](tools/make_logos.py) | Builds `app/logos/` from Wikimedia Commons |
| [`install.sh`](install.sh) | Syncs your apps, packages and installs the launcher, and opens it |
| [`sync-apps.py`](sync-apps.py) | Reads apps, icons and HDMI inputs from the TV into `app/apps.js` and `app/icons/` |
| [`home-watch.py`](home-watch.py) | The Home watcher, for another always-on device |
| [`home-watch-mac.sh`](home-watch-mac.sh) | Runs the watcher as a macOS background service |
| [`lgtv.py`](lgtv.py) | Pairs with and talks to the TV's remote-control service |
| [`assets/icon.jpg`](assets/icon.jpg) | The app icon, resized to PNG by `install.sh` |

## Credits

The design, layout and app icon come from [tv-vibehack](https://github.com/Gathin23/tv-vibehack)
by [Gathin](https://github.com/Gathin23). The Outfit font is under the SIL Open Font License
([`app/fonts/OFL.txt`](app/fonts/OFL.txt)). Interface sounds come from
[spanda](https://github.com/rittikbasu/spanda) (MIT, licence in
[`app/vendor/spanda.js`](app/vendor/spanda.js)). Glyphs are Material Icons (Apache 2.0). The app
logos in `app/logos/` are trademarks of their owners, taken from Wikimedia Commons, and only used to
label the apps installed on your own TV. MIT licensed, see [`LICENSE`](LICENSE).
