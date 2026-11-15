const pool = require('../config/database');


exports.createProduct = async (payload) => {
    // return "hello";
    // console.log(payload)
    const client = await pool.connect();
    const { product, options, variants, attributes, imagesMeta } = payload;

    try {
        let optionValueMap = {};
        await client.query('BEGIN');
        const isExist = await client.query(`SELECT id FROM product_master WHERE slug=$1`, [product.slug]);
        if (isExist.rowCount > 0) throw { status: 409, message: "Product with same slug already exists" }

        const prod = await pool.query("INSERT INTO product_master (name, model_id, description, vendor, slug) VALUES ($1,$2,$3,$4,$5) RETURNING id, name, vendor", [product.name, product.model_id, product.description, product.vendor, product.slug]);
        const product_id = prod.rows[0].id;

        for (const option of options) {

            const opt = await client.query(`INSERT INTO product_options (product_id, name) VALUES ($1,$2) RETURNING id`, [product_id, option.name]);
            const option_id = opt.rows[0].id;
            for (const value of option.values) {
                // console.log(option.name, value, "SARThAK");
                const pov = await client.query(`INSERT INTO product_option_values (option_id, value) VALUES ($1,$2) RETURNING id`, [option_id, value]);
                optionValueMap[`${option.name}:${value}`] = pov.rows[0].id;
            }
        }
        // console.log('vella')
        for (const variant of variants) {
            const varnt = await client.query(`INSERT INTO product_variants (product_id, sku, price, inventory_quantity) VALUES ($1,$2,$3,$4) RETURNING id`,
                [product_id, variant.sku, variant.price, variant.inventory_quantity]);
            const variant_id = varnt.rows[0].id;

            for (const opt of variant.combo) {
                // console.log(variant.sku, opt, "MISAL");
                const opt_id = optionValueMap[`${opt.option}:${opt.value}`];
                await client.query(`INSERT INTO variant_option_values (variant_id, option_value_id) VALUES ($1,$2)`, [variant_id, opt_id]);
            }
        }
        for (const attr of attributes) {
            await client.query(`INSERT INTO product_attributes(product_id, key, value) VALUES($1, $2, $3)`, [product_id, attr.key, attr.value])
        }

        for (let i = 0; i < imagesMeta.length; i++) {
            const imgs = await client.query(`INSERT INTO images(url, alt_text) VALUES($1, $2) RETURNING id`, [imagesMeta[i].url, imagesMeta[i].alt_text]);
            const image_id = imgs.rows[0].id;
            await client.query(`INSERT INTO product_images(product_id, image_id, is_primary, sort_index) VALUES($1, $2, $3,$4)`, [product_id, image_id, imagesMeta[i].is_primary, imagesMeta[i].sort_index]);
        }

        await client.query("COMMIT");
        return prod.rows[0];
    } catch (e) {
        await client.query('ROLLBACK');
        throw { status: e.status || 500, message: e.message || "Error creating product" }
    }
    finally {
        client.release();
    }

}

exports.getProducts = async ({ id }) => {
    const values = [];
    let whereClause = "WHERE pm.status=1";
    if (id) {
        values.push(id);
        whereClause += ` AND pm.id=$${values.length}`;
    }
    const result = await pool.query(`
        SELECT pm.id, pm.name, m.name model, pm.vendor, pm.slug,
               b.name brand, c.name category,
               em.option_name status_label
        FROM product_master pm
        JOIN models m ON pm.model_id=m.id
        JOIN brands b ON m.brand_id=b.id
        LEFT JOIN categories c ON m.category_id=c.id
        LEFT JOIN enum_master em ON pm.status=em.id AND em.master_name='product_status'
        ${whereClause}
        ORDER BY pm.created_at DESC
        
        `, values);

    for (const product of result.rows) {
        const imgRes = await pool.query(
            `SELECT i.id, i.url, i.alt_text, pi.is_primary, pi.sort_index
            FROM product_images pi
            JOIN images i ON pi.image_id=i.id
            WHERE pi.product_id=$1
            ORDER BY pi.sort_index `,
            [product.id]
        );
        product.images = imgRes.rows;

        const varRes = await pool.query(
            `SELECT pv.id, pv.sku, pv.price, pv.inventory_quantity
            FROM product_variants pv
            WHERE pv.product_id=$1
            ORDER BY pv.id`,
            [product.id]
        );
        product.variants = varRes.rows;

        const attrRes = await pool.query(
            `SELECT key, value FROM product_attributes WHERE product_id=$1`,
            [product.id]
        );
        product.attributes = attrRes.rows;
    }
    return result.rows;
}

