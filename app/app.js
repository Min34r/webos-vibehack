/*
 * tvOS style home for webOS: black, a pinned dock row, an app grid, and one glass highlight that
 * springs between tiles. A port of the Android launcher in ../../launcher.
 *
 * webOS does not let third-party apps list installed apps, so sync-apps.py writes them into apps.js.
 */
(function () {
  'use strict';

  // Laid out at 1920x1080, which the TV scales to its panel. Should appinfo.json ask for a 3840x2160
  // page instead, zoom the layout x2 to fill it (sharper, but ~30 MB more and a few fps less).
  var SCALE = window.innerWidth >= 3840 ? 2 : 1;
  if (SCALE !== 1) document.documentElement.style.zoom = SCALE;

  var COLUMNS = Math.max(1, CONFIG.columns || 4);
  var TILE_W = 360, TILE_H = 202;
  var CELL_W = (1920 - 2 * 112) / COLUMNS;
  var ROW_PITCH = 292;
  var DOCK_TOP = 708;           // tile top of the dock row: next row peeks in at the bottom
  var DOCK_GAP = 36;            // extra space below the dock
  var FOCUS_SCALE = 1.1;
  var GLASS_PAD = 12;           // room for the glass glow around the scaled tile
  var VIEW_TOP = 80, VIEW_BOTTOM = 1060;    // area grid rows scroll into (the header hides below the dock)

  var KEY = { LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, OK: 13, BACK: 461, ESC: 27 };

  var curLocale = 'en';
  var tr = (window.I18N && window.I18N.en) || {};

  function setLocale(loc) {
    if (!loc) return;
    var i18n = window.I18N || {};
    var code = String(loc).slice(0, 2).toLowerCase();
    curLocale = i18n[code] ? code : 'en';
    tr = i18n[curLocale] || i18n.en || {};
    var elInputs = $('lblInputs');
    if (elInputs && tr.inputs) elInputs.textContent = tr.inputs;
    var elSettings = $('lblSettings');
    if (elSettings && tr.settings) elSettings.textContent = tr.settings;
    updateClock();
    updateNetworkLabel();
  }

  function initLocale() {
    // 0ms instant cached read from previous runs (zero IPC, zero CPU overhead)
    var cached = null;
    try { cached = localStorage.getItem('tvhome.locale'); } catch (e) {}
    if (cached) {
      setLocale(cached);
      return;
    }

    // Instant synchronous in-memory read from Chromium
    var lang = (typeof navigator !== 'undefined' && navigator.language ? navigator.language : 'en').slice(0, 2).toLowerCase();
    setLocale(lang);
    try { localStorage.setItem('tvhome.locale', lang); } catch (e) {}

    // Exactly one one-shot Luna query on very first boot (no polling, no subscription)
    luna('luna://com.webos.settingsservice/getSystemSettings', { keys: ['localeInfo'] }, function (res) {
      if (res && res.settings && res.settings.localeInfo && res.settings.localeInfo.locales && res.settings.localeInfo.locales.UI) {
        var tvLang = res.settings.localeInfo.locales.UI.slice(0, 2).toLowerCase();
        if (tvLang !== lang) {
          setLocale(tvLang);
          try { localStorage.setItem('tvhome.locale', tvLang); } catch (e) {}
        }
      }
    });
  }

  var ICON_INPUT = 'M18,7V4c0,-1.1 -0.9,-2 -2,-2H8C6.9,2 6,2.9 6,4v3H5v6l3,6v3h8v-3l3,-6V7H18zM8,4h8v3h-2V5h-1v2h-2V5h-1v2H8V4z';
  var ICON_LIVETV = 'M21,6h-7.59l3.29,-3.29L16,2l-4,4l-4,-4l-0.71,0.71L10.59,6H3c-1.1,0 -2,0.89 -2,2v12c0,1.1 0.9,2 2,2h18c1.1,0 2,-0.89 2,-2V8C23,6.89 22.1,6 21,6zM21,20H3V8h18V20zM9,10v8l7,-4L9,10z';

  var $ = function (id) { return document.getElementById(id); };
  var stage = $('stage'), tilesEl = $('tiles'), glass = $('glass'), hero = $('hero');
  var ambients = [$('ambientA'), $('ambientB')], ambientFront = 0, ambientColor = null;
  var pills = [$('btnInputs'), $('btnWifi'), $('btnSettings'), $('btnLgHome')];
  var panel = $('inputsPanel');

  var items = [];               // {app, el, color}
  var zone = 'grid';            // 'grid' | 'top' | 'inputs'
  var focused = 0, pillFocus = 0, inputFocus = 0, inputRows = [];
  var offset = 0, heroShown = false, glassShown = false;
  var editing = null;           // {item, snapshot} while a tile is being moved
  var headerBottom = null;

  // ---- luna bus ------------------------------------------------------------------------------

  var bridges = [];   // keep a reference: a collected bridge drops its callback

  function luna(uri, params, cb) {
    try {
      var b = new PalmServiceBridge();
      b.onservicecallback = function (msg) {
        var res;
        try { res = JSON.parse(msg); } catch (e) { res = { returnValue: false }; }
        if (cb) cb(res);
        if (!params || !params.subscribe) bridges.splice(bridges.indexOf(b), 1);
      };
      bridges.push(b);
      b.call(uri, JSON.stringify(params || {}));
      return b;
    } catch (e) {
      if (cb) cb({ returnValue: false, errorText: String(e) });   // not on a TV (desktop preview)
    }
  }

  function dismissOverlay() {
    try {
      window.close();
    } catch (e) {
      if (window.webOS && window.webOS.platformBack) window.webOS.platformBack();
    }
  }

  function launch(id, title, params) {
    luna('luna://com.webos.applicationManager/launch', { id: id, params: params || {} }, function (res) {
      if (res.returnValue === false) {
        toast((tr.couldNotOpen || 'Could not open ') + (title || id));
      } else {
        setTimeout(dismissOverlay, 150);
      }
    });
  }

  var toastTimer;
  function toast(text) {
    var t = $('toast');
    t.textContent = text;
    t.classList.add('shown');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('shown'); }, 2200);
  }

  // ---- sounds --------------------------------------------------------------------------------

  // Soft, rounded feedback in the spirit of tvOS: spanda's "lush" profile (vendor/spanda.js), a low
  // sine body with a sub-octave, a slow attack and a little room, synthesised with no audio files.
  // The engine opens its audio context on the first sound, and is dropped behind other apps.
  var VOLUME = CONFIG.sounds == null ? 0.5 : CONFIG.sounds;
  var sfx = null;

  function soundsOn() {
    if (sfx || !(VOLUME > 0) || !window.Spanda) return;
    sfx = Spanda.createSpanda({ profile: 'lush', volume: VOLUME });
    // Open the audio context soon, so the first key isn't late, but after the screen is up.
    setTimeout(function () { if (sfx) sfx.resume(); }, 400);
  }

  function soundsOff() {
    if (sfx) sfx.destroy();
    sfx = null;
  }

  var SOUNDS = {
    move: 'type',                                       // focus moved: the faintest tap
    bump: { hits: [{ pitch: 0.72, gain: 0.34, glide: 0.92 }], decay: 0.5, reverb: 0.12, transient: 0.08, sub: 0.45 },
    select: 'open',                                     // open an app, a button, an input
    back: 'close',
    lift: 'toggleOn',                                   // hold OK: pick a tile up
    drop: 'toggleOff'                                   // OK: put it down
  };

  function sound(name) {
    if (sfx) sfx.play(SOUNDS[name]);
  }

  // ---- apps ----------------------------------------------------------------------------------

  /** config.js titles rename apps and inputs (HDMI inputs are both); tvTitle keeps the TV's name. */
  function applyTitles() {
    var titles = CONFIG.titles || {}, data = window.TV_APPS || {};
    (data.apps || []).forEach(function (a) {
      a.tvTitle = a.tvTitle || a.title;
      a.title = titles[a.id] || a.tvTitle;
    });
    (data.inputs || []).forEach(function (i) { if (titles[i.appId]) i.label = titles[i.appId]; });
  }

  // ---- live app list -------------------------------------------------------------------------

  // apps.js is the list install.sh saw. The service (service/) pushes the TV's list when it differs,
  // so apps installed or removed since show up by themselves. Bundled icons and logos still win; the
  // service only sends icons for apps installed since.
  var bundledIcons = {};
  ((window.TV_APPS && TV_APPS.apps) || []).forEach(function (a) { bundledIcons[a.id] = a.icon; });
  var pendingApps = null;   // a list that arrived while a tile was being moved
  var appsBridge = null;

  function appsKey(list) {
    return list.map(function (a) { return a.id + '|' + (a.tvTitle || a.title) + '|' + a.icon; }).join('\n');
  }

  /** (Re)subscribes: called on every resume, since a subscription dies with a restarted service. */
  function watchApps() {
    if (appsBridge) {
      try { appsBridge.cancel(); } catch (e) { /* already gone */ }
      bridges.splice(bridges.indexOf(appsBridge), 1);
    }
    appsBridge = luna('luna://com.gathin.tvhome.service/apps', { subscribe: true, known: Object.keys(bundledIcons) }, function (res) {
      if (res.inputs) {
        TV_APPS.inputs = res.inputs;
        applyTitles();
      }
      if (!res.apps) return;
      var next = [];
      res.apps.forEach(function (a) {
        var icon = bundledIcons[a.id] || a.icon;
        if (icon) next.push({ id: a.id, title: a.title, iconColor: a.iconColor, icon: icon });   // no icon: skipped, as sync-apps.py does
      });
      if (appsKey(next) === appsKey(TV_APPS.apps)) return;
      if (editing) pendingApps = next;
      else setApps(next);
    });
  }

  /** Swaps in a new app list without the entrance animation, keeping focus on the same app. */
  function setApps(list) {
    var id = items[focused] && items[focused].app.id;
    TV_APPS.apps = list;
    applyTitles();
    build();
    items.forEach(function (it) { it.el.classList.add('shown'); });
    var at = 0;
    items.forEach(function (it, i) { if (it.app.id === id) at = i; });
    focused = at;
    if (zone === 'grid') focusTile(at);
  }

  function orderedApps() {
    var all = (window.TV_APPS && TV_APPS.apps) || [];
    var byId = {};
    all.forEach(function (a) { byId[a.id] = a; });
    var hidden = {};
    (CONFIG.hiddenApps || []).forEach(function (id) { hidden[id] = true; });
    var byTitle = function (a, b) { return a.title.toLowerCase() < b.title.toLowerCase() ? -1 : 1; };

    // An order arranged on the TV wins, until dockApps in config.js changes.
    var saved = loadOrder();
    if (saved) {
      var placed = [];
      saved.forEach(function (id) {
        if (byId[id] && !hidden[id]) { placed.push(byId[id]); hidden[id] = true; }
      });
      return placed.concat(all.filter(function (a) { return !hidden[a.id]; }).sort(byTitle));
    }

    var dock = [];
    (CONFIG.dockApps || []).forEach(function (id) {
      if (byId[id] && !hidden[id] && dock.length < COLUMNS) { dock.push(byId[id]); hidden[id] = true; }
    });
    var rest = all.filter(function (a) { return !hidden[a.id]; });
    rest.sort(byTitle);
    return dock.concat(rest);
  }

  var ORDER_KEY = 'tvhome.order';

  function loadOrder() {
    try {
      var s = JSON.parse(localStorage.getItem(ORDER_KEY));
      return s && s.dock === (CONFIG.dockApps || []).join(',') ? s.ids : null;
    } catch (e) {
      return null;
    }
  }

  function saveOrder() {
    try {
      localStorage.setItem(ORDER_KEY, JSON.stringify({
        dock: (CONFIG.dockApps || []).join(','),
        ids: items.map(function (it) { return it.app.id; })
      }));
    } catch (e) { /* storage unavailable: the order lasts until the app restarts */ }
  }

  function rowOf(i) { return Math.floor(i / COLUMNS); }
  function tileLeft(i) { return 112 + (i % COLUMNS) * CELL_W + (CELL_W - TILE_W) / 2; }
  function tileTop(i) { var r = rowOf(i); return DOCK_TOP + r * ROW_PITCH + (r > 0 ? DOCK_GAP : 0); }

  function build() {
    tilesEl.innerHTML = '';
    items = orderedApps().map(function (app) {
      var el = document.createElement('div');
      el.className = 'item';
      var card = document.createElement('div');
      card.className = 'card';
      var img = document.createElement('img');
      var item = { app: app, el: el, card: card, color: null };
      img.onload = function () { paintTile(item, img); };
      img.src = app.icon;
      card.appendChild(img);
      el.appendChild(card);
      var name = document.createElement('div');
      name.className = 'name';
      name.textContent = app.title;
      el.appendChild(name);
      el.addEventListener('mouseover', function () {
        if (zone !== 'inputs' && !editing) focusTile(items.indexOf(item));
      });
      el.addEventListener('click', function () {
        if (editing) finishEdit(true);
        else launch(app.id, app.title);
      });
      tilesEl.appendChild(el);
      return item;
    });
    layout();
  }

  /** Places every tile by its position in items; tiles glide when the order changes. */
  function layout() {
    items.forEach(function (it, i) {
      it.el.style.left = tileLeft(i) + 'px';
      it.el.style.top = tileTop(i) + 'px';
      it.el.classList.toggle('dock', rowOf(i) === 0);   // the dock has no labels: the top shelf names it
    });

    var band = $('dockBand');
    var n = Math.min(COLUMNS, items.length);
    band.style.display = n ? 'block' : 'none';
    band.style.left = (tileLeft(0) - 28) + 'px';
    band.style.top = (DOCK_TOP - 28) + 'px';
    band.style.width = ((n - 1) * CELL_W + TILE_W + 56) + 'px';
    band.style.height = (TILE_H + 56) + 'px';
  }

  function animateIn() {
    items.forEach(function (it, i) {
      it.el.classList.remove('shown');
      setTimeout(function () { it.el.classList.add('shown'); }, 60 + Math.min(i, 16) * 40);
    });
  }

  /**
   * Store icons are square logos on a solid colour: fill the wide tile with that colour so the logo
   * reads as a banner. LG's system icons are glyphs on transparent: use the app's own colour.
   */
  function paintTile(item, img) {
    var px = null, edge = null;
    try {
      var c = document.createElement('canvas');
      c.width = 12; c.height = 12;
      // Read back on the CPU: a GPU canvas made each getImageData a ~30 ms readback on this TV.
      var g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(img, 0, 0, 12, 12);
      px = g.getImageData(0, 0, 12, 12).data;
      edge = edgeColor(img);
    } catch (e) { /* tainted canvas: fall back to the app's colour */ }

    var glyphColor = null;
    if (edge && edge[3] > 200) {
      item.card.style.background = 'rgb(' + edge[0] + ',' + edge[1] + ',' + edge[2] + ')';
    } else {
      item.card.classList.add('glyph');
      item.card.style.background = glyphBackground(item.app.iconColor);
      glyphColor = glyphBackground(item.app.iconColor) === '#2c2c2e' ? null : parseColor(item.app.iconColor);
    }
    // A white glyph says nothing about the app: glow in the tile's colour instead.
    item.color = glyphColor || (px ? vividColor(px) : parseColor(item.app.iconColor));
    if (items[focused] === item) setAmbient(item.color);
  }

  /**
   * The icon's background at full size: a corner pixel, or the middle of the left edge for rounded
   * icons whose corners are transparent. A downscaled sample would blend in the logo.
   */
  function edgeColor(img) {
    // Store icons (130px) are read at full size. Vector tiles (1280x720) have a solid background:
    // 160px wide is plenty, and spares rasterising each one at full size.
    var scale = Math.min(1, 160 / img.naturalWidth);
    var w = Math.round(img.naturalWidth * scale), h = Math.round(img.naturalHeight * scale);
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    var g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0, w, h);
    var corner = g.getImageData(2, 2, 1, 1).data;
    return corner[3] > 200 ? corner : g.getImageData(2, Math.floor(h / 2), 1, 1).data;
  }

  function glyphBackground(hex) {
    var c = parseColor(hex);
    if (!c) return '#2c2c2e';
    var hsv = rgbToHsv(c);
    if (hsv[1] < 0.15 && (hsv[2] > 0.85 || hsv[2] < 0.1)) return '#2c2c2e';   // white or black glyph colour
    return 'rgb(' + c.join(',') + ')';
  }

  /** A vivid colour from the icon: the most saturated, not too dark pixel, or the lifted average. */
  function vividColor(px) {
    var best = null, bestScore = -1, sum = [0, 0, 0], n = 0;
    for (var i = 0; i < px.length; i += 4) {
      if (px[i + 3] < 128) continue;
      var p = [px[i], px[i + 1], px[i + 2]];
      sum[0] += p[0]; sum[1] += p[1]; sum[2] += p[2]; n++;
      var hsv = rgbToHsv(p);
      var score = hsv[1] * Math.min(1, hsv[2] * 1.4);
      if (score > bestScore) { bestScore = score; best = p; }
    }
    if (!n) return [68, 68, 68];
    if (bestScore < 0.25) {   // nearly monochrome icon (e.g. white): its average, lifted
      var avg = rgbToHsv([sum[0] / n, sum[1] / n, sum[2] / n]);
      avg[2] = Math.max(avg[2], 0.55);
      return hsvToRgb(avg);
    }
    var h = rgbToHsv(best);
    h[1] = Math.min(1, h[1] * 1.1);
    h[2] = Math.max(0.5, h[2]);
    return hsvToRgb(h);
  }

  function parseColor(hex) {
    var m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return null;
    var v = parseInt(m[1], 16);
    return [v >> 16 & 255, v >> 8 & 255, v & 255];
  }

  function rgbToHsv(c) {
    var r = c[0] / 255, g = c[1] / 255, b = c[2] / 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min, h = 0;
    if (d) {
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
      if (h < 0) h += 360;
    }
    return [h, max ? d / max : 0, max];
  }

  function hsvToRgb(hsv) {
    var h = hsv[0], s = hsv[1], v = hsv[2];
    var c = v * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = v - c, rgb;
    if (h < 60) rgb = [c, x, 0];
    else if (h < 120) rgb = [x, c, 0];
    else if (h < 180) rgb = [0, c, x];
    else if (h < 240) rgb = [0, x, c];
    else if (h < 300) rgb = [x, 0, c];
    else rgb = [c, 0, x];
    return rgb.map(function (k) { return Math.round((k + m) * 255); });
  }

  // ---- focus & glass -------------------------------------------------------------------------

  function focusTile(i) {
    if (!items.length) return;
    i = Math.max(0, Math.min(i, items.length - 1));
    setZone('grid');
    if (items[focused]) items[focused].el.classList.remove('focused');
    focused = i;
    items[i].el.classList.add('focused');

    var top = tileTop(i), row = rowOf(i);
    if (row === 0) {
      offset = 0;
    } else {
      // Scroll just enough so the whole glass and the name below the tile are visible.
      if (top - offset + TILE_H + 70 > VIEW_BOTTOM) offset = top + TILE_H + 70 - VIEW_BOTTOM;
      if (top - offset - 24 < VIEW_TOP) offset = top - 24 - VIEW_TOP;
    }
    stage.style.transform = 'translateY(' + (-offset) + 'px)';
    // Keep the header until the content (the dock band is topmost) would run into it. Its layout box
    // (which ignores the hide slide) never changes: measured once, not with a forced layout per move.
    if (headerBottom === null) {
      var header = document.querySelector('header');
      headerBottom = header.offsetTop + header.offsetHeight;
    }
    document.body.classList.toggle('scrolled', DOCK_TOP - 28 - offset < headerBottom + 24);

    var w = TILE_W * FOCUS_SCALE + 2 * GLASS_PAD, h = TILE_H * FOCUS_SCALE + 2 * GLASS_PAD;
    var x = tileLeft(i) + TILE_W / 2 - w / 2, y = top + TILE_H / 2 - h / 2;
    glass.style.width = w + 'px';
    glass.style.height = h + 'px';
    glass.style.transform = 'translate(' + x + 'px,' + y + 'px)';
    if (!glassShown) {
      // First show: jump there without the spring, then fade in.
      glass.style.transition = 'none';
      glass.offsetWidth;   // flush the jump before restoring the transition
      glass.style.transition = '';
      glass.style.opacity = '1';
      glassShown = true;
    }

    if (row === 0) showHero(items[i]);
    else hideHero();
    setAmbient(items[i].color);   // the glow follows the focused tile in every row
  }

  function hideGlass() {
    glassShown = false;
    glass.style.opacity = '0';
  }

  function showHero(item) {
    var label = item.app.title;
    hero.style.top = (DOCK_TOP - 28 - 52 - 96) + 'px';
    if (!heroShown) {
      hero.textContent = label;
      hero.style.transform = 'none';
      hero.style.opacity = '1';
      heroShown = true;
    } else if (hero.textContent !== label) {
      hero.style.opacity = '0';
      hero.style.transform = 'translateX(-24px)';
      clearTimeout(hero.swap);
      hero.swap = setTimeout(function () {
        hero.textContent = label;
        hero.style.transition = 'none';
        hero.style.transform = 'translateX(24px)';
        hero.offsetWidth;
        hero.style.transition = '';
        hero.style.transform = 'none';
        hero.style.opacity = '1';
      }, 120);
    }
    setAmbient(item.color);
  }

  function hideHero() {
    if (!heroShown) return;
    heroShown = false;
    hero.style.opacity = '0';
  }

  /** Crossfades the glow to a new colour by swapping between two layers. */
  function setAmbient(color) {
    if (!color) return;
    var key = color.join(',');
    if (key === ambientColor) return;
    ambientColor = key;
    var back = ambients[1 - ambientFront];
    back.style.background = 'radial-gradient(circle 297.5px at 32% 42%, rgba(' + key + ',0.36) 0%, rgba(' +
      key + ',0.15) 50%, rgba(' + key + ',0) 100%)';
    back.style.opacity = '1';
    ambients[ambientFront].style.opacity = '0';
    ambientFront = 1 - ambientFront;
  }

  function focusPill(i) {
    setZone('top');
    document.body.classList.remove('scrolled');
    pills[pillFocus].classList.remove('focused');
    pillFocus = Math.max(0, Math.min(i, pills.length - 1));
    pills[pillFocus].classList.add('focused');
  }

  function setZone(z) {
    if (zone === z) return;
    if (zone === 'top') pills[pillFocus].classList.remove('focused');
    if (zone === 'grid') {
      if (items[focused]) items[focused].el.classList.remove('focused');
      hideGlass();
    }
    zone = z;
  }

  /** An element's box in page (1920x1080) pixels: getBoundingClientRect measures zoomed pixels. */
  function pageRect(el) {
    var r = el.getBoundingClientRect();
    return { left: r.left / SCALE, top: r.top / SCALE, width: r.width / SCALE, bottom: r.bottom / SCALE };
  }

  /** The pill straight above a dock tile, by horizontal distance. */
  function pillAbove(i) {
    var cx = tileLeft(i) + TILE_W / 2, best = 0, bestD = Infinity;
    pills.forEach(function (p, k) {
      var r = pageRect(p);
      var d = Math.abs(r.left + r.width / 2 - cx);
      if (d < bestD) { bestD = d; best = k; }
    });
    return best;
  }

  // ---- top bar -------------------------------------------------------------------------------

  function updateClock() {
    var now = new Date(), h = now.getHours();
    var greetings = tr.greetings || [];
    for (var k = 0; k < greetings.length; k++) {
      if (h < greetings[k][0]) { $('greeting').textContent = greetings[k][1]; break; }
    }
    var m = now.getMinutes();
    $('clock').textContent = h + ':' + (m < 10 ? '0' : '') + m;
    var days = tr.days || [];
    var months = tr.months || [];
    var dayStr = days[now.getDay()] || '';
    var monthStr = months[now.getMonth()] || '';
    $('date').textContent = dayStr + (dayStr ? ', ' : '') + now.getDate() + ' ' + monthStr;
  }

  var lastNetState = null;

  function updateNetworkLabel() {
    if (!lastNetState) return;
    var text = tr.wifi || 'Wi-Fi';
    if (lastNetState.wired && lastNetState.wired.state === 'connected') text = tr.ethernet || 'Ethernet';
    else if (lastNetState.wifi && lastNetState.wifi.state === 'connected') text = tr.wifi || 'Wi-Fi';
    else if (lastNetState.isInternetConnectionAvailable === false) text = tr.offline || 'Offline';
    $('wifiLabel').textContent = text;
  }

  /** Shows the connection type (not the network name: a long one pushes the LG button off screen). */
  function watchNetwork() {
    luna('luna://com.palm.connectionmanager/getStatus', { subscribe: true }, function (res) {
      if (res.returnValue === false && !res.wifi && !res.wired) return;
      lastNetState = res;
      updateNetworkLabel();
    });
  }

  function activatePill(i) {
    if (i === 0) showInputs();
    else if (i === 1) launch('com.palm.app.settings', 'Settings', { target: 'network' });
    else if (i === 2) launch('com.palm.app.settings', 'Settings');
    else openLgHome();
  }

  /** The way back to LG's home: the Home watcher lets it through. Works too if the watcher is down. */
  function openLgHome() {
    luna('luna://com.gathin.tvhome.service/allowLgHome', {}, function () {
      launch('com.webos.app.home', 'LG Home');
    });
  }

  // ---- inputs dropdown -----------------------------------------------------------------------

  function showInputs() {
    panel.innerHTML = '';
    inputRows = [];
    var inputs = (window.TV_APPS && TV_APPS.inputs) || [];
    inputs.forEach(function (inp) { addInputRow(ICON_INPUT, inp.label, inp.appId); });
    if (CONFIG.liveTvApp) {
      if (inputRows.length) panel.appendChild(Object.assign(document.createElement('div'), { className: 'separator' }));
      addInputRow(ICON_LIVETV, tr.liveTv || 'Live TV', CONFIG.liveTvApp);
    }
    if (!inputRows.length) { toast(tr.noInputs || 'No inputs found'); return; }

    // Hang right below the Inputs pill, at least as wide as it.
    var r = pageRect(pills[0]);
    panel.style.left = r.left + 'px';
    panel.style.top = (r.bottom + 20) + 'px';
    panel.style.minWidth = Math.max(r.width, 300) + 'px';
    panel.classList.remove('hidden');
    pills[pillFocus].classList.remove('focused');
    zone = 'inputs';
    focusInput(0);
  }

  function addInputRow(icon, label, appId) {
    var row = document.createElement('div');
    row.className = 'inputRow';
    row.innerHTML = '<svg viewBox="0 0 24 24"><path d="' + icon + '"/></svg>';
    row.appendChild(document.createTextNode(label));
    var idx = inputRows.length;
    row.addEventListener('mouseover', function () { focusInput(idx); });
    row.addEventListener('click', function () { hideInputs(); launch(appId, label); });
    row.appId = appId;
    row.label = label;
    inputRows.push(row);
    panel.appendChild(row);
  }

  function focusInput(i) {
    if (inputRows[inputFocus]) inputRows[inputFocus].classList.remove('focused');
    inputFocus = Math.max(0, Math.min(i, inputRows.length - 1));
    inputRows[inputFocus].classList.add('focused');
  }

  function hideInputs() {
    panel.classList.add('hidden');
    zone = 'none';
    focusPill(0);
  }

  // ---- rearranging ---------------------------------------------------------------------------

  /** Hold OK on a tile: it wiggles, the arrows move it, OK places it, Back puts everything back. */
  function startEdit() {
    var it = items[focused];
    if (!it) return;
    editing = { item: it, snapshot: items.slice() };
    it.el.classList.add('moving');
    document.body.classList.add('editing');
    sound('lift');
    toast(tr.reorderHelp || 'Arrows to move  ·  OK to place  ·  Back to cancel');
  }

  function moveTo(to) {
    if (to < 0 || to >= items.length || to === focused) return;
    items.splice(to, 0, items.splice(focused, 1)[0]);
    focused = to;
    layout();
    focusTile(to);
  }

  function finishEdit(keep) {
    var it = editing.item;
    if (!keep) {
      items = editing.snapshot;
      layout();
    }
    editing = null;
    it.el.classList.remove('moving');
    document.body.classList.remove('editing');
    if (keep) saveOrder();
    sound(keep ? 'drop' : 'back');
    focused = items.indexOf(it);
    focusTile(focused);
    if (pendingApps) {
      setApps(pendingApps);
      pendingApps = null;
    }
  }

  // ---- keys ----------------------------------------------------------------------------------

  var LONG_PRESS_MS = 600;
  var okDown = false, okTimer = null;

  // On tiles OK acts on release, so a held OK can start rearranging instead of opening the app.
  document.addEventListener('keyup', function (e) {
    if (e.keyCode !== KEY.OK) return;
    okDown = false;
    if (!okTimer) return;
    clearTimeout(okTimer);
    okTimer = null;
    var it = items[focused];
    if (zone === 'grid' && it && !editing) { sound('select'); launch(it.app.id, it.app.title); }
  });

  /** Where focus is: an arrow that leaves this unchanged hit an edge. */
  function focusState() { return zone + focused + '/' + pillFocus + '/' + inputFocus; }

  document.addEventListener('keydown', function (e) {
    var k = e.keyCode;
    if (k === KEY.OK && okDown) { e.preventDefault(); return; }   // key repeat while held
    if (k === KEY.OK) okDown = true;
    var before = focusState(), arrow = k >= KEY.LEFT && k <= KEY.DOWN, inputsOpen = zone === 'inputs';
    if (editing) {
      if (k === KEY.LEFT) moveTo(focused - 1);
      else if (k === KEY.RIGHT) moveTo(focused + 1);
      else if (k === KEY.UP) moveTo(focused - COLUMNS);
      else if (k === KEY.DOWN) moveTo(Math.min(focused + COLUMNS, items.length - 1));
      else if (k === KEY.OK) finishEdit(true);
      else if (k === KEY.BACK || k === KEY.ESC) finishEdit(false);
      else return;
    } else if (zone === 'inputs') {
      if (k === KEY.UP) focusInput(inputFocus - 1);
      else if (k === KEY.DOWN) focusInput(inputFocus + 1);
      else if (k === KEY.OK) { var row = inputRows[inputFocus]; hideInputs(); sound('select'); launch(row.appId, row.label); }
      else if (k === KEY.BACK || k === KEY.ESC || k === KEY.LEFT || k === KEY.RIGHT) hideInputs();
      else return;
    } else if (zone === 'top') {
      if (k === KEY.LEFT) focusPill(pillFocus - 1);
      else if (k === KEY.RIGHT) focusPill(pillFocus + 1);
      else if (k === KEY.DOWN) focusTile(rowOf(focused) === 0 ? focused : 0);
      else if (k === KEY.OK) { sound('select'); activatePill(pillFocus); }
      else if (k === KEY.BACK || k === KEY.ESC) { sound('back'); dismissOverlay(); }
      else return;
    } else {
      var col = focused % COLUMNS, last = items.length - 1;
      if (k === KEY.LEFT) { if (col > 0) focusTile(focused - 1); }
      else if (k === KEY.RIGHT) { if (col < COLUMNS - 1 && focused < last) focusTile(focused + 1); }
      else if (k === KEY.UP) {
        if (rowOf(focused) === 0) focusPill(pillAbove(focused));
        else focusTile(focused - COLUMNS);
      } else if (k === KEY.DOWN) {
        if (rowOf(focused) < rowOf(last)) focusTile(Math.min(focused + COLUMNS, last));
      } else if (k === KEY.OK) {
        okTimer = setTimeout(function () { okTimer = null; startEdit(); }, LONG_PRESS_MS);
      } else if (k === KEY.BACK || k === KEY.ESC) { sound('back'); dismissOverlay(); }
      else return;
    }
    if (inputsOpen && zone !== 'inputs' && k !== KEY.OK) sound('back');   // closed the Inputs menu
    else if (arrow) sound(focusState() === before ? 'bump' : 'move');
    e.preventDefault();
  });

  pills.forEach(function (p, i) {
    p.addEventListener('mouseover', function () { if (zone !== 'inputs') focusPill(i); });
    p.addEventListener('click', function () { activatePill(i); });
  });

  // ---- lifecycle -----------------------------------------------------------------------------

  /** Starts the on-TV Home watcher (service/), in case webOS stopped it since. */
  function startHomeWatch() {
    luna('luna://com.gathin.tvhome.service/start', {});
  }

  /** Back from another app (or opened again from the shortcut): replay the entrance, keep the tile. */
  var lastResume = 0;

  function resume() {
    // Coming back, webOS sends visibilitychange then webOSRelaunch ~25 ms apart: act once.
    var now = Date.now();
    if (now - lastResume < 500) return;
    lastResume = now;
    startHomeWatch();
    watchApps();
    if (editing) finishEdit(false);
    updateClock();
    if (zone === 'inputs') panel.classList.add('hidden');
    pills.forEach(function (p) { p.classList.remove('focused'); });
    zone = 'none';
    animateIn();
    focusTile(focused);
  }

  var clockTimer = null;

  /** Behind another app: no clock ticks, and the sound engine's audio context is closed. */
  function pause() {
    clearInterval(clockTimer);
    clockTimer = null;
    soundsOff();
  }

  function unpause() {
    soundsOn();
    if (!clockTimer) clockTimer = setInterval(updateClock, 10000);
  }

  document.addEventListener('webOSRelaunch', resume);
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) pause();
    else { unpause(); resume(); }
  });

  applyTitles();
  build();
  initLocale();
  updateClock();
  unpause();
  watchNetwork();
  startHomeWatch();
  watchApps();
  animateIn();
  zone = 'none';
  focusTile(0);
})();
