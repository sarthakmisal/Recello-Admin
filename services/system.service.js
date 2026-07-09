const pool = require("../config/database");
const slugify = require('slugify')
const deleteFile = require("../config/delete.config");
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const deleteImageIfUnreferenced = async (client, imageId) => {
    if (!imageId) return null;
    const deleted = await client.query(
        `DELETE FROM images img
                 WHERE img.id=$1
                     AND NOT EXISTS (SELECT 1 FROM product_images pi WHERE pi.image_id = img.id)
                     AND NOT EXISTS (SELECT 1 FROM brand_images bi WHERE bi.image_id = img.id)
                     AND NOT EXISTS (SELECT 1 FROM service_images si WHERE si.image_id = img.id)
                     AND NOT EXISTS (SELECT 1 FROM category_images ci WHERE ci.image_id = img.id)
                     AND NOT EXISTS (SELECT 1 FROM model_images mi WHERE mi.image_id = img.id)
                 RETURNING img.url`,
        [imageId]
    );
    return deleted.rows?.[0]?.url || null;
}

exports.getServices = async ({ all } = {}) => {
    const includeAll = String(all).toLowerCase() === 'true' || all === true || all === 1 || all === '1';
    const whereClause = includeAll ? '' : 'WHERE s.is_active=True';
    const data = await pool.query(`SELECT s.id, s.name, img.url, s.is_active status from services s
        JOIN service_images si ON s.id=si.service_id
        JOIN images img ON si.image_id=img.id
        ${whereClause}
        ORDER BY s.id DESC`);
    return data.rows;
}
exports.createService = async (data) => {
    const { name, image } = data
    // console.log('lala')
    // return data;
    if (!name || !image) throw { status: 400, message: "Service Name & Image is required" }
    const slug = slugify(name, { lower: true, strict: true });
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const val = await client.query("SELECT 1 ans FROM services WHERE slug=$1", [slug]);
        if (val.rowCount >= 1) throw { status: 409, message: "Service already Exists" }
        console.log(data, "service data");

        const img = await pool.query(`INSERT INTO images(
            url, alt_text, uploaded_by
            ) VALUES ($1, $2, $3) RETURNING id`, [image, name + " Image", null]);
        const servc = await pool.query("INSERT INTO services(name, slug) VALUES ($1, $2) RETURNING id, name, slug", [name, slug]);
        await pool.query(`INSERT INTO service_images(
            service_id, image_id
            ) VALUES ($1, $2)`, [servc.rows[0].id, img.rows[0].id]);

        await client.query("COMMIT");
        return servc.rows;
    } catch (error) {
        try { await deleteFile(image); } catch (_) { }
        await client.query("ROLLBACK");

        throw {
            status: error.status || 500,
            message: error.message || "Failed to create Service"
        };
    } finally {
        client.release();
    }
}

exports.deleteService = async (id) => {
    const data = await pool.query(`delete from services WHERE id=$1 RETURNING id, name`, [id]);
    // const data = await pool.query(`UPDATE services SET is_active=False WHERE id=$1 RETURNING id, name`, [id]);
    return data.rows;
}

exports.toggleService = async (id, status) => {
    const isEnabled = String(status).toLowerCase() === 'true' || status === true || status === 1 || status === '1';
    const data = await pool.query(
        `UPDATE services SET is_active=$1 WHERE id=$2 RETURNING id, name, is_active status`,
        [isEnabled, id],
    );
    if (data.rowCount === 0) throw { status: 404, message: "Service not found" };
    return data.rows;
}

exports.updateService = async (id, data) => {
    const { name, image } = data;
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const service = await client.query("SELECT * FROM services WHERE id=$1", [id]);
        if (service.rowCount === 0) throw { status: 404, message: "Service not found" };

        let slug;
        if (name) {
            slug = slugify(name, { lower: true, strict: true });
            const val = await client.query("SELECT 1 ans FROM services WHERE slug=$1 AND id!=$2", [slug, id]);
            if (val.rowCount >= 1) throw { status: 409, message: "Service with this name already Exists" }
            await client.query("UPDATE services SET name=$1, slug=$2 WHERE id=$3", [name, slug, id]);
        }

        if (image) {
            let oldFileToDelete = null;
            const imgResult = await client.query(`SELECT image_id FROM service_images WHERE service_id=$1`, [id]);
            const oldImageId = imgResult.rows[0].image_id;

            const img = await client.query(`INSERT INTO images(url, alt_text, uploaded_by) VALUES ($1, $2, $3) RETURNING id`, [image, name + " Image", null]);
            await client.query(`UPDATE service_images SET image_id=$1 WHERE service_id=$2`, [img.rows[0].id, id]);
            oldFileToDelete = await deleteImageIfUnreferenced(client, oldImageId);
            await client.query("COMMIT");
            if (oldFileToDelete) {
                try { await deleteFile(oldFileToDelete); } catch (_) { }
            }

            const updatedService = await pool.query(`SELECT s.id, s.name, img.url from services s
                JOIN service_images si ON s.id=si.service_id
                JOIN images img ON si.image_id=img.id
                where s.id=$1`, [id]);
            return updatedService.rows[0];
        }

        await client.query("COMMIT");
        const updatedService = await pool.query(`SELECT s.id, s.name, img.url from services s
            JOIN service_images si ON s.id=si.service_id
            JOIN images img ON si.image_id=img.id
            where s.id=$1`, [id]);
        return updatedService.rows[0];
    } catch (error) {
        if (image) {
            try { await deleteFile(image); } catch (_) { }
        }
        await client.query("ROLLBACK");
        throw {
            status: error.status || 500,
            message: error.message || "Failed to update Service"
        };
    } finally {
        client.release();
    }
}

