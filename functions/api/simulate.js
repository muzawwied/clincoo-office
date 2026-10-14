// Pemicu demo/dialog tanpa Telegram — dipakai admin atau pengujian.
export async function onRequestPost({ request, env, waitUntil }) {
  try {
    const url = new URL(request.url);
    if (request.headers.get('x-admin-key') !== env.ADMIN_KEY && url.searchParams.get('k') !== env.ADMIN_KEY)
      return Response.json({ ok: false, error: 'kunci admin salah' }, { status: 403 });
    const body = await request.json().catch(() => ({}));
    const from = String(body.from || 'rafa').toLowerCase();
    const to = String(body.to || 'dimas').toLowerCase();
    const topic = String(body.topic || 'jadwal rilis minggu ini').slice(0, 300);
    const { ensureSchema, runDialogue, runSummon } = await import('./_lib.js');
    await ensureSchema(env);
    if (String(body.action || '').toLowerCase() === 'summon') {
      waitUntil(runSummon(env, from, to, String(body.place || 'kantor')).catch(() => {}));
      return Response.json({ ok: true, action: 'summon', from, to, place: body.place || 'kantor' });
    }
    waitUntil(runDialogue(env, from, to, topic, null));
    return Response.json({ ok: true, from, to, topic, note: 'dialog berjalan, pantau /api/board' });
  } catch (e) {
    return Response.json({ ok: false, error: String((e && e.message) || e) }, { status: 500 });
  }
}
