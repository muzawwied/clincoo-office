// GET /api/stats -> data card header Clincoo Office
// [18 Okt, arahan Boss] angka ASLI & LIVE dari platform clincoo.buzz:
// sumber = users-live.md (repo Clinqoo-Data) - disinkron otomatis oleh sistem Clincoo
// langsung saat ada pendaftaran baru + tiap 15 menit (saldo, paket, dsb).
// CATATAN: D1 "clincoo-db" (49b6fed3) adalah salinan LAMA (90 user) - JANGAN dipakai;
// platform live menyimpan data lewat gateway D1MIGR di database lain.
const API = 'https://api.github.com/repos/muzawwied/Clinqoo-Data/contents/users-live.md';
let CACHE = { t: 0, users: 0, sites: 0 };
export async function onRequestGet({ env }) {
  if (Date.now() - CACHE.t < 45000) return Response.json({ ok: true, users: CACHE.users, sites: CACHE.sites });
  let users = 0, sites = 0, live = false;
  try {
    const r = await fetch(API, { headers: { Authorization: 'Bearer ' + (env.GITHUB_TOKEN || ''), 'Accept': 'application/vnd.github.raw', 'User-Agent': 'clincoo-office' } });
    if (r.ok) {
      const md = await r.text();
      const mu = md.match(/Total user:\s*\**(\d+)/), ms = md.match(/Situs terpublikasi:\s*\**(\d+)/);
      if (mu) { users = parseInt(mu[1], 10); live = true; }
      if (ms) sites = parseInt(ms[1], 10);
    }
  } catch (e) {}
  if (live) CACHE = { t: Date.now(), users, sites };
  return Response.json({ ok: true, users, sites });
}