exports.getCategories = async ({ sub }) => {
    let whquery = ""; //WHERE c1.is_active=True
    if (sub.toString().toLowerCase() == 'true') {
        whquery += " WHERE c1.parent_id IS NOT NULL"
    }
    const data = await pool.query(`SELECT c1.id, c1.name, c1.slug, c2.name Parent, img.url, c1.is_active status 
        FROM categories c1 LEFT JOIN categories c2 ON c1.parent_id=c2.id
        JOIN category_images ci ON c1.id=ci.category_id
        JOIN images img ON ci.image_id=img.id
         ${whquery}`);
    return data.rows;
}
exports.createCategory = async (data) => {
    const { name, parent_id, image } = data;

    if (!name || !image) throw { status: 400, message: "Name & Image are required" };

    let pid = parent_id || null;

    const slug = slugify(name, { lower: true, strict: true });

    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        if (pid) {
            const parentCheck = await client.query(
                "SELECT 1 FROM categories WHERE id=$1",
                [pid]
            );
            if (parentCheck.rowCount === 0)
                throw { status: 404, message: "No such Parent Category" };
        }

        const exists = await client.query(
            "SELECT 1 FROM categories WHERE slug=$1",
            [slug]
        );
        console.log('deva', exists)
        if (exists.rowCount >= 1)
            throw { status: 409, message: "Category already Exists" };

        const img = await client.query(
            `INSERT INTO images(url, alt_text, uploaded_by)
             VALUES ($1,$2,$3) RETURNING id`,
            [image, name + " Image", null]
        );

        const category = await client.query(
            `INSERT INTO categories(name, slug, parent_id)
             VALUES ($1,$2,$3)
             RETURNING id, name, slug`,
            [name, slug, pid]
        );

        await client.query(
            `INSERT INTO category_images(category_id, image_id)
             VALUES ($1,$2)`,
            [category.rows[0].id, img.rows[0].id]
        );

        await client.query("COMMIT");
        return category.rows;
    } catch (error) {
        try { await deleteFile(image); } catch (_) { }
        await client.query("ROLLBACK");

        throw {
            status: error.status || 500,
            message: error.message || "Failed to create Category"
        };
    } finally {
        client.release();
    }
};
exports.toggleCategory = async (id, status) => {
    const data = await pool.query(`UPDATE categories SET is_active=$1 WHERE id=$2 RETURNING id, name`, [status, id]);
    return data.rows;
}

exports.updateCategory = async (id, data) => {
    const { name, parent_id, image } = data;
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const category = await client.query("SELECT * FROM categories WHERE id=$1", [id]);
        if (category.rowCount === 0) throw { status: 404, message: "Category not found" };

        if (name) {
            const slug = slugify(name, { lower: true, strict: true });
            const val = await client.query("SELECT 1 ans FROM categories WHERE slug=$1 AND id!=$2", [slug, id]);
            if (val.rowCount >= 1) throw { status: 409, message: "Category with this name already Exists" }
            await client.query("UPDATE categories SET name=$1, slug=$2 WHERE id=$3", [name, slug, id]);
        }

        if (parent_id) {
            const parentCheck = await client.query("SELECT 1 FROM categories WHERE id=$1", [parent_id]);
            if (parentCheck.rowCount === 0) throw { status: 404, message: "No such Parent Category" };
            await client.query("UPDATE categories SET parent_id=$1 WHERE id=$2", [parent_id, id]);
        }

        if (image) {
            let oldFileToDelete = null;
            const imgResult = await client.query(`SELECT image_id FROM category_images WHERE category_id=$1`, [id]);
            const oldImageId = imgResult.rows[0].image_id;

            const img = await client.query(`INSERT INTO images(url, alt_text, uploaded_by) VALUES ($1, $2, $3) RETURNING id`, [image, name + " Image", null]);
            await client.query(`UPDATE category_images SET image_id=$1 WHERE category_id=$2`, [img.rows[0].id, id]);
            oldFileToDelete = await deleteImageIfUnreferenced(client, oldImageId);

            await client.query("COMMIT");
            if (oldFileToDelete) {
                try { await deleteFile(oldFileToDelete); } catch (_) { }
            }

            const updatedCategory = await pool.query(`SELECT c1.id, c1.name, c1.slug, c2.name Parent, '/system/get_brands/'|| c1.slug route, img.url 
                FROM categories c1 LEFT JOIN categories c2 ON c1.parent_id=c2.id
                JOIN category_images ci ON c1.id=ci.category_id
                JOIN images img ON ci.image_id=img.id
                WHERE c1.id=$1`, [id]);
            return updatedCategory.rows[0];
        }

        await client.query("COMMIT");
        const updatedCategory = await pool.query(`SELECT c1.id, c1.name, c1.slug, c2.name Parent, '/system/get_brands/'|| c1.slug route, img.url 
            FROM categories c1 LEFT JOIN categories c2 ON c1.parent_id=c2.id
            JOIN category_images ci ON c1.id=ci.category_id
            JOIN images img ON ci.image_id=img.id
            WHERE c1.id=$1`, [id]);
        return updatedCategory.rows[0];
    } catch (error) {
        if (image) {
            try { await deleteFile(image); } catch (_) { }
        }
        await client.query("ROLLBACK");
        throw {
            status: error.status || 500,
            message: error.message || "Failed to update Category"
        };
    } finally {
        client.release();
    }
}

exports.getBrands = async ({ cat_slug, all }) => {
    // console.log(cat_slug, "category slug") // IGNORE
    // status: 1=active, 0=inactive, 2=deleted/deprecated
    const includeAll = String(all).toLowerCase() === 'true' || all === true || all === 1 || all === '1';
    let whquery = includeAll ? " WHERE b.status<>2" : " WHERE b.status=1";
    if (cat_slug) {
        const cat_data = await pool.query(`select c.id,c.slug from categories c where c.slug=$1`, [cat_slug]);
        if (cat_data.rowCount === 0) throw { status: 404, message: "Category not found" };
        whquery += " AND bc.category_id=" + cat_data.rows[0].id;
        // console.log(whquery,cat_data.rows, "whquery") // IGNORE
    }
    const data = await pool.query(`select b.id, b.name, b.slug, img.url, (b.status=1) status, count(DISTINCT ms.id) series_count
        from brands b
        join brand_categories bc on b.id = bc.brand_id
        left join brand_images bi on b.id=bi.brand_id
        left join images img on bi.image_id=img.id
        left join model_series ms on b.id=ms.brand_id and ms.status=1
        ${whquery}
        group by b.id, img.url
        ORDER BY b.id
        `);
    // data.rows.map(b => b.route = `/product/brand/${b.slug}/products`)
    return data.rows;
}