exports.softDeleteProduct = async (id) => {
    const result = await pool.query(
        `UPDATE product_master SET status=2, updated_at=NOW() WHERE id=$1 AND status!=2 RETURNING id, name`,
        [id]
    );
    if (result.rowCount === 0) throw { status: 404, message: "Product not found or already deleted" };
    return result.rows[0];
}

exports.updateProduct = async (id, payload) => {
    const client = await pool.connect();
    const { product, options, variants, attributes, imagesMeta } = payload;

    try {
        await client.query('BEGIN');

        // Update product_master
        if (product) {
            const isExist = await client.query(`SELECT id FROM product_master WHERE slug=$1 AND id!=$2`, [product.slug, id]);
            if (isExist.rowCount > 0) throw { status: 409, message: "Product with same slug already exists" }
            await client.query(
                `UPDATE product_master 
                 SET name=$1, model_id=$2, description=$3, vendor=$4, slug=$5, updated_at=NOW() 
                 WHERE id=$6`,
                [product.name, product.model_id, product.description, product.vendor, product.slug, id]
            );
        }

        // Clear and update options and their values
        if (options) {
            await client.query(`DELETE FROM product_options WHERE product_id=$1`, [id]);
            let optionValueMap = {};
            for (const option of options) {
                const opt = await client.query(`INSERT INTO product_options (product_id, name) VALUES ($1,$2) RETURNING id`, [id, option.name]);
                const option_id = opt.rows[0].id;
                for (const value of option.values) {
                    const pov = await client.query(`INSERT INTO product_option_values (option_id, value) VALUES ($1,$2) RETURNING id`, [option_id, value]);
                    optionValueMap[`${option.name}:${value}`] = pov.rows[0].id;
                }
            }
        }

        // Clear and update variants
        if (variants) {
            await client.query(`DELETE FROM product_variants WHERE product_id=$1`, [id]);
            for (const variant of variants) {
                const varnt = await client.query(`INSERT INTO product_variants (product_id, sku, price, inventory_quantity) VALUES ($1,$2,$3,$4) RETURNING id`,
                    [id, variant.sku, variant.price, variant.inventory_quantity]);
                const variant_id = varnt.rows[0].id;

                for (const opt of variant.combo) {
                    const opt_id = optionValueMap[`${opt.option}:${opt.value}`];
                    await client.query(`INSERT INTO variant_option_values (variant_id, option_value_id) VALUES ($1,$2)`, [variant_id, opt_id]);
                }
            }
        }

        // Clear and update attributes
        if (attributes) {
            await client.query(`DELETE FROM product_attributes WHERE product_id=$1`, [id]);
            for (const attr of attributes) {
                await client.query(`INSERT INTO product_attributes(product_id, key, value) VALUES($1, $2, $3)`, [id, attr.key, attr.value])
            }
        }

        // Update images
        if (imagesMeta) {
            const oldImages = await client.query(`SELECT i.id, i.url FROM product_images pi JOIN images i ON pi.image_id=i.id WHERE pi.product_id=$1`, [id]);
            for (const oldImage of oldImages.rows) {
                await deleteFile(oldImage.url);
                await client.query(`DELETE FROM images WHERE id=$1`, [oldImage.id]);
            }
            await client.query(`DELETE FROM product_images WHERE product_id=$1`, [id]);

            for (let i = 0; i < imagesMeta.length; i++) {
                const imgs = await client.query(`INSERT INTO images(url, alt_text) VALUES($1, $2) RETURNING id`, [imagesMeta[i].url, imagesMeta[i].alt_text]);
                const image_id = imgs.rows[0].id;
                await client.query(`INSERT INTO product_images(product_id, image_id, is_primary, sort_index) VALUES($1, $2, $3,$4)`, [id, image_id, imagesMeta[i].is_primary, imagesMeta[i].sort_index]);
            }
        }

        await client.query("COMMIT");
        return { id, name: product.name };
    } catch (e) {
        await client.query('ROLLBACK');
        if (imagesMeta) {
            for (const img of imagesMeta) {
                if (img.url) await deleteFile(img.url);
            }
        }
        throw { status: e.status || 500, message: e.message || "Error updating product" }
    }
    finally {
        client.release();
    }
}

