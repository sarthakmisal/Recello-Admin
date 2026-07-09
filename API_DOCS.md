# Resello API Documentation

Base URL: `http(s)://<host>`

This doc lists routes **as mounted in** `app.js`.

## Conventions

- Protected endpoints require: `Authorization: Bearer <accessToken>`
- Refresh token is an `httpOnly` cookie; `POST /api/auth/refresh` returns a new access token.
- Multipart uploads are noted as `multipart/form-data` with expected field names.
- Unless stated otherwise, request/response bodies are JSON.

## Ops / Health

- `GET /api/health`
- `GET /api/logs` — returns today’s log entries (if present)
- `GET /api/logs_clean` — clears today’s log file

## Auth & Session

### `/api/auth`

**POST**
- `POST /api/auth/request_otp`
- `POST /api/auth/resend_otp`
- `POST /api/auth/verify_otp`
- `POST /api/auth/login`
- `POST /api/auth/register`
- `POST /api/auth/refresh` — uses refresh cookie
- `POST /api/auth/initiate` — project-specific

**GET**
- `GET /api/auth/me` — protected

**DELETE**
- `DELETE /api/auth/logout`

## System (Catalog / Admin)

### `/api/system`

**Services**
- `GET /api/system/get_services`
- `POST /api/system/create_service` — `multipart/form-data` field: `image`
- `PUT /api/system/update_service/:id` — `multipart/form-data` field: `image`
- `PATCH /api/system/toggle_service/:id`
- `DELETE /api/system/delete_service/:id`

**Categories**
- `GET /api/system/get_categories/:sub`
- `POST /api/system/create_category` — `multipart/form-data` field: `image`
- `PUT /api/system/update_category/:id` — `multipart/form-data` field: `image`
- `PATCH /api/system/toggle_category/:id`
- `DELETE /api/system/delete_category/:id`

**Category ↔ Brand mapping**
- `GET /api/system/categories/:id/brands`
- `PUT /api/system/categories/:id/brands`

**Brands**
- `GET /api/system/get_brands`
- `GET /api/system/get_brands/:cat_slug`
- `POST /api/system/create_brand` — `multipart/form-data` field: `image`
- `PUT /api/system/update_brand/:id` — `multipart/form-data` field: `image`
- `PATCH /api/system/toggle_brand/:id`
- `DELETE /api/system/delete_brand/:id`

**Series**
- `GET /api/system/series/:brand_slug`
- `POST /api/system/series`
- `PUT /api/system/series/:id`
- `DELETE /api/system/series/:id`

**Models**
- `GET /api/system/get_models/:cat_slug/:brand_slug/:series_slug`
- `POST /api/system/models` — `multipart/form-data` field: `image`
- `PUT /api/system/models/:id` — `multipart/form-data` field: `image`
- `DELETE /api/system/models/:id`

**Ops / Meta**
- `GET /api/system/get_roles`
- `GET /api/system/dashboard_summary`

### `/api/system` — Excel templates/imports

**GET**
- `GET /api/system/brands/template`
- `GET /api/system/series/template`
- `GET /api/system/models/template`
- `GET /api/system/catalog/template`

**POST** (all are `multipart/form-data` field: `file`)
- `POST /api/system/brands/import`
- `POST /api/system/series/import`
- `POST /api/system/models/import`
- `POST /api/system/catalog/import`

### Dev-only / Alias

- `GET /api/system/query` — dev helper (also reachable via `/api/sarthak/query`)

## Products

### `/api/product`

**GET**
- `GET /api/product/get_products`
- `GET /api/product/get_products/:id`
- `GET /api/product/brand/:brandSlug/products`
- `GET /api/product/brand/:brandSlug/series`
- `GET /api/product/brand/:brandSlug/models`
- `GET /api/product/brand/:brandSlug/:seriesSlug/models`
- `GET /api/product/:brandSlug/:modelSlug` — variants by brand+model
- `GET /api/product/slug/:slug`
- `GET /api/product/sku/:sku`

**POST**
- `POST /api/product/create` — `multipart/form-data` field: `image` (can be multiple files)

**PUT**
- `PUT /api/product/update/:id` — `multipart/form-data` field: `image` (can be multiple files)

**DELETE**
- `DELETE /api/product/delete/:id` — soft delete

## Sell (Questions, Options, Listings)

### `/api/sell`

**Model configs**
- `GET /api/sell/configs/:model_slug`
- `POST /api/sell/configs`
- `PUT /api/sell/configs/:id`
- `DELETE /api/sell/configs/:id`

