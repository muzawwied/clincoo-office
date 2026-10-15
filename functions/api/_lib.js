// _lib.js — inti Clincoo Office: persona, schema, AI, papan pesan, dialog

export const PERSONAS = {
  rafa:  { name: 'Rafa',  role: 'Frontend Developer', color: '#38bdf8', emoji: '🧑‍💻',
    sys: 'Kamu Rafa, frontend developer di startup Clincoo. Gaya bicara: santai, penuh semangat, suka kopi, kadang plesetan ringan. Selalu Bahasa Indonesia, 1-3 kalimat, seperti manusia asli, tanpa daftar poin.' },
  dimas: { name: 'Dimas', role: 'Backend Engineer',  color: '#a78bfa', emoji: '🧙‍♂️',
    sys: 'Kamu Dimas, backend engineer di startup Clincoo. Gaya bicara: tenang, logis, jenaka kering, suka analogi teknis. Selalu Bahasa Indonesia, 1-3 kalimat, seperti manusia asli, tanpa daftar poin.' },
  sari:  { name: 'Sari',  role: 'UI/UX Designer',    color: '#f472b6', emoji: '🎨',
    sys: 'Kamu Sari, desainer UI/UX di startup Clincoo. Gaya bicara: ceria, hangat, perhatian ke detail visual, sesekali pakai 1-2 emoji. Selalu Bahasa Indonesia, 1-3 kalimat, seperti manusia asli, tanpa daftar poin.' },
  bagas: { name: 'Bagas', role: 'QA Engineer',       color: '#fbbf24', emoji: '🕵️',
    sys: 'Kamu Bagas, QA engineer di startup Clincoo. Gaya bicara: teliti, suka menemukan bug, agak misterius kayak detektif, sesekali pakai istilah QA. Selalu Bahasa Indonesia, 1-3 kalimat, seperti manusia asli, tanpa daftar poin.' },
};

export function persona(id) { return PERSONAS[String(id || '').toLowerCase()] || null; }

export async function ensureSchema(env) {
  await env.DB.batch([
    env.DB.prepare('CREATE TABLE IF NOT EXISTS office_msg (id INTEGER PRIMARY KEY AUTOINCREMENT, ts REAL, from_c TEXT, to_c TEXT, text TEXT)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS office_status (char TEXT PRIMARY KEY, status TEXT, ts REAL)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS office_chat (char TEXT PRIMARY KEY, chat_id TEXT)'),
  ]);
  try { await env.DB.prepare('ALTER TABLE office_msg ADD COLUMN kind TEXT').run(); } catch (e) {}
  try { await env.DB.prepare('ALTER TABLE office_msg ADD COLUMN place TEXT').run(); } catch (e) {}
}

export async function setStatus(env, char, status) {
  await env.DB.prepare('INSERT INTO office_status (char, status, ts) VALUES (?, ?, ?) ON CONFLICT(char) DO UPDATE SET status = ?2, ts = ?3')
    .bind(String(char), String(status), Date.now()).run();
}

export async function logMsg(env, from, to, text, kind, place) {
  const r = await env.DB.prepare('INSERT INTO office_msg (ts, from_c, to_c, text, kind, place) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(Date.now(), String(from), String(to || 'kantor'), String(text).slice(0, 800), kind || null, place || null).run();
  return (r.meta && r.meta.last_row_id) || 0;
}

export async function getBoard(env, since) {
  const msgs = await env.DB.prepare('SELECT id, ts, from_c, to_c, text, kind, place FROM office_msg WHERE id > ? ORDER BY id ASC LIMIT 80').bind(Number(since) || 0).all();
  const st = await env.DB.prepare('SELECT char, status, ts FROM office_status').all();
  const now = Date.now();
  const out = {};
  for (const r of (st.results || [])) out[r.char] = (now - (r.ts || 0) < 120000) ? r.status : 'idle';
  return { msgs: msgs.results || [], status: out };
}

async function geminiChat(env, sys, user) {
  const key = env.GEMINI_API_KEY;
  if (!key) return null;
  const models = ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-flash'];
  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + key, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(12000),
          body: JSON.stringify({ system_instruction: { parts: [{ text: sys }] }, contents: [{ role: 'user', parts: [{ text: user }] }],
            generationConfig: { temperature: 0.9, maxOutputTokens: 220 } })
        });
        if (!r.ok) { if (r.status === 429 || r.status >= 500) { await sleep(1500); continue; } break; }
        const j = await r.json();
        const t = (((j.candidates || [])[0] || {}).content || {}).parts;
        if (t && t[0] && t[0].text) return String(t[0].text).trim().replace(/^["']|["']$/g, '');
        break;
      } catch (e) { await sleep(1200); }
    }
  }
  return null;
}

async function openrouterChat(env, sys, user) {
  const key = env.OPENROUTER_API_KEY;
  if (!key) return null;
  for (const model of ['cohere/north-mini-code:free']) {
    try {
      const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST', headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(12000),
        body: JSON.stringify({ model, max_tokens: 200, messages: [{ role: 'system', content: sys }, { role: 'user', content: user }] })
      });
      if (!r.ok) continue;
      const j = await r.json();
      const t = ((j.choices || [])[0] || {}).message || {};
      if (t.content) return String(t.content).trim();
    } catch (e) {}
  }
  return null;
}

