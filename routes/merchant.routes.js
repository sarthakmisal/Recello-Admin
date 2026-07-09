const router = require('express').Router();
const merchantController = require('../controllers/merchant.controller');
const { reqBody } = require('../middlewares/req_body.middleware')
const authMiddleware = require('../middlewares/auth.middleware')
const allowRoles = require('../middlewares/snippets.middleware').allowRoles;
const upload = require('../config/multer.config');


// USERS ROUTES

router.post('/login', reqBody, merchantController.loginMerchant);

router.post('/requestOTP', authMiddleware, allowRoles('merchant', 'agent'), reqBody, merchantController.requestOTP);
router.post('/verifyOTP', authMiddleware, allowRoles('merchant', 'agent'), reqBody, merchantController.verifyOTP);


router.post('/leads/accept', authMiddleware, allowRoles('merchant', 'agent'), reqBody, merchantController.acceptLead);
router.get('/leads/completed', authMiddleware, allowRoles('merchant'), merchantController.getCompletedLeads);
router.get('/leads/:id/resume', authMiddleware, allowRoles('merchant', 'agent'), merchantController.getLeadResume);
router.get('/leads/:id', authMiddleware, allowRoles('merchant', 'agent'), merchantController.getLeadsByLeadId);
router.get('/leads', authMiddleware, allowRoles('merchant', 'agent'), merchantController.getLeadsByMerchant);

// Lead lifecycle (merchant app)
router.put('/leads/status', authMiddleware, allowRoles('merchant', 'agent'), reqBody, merchantController.updateLeadStatus);

// Inspection session
router.post('/leads/inspection', authMiddleware, allowRoles('agent'), merchantController.startInspection);
// router.post('/leads/:id/answers', authMiddleware, allowRoles('agent'), upload.any(), merchantController.submitInspectionAnswers);
router.put('/leads/complete', authMiddleware, allowRoles('agent'), reqBody, merchantController.completeInspection);

// Final decision
router.post('/leads/cancel', authMiddleware, allowRoles('agent'), reqBody, merchantController.cancelLead);
router.put('/leads/accept', authMiddleware, allowRoles('agent'), reqBody, merchantController.acceptLeadAfterInspection);

// Renegotiation offers
router.post('/leads/:id/offer', authMiddleware, allowRoles('agent'), reqBody, merchantController.createOffer);
router.put('/leads/:id/offer/:offer_id', authMiddleware, reqBody, merchantController.respondToOffer);

// Images (upload once, then use answer_image_id in JSON bodies)
router.post('/images', authMiddleware, allowRoles('merchant', 'agent'), upload.single('image'), merchantController.uploadMerchantImage);

router.get('/profile', authMiddleware, merchantController.getProfileDetails);
router.put('/profile/', reqBody, authMiddleware, merchantController.updateProfileDetails);

router.post('/invite_agent', reqBody, authMiddleware, merchantController.inviteMerchantAgent);
router.get('/verify_agent', merchantController.verifyMerchantAgent);
router.post('/register_agent', reqBody, merchantController.registerMerchantAgent);

router.get('/get_agents', authMiddleware, allowRoles('merchant'), merchantController.getMerchantAgents);
router.post('/leads/requote', authMiddleware, allowRoles('agent'), upload.any(), merchantController.submitInspectionAnswers);

router.get('/requote/questions', authMiddleware, allowRoles('merchant', 'agent'), merchantController.getRequoteQuestions);
// NOT WORKING
router.post('/requote', authMiddleware, allowRoles('merchant', 'agent'), merchantController.postRequote);

// Accept answered inspection questions (supports multipart/form-data for proof images)
router.post('/requote/questions', authMiddleware, allowRoles('merchant', 'agent'), upload.any(), merchantController.submitRequoteAnswers);


module.exports = router;
