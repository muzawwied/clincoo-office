// GET /api/botinfo -> nama resmi tiap bot karakter dari Telegram (getMe)
// [18 Okt, arahan Boss] nama karakter di web = nama botnya (tanpa kata 'bot')
const CHARS_BOTS = ['rafa', 'dimas', 'sari'];
export async function onRequestGet({ env }) {
  const out = {};
  for (const id of CHARS_BOTS) {
    const tok = env['CHAR_' + id.toUpperCase() + '_TOKEN'];
    if (!tok) { out[id] = null; continue; }
    try {
      const r = await fetch('https://api.telegram.org/bot' + tok + '/getMe');
      const j = await r.json();
      if (!j.ok) { out[id] = null; continue; }
      const u = j.result.username || '', f = j.result.first_name || '';
      const nm = (u ? u.replace(/bot$/i, '') : f.replace(/\bBot\b/gi, '').replace(/['']s$/, '').trim()) || null; // [18 Okt] nama bot tanpa kata 'bot'
      out[id] = { name: nm, username: u || null };
    } catch (e) { out[id] = null; }
  }
  return Response.json({ ok: true, bots: out });
}