exports.toggleBrand = async (id, status) => {
    const isEnabled = String(status).toLowerCase() === 'true' || status === true || status === 1 || status === '1';
    const nextStatus = isEnabled ? 1 : 0;
    const data = await pool.query(
        `UPDATE brands SET status=$1 WHERE id=$2 AND status<>2 RETURNING id, name, (status=1) status`,
        [nextStatus, id],
    );
    if (data.rowCount === 0) throw { status: 404, message: "Brand not found" };
    return data.rows;
}

// ── Brands Excel ─────────────────────────────────────────
exports.getBrandsImportTemplate = async () => {
    const wb = XLSX.utils.book_new();

    const brandsSheet = XLSX.utils.aoa_to_sheet([
        ['name', 'category_slug', 'image_filename'],
        ['Apple', 'smartphones', 'apple.png'],
    ]);
    XLSX.utils.book_append_sheet(wb, brandsSheet, 'Brands');

    try {
        const cats = await pool.query(`SELECT id, name, slug FROM categories ORDER BY id ASC`);
        const catSheet = XLSX.utils.aoa_to_sheet([
            ['id', 'name', 'slug'],
            ...cats.rows.map((c) => [c.id, c.name, c.slug]),
        ]);
        XLSX.utils.book_append_sheet(wb, catSheet, 'Categories');
    } catch (_) {
        // If categories table isn't accessible, still return the Brands sheet.
    }

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    return { buffer, fileName: 'brands_import_template.xlsx' };
};

exports.getCategoryBrandMappings = async (categoryId) => {
    if (!categoryId) throw { status: 400, message: 'Category ID is required' };
    const cat = await pool.query('SELECT 1 FROM categories WHERE id=$1', [categoryId]);
    if (cat.rowCount === 0) throw { status: 404, message: 'Category not found' };

    const data = await pool.query(
        'SELECT brand_id FROM brand_categories WHERE category_id=$1 ORDER BY brand_id ASC',
        [categoryId],
    );
    return data.rows.map((r) => Number(r.brand_id)).filter((n) => Number.isFinite(n));
};

exports.updateCategoryBrandMappings = async (categoryId, brandIds = []) => {
    if (!categoryId) throw { status: 400, message: 'Category ID is required' };

    const parsedBrandIds = Array.isArray(brandIds)
        ? brandIds.map((id) => Number(id)).filter((n) => Number.isFinite(n))
        : [];
    const uniqueBrandIds = [...new Set(parsedBrandIds)];
    // console.log('DEVAA',categoryId, brandIds, uniqueBrandIds, "updating category-brand mappings"); // IGNORE
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const cat = await client.query('SELECT 1 FROM categories WHERE id=$1', [categoryId]);
        if (cat.rowCount === 0) throw { status: 404, message: 'Category not found' };

        if (uniqueBrandIds.length) {
            const existing = await client.query(
                'SELECT id FROM brands WHERE id = ANY($1::bigint[]) AND status<>2',
                [uniqueBrandIds],
            );
            const existingIds = new Set(existing.rows.map((r) => Number(r.id)));
            const missing = uniqueBrandIds.filter((id) => !existingIds.has(id));
            if (missing.length) throw { status: 404, message: `Invalid brand id(s): ${missing.join(', ')}` };
        }
        await client.query('DELETE FROM brand_categories WHERE category_id=$1', [categoryId]);

        if (uniqueBrandIds.length) {
            await client.query(
                `INSERT INTO brand_categories(brand_id, category_id)
                SELECT DISTINCT bid, $2::bigint
                FROM UNNEST($1::bigint[]) AS bid`,
                [uniqueBrandIds, Number(categoryId)],
            );
            console.log(typeof (Number(categoryId)))
        }

        await client.query('COMMIT');
        return { success: true, category_id: Number(categoryId), mapped_count: uniqueBrandIds.length, brand_ids: uniqueBrandIds };
    } catch (error) {
        await client.query('ROLLBACK');
        throw {
            status: error.status || 500,
            message: error.message || 'Failed to update category brand mappings',
        };
    } finally {
        client.release();
    }
};

