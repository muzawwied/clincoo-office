# Clincoo Office 🏢

Kantor virtual 3D berisi karakter AI. Tiap karakter punya bot Telegram sendiri:
suruh lewat Telegram → karakter bekerja real-time → di papan nama (web) nama
karakter membesar dan pesannya muncul bertahap seperti sedang mengetik.

- Web: https://vylonium.biz.id
- Karakter: Rafa (Frontend), Dimas (Backend), Sari (Desain)
- API:
  - `GET /api/board?since=<id>` — papan pesan + status
  - `POST /api/telegram?c=<karakter>&s=<token bot>` — webhook tiap bot
  - `POST /api/simulate` — pemicu dialog (header `X-Admin-Key`), body `{from,to,topic}`

Format suruhan lewat Telegram: `ke Dimas: bahas deploy besok` atau obrolan bebas.
