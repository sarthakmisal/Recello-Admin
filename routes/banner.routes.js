const express = require('express')
const router = express.Router()
const bannerController = require('../controllers/banner.controller')
const upload = require('../middlewares/upload')

// PUBLIC ACTIVE (must come first)
router.get('/active', bannerController.getActiveBanners)

// GET ALL
router.get('/', bannerController.getAllBanners)

// GET SINGLE
router.get('/:id', bannerController.getBannerById)

// CREATE
router.post('/', upload.single('image'), bannerController.createBanner)

// UPDATE
router.put('/:id', upload.single('image'), bannerController.updateBanner)

// DELETE
router.delete('/:id', bannerController.deleteBanner)

// TOGGLE STATUS
router.patch("/:id/status", bannerController.toggleBannerStatus);

module.exports = router