exports.importBrandsFromExcel = async (buffer) => {
    if (!buffer) throw { status: 400, message: 'Missing Excel buffer' };

    const wb = XLSX.read(buffer, { type: 'buffer' });
    const firstSheetName = wb.SheetNames?.[0];
    if (!firstSheetName) throw { status: 400, message: 'Excel file has no sheets' };

    const ws = wb.Sheets[firstSheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
    if (!rows || rows.length === 0) {
        return { inserted: 0, linked: 0, skipped: 0, errors: [{ row: 0, message: 'No rows found' }] };
    }

    const categoriesRes = await pool.query(`SELECT id, slug FROM categories`);
    const categoryBySlug = new Map(categoriesRes.rows.map((c) => [String(c.slug).toLowerCase(), c.id]));
    const categoryIds = new Set(categoriesRes.rows.map((c) => Number(c.id)));

    const uploadsDir = path.resolve(__dirname, '..', 'uploads');

    const summary = {
        inserted: 0,
        linked: 0,
        skipped: 0,
        errors: [],
    };

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        for (let i = 0; i < rows.length; i++) {
            const rowNumber = i + 2; // header is row 1
            const row = rows[i] || {};
            await client.query(`SAVEPOINT sp_${i}`);

            try {
                const name = String(row.name || row.brand_name || row.brand || '').trim();
                const categorySlug = String(row.category_slug || row.category || '').trim().toLowerCase();
                const categoryIdRaw = row.category_id ?? row.categoryId ?? '';
                const imageFilename = String(row.image_filename || row.image || row.image_file || '').trim();

                if (!name) throw { status: 400, message: 'name is required' };

                let categoryId = null;
                if (String(categoryIdRaw).trim()) {
                    const parsed = Number(String(categoryIdRaw).trim());
                    if (!Number.isFinite(parsed)) throw { status: 400, message: 'category_id must be a number' };
                    if (!categoryIds.has(parsed)) throw { status: 404, message: `Invalid category_id: ${parsed}` };
                    categoryId = parsed;
                } else if (categorySlug) {
                    const found = categoryBySlug.get(categorySlug);
                    if (!found) throw { status: 404, message: `Invalid category_slug: ${categorySlug}` };
                    categoryId = found;
                } else {
                    throw { status: 400, message: 'category_slug (or category_id) is required' };
                }

                if (!imageFilename) throw { status: 400, message: 'image_filename is required' };
                const imagePath = path.join(uploadsDir, imageFilename);
                if (!imagePath.startsWith(uploadsDir)) throw { status: 400, message: 'Invalid image_filename' };
                if (!fs.existsSync(imagePath)) {
                    throw { status: 400, message: `Image file not found in uploads/: ${imageFilename}` };
                }

                const slug = slugify(name, { lower: true, strict: true });
                const brandRes = await client.query(`SELECT id FROM brands WHERE slug=$1`, [slug]);

                if (brandRes.rowCount > 0) {
                    const brandId = brandRes.rows[0].id;
                    const existsLink = await client.query(
                        `SELECT 1 FROM brand_categories WHERE brand_id=$1 AND category_id=$2`,
                        [brandId, categoryId],
                    );
                    if (existsLink.rowCount > 0) {
                        summary.skipped += 1;
                        continue;
                    }
                    await client.query(
                        `INSERT INTO brand_categories(brand_id, category_id) VALUES ($1,$2)`,
                        [brandId, categoryId],
                    );
                    summary.linked += 1;
                    continue;
                }

                const newBrand = await client.query(
                    `INSERT INTO brands(name, slug) VALUES ($1,$2) RETURNING id`,
                    [name, slug],
                );
                const brandId = newBrand.rows[0].id;

                await client.query(
                    `INSERT INTO brand_categories(brand_id, category_id) VALUES ($1,$2)`,
                    [brandId, categoryId],
                );

                const img = await client.query(
                    `INSERT INTO images(url, alt_text, uploaded_by) VALUES ($1,$2,$3) RETURNING id`,
                    [imageFilename, 'Brand Image', null],
                );

                await client.query(
                    `INSERT INTO brand_images(brand_id, image_id) VALUES ($1,$2)`,
                    [brandId, img.rows[0].id],
                );

                summary.inserted += 1;
            } catch (e) {
                await client.query(`ROLLBACK TO SAVEPOINT sp_${i}`);
                summary.errors.push({
                    row: rowNumber,
                    message: e?.message || 'Failed to import row',
                });
            }
        }

        await client.query('COMMIT');
        return summary;
    } catch (e) {
        await client.query('ROLLBACK');
        throw {
            status: e.status || 500,
            message: e.message || 'Failed to import brands',
        };
    } finally {
        client.release();
    }
};
// exports.getCategoryBrands = async (params) => {
//     const { id } = params;
//     if (!id) throw { status: 400, message: "Category Id is required" };
//     const data = await pool.query(`
// select * from brands b
// join brand_categories bc
// on b.id=bc.brand_id
// where bc.category_id=$1`,
//         [id]);
//     return data.rows;
// }
exports.createBrand = async (data) => {
    const { name, category_id, image } = data;

    if (!name || !category_id || !image)
        throw { status: 400, message: "Name, Category & Image are required" };

    const slug = slugify(name, { lower: true, strict: true });
    const client = await pool.connect();

    let imageInserted = false;

    try {
        await client.query("BEGIN");

        const categoryCheck = await client.query(
            "SELECT 1 FROM categories WHERE id=$1",
            [category_id]
        );
        if (categoryCheck.rowCount === 0)
            throw { status: 404, message: "Invalid Category" };

        const exists = await client.query(
            "SELECT id, name, slug FROM brands WHERE slug=$1",
            [slug]
        );

        const img = await client.query(
            `INSERT INTO images(url, alt_text, uploaded_by)
             VALUES ($1,$2,$3) RETURNING id`,
            [image, "Brand Image", null]
        );

        imageInserted = true;
        let brand_cat; let brand;
        if (exists.rowCount >= 1) {
            brand_cat = await client.query("select * from brands b join brand_categories bc on b.id=bc.brand_id where b.id=$1 and bc.category_id=$2", [exists.rows[0].id, category_id]);
            if (brand_cat.rowCount >= 1) {
                throw { status: 409, message: "Brand already Exists" };
            } else {
                await client.query(
                    `INSERT INTO brand_categories(brand_id, category_id)
                     VALUES ($1,$2)`,
                    [exists.rows[0].id, category_id]
                );
            }
            brand = exists;
        }
        else {
            brand = await client.query(
                `INSERT INTO brands(name, slug)
                 VALUES ($1,$2)
                 RETURNING id, name, slug`,
                [name, slug]
            );
            await client.query(
                `INSERT INTO brand_categories(brand_id, category_id)
                 VALUES ($1,$2)`,
                [brand.rows[0].id, category_id]
            );
            await client.query(
                `INSERT INTO brand_images(brand_id, image_id)
                 VALUES ($1,$2)`,
                [brand.rows[0].id, img.rows[0].id]
            );
        }

        // console.log(brand.rows);



        await client.query("COMMIT");
        return brand.rows;

    } catch (error) {
        await client.query("ROLLBACK");

        if (imageInserted) {
            try { await deleteFile(image); } catch (_) { }
        }

        throw {
            status: error.status || 500,
            message: error.message || "Failed to create Brand"
        };
    } finally {
        client.release();
    }
};
exports.deleteBrand = async (id) => {
    const client = await pool.connect();
    let data;
    try {
        await client.query('BEGIN');
        const models = await client.query(`delete from models where brand_id=$1 returning id`, [id]);
        const series = await client.query(`delete from model_series where brand_id=$1 returning id`, [id]);
        // console.log(models.rows)
        // for (let i of models.rows) {
        // console.log(i,'atya')
        // await client.query(`delete from sell_model_configs where model_id =$1`, [i.id]);
        // }
        data = await client.query(`DELETE FROM brands WHERE id=$1 RETURNING id, name`, [id]);
        // const data = await pool.query(`UPDATE brands SET status=2 WHERE id=$1 RETURNING id, name`, [id]);
        await client.query('COMMIT');

    } catch (error) {
        await client.query("ROLLBACK");
        throw { status: 409, message: "schema config halted delete brands" }
    }
    return data.rows;
}

