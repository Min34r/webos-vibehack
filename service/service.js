// home-watch.py, running on the TV itself: watches the foreground app over the TV's own
// remote-control service (ws://127.0.0.1:3000) and opens the launcher when LG's home appears.
// The launcher starts it at launch; the keepAlive activity stops webOS from closing it when idle.
// Press Home twice within ESCAPE_MS to stay on LG's home.
// It also extends the Developer Mode session once a day, as the app's "Extend Session Time" does,
// and keeps the launcher's app list current as apps are installed or removed.
var net = require('net');
var http = require('http');
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

// Where the service may write. Its own folder is readable over the Developer Mode SSH, but webOS
// installs it read-only for the service (rwxrwxr-x, another owner): only files that already exist
// there can be written, never created or renamed. /tmp always works, but is private to the service
// and lost at power off. The 'status' method returns the recent log either way.
var DIRS = [__dirname, '/tmp'];

function writable(name) {
  for (var i = 0; i < DIRS.length; i++) {
    try { fs.appendFileSync(DIRS[i] + '/' + name, ''); return DIRS[i] + '/' + name; } catch (e) { /* next */ }
  }
  return null;
}

var LOG_FILE = writable('service.log');
var LOG_MAX = 64 * 1024;
var recent = [];   // the last lines, for the 'status' method

var log = function () {
  var line = new Date().toISOString() + ' ' + [].slice.call(arguments).join(' ');
  console.log('[home-watch]', line);
  recent.push(line);
  if (recent.length > 200) recent.shift();
  if (!LOG_FILE) return;
  try {
    if (fs.statSync(LOG_FILE).size > LOG_MAX) {
      // Rotate in place, keeping the newer half: a rename would need write access to the folder.
      var keep = fs.readFileSync(LOG_FILE, 'utf8').slice(-LOG_MAX / 2);
      fs.writeFileSync(LOG_FILE, keep.slice(keep.indexOf('\n') + 1));
    }
    fs.appendFileSync(LOG_FILE, line + '\n');
  } catch (e) { /* console and 'status' only */ }
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

// ---- app list ------------------------------------------------------------------------------
// webOS won't let the launcher list apps, but the remote-control service does, and pushes a change
// when an app is installed or removed. Keep the list here and push it to the launcher only when it
// changed: no polling, and icons are fetched only for apps the launcher has none for.

var apps = null;        // [{id, title, iconColor, iconUrl}] of visible apps, null until known
var appsKey = '';       // apps as JSON: an unchanged list isn't pushed again
var inputs = null;      // [{appId, label}]
var iconCache = {};     // icon URL -> data: URL
var appSubs = [];       // the launcher's 'apps' subscriptions

function setApps(points) {
  var next = points.filter(function (p) { return !p.hidden; }).map(function (p) {
    var large = String(p.largeIcon || '');
    return { id: p.id, title: p.title, iconColor: p.iconColor || p.bgColor || '',
             iconUrl: large.indexOf('http') === 0 ? large : p.icon };
  });
  var key = JSON.stringify(next);
  if (key === appsKey) return;
  appsKey = key;
  apps = next;
  log('apps: ' + apps.length);
  var live = {};
  apps.forEach(function (a) { live[a.iconUrl] = true; });
  Object.keys(iconCache).forEach(function (url) { if (!live[url]) delete iconCache[url]; });
  appSubs.forEach(pushApps);
}

function fetchIcon(url, done) {
  if (iconCache[url] || !/^https?:/.test(url || '')) return done();
  var lib = url.indexOf('https:') === 0 ? https : http;   // the TV serves icons over both
  var req = lib.get(url, { rejectUnauthorized: false }, function (res) {   // the TV's own LG-CA certificate
    var chunks = [];
    res.on('data', function (d) { chunks.push(d); });
    res.on('end', function () {
      if (res.statusCode === 200) {
        iconCache[url] = 'data:' + (res.headers['content-type'] || 'image/png') + ';base64,' +
          Buffer.concat(chunks).toString('base64');
      }
      done();
    });
  });
  req.setTimeout(10000, function () { req.destroy(new Error('timed out')); });
  req.on('error', function (e) { log('icon failed:', url, e.message); done(); });
}

/** Sends the list to one launcher subscription, with icons for the apps it has none bundled for. */
function pushApps(message) {
  if (!apps) return;
  var known = {};
  (message.payload.known || []).forEach(function (id) { known[id] = true; });
  var missing = apps.filter(function (a) { return !known[a.id]; });
  var left = missing.length + 1;
  var finish = function () {
    if (--left) return;
    message.respond({
      returnValue: true, subscribed: true, inputs: inputs,
      apps: apps.map(function (a) {
        return { id: a.id, title: a.title, iconColor: a.iconColor, icon: known[a.id] ? null : iconCache[a.iconUrl] || null };
      })
    });
  };
  missing.forEach(function (a) { fetchIcon(a.iconUrl, finish); });
  finish();
}

var running = false;
var connected = false;
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
      connected = true;
      log('connected');
      ws.send({ type: 'subscribe', id: 'fg', uri: 'ssap://com.webos.applicationManager/getForegroundAppInfo', payload: {} });
      ws.send({ type: 'subscribe', id: 'lp', uri: 'ssap://com.webos.applicationManager/listLaunchPoints', payload: {} });
      ws.send({ type: 'request', id: 'inputs', uri: 'ssap://tv/getExternalInputList', payload: {} });
      bootCheck = !bootLaunchDone && os.uptime() < BOOT_S;
      bootLaunchDone = true;
      return;
    }
    if (msg.type === 'error') { log('error:', msg.error); return; }
    if (msg.id === 'lp' && msg.payload && !msg.payload.launchPoints) {
      // A change (an app installed, removed or updated) comes alone: fetch the whole list again.
      ws.send({ type: 'request', id: 'lp-all', uri: 'ssap://com.webos.applicationManager/listLaunchPoints', payload: {} });
      return;
    }
    if ((msg.id === 'lp' || msg.id === 'lp-all') && msg.payload) return setApps(msg.payload.launchPoints || []);
    if (msg.id === 'inputs' && msg.payload) {
      inputs = (msg.payload.devices || []).filter(function (d) { return d.appId; })
        .map(function (d) { return { appId: d.appId, label: d.label || d.id }; });
      return;
    }
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
    connected = false;
    setTimeout(watch, 3000);
  });
}

