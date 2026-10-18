// GET /api/botinfo -> nama resmi tiap bot karakter dari Telegram (getMe)
// [18 Okt, arahan Boss] nama karakter di web = nama botnya (tanpa kata 'bot')
const CHARS_BOTS = ['rafa', 'dimas', 'sari', 'bagas'];
export async function onRequestGet({ env }) {
  const out = {};
  for (const id of CHARS_BOTS) {
    const tok = env['CHAR_' + id.toUpperCase() + '_TOKEN'];
    if (!tok) { out[id] = null; continue; }
    try {
      const r = await fetch('https://api.telegram.org/bot' + tok + '/getMe');
      const j = await r.json();
      out[id] = j.ok ? { name: j.result.first_name || j.result.username || null, username: j.result.username || null } : null;
    } catch (e) { out[id] = null; }
  }
  return Response.json({ ok: true, bots: out });
}
