/* Clincov2 Office LIVE v2 — bubble chat nyambung ke papan nama 3D.
   Karakter yang disuruh bicara akan JALAN mendatangi targetnya dulu,
   lalu papan namanya melebar jadi bubble dengan efek mengetik.
   Lapisan aditif: tidak mengubah logika 3D induk. */
(() => {
  const MAP = { rafa: 0, dimas: 1, sari: 2, bagas: 3, nadia: 6, joko: 7, tini: 9, user: 10, ceo: 10 }; // index LOOKS/CHARS (user = avatar CEO Vylonium)
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const pos = (c) => c.player.position;
  const d2 = (a, b) => Math.hypot(pos(a).x - pos(b).x, pos(a).z - pos(b).z);

  // tempat tujuan perintah CEO (koordinat dari POI scene)
  const PLACES = {
    kantor:    { f: 0, x: -22.5, z: -13 },
    meja:      null, // dihitung per karakter (zona kerja masing-masing)
    ngopi:     { f: 0, x: 22.6,  z: -18.35 },
    gym:       { f: 0, x: 18.2,  z: 7.0 },
    nongkrong: { f: 0, x: -26.0, z: 1.7 },
    nonton:    { f: 0, x: 22.95, z: -2.9 },
    tidur:     { f: 0, x: 12.25, z: 8.0 },
    meeting:   { f: 0, x: -10.5, z: -12.4 },
    sakit:     { f: 0, x: 12.25, z: 9.5 }
  }; // z -12.4: sisi bebas meja (kursi di z -14.6, meja ~-13.5)
  // zona kerja per karakter (index CHARS) utk "ke meja"
  const DESK = { 0: { f: 0, x: -8, z: 2 }, 1: { f: 0, x: -8, z: 2 }, 2: { f: 0, x: 3, z: -13 }, 3: { f: 0, x: 14, z: -13 } };

  const css = `
  .ol-msg{max-width:132px;max-height:31px;overflow:hidden;font:500 10.5px/1.32 system-ui,sans-serif;color:#aab4c3;text-align:left;
    white-space:normal;margin:2px auto 0;padding-top:3px;border-top:1px solid rgba(226,232,240,.13);
    display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
  .ol-msg b{color:#e2e8f0;font-weight:600}
  .nt.ol-say{border-color:rgba(226,232,240,.45) !important;box-shadow:0 4px 12px rgba(2,6,23,.45) !important;z-index:9 !important}
  .nt.ol-typ::after{content:'\\2328 mengetik...';display:block;position:static;left:auto;bottom:auto;width:auto;height:auto;background:none;border:none;transform:none;max-width:132px;margin:2px auto 0;padding-top:3px;border-top:1px solid rgba(226,232,240,.13);font:600 10.5px/1.32 system-ui,sans-serif;color:#aab4c3;text-align:center}
  #ol-feedBtn{position:fixed;top:calc(12px + var(--st,12px));right:calc(116px + var(--sr,12px));z-index:62;width:42px;height:42px;padding:0;
    border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;
    background:rgba(15,18,25,.55);border:1px solid rgba(255,255,255,.16);cursor:pointer;backdrop-filter:blur(8px);touch-action:manipulation}
  #ol-feedBtn:active{transform:scale(.9);filter:brightness(1.15)}
  #ol-feedBtn svg{width:20px;height:20px;display:block}
  #ol-feedBtn.ol-new::after{content:'';position:absolute;top:6px;right:6px;width:7px;height:7px;border-radius:50%;
    background:#f43f5e;border:1px solid #0f172a}
  #ol-feed{position:fixed;top:calc(64px + var(--st,12px));right:calc(12px + var(--sr,12px));z-index:61;width:min(80vw,282px);max-height:60vh;overflow:auto;padding:12px;display:none;
    background:rgba(15,18,25,.85);border:1px solid rgba(255,255,255,.12);border-radius:16px;backdrop-filter:blur(10px)}
  #ol-feed.on{display:block}
  .ol-fi{font:500 12.5px/1.5 system-ui,sans-serif;color:#d1d5db;padding:7px 0;border-bottom:1px solid rgba(255,255,255,.07)}
  .ol-fi b{color:#fff}
  .ol-t{color:#9ca3af;font-size:11px;margin-right:6px}
  `;
  const stEl = document.createElement('style'); stEl.textContent = css; document.head.appendChild(stEl);

  const feedBtn = document.createElement('button'); feedBtn.id = 'ol-feedBtn'; feedBtn.title = 'Riwayat obrolan';
  feedBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>';
  const feed = document.createElement('div'); feed.id = 'ol-feed';
  feedBtn.onclick = () => { feed.classList.toggle('on'); if (feed.classList.contains('on')) feedBtn.classList.remove('ol-new'); };
  document.body.append(feedBtn, feed);

  let lastId = 0, queue = [], playing = false, statusNow = {}, loaded = false;
  // PATROL REAL: cek situs/bot/GitHub/DB nyata tiap 3 menit saat kantor dibuka
  setInterval(() => { fetch('/api/patrol', { method: 'POST' }).catch(() => {}); }, 180000);
  let W = null;
  const world = () => {
    if (W) return W;
    try { if (window.__OFFICE && window.__OFFICE.CHARS && window.__OFFICE.CHARS.length)
      return (W = { CHARS: window.__OFFICE.CHARS, POIS: window.__OFFICE.POIS || [], STAIRS: window.__OFFICE.STAIRS, astar: window.__OFFICE.astar, FY: window.__OFFICE.FY }); } catch (e) {}
    try { if (typeof CHARS !== 'undefined' && CHARS && CHARS.length)
      return (W = { CHARS, POIS: (typeof POIS !== 'undefined' ? POIS : null), STAIRS: (typeof STAIRS !== 'undefined' ? STAIRS : null), astar: (typeof astar !== 'undefined' ? astar : null), FY: (typeof FY !== 'undefined' ? FY : null) }); } catch (e) {}
    return null;
  };
  const jam = (ts) => new Date(ts).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

  const charById = (id) => {
    const w = world(); if (!w) return null;
    const i = MAP[(id || '').toLowerCase()];
    return (i !== undefined && w.CHARS[i]) ? w.CHARS[i] : null;
  };
  const nameById = (id) => {
    const c = charById(id); return c ? c.name : (id === 'user' ? '👤' : id);
  };

  // ---- rute generik per karakter (meniru route() bawaan, parameternya eksplisit) ----
  function routeFor(c, p) {
    try {
      const w = world(); if (!w || !w.astar || !w.STAIRS) return null;
      const astar = w.astar, STAIRS = w.STAIRS;
      const pp = pos(c), pts = [];
      let f = c.pFloor, x = pp.x, z = pp.z, first = true;
      while (f !== p.floor) {
        const up = p.floor > f, S = STAIRS.find((q) => up ? q.lo === f : q.hi === f);
        if (!S) return null;
        const from = up ? S.nb : S.nt, to = up ? S.nt : S.nb, nf = up ? S.hi : S.lo;
        const a = astar(f, x, z, from.x, from.z); if (!a) return null;
        pts.push(...(first ? a : a.slice(1))); first = false;
        pts.push({ x: to.x, z: to.z, stair: S, to: nf, up });
        f = nf; x = to.x; z = to.z;
      }
      const a = astar(f, x, z, p.ax, p.az); if (!a) return null;
      pts.push(...(first ? a : a.slice(1)));
      if (pts.length && Math.hypot(pts[0].x - pp.x, pts[0].z - pp.z) < 0.15) pts.shift();
      return pts;
    } catch (e) { return null; }
  }

  function interruptAct(c) {
    if (c.st === 'ACT' || c.st === 'SITIN' || c.st === 'SITOUT') {
      const pp = pos(c);
      c.pendingAct = null;
      c.st = 'SITOUT'; c.stT = 0;
      c.sit0 = { x: pp.x, z: pp.z, yaw: c.yawNow };
    }
  }

  async function walkTo(c, target, timeoutMs) {
    if (c.pFloor === target.pFloor && d2(c, target) < 2.4) return true;
    interruptAct(c);
    const t0 = Date.now();
    // tunggu sampai siap menerima rute (tidak sedang duduk/aktif)
    while (Date.now() - t0 < timeoutMs * 0.45 && (c.st === 'ACT' || c.st === 'SITIN' || c.st === 'SITOUT')) await sleep(500);
    const tp = pos(target);
    let pts = null;
    const offs = [[0, 0], [1.5, 0], [-1.5, 0], [0, 1.5], [0, -1.5], [2, 2], [-2, -2], [2.6, 0], [-2.6, 0], [0, 2.6], [0, -2.6]];
    for (const [dx, dz] of offs) {
      pts = routeFor(c, { floor: target.pFloor, ax: tp.x + dx, az: tp.z + dz });
      if (pts) break;
    }
    if (pts && pts.length) {
      c.path = pts; c.poi = null; c.pendingAct = null;
      c.st = 'WALK'; c.stT = 0; c.ghostT = 0;
    }
    while (Date.now() - t0 < timeoutMs) {
      if ((c.pFloor === target.pFloor && d2(c, target) < 2.4) || (c.st !== 'WALK' && c.path && !c.path.length && c.st !== 'SITOUT')) return true;
      await sleep(400);
    }
    return false;
  }

  async function walkToPoint(c, p, timeoutMs) {
    if (!c || !p) return false;
    if (c.pFloor === p.f && Math.hypot(pos(c).x - p.x, pos(c).z - p.z) < 2.0) return true;
    interruptAct(c);
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs * 0.45 && (c.st === 'ACT' || c.st === 'SITIN' || c.st === 'SITOUT')) await sleep(500);
    let pts = null;
    const offs = [[0, 0], [1.5, 0], [-1.5, 0], [0, 1.5], [0, -1.5], [2, 2], [-2, -2], [2.6, 0], [-2.6, 0], [0, 2.6], [0, -2.6]];
    for (const [dx, dz] of offs) {
      pts = routeFor(c, { floor: p.f, ax: p.x + dx, az: p.z + dz });
      if (pts) break;
    }
    if (pts && pts.length) {
      c.path = pts; c.poi = null; c.pendingAct = null;
      c.st = 'WALK'; c.stT = 0; c.ghostT = 0;
    }
    while (Date.now() - t0 < timeoutMs) {
      if (c.pFloor === p.f && Math.hypot(pos(c).x - p.x, pos(c).z - p.z) < 2.2) return true;
      if (c.st !== 'WALK' && c.path && !c.path.length && c.st !== 'SITOUT') return true;
      await sleep(400);
    }
    return false;
  }

  // duduk di kursi ruang meeting: pakai POI engine supaya animasi duduk asli
  async function sitAtMeeting(c, timeoutMs, isCeo) {
    const w = world(); if (!w || !w.POIS) return false;
    const taken = (p) => w.CHARS.some((x) => x !== c && (x.poi === p || x.lastPoi === p && x.st !== 'WAIT'));
    // CEO: hanya kursi ujung meja (head). Karyawan: dilarang kursi ujung.
    const cand = w.POIS.filter((p) => p.act === 'METING' && p.floor === 0 && !taken(p) && (!!p.head === !!isCeo))
      .sort((a, b) => (Math.hypot(a.sx + 11.5, a.sz + 14.6)) - (Math.hypot(b.sx + 11.5, b.sz + 14.6)));
    for (const p of cand.slice(0, 3)) {
      const longTrip = c.pFloor !== 0; // dari lantai lain: kasih waktu lewat tangga
      interruptAct(c);
      const t0 = Date.now();
      while (Date.now() - t0 < 9000 && (c.st === 'SITOUT' || c.st === 'SITIN' || c.st === 'ACT')) await sleep(400);
      const pts = routeFor(c, { floor: p.floor, ax: p.ax, az: p.az });
      if (!pts) continue;
      c.poi = p; c.path = pts; c.st = 'WALK'; c.stT = 0; c.pendingAct = null; c.ghostT = 0;
      const t1 = Date.now(); const budget = longTrip ? timeoutMs * 2.5 : timeoutMs;
      while (Date.now() - t1 < budget) {
        if ((c.st === 'ACT' || c.st === 'SITIN') && c.poi === p) return true; // sudah duduk
        if (c.st !== 'WALK' && c.poi !== p) break;
        await sleep(400);
      }
      if ((c.st === 'ACT' || c.st === 'SITIN') && c.poi === p) return true;
    }
    return false;
  }

  // duduk di POI tertentu (dipakai kursi kerja CEO): jalan ke kursi lalu duduk via engine POI
  async function sitAtPoi(c, p, timeoutMs) {
    const longTrip = c.pFloor !== (p.floor || 0);
    interruptAct(c);
    const t0 = Date.now();
    while (Date.now() - t0 < 9000 && (c.st === 'SITOUT' || c.st === 'SITIN' || c.st === 'ACT')) await sleep(400);
    const pts = routeFor(c, { floor: p.floor, ax: p.ax, az: p.az });
    if (!pts) return false;
    c.poi = p; c.path = pts; c.st = 'WALK'; c.stT = 0; c.pendingAct = null; c.ghostT = 0;
    const t1 = Date.now(); const budget = longTrip ? timeoutMs * 2.5 : timeoutMs;
    while (Date.now() - t1 < budget) {
      if ((c.st === 'ACT' || c.st === 'SITIN') && c.poi === p) return true;
      if (c.st !== 'WALK' && c.poi !== p) break;
      await sleep(400);
    }
    return (c.st === 'ACT' || c.st === 'SITIN') && c.poi === p;
  }

  function faceTo(c, target) {
    const a = pos(c), b = pos(target);
    c.yawNow = Math.atan2(b.x - a.x, b.z - a.z);
    try { c.player.rotation.y = c.yawNow; } catch (e) {}
  }

  // ---- papan nama melebar jadi bubble + efek mengetik ----
  async function speak(c, text) {
    if (!c || !c.cap) { await sleep(600); return; }
    const cap = c.cap;
    cap.classList.remove('ol-typ');
    let msg = cap.querySelector('.ol-msg');
    if (!msg) { msg = document.createElement('div'); msg.className = 'ol-msg';
      const role = cap.querySelector('.r'); if (role) cap.insertBefore(msg, role); else cap.appendChild(msg); }
    msg.textContent = '';
    cap.classList.add('ol-say');
    const txt = String(text || '');
    for (let i = 0; i < txt.length; i++) {
      msg.textContent = txt.slice(0, i + 1) + '▌';
      await sleep(9 + Math.random() * 18);
    }
    msg.textContent = txt;
    await sleep(Math.min(2600, 900 + txt.length * 26));
    cap.classList.remove('ol-say');
    await sleep(420);
    if (msg.parentNode) msg.remove();
  }

  async function process(m) {
    const A = charById(m.from_c);
    const B = charById(m.to_c);
    if (!A) { addFeed(m); return; }
    // pesan CEO->bot dan bot->CEO cukup di Riwayat saja (tak perlu berdiri & ngomong),
    // kecuali eksekusi perintah goto yang memang harus diperankan karakter
    if (m.from_c === 'user' && m.kind !== 'goto' && m.kind !== 'ceogoto') { addFeed(m); return; }
    if (m.to_c === 'user' && m.kind !== 'goto') { addFeed(m); return; }
    const savedWait = A.waitDur;
    A.waitDur = 1e9;
    if (m.kind === 'goto' || m.kind === 'ceogoto') {
      if (m.place === 'sakit') { // KARAKTER SAKIT: beristirahat di ruang sakit (real error)
        const w0 = world();
        const bed = w0 && w0.POIS ? w0.POIS.filter((p) => p.act === 'TIDUR' && p.floor === 0 && !w0.CHARS.some((x) => x !== A && (x.poi === p || x.lastPoi === p && x.st !== 'WAIT')))[0] : null;
        if (bed) { await sitAtPoi(A, bed, 20000); } else { await walkToPoint(A, PLACES.sakit, 20000); }
        if (m.text) { addFeed(m); if (m.kind === 'goto') await speak(A, m.text); }
        A.waitDur = Math.max(savedWait, 240);
        return;
      }
      if (m.place === 'meeting') { // RAPAT: CEO duduk di ujung meja, karyawan di sisi
        const isCeo = m.from_c === 'user';
        const ok = await sitAtMeeting(A, 20000, isCeo);
        if (!ok) { // fallback: berdiri tersebar mengelilingi meja (bukan numpuk 1 titik)
          const idx = Math.max(0, W.CHARS.indexOf(A));
          const ang = (idx / Math.max(1, W.CHARS.length)) * Math.PI * 2;
          const spread = { f: 0, x: PLACES.meeting.x + Math.sin(ang) * 2.2, z: PLACES.meeting.z + 1.0 + Math.cos(ang) * 1.6 };
          await walkToPoint(A, spread, 20000);
          faceTo(A, { player: { position: { x: PLACES.meeting.x, y: 0, z: PLACES.meeting.z - 1 } } });
        }
        if (m.text) addFeed(m);
        if (m.kind === 'goto' && m.text) await speak(A, m.text);
        A.waitDur = Math.max(savedWait, 240);
        return;
      }
      if (m.place === 'kantor' && m.from_c === 'user') { // CEO di kantornya: duduk di kursi kerja CEO
        const w = world();
        const ceoChair = w && w.POIS ? w.POIS.filter((p) => p.act === 'TYPE' && p.floor === 0)
          .sort((a, b) => (Math.hypot(a.sx + 22.5, a.sz + 16.6)) - (Math.hypot(b.sx + 22.5, b.sz + 16.6)))[0] : null;
        if (ceoChair) { await sitAtPoi(A, ceoChair, 20000); }
        if (!ceoChair) await walkToPoint(A, PLACES.kantor, 20000);
        if (m.text) addFeed(m);
        if (m.kind === 'goto' && m.text) { await speak(A, m.text); A.yawNow = 0; }
        A.waitDur = Math.max(savedWait, 40);
        return;
      }
      const place = PLACES[m.place] || DESK[A.idx];
      await walkToPoint(A, place, 20000);
      if (m.text) addFeed(m);
      if (m.kind === 'goto' && m.text) { await speak(A, m.text); A.yawNow = 0; }
      A.waitDur = Math.max(savedWait, 40);
      return;
    }
    if (m.kind === 'release') { // rapat bubar: berdiri lalu balik aktivitas
      interruptAct(A);
      A.waitDur = 6;
      return;
    }
    const seated = (x) => x.st === 'ACT' || x.st === 'SITIN' || x.st === 'SITOUT';
    if (B && B !== A && !seated(A)) { B.waitDur = 1e9; await walkTo(A, B, 15000); faceTo(A, B); }
    else if (B && B !== A) faceTo(A, B);
    addFeed(m);
    await speak(A, m.text);
    A.waitDur = savedWait;
    if (B) { const bw = B.waitDur; B.waitDur = Math.max(bw, 4); }
  }

  function addFeed(m) {
    const el = document.createElement('div'); el.className = 'ol-fi';
    el.innerHTML = `<span class="ol-t">${jam(m.ts)}</span><b>${nameById(m.from_c)}</b> → <b>${nameById(m.to_c)}</b><br>${String(m.text).slice(0, 140).replace(/</g, '&lt;')}`;
    feed.prepend(el);
    while (feed.children.length > 12) feed.lastChild.remove();
  }

  async function drain() {
    playing = true;
    while (queue.length) { const m = queue.shift(); try { await process(m); } catch (e) {} }
    playing = false;
  }

  function applyStatus() {
    for (const [id, s] of Object.entries(statusNow)) {
      const c = charById(id);
      if (!c || s !== 'mengetik') continue;
      if (!playing || queue.every((m) => m.from_c !== id)) c.cap && c.cap.classList.add('ol-typ');
    }
    // hapus penanda dari karakter yang tidak sedang mengetik
    if (CHARS) for (const [id] of Object.entries(statusNow)) {
      if (statusNow[id] !== 'mengetik') { const c = charById(id); c && c.cap && c.cap.classList.remove('ol-typ'); }
    }
  }

  async function poll() {
    try {
      const r = await fetch('/api/board?since=' + lastId, { cache: 'no-store' });
      const j = await r.json();
      if (!j.ok) { feedBtn.title = 'board: ' + (j.error || ''); return; }
      feedBtn.title = 'Riwayat obrolan';
      statusNow = j.status || {}; applyStatus();
      const msgs = j.msgs || [];
      if (!loaded) { // sinkronisasi awal: serap SEMUA batch riwayat dulu (API balas per 80)
        for (const m of msgs) if (m.id > lastId) { lastId = m.id; addFeed(m); }
        if (msgs.length < 80) loaded = true; // batch kurang dari 80 = riwayat habis, mulai mode live
        return;
      }
      let fresh = 0;
      for (const m of msgs) {
        if (m.id <= lastId) continue; // dedup anti-race: pesan lama tak pernah diputar ulang
        lastId = Math.max(lastId, m.id);
        fresh++; queue.push(m);
      }
      if (fresh > 0 && !feed.classList.contains('on')) feedBtn.classList.add('ol-new');
      if (!playing && queue.length) drain();
    } catch (e) { feedBtn.title = 'poll: ' + (e && e.message ? e.message : e); }
  }

  function start() {
    poll();
    setInterval(poll, 1300);
  }
  start();
})();
