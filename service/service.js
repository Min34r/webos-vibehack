// home-watch.py, running on the TV itself: watches the foreground app over the TV's own
// remote-control service (ws://127.0.0.1:3000) and opens the launcher when LG's home appears.
// The launcher starts it at launch; the keepAlive activity stops webOS from closing it when idle.
// Press Home twice within ESCAPE_MS to stay on LG's home.
// It also extends the Developer Mode session once a day, as the app's "Extend Session Time" does,
// keeps the launcher's app list current as apps are installed or removed, and feeds its top shelf:
// the last app used, HDMI devices that are on, and the weather.
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

// ---- top shelf context ---------------------------------------------------------------------
// What the launcher shows above its dock, pushed to its 'context' subscriptions when it changes:
// the last app used (to resume it), HDMI devices that are on, and the weather.

var LAST_FILE = writable('last-app');
var lastApp = null;
try { lastApp = fs.readFileSync(LAST_FILE, 'utf8').trim() || null; } catch (e) { /* none yet */ }
var weather = null;      // {place, temp, code, day}
var contextSubs = [];

function pushContext(message) {
  message.respond({
    returnValue: true, subscribed: true, lastApp: lastApp, weather: weather, light: lightState(),
    devices: (inputs || []).filter(function (d) { return d.connected; })
  });
}

function contextChanged() { contextSubs.forEach(pushContext); }

/**
 * Apps worth a "Resume" button: launchable ones and Live TV. Not the homes, and not HDMI inputs:
 * those get their own button while their device is on (and a console switched on takes the TV to
 * its input by itself, which would push the last real app out).
 */
function resumable(app) {
  if (!app || app === LAUNCHER || app === LG_HOME) return false;
  if (/^com\.webos\.app\.hdmi\d+$/.test(app)) return false;
  if (app === 'com.webos.app.livetv') return true;
  return !!apps && apps.some(function (a) { return a.id === app; });
}

function noteForeground(app) {
  if (!resumable(app) || app === lastApp) return;
  lastApp = app;
  try { if (LAST_FILE) fs.writeFileSync(LAST_FILE, app); } catch (e) { /* kept in memory */ }
  contextChanged();
}

// Weather from Open-Meteo (free, no account), which updates its current values every 15 minutes:
// fetched about that often, and only while the launcher is on screen (it asks every 5 minutes),
// so nothing goes out while the TV isn't used. Only the place's coordinates are sent. 14 minutes,
// not 15: a launcher timer firing a little early (it restarts whenever the screen saver hides the
// page) must still refresh, or readings wait for the next ask, ~20 minutes.
var WEATHER_EVERY_MS = 14 * 60 * 1000;
var weatherKey = '', weatherAt = 0, places = {};

function getJSON(url, done) {
  var req = https.get(url, function (res) {
    var body = '';
    res.on('data', function (d) { body += d; });
    res.on('end', function () {
      try { done(null, JSON.parse(body)); } catch (e) { done(e); }
    });
  });
  req.setTimeout(15000, function () { req.destroy(new Error('timed out')); });
  req.on('error', function (e) { done(e); });
}

/** where: {city} or {lat, lon, city} from config.js. */
function refreshWeather(where) {
  if (!where || (!where.city && where.lat == null)) return;
  var key = JSON.stringify(where);
  if (key === weatherKey && Date.now() - weatherAt < WEATHER_EVERY_MS) return;
  weatherKey = key;
  weatherAt = Date.now();   // before the request: launcher resumes in a row ask once
  var failed = function (why) { log('weather failed:', why); weatherAt = 0; };
  var fetchAt = function (place) {
    getJSON('https://api.open-meteo.com/v1/forecast?latitude=' + place.lat + '&longitude=' + place.lon +
        '&current=temperature_2m,weather_code,is_day&daily=sunrise,sunset&forecast_days=1&timezone=auto' +
        '&timeformat=unixtime', function (err, d) {
      if (err || !d || !d.current) return failed(err ? err.message : 'no data');
      if (d.daily && d.daily.sunrise && d.daily.sunset) {
        sun = { rise: d.daily.sunrise[0], set: d.daily.sunset[0] };
        applyBrightness();
        if (govee) scheduleDayNight();
      }
      weather = { place: place.name, temp: Math.round(d.current.temperature_2m), code: d.current.weather_code,
                  day: d.current.is_day === 1, at: new Date().toISOString() };
      log('weather: ' + weather.temp + ' deg, code ' + weather.code + ', ' + place.name);
      contextChanged();
    });
  };
  if (where.lat != null) return fetchAt({ lat: where.lat, lon: where.lon, name: where.city || '' });
  if (places[where.city]) return fetchAt(places[where.city]);
  getJSON('https://geocoding-api.open-meteo.com/v1/search?count=1&language=fr&name=' + encodeURIComponent(where.city),
    function (err, d) {
      var r = !err && d && d.results && d.results[0];
      if (!r) return failed('place not found: ' + where.city);
      places[where.city] = { lat: r.latitude, lon: r.longitude, name: r.name };
      fetchAt(places[where.city]);
    });
}

