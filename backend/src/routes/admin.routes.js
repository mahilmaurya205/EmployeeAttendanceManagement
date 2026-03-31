const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth.middleware');
const adminController = require('../controllers/admin.controller');

// GET /api/admin/users
router.get('/users', authenticate, authorize('Admin'), adminController.listUsers);

// PUT /api/admin/users/:id/role
router.put('/users/:id/role', authenticate, authorize('Admin'), adminController.updateUserRole);

// PUT /api/admin/users/:id/toggle-active
router.put('/users/:id/toggle-active', authenticate, authorize('Admin'), adminController.toggleUserActive);

// POST /api/admin/users - Create non-employee user (HR, Manager, etc.)
router.post('/users', authenticate, authorize('Admin'), adminController.createUser);
router.delete('/users/:id', authenticate, authorize('Admin'), adminController.deleteUser);
router.put('/users/:id/password', authenticate, authorize('Admin'), adminController.resetUserPassword);

module.exports = router;
