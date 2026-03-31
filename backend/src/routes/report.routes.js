const express = require('express');
const router = express.Router();
const { authenticate, canViewReports } = require('../middleware/auth.middleware');
const reportController = require('../controllers/report.controller');

// GET /api/reports/monthly?month=2024-01&department=IT Software
router.get('/monthly', authenticate, canViewReports, reportController.getMonthlyReport);

// GET /api/reports/dashboard - Dashboard stats
router.get('/dashboard', authenticate, canViewReports, reportController.getDashboardStats);

module.exports = router;