exports.updateBrand = async (id, data) => {
    const { name, category_id, image } = data;
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const brand = await client.query("SELECT * FROM brands WHERE id=$1", [id]);
        if (brand.rowCount === 0) throw { status: 404, message: "Brand not found" };

        if (name) {
            const slug = slugify(name, { lower: true, strict: true });
            const val = await client.query("SELECT 1 ans FROM brands WHERE slug=$1 AND id!=$2", [slug, id]);
            if (val.rowCount >= 1) throw { status: 409, message: "Brand with this name already Exists" }
            await client.query("UPDATE brands SET name=$1, slug=$2 WHERE id=$3", [name, slug, id]);
        }

        if (category_id) {
            const categoryCheck = await client.query("SELECT 1 FROM categories WHERE id=$1", [category_id]);
            if (categoryCheck.rowCount === 0) throw { status: 404, message: "Invalid Category" };
            await client.query("UPDATE brand_categories SET category_id=$1 WHERE brand_id=$2", [category_id, id]);
        }

        if (image) {
            let oldFileToDelete = null;
            const imgResult = await client.query(`SELECT image_id FROM brand_images WHERE brand_id=$1`, [id]);
            const oldImageId = imgResult.rows?.[0]?.image_id || null;

            const img = await client.query(`INSERT INTO images(url, alt_text, uploaded_by) VALUES ($1, $2, $3) RETURNING id`, [image, "Brand Image", null]);
            if (imgResult.rowCount === 0) {
                await client.query(`INSERT INTO brand_images(brand_id, image_id) VALUES ($1,$2)`, [id, img.rows[0].id]);
            } else {
                await client.query(`UPDATE brand_images SET image_id=$1 WHERE brand_id=$2`, [img.rows[0].id, id]);
            }
            oldFileToDelete = await deleteImageIfUnreferenced(client, oldImageId);

            await client.query("COMMIT");
            if (oldFileToDelete) {
                try { await deleteFile(oldFileToDelete); } catch (_) { }
            }

            const updatedBrand = await pool.query(`select b.id, b.name, b.slug, img.url, count(DISTINCT ms.id) series_count
                from brands b
                join brand_categories bc on b.id = bc.brand_id
                left join brand_images bi on b.id=bi.brand_id
                left join images img on bi.image_id=img.id
                left join model_series ms on b.id=ms.brand_id and ms.status=1
                WHERE b.id=$1
                group by b.id, img.url`, [id]);
            return updatedBrand.rows[0];
        }

        await client.query("COMMIT");
        const updatedBrand = await pool.query(`select b.id, b.name, b.slug, img.url, count(DISTINCT ms.id) series_count
            from brands b
            join brand_categories bc on b.id = bc.brand_id
            left join brand_images bi on b.id=bi.brand_id
            left join images img on bi.image_id=img.id
            left join model_series ms on b.id=ms.brand_id and ms.status=1
            WHERE b.id=$1
            group by b.id, img.url`, [id]);
        return updatedBrand.rows[0];
    } catch (error) {
        if (image) {
            try { await deleteFile(image); } catch (_) { }
        }
        await client.query("ROLLBACK");
        throw {
            status: error.status || 500,
            message: error.message || "Failed to update Brand"
        };
    } finally {
        client.release();
    }
}

exports.getRoles = async () => {
    const data = await pool.query(`SELECT id, name FROM roles WHERE is_system=True`);
    return data.rows;
}

exports.getModelSeries = async ({ brand_slug }) => {
    // const { id } = params
    if (!brand_slug) throw { status: 404, message: "Brand Slug is required" }
    const data = await pool.query(`select ms.id, ms.name, ms.slug, count(m.id) model_count
        from model_series ms
        join brands b on ms.brand_id=b.id
        left join models m on ms.id=m.series_id and m.status=1
        where ms.status=$1 AND b.status=$2 AND b.slug=$3
        group by ms.id`, [1, 1, brand_slug]);
    return data.rows;
}

exports.createSeries = async ({ name, brand_slug }) => {
    // const  = data
    const client = await pool.connect();

    if (!name || !brand_slug) throw { status: 400, message: "Series Name and Brand are required" }
    const slug = slugify(name, { lower: true, strict: true });
    try {
        await client.query("BEGIN");
        const val0 = await client.query("SELECT id FROM brands WHERE slug=$1", [brand_slug]);
        if (val0.rowCount === 0) throw { status: 404, message: "Invalid Brand" }
        const brand_id = val0.rows[0].id;
        const val = await client.query("SELECT 1 ans FROM model_series WHERE slug=$1 AND brand_id=$2", [slug, brand_id]);
        if (val.rowCount >= 1) throw { status: 409, message: "Series already Exists" }

        const result = await client.query("INSERT INTO model_series(brand_id, name, slug) VALUES ($1, $2, $3) RETURNING id, name, slug", [brand_id, name, slug]);

        await client.query("COMMIT");
        return result.rows;
    } catch (error) {
        await client.query("ROLLBACK");
        throw { status: error.status || 500, message: error.message || "Failed to create Brand" };
    }
    finally {
        client.release();
    }
}