exports.getProductBySlug = async ({ slug }) => {
    const productRes = await pool.query(
        `SELECT pm.id, pm.name, pm.description, pm.vendor, pm.slug, pm.status,
                pm.created_at, pm.updated_at,
                m.name model, m.slug model_slug,
                b.name brand, b.slug brand_slug,
                ms.name series, ms.slug series_slug,
                c.name category, c.slug category_slug,
                em.option_name condition
         FROM product_master pm
         JOIN models m ON pm.model_id=m.id
         JOIN brands b ON m.brand_id=b.id
         LEFT JOIN model_series ms ON m.series_id=ms.id
         LEFT JOIN categories c ON m.category_id=c.id
         LEFT JOIN enum_master em ON pm.condition=em.id AND em.master_name='product_condition'
         WHERE pm.slug=$1 AND pm.status=1`,
        [slug]
    );
    if (productRes.rowCount === 0) throw { status: 404, message: "Product not found" };
    const product = productRes.rows[0];
    const productId = product.id;

    const variantsRes = await pool.query(
        `SELECT pv.id, pv.sku, pv.price, pv.inventory_quantity,
                pv.created_at, pv.updated_at
         FROM product_variants pv
         WHERE pv.product_id=$1
         ORDER BY pv.id`,
        [productId]
    );

    for (const variant of variantsRes.rows) {
        const vOptRes = await pool.query(
            `SELECT po.name option_name, pov.value
             FROM variant_option_values vov
             JOIN product_option_values pov ON vov.option_value_id=pov.id
             JOIN product_options po ON pov.option_id=po.id
             WHERE vov.variant_id=$1`,
            [variant.id]
        );
        variant.selected_options = vOptRes.rows;
    }

    const optionsRes = await pool.query(
        `SELECT po.id option_id, po.name option_name,
                pov.id value_id, pov.value
         FROM product_options po
         JOIN product_option_values pov ON po.id=pov.option_id
         WHERE po.product_id=$1
         ORDER BY po.id, pov.id`,
        [productId]
    );

    const attributesRes = await pool.query(
        `SELECT key, value FROM product_attributes WHERE product_id=$1`,
        [productId]
    );

    const imagesRes = await pool.query(
        `SELECT i.id, i.url, i.alt_text, pi.is_primary, pi.sort_index
         FROM product_images pi
         JOIN images i ON pi.image_id=i.id
         WHERE pi.product_id=$1
         ORDER BY pi.sort_index`,
        [productId]
    );

    const optionsMap = {};
    for (const row of optionsRes.rows) {
        if (!optionsMap[row.option_id]) {
            optionsMap[row.option_id] = { name: row.option_name, values: [] };
        }
        optionsMap[row.option_id].values.push({ id: row.value_id, value: row.value });
    }

    return {
        id: product.id,
        name: product.name,
        description: product.description,
        vendor: product.vendor,
        slug: product.slug,
        status: product.status,
        condition: product.condition,
        created_at: product.created_at,
        updated_at: product.updated_at,
        brand: { name: product.brand, slug: product.brand_slug },
        model: { name: product.model, slug: product.model_slug },
        series: product.series ? { name: product.series, slug: product.series_slug } : null,
        category: product.category ? { name: product.category, slug: product.category_slug } : null,
        variants: variantsRes.rows,
        options: Object.values(optionsMap),
        attributes: attributesRes.rows,
        images: imagesRes.rows
    };
};

