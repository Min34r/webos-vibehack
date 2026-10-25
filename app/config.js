// Launcher configuration. Edit this file, then run ./install.sh.
// App ids: look in app/apps.js after a sync.
window.CONFIG = {
  // Apps pinned to the dock row, in this order. Missing apps are skipped.
  dockApps: ['youtube.leanback.v4', 'netflix', 'com.fpt.fptplay', 'twitch.adamffdev.v1'],

  // Apps never shown as tiles (inputs and Live TV are already in the Inputs menu).
  hiddenApps: [
    'com.gathin.tvhome',
    'com.webos.app.livetv',
    'com.webos.app.hdmi1', 'com.webos.app.hdmi2', 'com.webos.app.hdmi3', 'com.webos.app.hdmi4',
    'com.webos.app.externalinput.av1', 'com.webos.app.externalinput.component',
    'com.webos.app.lgchannels',
    'shortcutcopilot',
    'com.palmdts.devmode',
    'com.webos.app.storagemanager',
    'com.webos.app.sportsteamsettings',
    'com.webos.app.multiviewsettings',
    'com.webos.app.homeconnect',
    'com.webos.app.lglink-full'
  ],

  // Names shown instead of the TV's, for tiles and the Inputs menu: { appId: 'Name' }.
  titles: {},

  // The Live TV app, offered at the end of the Inputs menu. Leave empty to omit.
  liveTvApp: 'com.webos.app.livetv',

  // Tiles per row in the grid; the dock always has this many slots.
  columns: 4,

  // Interface sounds (remote keys only), from 0 (off) to 1.
  sounds: 0
};
