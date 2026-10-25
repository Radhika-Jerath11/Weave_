const router = require('express').Router();
const taskController = require('../controllers/taskController');
const { wrap } = require('../utils/helpers');

// Task actions: status change, dependencies, update, delete
router.put('/:id/status', wrap(taskController.moveTaskStatus));
router.put('/:id/dependencies', wrap(taskController.setDependencies));
router.put('/:id', wrap(taskController.updateTask));
router.delete('/:id', wrap(taskController.deleteTask));

module.exports = router;