// ---- Govee TV backlight (optional) -------------------------------------------------------------
// With govee.json next to this file (install.sh copies it from the repo root; tools/govee_setup.py
// writes it), the TV's backlight follows the TV: on when it's on, off when it goes to standby or
// turns its screen off. Through Govee's cloud API: the TV Backlight 3 Lite (H6097) has no local
// LAN control. A command goes out only when the state changes.

var govee = null;
try { govee = require('./govee.json'); } catch (e) { /* not set up: nothing to do */ }
var goveeOn = null;       // what was last sent successfully
var lightAuto = true;     // brightness follows day and night; a level picked in the launcher holds until the TV is off
var lightLevel = null;    // that picked level, in %
var lightSent = null;     // the brightness last sent successfully
var lightPending = null;  // the brightness on its way: power, time zone and sun can all ask at once

/** Sends one capability to the light; done(ok) after Govee answers. */
function goveeCommand(what, capability, done) {
  var body = JSON.stringify({ requestId: String(Date.now()), payload: { sku: govee.sku, device: govee.device,
    capability: capability } });
  var started = Date.now();
  var failed = function (why) { log('govee ' + what + ' failed: ' + why); done(false); };
  var req = https.request({ host: 'openapi.api.govee.com', path: '/router/api/v1/device/control', method: 'POST',
    headers: { 'Govee-API-Key': govee.apiKey, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
  }, function (res) {
    var out = '';
    res.on('data', function (d) { out += d; });
    res.on('end', function () {
      if (res.statusCode !== 200 || !/"code":\s*200/.test(out)) return failed(res.statusCode + ' ' + out.slice(0, 120));
      log('govee ' + what + ' (' + (Date.now() - started) + ' ms)');
      done(true);
    });
  });
  req.setTimeout(8000, function () { req.destroy(new Error('timed out')); });
  req.on('error', function (e) { failed(e.message); });
  req.end(body);
}

function goveeSwitch(on, retry) {
  if (!govee || on === goveeOn) return;
  goveeOn = on;
  goveeCommand(on ? 'on' : 'off', { type: 'devices.capabilities.on_off', instance: 'powerSwitch', value: on ? 1 : 0 },
    function (ok) {
      if (!ok) {
        goveeOn = null;
        if (retry) setTimeout(function () { goveeSwitch(on, false); }, 5000);
        return;
      }
      if (on) applyBrightness();
      contextChanged();
    });
}

// Day and night by the sun at the weather's place (from Open-Meteo, with the weather); without it,
// night is 21:00 to 7:00 at the launcher's UTC offset. Only brightness changes, never the colour
// temperature, which would shift how the picture's colours read.
var sun = null;           // {rise, set} in Unix seconds, for one day: later days repeat it
var tzOffsetMin = null;   // the launcher's getTimezoneOffset(); null until it has said

function isNight() {
  var now = Date.now() / 1000;
  if (sun) {
    var dayLength = sun.set - sun.rise;
    var phase = ((now - sun.rise) % 86400 + 86400) % 86400;
    return phase >= dayLength;
  }
  var hour = new Date(Date.now() - (tzOffsetMin || 0) * 60000).getUTCHours();
  return hour >= 21 || hour < 7;
}

/** The brightness wanted now, or null while day and night can't be told yet (just after a cold boot). */
function targetBrightness() {
  if (!lightAuto && lightLevel) return lightLevel;
  if (!sun && tzOffsetMin === null) return null;   // the launcher's first call brings the time zone and the sun
  return isNight() ? (govee.nightBrightness || 35) : (govee.dayBrightness || 75);
}

/** Sends the brightness the light should have now, if the light is on and it differs. */
function applyBrightness() {
  if (!govee || goveeOn !== true) return;
  var want = targetBrightness();
  if (want === null || want === lightSent || want === lightPending) return;
  lightPending = want;
  var auto = lightAuto;
  goveeCommand('brightness ' + want + '%' + (auto ? (isNight() ? ' (night)' : ' (day)') : ''),
    { type: 'devices.capabilities.range', instance: 'brightness', value: want }, function (ok) {
      lightPending = null;
      if (ok) lightSent = want;
      contextChanged();
      applyBrightness();   // something else may have been asked meanwhile
    });
}

/**
 * Wakes up once at the next sunrise or sunset (or 7:00 / 21:00) to switch brightness, instead of
 * checking every minute. Timers stop in standby, which is fine: waking up re-applies anyway.
 */
var dayNightTimer = null;

function scheduleDayNight() {
  clearTimeout(dayNightTimer);
  var now = Date.now() / 1000, next;
  if (sun) {
    var phase = ((now - sun.rise) % 86400 + 86400) % 86400, dayLength = sun.set - sun.rise;
    next = phase < dayLength ? dayLength - phase : 86400 - phase;
  } else {
    var local = new Date(Date.now() - (tzOffsetMin || 0) * 60000);
    var hours = local.getUTCHours() + local.getUTCMinutes() / 60 + local.getUTCSeconds() / 3600;
    next = ((hours < 7 ? 7 - hours : hours < 21 ? 21 - hours : 31 - hours) * 3600);
  }
  dayNightTimer = setTimeout(function () {
    applyBrightness();
    scheduleDayNight();
  }, Math.min(next + 5, 6 * 3600) * 1000);   // re-checked at least every 6 h, should the clock jump
}

function lightState() {
  return govee ? { on: goveeOn === true, auto: lightAuto, level: lightLevel, brightness: lightSent,
                   night: sun || tzOffsetMin !== null ? isNight() : null } : null;
}

/** The TV's power state: on only while Active and not on its way to standby or off. */
function onPower(p) {
  var state = p.state || '', processing = p.processing || '';
  var on = state === 'Active' && !/standby|suspend|off/i.test(processing);
  log('power: ' + state + (processing ? ' (' + processing + ')' : ''));
  if (!on) { lightAuto = true; lightLevel = null; }   // a picked level lasts until the TV is off
  goveeSwitch(on, on);   // switching off, there's no time for a retry before standby
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
      ws.send({ type: 'subscribe', id: 'inputs', uri: 'ssap://tv/getExternalInputList', payload: {} });
      if (govee) ws.send({ type: 'subscribe', id: 'power', uri: 'ssap://com.webos.service.tvpower/power/getPowerState', payload: {} });
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
    if (msg.id === 'power' && msg.payload) return onPower(msg.payload);
    if (msg.id === 'inputs' && msg.payload && msg.payload.devices) {
      // A subscription: renamed inputs and devices switched on or off come through too.
      inputs = msg.payload.devices.filter(function (d) { return d.appId; })
        .map(function (d) { return { appId: d.appId, label: d.label || d.id, connected: !!d.connected }; });
      appSubs.forEach(pushApps);
      contextChanged();
      return;
    }
    if (msg.id !== 'fg' || !msg.payload) return;
    var app = msg.payload.appId || '';
    noteForeground(app);
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
  service.register('context', function (message) {
    if (message.isSubscription) contextSubs.push(message);
    if (typeof message.payload.tzOffset === 'number') {
      tzOffsetMin = message.payload.tzOffset;
      applyBrightness();
      if (govee) scheduleDayNight();
    }
    refreshWeather(message.payload.weather);
    pushContext(message);
  }, function (message) {
    contextSubs.splice(contextSubs.indexOf(message), 1);
  });
  // The launcher's Light menu: {power: true|false} or {brightness: 'auto' | 25..100}.
  service.register('light', function (message) {
    var p = message.payload;
    if (!govee) return message.respond({ returnValue: false, errorText: 'no govee.json' });
    if (p.power === true || p.power === false) {
      goveeOn = null;   // send it even if the light was switched from the Govee app meanwhile
      goveeSwitch(p.power, p.power);
    } else if (p.brightness === 'auto') {
      lightAuto = true;
      lightLevel = null;
      applyBrightness();
    } else if (p.brightness >= 1 && p.brightness <= 100) {
      lightAuto = false;
      lightLevel = Math.round(p.brightness);
      applyBrightness();
    }
    message.respond({ returnValue: true, light: lightState() });
  });
  service.register('status', function (message) {
    var at = lastExtended();
    message.respond({ returnValue: true, connected: connected, apps: apps ? apps.length : null, weather: weather,
      light: lightState(), sun: sun,
      devModeExtended: at ? new Date(at).toISOString() : null, uptime: Math.round(os.uptime()),
      govee: govee ? { sku: govee.sku } : null, logFile: LOG_FILE, log: recent.slice(-60) });
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
  if (govee) scheduleDayNight();
} else {
  watch();   // run by hand: node service.js
}
