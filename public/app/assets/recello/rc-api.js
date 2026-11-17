/* Recello: the page's data layer, on the ORIGINAL backend routes.
 *
 * The page (index.html) asks for things by name: catalog, otp_send, otp_verify, prices, unlock, create_order, track, my_orders,
 * request, waitlist_join. This file answers each one by calling the routes that already exist on the server:
 *
 *   catalog        GET  /api/product/catalog (one read-only call, all models + storage options)
 *                  GET  /api/sell/questions/:modelSlug (once per device type), GET /api/faqs/active, GET /api/system/get_brands/:cat
 *   otp_send       POST /api/auth/request_otp   (resend: /api/auth/resend_otp)
 *   otp_verify     POST /api/auth/verify_otp    -> access token (+ refresh cookie); POST /api/auth/refresh when it runs out
 *   prices/unlock  GET  /api/product/:brand/:model (fresh storage prices); the offer is worked out here with the same rule the
 *                  server uses when it saves the lead: base price minus the % of each answer
 *   create_order   GET/PUT /api/users/me/profile, GET/POST /api/users/addresses, POST /api/sell/listings, POST /api/sell/pickup
 *   my_orders/track GET /api/sell/orders
 *   request        POST /api/contact_us (call-backs, "my model is missing", bulk, ...), POST /api/sell/images (screenshots),
 *                  POST /api/auth/account_delete
 *
 * Nothing here talks to /api/web. The server address comes from window.RC_API_ORIGIN (environment.apiUrl).
 * Business settings that no route provides (cities, pin codes, hours, repair price list) are in assets/recello/site-config.json.
 */
