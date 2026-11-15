const router=require('express').Router();
const uiController=require("../controllers/ui.controller")
// home banner crud
router.get('/home_banners', uiController.getHomeBanners)

module.exports = [router]
