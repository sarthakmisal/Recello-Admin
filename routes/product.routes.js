const express = require('express');
const router = express.Router();

const productController = require('../controllers/product.controller')
const upload = require("../config/multer.config");
const { reqBody } = require('../middlewares/req_body.middleware');


router.post('/create', upload.array('image'), reqBody, productController.create)
router.delete('/delete/:id', productController.softDeleteProduct);
router.put('/update/:id', upload.array('image'), reqBody, productController.updateProduct);

router.get('/get_products', productController.getProducts)
router.get('/get_products/:id', productController.getProducts)

router.get("/brand/:brandSlug/products", productController.getProductsByBrand);
router.get("/brand/:brandSlug/models", productController.getModelsByBrandSeries);
router.get("/brand/:brandSlug/:seriesSlug/models", productController.getModelsByBrandSeries);
router.get("/brand/:brandSlug/series", productController.getSeriesByBrand);
router.get("/:brandSlug/:modelSlug", productController.getVariantsByBrandModel);


router.get("/slug/:slug", productController.getProductBySlug);
router.get("/sku/:sku", productController.getProductBySku);



module.exports = router