export async function aiSay(env, charId, userPrompt) {
  const p = persona(charId);
  if (!p) return null;
  const sys = p.sys + ' Kamu sedang di kantor 3D Clincoo Office. Balasanmu ditampilkan sebagai obrolan singkat di papan nama. Tulis seperti orang beneran ngobrol di kantor: singkat, santai, natural, boleh bahasa gaul. JANGAN formal/kaku, JANGAN pakai kata "siap", JANGAN menyebut bahwa kamu AI.';
  let t = await geminiChat(env, sys, userPrompt);
  if (!t) t = await openrouterChat(env, sys, userPrompt);
  return t || null;
}

export async function tgSend(token, chatId, text) {
  try {
    await fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: String(text).slice(0, 3500), parse_mode: 'HTML', disable_web_page_preview: true })
    });
  } catch (e) {}
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Retry utk obrolan langsung dengan CEO — jawaban boleh pendek.
export async function aiChatRetry(env, charId, prompt) {
  for (let i = 0; i < 3; i++) {
    try { const t = await aiSay(env, charId, prompt); if (t && t.length >= 4) return t; }
    catch (e) {}
    await sleep(4000);
  }
  return null;
}

// Dialog 3 giliran antar karakter; tiap baris ditulis ke papan + dikirim ke Telegram user.
export async function aiSayRetry(env, charId, prompt) {
  for (let i = 0; i < 2; i++) {
    try { const t = await aiSay(env, charId, prompt); if (t && t.length >= 15) return t; }
    catch (e) {}
    await sleep(6000);
  }
  return null;
}

export async function runDialogue(env, fromId, toId, topic, notify) {
  const A = persona(fromId), B = persona(toId);
  if (!A || !B) throw new Error('karakter tidak dikenal');
  let last = '';
  const turnDefs = [
    { who: fromId, to: toId, build: () => `Kamu nyamperin ${B.name} (${B.role}) di kantor mau ngajak ngobrol soal: "${topic}". Buka obrolan seperti beneran ngobrol: santai, natural, gaya bicaramu sendiri. 1-2 kalimat.` },
    { who: toId,  to: fromId, build: () => `${A.name} (${A.role}) barusan dateng dan bilang: "${last}". Tanggapi isinya — bisa setuju, nambahin, bercanda dikit, atau nanya balik. Jangan cuma "oke/siap". 1-2 kalimat, gaya bicaramu sendiri.` },
    { who: fromId, to: toId, build: () => `${B.name} barusan jawab: "${last}". Tanggapi sekali lagi singkat dan natural, terus tutup dengan cara enak aja (misal ajak lanjut nanti, atau pamit gak formal). Jangan kata "siap".` },
  ];
  for (let i = 0; i < turnDefs.length; i++) {
    const t = turnDefs[i];
    if (i > 0) await sleep(8000);
    await setStatus(env, t.who, 'mengetik');
    let line = await aiSayRetry(env, t.who, t.build());
    last = line;
    await logMsg(env, t.who, t.to, line);
    await setStatus(env, t.who, 'bicara');
    if (notify) await notify(persona(t.who), line);
    await sleep(1200);
  }
  await setStatus(env, fromId, 'idle');
  await setStatus(env, toId, 'idle');
}


// ===== PERINTAH CEO: panggil / suruh ke tempat =====
// Frontend yang mengeksekusi gerakan via papan pesan (kind='goto').
export const PLACE_WORDS = {
  kantor: 'kantor', meja: 'meja', kerja: 'meja',
  ngopi: 'ngopi', pantry: 'ngopi', dapur: 'ngopi',
  gym: 'gym', olahraga: 'gym', lari: 'gym',
  nongkrong: 'nongkrong', santai: 'nongkrong', sofa: 'nongkrong',
  nonton: 'nonton', tv: 'nonton',
  tidur: 'tidur', istirahat: 'tidur',
  meeting: 'meeting', rapat: 'meeting'
};
export const PLACE_LABEL = {
  kantor: 'kantor', meja: 'meja kerjanya', ngopi: 'pantry', gym: 'gym',
  nongkrong: 'area santai', nonton: 'depan TV', tidur: 'ruang istirahat', meeting: 'ruang meeting'
};

