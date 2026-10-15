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
  // kesehatan OpenRouter: status HTTP saja
  if (env.OPENROUTER_API_KEY) {
    try {
      const r = await fetch('https://openrouter.ai/api/v1/models', { headers: { 'Authorization': 'Bearer ' + env.OPENROUTER_API_KEY }, signal: AbortSignal.timeout(9000) });
      out.openrouter = { http: r.status, ok: r.status === 200 };
    } catch (e) { out.openrouter = { http: 0, ok: false }; }
  }
  return Response.json(out);
}
