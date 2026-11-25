# Merchant app API

One endpoint, same style as `/api/web`: `GET|POST /api/tech?action=<name>`. JSON in, JSON out. Errors are `{ "error": "text" }` with a 4xx status (`retry` = seconds on 429).
Signed-in calls send `Authorization: Bearer <token>` (token from `otp_verify`, valid `TECH_TOKEN_DAYS`, default 30). Price is always worked out on the server.

| Group | Action | Verb | Body / query |
|---|---|---|---|
| Sign in | `otp_send` | POST | `{phone}` → SMS code (6 digits). Only phones added by admin are accepted |
| | `otp_verify` | POST | `{phone, code, terms?}` → `{token, me}` |
| | `logout` | POST | |
| Home | `me` | GET | `?v=<app version>` → profile, stats, wallet, support, app control (force/soft update) |
| | `jobs` | GET | → leads (today / upcoming / finished). Number + address are masked until the visit day |
| | `job` | GET | `?id=SMK501` → full lead: questions, checks, answers, visit state, photos, rules |
| Visit | `onway` | POST | `{id}` |
| | `arrive` | POST | `{id, lat, lng}` → sends the customer a 4-digit start code |
| | `code_send` | POST | `{id, purpose: start\|deal\|paid\|cancel}` (30 s resend gap) |
| | `start` | POST | `{id, code}` |
| | `identify` | POST | `{id, same, note?}` (front/back photos first) |
| | `quote` / `check` | POST | `{id, mode: complete\|requote, answers, checks}` → live price / save the check |
| | `smk_ask` / `smk_cancel` | POST | `{id, price, note}` / `{id}` — SMK Special Price |
| | `extras` | POST | `{id, extras: []}` |
| | `agree` | POST | `{id, code}` (customer's deal code) |
| | `pay` | POST | `{id, method: cash\|upi, ref?}` |
| | `paid` | POST | `{id, code}` (customer confirms money) |
| | `finish` | POST | `{id, id_kind, dead, imei, wiped, bag}` |
| | `cancel_ask` / `cancel` | POST | `{id, reason, note}` / `{id, code}` |
| | `noshow` | POST | `{id, note}` (10 min after arrival) |
| Files | `photo` | POST multipart | `id, kind, file` |
| | `photo_get` / `doc_get` | GET | `?id&ref` / `?ref` (need the token) |
| | `photo_delete` | POST | `{id, ref}` |
| Account | `wallet`, `terms_accept`, `doc_upload` (multipart `kind, file`) | | |
| Admin (role `admin`, normal admin JWT) | `admin_tech_create {phone,name,...}`, `admin_techs`, `admin_assign {id, phone}`, `admin_topup {phone, pts, note}`, `admin_smk {id, decision: approve\|reject, price?, reply?}`, `admin_doc` | POST/GET | |

Setup
1. Run `database/migration_tech.sql` (also created on first call if missing). It needs the website tables (`web_orders`, `web_order_seq`, `web_hits`, `web_settings`) from your `migration_web.sql`.
2. Add a merchant: `admin_tech_create`, give Points: `admin_topup`, assign a lead: `admin_assign` (or set `sell_pickups.assigned_agent_id`).
3. Rules (points per lead slab, cash limit, SMK limits, check list, terms text) live in `config/tech-defaults.json`; override per key in `web_settings` row `key='tech'`.
4. `.env`: uses the existing `JWT_ACCESS_SECRET`, `DOVE_*`. Optional `TECH_DOVE_TEMPLATE_ID` (DLT template for the customer codes) and `TECH_TOKEN_DAYS`. `SMS_DRY_RUN=1` returns `dev_code` in responses (ignored when `NODE_ENV=production`).
