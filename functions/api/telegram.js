// Webhook Telegram tiap karakter: /api/telegram?c=rafa&s=<token bot>
export async function onRequestPost({ request, env, waitUntil }) {
  try {
    const url = new URL(request.url);
    const c = String(url.searchParams.get('c') || '').toLowerCase();
    const s = String(url.searchParams.get('s') || '');
    const token = env['CHAR_' + c.toUpperCase() + '_TOKEN'];
    if (!token || s !== token) return Response.json({ ok: false }, { status: 403 });

    const { ensureSchema, persona, aiSay, logMsg, setStatus, tgSend, runDialogue } = await import('./_lib.js');
    await ensureSchema(env);
    const P = persona(c);
    if (!P) return Response.json({ ok: false }, { status: 404 });

    const body = await request.json().catch(() => ({}));
    const msg = body.message || body.edited_message || {};
    const chatId = msg.chat && msg.chat.id;
    const text = String(msg.text || '').trim();
    if (!chatId) return Response.json({ ok: true });

    await env.DB.prepare('INSERT INTO office_chat (char, chat_id) VALUES (?, ?) ON CONFLICT(char) DO UPDATE SET chat_id = ?2').bind(c, String(chatId)).run();

    if (text.startsWith('/start')) {
      await tgSend(token, chatId, `Halo! Aku ${P.name}, ${P.role} di Clincoo Office 🏢\n\nNgobrol langsung aja denganku di sini, atau suruh aku ngobrol dengan rekan kerja:\n<code>ke Dimas: bahas deploy besok</code>\n\nRuang kantor kami: vylonium.biz.id`);
      await logMsg(env, c, 'kantor', `(${P.name} menyapa seseorang lewat Telegram)`);
      return Response.json({ ok: true });
    }

    // pola ajak rekan: "ke <nama> [:] <topik>" / "@<nama> <topik>"
    const m = text.match(/^(?:ke|kepada|ajak|dengan|sama)\s+(rafa|dimas|sari)\b[\s:,-]*(.*)$/i) || text.match(/^@(rafa|dimas|sari)\s+(.*)$/i);
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
    const reply = await aiSay(env, c, `Seseorang ngobrol denganmu lewat Telegram dan berkata: "${text}". Balas sebagai ${P.name}.`);
    const out = reply || 'Hmm, koneksi otakku lagi lambat, coba tanya lagi ya.';
    await logMsg(env, c, 'user', out);
    await setStatus(env, c, 'idle');
    await tgSend(token, chatId, out);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ ok: false, error: String((e && e.message) || e) }, { status: 500 });
  }
}