**Questions**
- `GET /api/sell/questions`
- `GET /api/sell/question-contexts`
- `GET /api/sell/questions/:modelSlug`
- `GET /api/sell/questions/category/:category_id`
- `POST /api/sell/questions`
- `PUT /api/sell/questions/:id`
- `DELETE /api/sell/questions/:id`

**Images**
- `POST /api/sell/images` — `multipart/form-data` field: `image`

**Question options**
- `GET /api/sell/options/:question_id`
- `POST /api/sell/options`
- `PUT /api/sell/options/:id`
- `DELETE /api/sell/options/:id`

**Conditions**
- `GET /api/sell/conditions/:question_id`
- `POST /api/sell/conditions`
- `DELETE /api/sell/conditions/:id`

**Category-question mapping**
- `GET /api/sell/category-questions/:category_id`
- `POST /api/sell/category-questions`
- `DELETE /api/sell/category-questions/:category_id/:question_id`

**Sell flow**
- `GET /api/sell/flow/:category_slug`

**Pricing**
- `POST /api/sell/calculate-price`

**Listings (leads)**
- `GET /api/sell/listings`
- `GET /api/sell/listings/:id`
- `POST /api/sell/listings` — protected
- `PUT /api/sell/listings/:id/assign`
- `PUT /api/sell/listings/:id/transfer`
- `PUT /api/sell/listings/:id/reject`

**Listing offers (customer view)**
- `GET /api/sell/listings/:id/offers` — protected (listing owner)

**Pickup**
- `POST /api/sell/pickup` — protected

**Merchants**
- `GET /api/sell/merchants`

## Merchant & Agent (Lead lifecycle + inspection)

### `/api/merchant`

**Auth / OTP**
- `POST /api/merchant/login`
- `POST /api/merchant/requestOTP` — protected + role `merchant|agent`
- `POST /api/merchant/verifyOTP` — protected + role `merchant|agent`

OTP request bodies:
- `POST /api/merchant/requestOTP`
	- Body: `{ "listing_id": 123, "email": "customer@example.com" }`
	- Notes: `email` optional if the listing user has an email; retries are allowed (rate-limited).
- `POST /api/merchant/verifyOTP`
	- Body: `{ "id": "<otp_uuid>", "otp": "123456", "inspection_id": 10 }`
	- Notes: `inspection_id` is optional, but recommended so OTP verification is attached to the inspection.

**Leads**
- `GET /api/merchant/leads` — protected + role `merchant|agent`
- `GET /api/merchant/leads/completed` — protected + role `merchant` (includes completing `agent_id` + `agent_name`)
- `GET /api/merchant/leads/:id` — protected + role `merchant|agent`
- `GET /api/merchant/leads/:id/resume` — protected + role `merchant|agent` (returns current step + next_actions)
- `POST /api/merchant/leads/accept` — protected + role `merchant|agent`

Resume usage:
- Call `GET /api/merchant/leads/:id/resume` whenever the app opens a lead details screen.
- Use the returned `listing_status`, `inspection`, `pending_offer`, and `next_actions` to decide which button/step to show.

**Lead lifecycle (merchant app)**
- `PUT /api/merchant/leads/:id/status` — (protected + role `merchant|agent`)
	- Body: `{ "status": "out_for_delivery" }`
	- Idempotent: calling again returns “already marked” message.

**Inspection (agent app)**
- `POST /api/merchant/leads/:id/inspection` — start inspection session (protected + role `agent`)
- `POST /api/merchant/leads/:id/answers` — submit inspection answers + proof images (protected + role `agent`, `multipart/form-data`)
- `PUT /api/merchant/leads/:id/complete` — mark inspection complete (protected + role `agent`)

**Images (recommended for JSON-only answers)**
- `POST /api/merchant/images` — upload one image and get back an `image_id` (protected + role `merchant|agent`, `multipart/form-data` field: `image`)
	- Optional text field: `alt_text`

Inspection request bodies:
- `POST /api/merchant/leads/:id/inspection`
	- Body: none
	- Notes: idempotent; if already started, returns the existing inspection.
- `POST /api/merchant/leads/:id/answers`
	- Query: `?context=inspection` (optional; defaults to `inspection`)
	- `multipart/form-data` fields:
		- `inspection_id`: required (number)
		- `answers`: required (JSON string)
			- Shape:
				- `[{ "question_id": 123, "options": [ { "option_id": 456, "file_field": "answer_image_123_456" } ] }]`
		- Proof image files (optional):
			- Recommended field name: `answer_image_<questionId>_<optionId>`
			- Fallback field name: `answer_image_<optionId>`

