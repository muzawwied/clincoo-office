// GET /api/stats -> data card header: jumlah user Clincoo terdaftar + situs terpublikasi
// [18 Okt, arahan Boss] angka nyata real-time: D1 office_users (dari chat Telegram) + Cloudflare Pages
export async function onRequestGet({ env }) {
  let users = 0;
  try {
    await env.DB.prepare('CREATE TABLE IF NOT EXISTS office_users (id TEXT PRIMARY KEY, name TEXT, first_seen REAL, last_seen REAL)').run();
    const r = await env.DB.prepare('SELECT COUNT(*) AS n FROM office_users').first();
    users = (r && r.n) || 0;
  } catch (e) {}
  let sites = 0;
  try {
    const acc = env.CLOUDFLARE_ACCOUNT_ID, tok = env.CLOUDFLARE_API_TOKEN;
    if (acc && tok) {
      const r = await fetch('https://api.cloudflare.com/client/v4/accounts/' + acc + '/pages/projects?per_page=100', { headers: { Authorization: 'Bearer ' + tok } });
      const j = await r.json();
      if (j && j.success) sites = (j.result || []).length;
    }
  } catch (e) {}
  return Response.json({ ok: true, users, sites });
}
