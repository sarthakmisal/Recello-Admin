const router = require('express').Router();
const userController = require('../controllers/user.controller');
const { reqBody } = require('../middlewares/req_body.middleware')
const authMiddleware = require('../middlewares/auth.middleware');

const upload = require('../config/multer.config')
// USERS ROUTES
router.post('/create', upload.single('avatar'), userController.createUser);
router.get('/get_users/', userController.getUsers);
router.get('/get_users/:id', userController.getUsers);
router.put('/update/:id', upload.single('avatar'), userController.updateUser);
router.delete('/delete_user/:id', userController.deleteUser);

// Merchant role
router.post('/:id/merchant', userController.addMerchantRole);
router.delete('/:id/merchant', userController.removeMerchantRole);

// ADDRESSES
// ADDRESS
router.get('/addresses/', authMiddleware, userController.getAddresses);
router.post('/addresses', authMiddleware, reqBody, userController.createAddress);

router.put('/addresses/:id', authMiddleware, reqBody, userController.updateAddress);

// My Profile
router.get('/me/profile', authMiddleware, userController.getMyProfile);
router.put('/me/profile', authMiddleware, upload.single('avatar'), userController.updateMyProfile);

module.exports = [router];