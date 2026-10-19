// Webhook Telegram tiap karakter: /api/telegram?c=rafa&s=<token bot>
export async function onRequestPost({ request, env, waitUntil }) {
  try {
    const url = new URL(request.url);
    const c = String(url.searchParams.get('c') || '').toLowerCase();
    const s = String(url.searchParams.get('s') || '');
    let token = env['CHAR_' + c.toUpperCase() + '_TOKEN'];
    if (!token || s !== token) {
      try { const r = await env.DB.prepare('SELECT tg_token FROM office_bots WHERE id = ?').bind(c).first(); if (r && r.tg_token && s === r.tg_token) token = r.tg_token; } catch (e) {}
    }
    if (!token || s !== token) return Response.json({ ok: false }, { status: 403 });

    const { ensureSchema, ensurePersonas, persona, aiSay, aiChatRetry, logMsg, setStatus, tgSend, runDialogue, runSummon, scheduleRun, hasPendingRun, PLACE_WORDS, ghCreateIssue, ghGetPR, ghGetPRFiles, ghCommentIssue, ghList, webFindReplace, cfDeploy, cfStatus, cfDomains, pickStaff, enrichBotNames, getSetting, setSetting } = await import('./_lib.js');
    await ensureSchema(env);
    await ensurePersonas(env);
    await enrichBotNames(env); // [18 Okt] nama persona = nama bot resmi (tanpa kata 'bot')
    const P = persona(c);
    if (!P) return Response.json({ ok: false }, { status: 404 });

    const body = await request.json().catch(() => ({}));
    const msg = body.message || body.edited_message || {};
    const chatId = msg.chat && msg.chat.id;
    const fromId = msg.from && msg.from.id;
    const fromName = (msg.from && (msg.from.first_name || msg.from.username)) || ('id ' + fromId);
    const isBotSender = !!(msg.from && msg.from.is_bot);
    const text = String(msg.text || '').trim();
    if (!chatId) return Response.json({ ok: true });

    // ===== [18 Okt, arahan Boss] KEAMANAN: bot khusus Boss =====
    // 1) Hanya grup kantor Boss (boss_group_id) dan DM Boss (boss_tg_id) yang diproses.
    // 2) boss_tg_id DIKUNCI dari pengirim manusia pertama di grup kantor —
    //    setelah terkunci, pengirim lain (termasuk pendatang di grup) DITOLAK.
    // 3) Pesan dari pihak tak dikenal TIDAK diproses; Boss dapat notifikasi
    //    (maks 1 per 10 menit) — bukan diam-diam.
    const groupId = await getSetting(env, 'boss_group_id');
    let bossId = await getSetting(env, 'boss_tg_id');
    if (!bossId && groupId && String(chatId) === String(groupId) && fromId && !isBotSender) {
      bossId = String(fromId);
      await setSetting(env, 'boss_tg_id', bossId); // kunci pertama: Boss
    }
    const chatAllowed = String(chatId) === String(groupId) || (bossId && String(chatId) === bossId);
    const senderAllowed = !bossId || isBotSender || String(fromId) === bossId;
    if (!chatAllowed || !senderAllowed) {
      try {
        const lastN = Number(await getSetting(env, 'intrude_notified_at') || 0);
        if (Date.now() - lastN > 10 * 60 * 1000) {
          await setSetting(env, 'intrude_notified_at', String(Date.now()));
          const ctx = text.slice(0, 80);
          if (groupId) await tgSend(token, groupId, '⚠️ <b>Peringatan keamanan</b>\nPesan dari pengirim tak dikenal ditolak:\n👤 ' + String(fromName) + ' (id <code>' + fromId + '</code>)' + (ctx ? '\n💬 "' + ctx + '"' : '') + '\nBot ini khusus Boss. Pesan tidak diproses.');
        }
      } catch (e) {}
      return Response.json({ ok: true }); // tolak diam-diam utk si penyusup
    }

    // binding chat hanya untuk chat yang DIIZINKAN (dulu: siapa pun bisa membajak)
    await env.DB.prepare('INSERT INTO office_chat (char, chat_id) VALUES (?, ?) ON CONFLICT(char) DO UPDATE SET chat_id = ?2').bind(c, String(chatId)).run();
    // [18 Okt, arahan Boss] catat user Clincoo (real-time) setiap ada yang chat bot
    // — dengan guard di atas, hanya Boss yang tercatat
    try {
      const fu = msg.from || {};
      if (fu.id) {
        await env.DB.prepare('CREATE TABLE IF NOT EXISTS office_users (id TEXT PRIMARY KEY, name TEXT, first_seen REAL, last_seen REAL)').run();
        const now = Date.now() / 1000;
        await env.DB.prepare('INSERT INTO office_users (id, name, first_seen, last_seen) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, last_seen = excluded.last_seen')
          .bind(String(fu.id), String(fu.first_name || fu.username || 'user'), now, now).run();
      }
    } catch (e) {}
    // [18 Okt] hitung penjawab grup SEKALI di awal (deterministik di semua bot):
    // dipakai untuk log papan (1x saja) dan memilih siapa yang menjawab.
    const _isGroup = String(chatId) === String(groupId || '') && !text.startsWith('/');
    let _resp = c;
    if (_isGroup) {
      const RESP = ['rafa', 'dimas', 'sari'];
      const NAME_MAP = { muzawwied: 'rafa', rafa: 'rafa', vylonium: 'dimas', dimas: 'dimas', devconium: 'sari', sari: 'sari' };
      const low = text.toLowerCase();
      const mm = low.match(/\b(muzawwied|rafa|vylonium|dimas|devconium|sari)\b/);
      if (mm) _resp = NAME_MAP[mm[1]];
      else if (/\b(bug|error|data|user|deploy|kode|code|desain|design|ui|ux|frontend|backend|server|database|statistik|proyek|halaman|issue|github|pr|commit)\b/.test(low)) _resp = pickStaff(low);
      else _resp = RESP[(Number(msg.message_id) || 0) % 4];
    }

    // CEO (pemilik) berbicara di kantor: pesan user tampil via avatar Vylonium
    // (pesan grup hanya dicatat SEKALI oleh penjawab, bukan 4x oleh semua bot)
    if (text && !text.startsWith('/') && (!_isGroup || c === _resp)) await logMsg(env, 'user', c, text);

    // ===== KERJAAAN NYATA: GitHub =====
    const gi = text.match(/^(?:suruh(?:in)?\s+|panggil(?:in)?\s+|ajak\s+)?(rafa|dimas|sari)?[,.;!\s]*(?:bikin|buat|buka|hmm.*?)?\s*(?:bikin|buat|buka)?\s*(?:issue|tiket|task|tugas)\s*[:\-]?\s*(.+)$/i);
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
    const gl = text.match(/^(?:daftar|list|lihat|cek|show)\s+(issue|issues|tiket|pr|pull|pr\\s|repo)/i) || text.match(/^(?:ada|open)\s+(?:issue|pr)\s*\?*$/i);
    if (gl) {
      const kind = /pr|pull/.test(text) ? 'pr' : 'issue';
      const items = await ghList(env, kind);
      if (items === null) { await tgSend(token, chatId, 'Gak bisa ngambil dari GitHub 😢 cek token di Pages settings.'); return Response.json({ ok: true }); }
      if (!items.length) { await tgSend(token, chatId, kind === 'pr' ? 'Belum ada PR terbuka 👌' : 'Belum ada issue terbuka 👌'); return Response.json({ ok: true }); }
      const lines = items.map((x) => `<a href="${x.url}">#${x.n}</a> ${x.t.slice(0, 60)}`).join('\n');
      await tgSend(token, chatId, `📋 <b>${kind === 'pr' ? 'PR terbuka' : 'Issue terbuka'}:</b>\n${lines}`);
      return Response.json({ ok: true });
    }
    const gr = text.match(/^(?:suruh(?:in)?\s+)?(rafa|dimas|sari)?\s*review\s+(?:pr|pull\s*request)?\s*#?(\d+)/i);
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

    // ===== KONTROL NYATA WEB (GitHub + Cloudflare) =====
    const uw = text.match(/^(?:suruh\s+\w+\s+)?update\s+web\s*:?[\s]*(?:ganti|ubah)\s+(.+?)\s+(?:jadi|menjadi|dengan)\s+(.+)$/i);
    if (uw) {
      const r = await webFindReplace(env, uw[1], uw[2]);
      if (r.ok) {
        await tgSend(token, chatId, `✅ Web <b>benar-benar diubah</b> & ter-commit <code>${r.commit}</code> di ${r.file}${r.deployed ? ', deploy Cloudflare udah diterbitkan' : ' (deploy belum sukses — cek status web)'} 🔗 cek klinco web kamu`);
        await logMsg(env, c, 'user', `Boss, teks web udah aku ubah beneran: "${String(uw[1]).slice(0, 50)}" jadi "${String(uw[2]).slice(0, 50)}" (${r.commit})`);
        await setStatus(env, c, 'bicara');
      } else {
        await tgSend(token, chatId, `Gagal: ${r.error}`);
      }
      return Response.json({ ok: true });
    }
    const dp = text.match(/^(?:deploy|terbitkan)(?:\s+(?:ulang|web|situs|website|lagi))*\s*$/i);
    if (dp) {
      const ok = await cfDeploy(env);
      await tgSend(token, chatId, ok ? '✅ Deploy baru udah diterbitkan ke Cloudflare Pages — sebentar lagi live.' : 'Gagal trigger deploy 😢 cek token Cloudflare di Pages settings.');
      await logMsg(env, c, 'user', 'Boss, deploy web baru udah aku terbitkan di Cloudflare.');
      return Response.json({ ok: true });
    }
    const ws = text.match(/^(?:status|cek)\s+(?:web|deploy|situs|website)\s*$/i);
    if (ws) {
      const st = await cfStatus(env);
      const dm = await cfDomains(env);
      const dl = dm.map((x) => `${x.name}: ${x.status}`).join(' · ') || '-';
      await tgSend(token, chatId, st
        ? `📊 Status web:<b> ${st.status}</b> (${st.stage || '-'})\nDomain: ${dl}\nDeploy terakhir: ${new Date(st.created).toLocaleString('id-ID')}`
        : 'Gak bisa ngambil status 😢 cek token Cloudflare.');
      return Response.json({ ok: true });
    }

    // ===== PERINTAH: meeting/rapat nyata =====
    if (/rapat|meet(?:ing|in|t)|meating|metting/i.test(text) && text.length <= 140 && !text.includes('?')) {
      const uniq = [];
      for (const n of (text.toLowerCase().match(/\b(rafa|dimas|sari)\b/g) || []))
        if (!uniq.includes(n)) uniq.push(n);
      let a = uniq[0] || c;               // tanpa nama: bot ini yang rapat
      let b = uniq[1] || (a !== c ? c : ['rafa','dimas','sari'].filter(x => x !== a)[Math.floor(Math.random() * 2)]);
      const tm = text.match(/(?:soal|tentang|ttg|about)\s+(.+)$/i);
      const topic = tm ? tm[1].trim().slice(0, 200) : [
        'fitur baru buat Clincoo Office',
        'cara biar Clincoo makin dikenal orang',
        'performa Clincoo di HP kelas menengah',
        'desain landing page Clincoo',
        'bug paling sering muncul di Clincoo dan cara ngatasinnya',
        'roadmap Clincoo bulan depan',
        'biar onboarding Clincoo makin gampang',
        'ide fitur sosial buat Clincoo Office'
      ][Math.floor(Math.random() * 8)];
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
    const cmd = text.match(/^(?:panggil(?:in)?|suruh|tolong\s+panggil)\s+(rafa|dimas|sari)\b(?:\s+(?:ke|pergi\s+ke|menuju)\s+([a-z]+))?/i);
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

    // === TANYA CEO: Boss nanya → CEO jalan ke petugas → balik ke kantor → jawab Boss ===
    const mCeo = text.match(/^(?:ceo[:,\s]+|tanya ceo[:,\s]*)(.+)$/i);
    if (c === 'ceo' || mCeo) {
      const q = (mCeo ? mCeo[1] : text).trim().slice(0, 300) || 'status kerja tim hari ini';
      const staff = pickStaff(q);
      await scheduleRun(env, 'consult', { q, staff, chatId, bot: (c === 'ceo' ? null : c) });
      await tgSend(token, chatId, 'Oke, aku tanya langsung ke ' + staff + ' di mejanya dulu ya, Boss. Pantau aku jalan di papan kantor 🚶');
      waitUntil(fetch(new URL(request.url).origin + '/api/director', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-key': env.ADMIN_KEY }, body: '{}' }).catch(() => {}));
      return Response.json({ ok: true });
    }

    // [18 Okt, arahan Boss] DI GRUP: hanya SATU penjawab — bukan 4 jawaban
    // berbeda. Semua bot menghitung penjawab yang sama sendiri-sendiri
    // (deterministik, tanpa balapan): sebut nama -> karakter itu; topik kerja
    // (data/bug/desain/frontend) -> petugas relevan via pickStaff; obrolan umum
    // -> bergilir rapi per pesan.
    if (_isGroup && c !== _resp) return Response.json({ ok: true }); // bukan giliranku, biarkan penjawab yang bicara

    // obrolan langsung dengan sang karakter — DENGAN MEMORI NYATA dari papan + aturan anti-halusinasi
    await setStatus(env, c, 'mengetik');
    let ctx = '';
    try {
      const h = await env.DB.prepare('SELECT from_c, text FROM office_msg WHERE (from_c = ?1 OR to_c = ?1) AND (from_c = \'user\' OR to_c = \'user\') AND text != \'\' ORDER BY id DESC LIMIT 6').bind(c).all();
      ctx = (h.results || []).reverse().map(r => (r.from_c === 'user' ? 'Boss: ' : 'Kamu: ') + String(r.text).slice(0, 140)).join('\n');
    } catch (e) {}
    // [18 Okt] Boss nanya soal data user/proyek -> tarik angka NYATA dari app Clincoo
    let appFacts = '';
    try { const { clincooAppStats } = await import('./_lib.js');
      if (/jumlah|berapa|statistik|total|data/.test(text) && /user|pengguna|proyek|project|sesi|pendaftar|akun/i.test(text)) {
        appFacts = await clincooAppStats(env) || '';
      }
    } catch (e) {}
    const reply = await aiChatRetry(env, c, `Riwayat obrolanmu dengan Boss (terbaru di bawah):
${ctx}${appFacts ? '\n\nFAKTA NYATA dari database Clincoo (WAJIB pakai angka ini, sebut angkanya, jangan karang): ' + appFacts : ''}

Boss barusan berkata: "${text}". Balas sebagai ${P.name} (${P.role}) dengan hormat tapi santai. PENTING, JANGAN LANGGAR: (a) Jangan pernah mengklaim pekerjaan/hasil/cek sudah selesai kalau kamu TIDAK benar-benar melakukannya — kalau Boss minta hasil dan belum ada hasil nyata, jujur bilang belum ada hasil, lalu tawarkan langkah nyata berikutnya. (b) Jangan bilang "lagi di-scan/di-cek/di-proses" kalau tidak ada proses beneran yang jalan. (c) Jangan minta Boss yang kirim hasil/link/file — itu tugasmu. (d) Data yang benar-benar ada di sistem hanya yang ada di FAKTA NYATA — kalau Boss minta data yang tidak ada di sana, jujur bilang datanya belum ada, dan sebut apa yang bisa kamu cek nyata. (e) Kalau di riwayat kamu pernah bilang sudah selesai/sudah push tapi tidak ada buktinya di FAKTA NYATA, akui jujur klaim itu keliru — jangan dipertahankan. Kamu TIDAK bisa push/upload apa pun lewat obrolan ini, jadi jangan pernah menjanjikan itu; kalau perlu aksi GitHub, minta Boss pakai perintah 'bikin issue' atau tanya CEO.`);
    if (!reply) {
      // AI gangguan: kabar jujur, bukan obrolan palsu — dan jangan kotorkan papan kantor
      await tgSend(token, chatId, '⚠️ Otak AI ' + P.name + ' lagi gangguan, pesanmu belum keproses. Coba kirim lagi sebentar ya, Boss.');
      return Response.json({ ok: true });
    }
    const out = reply;
    await logMsg(env, c, 'user', out);
    await setStatus(env, c, 'idle');
    await tgSend(token, chatId, out);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ ok: false, error: String((e && e.message) || e) }, { status: 500 });
  }
}
