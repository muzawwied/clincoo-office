// PATROL REAL: cek kondisi NYATA Clincoo (situs, bot Telegram, GitHub, DB)
// lalu kerahkan karakter sesuai peran NYATA. Bukan simulasi:
// - error situs/bot  -> Bagas cek server, Dimas ngefix, karakter error masuk ruang sakit
// - dr. Nadia (medis) -> merawat karakter yang error (ruang sakit)
// - issue/PR GitHub  -> Dimas/Rafa mengerjakan yang baru
// - Bu Tini (kebersihan) -> bersihkan DB papan yang membengkak
// - Pak Joko (satpam) -> jaga web: cek webhook bot & aktivitas aneh
export async function onRequestPost({ request, env, waitUntil }) {
  try {
    const { ensureSchema, logMsg, getSetting, setSetting, scheduleRun, ensurePersonas } = await import('./_lib.js');
    await ensureSchema(env);
    const now = Date.now();
    const origin = new URL(request.url).origin;
    const once = async (key, gapMin) => {
      const t = Number(await getSetting(env, key)) || 0;
      const gap = (gapMin || 15) * 60 * 1000;
      if (now - t < gap) return false;
      await setSetting(env, key, String(now)); return true;
    };
    const events = [];

    // --- 1. KESEHATAN SITUS (real): API board harus hidup ---
    let siteOk = true, httpCode = 200;
    try {
      const r = await fetch(origin + '/api/board?since=9999999999', { signal: AbortSignal.timeout(8000) });
      httpCode = r.status;
      const j = await r.json().catch(() => ({}));
      if (r.status !== 200 || !j.ok) siteOk = false;
    } catch (e) { siteOk = false; httpCode = 0; }
    if (!siteOk) {
      if (await once('patrol_site_err', 15)) {
        await logMsg(env, 'bagas', 'user', 'Server Clincoo bermasalah (HTTP ' + httpCode + '). Aku cek backend & server sekarang.', 'goto', 'meja');
        await logMsg(env, 'dimas', 'user', 'Web down/bermasalah — aku siaga ngefix di meja kerja.', 'goto', 'meja');
        events.push('site_error');
      }
    }

    // --- 2. KESEHATAN KARAKTER (real): webhook bot Telegram ---
    const CHARS = ['rafa', 'dimas', 'sari', 'bagas'];
    for (const id of CHARS) {
      const tok = env['CHAR_' + id.toUpperCase() + '_TOKEN'];
      if (!tok) continue;
      try {
        const r = await fetch('https://api.telegram.org/bot' + tok + '/getWebhookInfo', { signal: AbortSignal.timeout(6000) });
        const j = await r.json();
        const wh = (j && j.result) || {};
        const pending = wh.pending_update_count || 0;
        const err = wh.last_error_message || '';
        const ok = wh.url && String(wh.url).includes('/api/telegram');
        if (!ok || pending > 30 || err) {
          if (await once('patrol_bot_' + id, 20)) {
            await logMsg(env, id, 'user', '(' + id + ' error: ' + (err ? String(err).slice(0, 80) : (ok ? 'antrian ' + pending + ' tertahan' : 'webhook lepas')) + ' — masuk ruang sakit)', 'goto', 'sakit');
            await logMsg(env, 'nadia', 'user', 'Karakter ' + id + ' kena error. Aku periksa & rawat di ruang sakit.', 'goto', 'sakit');
            await logMsg(env, 'bagas', 'user', 'Webhook ' + id + ' bermasalah — aku cek dari sisi server.', 'goto', 'meja');
            events.push('bot_sick_' + id);
          }
        }
      } catch (e) {}
    }

    // --- 3. PEKERJAAN NYATA (real): issue & PR baru di GitHub ---
    if (env.GITHUB_TOKEN && env.GITHUB_REPO) {
      const H = { 'Authorization': 'Bearer ' + env.GITHUB_TOKEN, 'User-Agent': 'clincoo-office' };
      try {
        const lastIssue = Number(await getSetting(env, 'patrol_gh_issue')) || 0;
        const r = await fetch('https://api.github.com/repos/' + env.GITHUB_REPO + '/issues?state=open&per_page=5', { headers: H, signal: AbortSignal.timeout(8000) });
        const issues = (await r.json()) || [];
        for (const it of issues) {
          if (it.pull_request || !it.number || it.number <= lastIssue) continue;
          if (await once('patrol_issue_' + it.number, 60)) {
            await logMsg(env, 'dimas', 'user', 'Issue baru #' + it.number + ': ' + String(it.title || '').slice(0, 90) + ' — aku kerjakan sekarang.', 'goto', 'meja');
            events.push('issue_' + it.number);
          }
        }
        const maxIssue = Math.max(lastIssue, ...issues.filter((i) => !i.pull_request).map((i) => i.number || 0));
        if (maxIssue > lastIssue) await setSetting(env, 'patrol_gh_issue', String(maxIssue));
        const lastPr = Number(await getSetting(env, 'patrol_gh_pr')) || 0;
        const r2 = await fetch('https://api.github.com/repos/' + env.GITHUB_REPO + '/pulls?state=open&per_page=5', { headers: H, signal: AbortSignal.timeout(8000) });
        const prs = (await r2.json()) || [];
        for (const pr of prs) {
          if (!pr.number || pr.number <= lastPr) continue;
          if (await once('patrol_pr_' + pr.number, 60)) {
            await logMsg(env, 'rafa', 'user', 'PR baru #' + pr.number + ': ' + String(pr.title || '').slice(0, 90) + ' — aku review dulu.', 'goto', 'meja');
            events.push('pr_' + pr.number);
          }
        }
        const maxPr = Math.max(lastPr, ...prs.map((p) => p.number || 0));
        if (maxPr > lastPr) await setSetting(env, 'patrol_gh_pr', String(maxPr));
      } catch (e) {}
    }

    // --- 4. KEBERSIHAN (real): DB papan jangan membengkak (WAJIB kunci admin — bukan aksi publik) ---
    if (request.headers.get('x-admin-key') === env.ADMIN_KEY) try {
      const c = await env.DB.prepare('SELECT COUNT(*) AS n FROM office_msg').first();
      if ((c && c.n || 0) > 500) {
        if (await once('patrol_clean', 120)) {
          const m = await env.DB.prepare('SELECT MAX(id) AS mx FROM office_msg').first();
          await env.DB.prepare('DELETE FROM office_msg WHERE id < ?').bind((m && m.mx || 500) - 100).run();
          await logMsg(env, 'tini', 'user', 'Papan sudah memuat ' + (c.n) + ' pesan — aku bersihkan yang lama biar web tetap ringan.', 'goto', 'nongkrong');
          events.push('db_clean_' + c.n);
        }
      }
    } catch (e) {}

    // --- 5. SATPAM (real): laporan jaga berkala hanya saat ada temuan ---
    // (tidak ada obrolan kosong; Pak Joko bicara hanya kalau menemukan sesuatu)

    return Response.json({ ok: true, site: siteOk ? 'ok' : 'error', events, ts: now });
  } catch (e) {
    return Response.json({ ok: false, error: String((e && e.message) || e) }, { status: 500 });
  }
}