exports.updateSeries = async (id, { name }) => {
    const client = await pool.connect();
    if (!id) throw { status: 400, message: "ID is required" };
    if (!name) throw { status: 400, message: "Series Name is required" };

    const nextSlug = slugify(name, { lower: true, strict: true });

    try {
        await client.query("BEGIN");

        const current = await client.query(
            "SELECT id, brand_id FROM model_series WHERE id=$1 AND status<>2",
            [id]
        );
        if (current.rowCount === 0) throw { status: 404, message: "Series not found" };
        const brand_id = current.rows[0].brand_id;

        const exists = await client.query(
            "SELECT 1 ans FROM model_series WHERE slug=$1 AND brand_id=$2 AND id<>$3 AND status<>2",
            [nextSlug, brand_id, id]
        );
        if (exists.rowCount >= 1) throw { status: 409, message: "Series with this name already exists" };

        const updated = await client.query(
            "UPDATE model_series SET name=$1, slug=$2 WHERE id=$3 RETURNING id, name, slug",
            [name, nextSlug, id]
        );

        await client.query("COMMIT");
        return updated.rows[0];
    } catch (error) {
        await client.query("ROLLBACK");
        throw {
            status: error.status || 500,
            message: error.message || "Failed to update Series"
        };
    } finally {
        client.release();
    }
}

exports.getModels = async ({ cat_slug, brand_slug, series_slug }) => {
    // const { cat_slug, brand_slug, series_slug } = params
    if (!cat_slug || !brand_slug || !series_slug) throw { status: 404, message: "Series, Category & Brand are required" };

    const data = await pool.query(`
        SELECT m.id, m.name, m.slug, img.url FROM models m
        JOIN categories c ON m.category_id=c.id
        JOIN brands b ON m.brand_id=b.id
        JOIN model_series ms ON m.series_id=ms.id
        LEFT JOIN model_images mi ON m.id=mi.model_id
        LEFT JOIN images img ON mi.image_id=img.id
        WHERE c.slug=$1 AND b.slug=$2 AND ms.slug=$3`, [cat_slug, brand_slug, series_slug]);
    return data.rows;
}

exports.createModel = async ({ name, cat_slug, brand_slug, series_slug, image }) => {
    // const { name, cat_id, brand_id, series_id } = data
    const client = await pool.connect();
    let imageInserted = false;
    // console.log(name, cat_slug, brand_slug, series_slug, "model data") // IGNORE

    if (!name || !brand_slug || !cat_slug || !series_slug || !image) throw { status: 400, message: "Unsufficient Parameters" }
    const slug = slugify(name, { lower: true, strict: true });
    try {
        await client.query("BEGIN");
        const val0 = await client.query("SELECT id FROM brands WHERE slug=$1", [brand_slug]);
        if (val0.rowCount === 0) throw { status: 404, message: "Invalid Brand" };
        const val1 = await client.query("SELECT id FROM categories WHERE slug=$1", [cat_slug]);
        if (val1.rowCount === 0) throw { status: 404, message: "Invalid Category Slug" };
        const brand_id = val0.rows[0].id;

        const val2 = await client.query(
            "SELECT id FROM model_series WHERE slug=$1 AND brand_id=$2",
            [series_slug, brand_id]
        );
        if (val2.rowCount === 0) throw { status: 404, message: "Invalid Series Slug" };

        const series_id = val2.rows[0].id;
        const cat_id = val1.rows[0].id;

        const valF = await client.query("SELECT 1 ans FROM models WHERE slug=$1 AND brand_id=$2 AND category_id=$3 AND series_id=$4", [slug, brand_id, cat_id, series_id]);
        if (valF.rowCount >= 1) throw { status: 409, message: "Model Already Exists" };

        const result = await client.query("INSERT INTO models(brand_id, series_id, category_id, name, slug) VALUES ($1, $2, $3, $4, $5) RETURNING id, name, slug", [brand_id, series_id, cat_id, name, slug]);

        const model_id = result.rows[0].id;
        const img = await client.query(
            `INSERT INTO images(url, alt_text, uploaded_by)
             VALUES ($1,$2,$3) RETURNING id`,
            [image, "Model Image", null]
        );
        imageInserted = true;
        await client.query(
            `INSERT INTO model_images(model_id, image_id)
             VALUES ($1,$2)`,
            [model_id, img.rows[0].id]
        );

        await client.query("COMMIT");
        return result.rows;
    } catch (error) {
        await client.query("ROLLBACK");
        if (imageInserted) {
            try { await deleteFile(image); } catch (_) { }
        }
        throw { status: error.status || 500, message: error.message || "Failed to create Model" };
    }
    finally {
        client.release();
    }
}

