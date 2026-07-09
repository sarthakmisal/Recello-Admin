

select * from users u 
join user_profile up 
on u.id=up.user_id



select * from user_profi
select * from services
select * from categories
SELECT c1.id, c1.name, c2.name Parent,* FROM categories c1
LEFT JOIN categories c2 
ON c1.parent_id=c2.id
select * from brands_categories
select * from enum_master
UPDATE categories SET is_active=True WHERE id=3

SELECT id,created_at FROM auth_otp WHERE email=$1 AND created_at BETWEEN NOW()- INTERVAL '10 min' AND NOW() ORDER BY created_at DESC

select * from auth_otp where email='sarthakrmisal05@gmail.com'

SELECT id, name, slug from services where is_active=True

SELECT b.id, b.name,* FROM brands b LEFT JOIN enum_master e ON b.status=e.id
WHERE b.status=1


-- select * from models m 
-- join 


SELECT que.id,
	   que.text,
	   que.input_type,
		(
			SELECT jsonb_agg(
				jsonb_build_object(
					'id', qo.id,
					'text', qo.text,
					'deduction', qo.price_deduction,
					'show',
					COALESCE(
						(
							SELECT jsonb_agg(show_question_id)
							FROM sell_question_conditions WHERE trigger_option_id=qo.id
						),'[]'::JSONB
					)
				)
			)
			FROM sell_question_options qo
			WHERE qo.question_id = que.id
		) options,
		(
			SELECT jsonb_agg(
				jsonb_build_object(
					'id', cat.id
					'name', cat.name
				)
			)
			FROM sell_category_questions scq 
			JOIN categories cat ON scq.category_id=cat.id
			WHERE scq.question_id=que.id
		) categories
FROM sell_questions que 
-- JOIN sell_category_questions cq ON cq.category_id=m.category_id 
-- JOIN sell_questions que ON que.id=cq.question_id 
-- WHERE m.slug='oneplus-nord-ce5-5g' AND cq.category_id=2 AND que.id>=10
-- GROUP BY m.name;

















select * from sell_question_conditions
select * from sell_category_questions
select * from sell_question_options order by id desc

select * from categories where parent_id is not null;
select * from models where category_id=5
-- ALTER TABLE sell_listings ADD COLUMN config_id BIGINT REFERENCES sell_model_configs(id) ON DELETE SET NULL;

-- ALTER TABLE sell_listings ADD COLUMN base_price NUMERIC(10,2), ADD COLUMN quoted_price NUMERIC(10,2) ADD COLUMN condition INT



























	CREATE TABLE sell_questions (
		id BIGSERIAL PRIMARY KEY,
		text TEXT NOT NULL,
		description TEXT,                          -- helper text shown below question
		input_type VARCHAR(20) NOT NULL,           -- 'yes_no', 'single_select', 'multi_select'
		sort_index INT DEFAULT 1,
		is_active BOOLEAN DEFAULT TRUE
	);
	CREATE TABLE sell_category_questions (
		category_id BIGINT REFERENCES categories(id) ON DELETE CASCADE,
		question_id BIGINT REFERENCES sell_questions(id) ON DELETE CASCADE,
		sort_index INT DEFAULT 1,
		PRIMARY KEY (category_id, question_id)
	);
	CREATE TABLE sell_question_options (
		id BIGSERIAL PRIMARY KEY,
		question_id BIGINT NOT NULL REFERENCES sell_questions(id) ON DELETE CASCADE,
		text VARCHAR(100) NOT NULL,                -- "Yes", "No", "Minor Scratches"
		price_deduction NUMERIC(10,2) DEFAULT 0,  -- deducted from base price
		sort_index INT DEFAULT 1
	);
	CREATE TABLE sell_option_deduction_rates (
		category_id BIGINT REFERENCES categories(id) ON DELETE CASCADE,
		option_id BIGINT REFERENCES sell_question_options(id) ON DELETE CASCADE,
		rate NUMERIC(5,2) NOT NULL DEFAULT 0,  -- 15% for all phones
		PRIMARY KEY (category_id, option_id)
	);

select 

select sq.text que,input_type type, qo.text option  
from sell_questions sq 
join sell_question_options qo on sq.id=qo.question_id




SELECT que.id, que.text, que.input_type
FROM sell_questions
-- JOIN sell_category_questions cq ON cq.category_id
-- JOIN sell_questions que ON que.id=cq.question_id



SELECT m.name model,jsonb_agg(
	jsonb_build_object(
	    'id', que.id,
	    'question', que.text,
	    'que_type', que.input_type,
		'show', NOT EXISTS (SELECT 1 FROM sell_question_conditions WHERE question_id = que.id),
	    'options',
		    (
		        SELECT jsonb_agg(
		            jsonb_build_object(
		                'id', qo.id,
		                'text', qo.text,
		                'deduction', qo.price_deduction,
						'show',
						COALESCE(
							(
								SELECT jsonb_agg(show_question_id)
								FROM sell_question_conditions WHERE trigger_option_id=qo.id
							),'[]'::JSONB
						)
		            )
		        )
		        FROM sell_question_options qo
		        WHERE qo.question_id = que.id
		   )
	)
) questions FROM models m 
JOIN sell_category_questions cq ON cq.category_id=m.category_id 
JOIN sell_questions que ON que.id=cq.question_id 
-- WHERE m.slug='oneplus-nord-ce5-5g' AND cq.category_id=2 AND que.id>=10
GROUP BY m.name;















select * from categories
select * from sell_questions order by id desc;
select * from sell_question_options order by id desc;
select * from sell_category_questions
select * from sell_question_conditions

-- delete from sell_questions where id<10