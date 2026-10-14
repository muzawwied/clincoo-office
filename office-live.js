/* Clincov2 Office LIVE v2 — bubble chat nyambung ke papan nama 3D.
   Karakter yang disuruh bicara akan JALAN mendatangi targetnya dulu,
   lalu papan namanya melebar jadi bubble dengan efek mengetik.
   Lapisan aditif: tidak mengubah logika 3D induk. */
(() => {
  const MAP = { rafa: 0, dimas: 1, sari: 2, bagas: 3 }; // index LOOKS/CHARS
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const pos = (c) => c.player.position;
  const d2 = (a, b) => Math.hypot(pos(a).x - pos(b).x, pos(a).z - pos(b).z);

  const css = `
  .ol-msg{max-width:250px;font:500 12.5px/1.5 system-ui,sans-serif;color:#aab4c3;text-align:left;
    white-space:normal;margin:4px auto 0;padding-top:5px;border-top:1px solid rgba(226,232,240,.14)}
  .ol-msg b{color:#e2e8f0;font-weight:600}
  .nt.ol-say{border-color:var(--dc) !important;box-shadow:0 0 18px var(--dc),0 4px 12px rgba(2,6,23,.4) !important;z-index:9 !important}
  .nt.ol-typ::after{content:'\\2328 mengetik...';display:block;font:600 10.5px/1 system-ui,sans-serif;color:#93c5fd;padding-top:3px}
  #ol-feedBtn{position:fixed;top:14px;right:14px;z-index:62;font:700 13px/1 system-ui,sans-serif;color:#fff;padding:10px 14px;
    border-radius:12px;background:rgba(15,18,25,.7);border:1px solid rgba(255,255,255,.15);cursor:pointer;backdrop-filter:blur(8px)}
  #ol-feed{position:fixed;top:56px;right:14px;z-index:61;width:min(88vw,300px);max-height:46vh;overflow:auto;padding:12px;display:none;
    background:rgba(15,18,25,.85);border:1px solid rgba(255,255,255,.12);border-radius:16px;backdrop-filter:blur(10px)}
  #ol-feed.on{display:block}
  .ol-fi{font:500 12.5px/1.5 system-ui,sans-serif;color:#d1d5db;padding:7px 0;border-bottom:1px solid rgba(255,255,255,.07)}
  .ol-fi b{color:#fff}
  .ol-t{color:#9ca3af;font-size:11px;margin-right:6px}
  `;
  const stEl = document.createElement('style'); stEl.textContent = css; document.head.appendChild(stEl);

  const feedBtn = document.createElement('button'); feedBtn.id = 'ol-feedBtn'; feedBtn.textContent = '💬 Riwayat';
  const feed = document.createElement('div'); feed.id = 'ol-feed';
  feedBtn.onclick = () => feed.classList.toggle('on');
  document.body.append(feedBtn, feed);

  let lastId = 0, queue = [], playing = false, statusNow = {}, loaded = false;
  let W = null;
  const world = () => {
    if (W) return W;
    try { if (window.__OFFICE && window.__OFFICE.CHARS && window.__OFFICE.CHARS.length)
      return (W = { CHARS: window.__OFFICE.CHARS, STAIRS: window.__OFFICE.STAIRS, astar: window.__OFFICE.astar, FY: window.__OFFICE.FY }); } catch (e) {}
    try { if (typeof CHARS !== 'undefined' && CHARS && CHARS.length)
      return (W = { CHARS, STAIRS: (typeof STAIRS !== 'undefined' ? STAIRS : null), astar: (typeof astar !== 'undefined' ? astar : null), FY: (typeof FY !== 'undefined' ? FY : null) }); } catch (e) {}
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
    const savedWait = A.waitDur;
    A.waitDur = 1e9;
    if (B && B !== A) { B.waitDur = 1e9; await walkTo(A, B, 15000); faceTo(A, B); }
    addFeed(m);
    await speak(A, m.text);
    A.waitDur = savedWait;
    if (B) { const bw = B.waitDur; B.waitDur = Math.max(bw, 4); }
  }

  function addFeed(m) {
    const el = document.createElement('div'); el.className = 'ol-fi';
    const f = charById(m.from_c);
    const dot = f ? 'var(--dc)' : '#e5e7eb';
    el.innerHTML = `<span class="ol-t">${jam(m.ts)}</span><b style="color:${dot}">${nameById(m.from_c)}</b> → <b>${nameById(m.to_c)}</b><br>${String(m.text).slice(0, 140).replace(/</g, '&lt;')}`;
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
      if (!j.ok) { feedBtn.textContent = '⚠ board ' + (j.error || ''); return; }
      feedBtn.textContent = '💬 Riwayat ✓';
      statusNow = j.status || {}; applyStatus();
      for (const m of (j.msgs || [])) {
        if (m.id <= lastId) continue; // dedup anti-race: pesan lama tak pernah diputar ulang
        const isNew = loaded;
        lastId = Math.max(lastId, m.id);
        if (!isNew) { addFeed(m); continue; }
        queue.push(m);
      }
      loaded = true;
      if (!playing && queue.length) drain();
    } catch (e) { feedBtn.textContent = '⚠ poll ' + (e && e.message ? e.message : e); }
  }

  function start() {
    poll();
    setInterval(poll, 1300);
  }
  start();
})();
