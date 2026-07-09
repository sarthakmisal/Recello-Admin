const express = require('express');
const router = express.Router();
const { reqBody } = require('../middlewares/req_body.middleware');
const sellController = require('../controllers/sell.controller');
const authMiddleware = require('../middlewares/auth.middleware');
const upload = require('../config/multer.config');

// Model Configs
router.get('/configs/:model_slug', sellController.getModelConfigs);
router.post('/configs', reqBody, sellController.createModelConfig);
router.put('/configs/:id', reqBody, sellController.updateModelConfig);
router.delete('/configs/:id', sellController.deleteModelConfig);

// Questions
router.get('/questions', sellController.getQuestions);
router.get('/question-contexts', sellController.getQuestionContexts);
router.get('/questions/:modelSlug', sellController.getQuestionsByModel);
router.get('/questions/category/:category_id', sellController.getQuestionsByCategory);
router.post('/questions', reqBody, sellController.createQuestion);
router.put('/questions/:id', reqBody, sellController.updateQuestion);
router.delete('/questions/:id', sellController.deleteQuestion);

// Images (used by option_image_id / answer_image_id)
router.post('/images', upload.single('image'), sellController.uploadImage);

// Question Options
router.get('/options/:question_id', sellController.getQuestionOptions);
router.post('/options', reqBody, sellController.createQuestionOption);
router.put('/options/:id', reqBody, sellController.updateQuestionOption);
router.delete('/options/:id', sellController.deleteQuestionOption);

// Conditions
router.get('/conditions/:question_id', sellController.getConditions);
router.post('/conditions', reqBody, sellController.createCondition);
router.delete('/conditions/:id', sellController.deleteCondition);

// Category-Question Mapping
router.get('/category-questions/:category_id', sellController.getCategoryQuestions);
router.post('/category-questions', reqBody, sellController.mapQuestionToCategory);
router.delete('/category-questions/:category_id/:question_id', sellController.unmapQuestionFromCategory);

// Sell Flow: Questions with conditions for a category
router.get('/flow/:category_slug', sellController.getQuestionsByCategorySlug);

// Price Calculation
router.post('/calculate-price', reqBody, sellController.calculatePrice);

// Sell Listings (Leads)
router.get('/listings', sellController.getListings);
router.get('/listings/:id', sellController.getListingDetails);
router.get('/listings/:id/offers', authMiddleware, sellController.getListingOffers);
router.post('/listings', authMiddleware, reqBody, sellController.createListing);
router.put('/listings/:id/assign', sellController.assignListing);
router.put('/listings/:id/transfer', sellController.transferListing);
router.put('/listings/:id/cancel', sellController.cancelListing);

// Sell Listings (Leads)
router.post('/pickup', authMiddleware, reqBody, sellController.schedulePickup);

// GET ORDERS
router.get('/orders', authMiddleware, sellController.getOrders);

// Merchants
router.get('/merchants', sellController.getMerchants);

module.exports = router;
