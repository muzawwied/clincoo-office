// Webhook Telegram tiap karakter: /api/telegram?c=rafa&s=<token bot>
export async function onRequestPost({ request, env, waitUntil }) {
  try {
    const url = new URL(request.url);
    const c = String(url.searchParams.get('c') || '').toLowerCase();
    const s = String(url.searchParams.get('s') || '');
    const token = env['CHAR_' + c.toUpperCase() + '_TOKEN'];
    if (!token || s !== token) return Response.json({ ok: false }, { status: 403 });

    const { ensureSchema, persona, aiSay, aiChatRetry, logMsg, setStatus, tgSend, runDialogue, runSummon, runMeeting, scheduleRun, hasPendingRun, PLACE_WORDS, ghCreateIssue, ghGetPR, ghGetPRFiles, ghCommentIssue } = await import('./_lib.js');
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

    // ===== KERJAAAN NYATA: GitHub =====
    const gi = text.match(/^(?:suruh(?:in)?\s+|panggil(?:in)?\s+|ajak\s+)?(rafa|dimas|sari|bagas)?[,.;!\s]*(?:bikin|buat|buka|hmm.*?)?\s*(?:bikin|buat|buka)?\s*(?:issue|tiket|task|tugas)\s*[:\-]?\s*(.+)$/i);
    if (gi) {
      const who = (gi[1] || c).toLowerCase();
      const title = gi[2].trim().slice(0, 300);
      const P = persona(who);
      const body = (await aiChatRetry(env, who, `Kamu ${P.name}, ${P.role} di Clincoo. CEO minta kamu bikin issue GitHub berjudul: "${title}". Tulis body issue dalam Markdown GitHub: deskripsi singkat masalah/tugas (2-4 baris), checklist langkah kerja pakai '- [ ]', dan kriteria selesai. Langsung isi, tanpa kalimat pembuka.`)) ||
        `## ${title}\n\nDibuat oleh ${P.name} (${P.role}).\n\n### Checklist\n- [ ] Analisa kebutuhan\n- [ ] Pengerjaan\n- [ ] Review & merge`;
      const iss = await ghCreateIssue(env, who, title, body);
      if (iss) {
        await tgSend(token, chatId, `✅ <b>${P.name}</b> bikin issue <a href="${iss.url}">#${iss.number}</a> di GitHub:\n<b>${title}</b>`);
        await logMsg(env, who, 'user', `Boss, issue #${iss.number} udah aku bikin: ${title}`);
        await setStatus(env, who, 'bicara');
      } else {
        await tgSend(token, chatId, `Hmm, ${P.name} gagal bikin issue 😢 Cek token GitHub (env GITHUB_TOKEN) di Cloudflare Pages.`);
      }
      return Response.json({ ok: true });
    }
    const gr = text.match(/^(?:suruh(?:in)?\s+)?(rafa|dimas|sari|bagas)?\s*review\s+(?:pr|pull\s*request)?\s*#?(\d+)/i);
    if (gr) {
      const who = (gr[1] || c).toLowerCase();
      const n = Number(gr[2]);
      const pr = await ghGetPR(env, n);
      if (!pr) { await tgSend(token, chatId, `PR #${n} gak ketemu di repo 😅`); return Response.json({ ok: true }); }
      const files = (await ghGetPRFiles(env, n)) || [];
      const diff = files.slice(0, 20).map(f => `- ${f.status}: ${f.filename} (+${f.additions}/-${f.deletions})${f.patch ? '\n\`\`\`\n' + String(f.patch).slice(0, 400) + '\n\`\`\`' : ''}`).join('\n').slice(0, 3500);
      const P = persona(who);
      const review = await aiChatRetry(env, who, `Kamu ${P.name}, ${P.role}. Kamu diminta review PR #${n} "${pr.title}".\nPerubahan:\n${diff || '(gak bisa ambil diff)'}\n\nTulis review dalam Bahasa Indonesia santai: kesan umum, 2-3 poin penting (kekuatan atau risiko), dan saran perbaikan. Markdown GitHub, langsung ke inti.`);
      if (review) {
        const cm = await ghCommentIssue(env, n, `**Review dari ${P.name} (${P.role}):**\n\n${review}`);
        await tgSend(token, chatId, cm ? `✅ <b>${P.name}</b> udah nge-review PR <a href="${cm.url}">#${n} ${pr.title}</a>` : `Review jadi tapi gagal ke-post di PR 😢`);
        await logMsg(env, who, 'user', `Boss, review PR #${n} (${pr.title}) udah aku post di GitHub.`);
        await setStatus(env, who, 'bicara');
      } else {
        await tgSend(token, chatId, `${P.name} lagi gak bisa nyusun review (AI down) 😢 coba lagi bentar.`);
      }
      return Response.json({ ok: true });
    }

    // ===== PERINTAH: meeting/rapat nyata =====
    if (/rapat|meet(?:ing|in|t)|meating|metting/i.test(text) && text.length <= 140 && !text.includes('?')) {
      const uniq = [];
      for (const n of (text.toLowerCase().match(/\b(rafa|dimas|sari|bagas)\b/g) || []))
        if (!uniq.includes(n)) uniq.push(n);
      let a = uniq[0] || c;               // tanpa nama: bot ini yang rapat
      let b = uniq[1] || (a !== c ? c : ['rafa','dimas','sari','bagas'].filter(x => x !== a)[Math.floor(Math.random() * 3)]);
      const tm = text.match(/(?:soal|tentang|ttg|about)\s+(.+)$/i);
      const topic = tm ? tm[1].trim().slice(0, 200) : 'evaluasi kerja minggu ini';
      if (a !== b) {
        const P1 = persona(a), P2 = persona(b);
        if (await hasPendingRun(env)) {
          await tgSend(token, chatId, `Masih ada meeting lain yang jalan nih 🕐 Aku nyusul setelah itu ya — pantau aja di vylonium.biz.id`);
          return Response.json({ ok: true });
        }
        await tgSend(token, chatId, `Siap, <b>${P1.name}</b> sama <b>${P2.name}</b> meeting soal <i>${topic}</i> di ruang meeting 📋 Lihat aksinya di vylonium.biz.id`);
        await scheduleRun(env, 'meeting', { a, b, topic });
        waitUntil(fetch(new URL(request.url).origin + '/api/director', {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-key': env.ADMIN_KEY }, body: '{}'
        }).catch(() => {}));
        return Response.json({ ok: true });
      }
    }

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
    const reply = await aiChatRetry(env, c, `CEO kamu (pemilik Clincoo, panggil saja "Boss") ngobrol denganmu lewat Telegram dan berkata: "${text}". Balas sebagai ${P.name} dengan hormat tapi tetap santai.`);
    const FALL = [
      'Aduh, sinyal ke otakku lagi garing 😅 boleh ulangi, Boss?',
      'Maaf Boss, barusan kepotot — ulangi sekali lagi ya!',
      'Hmm gagal nangkep tuh 😅 sekali lagi boleh?'
    ];
    const out = reply || FALL[Math.floor(Math.random() * FALL.length)];
    await logMsg(env, c, 'user', out);
    await setStatus(env, c, 'idle');
    await tgSend(token, chatId, out);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ ok: false, error: String((e && e.message) || e) }, { status: 500 });
  }
}