// Suruh summoner mendatangi target lalu menyampaikan perintah; target lalu berjalan ke tempat.
export async function runSummon(env, summonerId, targetId, place, placeOnly) {
  const S = persona(summonerId), T = persona(targetId);
  if (!S || !T) throw new Error('karakter tidak dikenal');
  place = place || 'kantor';
  const label = PLACE_LABEL[place] || place;
  await setStatus(env, summonerId, 'mengetik');
  let line = await aiSay(env, summonerId, placeOnly
    ? `CEO menyuruhmu menyampaikan ke ${T.name} (${T.role}): "${dia_atau_kamu(T.name)} harus ke ${label} sekarang." Sampaikan dengan gaya bicaramu sendiri, satu kalimat.`
    : `CEO memanggil ${T.name} (${T.role}) ke ${label}. Kamu disuruh menyampaikannya. Sampaikan dengan gaya bicaramu sendiri, satu kalimat.`);
  if (!line || line.length < 8) line = `${T.name}! Kamu dicari CEO tuh, buruan ke ${label} 😄`;
  await logMsg(env, summonerId, targetId, line);
  await setStatus(env, summonerId, 'bicara');
  // avatar CEO ikut bergerak ke tempat tujuan (hadir, tanpa bicara)
  await logMsg(env, 'user', targetId, '(CEO menemui di ' + label + ')', 'ceogoto', place);

  // beri jeda agar dramaturgi jalan (summoner selesai bicara, target merespons)
  await sleep(3000);
  await setStatus(env, targetId, 'mengetik');
  let ack = await aiSay(env, targetId, `Baru saja ${S.name} (${S.role}) datang menyampaikan: "${line}" (kamu diminta ke ${label}). Jawab singkat dengan gaya bicaramu sendiri sambil berjalan ke sana.`);
  if (!ack || ack.length < 8) ack = `Oke, otw ke ${label} bentar ya!`;
  await logMsg(env, targetId, 'user', ack, 'goto', place);
  await setStatus(env, targetId, 'bicara');

  // notifikasi ke chat Telegram milik target (jika ada)
  try {
    const tTok = env['CHAR_' + targetId.toUpperCase() + '_TOKEN'];
    const row = await env.DB.prepare('SELECT chat_id FROM office_chat WHERE char = ?').bind(targetId).first();
    if (tTok && row && row.chat_id) await tgSend(tTok, row.chat_id, `${S.name} datang menyampaikan perintah CEO: <i>"${line}"</i>\n${T.name} sekarang menuju ${label} 🏃`);
  } catch (e) {}
  await sleep(15000);
  await setStatus(env, summonerId, 'idle');
  await setStatus(env, targetId, 'idle');
}
function dia_atau_kamu(n) { return n; }


// ===== PERINTAH CEO: meeting/rapat nyata =====
// Kedua karakter jalan ke ruang meeting, CEO hadir menyaksikan, lalu diskusi multi-giliran.
export async function runMeeting(env, aId, bId, topic) {
  const A = persona(aId), B = persona(bId);
  if (!A || !B) throw new Error('karakter tidak dikenal');
  topic = (topic || '').trim().slice(0, 200) || 'evaluasi kerja minggu ini';
  // CEO hadir duluan (diam, tanpa bubble)
  await logMsg(env, 'user', aId, '(CEO menuju ruang meeting)', 'ceogoto', 'meeting');
  await sleep(2000);
  await setStatus(env, aId, 'mengetik');
  let l1 = await aiSay(env, aId, `Kamu ada meeting sama ${B.name} (${B.role}) di ruang meeting soal "${topic}", CEO juga ada di situ. Buka obrolan natural dengan gaya bicaramu sendiri, 1-2 kalimat.`);
  if (!l1 || l1.length < 8) l1 = `Oke, soal ${topic} — ${B.name}, kamu gimana pandangannya?`;
  await logMsg(env, aId, bId, l1, 'goto', 'meeting');
  await setStatus(env, aId, 'bicara');
  await sleep(5000);
  await setStatus(env, bId, 'mengetik');
  let l2 = await aiSay(env, bId, `${A.name} (${A.role}) buka meeting soal "${topic}" dengan bilang: "${l1}". Jawab natural sambil jalan ke ruang meeting, 1-2 kalimat, gaya bicaramu sendiri.`);
  if (!l2 || l2.length < 8) l2 = `Menurutku sih ${topic} tuh perlu dibahas pelan-pelan. Aku ada beberapa ide nih.`;
  await logMsg(env, bId, aId, l2, 'goto', 'meeting');
  await setStatus(env, bId, 'bicara');
  let last = l2;
  for (let i = 0; i < 2; i++) {
    const who = i % 2 === 0 ? aId : bId, other = i % 2 === 0 ? bId : aId;
    const P = persona(other);
    await sleep(7000);
    await setStatus(env, who, 'mengetik');
    let line = await aiSay(env, who, `Kamu lagi meeting sama ${P.name} (${P.role}) soal "${topic}", CEO nyimak dari deket. ${P.name} barusan bilang: "${last}". Tanggapi natural — setuju, nambahin ide, bercanda dikit, atau nanya balik. Jangan "siap/oke" doang. 1-2 kalimat.`);
    if (!line || line.length < 8) break;
    last = line;
    await logMsg(env, who, other, line);
    await setStatus(env, who, 'bicara');
  }
  await sleep(4000);
  await setStatus(env, aId, 'mengetik');
  let end = await aiSay(env, aId, `Meeting soal "${topic}" sama ${B.name} udah selesai. Tutup natural — kesimpulan singkat atau ajakan balik kerja. 1 kalimat, gaya bicaramu sendiri.`);
  if (end && end.length >= 8) await logMsg(env, aId, bId, end);
  await sleep(10000);
  await setStatus(env, aId, 'idle');
  await setStatus(env, bId, 'idle');
}