exports.getProductBySku = async ({ sku }) => {
    const variantRes = await pool.query(
        `SELECT pv.id variant_id, pv.product_id, pv.sku, pv.price, pv.inventory_quantity,
                pv.created_at variant_created_at, pv.updated_at variant_updated_at
         FROM product_variants pv
         WHERE pv.sku=$1`,
        [sku]
    );
    if (variantRes.rowCount === 0) throw { status: 404, message: "Product not found for given SKU" };

    const variant = variantRes.rows[0];
    const productId = variant.product_id;

    const productRes = await pool.query(
        `SELECT pm.id, pm.name, pm.description, pm.vendor, pm.slug, pm.status,
                pm.created_at, pm.updated_at,
                m.name model, m.slug model_slug,
                b.name brand, b.slug brand_slug,
                ms.name series, ms.slug series_slug,
                c.name category, c.slug category_slug,
                em.option_name condition
         FROM product_master pm
         JOIN models m ON pm.model_id=m.id
         JOIN brands b ON m.brand_id=b.id
         LEFT JOIN model_series ms ON m.series_id=ms.id
         LEFT JOIN categories c ON m.category_id=c.id
         LEFT JOIN enum_master em ON pm.condition=em.id AND em.master_name='product_condition'
         WHERE pm.id=$1`,
        [productId]
    );
    const product = productRes.rows[0];

    const optionsRes = await pool.query(
        `SELECT po.id option_id, po.name option_name,
                pov.id value_id, pov.value
         FROM product_options po
         JOIN product_option_values pov ON po.id=pov.option_id
         WHERE po.product_id=$1
         ORDER BY po.id, pov.id`,
        [productId]
    );

    const variantOptionsRes = await pool.query(
        `SELECT pov.id value_id, po.name option_name, pov.value
         FROM variant_option_values vov
         JOIN product_option_values pov ON vov.option_value_id=pov.id
         JOIN product_options po ON pov.option_id=po.id
         WHERE vov.variant_id=$1`,
        [variant.variant_id]
    );

    const attributesRes = await pool.query(
        `SELECT key, value FROM product_attributes WHERE product_id=$1`,
        [productId]
    );

    const imagesRes = await pool.query(
        `SELECT i.id, i.url, i.alt_text, pi.is_primary, pi.sort_index
         FROM product_images pi
         JOIN images i ON pi.image_id=i.id
         WHERE pi.product_id=$1
         ORDER BY pi.sort_index`,
        [productId]
    );

    const optionsMap = {};
    for (const row of optionsRes.rows) {
        if (!optionsMap[row.option_id]) {
            optionsMap[row.option_id] = { name: row.option_name, values: [] };
        }
        optionsMap[row.option_id].values.push({ id: row.value_id, value: row.value });
    }

    return {
        id: product.id,
        name: product.name,
        description: product.description,
        vendor: product.vendor,
        slug: product.slug,
        status: product.status,
        condition: product.condition,
        created_at: product.created_at,
        updated_at: product.updated_at,
        brand: { name: product.brand, slug: product.brand_slug },
        model: { name: product.model, slug: product.model_slug },
        series: product.series ? { name: product.series, slug: product.series_slug } : null,
        category: product.category ? { name: product.category, slug: product.category_slug } : null,
        variant: {
            sku: variant.sku,
            price: variant.price,
            inventory_quantity: variant.inventory_quantity,
            created_at: variant.variant_created_at,
            updated_at: variant.variant_updated_at,
            selected_options: variantOptionsRes.rows
        },
        options: Object.values(optionsMap),
        attributes: attributesRes.rows,
        images: imagesRes.rows
    };
};

exports.getProductsByBrand = async ({ brandSlug }) => {
    const values = [];
    let whereClause = "WHERE pm.status=1";

    if (brandSlug) {
        values.push(brandSlug);
        whereClause += ` AND b.slug=$${values.length}`;
    }

    const result = await pool.query(`
        SELECT pm.id, pm.name, m.name model, pm.vendor, pm.slug, (SELECT MIN(price) from product_variants WHERE product_id=pm.id) price
        FROM product_master pm
        JOIN models m ON pm.model_id=m.id
        JOIN brands b ON m.brand_id=b.id
        JOIN enum_master em ON pm.condition=em.id AND em.master_name='product_condition'
        ${whereClause}
        ORDER BY pm.created_at DESC
        
    `, values);

    for (const product of result.rows) {
        const imgRes = await pool.query(
            `SELECT i.url, i.alt_text
             FROM product_images pi
             JOIN images i ON pi.image_id=i.id
             WHERE pi.product_id=$1 AND pi.is_primary=true
             ORDER BY pi.sort_index`,
            [product.id]
        );

        product.images = imgRes.rows;
    }

    return result.rows;
};


// exports.getModelsByBrand = async ({ brandSlug }) => {
//     const values = [];
//     let whereClause = "WHERE m.status=1";

//     if (brandSlug) {
//         values.push(brandSlug);
//         whereClause += ` AND b.slug=$${values.length}`;
//     }

//     const result = await pool.query(`
//             SELECT m.name, m.slug brand_slug, i.url
//             FROM models m
//             JOIN brands b ON m.brand_id=b.id
//             JOIN model_images mi ON m.id=mi.model_id
//             JOIN images i ON mi.image_id=i.id
//             ${whereClause}
//             
//         `, values);

//     return result.rows;
// };


