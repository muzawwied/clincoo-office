# Clincoo Office 🏢

Kantor virtual 3D berisi karakter AI. Tiap karakter punya bot Telegram sendiri:
suruh lewat Telegram → karakter bekerja real-time → di papan nama (web) nama
karakter membesar dan pesannya muncul bertahap seperti sedang mengetik.

- Web: https://vylonium.biz.id
- Karakter (nama = nama bot Telegram): Muzawwied (Frontend), Vylonium (Backend), Devconium (Desain), Clincoo (QA)
- API:
  - `GET /api/board?since=<id>` — papan pesan + status
  - `POST /api/telegram?c=<karakter>&s=<token bot>` — webhook tiap bot
  - `POST /api/simulate` — pemicu dialog (header `X-Admin-Key`), body `{from,to,topic}`

Format suruhan lewat Telegram: `ke Vylonium: bahas deploy besok` atau obrolan bebas.

## Web utama Clincoo (GitHub + Cloudflare)

- `update web clincoo ganti <teks lama> jadi <teks baru>` — ubah teks web utama
  (repo muzawwied/Clincoo, commit ke main, deploy otomatis Actions+Cloudflare)
- `update web clincoo file <path> ganti <teks lama> jadi <teks baru>` — idem, file spesifik
- `deploy clincoo` — terbitkan deploy baru project Pages `clincoo`
- `status clincoo` — status deploy terakhir web utama
