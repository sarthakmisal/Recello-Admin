BEGIN;
	INSERT INTO enum_master(
		id, master_name, option_name)
		VALUES 
		-- USER STATUS
		(1,'user_status','active'),
		(2,'user_status','suspended'),
		(3,'user_status','deleted'),

		-- BRAND-MODEL STATUS
		(1,'brand_model_status','active'),
		(2,'brand_model_status','inactive'),
		(3,'brand_model_status','deprecated'),
		
		-- PRODUCT STATUS active inactive deleted
		(1,'product_status','active'),
		(2,'product_status','inactive'),
		(3,'product_status','deleted'),
		
		-- product_condition 
		(1,'product_condition','good'),
		(2,'product_condition','fair'),
		(3,'product_condition','superb'),

		-- ORDER STATUS
		(1,'order_status','pending'),
		(2,'order_status','paid'),
		(3,'order_status','shipped'),
		(4,'order_status','cancelled'),

		-- SELL-LISTING STATUS pending assigned rejected transferred
		-- (1,'listing_status','pending'),
		-- (2,'listing_status','out_for_delivery'),
		-- (3,'listing_status','inspection_started'),
		-- (4,'listing_status','inspection_complete'),
		-- (4,'listing_status','assigned'),
		-- (4,'listing_status','renegotiating'),
		-- (4,'listing_status','completed'),
		-- (4,'listing_status','cancelled'),

		-- PICKUP STATUS
		(1,'pickup_status','scheduled'),
		(2,'pickup_status','rescheduled'),
		(3,'pickup_status','completed'),
		(4,'pickup_status','cancelled'),
		(5,'pickup_status','failed'),
		
		-- QUESTIONS CONTEXT
		(1,'question_context','sell'),
		(2,'question_context','inspection'),
		(3,'question_context','both'),
		
		-- INVITE STATUS
		(1,'invite_status','pending'),
		(2,'invite_status','accepted'),
		(3,'invite_status','expired');

	-- SELL-LISTING STATUS pending assigned rejected transferred
	-- Additional merchant lifecycle statuses (id auto-assigned per master_name)
	INSERT INTO enum_master(master_name, option_name)
	VALUES
		('listing_status','pending'),
		('listing_status','assigned'),
		('listing_status','out_for_delivery'),
		('listing_status','inspection_started'),
		('listing_status','inspection_complete'),
		('listing_status','renegotiating'),
		('listing_status','completed'),
		('listing_status','cancelled');
		('inspection_status','started'),
		('inspection_status','completed'),
		('inspection_status','cancelled'),
		('offer_status','pending'),
		('offer_status','accepted'),
		('offer_status','rejected')
	ON CONFLICT(master_name, option_name) DO NOTHING;
		
	INSERT INTO roles(
		id,name, description, is_system)
		VALUES
		(1,'user', 'Normal users in application',true),
		(2,'admin', 'Administrator access ',true),
		(3,'seller', 'Will receive leads',true),
		(4,'agents', 'who Pickup and drops items',true),
		(5,'merchant', 'Merchants who buy devices from users',true);
		
	INSERT INTO users(

		email, phone, password)
		VALUES ('admin@gmail.com', '7498605559', '$2b$10$GcVY0w77WH8tCJezUmNgS.jFn8mGfq/oA/f1EzRfL9vVkkxHR6uF.');
		
	INSERT INTO user_profile(
		user_id,first_name,last_name
	) VALUES(1,'Sarthak','Misal');

	INSERT INTO user_roles (user_id, role_id)
		VALUES (1, 2);
COMMIT;
-- AUTH READY
-- INSERT INTO categories(
-- 	name, parent_id, slug)
-- 	VALUES 
-- 	('Electronics', NULL, 'electronics'),
-- 	('Vehicles', NULL, 'vehicles'),
-- 	('Smartphones', 1, 'smartphones');

-- INSERT INTO brands(
-- 	name, slug)
-- 	VALUES
-- 	('Vivo', 'vivo'),
-- 	('Apple', 'apple'),
-- 	('Samsung', 'samsung');

-- INSERT INTO brand_categories(
-- 	brand_id,
-- 	category_id
-- ) VALUES
-- 	(1,3),
-- 	(2,3),
-- 	(3,3);

-- INSERT INTO services(
-- 	name, slug)
-- 	VALUES 
-- 	('buy', 'buy'),
-- 	('repair', 'repair'),
-- 	('sell', 'sell');

-- INSERT INTO model_series(
-- 	brand_id, name, slug)
-- 	VALUES
-- 	(1, 'Y Series', 'y-series'),
-- 	(1, 'T Series', 't-series'),
-- 	(2, 'Standard', 'standard'),
-- 	(2, 'Pro', 'pro'),
-- 	(2, 'Pro Max', 'pro-max'),
-- 	(3, 'A Series', 'a-series'),
-- 	(3, 'S Series', 's-series');

	
	-- select * from enum_master;
	-- select * from users;
	-- select * from user_profile
	-- select * from roles
	-- select * from categories
	-- select * from brands
	-- select * from services
	-- select * from model_series
	-- select * from auth_otp
	-- drop table auth_otp
-- truncate table categories cascade,models,service_categories,product_categories,product_master,
-- product_options,product_variants,product_attributes,product_option_values,variant_option_values