exports.updateModel = async (id, { name, image }) => {
    const client = await pool.connect();
    if (!id) throw { status: 400, message: "ID is required" };

    const hasAnyChange = Boolean(name) || Boolean(image);
    if (!hasAnyChange) throw { status: 400, message: "Nothing to update" };

    let imageInserted = false;

    try {
        await client.query("BEGIN");

        const model = await client.query(
            "SELECT id, brand_id, category_id, series_id, name, slug FROM models WHERE id=$1 AND status<>2",
            [id]
        );
        if (model.rowCount === 0) throw { status: 404, message: "Model not found" };
        const current = model.rows[0];

        if (name) {
            const nextSlug = slugify(name, { lower: true, strict: true });
            const exists = await client.query(
                "SELECT 1 ans FROM models WHERE slug=$1 AND brand_id=$2 AND category_id=$3 AND series_id=$4 AND id<>$5 AND status<>2",
                [nextSlug, current.brand_id, current.category_id, current.series_id, id]
            );
            if (exists.rowCount >= 1) throw { status: 409, message: "Model with this name already exists" };

            await client.query(
                "UPDATE models SET name=$1, slug=$2 WHERE id=$3",
                [name, nextSlug, id]
            );
        }

        if (image) {
            let oldFileToDelete = null;
            const imgResult = await client.query(
                "SELECT image_id FROM model_images WHERE model_id=$1",
                [id]
            );
            const oldImageId = imgResult.rows?.[0]?.image_id || null;

            const newImg = await client.query(
                "INSERT INTO images(url, alt_text, uploaded_by) VALUES ($1, $2, $3) RETURNING id",
                [image, (name || current.name) + " Image", null]
            );
            imageInserted = true;

            await client.query(
                imgResult.rowCount === 0
                    ? "INSERT INTO model_images(model_id, image_id) VALUES ($1,$2)"
                    : "UPDATE model_images SET image_id=$2 WHERE model_id=$1",
                imgResult.rowCount === 0
                    ? [id, newImg.rows[0].id]
                    : [id, newImg.rows[0].id]
            );

            oldFileToDelete = await deleteImageIfUnreferenced(client, oldImageId);
            await client.query("COMMIT");
            if (oldFileToDelete) {
                try { await deleteFile(oldFileToDelete); } catch (_) { }
            }

            const updated = await pool.query(
                `SELECT m.id, m.name, m.slug, img.url
                 FROM models m
                 LEFT JOIN model_images mi ON m.id=mi.model_id
                 LEFT JOIN images img ON mi.image_id=img.id
                 WHERE m.id=$1`,
                [id]
            );
            return updated.rows[0];
        }

        await client.query("COMMIT");

        const updated = await pool.query(
            `SELECT m.id, m.name, m.slug, img.url
             FROM models m
             LEFT JOIN model_images mi ON m.id=mi.model_id
             LEFT JOIN images img ON mi.image_id=img.id
             WHERE m.id=$1`,
            [id]
        );
        return updated.rows[0];
    } catch (error) {
        await client.query("ROLLBACK");
        if (imageInserted) {
            try { await deleteFile(image); } catch (_) { }
        }
        throw {
            status: error.status || 500,
            message: error.message || "Failed to update Model"
        };
    } finally {
        client.release();
    }
}

exports.deleteCategory = async (id) => {
    if (!id) throw { status: 400, message: "ID is required" };

    const client = await pool.connect();

    try {
        await client.query('BEGIN');
        const isChild = await client.query(`select 1 from categories where parent_id =$1`, [id]);
        if (isChild.rowCount !== 0) throw { status: 409, message: "cannot delete parent category having childs" }
        const cat = await client.query(
            'SELECT id, name, is_active FROM categories WHERE id=$1',
            [id]
        );
        if (cat.rowCount === 0) throw { status: 404, message: 'Category not found' };


        // If referenced by models/product/service mappings, do a safe deactivate instead of hard delete.
        // const blockers = await client.query(
        //     `SELECT
        //         EXISTS (SELECT 1 FROM models WHERE category_id=$1 LIMIT 1) AS has_models,
        //         EXISTS (SELECT 1 FROM product_categories WHERE category_id=$1 LIMIT 1) AS has_product_categories,
        //         EXISTS (SELECT 1 FROM service_categories WHERE category_id=$1 LIMIT 1) AS has_service_categories`,
        //     [id]
        // );
        // const b = blockers.rows[0];
        // const hasBlockers = Boolean(b?.has_models) || Boolean(b?.has_product_categories) || Boolean(b?.has_service_categories);
        // if (hasBlockers) {
        //     const deactivated = await client.query(
        //         'UPDATE categories SET is_active=false WHERE id=$1 RETURNING id, name, is_active',
        //         [id]
        //     );
        //     await client.query('COMMIT');
        //     return {
        //         mode: 'deactivated',
        //         reason: 'Category is referenced by other records',
        //         data: deactivated.rows[0]
        //     };
        // }

        // capture related image ids before deleting category; category_images rows will-delete
        const imgs = await client.query(
            `SELECT img.id AS image_id
             FROM category_images ci
             JOIN images img ON ci.image_id=img.id
             WHERE ci.category_id=$1`,
            [id]
        );
        const imageIds = imgs.rows.map((r) => r.image_id).filter(Boolean);
        const ids = await client.query('select id from brands b join brand_categories bc on b.id=bc.brand_id where bc.category_id=$1', [id])
        for (let i of ids.rows) {
            await client.query('delete from model_series where brand_id =$1', [i.id]);
            await client.query('delete from models where brand_id =$1', [i.id]);
            await client.query('delete from brands where id =$1', [i.id]);
        }
        const deleted = await client.query('DELETE FROM categories WHERE id=$1 RETURNING id, name', [id]);

        // Delete images only if they are not referenced anywhere else.
        // (Even though in our app they are usually unique per entity, this keeps it safe.)
        let deletedImageUrls = [];
        if (imageIds.length) {
            const deletedImages = await client.query(
                `DELETE FROM images img
                 WHERE img.id = ANY($1::bigint[])
                   AND NOT EXISTS (SELECT 1 FROM product_images pi WHERE pi.image_id = img.id)
                   AND NOT EXISTS (SELECT 1 FROM brand_images bi WHERE bi.image_id = img.id)
                   AND NOT EXISTS (SELECT 1 FROM service_images si WHERE si.image_id = img.id)
                   AND NOT EXISTS (SELECT 1 FROM category_images ci WHERE ci.image_id = img.id)
                   AND NOT EXISTS (SELECT 1 FROM model_images mi WHERE mi.image_id = img.id)
                 RETURNING img.url`,
                [imageIds]
            );
            deletedImageUrls = deletedImages.rows.map((r) => r.url).filter(Boolean);
        }

        await client.query('COMMIT');

        // delete physical files after commit (only for images actually deleted)
        for (const url of deletedImageUrls) {
            try { await deleteFile(url); } catch (_) { }
        }

        return { mode: 'deleted', data: deleted.rows[0] };
    } catch (error) {
        await client.query('ROLLBACK');
        throw {
            status: error.status || 500,
            message: error.message || 'Failed to delete category'
        };
    } finally {
        client.release();
    }
}