var DEVMODE_TOKEN = '/var/luna/preferences/devmode_enabled';
var EXTENDED_FILE = writable('devmode-extended');   // when it last worked, across service restarts
var EXTEND_EVERY_MS = 20 * 3600 * 1000;
var RETRY_MS = 10 * 60 * 1000;
var extending = false;
var extendedAt = 0;

function lastExtended() {
  var saved = 0;
  try { saved = Number(fs.readFileSync(EXTENDED_FILE, 'utf8')) || 0; } catch (e) { /* none yet */ }
  return Math.max(saved, extendedAt);
}

/** Resets the Developer Mode countdown (it would otherwise disable the launcher after ~1000 hours). */
function extendDevMode(done) {
  var token;
  try { token = fs.readFileSync(DEVMODE_TOKEN, 'utf8').trim(); } catch (e) { log('no dev mode token:', e.message); return done(false); }
  var req = https.get('https://developer.lge.com/secure/ResetDevModeSession.dev?sessionToken=' + encodeURIComponent(token), function (res) {
    var body = '';
    res.on('data', function (d) { body += d; });
    res.on('end', function () {
      log('dev mode session extended:', body);
      done(/"success"/.test(body));
    });
  });
  req.setTimeout(30000, function () { req.destroy(new Error('timed out')); });
  req.on('error', function (e) {
    log('dev mode extend failed:', e.message);   // the network may not be up yet after standby
    done(false);
  });
}

/**
 * Extends the session when the last success is EXTEND_EVERY_MS old by the wall clock. Called at
 * start, whenever the launcher shows and every hour: a 24-hour timer alone drifts, as timers stop
 * while the TV sleeps.
 */
function keepDevMode() {
  var last = lastExtended();
  if (extending || Date.now() - last < EXTEND_EVERY_MS) return;
  extending = true;
  extendDevMode(function (ok) {
    extending = false;
    if (!ok) return setTimeout(keepDevMode, RETRY_MS);
    extendedAt = Date.now();
    try { if (EXTENDED_FILE) fs.writeFileSync(EXTENDED_FILE, String(extendedAt)); } catch (e) { /* kept in memory */ }
  });
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
  service.register('apps', function (message) {
    if (message.isSubscription) appSubs.push(message);
    if (apps) pushApps(message);
    else message.respond({ returnValue: true, subscribed: !!message.isSubscription });   // the list follows
  }, function (message) {
    appSubs.splice(appSubs.indexOf(message), 1);
  });
  service.register('status', function (message) {
    var at = lastExtended();
    message.respond({ returnValue: true, connected: connected, apps: apps ? apps.length : null,
      devModeExtended: at ? new Date(at).toISOString() : null, uptime: Math.round(os.uptime()),
      logFile: LOG_FILE, log: recent.slice(-60) });
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
  setInterval(keepDevMode, 3600 * 1000);
} else {
  watch();   // run by hand: node service.js
}
