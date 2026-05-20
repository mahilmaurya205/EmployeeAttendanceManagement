const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth.middleware');
const paymentController = require('../controllers/payment.controller');

router.get('/plans', authenticate, authorize('SuperAdmin', 'Distributor', 'Admin'), paymentController.listPlans);
router.put('/plans', authenticate, authorize('SuperAdmin'), paymentController.updatePlans);
router.get('/transactions', authenticate, authorize('SuperAdmin', 'Distributor', 'Admin'), paymentController.listPayments);
router.get('/transactions/:id/receipt', authenticate, authorize('SuperAdmin', 'Distributor', 'Admin'), paymentController.getReceipt);
router.post('/renewal/order', authenticate, authorize('Admin'), paymentController.createRenewalOrder);
router.post('/renewal/verify', authenticate, authorize('Admin'), paymentController.verifyRenewalPayment);

module.exports = router;