JSON-only alternative (no multipart on answers):
- Step 1: upload images
	- `POST /api/merchant/images` (`multipart/form-data` field: `image`) → returns `{ id, url }`
- Step 2: submit answers as `application/json` to the same endpoint
	- `POST /api/merchant/leads/:id/answers`
	- Body example:
		- `{ "inspection_id": 1, "answers": [ { "question_id": 123, "options": [ { "option_id": 456, "answer_image_id": 999 } ] } ] }`
- `PUT /api/merchant/leads/:id/complete`
	- Body: `{ "inspection_id": 10 }`

**After inspection (agent)**
- `PUT /api/merchant/leads/:id/accept` — accept directly (protected + role `agent`)
- `POST /api/merchant/leads/:id/offer` — renegotiate: create offer (protected + role `agent`)
- `POST /api/merchant/leads/:id/cancel` — cancel with reason + amounts (protected + role `agent`)

After-inspection request bodies:
- `PUT /api/merchant/leads/:id/accept`
	- Body: `{ "inspection_id": 10, "final_amount": 2500 }` (`final_amount` optional)
- `POST /api/merchant/leads/:id/offer`
	- Body: `{ "inspection_id": 10, "amount": 2500 }`
- `POST /api/merchant/leads/:id/cancel`
	- Body: `{ "inspection_id": 10, "reason": "customer not available", "final_offered_price": 2000, "customer_expected_price": 2500 }`

**Customer offer response**
- `PUT /api/merchant/leads/:id/offer/:offer_id` — `{ action: 'accept'|'reject' }` (protected; must be listing owner)

Customer offer response body:
- `PUT /api/merchant/leads/:id/offer/:offer_id`
	- Body: `{ "action": "accept" }` or `{ "action": "reject" }`

**Profile**
- `GET /api/merchant/profile` — protected
- `PUT /api/merchant/profile/` — protected

**Agents**
- `POST /api/merchant/invite_agent` — protected
- `GET /api/merchant/verify_agent` — public (uses query params)
- `POST /api/merchant/register_agent`
- `GET /api/merchant/get_agents` — protected + role `merchant`

**Requote (legacy/compat)**
- `GET /api/merchant/requote/questions?context=<context>` — protected + role `merchant|agent`
- `POST /api/merchant/requote` — protected + role `merchant|agent`
- `POST /api/merchant/requote/questions?context=<context>` — protected + role `merchant|agent`, `multipart/form-data`

## Users

### `/api/users`

**Users CRUD**
- `POST /api/users/create` — `multipart/form-data` field: `avatar`
- `GET /api/users/get_users/`
- `GET /api/users/get_users/:id`
- `PUT /api/users/update/:id` — `multipart/form-data` field: `avatar`
- `DELETE /api/users/delete_user/:id`

**Merchant role**
- `POST /api/users/:id/merchant`
- `DELETE /api/users/:id/merchant`

**Addresses** (protected)
- `GET /api/users/addresses/`
- `POST /api/users/addresses`
- `PUT /api/users/addresses/:id`

**My profile** (protected)
- `GET /api/users/me/profile`
- `PUT /api/users/me/profile` — `multipart/form-data` field: `avatar`

## Banners

### `/api/banners`

**GET**
- `GET /api/banners/active` — public
- `GET /api/banners/`
- `GET /api/banners/:id`

**POST**
- `POST /api/banners/` — `multipart/form-data` field: `image`

**PUT**
- `PUT /api/banners/:id` — `multipart/form-data` field: `image`

**PATCH**
- `PATCH /api/banners/:id/status` — toggle status

**DELETE**
- `DELETE /api/banners/:id`

## FAQs

### `/api/faqs`

**GET**
- `GET /api/faqs/active` — public
- `GET /api/faqs/`
- `GET /api/faqs/:id`

**POST**
- `POST /api/faqs/`

**PUT**
- `PUT /api/faqs/:id`

**PATCH**
- `PATCH /api/faqs/:id/status`

**DELETE**
- `DELETE /api/faqs/:id`

## Static files

- `GET /uploads/<filename>` — uploaded files

## Non-production / Alias routes

- `GET /api/sarthak/*` — **alias** to `/api/system/*` (comment says remove in production)

## Not mounted in `app.js`

- `routes/ui.routes.js` — not mounted (contains `GET /home_banners`)
