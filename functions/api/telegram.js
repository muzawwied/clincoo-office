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

    const { ensureSchema, ensurePersonas, persona, aiSay, aiChatRetry, logMsg, setStatus, tgSend, runDialogue, runSummon, scheduleRun, hasPendingRun, PLACE_WORDS, ghCreateIssue, ghGetPR, ghGetPRFiles, ghCommentIssue, ghList, webFindReplace, cfDeploy, cfStatus, cfDomains, clincooFindReplace, clincooDeploy, clincooStatus, resolveName, NAME_PATTERN, clincooRepoInfo, clincooReadPath, cfProjects } = await import('./_lib.js');
    await ensureSchema(env);
    await ensurePersonas(env);
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

    // ===== SATU PENJAWAB DI GRUP =====
    // Di grup ada 4 bot yang menerima pesan yang sama. Yang menjawab: bot yang disebut namanya;
    // kalau tidak ada nama, hanya Muzawwied (CEO). Bot lain diam supaya tidak 4x jawaban sama.
    const isGroup = msg.chat && (msg.chat.type === 'group' || msg.chat.type === 'supergroup');
    const mentioned = [...new Set((text.toLowerCase().match(/\b(muzawwied|vylonium|devconium|clincoo|rafa|dimas|sari|bagas|maya|raka|nadia|lina|joko|tini)\b/g) || []).map(resolveName))];
    const isCmdForOther = /^(?:ke|kepada|ajak|dengan|sama|suruh(?:in)?|panggil(?:in)?|tolong\s+panggil)\s+(?:muzawwied|vylonium|devconium|clincoo|rafa|dimas|sari|bagas|maya|raka|nadia|lina|joko|tini)\b/i.test(text) || /^@(?:muzawwied|vylonium|devconium|clincoo|rafa|dimas|sari|bagas|maya|raka|nadia|lina|joko|tini)\s/i.test(text);
    if (isGroup && text && !text.startsWith('/') && !isCmdForOther) {
      const responder = mentioned.length ? mentioned[0] : 'rafa';
      if (responder !== c) return Response.json({ ok: true });
    }

    // ===== BACA NYATA: repo Clincoo, file, deploy, Cloudflare =====
    // "list repo", "cek github", "status web", "lihat file X", "buka file X", "cek cloudflare"
    const wantFile = text.match(/^(?:buka|baca|lihat|isi|cek)\s+(?:file|isi)\s+([\w\-./]+)/i);
    const wantRepo = /^(?:list|daftar|lihat|cek|show|status)\s+(?:repo|repositori|repository|github|git|kode|code|web|situs|website)(?:\s+clincoo)?\s*\??$/i.test(text) || /\b(?:cek|periksa|lihat)\s+(?:repo|github)\b/i.test(text);
    const wantCf = /^(?:list|daftar|lihat|cek|show|status)\s+(?:cloudflare|pages|project|proyek|deploy)\b/i.test(text);
    if (wantFile || wantRepo || wantCf) {
      await setStatus(env, c, 'mengetik');
      let facts = '';
      if (wantFile) {
        const f = await clincooReadPath(env, wantFile[1]);
        if (!f) facts = `Gagal membaca "${wantFile[1]}" dari repo muzawwied/Clincoo (tidak ada atau token tidak punya akses).`;
        else if (f.kind === 'dir') facts = `Isi folder ${f.path}/ di repo Clincoo (${f.items.length} item):\n` + f.items.slice(0, 80).join('\n');
        else if (f.kind === 'file') facts = `File ${f.path} (${f.size} byte) di repo Clincoo. Cuplikan awal:\n` + f.text.slice(0, 1800);
        else facts = `File ${f.path} (${f.size} byte) bukan teks / terlalu besar untuk ditampilkan.`;
      } else if (wantCf) {
        const pj = await cfProjects(env);
        facts = pj ? 'Project Cloudflare Pages (nyata dari API):\n' + pj.map((p) => `- ${p.name}${p.domains.length ? ' [' + p.domains.join(', ') + ']' : ''} · deploy terakhir: ${p.last}`).join('\n') : 'Gagal mengambil daftar project Cloudflare (cek CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID di Pages settings).';
      } else {
        const [ri, st] = await Promise.all([clincooRepoInfo(env), clincooStatus(env).catch(() => null)]);
        if (!ri) facts = 'Gagal membaca repo muzawwied/Clincoo (cek GITHUB_TOKEN di Pages settings).';
        else {
          facts = `Repo ${ri.repo} (${ri.private ? 'privat' : 'publik'}), branch ${ri.branch}, push terakhir ${ri.pushed}.\n` +
            `Isi root: ${ri.top.slice(0, 45).join(', ')}\n` +
            `Commit terbaru:\n` + ri.commits.map((x) => `- ${x.sha} ${x.msg}`).join('\n') + '\n' +
            `Issue terbuka: ${ri.issues.length ? ri.issues.map((i) => '#' + i.n + ' ' + i.title).join('; ') : 'tidak ada'}\n` +
            `PR terbuka: ${ri.prs.length ? ri.prs.map((i) => '#' + i.n + ' ' + i.title).join('; ') : 'tidak ada'}\n` +
            `Deploy Cloudflare terakhir: ${st ? st.status + ' (' + st.stage + ', ' + st.created + ')' : 'tidak terbaca'}`;
        }
      }
      // data NYATA ditampilkan utuh; AI hanya memberi komentar singkat atas data itu (tanpa mengarang)
      await tgSend(token, chatId, `<b>${P.name}</b> cek langsung ke sumbernya:\n<pre>${facts.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>`);
      const note = await aiChatRetry(env, c, `Kamu ${P.name}, ${P.role}. CEO minta: "${text}". Ini DATA NYATA hasil pengecekan (jangan menambah fakta di luar ini):\n${facts.slice(0, 2500)}\n\nKomentari singkat (1-3 kalimat, santai) apa yang kamu lihat dan beri saran langkah berikutnya jika ada. Jangan mengulang seluruh data.`);
      if (note) { await logMsg(env, c, 'user', note); await tgSend(token, chatId, note); }
      await setStatus(env, c, 'idle');
      return Response.json({ ok: true });
    }

    // ===== KERJAAAN NYATA: GitHub =====
    const gi = text.match(/^(?:suruh(?:in)?\s+|panggil(?:in)?\s+|ajak\s+)?(muzawwied|vylonium|devconium|clincoo|rafa|dimas|sari|bagas|maya|raka|nadia|lina|joko|tini)?[,.;!\s]*(?:bikin|buat|buka|hmm.*?)?\s*(?:bikin|buat|buka)?\s*(?:issue|tiket|task|tugas)\s*[:\-]?\s*(.+)$/i);
    if (gi) {
      const who = resolveName(gi[1] || c);
      const title = gi[2].trim().slice(0, 300);
      const P = persona(who);
      const body = (await aiChatRetry(env, who, `Kamu ${P.name}, ${P.role} di Clincoo. CEO minta kamu bikin issue GitHub berjudul: "${title}". Tulis body issue dalam Markdown GitHub: deskripsi singkat masalah/tugas (2-4 baris), checklist langkah kerja pakai '- [ ]', dan kriteria selesai. Langsung isi, tanpa kalimat pembuka.`)) ||
        `## ${title}\n\nDibuat oleh ${P.name} (${P.role}).\n\n### Checklist\n- [ ] Analisa kebutuhan\n- [ ] Pengerjaan\n- [ ] Review & merge`;
      const iss = await ghCreateIssue(env, who, title, body);
      if (iss) {
        await tgSend(token, chatId, `✅ <b>${P.name}</b> bikin issue <a href="${iss.url}">#${iss.number}</a> di GitHub:\n<b>${title}</b>`);
        const report = await aiChatRetry(env, who, `Kamu baru saja selesai membuat issue GitHub #${iss.number}: "${title}". Beritahu Boss dengan gaya bicaramu dalam 1 kalimat santai.`);
        if (report) {
          await logMsg(env, who, 'user', report);
          await setStatus(env, who, 'bicara');
        }
      } else {
        await tgSend(token, chatId, `Hmm, ${P.name} gagal bikin issue 😢 Cek token GitHub (env GITHUB_TOKEN) di Cloudflare Pages.`);
      }
      return Response.json({ ok: true });
    }
    const gl = text.match(/^(?:daftar|list|lihat|cek|show)\s+(issue|issues|tiket|pr|pull)\b/i) || text.match(/^(?:ada|open)\s+(?:issue|pr)\s*\?*$/i);
    if (gl) {
      const kind = /pr|pull/.test(text) ? 'pr' : 'issue';
      const items = await ghList(env, kind);
      if (items === null) { await tgSend(token, chatId, 'Gak bisa ngambil dari GitHub 😢 cek token di Pages settings.'); return Response.json({ ok: true }); }
      if (!items.length) { await tgSend(token, chatId, kind === 'pr' ? 'Belum ada PR terbuka 👌' : 'Belum ada issue terbuka 👌'); return Response.json({ ok: true }); }
      const lines = items.map((x) => `<a href="${x.url}">#${x.n}</a> ${x.t.slice(0, 60)}`).join('\n');
      await tgSend(token, chatId, `📋 <b>${kind === 'pr' ? 'PR terbuka' : 'Issue terbuka'}:</b>\n${lines}`);
      return Response.json({ ok: true });
    }
    const gr = text.match(/^(?:suruh(?:in)?\s+)?(muzawwied|vylonium|devconium|clincoo|rafa|dimas|sari|bagas|maya|raka|nadia|lina|joko|tini)?\s*review\s+(?:pr|pull\s*request)?\s*#?(\d+)/i);
    if (gr) {
      const who = resolveName(gr[1] || c);
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
        const report = await aiChatRetry(env, who, `Kamu baru saja posting review PR #${n} "${pr.title}" di GitHub. Beritahu Boss dengan gaya bicaramu dalam 1 kalimat santai.`);
        if (report) {
          await logMsg(env, who, 'user', report);
          await setStatus(env, who, 'bicara');
        }
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
        const report = await aiChatRetry(env, c, `Kamu baru saja berhasil mengupdate teks website dan commit ke GitHub (${r.commit}). Beritahu Boss dengan gaya bicaramu dalam 1 kalimat santai.`);
        if (report) {
          await logMsg(env, c, 'user', report);
          await setStatus(env, c, 'bicara');
        }
      } else {
        await tgSend(token, chatId, `Gagal: ${r.error}`);
      }
      return Response.json({ ok: true });
    }
    const dp = text.match(/^(?:deploy|terbitkan)(?:\s+(?:ulang|web|situs|website|lagi))*\s*$/i);
    if (dp) {
      const ok = await cfDeploy(env);
      await tgSend(token, chatId, ok ? '✅ Deploy baru udah diterbitkan ke Cloudflare Pages — sebentar lagi live.' : 'Gagal trigger deploy 😢 cek token Cloudflare di Pages settings.');
      if (ok) {
        const report = await aiChatRetry(env, c, `Kamu baru saja menerbitkan deploy baru ke Cloudflare Pages. Beritahu Boss dengan gaya bicaramu dalam 1 kalimat santai.`);
        if (report) {
          await logMsg(env, c, 'user', report);
          await setStatus(env, c, 'bicara');
        }
      }
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

    // ===== [15 Okt] WEB CLINCOO UTAMA (GitHub muzawwied/Clincoo + Cloudflare Pages 'clincoo') =====
    const cw = text.match(/^update\s+web\s+clincoo\s+(?:file\s+([\w\-./]+)\s+)?(?:ganti|ubah)\s+(.+?)\s+(?:jadi|menjadi|dengan)\s+(.+)$/i)
           || text.match(/^(?:suruh\s+\w+\s+)?update\s+clincoo\s+(?:ganti|ubah)\s+(.+?)\s+(?:jadi|menjadi|dengan)\s+(.+)$/i);
    if (cw) {
      const filePath = cw[3] ? (cw[1] || undefined) : undefined; // regex 1 punya grup file
      const oldT = cw[3] ? cw[2] : cw[1];
      const newT = cw[3] ? cw[3] : cw[2];
      const r = await clincooFindReplace(env, oldT, newT, filePath);
      if (r.ok) {
        await tgSend(token, chatId, `✅ Web <b>Clincoo</b> benar-benar diubah & ter-commit <code>${r.commit}</code> di ${r.file} (repo muzawwied/Clincoo) — push ke main otomatis dideploy Actions+Cloudflare. Sebentar lagi live di app.clincoo.buzz 🔥`);
        const report = await aiChatRetry(env, c, `Kamu baru saja mengubah teks web utama Clincoo (app.clincoo.buzz) dan commit ke GitHub (${r.commit}); deploy berjalan otomatis lewat GitHub Actions + Cloudflare Pages. Beritahu Boss dengan gaya bicaramu dalam 1 kalimat santai.`);
        if (report) { await logMsg(env, c, 'user', report); await setStatus(env, c, 'bicara'); }
      } else {
        await tgSend(token, chatId, `Gagal update web Clincoo: ${r.error}`);
      }
      return Response.json({ ok: true });
    }
    const cd = text.match(/^(?:deploy|terbitkan)(?:\s+ulang)?\s+(?:web\s+|situs\s+|website\s+)?clincoo\s*$/i);
    if (cd) {
      const ok = await clincooDeploy(env);
      await tgSend(token, chatId, ok ? '✅ Deploy baru udah diterbitkan ke Cloudflare Pages project <b>clincoo</b> (web utama) — sebentar lagi live di app.clincoo.buzz.' : 'Gagal trigger deploy web Clincoo 😢 cek token Cloudflare di Pages settings.');
      if (ok) {
        const report = await aiChatRetry(env, c, 'Kamu baru saja menerbitkan deploy baru web utama Clincoo (app.clincoo.buzz) ke Cloudflare Pages. Beritahu Boss dengan gaya bicaramu dalam 1 kalimat santai.');
        if (report) { await logMsg(env, c, 'user', report); await setStatus(env, c, 'bicara'); }
      }
      return Response.json({ ok: true });
    }
    const cs = text.match(/^(?:status|cek)(?:\s+web|\s+deploy|\s+situs|\s+website)?\s+clincoo\s*$/i);
    if (cs) {
      const st = await clincooStatus(env);
      await tgSend(token, chatId, st
        ? `📊 Status web <b>Clincoo</b> (project clincoo): <b>${st.status}</b> (${st.stage || '-'})\nDeploy terakhir: ${new Date(st.created).toLocaleString('id-ID')}${st.url ? '\nURL: ' + st.url : ''}`
        : 'Gak bisa ngambil status web Clincoo 😢 cek token Cloudflare.');
      return Response.json({ ok: true });
    }

    // ===== PERINTAH: meeting/rapat nyata =====
    if (/rapat|meet(?:ing|in|t)|meating|metting/i.test(text) && text.length <= 140 && !text.includes('?')) {
      const uniq = [];
      for (const n0 of (text.toLowerCase().match(/\b(muzawwied|vylonium|devconium|clincoo|rafa|dimas|sari|bagas|maya|raka|nadia|lina|joko|tini)\b/g) || [])) {
        const n = resolveName(n0);
        if (!uniq.includes(n)) uniq.push(n);
      }
      let a = uniq[0] || c;               // tanpa nama: bot ini yang rapat
      let b = uniq[1] || (a !== c ? c : ['rafa','dimas','sari','bagas'].filter(x => x !== a)[Math.floor(Math.random() * 3)]);
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
    const cmd = text.match(/^(?:panggil(?:in)?|suruh|tolong\s+panggil)\s+(muzawwied|vylonium|devconium|clincoo|rafa|dimas|sari|bagas|maya|raka|nadia|lina|joko|tini)\b(?:\s+(?:ke|pergi\s+ke|menuju)\s+([a-z]+))?/i);
    if (cmd) {
      const target = resolveName(cmd[1]);
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
        if (!line || line.length < 5) line = '';
        await log(env, c, 'user', line, 'goto', place);
        if (line) {
          await setS(env, c, 'bicara');
          await new Promise(r => setTimeout(r, 12000));
        }
        await setS(env, c, 'idle');
      })().catch(() => {}));
      return Response.json({ ok: true });
    }

    if (text.startsWith('/start')) {
      await tgSend(token, chatId, `Halo! Aku ${P.name}, ${P.role} di Clincoo Office 🏢\n\nNgobrol langsung aja denganku di sini, atau suruh aku ngobrol dengan rekan kerja:\n<code>ke Vylonium: bahas deploy besok</code>\n\nRuang kantor kami: vylonium.biz.id`);
      return Response.json({ ok: true });
    }

    // pola ajak rekan: "ke <nama> [:] <topik>" / "@<nama> <topik>"
    const m = text.match(/^(?:ke|kepada|ajak|dengan|sama)\s+(muzawwied|vylonium|devconium|clincoo|rafa|dimas|sari|bagas|maya|raka|nadia|lina|joko|tini)\b[\s:,-]*(.*)$/i) || text.match(/^@(muzawwied|vylonium|devconium|clincoo|rafa|dimas|sari|bagas|maya|raka|nadia|lina|joko|tini)\s+(.*)$/i);
    if (m && resolveName(m[1]) !== c) {
      const target = resolveName(m[1]);
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
