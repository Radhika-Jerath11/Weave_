const router = require('express').Router();
const boardController = require('../controllers/boardController');
const { wrap } = require('../utils/helpers');

// Boards
router.get('/', wrap(boardController.getBoards));
router.post('/', wrap(boardController.createBoard));
router.get('/:id', wrap(boardController.getBoard));
router.delete('/:id', wrap(boardController.deleteBoard));
router.get('/:id/critical-path', wrap(boardController.getCriticalPath));

// Tasks on board
router.post('/:id/tasks', wrap(boardController.createTask));

// Invites & Member collaboration
router.post('/:id/invites', wrap(boardController.createInvite));
router.delete('/:id/invites/:inviteId', wrap(boardController.revokeInvite));
router.delete('/:id/members/:userId', wrap(boardController.removeMember));

module.exports = router;
