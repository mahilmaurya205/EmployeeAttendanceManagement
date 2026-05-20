const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth.middleware');
const payrollController = require('../controllers/payroll.controller');

router.get('/policy', authenticate, authorize('Admin', 'Manager', 'HR', 'Supervisor', 'Employee'), payrollController.getPayrollPolicy);
router.put('/policy', authenticate, authorize('Admin'), payrollController.updatePayrollPolicy);

router.get('/runs', authenticate, authorize('Admin', 'Manager', 'HR', 'Supervisor', 'Employee'), payrollController.listPayrollRuns);
router.post('/generate', authenticate, authorize('Admin'), payrollController.generatePayroll);

module.exports = router;
