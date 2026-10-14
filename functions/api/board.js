export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const since = url.searchParams.get('since') || '0';
  try {
    const { ensureSchema, getBoard } = await import('./_lib.js');
    await ensureSchema(env);
    const data = await getBoard(env, since);
    return Response.json({ ok: true, ...data });
  } catch (e) {
    return Response.json({ ok: false, error: String((e && e.message) || e) }, { status: 500 });
  }
}
