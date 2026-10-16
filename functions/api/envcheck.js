// Cek nama env var yang ter-bind (tanpa nilai) + kesehatan AI (status HTTP saja, tanpa kunci) — utk debugging.
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const key = request.headers.get('x-admin-key') || url.searchParams.get('k');
  if (key !== env.ADMIN_KEY) return Response.json({ ok: false }, { status: 403 });
  const out = { ok: true, env_keys: Object.keys(env).sort() };
  // kesehatan Gemini: status HTTP + pesan error singkat (tanpa kunci)
  if (env.GEMINI_API_KEY) {
    const model = 'gemini-flash-latest';
    try {
      const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + env.GEMINI_API_KEY, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(9000),
        body: JSON.stringify({ contents: [{ parts: [{ text: 'balas: ok' }] }] })
      });
      const j = await r.json().catch(() => ({}));
      out.gemini = { http: r.status, ok: !!j.candidates, err: j.error ? String(j.error.message || '').slice(0, 120) : null };
    } catch (e) { out.gemini = { http: 0, ok: false, err: String(e.message || e).slice(0, 120) }; }
  }
  // kesehatan OpenRouter: tes completion nyata per model kandidat (status saja, tanpa kunci)
  if (env.OPENROUTER_API_KEY) {
    out.openrouter = { tests: [] };
    for (const model of ['cohere/north-mini-code:free', 'google/gemma-4-31b-it:free', 'nvidia/nemotron-3-super-120b-a12b:free', 'thinkingmachines/inkling:free']) {
      try {
        const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST', headers: { 'Authorization': 'Bearer ' + env.OPENROUTER_API_KEY, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(12000),
          body: JSON.stringify({ model, max_tokens: 30, messages: [{ role: 'user', content: 'balas: ok' }] })
        });
        const j = await r.json().catch(() => ({}));
        out.openrouter.tests.push({ model, http: r.status, ok: !!((j.choices || [])[0] || {}).message, err: j.error ? String(j.error.message || '').slice(0, 100) : null });
      } catch (e) { out.openrouter.tests.push({ model, http: 0, ok: false, err: String(e.message || e).slice(0, 100) }); }
    }
  }
  // kesehatan 9Router (kalau dikonfigurasi): tes completion kecil, status saja
  const nUrl = await (await import('./_lib.js')).getSetting(env, 'nine_router_url').catch(() => null);
  if (nUrl) {
    try {
      const { getSetting: gs } = await import('./_lib.js');
      const nKey = (await gs(env, 'nine_router_key')) || env.NINE_ROUTER_KEY || '';
      const u = String(nUrl).replace(/\/+$/, '') + (String(nUrl).includes('/chat/completions') ? '' : '/v1/chat/completions');
      const r = await fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(nKey ? { 'Authorization': 'Bearer ' + nKey } : {}) }, signal: AbortSignal.timeout(10000), body: JSON.stringify({ model: 'auto', max_tokens: 20, messages: [{ role: 'user', content: 'balas: ok' }] }) });
      const j = await r.json().catch(() => ({}));
      out.nine_router = { http: r.status, ok: !!((j.choices || [])[0] || {}).message, err: j.error ? String(j.error.message || '').slice(0, 100) : null };
    } catch (e) { out.nine_router = { http: 0, ok: false, err: String(e.message || e).slice(0, 100) }; }
  } else out.nine_router = { configured: false };
  return Response.json(out);
}
