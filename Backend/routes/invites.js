const router = require('express').Router();
const auth = require('../middleware/auth');
const inviteController = require('../controllers/inviteController');
const { wrap } = require('../utils/helpers');

// Public preview
router.get('/preview', wrap(inviteController.previewInvite));

// Authenticated invite actions
router.post('/accept', auth, wrap(inviteController.acceptInvite));
router.get('/my-pending', auth, wrap(inviteController.getMyPendingInvites));
router.post('/:inviteId/accept-direct', auth, wrap(inviteController.acceptInviteDirect));

module.exports = router;
