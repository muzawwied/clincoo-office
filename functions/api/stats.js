// GET /api/stats -> data card header Clincoo Office
// [18 Okt, arahan Boss] angka ASLI dari platform clincoo.buzz (database clincoo-db):
//   users = user terdaftar di clincoo.buzz (auth_users)
//   sites = situs yang pernah dipublikasikan lewat clincoo.buzz - SEMUA proyek, termasuk proyek lama/terhapus
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
  try {
    // 1) user terdaftar
    users = (await cf('SELECT COUNT(*) AS n FROM auth_users'))[0].n;
    // 2) situs terpublikasi: SEMUA tabel settings proyek (aktif + lama/terhapus) yang punya pages_project
    const cands = (await cf("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'p\\_%\\_project\\_settings' ESCAPE '\\'")).map(r => r.name).concat(['project_settings']);
    const batches = [];
    for (let i = 0; i < cands.length; i += 5) batches.push(cands.slice(i, i + 5));
    const found = new Set();
    const res = await Promise.all(batches.map(bt => {
      const parts = bt.map(t => 'SELECT key, value FROM ' + t).join(' UNION ALL ');
      return cf("SELECT DISTINCT value AS v FROM (" + parts + ") WHERE key='pages_project' AND value IS NOT NULL AND TRIM(value) <> ''").catch(() => []);
    }));
    res.forEach(rows => rows.forEach(r => found.add(r.v)));
    sites = found.size;
  } catch (e) {}
  CACHE = { t: Date.now(), users, sites };
  return Response.json({ ok: true, users, sites });
}