exports.getSeriesByBrand = async ({ brandSlug }) => {
    const values = [];
    let whereClause = "WHERE ms.status=1";

    if (brandSlug) {
        values.push(brandSlug);
        whereClause += ` AND b.slug=$${values.length}`;
    }

    const result = await pool.query(`
            SELECT ms.name, ms.slug
            FROM model_series ms
            JOIN brands b ON ms.brand_id=b.id            
            ${whereClause}
        `, values);

    return result.rows;
};

exports.getModelsByBrandSeries = async ({ brandSlug, seriesSlug }) => {
    const values = [];
    let whereClause = "WHERE m.status=1";

    if (brandSlug) {
        values.push(brandSlug);
        whereClause += ` AND b.slug=$${values.length}`;
    }

    if (seriesSlug) {
        values.push(seriesSlug);
        whereClause += ` AND ms.slug=$${values.length}`;
    }

    const result = await pool.query(`
            SELECT m.name, m.slug, i.url
            FROM models m
            JOIN brands b ON m.brand_id=b.id
            JOIN model_series ms ON m.series_id=ms.id
            JOIN model_images mi ON m.id=mi.model_id
            JOIN images i ON mi.image_id=i.id           
            ${whereClause}
            ORDER BY m.id
        `, values);

    return result.rows;
};

exports.getModelByBrandModel = async ({ brandSlug, modelSlug }) => {
    const values = [];
    let whereClause = "WHERE m.status=1";

    if (brandSlug) {
        values.push(brandSlug);
        whereClause += ` AND b.slug=$${values.length}`;
    }

    if (modelSlug) {
        values.push(modelSlug);
        whereClause += ` AND m.slug=$${values.length}`;
    }

    const result = await pool.query(`
            SELECT m.name, m.slug, i.url
            FROM models m
            JOIN brands b ON m.brand_id=b.id
            JOIN model_images mi ON m.id=mi.model_id
            JOIN images i ON mi.image_id=i.id       
            ${whereClause}
           
        `, values);
    for (let model of result.rows) {
        model.variants = await pool.query(`
            SELECT sc.id, sc.name, sc.base_price
            FROM sell_model_configs sc
            JOIN models m ON sc.model_id=m.id
            WHERE m.status=1 AND m.slug=$1
        `, [model.slug]).then(res => res.rows);
    }

    return result.rows;
};

exports.getQuestionsByModelSlug = async ({ modelSlug }) => {
    const values = [];
    let whereClause = "WHERE m.status=1";

    if (modelSlug) {
        values.push(modelSlug);
        whereClause += ` AND m.slug=$${values.length}`;
    }

    const result = await pool.query(`
            SELECT m.name, m.slug, i.url
            FROM models m
            JOIN brands b ON m.brand_id=b.id
            JOIN model_images mi ON m.id=mi.model_id
            JOIN images i ON mi.image_id=i.id       
            ${whereClause}
            
        `, values);
    for (let model of result.rows) {
        model.variants = await pool.query(`
            SELECT sc.id, sc.name, sc.base_price
            FROM sell_model_configs sc
            JOIN models m ON sc.model_id=m.id
            WHERE m.status=1 AND m.slug=$1
        `, [model.slug]).then(res => res.rows);
    }

    return result.rows;
};

exports.getVariantsByBrandModel = async ({ brandSlug, modelSlug }) => {
    const values = [];
    // let whereClause = "WHERE m.status=1 AND m.slug=";
    if (!brandSlug || !modelSlug) throw { status: 400, message: "brandSlug and modelSlug are required" };
    // if (brandSlug) {
    //     values.push(brandSlug);
    //     whereClause += ` AND b.slug=$${values.length}`;
    // }

    // if (modelSlug) {
    //     values.push(modelSlug);
    //     whereClause += ` AND m.slug=$${values.length}`;
    // }

    const result = await pool.query(`
            SELECT m.name, m.slug, i.url
            FROM models m
            JOIN brands b ON m.brand_id=b.id
            JOIN model_images mi ON m.id=mi.model_id
            JOIN images i ON mi.image_id=i.id       
            where m.slug=$1 AND b.slug=$2
           
        `, [modelSlug, brandSlug]);
    if (result.rows.length == 0) throw { status: 400, message: "Invalid Model or brand" }
    for (let model of result.rows) {
        model.variants = await pool.query(`
            SELECT sc.id, sc.name, sc.base_price
            FROM sell_model_configs sc
            JOIN models m ON sc.model_id=m.id
            WHERE m.status=1 AND m.slug=$1
        `, [model.slug]).then(res => res.rows);
    }

    return result.rows;
};