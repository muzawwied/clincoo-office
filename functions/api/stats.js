// GET /api/stats -> data card header Clincoo Office
// [18 Okt, arahan Boss] angka ASLI & LIVE dari platform clincoo.buzz:
//   users = dari users-live.md (sinkron otomatis sistem Clincoo: saat ada pendaftaran baru + tiap 15 menit)
//   sites = SEMUA situs yang URL-nya masih aktif (rule Boss: "selama situs url masih aktif",
//           termasuk situs lama yang masih hidup) + tidak kurang dari angka resmi platform
const API = 'https://api.github.com/repos/muzawwied/Clinqoo-Data/contents/users-live.md';
const SITES = [
  "03t3x-03t3x",
  "0fz6f-0fz6f",
  "1p81v-1p81v",
  "2pi1z-2pi1z",
  "4cf8p-4cf8p",
  "4owlb-4owlb",
  "7gmf4-7gmf4",
  "9flsa-9flsa",
  "a512n-a512n",
  "al81t-al81t",
  "alexportfoli-fcp4h",
  "arisxzydevpa-xjt4b",
  "c339m-c339m",
  "chess-jo8a1",
  "clincoo-o4rah",
  "clincoo-rtbje",
  "cno-0045h-0045h",
  "cno-berikutsayat-1h6u8",
  "cno-buatkansayaw-mj7h7",
  "cno-el96v-el96v",
  "cno-portfoliopro-9a3ou",
  "cno-situsportofo-h94mu",
  "cno-topupgame-hijtj",
  "cno-topupgame-vyjxx",
  "cno-webportofoli-l93do",
  "cvv44-cvv44",
  "e4uw2-e4uw2",
  "e7ka3-e7ka3",
  "eg3qd-eg3qd",
  "ei6y2-ei6y2",
  "gj4r5-gj4r5",
  "hallosayacli-m09sr",
  "halosayaadal-ibq24",
  "halosayaclin-0n9h5",
  "hqqno-hqqno",
  "jawajawa-dh9vy",
  "jydwa-jydwa",
  "kcebg-kcebg",
  "kgcf9-kgcf9",
  "l9jlu-l9jlu",
  "lagiadagangg-tyu29",
  "love2-love2",
  "m0bd0-m0bd0",
  "m6tt8-m6tt8",
  "mko8c-mko8c",
  "mrbz9-mrbz9",
  "nexuscraftpo-v1qu3",
  "portfoliopro-qmtho",
  "pqwdk-pqwdk",
  "projectfathir-noni-8jguv",
  "projectuji-vvert-vvert",
  "rwvlt-rwvlt",
  "sayabuatblok-9tsx4",
  "situsportfol-ixyqg",
  "srnq7-srnq7",
  "swiftinbox-2fcsm",
  "tesdeployban-u47eu",
  "topupgame-fgbu2",
  "ujqcn-ujqcn",
  "unpubdiag",
  "vmgrn-vmgrn",
  "vr2mp-vr2mp",
  "w78rg-w78rg",
  "wmnkf-wmnkf",
  "xk8v2-xk8v2",
  "xpdn0-xpdn0",
  "xsfrp-xsfrp"
];
// hasil scan verifikasi 18 Okt 08:35 WIB (seed awal, di-cek ulang otomatis)
const SEED_ALIVE = new Set([
  "0fz6f-0fz6f",
  "alexportfoli-fcp4h",
  "clincoo-o4rah",
  "cno-berikutsayat-1h6u8",
  "cno-el96v-el96v",
  "cno-situsportofo-h94mu",
  "cno-topupgame-vyjxx",
  "cno-webportofoli-l93do",
  "halosayaclin-0n9h5",
  "hqqno-hqqno",
  "nexuscraftpo-v1qu3",
  "projectfathir-noni-8jguv",
  "projectuji-vvert-vvert",
  "situsportfol-ixyqg",
  "swiftinbox-2fcsm",
  "tesdeployban-u47eu",
  "topupgame-fgbu2"
]);
const ALIVE = new Map(SITES.map(n => [n, SEED_ALIVE.has(n) ? 1 : 0]));
let CURSOR = 0;
let CACHE = { t: 0, users: 0, sites: 0 };
export async function onRequestGet({ env }) {
  if (Date.now() - CACHE.t < 45000) return Response.json({ ok: true, users: CACHE.users, sites: CACHE.sites });
  let users = 0, liveSites = 0;
  try {
    const r = await fetch(API, { headers: { Authorization: 'Bearer ' + (env.GITHUB_TOKEN || ''), Accept: 'application/vnd.github.raw', 'User-Agent': 'clincoo-office' } });
    if (r.ok) {
      const md = await r.text();
      const mu = md.match(/Total user:\s*\**(\d+)/), ms = md.match(/Situs terpublikasi:\s*\**(\d+)/);
      if (mu) users = parseInt(mu[1], 10);
      if (ms) liveSites = parseInt(ms[1], 10);
    }
  } catch (e) {}
  // rotasi cek URL: 35 situs per request (hemat subrequest), full cycle ~90 detik
  const batch = [];
  for (let i = 0; i < 35 && i < SITES.length; i++) batch.push(SITES[(CURSOR + i) % SITES.length]);
  CURSOR = (CURSOR + batch.length) % SITES.length;
  await Promise.all(batch.map(async n => {
    try {
      const ac = new AbortController(); const to = setTimeout(() => ac.abort(), 6000);
      const rr = await fetch('https://' + n + '.pages.dev/', { method: 'HEAD', signal: ac.signal, headers: { 'User-Agent': 'clincoo-office' } });
      clearTimeout(to);
      ALIVE.set(n, rr.status < 500 ? 1 : 0);
    } catch (e) { ALIVE.set(n, 0); }
  }));
  let aliveCount = 0; ALIVE.forEach(v => aliveCount += v);
  const sites = Math.max(aliveCount, liveSites);
  CACHE = { t: Date.now(), users, sites };
  return Response.json({ ok: true, users, sites });
}
