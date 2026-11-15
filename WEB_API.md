# Website / mobile page API: `/api/web`

One endpoint serves the new Recello page (`public/app` and the Android app):
`GET|POST /api/web?action=<name>`. It is additive: the existing `/api/auth`, `/api/admin`... routes are untouched.

| action | method | what it does |
|---|---|---|
| catalog | GET | brands/models/storage from your DB (prices are 0 until OTP) |
| pow | GET | proof-of-work challenge for the robot check |
| otp_send / otp_verify | POST | 4-digit SMS OTP, returns a 30-day token |
| prices | POST | model prices once the token is valid |
| unlock | POST | offer for the chosen answers (7-day price hold) |
| create_order | POST | `sell`: writes `addresses`, `sell_listings`, `sell_listing_answers`, `sell_pickups` (+ `web_orders` code SMK###), so it shows in your existing admin/merchant app. `repair`: `web_orders` only |
| track | GET | order status from `sell_listings.status`; open with key `k` or last 4 phone digits `ph` |
| my_orders | POST | order history for the logged-in phone |
| request | POST | call / model / callback / bulk / upgrade / watch / delete requests |
| lead_reason, ref_code, ref_check, waitlist_join | | small growth helpers |
| ai | | disabled (404) |

Setup: new tables are created automatically on boot from `database/migration_web.sql` (CREATE IF NOT EXISTS only);
you can also run that file by hand. Settings default to `config/web-defaults.json` and can be overridden per key in the
`web_settings` table. Questions come from your DB (`sell_questions`) per category; categories without any use
`config/web-questions.json`.

Rebuild the page into `public/app`:
`cd ../recello-mobile && node scripts/build-site.mjs --web` then copy `www/*` into `public/app/`.