(function () {
  'use strict';

  var ORIGIN = String(window.RC_API_ORIGIN || '').replace(/\/+$/, '');
  var API = ORIGIN + '/api';
  var CATS = ['phone', 'tablet', 'laptop', 'watch'];
  var netFail = false;
  var NET = 'Could not reach Recello. Check your connection and try again.';

  var fail = function (message, status, extra) { return Object.assign({ message: message, status: status }, extra || {}); };
  var str = function (v, max) { return String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max || 200); };
  var cleanPhone = function (v) { return String(v || '').replace(/\D/g, '').replace(/^(91|0)(?=\d{10}$)/, ''); };
  var okPhone = function (p) { return /^[6-9]\d{9}$/.test(p); };
  var IST = 19800e3;
  var istDate = function (ms) { return new Date((ms == null ? Date.now() : ms) + IST).toISOString().slice(0, 10); };
  var LS = {
    get: function (k, d) { try { var v = localStorage.getItem('recello:rc:' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem('recello:rc:' + k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
    del: function (k) { try { localStorage.removeItem('recello:rc:' + k); } catch (e) { /* ignore */ } }
  };

  // ------------------------------------------------------------------ session (access token + refresh cookie)
  var sess = LS.get('session', null) || {};   // { access, exp (ms), phone }
  var saveSess = function () { LS.set('session', sess); };
  var dropSess = function () { sess = {}; LS.del('session'); };
  function jwtExp(t) {
    try { var p = JSON.parse(atob(String(t).split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); return p.exp ? p.exp * 1000 : 0; } catch (e) { return 0; }
  }
  var refreshing = null;
  function refresh() {
    if (!refreshing) {
      refreshing = fetch(API + '/auth/refresh', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: '{}' })
        .then(function (r) { if (!r.ok) throw new Error('refresh'); return r.json(); })
        .then(function (j) { sess.access = j.accessToken; sess.exp = jwtExp(j.accessToken); saveSess(); return sess.access; })
        .catch(function () { dropSess(); return null; })
        .then(function (t) { refreshing = null; return t; });
    }
    return refreshing;
  }
  function accessToken() {
    if (!sess.access) return Promise.resolve(null);
    if (sess.exp && Date.now() > sess.exp - 10000) return refresh();
    return Promise.resolve(sess.access);
  }
  var AGAIN = 'Please verify your mobile number again.';

  // ------------------------------------------------------------------ http
  function httpError(r, j) {
    var msg = (j && (j.message || j.error)) || 'Something went wrong. Please try again.';
    var e = fail(msg, r.status);
    if (r.status === 429) {
      var m = /(\d+)\s*minute/i.exec(msg);
      e.retry = m ? +m[1] * 60 : 60;
    }
    return e;
  }
  async function http(method, path, body, o) {
    o = o || {};
    var send = async function (tok) {
      var h = {};
      if (body !== undefined && !o.form) h['Content-Type'] = 'application/json';
      if (tok) h.Authorization = 'Bearer ' + tok;
      return fetch(API + path, { method: method, headers: h, credentials: 'include', body: body === undefined ? undefined : (o.form ? body : JSON.stringify(body)) });
    };
    var tok = null;
    if (o.auth) { tok = await accessToken(); if (!tok) throw fail(AGAIN, 401); }
    var r;
    try { r = await send(tok); } catch (e) { netFail = true; log('FAILED ' + method + ' ' + API + path + ' (cannot reach the server)'); throw fail(NET); }
    if (r.status === 401 && o.auth) {
      var t2 = await refresh();
      if (!t2) throw fail(AGAIN, 401);
      try { r = await send(t2); } catch (e) { throw fail(NET); }
    }
    var j = null;
    try { j = await r.json(); } catch (e) { /* empty body */ }
    if (!r.ok) throw httpError(r, j);
    return j;
  }
  var needSession = function () { if (!sess.access) throw fail(AGAIN, 401); };

  // ------------------------------------------------------------------ site config (what no route provides)
  var CFG = null;
  async function config() {
    if (CFG) return CFG;
    try { var r = await fetch('assets/recello/site-config.json'); CFG = r.ok ? await r.json() : {}; } catch (e) { CFG = {}; }
    CFG.business = CFG.business || {}; CFG.growth = CFG.growth || {}; CFG.pricing = CFG.pricing || {}; CFG.repair = CFG.repair || {};
    CFG.catmap = CFG.catmap || {}; CFG.site = CFG.site || {};
    return CFG;
  }
  function pageCat(slug) {
    var s = String(slug || '').toLowerCase(), cm = (CFG && CFG.catmap) || {};
    for (var i = 0; i < CATS.length; i++) if ((cm[CATS[i]] || []).map(function (x) { return String(x).toLowerCase(); }).indexOf(s) >= 0) return CATS[i];
    if (/mobile|phone/.test(s)) return 'phone';
    if (/tablet|ipad/.test(s)) return 'tablet';
    if (/laptop|macbook|notebook/.test(s)) return 'laptop';
    if (/watch/.test(s)) return 'watch';
    return null;
  }
  // an image from your admin panel (stored as a file name) -> the page's relative path; the shell points it at the server
  function uploadPath(url) {
    if (!url) return '';
    var f = String(url).replace(/^\/+/, '').replace(/^uploads\//, '');
    if (/^https?:/i.test(f) || f.indexOf('/') >= 0 || !f) return '';
    return 'uploads/' + encodeURIComponent(f).replace(/%2E/g, '.');
  }
  var photoIdx = null;
  async function builtinPhoto(slug) {
    if (photoIdx === null) {
      try { var r = await fetch('photos/models/index.json'); photoIdx = r.ok ? await r.json() : {}; } catch (e) { photoIdx = {}; }
    }
    return photoIdx[slug] ? 'photos/models/' + photoIdx[slug] : '';
  }

  // ------------------------------------------------------------------ catalog + questions
  var CAT = null;        // { models: [...], byId: {} }
  var QBY = {};          // page cat -> published questions, with the % cut of each option kept in DED
  var DED = {};          // qid -> { optionId: percent }
  var TOP = {};          // model id -> highest storage price (shown after the OTP)
  var catAt = 0;

  function mapQuestions(cat, rows) {
    var entry = Array.isArray(rows) ? rows[0] : null;
    var all = ((entry && entry.questions) || []).filter(function (q) { return String(q.context_label || '').toLowerCase() !== 'inspection'; });
    var byId = {};
    all.forEach(function (q) { byId[q.id] = q; });
    var when = {};   // child id -> [{ q: parent id, opts: [option ids that reveal it] }]
    all.forEach(function (p) {
      (p.options || []).forEach(function (o) {
        (o.show || []).forEach(function (cid) {
          if (!byId[cid]) return;
          var l = when[cid] || (when[cid] = []), c = null, k;
          for (k = 0; k < l.length; k++) if (l[k].q === String(p.id)) c = l[k];
          if (!c) { c = { q: String(p.id), opts: [] }; l.push(c); }
          c.opts.push(String(o.id));
        });
      });
    });
    var pub = function (q) {
      DED[q.id] = {};
      var o = {
        id: String(q.id), title: String(q.question || ''), help: '', type: /multi/i.test(q.que_type || '') ? 'multi' : 'single',
        cats: [cat], brands: [], models: [],
        options: (q.options || []).map(function (x) {
          DED[q.id][x.id] = +x.deduction || 0;
          return { id: String(x.id), label: String(x.text || ''), img: uploadPath(x.option_image_url) };
        }).filter(function (x) { return x.label; })
      };
      if (when[q.id]) o.when = when[q.id];
      return o;
    };
    // roots in the order the server sent them; a follow-up goes straight after the question that reveals it
    var out = [], put = {};
    var add = function (q) {
      if (put[q.id]) return;
      put[q.id] = 1; out.push(pub(q));
      all.forEach(function (c) { if (when[c.id] && when[c.id][0].q === String(q.id)) add(c); });
    };
    all.filter(function (q) { return !when[q.id]; }).forEach(add);
    all.forEach(add);
    return out.filter(function (q) { return q.options.length; });
  }


  // ---- the model list, built only from the routes your old app already used:
  //   categories -> brands (get_brands/:cat) -> series (product/brand/:b/series) -> models of a series (product/brand/:b/:s/models,
  //   get_models/:cat/:b/:s to know the category) -> storage + price of each model (product/:brand/:model).
  // If the server also has GET /api/product/catalog (CHANGES.md) that one call is used instead: much faster.
  var log = function (m) { try { console.info('[Recello]', m); } catch (e) { /* no console */ } };
  var arr = function (x) { return Array.isArray(x) ? x : (x && Array.isArray(x.data) ? x.data : []); };
  async function inPool(items, n, fn) {
    var i = 0, out = new Array(items.length);
    await Promise.all(Array.apply(null, Array(Math.min(n, items.length))).map(async function () {
      while (i < items.length) { var k = i++; out[k] = await fn(items[k], k); }
    }));
    return out;
  }
  async function rowsFromOldRoutes(cfg) {
    var found = [], seenCat = {}, list = [];
    var fromServer = {};
    try { arr(await http('GET', '/system/get_categories/true')).forEach(function (c) { var pc = c && c.slug && pageCat(c.slug); if (pc) (fromServer[pc] = fromServer[pc] || []).push(c.slug); }); } catch (e) { /* the usual slugs below cover it */ }
    // per device type: the slugs your server named, then the usual ones, until one has brands
    await Promise.all(CATS.map(async function (pc) {
      var cands = (fromServer[pc] || []).concat(cfg.catmap[pc] || []);
      for (var i = 0; i < cands.length && !netFail; i++) {
        try {
          var br = arr(await http('GET', '/system/get_brands/' + encodeURIComponent(cands[i]))).filter(function (x) { return x && x.slug && x.status !== false; });
          if (br.length) { found.push({ slug: cands[i], pc: pc, brands: br }); return; }
        } catch (e) { /* not a category on this server */ }
      }
    }));
    found.forEach(function (f) { if (!seenCat[f.pc]) { seenCat[f.pc] = 1; list.push({ cat: f.slug, pc: f.pc, brands: f.brands }); } });
    log('categories with brands: ' + (list.map(function (l) { return l.cat + ' (' + l.brands.length + ' brands)'; }).join(', ') || 'none'));
    var models = [], seriesMemo = {};
    for (var a = 0; a < list.length; a++) {
      var L = list[a];
      await inPool(L.brands, 4, async function (b) {
        var series = await (seriesMemo[b.slug] = seriesMemo[b.slug] || http('GET', '/product/brand/' + encodeURIComponent(b.slug) + '/series').then(arr, function () { return []; }));
        await inPool(series, 4, async function (se) {
          var pair = await Promise.all([
            http('GET', '/product/brand/' + encodeURIComponent(b.slug) + '/' + encodeURIComponent(se.slug) + '/models').catch(function () { return []; }),
            http('GET', '/system/get_models/' + encodeURIComponent(L.cat) + '/' + encodeURIComponent(b.slug) + '/' + encodeURIComponent(se.slug)).catch(function () { return null; })
          ]);
          var inCat = pair[1] === null ? null : {}; if (pair[1]) arr(pair[1]).forEach(function (m) { inCat[m.slug] = 1; });
          arr(pair[0]).forEach(function (m) {
            if (!m || !m.slug || (inCat && !inCat[m.slug])) return;
            models.push({ slug: m.slug, name: m.name, brand_slug: b.slug, brand: b.name, series: se.name, category_slug: L.cat, image_url: m.url || null });
          });
        });
      });
    }
    log('models listed: ' + models.length + ', loading storage options and prices');
    var rows = [];
    await inPool(models, 8, async function (m) {
      try {
        var d = await http('GET', '/product/' + encodeURIComponent(m.brand_slug) + '/' + encodeURIComponent(m.slug));
        var src = Array.isArray(d) ? d[0] : d;
        var v = ((src && src.variants) || []).map(function (x) { return { id: x.id, name: x.name, base_price: x.base_price }; });
        if (v.length) { m.variants = v; rows.push(m); }
      } catch (e) { /* one model failing must not hide the rest */ }
    });
    return rows;
  }
  async function fetchRows(cfg) {
    var fast = null; netFail = false;
    try { fast = await http('GET', '/product/catalog'); } catch (e) { /* the server does not have that route: use the old routes */ }
    if (fast && Array.isArray(fast.models) && fast.models.length) { log('catalog: one call (/api/product/catalog), ' + fast.models.length + ' models'); return fast.models; }
    var cached = LS.get('rows', null);
    if (cached && Date.now() - cached.at < 20 * 60000 && cached.origin === ORIGIN && cached.rows.length) { log('catalog: from this phone (under 20 minutes old)'); return cached.rows; }
    var rows = await rowsFromOldRoutes(cfg);
    if (!rows.length && netFail) throw fail('Cannot reach ' + (ORIGIN || 'the server') + '. Check the address in environment.ts and that the backend is running.');
    if (!rows.length) throw fail('The server returned no phones. Check that ' + (ORIGIN || 'this site') + ' is the Recello API and its catalogue is filled.');
    LS.set('rows', { at: Date.now(), origin: ORIGIN, rows: rows });
    log('catalog: built from the old routes, ' + rows.length + ' models');
    return rows;
  }

  async function loadCatalog() {
    if (CAT && Date.now() - catAt < 60000) return CAT;
    var cfg = await config();
    var res = await Promise.all([
      fetchRows(cfg),
      http('GET', '/faqs/active').catch(function () { return []; })
    ]);
    var rows = res[0];
    var faqs = Array.isArray(res[1]) ? res[1] : [];
    // one request per device type for its questions: every model of a type is asked the same ones
    var firstOf = {};
    rows.forEach(function (r) { var c = pageCat(r.category_slug); if (c && !firstOf[c]) firstOf[c] = r; });
    var present = Object.keys(firstOf);
    QBY = {}; DED = {};
    await Promise.all(present.map(function (c) {
      return http('GET', '/sell/questions/' + encodeURIComponent(firstOf[c].slug))
        .then(function (q) { QBY[c] = mapQuestions(c, q); })
        .catch(function () { QBY[c] = []; });
    }));
    var models = [], byId = {};
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i], c = pageCat(r.category_slug);
      if (!c || !(QBY[c] || []).length || !r.slug) continue;   // a device type with no questions cannot be priced yet
      var cfgs = (r.variants || []).map(function (v) { return { id: v.id, name: String(v.name), price: Math.round(+v.base_price) }; }).filter(function (v) { return v.price > 0; });
      if (!cfgs.length) continue;
      var m = {
        id: r.slug, cat: c, brand: r.brand, name: r.name, series: r.series || '', brand_slug: r.brand_slug, category_slug: r.category_slug,
        cfgs: cfgs, img: uploadPath(r.image_url) || await builtinPhoto(r.slug)
      };
      models.push(m); byId[m.id] = m; TOP[m.id] = Math.max.apply(null, cfgs.map(function (x) { return x.price; }));
    }
    // brand tiles: logos from your brand list (phones)
    var tiles = [];
    try {
      var pr = firstOf.phone;
      if (pr) {
        var bl = await http('GET', '/system/get_brands/' + encodeURIComponent(pr.category_slug));
        tiles = (Array.isArray(bl) ? bl : []).filter(function (b) { return b.status !== false; }).map(function (b) {
          var logo = uploadPath(b.url); return { brand: b.name, logo: /^uploads\/[\w.%-]+$/.test(logo) ? logo : '' };
        });
      }
    } catch (e) { /* tiles are optional */ }
    var have = {}; models.forEach(function (m) { have[m.cat] = 1; });
    var site = Object.assign({}, cfg.site);
    site.cats = Object.assign({ tablet: have.tablet ? 'on' : 'soon', laptop: have.laptop ? 'on' : 'soon', watch: have.watch ? 'on' : 'soon' }, site.cats || {});
    if (faqs.length && !site.faq) site.faq = faqs.map(function (f) { return { q: String(f.question || ''), a: String(f.answer || '') }; }).filter(function (f) { return f.q && f.a; });
    if (tiles.length && !site.brandTiles) site.brandTiles = tiles;
    CAT = { models: models, byId: byId, site: site };
    catAt = Date.now();
    return CAT;
  }

  async function A_catalog() {
    var cfg = await config(), cat = await loadCatalog();
    var gate = cfg.business.priceGate !== false;
    return {
      models: cat.models.map(function (m) {
        var top = TOP[m.id];
        return {
          id: m.id, cat: m.cat, brand: m.brand, name: m.name, series: m.series,
          base: gate && !sess.access ? 0 : top,
          variants: m.cfgs.map(function (c) { return [c.name, +(c.price / top).toFixed(6)]; }),
          img: m.img, colors: []
        };
      }),
      questions: [].concat.apply([], CATS.map(function (c) { return QBY[c] || []; })).map(function (q) {
        return { id: q.id, title: q.title, help: q.help, type: q.type, cats: q.cats, brands: [], models: [], when: q.when, options: q.options.map(function (o) { return { id: o.id, label: o.label, img: o.img }; }) };
      }),
      // questions are per device type, so the same id can appear once per type: ids are unique in the database, so no clash
      pricing: { verified: 1, floor: cfg.pricing.floor || {} },
      business: cfg.business, repair: cfg.repair, growth: cfg.growth, site: cat.site, feed: [],
      price_gate: gate, ai: false
    };
  }

  // ------------------------------------------------------------------ sign-in
  var OTP = { id: '', phone: '', at: 0 };
  async function A_otp_send(b) {
    var phone = cleanPhone(b.phone);
    if (!okPhone(phone)) throw fail('Enter a 10-digit Indian mobile number.', 400);
    var r = null;
    if (OTP.id && OTP.phone === phone && Date.now() - OTP.at < 5 * 60000) {
      try { r = await http('POST', '/auth/resend_otp', { id: OTP.id, phone: phone }); } catch (e) { r = null; }
    }
    if (!r) r = await http('POST', '/auth/request_otp', { phone: phone });
    OTP = { id: r.id, phone: phone, at: Date.now() };
    return { ok: true, resend_in: 30 };
  }
  async function A_otp_verify(b) {
    var phone = cleanPhone(b.phone), code = String(b.code || '').replace(/\D/g, '');
    var bad = "That code doesn't match. Check the message and try again.";
    if (!OTP.id || OTP.phone !== phone) throw fail('That code has expired. Ask for a new one.', 400);
    if (code.length !== 6) throw fail(bad, 400);
    var r;
    try {
      // a number we have not seen is registered by this call; the name is replaced with the real one when the pickup is booked
      r = await http('POST', '/auth/verify_otp', { id: OTP.id, otp: code, name: 'Customer' });
    } catch (e) {
      if (e.status === 401 || e.status === 404) throw fail(bad, 400);
      throw e;
    }
    sess = { access: r.accessToken, exp: jwtExp(r.accessToken), phone: phone, uid: r.user && r.user.id };
    saveSess(); OTP = { id: '', phone: '', at: 0 };
    return { ok: true, token: r.accessToken };
  }

  // ------------------------------------------------------------------ prices and the offer
  async function A_prices() {
    needSession();
    var bases = {};
    Object.keys(TOP).forEach(function (k) { bases[k] = TOP[k]; });
    return { ok: true, bases: bases };
  }

  function visibleQs(cat, ans) {
    var list = QBY[cat] || [], vis = {}, out = [];
    list.forEach(function (q) {
      var show = !q.when || q.when.some(function (c) { return vis[c.q] && (ans[c.q] || []).some(function (id) { return c.opts.indexOf(String(id)) >= 0; }); });
      if (show) { vis[q.id] = 1; out.push(q); }
    });
    return out;
  }
  // same rule the server applies when it saves the lead: base - sum(base x % of each picked option)
  function work(m, cfg, base, ans) {
    var qs = visibleQs(m.cat, ans || {}), cut = 0, picks = [], checks = [];
    for (var i = 0; i < qs.length; i++) {
      var q = qs[i], a = Array.isArray((ans || {})[q.id]) ? ans[q.id].map(String) : [];
      var ok = a.filter(function (id) { return q.options.some(function (o) { return o.id === id; }); });
      if (q.type === 'single') ok = ok.slice(0, 1);
      if (!ok.length) throw fail('Answer all the questions to see your price.', 400);
      ok.forEach(function (id) { cut += base * (DED[q.id][id] || 0) / 100; });
      picks.push({ question_id: +q.id, options: ok.map(Number) });
      checks.push({ q: q.title, a: q.options.filter(function (o) { return ok.indexOf(o.id) >= 0; }).map(function (o) { return o.label; }) });
    }
    return { price: Math.max(0, Math.round(base - cut)), answers: picks, checks: checks };
  }
  async function modelFor(id, vi) {
    var cat = await loadCatalog(), m = cat.byId[String(id)];
    if (!m) throw fail('Pick your phone and storage.', 400);
    var cfg = m.cfgs[Math.max(0, parseInt(vi, 10) || 0)] || m.cfgs[0];
    var base = cfg.price;
    try {   // today's price from the server, in case it changed since the page loaded
      var fresh = await http('GET', '/product/' + encodeURIComponent(m.brand_slug) + '/' + encodeURIComponent(m.id));
      var row = Array.isArray(fresh) ? fresh[0] : fresh;
      var f = row && (row.variants || []).filter(function (v) { return String(v.id) === String(cfg.id); })[0];
      if (f && +f.base_price > 0) base = Math.round(+f.base_price);
    } catch (e) { /* keep the price from the catalog */ }
    return { m: m, cfg: cfg, base: base };
  }
  // the offer stays the same (or goes up, never down) for 7 days on this device: kept on this phone
  function hold(key, price) {
    var all = LS.get('held', {}) || {}, now = Date.now(), h = all[key];
    if (h && h.until > now) return { price: Math.max(h.price, price), until: h.until };
    all[key] = { price: price, until: now + 7 * 864e5 };
    var ks = Object.keys(all); if (ks.length > 40) delete all[ks[0]];
    LS.set('held', all);
    return all[key];
  }
  async function A_unlock(b) {
    needSession();
    var x = await modelFor(b.model, b.vi), w = work(x.m, x.cfg, x.base, b.answers);
    var key = x.m.id + '|' + x.cfg.id + '|' + JSON.stringify(Object.keys(b.answers || {}).sort().map(function (k) { return [k, b.answers[k]]; }));
    var h = hold(key, w.price);
    return { ok: true, price: h.price, now: w.price, top: x.base, lock_until: istDate(h.until) };
  }
  async function A_lead_reason() { return { ok: true }; }

  // ------------------------------------------------------------------ booking
  function parseSlot(label) {
    var m = String(label || '').match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?\s*[–—-]\s*(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/i);
    if (!m) return null;
    var to24 = function (h, mer) { h = +h % 12; return mer.toUpperCase() === 'PM' ? h + 12 : h; };
    var endMer = m[6].toUpperCase(), startMer = (m[3] || endMer).toUpperCase();
    if (!m[3] && endMer === 'PM' && (+m[1] % 12) > (+m[4] % 12)) startMer = 'AM';
    var z = function (n) { return String(n).padStart(2, '0'); };
    return { start: z(to24(m[1], startMer)) + ':' + z(m[2] || 0), end: z(to24(m[4], endMer)) + ':' + z(m[5] || 0) };
  }
  var orderCode = function (id) { return 'SMK' + String(id).padStart(3, '0'); };
  var listingOf = function (code) { var d = String(code || '').replace(/\D/g, ''); return d ? +d : 0; };
  var ORD = LS.get('orders', {}) || {};    // order code -> what only this phone knows (storage, pickup time, answers)
  var saveOrd = function () { var ks = Object.keys(ORD); if (ks.length > 40) delete ORD[ks[0]]; LS.set('orders', ORD); };
  var LAST = null;                          // a listing created whose pickup failed: the next try reuses it

  async function A_create_order(b) {
    if (b.type === 'repair') return createRepair(b);
    if (b.type !== 'sell') throw fail('Something went wrong. Please try again.', 400);
    needSession();
    var cfg = await config(), biz = cfg.business;
    var name = str(b.name, 60), contact = cleanPhone(b.phone), pin = str(b.pincode, 6), addr = str(b.address, 300);
    var city = (biz.cities || []).indexOf(b.city) >= 0 ? b.city : biz.defaultCity;
    if (name.length < 2) throw fail('Enter your name.', 400);
    if (!okPhone(contact)) throw fail('Enter a 10-digit Indian mobile number.', 400);
    if (!/^\d{6}$/.test(pin)) throw fail('Enter your 6-digit pincode.', 400);
    if (addr.length < 6) throw fail('Enter your full address.', 400);
    if (!(biz.pins || []).some(function (p) { return pin.indexOf(String(p)) === 0; })) throw fail("We don't pick up in " + pin + ' yet. Call or WhatsApp us and we\'ll see what we can do.', 400);
    // when
    var rapid = b.slot_time === 'Rapid', today = istDate(), date = str(b.slot_date, 10), slot, slotLabel = str(b.slot_time, 40);
    if (rapid) {
      if (!(biz.rapid && biz.rapid.on)) throw fail('Rapid pickup is not available right now. Please pick a time slot.', 400);
      var hr = new Date(Date.now() + IST).getUTCHours();
      if (hr < biz.rapid.from || hr >= biz.rapid.to) throw fail('Rapid pickup just closed for today. Please pick a time slot.', 400);
      date = today;
      var t = function (ms) { return new Date(ms + IST).toISOString().slice(11, 16); };
      slot = { start: t(Date.now()), end: t(Date.now() + (biz.rapid.minutes || 90) * 60000) };
    } else {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < today || date > istDate(Date.now() + 30 * 864e5)) throw fail('Pick a pickup day.', 400);
      slot = parseSlot(slotLabel);
      if (!slot) throw fail('Pick a time slot.', 400);
    }
    var x = await modelFor(b.model, b.vi), w = work(x.m, x.cfg, x.base, b.answers);
    if (!(w.price > 0)) throw fail("We can't quote this combination online. Please request a call back.", 400);
    var key = x.m.id + '|' + x.cfg.id + '|' + JSON.stringify(w.answers);
    var offer = hold(x.m.id + '|' + x.cfg.id + '|' + JSON.stringify(Object.keys(b.answers || {}).sort().map(function (k) { return [k, b.answers[k]]; })), w.price).price;

    // 1. the customer's name on the account
    try {
      var prof = await http('GET', '/users/me/profile', undefined, { auth: true });
      if (!prof.first_name || prof.first_name === 'Customer' || /^User\d+$/.test(prof.first_name)) {
        var parts = name.split(/\s+/);
        await http('PUT', '/users/me/profile', { profile: { first_name: parts[0], last_name: parts.slice(1).join(' ') } }, { auth: true });
      }
    } catch (e) { if (e.status === 401) throw e; /* the name is a nicety: the booking goes ahead */ }
    // 2. the address (reuse one that is already saved)
    var addrId = 0, line1 = addr;
    var saved = await http('GET', '/users/addresses/', undefined, { auth: true });
    (Array.isArray(saved) ? saved : []).forEach(function (a) {
      if (!addrId && String(a.pincode) === pin && String(a.line1).trim().toLowerCase() === line1.toLowerCase() && String(a.phone).slice(-10) === contact) addrId = a.id;
    });
    if (!addrId) {
      var na = await http('POST', '/users/addresses', { name: name, phone: contact, line1: line1, line2: '', city: city, state: (biz.states || {})[city] || '', pincode: pin, country: 'India', is_default: false }, { auth: true });
      addrId = na.id;
    }
    // 3. the lead
    var listing = LAST && LAST.key === key ? LAST.listing : null;
    if (!listing) {
      listing = await http('POST', '/sell/listings', {
        category_slug: x.m.category_slug, brand_slug: x.m.brand_slug, model_slug: x.m.id, config_id: x.cfg.id,
        answers: w.answers, expected_price: offer
      }, { auth: true });
      LAST = { key: key, listing: listing };
    }
    // 4. the pickup
    var notes = ['Website/app booking', 'Customer: ' + name + ' ' + contact, 'Payout: ' + (str(b.payout, 20) || 'cash or UPI at the door'),
      b.device ? 'Device: ' + str(b.device, 300) : '', b.geo && +b.geo.lat ? 'Map: https://maps.google.com/?q=' + (+b.geo.lat) + ',' + (+b.geo.lng) : '', rapid ? 'RAPID pickup' : '',
      slotLabel && !rapid ? 'Slot: ' + slotLabel : ''].filter(Boolean).join(' | ');
    await http('POST', '/sell/pickup', { listing_id: listing.id, address_id: addrId, pickup_date: date, pickup_slot_start: slot.start, pickup_slot_end: slot.end, notes: notes }, { auth: true });
    LAST = null;
    var code = orderCode(listing.id), title = x.m.name + ' · ' + x.cfg.name;
    var when = rapid ? 'Rapid pickup' : new Date(date + 'T00:00:00Z').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }) + ', ' + slotLabel;
    ORD[code] = { title: title, when: when, checks: w.checks, created: Date.now() };
    saveOrd();
    return { ok: true, id: code, key: '', title: title, amount: offer, lock_until: istDate(Date.now() + 7 * 864e5), ref_bonus: 0, today_bonus: 0, video: false, agent_card: null, wa: false };
  }

  // repairs have no booking route on the server: they reach your team as a lead in "contact us"
  async function createRepair(b) {
    var cfg = await config(), biz = cfg.business, rep = cfg.repair;
    var phone = cleanPhone(b.phone), pin = str(b.pincode, 6);
    if (!okPhone(phone)) throw fail('Enter a 10-digit Indian mobile number.', 400);
    if (!/^\d{6}$/.test(pin)) throw fail('Enter your 6-digit pincode.', 400);
    if (!(biz.pins || []).some(function (p) { return pin.indexOf(String(p)) === 0; })) throw fail("We don't pick up in " + pin + ' yet. Call or WhatsApp us and we\'ll see what we can do.', 400);
    var di = (rep.devices || []).findIndex(function (d) { return d[0] === b.device; });
    var iss = (rep.issues || []).filter(function (i) { return i[0] === b.issue; })[0];
    if (di < 0 || !iss) throw fail('Pick your phone and what needs fixing.', 400);
    var mode = b.mode === 'walk' ? 'walk' : 'door';
    var city = (biz.cities || []).indexOf(b.city) >= 0 ? b.city : biz.defaultCity;
    var title = iss[1] + ' repair · ' + rep.devices[di][1];
    var row = await lead('Repair request', phone, '', ['Repair: ' + title, 'Estimated price: Rs ' + iss[2][di], 'Mode: ' + (mode === 'door' ? 'technician comes to the customer' : 'customer walks in'), 'Pincode: ' + pin, 'City: ' + city]);
    var code = 'RC-' + String(row && row.id ? row.id : Date.now() % 1e6).padStart(6, '0');
    ORD[code] = { title: title, when: mode === 'door' ? 'Technician calls to fix a time' : 'Walk in any time', repair: true, created: Date.now() };
    saveOrd();
    return { ok: true, id: code, key: '', title: title, amount: iss[2][di], agent_card: null, wa: false };
  }

  // ------------------------------------------------------------------ my orders and the tracker
  var FLOW = ['Pickup booked', 'Agent assigned', 'Device checked', 'Paid'];
  var STEP = { pending: 1, assigned: 2, inspection_complete: 3, completed: 4, cancelled: 1 };
  async function listOrders() {
    var rows = await http('GET', '/sell/orders', undefined, { auth: true }), seen = {}, out = [];
    (Array.isArray(rows) ? rows : []).forEach(function (r) {
      var id = listingOf(r.order_id);
      if (!id || seen[id]) return;   // the server repeats an order once per model photo
      seen[id] = 1; r._id = id; out.push(r);
    });
    return out;
  }
  function shape(r) {
    var code = orderCode(r._id), local = ORD[code] || {}, st = String(r.status || 'pending').toLowerCase();
    var cancelled = st === 'cancelled', step = STEP[st] || 1, created = Date.parse(r.created_at) || Date.now(), updated = Date.parse(r.updated_at) || created;
    var history = [{ step: 1, at: Math.floor(created / 1000) }];
    if (cancelled) history.push({ step: 1, at: Math.floor(updated / 1000), cancelled: true });
    else for (var s = 2; s <= step; s++) history.push({ step: s, at: Math.floor(updated / 1000) });
    return {
      ok: true, id: code, key: '', type: 'sell', title: local.title || String(r.model || 'Your device'),
      amount: r.expected_price == null ? null : +r.expected_price, step: step, flow: FLOW, cancelled: cancelled, history: history,
      when: local.when || '', slot: local.when || '', agent_card: null, checks: local.checks, created: created
    };
  }
  async function A_my_orders() {
    needSession();
    var rows = await listOrders();
    return {
      ok: true, orders: rows.map(function (r) {
        var s = shape(r);
        return { id: s.id, key: '', type: 'sell', title: s.title, amount: s.amount, step: s.step, cancelled: s.cancelled, when: s.when, created: s.created, city: '', live: true };
      })
    };
  }
  async function A_track(q) {
    var d = String(q.id || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (/^RC\d+$/.test(d)) {
      var l = ORD['RC-' + d.slice(2)];
      throw fail(l ? 'Repair requests are confirmed by phone: our technician will call you to fix a time.' : "We couldn't find " + d + '.', 404);
    }
    var code = 'SMK' + String(listingOf(d)).padStart(3, '0');
    if (!listingOf(d)) throw fail("We couldn't find " + (str(q.id, 20).toUpperCase() || 'that order') + '. The ID is on your booking confirmation.', 404);
    if (!sess.access) throw fail('For your privacy, verify your mobile number first (open "My orders"), then track ' + code + '.', 403);
    var rows = await listOrders(), hit = rows.filter(function (r) { return r._id === listingOf(d); })[0];
    if (!hit) throw fail("We couldn't find " + code + ' on the number you verified.', 404);
    return shape(hit);
  }

  // ------------------------------------------------------------------ requests: leads for your team
  // contact_us is the route the server already has for "someone wants to be contacted"
  async function lead(subject, phone, name, lines, o) {
    var n = str(name, 60) || 'Website visitor', parts = n.split(/\s+/);
    return http('POST', '/contact_us', {
      first_name: parts[0], last_name: parts.slice(1).join(' '), email: '', phone: phone || '',
      subject: '[Website] ' + subject, message: lines.filter(Boolean).join('\n')
    }, o);
  }
  function dataUrlBlob(u) {
    var m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(u || '');
    if (!m) return null;
    var bin = atob(m[2]), arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: m[1] });
  }
  var modelLine = function (b) {
    var cat = CAT && CAT.byId[str(b.model, 160)];
    return cat ? 'Model: ' + cat.name + (b.vi != null && cat.cfgs[b.vi | 0] ? ' · ' + cat.cfgs[b.vi | 0].name : '') : (b.model ? 'Model: ' + str(b.model, 100) : '');
  };
  async function A_request(b) {
    var kind = str(b.kind, 20), cfg = await config(), biz = cfg.business;
    var city = (biz.cities || []).indexOf(b.city) >= 0 ? b.city : biz.defaultCity;
    var src = b.src ? 'Source: ' + str(b.src, 60) : '';
    if (kind === 'call') {
      if (str(b.website, 100)) return { ok: true };       // a robot filled the hidden field
      var name = str(b.name, 60), phone = cleanPhone(b.phone);
      if (name.length < 2) throw fail('Enter your name.', 400);
      if (!okPhone(phone)) throw fail('Enter a 10-digit Indian mobile number.', 400);
      await lead('Call me back', phone, name, ['Call request from ' + str(b.where, 20), modelLine(b), 'City: ' + city, src]);
      return { ok: true };
    }
    if (kind === 'model') {
      var ph = cleanPhone(b.phone), mdl = str(b.model, 100);
      if (mdl.length < 2) throw fail('Type the model name.', 400);
      if (!okPhone(ph)) throw fail('Enter a 10-digit Indian mobile number.', 400);
      await lead('My model is not listed', ph, '', ['Brand: ' + str(b.brand, 60), 'Model: ' + mdl, 'Storage: ' + str(b.storage, 40), 'Condition: ' + str(b.cond, 20), 'Type: ' + str(b.cat, 20), 'City: ' + city, src]);
      return { ok: true };
    }
    // everything below needs a verified mobile number
    needSession();
    var me = sess.phone || '';
    if (kind === 'beat') {
      var their = Math.round(+b.their);
      if (!(their >= 100 && their <= 1000000)) throw fail('Enter the price they offered, in rupees.', 400);
      var blob = dataUrlBlob(b.shot);
      if (!blob) throw fail('Add a screenshot of their quote (a JPG, PNG or WebP picture).', 400);
      var fd = new FormData(); fd.append('image', blob, 'quote.' + (blob.type.split('/')[1] || 'jpg')); fd.append('alt_text', 'Competitor quote from ' + me);
      var img = await http('POST', '/sell/images', fd, { form: true, auth: true });
      await lead('Beat my quote', me, '', [modelLine(b), 'Their offer: Rs ' + their, 'Screenshot: ' + ORIGIN + '/uploads/' + (img && img.url), 'City: ' + city], { auth: true });
      return { ok: true };
    }
    if (kind === 'callback') {
      var when = ['asap', 'evening', 'tomorrow', 'weekend'].indexOf(b.when) >= 0 ? b.when : 'asap';
      await lead('Call back about my offer', me, '', [modelLine(b), 'When: ' + when, 'City: ' + city], { auth: true });
      return { ok: true };
    }
    if (kind === 'bulk') {
      var count = Math.round(+b.count);
      if (!(count >= 2 && count <= 500)) throw fail('Tell us how many devices you have.', 400);
      await lead('Bulk / office sale', me, '', ['Devices: ' + count, 'What: ' + str(b.what, 200), 'City: ' + city], { auth: true });
      return { ok: true };
    }
    if (kind === 'upgrade') {
      var dd = str(b.date, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dd) || dd <= istDate() || dd > istDate(Date.now() + 92 * 864e5)) throw fail('Pick the day your new phone arrives, in the next 3 months.', 400);
      await lead('Upgrade pickup', me, '', [modelLine(b), 'New phone arrives: ' + dd, 'City: ' + city], { auth: true });
      return { ok: true };
    }
    if (kind === 'watch') {
      await lead('Price watch', me, '', [modelLine(b), 'City: ' + city], { auth: true });
      return { ok: true };
    }
    if (kind === 'delete') {
      var reason = str(b.reason, 500) || 'Requested from the website';
      await http('POST', '/auth/account_delete', { reason: reason }, { auth: true });
      return { ok: true };
    }
    throw fail('Something went wrong. Please try again.', 400);
  }
  async function A_waitlist_join(b) {
    var cfg = await config(), phone = cleanPhone(b.phone), city = str(b.city, 40);
    if (!okPhone(phone)) throw fail('Enter a 10-digit Indian mobile number.', 400);
    if ((cfg.business.soon || []).indexOf(city) < 0) throw fail('Pick a city from the list.', 400);
    await lead('Waitlist: ' + city, phone, '', ['Tell me when pickups start in ' + city]);
    return { ok: true };
  }

  var ACTIONS = {
    catalog: A_catalog, pow: async function () { return {}; }, otp_send: A_otp_send, otp_verify: A_otp_verify, prices: A_prices,
    unlock: A_unlock, lead_reason: A_lead_reason, create_order: A_create_order, track: A_track, my_orders: A_my_orders,
    request: A_request, waitlist_join: A_waitlist_join,
    ref_code: async function () { throw fail('Referrals are not switched on.', 404); },
    ref_check: async function () { return { ok: false }; },
    ai: async function () { throw fail('The AI check is not switched on.', 404); }
  };

  window.RC_API = {
    call: function (action, data) {
      var f = ACTIONS[action];
      if (!f) return Promise.reject(fail('Something went wrong. Please try again.', 404));
      return f(data || {});
    },
    // for the app shell: sign out also clears the refresh cookie on the server
    signOut: async function () { try { await http('DELETE', '/auth/logout', undefined); } catch (e) { /* best effort */ } dropSess(); },
    signedIn: function () { return !!sess.access; }
  };
})();
