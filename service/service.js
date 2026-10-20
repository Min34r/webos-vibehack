// home-watch.py, running on the TV itself: watches the foreground app over the TV's own
// remote-control service (ws://127.0.0.1:3000) and opens the launcher when LG's home appears.
// The launcher starts it at launch; the keepAlive activity stops webOS from closing it when idle.
// Press Home twice within ESCAPE_MS to stay on LG's home.
// It also extends the Developer Mode session once a day, as the app's "Extend Session Time" does.
var net = require('net');
var https = require('https');
var fs = require('fs');
var crypto = require('crypto');
var os = require('os');

var LAUNCHER = 'com.gathin.tvhome';
var LG_HOME = 'com.webos.app.home';
var ESCAPE_MS = 3000;
var BOOT_S = 180;   // started this soon after a cold boot: open the launcher over what the TV opened on...
// ...but only over what the TV picks by itself (an input, Live TV, nothing yet): not over an app the
// remote's Netflix or Prime Video button powered the TV on into.
var BOOT_TAKEOVER = /^(|com\.webos\.app\.(hdmi\d+|livetv|home))$/;
// The same list as lgtv.py, so the key paired from the computer is accepted without a new prompt.
var PERMISSIONS = [
  'LAUNCH', 'LAUNCH_WEBAPP', 'APP_TO_APP', 'CLOSE', 'TEST_OPEN', 'TEST_PROTECTED', 'CONTROL_AUDIO',
  'CONTROL_DISPLAY', 'CONTROL_INPUT_JOYSTICK', 'CONTROL_INPUT_MEDIA_RECORDING',
  'CONTROL_INPUT_MEDIA_PLAYBACK', 'CONTROL_INPUT_TV', 'CONTROL_POWER', 'CONTROL_TV_SCREEN',
  'READ_APP_STATUS', 'READ_CURRENT_CHANNEL', 'READ_INPUT_DEVICE_LIST', 'READ_NETWORK_STATE',
  'READ_RUNNING_APPS', 'READ_TV_CHANNEL_LIST', 'WRITE_NOTIFICATION_TOAST', 'READ_POWER_STATE',
  'READ_COUNTRY_INFO', 'CONTROL_INPUT_TEXT', 'CONTROL_MOUSE_AND_KEYBOARD', 'READ_INSTALLED_APPS',
  'READ_SETTINGS', 'READ_STORAGE_DEVICE_LIST'
];

var clientKey = null;
try { clientKey = require('./key.json').key; } catch (e) { /* not bundled: pair with a prompt */ }

// The service's console goes nowhere a developer can read: keep a short log next to it, readable over
// the Developer Mode SSH (/media/developer/apps/usr/palm/services/com.gathin.tvhome.service/service.log).
var LOG_FILE = __dirname + '/service.log';
var log = function () {
  var line = new Date().toISOString() + ' ' + [].slice.call(arguments).join(' ');
  console.log('[home-watch]', line);
  try {
    if (fs.existsSync(LOG_FILE) && fs.statSync(LOG_FILE).size > 64 * 1024) fs.renameSync(LOG_FILE, LOG_FILE + '.1');
    fs.appendFileSync(LOG_FILE, line + '\n');
  } catch (e) { /* not writable here: console only */ }
};

/** A minimal WebSocket client: text frames only, enough for the TV's JSON messages. */
function connect(onOpen, onMessage, onClose) {
  var sock = net.connect(3000, '127.0.0.1');
  var buf = Buffer.alloc(0), open = false, closed = false;
  var key = crypto.randomBytes(16).toString('base64');

  function close() {
    if (closed) return;
    closed = true;
    sock.destroy();
    onClose();
  }

  // The TV closes loopback connections that send no Origin ("invalid origin").
  sock.on('connect', function () {
    sock.write('GET / HTTP/1.1\r\nHost: 127.0.0.1:3000\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
      'Origin: http://127.0.0.1\r\nSec-WebSocket-Key: ' + key + '\r\nSec-WebSocket-Version: 13\r\n\r\n');
  });
  sock.on('data', function (chunk) {
    buf = Buffer.concat([buf, chunk]);
    if (!open) {
      var end = buf.indexOf('\r\n\r\n');
      if (end < 0) return;
      if (!/^HTTP\/1\.1 101/.test(buf.toString('latin1', 0, end))) return close();
      buf = buf.subarray(end + 4);
      open = true;
      onOpen();
    }
    while (buf.length >= 2) {
      var op = buf[0] & 0x0f, len = buf[1] & 0x7f, at = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); at = 4; }
      else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); at = 10; }
      if (buf.length < at + len) return;
      var payload = buf.subarray(at, at + len);
      buf = buf.subarray(at + len);
      if (op === 1) onMessage(payload.toString('utf8'));
      else if (op === 9) frame(10, payload);     // ping -> pong
      else if (op === 8) return close();
    }
  });
  sock.on('error', function (e) { log('socket error:', e.message); close(); });
  sock.on('close', close);

  // Client frames must be masked.
  function frame(op, data) {
    var mask = crypto.randomBytes(4), len = data.length, head;
    if (len < 126) { head = Buffer.from([0x80 | op, 0x80 | len]); }
    else if (len < 65536) { head = Buffer.alloc(4); head[0] = 0x80 | op; head[1] = 0xfe; head.writeUInt16BE(len, 2); }
    else { head = Buffer.alloc(10); head[0] = 0x80 | op; head[1] = 0xff; head.writeBigUInt64BE(BigInt(len), 2); }
    var body = Buffer.alloc(len);
    for (var i = 0; i < len; i++) body[i] = data[i] ^ mask[i & 3];
    sock.write(Buffer.concat([head, mask, body]));
  }
  return { send: function (obj) { frame(1, Buffer.from(JSON.stringify(obj))); }, close: close };
}

