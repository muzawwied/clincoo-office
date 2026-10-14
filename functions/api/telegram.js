// Webhook Telegram tiap karakter: /api/telegram?c=rafa&s=<token bot>
export async function onRequestPost({ request, env, waitUntil }) {
  try {
    const url = new URL(request.url);
    const c = String(url.searchParams.get('c') || '').toLowerCase();
    const s = String(url.searchParams.get('s') || '');
    const token = env['CHAR_' + c.toUpperCase() + '_TOKEN'];
    if (!token || s !== token) return Response.json({ ok: false }, { status: 403 });

    const { ensureSchema, persona, aiSay, logMsg, setStatus, tgSend, runDialogue, runSummon, PLACE_WORDS } = await import('./_lib.js');
    await ensureSchema(env);
    const P = persona(c);
    if (!P) return Response.json({ ok: false }, { status: 404 });

    const body = await request.json().catch(() => ({}));
    const msg = body.message || body.edited_message || {};
    const chatId = msg.chat && msg.chat.id;
    const text = String(msg.text || '').trim();
    if (!chatId) return Response.json({ ok: true });

    await env.DB.prepare('INSERT INTO office_chat (char, chat_id) VALUES (?, ?) ON CONFLICT(char) DO UPDATE SET chat_id = ?2').bind(c, String(chatId)).run();

    // CEO (pemilik) berbicara di kantor: pesan user tampil via avatar Vylonium
    if (text && !text.startsWith('/')) await logMsg(env, 'user', c, text);

    // ===== PERINTAH: panggil/suruh <nama> [ke <tempat>] =====
    const cmd = text.match(/^(?:panggil(?:in)?|suruh|tolong\s+panggil)\s+(rafa|dimas|sari|bagas)\b(?:\s+(?:ke|pergi\s+ke|menuju)\s+([a-z]+))?/i);
    if (cmd) {
      const target = cmd[1].toLowerCase();
      let place = cmd[2] ? (PLACE_WORDS[cmd[2].toLowerCase()] || null) : 'kantor';
      if (!place) place = 'kantor';
      const T = persona(target);
      await tgSend(token, chatId, `Siap! Aku panggil <b>${T.name}</b> ke ${place === 'meja' ? 'meja kerjanya' : place} sekarang. Pantau dia jalan di vylonium.biz.id 🏃`);
      waitUntil(runSummon(env, c, target, place).catch(() => {}));
      return Response.json({ ok: true });
    }

    // ===== PERINTAH: ke <tempat> (karakter ini sendiri yang bergerak) =====
    const goCmd = text.match(/^(?:ke|pergi(?:\s+ke)?|menuju)\s+([a-z]+)\b/i);
    if (goCmd && PLACE_WORDS[goCmd[1].toLowerCase()]) {
      const place = PLACE_WORDS[goCmd[1].toLowerCase()];
      await tgSend(token, chatId, `Oke! Aku ke ${place === 'meja' ? 'meja kerjaku' : place} dulu ya, lihat aku jalan di vylonium.biz.id 🏃`);
      waitUntil((async () => {
        const { aiSay: say, setStatus: setS, logMsg: log } = await import('./_lib.js');
        await setS(env, c, 'mengetik');
        let line = await say(env, c, `CEO menyuruhmu ke ${place === 'meja' ? 'meja kerjamu' : place}. Jawab satu kalimat singkat dengan gaya bicaramu, kamu akan jalan ke sana.`);
        if (!line || line.length < 8) line = 'Oke, aku jalan ke sana sekarang!';
        await log(env, c, 'user', line, 'goto', place);
        await setS(env, c, 'bicara');
        await new Promise(r => setTimeout(r, 15000));
        await setS(env, c, 'idle');
      })().catch(() => {}));
      return Response.json({ ok: true });
    }

    if (text.startsWith('/start')) {
      await tgSend(token, chatId, `Halo! Aku ${P.name}, ${P.role} di Clincoo Office 🏢\n\nNgobrol langsung aja denganku di sini, atau suruh aku ngobrol dengan rekan kerja:\n<code>ke Dimas: bahas deploy besok</code>\n\nRuang kantor kami: vylonium.biz.id`);
      await logMsg(env, c, 'kantor', `(${P.name} menyapa seseorang lewat Telegram)`);
      return Response.json({ ok: true });
    }

    // pola ajak rekan: "ke <nama> [:] <topik>" / "@<nama> <topik>"
    const m = text.match(/^(?:ke|kepada|ajak|dengan|sama)\s+(rafa|dimas|sari|bagas)\b[\s:,-]*(.*)$/i) || text.match(/^@(rafa|dimas|sari|bagas)\s+(.*)$/i);
    if (m && m[1].toLowerCase() !== c) {
      const target = m[1].toLowerCase();
      const topic = (m[2] || 'pekerjaan hari ini').trim();
      const T = persona(target);
      await tgSend(token, chatId, `Siap! Aku ajak ${T.name} ngobrol soal: <i>${topic}</i>. Lihat kami di papan nama → vylonium.biz.id 🏢`);
      const notify = async (who, line) => { await tgSend(token, chatId, `<b>${who.name}</b> → ${T.name}: ${line}`); };
      waitUntil(runDialogue(env, c, target, topic, notify).catch(() => {}));
      return Response.json({ ok: true });
    }

    // obrolan langsung dengan sang karakter
    await setStatus(env, c, 'mengetik');
    const reply = await aiSay(env, c, `CEO kamu (pemilik Clincoo, panggil saja "Boss") ngobrol denganmu lewat Telegram dan berkata: "${text}". Balas sebagai ${P.name} dengan hormat tapi tetap santai.`);
    const out = reply || 'Hmm, koneksi otakku lagi lambat, coba tanya lagi ya.';
    await logMsg(env, c, 'user', out);
    await setStatus(env, c, 'idle');
    await tgSend(token, chatId, out);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ ok: false, error: String((e && e.message) || e) }, { status: 500 });
  }
}
