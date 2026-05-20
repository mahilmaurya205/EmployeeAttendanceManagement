const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth.middleware');
const { upload } = require('../middleware/upload.middleware');
const adminController = require('../controllers/admin.controller');

// GET /api/admin/users
router.get('/users', authenticate, authorize('SuperAdmin', 'Distributor', 'Admin'), adminController.listUsers);

// PUT /api/admin/users/:id/role
router.put('/users/:id/role', authenticate, authorize('SuperAdmin', 'Distributor', 'Admin'), adminController.updateUserRole);

// PUT /api/admin/users/:id/toggle-active
router.put('/users/:id/toggle-active', authenticate, authorize('SuperAdmin', 'Distributor', 'Admin'), adminController.toggleUserActive);

// POST /api/admin/users - Create Distributor/Admin/Staff based on requester role
router.post('/users', authenticate, authorize('SuperAdmin', 'Distributor', 'Admin'), upload.single('logo'), adminController.createUser);
router.delete('/users/:id', authenticate, authorize('SuperAdmin', 'Distributor', 'Admin'), adminController.deleteUser);
router.put('/users/:id/password', authenticate, authorize('SuperAdmin', 'Distributor', 'Admin'), adminController.resetUserPassword);

module.exports = router;