var running = false;
var bootLaunchDone = false;
var bootCheck = false;   // the next foreground report decides the cold-boot launch
var passUntil = 0;   // set by allowLgHome: the launcher's LG button opens LG's home on purpose

function watch() {
  if (running) return;
  running = true;
  var lastRedirect = 0;
  var ws = connect(function () {
    var payload = { forcePairing: false, pairingType: 'PROMPT',
      manifest: { manifestVersion: 1, appVersion: '1.1', permissions: PERMISSIONS } };
    if (clientKey) payload['client-key'] = clientKey;
    ws.send({ type: 'register', id: 'register_0', payload: payload });
  }, function (raw) {
    var msg;
    try { msg = JSON.parse(raw); } catch (e) { return; }
    if (msg.type === 'registered') {
      clientKey = msg.payload['client-key'];
      log('connected');
      ws.send({ type: 'subscribe', id: 'fg', uri: 'ssap://com.webos.applicationManager/getForegroundAppInfo', payload: {} });
      bootCheck = !bootLaunchDone && os.uptime() < BOOT_S;
      bootLaunchDone = true;
      return;
    }
    if (msg.type === 'error') { log('error:', msg.error); return; }
    if (msg.id !== 'fg' || !msg.payload) return;
    var app = msg.payload.appId || '';
    if (bootCheck) {
      bootCheck = false;
      if (BOOT_TAKEOVER.test(app)) {
        log('cold boot (' + Math.round(os.uptime()) + ' s up) on "' + app + '" -> launcher');
        ws.send({ type: 'request', id: 'launch', uri: 'ssap://system.launcher/launch', payload: { id: LAUNCHER } });
        return;
      }
      log('cold boot on ' + app + ': opened on purpose, leaving it');
    }
    if (app !== LG_HOME) return;
    var now = Date.now();
    if (now < passUntil) {
      log('LG button: staying on LG home');
      passUntil = 0;
      return;
    }
    if (now - lastRedirect < ESCAPE_MS) {
      log('Home pressed twice: staying on LG home');
      lastRedirect = 0;
      return;
    }
    lastRedirect = now;
    ws.send({ type: 'request', id: 'launch', uri: 'ssap://system.launcher/launch', payload: { id: LAUNCHER } });
    log('LG home -> launcher');
  }, function () {
    log('disconnected, retrying');
    running = false;
    setTimeout(watch, 3000);
  });
}

var DEVMODE_TOKEN = '/var/luna/preferences/devmode_enabled';
var EXTEND_EVERY_MS = 24 * 3600 * 1000;
var RETRY_MS = 10 * 60 * 1000;

/** Resets the Developer Mode countdown (it would otherwise disable the launcher after ~1000 hours). */
function extendDevMode() {
  var token;
  try { token = fs.readFileSync(DEVMODE_TOKEN, 'utf8').trim(); } catch (e) { return log('no dev mode token:', e.message); }
  var req = https.get('https://developer.lge.com/secure/ResetDevModeSession.dev?sessionToken=' + encodeURIComponent(token), function (res) {
    var body = '';
    res.on('data', function (d) { body += d; });
    res.on('end', function () {
      log('dev mode session extended:', body);
      if (!/"success"/.test(body)) setTimeout(extendDevMode, RETRY_MS);
    });
  });
  req.setTimeout(30000, function () { req.destroy(new Error('timed out')); });
  req.on('error', function (e) {
    log('dev mode extend failed:', e.message);
    setTimeout(extendDevMode, RETRY_MS);   // the network may not be up yet after standby
  });
}

var extending = false;

function keepDevMode() {
  if (extending) return;
  extending = true;
  extendDevMode();
  setInterval(extendDevMode, EXTEND_EVERY_MS);
}

var Service;
try { Service = require('webos-service'); } catch (e) { Service = null; }

if (Service) {
  var service = new Service('com.gathin.tvhome.service');
  service.activityManager.create('keepAlive', function () {});
  service.register('start', function (message) {
    watch();
    keepDevMode();
    message.respond({ returnValue: true, running: running });
  });
  service.register('allowLgHome', function (message) {
    passUntil = Date.now() + ESCAPE_MS;
    message.respond({ returnValue: true });
  });

  // Starting at boot: webOS won't autostart a Developer Mode app, but the Activity Manager restores
  // persistent activities after a reboot and re-subscribes to their trigger. The trigger is a
  // subscription to this service, so restoring it starts the service. It never sends the trigger's
  // key, so the activity never fires; if the subscription drops, it fires and calls start again.
  var bootSubs = [];
  service.register('bootTrigger', function (message) {
    log('boot trigger subscribed');
    if (message.isSubscription) bootSubs.push(message);
    message.respond({ returnValue: true, subscribed: !!message.isSubscription });
  }, function (message) {
    bootSubs.splice(bootSubs.indexOf(message), 1);
  });
  service.call('luna://com.palm.activitymanager/create', {
    activity: {
      name: 'tvhome-boot',
      description: 'Starts the Home watcher when the TV boots',
      type: { background: true, persist: true, explicit: true },
      trigger: { method: 'luna://com.gathin.tvhome.service/bootTrigger', params: { subscribe: true }, key: 'fired' },
      callback: { method: 'luna://com.gathin.tvhome.service/start', params: {} }
    },
    start: true,
    replace: true,
    subscribe: false
  }, function (res) { log('boot activity:', JSON.stringify(res.payload)); });

  watch();
  keepDevMode();
} else {
  watch();   // run by hand: node service.js
}
