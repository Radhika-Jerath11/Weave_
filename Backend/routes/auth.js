const router = require('express').Router();
const auth = require('../middleware/auth');
const authController = require('../controllers/authController');
const { wrap } = require('../utils/helpers');

router.post('/signup', wrap(authController.signup));
router.post('/login', wrap(authController.login));
router.get('/me', auth, wrap(authController.getMe));

module.exports = router;
