/* Clincoo Office LIVE — papan nama hidup + efek mengetik.
   Lapisan aditif: tidak mengubah logika 3D induk. */
(() => {
  const CH = {
    rafa:  { name: 'Rafa',  role: 'Frontend Developer', color: '#38bdf8', emoji: '🧑‍💻' },
    dimas: { name: 'Dimas', role: 'Backend Engineer',   color: '#a78bfa', emoji: '🧙‍♂️' },
    sari:  { name: 'Sari',  role: 'UI/UX Designer',     color: '#f472b6', emoji: '🎨' },
  };
  const P = (id) => CH[(id || '').toLowerCase()] || { name: (id || 'Seseorang'), role: '', color: '#e5e7eb', emoji: '🙂' };

  const css = `
  .ol-glass{background:rgba(15,18,25,.82);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,.12);border-radius:16px}
  #ol-plate{position:fixed;left:50%;bottom:18px;transform:translateX(-50%) translateY(24px) scale(.92);opacity:0;pointer-events:none;z-index:60;
    width:min(92vw,540px);padding:14px 18px 16px;transition:all .45s cubic-bezier(.2,.9,.25,1.2);box-shadow:0 12px 48px rgba(0,0,0,.55)}
  #ol-plate.on{opacity:1;transform:translateX(-50%) translateY(0) scale(1.06)}
  #ol-plate.big{transform:translateX(-50%) translateY(0) scale(1.13)}
  .ol-row{display:flex;align-items:center;gap:10px}
  .ol-ava{width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:22px;flex:none;
    background:rgba(255,255,255,.08);border:2px solid var(--c,#888);box-shadow:0 0 14px var(--c,#888)}
  .ol-plate.on .ol-ava{animation:olPulse 1.6s ease-in-out infinite}
  @keyframes olPulse{50%{box-shadow:0 0 26px var(--c,#888)}}
  .ol-nm{font:800 20px/1.15 system-ui,sans-serif;color:#fff;letter-spacing:.3px}
  .ol-rl{font:500 12px/1.2 system-ui,sans-serif;color:#9ca3af;margin-top:2px}
  .ol-to{margin-left:auto;font:700 13px/1.2 system-ui,sans-serif;color:#fff;background:rgba(255,255,255,.1);
    border:1px solid rgba(255,255,255,.16);border-radius:999px;padding:6px 12px;white-space:nowrap}
  #ol-bub{margin-top:10px;font:500 15px/1.5 system-ui,sans-serif;color:#f3f4f6;min-height:22px}
  #ol-bub .ol-caret{display:inline-block;width:8px;height:16px;background:#fff;vertical-align:-2px;margin-left:2px;animation:olBlink .8s steps(1) infinite}
  @keyframes olBlink{50%{opacity:0}}
  #ol-typ{position:fixed;left:50%;transform:translateX(-50%);bottom:150px;z-index:59;font:600 13px/1 system-ui,sans-serif;color:#e5e7eb;
    padding:8px 14px;border-radius:999px;opacity:0;transition:opacity .3s;pointer-events:none}
  #ol-typ.on{opacity:1}
  #ol-feedBtn{position:fixed;top:14px;right:14px;z-index:62;font:700 13px/1 system-ui,sans-serif;color:#fff;padding:10px 14px;border-radius:12px;
    background:rgba(15,18,25,.7);border:1px solid rgba(255,255,255,.15);cursor:pointer;backdrop-filter:blur(8px)}
  #ol-feed{position:fixed;top:56px;right:14px;z-index:61;width:min(88vw,300px);max-height:46vh;overflow:auto;padding:12px;display:none}
  #ol-feed.on{display:block}
  .ol-fi{font:500 12.5px/1.5 system-ui,sans-serif;color:#d1d5db;padding:7px 0;border-bottom:1px solid rgba(255,255,255,.07)}
  .ol-fi b{color:#fff}
  .ol-t{color:#9ca3af;font-size:11px;margin-right:6px}
  `;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  const plate = document.createElement('div'); plate.id = 'ol-plate'; plate.className = 'ol-glass';
  plate.innerHTML = '<div class="ol-row"><div class="ol-ava"></div><div><div class="ol-nm"></div><div class="ol-rl"></div></div><div class="ol-to"></div></div><div id="ol-bub"></div>';
  const typ = document.createElement('div'); typ.id = 'ol-typ'; typ.className = 'ol-glass';
  const feedBtn = document.createElement('button'); feedBtn.id = 'ol-feedBtn'; feedBtn.textContent = '💬 Riwayat kantor';
  const feed = document.createElement('div'); feed.id = 'ol-feed'; feed.className = 'ol-glass';
  feedBtn.onclick = () => feed.classList.toggle('on');
  document.body.append(plate, typ, feedBtn, feed);

  const bub = plate.querySelector('#ol-bub'), ava = plate.querySelector('.ol-ava'),
        nm = plate.querySelector('.ol-nm'), rl = plate.querySelector('.ol-rl'), to = plate.querySelector('.ol-to');

  let lastId = 0, queue = [], playing = false, statusNow = {};
  const jam = (ts) => new Date(ts).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

  function addFeed(m) {
    const el = document.createElement('div'); el.className = 'ol-fi';
    const f = P(m.from_c), t = m.to_c === 'user' ? '👤' : P(m.to_c).name;
    el.innerHTML = `<span class="ol-t">${jam(m.ts)}</span><b style="color:${f.color}">${f.name}</b> → <b>${t}</b><br>${m.text.slice(0,140)}`;
    feed.prepend(el);
    while (feed.children.length > 12) feed.lastChild.remove();
  }

  async function play(m) {
    const f = P(m.from_c), t = m.to_c === 'user' ? '👤 Seseorang' : P(m.to_c).name;
    plate.style.setProperty('--c', f.color);
    ava.textContent = f.emoji; nm.textContent = f.name; rl.textContent = f.role;
    to.textContent = '→ ' + t;
    bub.innerHTML = '<span class="ol-caret"></span>';
    plate.classList.add('on'); requestAnimationFrame(() => plate.classList.add('big'));
    const txt = String(m.text || '');
    const span = document.createElement('span'); bub.prepend(span);
    for (let i = 0; i < txt.length; i++) {
      span.textContent += txt[i];
      await new Promise(r => setTimeout(r, 14 + Math.random() * 26));
    }
    bub.querySelector('.ol-caret').remove();
    await new Promise(r => setTimeout(r, 1900));
    plate.classList.remove('big');
    await new Promise(r => setTimeout(r, 420));
    plate.classList.remove('on');
    await new Promise(r => setTimeout(r, 650));
  }

  async function drain() {
    playing = true;
    while (queue.length) await play(queue.shift());
    playing = false;
  }

  function applyStatus() {
    const typing = Object.entries(statusNow).filter(([c, s]) => s === 'mengetik').map(([c]) => P(c).name);
    if (typing.length && !playing) { typ.textContent = '⌨️ ' + typing.join(', ') + ' sedang mengetik...'; typ.classList.add('on'); }
    else typ.classList.remove('on');
  }

  async function poll() {
    try {
      const r = await fetch('/api/board?since=' + lastId, { cache: 'no-store' });
      const j = await r.json();
      if (!j.ok) return;
      statusNow = j.status || {}; applyStatus();
      const first = lastId === 0;
      for (const m of (j.msgs || [])) {
        lastId = Math.max(lastId, m.id);
        if (first) { addFeed(m); continue; }
        addFeed(m); queue.push(m);
      }
      if (!playing && queue.length) drain();
    } catch (e) {}
  }
  poll();
  setInterval(poll, 1300);
})();
