// Panel Admin Clincoo Office — semua aksi terkunci ADMIN_KEY.
export async function onRequestGet({ request, env }) {
  if (!authOk(request, env)) return Response.json({ ok: false, error: 'kunci salah' }, { status: 403 });
  const { ensureSchema, PERSONAS, getSetting } = await import('./_lib.js');
  await ensureSchema(env);

  const bots = [];
  for (const [id, p] of Object.entries(PERSONAS)) {
    const envTok = env['CHAR_' + id.toUpperCase() + '_TOKEN'];
    bots.push({ id, name: p.name, role: p.role, emoji: p.emoji, source: 'bawaan', token_hint: envTok ? '••••' + envTok.slice(-4) : null });
  }
  try {
    const rows = await env.DB.prepare('SELECT * FROM office_bots ORDER BY created_at').all();
    for (const b of rows.results || []) {
      if (PERSONAS[b.id]) { const t = bots.find((x) => x.id === b.id); if (t) continue; }
      bots.push({ id: b.id, name: b.name, role: b.role, emoji: b.emoji, sys: b.sys, gh_labels: b.gh_labels, source: 'kustom', token_hint: b.tg_token ? '••••' + String(b.tg_token).slice(-4) : null, created_at: b.created_at });
    }
  } catch (e) {}

  // status webhook tiap bot (via token yang tersedia)
  const { rows: chats } = await env.DB.prepare('SELECT char, chat_id FROM office_chat').all().then((r) => ({ rows: r.results || [] })).catch(() => ({ rows: [] }));
  const chatMap = {}; for (const r of chats) chatMap[r.char] = r.chat_id;
  for (const b of bots) {
    const tok = b.source === 'bawaan' ? env['CHAR_' + b.id.toUpperCase() + '_TOKEN'] : (await getBotToken(env, b.id));
    b.webhook = null;
    if (tok) {
      try {
        const r = await fetch('https://api.telegram.org/bot' + tok + '/getWebhookInfo').then((x) => x.json());
        if (r.ok) b.webhook = { url: (r.result.url || '').slice(0, 120), pending: r.result.pending_update_count || 0 };
      } catch (e) {}
    }
    b.chat_id = chatMap[b.id] || null;
  }

  const settingKeys = ['gemini_api_key', 'gemini_model', 'openrouter_api_key', 'openrouter_model', ...Object.keys(PERSONAS).map((id) => 'model_' + id)];
  const settings = {};
  for (const k of settingKeys) {
    const dbV = await getSetting(env, k);
    const envV = k.startsWith('model_') ? ({ model_rafa: 'gemini-3.6-flash' }[k] || 'gemini-3.6-flash') : k.includes('gemini') ? (k === 'gemini_model' ? 'gemini-3.6-flash' : env.GEMINI_API_KEY) : (k === 'openrouter_model' ? 'cohere/north-mini-code:free' : env.OPENROUTER_API_KEY);
    settings[k] = { set: !!dbV, hint: dbV ? '••••' + String(dbV).slice(-4) : null, default_hint: envV ? 'env: ••••' + String(envV).slice(-4) : 'env: belum ada', is_model: k.includes('model') };
  }
  return Response.json({ ok: true, bots, settings });
}

