const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth.middleware');
const leaveController = require('../controllers/leave.controller');

router.get('/policy', authenticate, authorize('Admin', 'Manager', 'HR', 'Supervisor', 'Employee'), leaveController.getLeavePolicy);
router.put('/policy', authenticate, authorize('Admin'), leaveController.updateLeavePolicy);

router.get('/requests', authenticate, authorize('Admin', 'Manager', 'HR', 'Supervisor', 'Employee'), leaveController.listLeaveRequests);
router.post('/requests', authenticate, authorize('Employee'), leaveController.createLeaveRequest);
router.put('/requests/:id/status', authenticate, authorize('Admin'), leaveController.updateLeaveRequestStatus);

module.exports = router;