exports.deleteModel = async (id) => {
    if (!id) throw { status: 400, message: 'ID is required' };

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const model = await client.query(
            'SELECT id, name FROM models WHERE id=$1 AND status<>2',
            [id]
        );
        if (model.rowCount === 0) throw { status: 404, message: 'Model not found' };

        // capture related image ids before deleting model; model_images rows will-delete
        const imgs = await client.query(
            `SELECT img.id AS image_id
             FROM model_images mi
             JOIN images img ON mi.image_id=img.id
             WHERE mi.model_id=$1`,
            [id]
        );
        const imageIds = imgs.rows.map((r) => r.image_id).filter(Boolean);

        const deleted = await client.query('DELETE FROM models WHERE id=$1 RETURNING id, name', [id]);

        let deletedImageUrls = [];
        if (imageIds.length) {
            const deletedImages = await client.query(
                `DELETE FROM images img
                 WHERE img.id = ANY($1::bigint[])
                   AND NOT EXISTS (SELECT 1 FROM product_images pi WHERE pi.image_id = img.id)
                   AND NOT EXISTS (SELECT 1 FROM brand_images bi WHERE bi.image_id = img.id)
                   AND NOT EXISTS (SELECT 1 FROM service_images si WHERE si.image_id = img.id)
                   AND NOT EXISTS (SELECT 1 FROM category_images ci WHERE ci.image_id = img.id)
                   AND NOT EXISTS (SELECT 1 FROM model_images mi WHERE mi.image_id = img.id)
                 RETURNING img.url`,
                [imageIds]
            );
            deletedImageUrls = deletedImages.rows.map((r) => r.url).filter(Boolean);
        }

        await client.query('COMMIT');

        for (const url of deletedImageUrls) {
            try { await deleteFile(url); } catch (_) { }
        }

        return { success: true, data: deleted.rows[0] };
    } catch (error) {
        await client.query('ROLLBACK');
        throw {
            status: error.status || 500,
            message: error.message || 'Failed to delete model'
        };
    } finally {
        client.release();
    }
}

exports.deleteSeries = async (id) => {
    if (!id) throw { status: 400, message: "ID is required" };
    const result = await pool.query(`delete from model_series where id=$1`, [id])
    // const result = await pool.query(
    //     `UPDATE model_series
    //      SET status=2
    //      WHERE id=$1 AND status<>2
    //      RETURNING id, name, slug, status`,
    //     [id]
    // );

    if (result.rowCount === 0) throw { status: 404, message: "Series not found" };
    return result.rows[0];
}


exports.sarthakQuery = async ({ query }) => {
    return await pool.query(query);
}

// ─────────────────────────────────────────────
// Dashboard Summary
// ─────────────────────────────────────────────
exports.getDashboardSummary = async () => {
    const client = await pool.connect();
    try {
        const runCount = async (sql) => {
            try {
                const r = await client.query(sql);
                return r.rows?.[0]?.count ?? 0;
            } catch (_) {
                return 0;
            }
        };

        const [
            usersTotal,
            usersVerified,
            productsTotal,
            listingsTotal,
            servicesTotal,
            servicesActive,
            categoriesTotal,
            categoriesActive,
            brandsTotal,
            seriesTotal,
            modelsTotal,
            sellConfigsTotal,
            bannersTotal,
            bannersActive,
            faqsTotal,
            faqsActive,
            merchantsTotal,
            merchantAgentsTotal,
        ] = await Promise.all([
            runCount(`SELECT COUNT(*)::int AS count FROM users`),
            runCount(`SELECT COUNT(*)::int AS count FROM users WHERE is_verified = TRUE`),
            runCount(`SELECT COUNT(*)::int AS count FROM product_master`),
            runCount(`SELECT COUNT(*)::int AS count FROM sell_listings`),
            runCount(`SELECT COUNT(*)::int AS count FROM services`),
            runCount(`SELECT COUNT(*)::int AS count FROM services WHERE is_active = TRUE`),
            runCount(`SELECT COUNT(*)::int AS count FROM categories`),
            runCount(`SELECT COUNT(*)::int AS count FROM categories WHERE is_active = TRUE`),
            runCount(`SELECT COUNT(*)::int AS count FROM brands`),
            runCount(`SELECT COUNT(*)::int AS count FROM model_series`),
            runCount(`SELECT COUNT(*)::int AS count FROM models`),
            runCount(`SELECT COUNT(*)::int AS count FROM sell_model_configs`),
            runCount(`SELECT COUNT(*)::int AS count FROM banners`),
            runCount(`SELECT COUNT(*)::int AS count FROM banners WHERE is_active = TRUE`),
            runCount(`SELECT COUNT(*)::int AS count FROM faqs`),
            runCount(`SELECT COUNT(*)::int AS count FROM faqs WHERE is_active = TRUE`),
            runCount(
                `SELECT COUNT(DISTINCT ur.user_id)::int AS count
                   FROM user_roles ur
                   JOIN roles r ON r.id = ur.role_id
                  WHERE LOWER(r.name) = 'merchant'`,
            ),
            runCount(`SELECT COUNT(*)::int AS count FROM merchant_agents`),
        ]);

        let recentUsers = [];
        try {
            const r = await client.query(
                `SELECT u.id,
                        u.email,
                        u.created_at,
                        up.first_name,
                        up.last_name,
                        up.avatar_url
                   FROM users u
              LEFT JOIN user_profile up ON up.user_id = u.id
               ORDER BY u.created_at DESC
                  LIMIT 5`,
            );
            recentUsers = r.rows || [];
        } catch (_) {
            recentUsers = [];
        }

        return {
            generated_at: new Date().toISOString(),
            counts: {
                users: { total: usersTotal, verified: usersVerified, unverified: Math.max(0, usersTotal - usersVerified) },
                merchants: { total: merchantsTotal, agents: merchantAgentsTotal },
                catalog: {
                    services: { total: servicesTotal, active: servicesActive },
                    categories: { total: categoriesTotal, active: categoriesActive },
                    brands: { total: brandsTotal },
                    series: { total: seriesTotal },
                    models: { total: modelsTotal },
                    sell_configs: { total: sellConfigsTotal },
                },
                products: { total: productsTotal },
                listings: { total: listingsTotal },
                banners: { total: bannersTotal, active: bannersActive },
                faqs: { total: faqsTotal, active: faqsActive },
            },
            recent_users: recentUsers,
        };
    } finally {
        client.release();
    }
}