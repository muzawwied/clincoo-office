// GET /api/stats -> data card header Clincoo Office
// [18 Okt, arahan Boss] angka ASLI dari platform clincoo.buzz:
//   users = user terdaftar di clincoo.buzz (tabel auth_users di clincoo-db)
//   sites = situs yang pernah dipublikasikan lewat clincoo.buzz (pages_project di project settings)
const CLINCOO_DB = '49b6fed3-a237-46e3-ab2b-b0de31cc862b';
let CACHE = { t: 0, users: 0, sites: 0 };
export async function onRequestGet({ env }) {
  if (Date.now() - CACHE.t < 45000) return Response.json({ ok: true, users: CACHE.users, sites: CACHE.sites });
  const acc = env.CLOUDFLARE_ACCOUNT_ID, tok = env.CLOUDFLARE_API_TOKEN;
  const cf = async (sql) => {
    const r = await fetch('https://api.cloudflare.com/client/v4/accounts/' + acc + '/d1/database/' + CLINCOO_DB + '/query', {
      method: 'POST', headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' }, body: JSON.stringify({ sql })
    });
    const j = await r.json();
    if (!j || !j.success || !j.result || !j.result[0]) throw new Error('d1 gagal');
    return j.result[0].results || [];
  };
  let users = 0, sites = 0;
  try { users = (await cf('SELECT COUNT(*) AS n FROM auth_users'))[0].n; } catch (e) {}
  try {
    const tabs = await cf("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'p\\_%\\_project\\_settings' ESCAPE '\\'");
    const parts = tabs.map(t => 'SELECT key, value FROM ' + t.name).concat(['SELECT key, value FROM project_settings']).join(' UNION ALL ');
    const rows = await cf("SELECT COUNT(DISTINCT value) AS n FROM (" + parts + ") WHERE key='pages_project' AND value IS NOT NULL AND TRIM(value) <> ''");
    sites = rows[0].n;
  } catch (e) {
    try { sites = (await cf("SELECT COUNT(DISTINCT value) AS n FROM project_settings WHERE key='pages_project' AND TRIM(IFNULL(value,'')) <> ''"))[0].n; } catch (e2) {}
  }
  CACHE = { t: Date.now(), users, sites };
  return Response.json({ ok: true, users, sites });
}
