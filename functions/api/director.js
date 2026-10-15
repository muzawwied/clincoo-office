// Endpoint perantara alur panjang (meeting dsb).
// Tiap panggilan memproses SATU langkah lalu memanggil dirinya sendiri
// untuk langkah berikutnya, supaya tidak kena limit 30 detik background task.
export async function onRequestPost({ request, env, waitUntil }) {
  const url = new URL(request.url);
  const key = request.headers.get('x-admin-key') || url.searchParams.get('k');
  if (key !== env.ADMIN_KEY) return Response.json({ ok: false, error: 'kunci admin salah' }, { status: 403 });
  const { ensureSchema, runDirectorStep } = await import('./_lib.js');
  await ensureSchema(env);
  waitUntil((async () => {
    try {
      const more = await runDirectorStep(env);
      if (more) {
        await fetch(url.origin + '/api/director', {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-key': env.ADMIN_KEY }, body: '{}'
        }).catch(() => {});
      }
    } catch (e) {}
  })().catch(() => {}));
  return Response.json({ ok: true });
}
