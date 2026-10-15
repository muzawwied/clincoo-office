// Cek nama env var yang ter-bind (tanpa nilai) — utk debugging.
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const key = request.headers.get('x-admin-key') || url.searchParams.get('k');
  if (key !== env.ADMIN_KEY) return Response.json({ ok: false }, { status: 403 });
  return Response.json({ ok: true, env_keys: Object.keys(env).sort() });
}
