// Launcher configuration. Edit this file, then run webos-launcher/install.sh.
// App ids: run `python3 sync-apps.py --list` (or look in app/apps.js after a sync).
window.CONFIG = {
  // Apps pinned to the dock row at the bottom, in this order. Missing apps are skipped.
  dockApps: ['netflix', 'canalplus', 'amazon', 'youtube.leanback.v4'],

  // Apps never shown as tiles (inputs and Live TV are already in the Inputs menu).
  hiddenApps: [
    'com.gathin.tvhome',
    'com.webos.app.livetv',
    'com.webos.app.hdmi1', 'com.webos.app.hdmi4',   // HDMI 2 (PC) and 3 (Switch) stay as tiles
    'com.webos.app.lgchannels',   // LG Channels
    'shortcutcopilot',            // Copilot
    'com.palmdts.devmode',
    'com.webos.app.storagemanager',
    'com.webos.app.sportsteamsettings',
    'com.webos.app.multiviewsettings',
    'com.webos.app.homeconnect',
    'com.webos.app.lglink-full'
  ],

  // Names shown instead of the TV's, for tiles and the Inputs menu: { appId: 'Name' }.
  titles: {
    'com.webos.app.hdmi2': 'Bazzite',
    'com.webos.app.hdmi3': 'Switch 2'
  },

  // Weather above the dock, from Open-Meteo (free, no account; only the place's coordinates are
  // sent). A city name, or {lat: 48.85, lon: 2.35, city: 'Paris'}. null to hide it.
  weather: { city: 'Draveil' },

  // The Live TV app, offered at the end of the Inputs menu. Leave empty to omit.
  liveTvApp: 'com.webos.app.livetv',

  // Tiles per row in the grid; the dock always has this many slots.
  columns: 4,

  // Interface sounds (remote keys only), from 0 (off) to 1.
  sounds: 0.5,

  // Their character: 'glass' (light and clear, the default), or spanda's 'tactile', 'crisp' or
  // 'lush' (low and round).
  soundStyle: 'glass',

  // The focused icon tips the way focus came from, with a sweeping highlight. false to turn off.
  tilt: true,

  // Let the backdrop's colours drift very slowly. Off by default: on a C4 the endless animation
  // costs ~35% of a CPU core even when nothing else moves, and a few late frames when navigating.
  drift: false
};