export async function onRequestPost({ request, env }) {
  if (!authOk(request, env)) return Response.json({ ok: false, error: 'kunci salah' }, { status: 403 });
  const { ensureSchema, setSetting, aiChatRetry, tgSend, PERSONAS } = await import('./_lib.js');
  await ensureSchema(env);
  const body = await request.json().catch(() => ({}));
  const act = String(body.action || '');

  if (act === 'add_bot') {
    const id = String(body.id || '').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20);
    const name = String(body.name || '').slice(0, 40), role = String(body.role || 'Staff').slice(0, 60);
    const emoji = String(body.emoji || '🤖').slice(0, 8), sys = String(body.sys || '').slice(0, 2000);
    const tok = String(body.tg_token || '').trim(), labels = String(body.gh_labels || '').slice(0, 100);
    if (!id || !name) return Response.json({ ok: false, error: 'id & nama wajib' });
    if (PERSONAS[id] && !PERSONAS[id].custom) return Response.json({ ok: false, error: 'id bentrok dengan bot bawaan' });
    const ex = await env.DB.prepare('SELECT id FROM office_bots WHERE id = ?').bind(id).first();
    if (ex) return Response.json({ ok: false, error: 'id sudah dipakai' });
    if (tok) { const t = await tgCheck(tok); if (!t) return Response.json({ ok: false, error: 'token Telegram tidak valid' }); }
    await env.DB.prepare('INSERT INTO office_bots (id, name, role, emoji, sys, tg_token, gh_labels, created_at) VALUES (?,?,?,?,?,?,?,?)')
      .bind(id, name, role, emoji, sys, tok, labels, Date.now()).run();
    return Response.json({ ok: true });
  }
  if (act === 'update_bot') {
    const id = String(body.id || '').toLowerCase();
    const f = [], v = [];
    for (const k of ['name', 'role', 'emoji', 'sys', 'gh_labels']) if (body[k] !== undefined) { f.push(k + ' = ?'); v.push(String(body[k]).slice(0, 2000)); }
    if (body.tg_token !== undefined && String(body.tg_token).trim()) { const t = await tgCheck(String(body.tg_token).trim()); if (!t) return Response.json({ ok: false, error: 'token Telegram tidak valid' }); f.push('tg_token = ?'); v.push(String(body.tg_token).trim()); }
    if (!f.length) return Response.json({ ok: false, error: 'tidak ada perubahan' });
    v.push(id);
    await env.DB.prepare('UPDATE office_bots SET ' + f.join(', ') + ' WHERE id = ?').bind(...v).run();
    return Response.json({ ok: true });
  }
  if (act === 'delete_bot') {
    const id = String(body.id || '').toLowerCase();
    const row = await env.DB.prepare('SELECT tg_token FROM office_bots WHERE id = ?').bind(id).first();
    if (!row) return Response.json({ ok: false, error: 'bot kustom tidak ditemukan' });
    if (row.tg_token) { try { await fetch('https://api.telegram.org/bot' + row.tg_token + '/deleteWebhook').then((x) => x.json()); } catch (e) {} }
    await env.DB.prepare('DELETE FROM office_bots WHERE id = ?').bind(id).run();
    return Response.json({ ok: true });
  }
  if (act === 'set_setting') {
    const k = String(body.k || '');
    if (!['gemini_api_key', 'gemini_model', 'openrouter_api_key', 'openrouter_model'].includes(k) && !/^model_[a-z0-9_]{1,20}$/.test(k)) return Response.json({ ok: false, error: 'kunci tidak dikenal' });
    await setSetting(env, k, String(body.v || ''));
    return Response.json({ ok: true });
  }
  if (act === 'test_ai') {
    const { ensurePersonas } = await import('./_lib.js');
    await ensurePersonas(env);
    const r = await aiChatRetry(env, 'rafa', 'Sapa CEO satu kalimat singkat, bilang kamu online.');
    return Response.json({ ok: !!r, reply: r || null, error: r ? null : 'AI tidak merespons (cek key/model atau rate limit)' });
  }
  if (act === 'set_webhook') {
    const id = String(body.id || '').toLowerCase();
    const tok = await getBotToken(env, id);
    if (!tok) return Response.json({ ok: false, error: 'token bot tidak ada' });
    const url = String(body.base_url || new URL(request.url).origin) + '/api/telegram?c=' + id + '&s=' + tok;
    const r = await fetch('https://api.telegram.org/bot' + tok + '/setWebhook', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url, allowed_updates: ['message', 'edited_message'] }) }).then((x) => x.json());
    return Response.json({ ok: !!r.ok, error: r.ok ? null : (r.description || 'gagal set webhook') });
  }
  if (act === 'test_send') {
    const id = String(body.id || '').toLowerCase();
    const tok = await getBotToken(env, id);
    const chat = (await env.DB.prepare('SELECT chat_id FROM office_chat WHERE char = ?').bind(id).first())?.chat_id;
    if (!tok || !chat) return Response.json({ ok: false, error: 'token atau chat_id belum ada (kirim pesan dulu ke bot tsb)' });
    await tgSend(tok, chat, '✅ Tes koneksi dari Panel Admin — aku online, Boss!');
    return Response.json({ ok: true });
  }
  if (act === 'clear_board') {
    await env.DB.prepare('DELETE FROM office_msg').run();
    return Response.json({ ok: true });
  }
  return Response.json({ ok: false, error: 'aksi tidak dikenal' });
}

function authOk(request, env) {
  const k = request.headers.get('x-admin-key') || new URL(request.url).searchParams.get('k');
  return !!env.ADMIN_KEY && k === env.ADMIN_KEY;
}
async function getBotToken(env, id) {
  const envTok = env['CHAR_' + id.toUpperCase() + '_TOKEN'];
  if (envTok) return envTok;
  try { const r = await env.DB.prepare('SELECT tg_token FROM office_bots WHERE id = ?').bind(id).first(); return r ? r.tg_token : null; } catch (e) { return null; }
}
async function tgCheck(tok) {
  try { const r = await fetch('https://api.telegram.org/bot' + tok + '/getMe').then((x) => x.json()); return !!r.ok; } catch (e) { return false; }
}
