# Changes to the original backend (4 files, nothing else touched)

Both changes are OPTIONAL: the app also works against your unchanged backend (it then builds the model list from the old routes).

1. `GET /api/product/catalog` (public, read-only): every active model with its brand, series, category, one image and its storage options with base prices, in one response.
   Files: `routes/product.routes.js` (registered before `/:brandSlug/:modelSlug`), `controllers/product.controller.js`, `services/product.service.js` (`getSellCatalog`).
   Why: the new website lists all models and needs this in one call; the old routes would need hundreds.
2. `COOKIE_SAMESITE` env (optional) in `controllers/auth.controller.js`: lets the refresh cookie be `none; Secure` for the Android app. Default stays `strict`.

No other route, table or behaviour changed.

## Things we saw in the existing code (not changed, your call)
- `GET /api/sell/listings` and `GET /api/sell/listings/:id` need no login and return customer name, phone and address. Put `authenticate` (and an agent/admin role check) on them.
- `PUT /api/sell/listings/:id/cancel` does not check that the listing belongs to the caller.
- `POST /api/contact_us` has no rate limit or validation (spam target).
- OTP is stored in `auth_otp.otp_hash` as plain text (the bcrypt lines are commented out) and compared with `===`.
- `services/user.service.js` `updateAddress` (PUT `/api/users/addresses/:id`): the SQL has a stray `)` and `line2=$3`; the edit-address route will fail.
- `express.json()` limit is 100 KB; screenshots go through `POST /api/sell/images` (multipart) for that reason.
- The `.env` in the zip you shared had real secrets (DB, JWT, SMS, mail). Rotate them.
