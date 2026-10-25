// /var/lib/webosbrew/autofreeze.js
// High-performance app freezer & unfreezer daemon for rooted LG webOS TVs.
// Listens on 127.0.0.1:1843 for /freeze and /unfreeze signals from the custom menu.
// When frozen, background apps drop to 0% CPU and 0% GPU, audio silences, and RAM is preserved.
// When unfrozen, the app resumes playing instantly from the exact same frame.

const http = require('http');
const { execSync } = require('child_process');

const PORT = 1843;
const MENU_ID = 'com.gathin.tvhome';

let frozenPid = null;
let frozenAppId = null;
let safetyTimer = null;

function log(...args) {
  console.log(`[${new Date().toISOString()}] [autofreeze]`, ...args);
}

function getForegroundApp() {
  try {
    const raw = execSync('luna-send -n 1 luna://com.webos.service.applicationmanager/getForegroundAppInfo {}', { timeout: 2000 }).toString();
    const data = JSON.parse(raw);
    return data.appId || null;
  } catch (e) {
    return null;
  }
}

function getRunningApps() {
  try {
    const raw = execSync('luna-send -n 1 luna://com.webos.service.applicationmanager/running {}', { timeout: 2000 }).toString();
    const data = JSON.parse(raw);
    return data.running || [];
  } catch (e) {
    return [];
  }
}

function freeze() {
  if (frozenPid) {
    log(`Already frozen: PID ${frozenPid} (${frozenAppId})`);
    return { ok: true, alreadyFrozen: true, pid: frozenPid };
  }

  const fgApp = getForegroundApp();
  const running = getRunningApps();

  // Find the app to freeze (priority: current foreground app, otherwise active web app that is not tvhome)
  let target = running.find(r => r.id === fgApp && r.id !== MENU_ID);
  if (!target) {
    target = running.find(r => r.id !== MENU_ID && (r.webprocessid || r.processid) && !r.id.startsWith('com.webos.app.home'));
  }

  if (!target) {
    log('No suitable background app found to freeze.');
    return { ok: false, error: 'no_target' };
  }

  const pid = parseInt(target.webprocessid || target.processid, 10);
  if (!pid || pid <= 100) {
    log(`Invalid PID (${pid}) for app ${target.id}`);
    return { ok: false, error: 'invalid_pid' };
  }

  try {
    process.kill(pid, 'SIGSTOP');
    frozenPid = pid;
    frozenAppId = target.id;
    log(`FROZE app "${target.id}" (PID: ${pid}) -> CPU dropped to 0%, audio paused`);

    // Safety watchdog: unfreeze after 15 minutes if menu is abandoned
    clearTimeout(safetyTimer);
    safetyTimer = setTimeout(() => {
      log('Watchdog timer expired: auto-unfreezing app');
      unfreeze();
    }, 15 * 60 * 1000);

    return { ok: true, frozen: true, id: target.id, pid: pid };
  } catch (e) {
    log(`Failed to send SIGSTOP to PID ${pid}:`, e.message);
    return { ok: false, error: e.message };
  }
}

function unfreeze() {
  clearTimeout(safetyTimer);
  if (!frozenPid) {
    return { ok: true, wasNotFrozen: true };
  }

  try {
    process.kill(frozenPid, 'SIGCONT');
    log(`UNFROZE / RESUMED app "${frozenAppId}" (PID: ${frozenPid}) -> Playback restored!`);
    const res = { ok: true, resumed: true, id: frozenAppId, pid: frozenPid };
    frozenPid = null;
    frozenAppId = null;
    return res;
  } catch (e) {
    log(`Failed to send SIGCONT to PID ${frozenPid}:`, e.message);
    frozenPid = null;
    frozenAppId = null;
    return { ok: false, error: e.message };
  }
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  const url = req.url.split('?')[0];

  if (url === '/freeze') {
    const result = freeze();
    res.writeHead(200);
    res.end(JSON.stringify(result));
  } else if (url === '/unfreeze') {
    const result = unfreeze();
    res.writeHead(200);
    res.end(JSON.stringify(result));
  } else if (url === '/status') {
    res.writeHead(200);
    res.end(JSON.stringify({
      frozenPid,
      frozenAppId,
      time: new Date().toISOString()
    }));
  } else {
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'not_found' }));
  }
});

server.listen(PORT, '127.0.0.1', () => {
  log(`Autofreeze HTTP daemon listening on http://127.0.0.1:${PORT}`);
});

process.on('SIGTERM', () => { unfreeze(); process.exit(0); });
process.on('SIGINT', () => { unfreeze(); process.exit(0); });
