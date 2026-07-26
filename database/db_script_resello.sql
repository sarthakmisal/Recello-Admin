
BEGIN;
	CREATE TABLE enum_master(
		id BIGINT NOT NULL,
		master_name VARCHAR(50) NOT NULL,
		option_name VARCHAR(50) NOT NULL,
		sort_index INT NOT NULL DEFAULT 1,
		is_active BOOLEAN DEFAULT TRUE,
		UNIQUE(master_name, option_name)
	);
	CREATE TABLE users (
		id BIGSERIAL PRIMARY KEY,
		email TEXT,
		phone VARCHAR(15) NOT NULL UNIQUE,
		password TEXT NOT NULL,
		status INT NOT NULL DEFAULT 1,   -- user_status | active suspended deleted
		is_verified BOOLEAN DEFAULT FALSE,
		created_at TIMESTAMP DEFAULT NOW(),
		updated_at TIMESTAMP DEFAULT NOW()
	);
	CREATE TABLE user_profile(
		user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
		first_name VARCHAR(50),
		last_name VARCHAR(50),
		avatar_url TEXT,
		created_at TIMESTAMP DEFAULT NOW(),
		updated_at TIMESTAMP DEFAULT NOW()
	);
	CREATE TABLE roles(
		id SERIAL PRIMARY KEY,
		name VARCHAR(50) NOT NULL UNIQUE,
		description TEXT,
		is_system BOOLEAN DEFAULT FALSE
	);
	
	CREATE TABLE user_roles(
		user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
		role_id INT REFERENCES roles(id) ON DELETE CASCADE,
		PRIMARY KEY (user_id,role_id)
	);
	
	CREATE TABLE refresh_tokens(
		id BIGSERIAL PRIMARY KEY,
		user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		token TEXT NOT NULL,
		expires_at TIMESTAMP NOT NULL,
		created_at TIMESTAMP DEFAULT NOW()
	);
	
	CREATE TABLE addresses
	(
	    id BIGSERIAL PRIMARY KEY,
	    user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
	    name VARCHAR(50),
	    phone VARCHAR(15),
	    line1 TEXT NOT NULL,
	    line2 TEXT,
	    city VARCHAR(50),
	    state VARCHAR(50),
	    pincode VARCHAR(10),
	    country VARCHAR(50),
	    is_default boolean DEFAULT FALSE,
	    created_at TIMESTAMP DEFAULT now(),
	    updated_at  TIMESTAMP DEFAULT now()
	);
	
	CREATE TABLE brands(
		id BIGSERIAL PRIMARY KEY,
		name VARCHAR(50) NOT NULL,
		slug VARCHAR(50) NOT NULL UNIQUE,
		status INT DEFAULT 1    -- brand_model_status | active inactive deprecated
	);
	CREATE TABLE categories(
		id BIGSERIAL PRIMARY KEY,
		name VARCHAR(50) NOT NULL,
		parent_id BIGINT REFERENCES categories(id) ON DELETE SET NULL,
		slug VARCHAR(100) UNIQUE,
		sort_index INT NOT NULL DEFAULT 1,
		is_active BOOLEAN DEFAULT TRUE
	);
	CREATE TABLE brand_categories(
		brand_id BIGINT REFERENCES brands(id) ON DELETE CASCADE,
		category_id BIGINT REFERENCES categories(id) ON DELETE CASCADE,
		PRIMARY KEY (brand_id,category_id)
	);
	CREATE TABLE model_series(
		id BIGSERIAL PRIMARY KEY,
		brand_id BIGINT NOT NULL REFERENCES brands(id),
		name VARCHAR(50) NOT NULL,
		slug VARCHAR(100) NOT NULL,
		status INT NOT NULL DEFAULT 1,     -- brand_model_status | active inactive deprecated
		UNIQUE (brand_id, name)
	);
	CREATE TABLE models(
		id BIGSERIAL PRIMARY KEY,
		brand_id BIGINT REFERENCES brands(id) ON DELETE RESTRICT,
		series_id BIGINT REFERENCES model_series(id) ON DELETE CASCADE,
		category_id BIGINT REFERENCES categories(id) ON DELETE RESTRICT,
		name VARCHAR(50) NOT NULL,
		slug VARCHAR(100) NOT NULL,
		status INT DEFAULT 1,    -- brand_model_status | active inactive deprecated
		UNIQUE (brand_id, category_id, series_id, name)
	);
	CREATE TABLE images (
		id BIGSERIAL PRIMARY KEY,
		url TEXT NOT NULL,
		alt_text VARCHAR(150),
		sort_index INT DEFAULT 1,
		uploaded_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
		created_at TIMESTAMP DEFAULT NOW()
	);
	CREATE TABLE model_images (
		model_id BIGINT REFERENCES models(id) ON DELETE CASCADE,
		image_id BIGINT REFERENCES images(id) ON DELETE CASCADE,
		PRIMARY KEY (model_id, image_id)
	);
	
	CREATE TABLE product_master(
		id BIGSERIAL PRIMARY KEY,
		name VARCHAR(100) NOT NULL,
		model_id BIGINT NOT NULL REFERENCES models(id) ON DELETE SET NULL,
		description TEXT,
		vendor VARCHAR(100),
		slug VARCHAR(100) UNIQUE,
		status INT NOT NULL DEFAULT 1, -- product_status | active inactive deleted
		condition INT NOT NULL DEFAULT 1, -- product_condition | good fair superb
		created_at TIMESTAMP DEFAULT NOW(),
		updated_at TIMESTAMP DEFAULT NOW()
	);
	CREATE TABLE services(
		id BIGSERIAL PRIMARY KEY,
		name VARCHAR(50) NOT NULL,
		slug VARCHAR(100) NOT NULL UNIQUE,
		is_active BOOLEAN DEFAULT TRUE
	);
	
	CREATE TABLE service_categories(
		service_id BIGINT REFERENCES services(id),
		category_id BIGINT REFERENCES categories(id),
		PRIMARY KEY (service_id,category_id)
	);
	CREATE TABLE product_categories(
		product_id BIGINT REFERENCES product_master(id),
		category_id BIGINT REFERENCES categories(id),
		PRIMARY KEY (product_id,category_id)
	);
	CREATE TABLE product_options(
		id BIGSERIAL PRIMARY KEY,
		product_id BIGINT NOT NULL REFERENCES product_master(id) ON DELETE CASCADE,
		name VARCHAR(50) NOT NULL,
		UNIQUE (product_id, name)
	);
	CREATE TABLE product_option_values(
		id BIGSERIAL PRIMARY KEY,
		option_id BIGINT NOT NULL REFERENCES product_options(id) ON DELETE CASCADE,
		value VARCHAR(50) NOT NULL,
		UNIQUE (option_id, value)
	);
	CREATE TABLE product_variants(
		id BIGSERIAL PRIMARY KEY,
		product_id BIGINT NOT NULL REFERENCES product_master(id) ON DELETE CASCADE,
		sku VARCHAR(50) NOT NULL UNIQUE,
		price NUMERIC(10,2) NOT NULL,
		inventory_quantity INT NOT NULL DEFAULT 0,
		created_at TIMESTAMP DEFAULT NOW(),
		updated_at TIMESTAMP DEFAULT NOW()
	);
	CREATE TABLE variant_option_values(
		variant_id BIGINT NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
		option_value_id BIGINT NOT NULL REFERENCES product_option_values(id) ON DELETE CASCADE,
		PRIMARY KEY (variant_id,option_value_id)
	);
	CREATE TABLE product_attributes(
		id BIGSERIAL PRIMARY KEY,
		product_id BIGINT NOT NULL REFERENCES product_master(id) ON DELETE CASCADE,
		key VARCHAR(50) NOT NULL,
		value VARCHAR(100),
		UNIQUE (product_id, key)
	);

	CREATE TABLE auth_otp(
		id UUID PRIMARY KEY,
		user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
		phone VARCHAR(15) NOT NULL,
		otp_hash TEXT NOT NULL,
		attempts INT NOT NULL DEFAULT 0,
		expires_at TIMESTAMP NOT NULL DEFAULT NOW() + INTERVAL '10 minutes',
		created_at TIMESTAMP NOT NULL DEFAULT NOW()
	);
	CREATE TABLE product_images (
		product_id BIGINT REFERENCES product_master(id) ON DELETE CASCADE,
		image_id BIGINT REFERENCES images(id) ON DELETE CASCADE,
		is_primary BOOLEAN DEFAULT FALSE,
		sort_index INT DEFAULT 1,
		PRIMARY KEY (product_id, image_id)
	);
	CREATE TABLE brand_images (
		brand_id BIGINT REFERENCES brands(id) ON DELETE CASCADE,
		image_id BIGINT REFERENCES images(id) ON DELETE CASCADE,
		PRIMARY KEY (brand_id, image_id)
	);
	CREATE TABLE service_images (
		service_id BIGINT REFERENCES services(id) ON DELETE CASCADE,
		image_id BIGINT REFERENCES images(id) ON DELETE CASCADE,
		PRIMARY KEY (service_id, image_id)
	);
	CREATE TABLE category_images (
		category_id BIGINT REFERENCES categories(id) ON DELETE CASCADE,
		image_id BIGINT REFERENCES images(id) ON DELETE CASCADE,
		PRIMARY KEY (category_id, image_id)
	);

	-- sell flow
	CREATE TABLE sell_questions (
		id BIGSERIAL PRIMARY KEY,
		text TEXT NOT NULL,
		description TEXT,                          -- helper text shown below question
		input_type VARCHAR(20) NOT NULL,           -- 'yes_no', 'single_select', 'multi_select'
		context INT NOT NULL DEFAULT 1,            -- enum_master.master_name='question_context' | sell inspection both
		sort_index INT DEFAULT 1,
		is_active BOOLEAN DEFAULT TRUE
	);
	
	CREATE TABLE sell_model_configs (
		id BIGSERIAL PRIMARY KEY,
		model_id BIGINT NOT NULL REFERENCES models(id) ON DELETE CASCADE,
		name VARCHAR(100) NOT NULL,        -- "6GB / 64GB", "8GB / 128GB"
		base_price NUMERIC(10,2) NOT NULL, -- ops sets buying price per config
		is_active BOOLEAN DEFAULT TRUE
	);

	CREATE TABLE sell_question_options (
		id BIGSERIAL PRIMARY KEY,
		question_id BIGINT NOT NULL REFERENCES sell_questions(id) ON DELETE CASCADE,
		text VARCHAR(100) NOT NULL,               -- "Yes", "No", "Minor Scratches"
		price_deduction NUMERIC(10,2) DEFAULT 0,  -- deducted from base price
		option_image_id BIGINT DEFAULT NULL REFERENCES images(id) ON DELETE SET NULL, -- optional image per option
		sort_index INT DEFAULT 1
	);
	
	create table sell_listings(
		id BIGSERIAL PRIMARY KEY,
		user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
		category_id BIGINT REFERENCES categories(id) ON DELETE SET NULL,
		brand_id BIGINT REFERENCES brands(id) ON DELETE SET NULL,
		model_id BIGINT REFERENCES models(id) ON DELETE SET NULL,
		condition BIGINT NOT NULL DEFAULT 1,
		quoted_price NUMERIC(10,2),
		base_price NUMERIC(10,2),
		config_id BIGINT REFERENCES sell_model_configs(id) ON DELETE SET NULL,
		expected_price NUMERIC(10,2) NOT NULL,
		status BIGINT DEFAULT 1,
		assigned_merchant_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
		created_at TIMESTAMP DEFAULT NOW(),
		updated_at TIMESTAMP DEFAULT NOW()
	);

	-- Merchant-side inspection session (supports re-inspection / renegotiation)
	CREATE TABLE inspections (
		id BIGSERIAL PRIMARY KEY,
		listing_id BIGINT NOT NULL REFERENCES sell_listings(id) ON DELETE CASCADE,
		agent_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
		otp_verified_at TIMESTAMP,
		status INT NOT NULL DEFAULT 1, -- inspection_status | started completed cancelled
		created_at TIMESTAMP DEFAULT NOW(),
		updated_at TIMESTAMP DEFAULT NOW()
	);

	CREATE TABLE sell_listing_answers(
		id BIGSERIAL PRIMARY KEY,
		listing_id BIGINT NOT NULL REFERENCES sell_listings(id) ON DELETE CASCADE,
		inspection_id BIGINT REFERENCES inspections(id) ON DELETE CASCADE,
		question_id BIGINT NOT NULL REFERENCES sell_questions(id) ON DELETE CASCADE,
		option_id BIGINT NOT NULL REFERENCES sell_question_options(id) ON DELETE CASCADE,
		answer_image_id BIGINT REFERENCES images(id) ON DELETE SET NULL, -- optional proof/inspection image
		created_at TIMESTAMP DEFAULT NOW(),
		UNIQUE(inspection_id, question_id, option_id)
	);
	
	CREATE TABLE sell_pickups (
		id BIGSERIAL PRIMARY KEY,
		listing_id BIGINT NOT NULL REFERENCES sell_listings(id) ON DELETE CASCADE,
		
		-- Address (inline or FK to addresses table)
		address_id BIGINT REFERENCES addresses(id) ON DELETE SET NULL,
		
		-- Scheduled slot
		pickup_date DATE NOT NULL,
		pickup_slot_start TIME NOT NULL,   -- e.g. 10:00
		pickup_slot_end TIME NOT NULL,     -- e.g. 12:00
		
		-- Lifecycle
		status INT NOT NULL DEFAULT 1,     -- pickup_status | scheduled rescheduled completed cancelled
		assigned_agent_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
		
		notes TEXT,
		created_at TIMESTAMP DEFAULT NOW(),
		updated_at TIMESTAMP DEFAULT NOW()
	);

	CREATE TABLE merchant_agent_invites (
		id BIGSERIAL PRIMARY KEY,
		merchant_id  BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		contact      TEXT NOT NULL UNIQUE,        -- phone or email merchant entered
		token        TEXT NOT NULL UNIQUE, -- sent via SMS/email
		agent_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL, -- filled after registration
		status       INT DEFAULT 1,        -- invite_status | pending accepted expired
		expires_at   TIMESTAMP NOT NULL DEFAULT NOW() + INTERVAL '48 hours',
		created_at   TIMESTAMP DEFAULT NOW()
	);

	CREATE TABLE merchant_agents (
		merchant_id   BIGINT REFERENCES users(id) ON DELETE CASCADE,
		agent_user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
		is_active     BOOLEAN DEFAULT TRUE,
		joined_at     TIMESTAMP DEFAULT NOW(),
		PRIMARY KEY (merchant_id, agent_user_id)
	);
	
	CREATE TABLE sell_listing_otps (
		id UUID PRIMARY KEY,
		listing_id  BIGINT NOT NULL REFERENCES sell_listings(id) ON DELETE CASCADE,
		sent_to     TEXT NOT NULL,              -- customer's phone/email
		otp_hash    TEXT NOT NULL,
		verified_by BIGINT REFERENCES users(id) ON DELETE SET NULL,  -- agent who verified
		verified_at TIMESTAMP,
		attempts	INT NOT NULL DEFAULT 0,
		expires_at  TIMESTAMP NOT NULL DEFAULT NOW() + INTERVAL '10 minutes',
		created_at  TIMESTAMP DEFAULT NOW()
	);

	-- Lead cancellation details (agent/merchant cancels after inspection)
	CREATE TABLE listing_cancellations (
		id BIGSERIAL PRIMARY KEY,
		listing_id BIGINT NOT NULL REFERENCES sell_listings(id) ON DELETE CASCADE,
		inspection_id BIGINT REFERENCES inspections(id) ON DELETE SET NULL,
		cancelled_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
		reason TEXT,
		final_offered_price NUMERIC(10,2),
		customer_expected_price NUMERIC(10,2),
		created_at TIMESTAMP DEFAULT NOW()
	);

	-- Renegotiation offers (agent proposes new amount; customer accepts/rejects)
	CREATE TABLE listing_offers (
		id BIGSERIAL PRIMARY KEY,
		listing_id BIGINT NOT NULL REFERENCES sell_listings(id) ON DELETE CASCADE,
		inspection_id BIGINT REFERENCES inspections(id) ON DELETE SET NULL,
		offered_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
		amount NUMERIC(10,2) NOT NULL,
		status INT NOT NULL DEFAULT 1, -- offer_status | pending accepted rejected
		created_at TIMESTAMP DEFAULT NOW(),
		updated_at TIMESTAMP DEFAULT NOW()
	);

	CREATE OR REPLACE FUNCTION enum_master_id()
	RETURNS TRIGGER
	LANGUAGE plpgsql AS $$
	DECLARE max_id INT;
	BEGIN
		SELECT COALESCE(MAX(id),0) + 1 
			INTO max_id 
			FROM enum_master
			WHERE master_name = NEW.master_name;

			NEW.id = max_id;
			NEW.sort_index= max_id;
			RETURN NEW;
	END;
	$$;
	
	CREATE TRIGGER trg_enum_sort_index
	BEFORE INSERT ON enum_master
	FOR EACH ROW
	EXECUTE FUNCTION enum_master_id();



	CREATE TABLE sell_question_conditions (
		id BIGSERIAL PRIMARY KEY,
		trigger_option_id BIGINT NOT NULL REFERENCES sell_question_options(id) ON DELETE CASCADE,
		show_question_id BIGINT NOT NULL REFERENCES sell_questions(id) ON DELETE CASCADE
	);
	
	CREATE TABLE sell_category_questions (
		category_id BIGINT REFERENCES categories(id) ON DELETE CASCADE,
		question_id BIGINT REFERENCES sell_questions(id) ON DELETE CASCADE,
		sort_index INT DEFAULT 1,
		PRIMARY KEY (category_id, question_id)
	);
	
	CREATE TABLE sell_option_deduction_rates (
		category_id BIGINT REFERENCES categories(id) ON DELETE CASCADE,
		option_id BIGINT REFERENCES sell_question_options(id) ON DELETE CASCADE,
		rate NUMERIC(5,2) NOT NULL DEFAULT 0,  -- 15% for all phones
		PRIMARY KEY (category_id, option_id)
	);

	CREATE TABLE banners
	(
		id SERIAL PRIMARY KEY,
		title VARCHAR(255) NOT NULL,
		image_url TEXT NOT NULL,
		redirect_url TEXT NOT NULL,
		position VARCHAR(50),
		is_active BOOLEAN DEFAULT true,
		start_date TIMESTAMP WITHOUT TIME ZONE,
		end_date TIMESTAMP WITHOUT TIME ZONE,
		sort_order integer DEFAULT 0,
		created_at TIMESTAMP DEFAULT NOW(),
		updated_at TIMESTAMP DEFAULT NOW()
	);
	CREATE TABLE faqs (
		id SERIAL PRIMARY KEY,
		question TEXT NOT NULL,
		answer TEXT NOT NULL,
		is_active BOOLEAN DEFAULT TRUE,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	);
	CREATE TABLE contact_us(
		id SERIAL PRIMARY KEY,
		first_name VARCHAR(100),
		last_name VARCHAR(100),
		email TEXT,
		phone VARCHAR(15),
		subject VARCHAR(100),
		status INT DEFAULT 1, -- contact_status | new in_progress resolved closed
		message TEXT,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	);
	CREATE TABLE request_deletion(
		id SERIAL PRIMARY KEY,
		user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
		reason TEXT NOT NULL,
		status INT NOT NULL DEFAULT 1, -- request_deletion_status | new approved rejected
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		UNIQUE(user_id)
	);
COMMIT;

-- FOR LATER USE - override deductions brands/model wise
-- CREATE TABLE sell_option_deduction_overrides (
--     brand_id BIGINT REFERENCES brands(id) ON DELETE CASCADE,
--     option_id BIGINT REFERENCES sell_question_options(id) ON DELETE CASCADE,
--     rate NUMERIC(5,2) NOT NULL DEFAULT 0,
--     PRIMARY KEY (brand_id, option_id)
-- );