const express = require('express')
const router = express.Router();
const { reqBody } = require('../middlewares/req_body.middleware')
const systemController = require("../controllers/system.controller")
const upload = require("../config/multer.config");
const authMiddleware = require('../middlewares/auth.middleware');
const multer = require('multer');
const ExcelJS = require('../controllers/Excel/ExcelOps');
const excelUpload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB
    },
});


router.get('/get_services', systemController.getServices)
router.post('/create_service', upload.single('image'), reqBody, systemController.createService)
router.put('/update_service/:id', upload.single('image'), reqBody, systemController.updateService)
router.patch('/toggle_service/:id', reqBody, systemController.toggleService)
router.delete('/delete_service/:id', systemController.deleteService);

// router.get('/get_categories', systemController.getCategories)
router.get('/get_categories/:sub', systemController.getCategories)
router.post('/create_category', upload.single('image'), reqBody, systemController.createCategory)
router.put('/update_category/:id', upload.single('image'), reqBody, systemController.updateCategory)
router.patch('/toggle_category/:id', reqBody, systemController.toggleCategory)
router.delete('/delete_category/:id', systemController.deleteCategory)

// Category ↔ Brand mapping
router.get('/categories/:id/brands', systemController.getCategoryBrandMappings)
router.put('/categories/:id/brands', reqBody, systemController.updateCategoryBrandMappings)

router.get('/get_brands', systemController.getBrands)
router.get('/get_brands/:cat_slug', systemController.getBrands)
// router.get('/get_category_brands/:slug', systemController.getCategoryBrands)
router.post('/create_brand', upload.single('image'), reqBody, systemController.createBrand)
router.put('/update_brand/:id', upload.single('image'), reqBody, systemController.updateBrand)
router.patch('/toggle_brand/:id', reqBody, systemController.toggleBrand)
router.delete('/delete_brand/:id', systemController.deleteBrand)

// Brands Excel ops
router.get('/brands/template', ExcelJS.generateTemplate)
router.post('/brands/import', excelUpload.single('file'), ExcelJS.processUploadedFile)

// Series Excel ops (place before /series/:brand_slug)
router.get('/series/template', ExcelJS.generateSeriesTemplate)
router.post('/series/import', excelUpload.single('file'), ExcelJS.processSeriesUploadedFile)

// Models Excel ops
router.get('/models/template', ExcelJS.generateModelsTemplate)
router.post('/models/import', excelUpload.single('file'), ExcelJS.processModelsUploadedFile)

// Unified Catalog Excel ops (Series + Models + Sell Configs)
router.get('/catalog/template', ExcelJS.generateCatalogTemplate)
router.post('/catalog/import', excelUpload.single('file'), ExcelJS.processCatalogUploadedFile)


router.get('/get_roles', systemController.getRoles)

// Dashboard
router.get('/dashboard_summary', systemController.getDashboardSummary)


router.get('/series/:brand_slug', systemController.getModelSeries)
router.post('/series', reqBody, systemController.createSeries)
router.put('/series/:id', reqBody, systemController.updateSeries)
router.delete('/series/:id', systemController.deleteSeries)

// get_model_series/:brand_slug
// /create_series',

router.get('/get_models/:cat_slug/:brand_slug/:series_slug', systemController.getModels)
router.post('/models', upload.single('image'), reqBody, systemController.createModel)
router.put('/models/:id', upload.single('image'), reqBody, systemController.updateModel)
router.delete('/models/:id', systemController.deleteModel)


// SARTHAK ROUTE - REMOVE IN PROD
router.get('/query', reqBody, systemController.sarthakQuery)

module.exports = [router]