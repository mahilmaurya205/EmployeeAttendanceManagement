const express = require('express');
const router = express.Router();
const { authenticate, canModifyAttendance, canViewReports } = require('../middleware/auth.middleware');
const attendanceController = require('../controllers/attendance.controller');

// ─── MAIN ACTION ENDPOINT ────────────────────────────────────────────────────
router.post('/action', authenticate, attendanceController.recordAttendanceAction);

// GET /api/attendance/today - Get today's status for logged-in employee
router.get('/today', authenticate, attendanceController.getTodayAttendance);

// GET /api/attendance/history - Employee history
router.get('/history', authenticate, attendanceController.getAttendanceHistory);

// GET /api/attendance/logs/:date - All logs for a date (Admin/Manager/HR/Supervisor)
router.get('/logs/:date', authenticate, canViewReports, attendanceController.getLogsForDate);

// GET /api/attendance/summary/:date - Daily summary (Admin/HR/Supervisor view)
router.get('/summary/:date', authenticate, canViewReports, attendanceController.getSummaryForDate);

// GET /api/attendance/break-late/:date - Tea/lunch late break report
router.get('/break-late/:date', authenticate, canViewReports, attendanceController.getLateBreakReport);

// PUT /api/attendance/break-late/:summaryId/review - Approve/reject late break reason
router.put('/break-late/:summaryId/review', authenticate, canModifyAttendance, attendanceController.reviewLateBreak);

// PUT /api/attendance/:logId - Manual correction (Admin/Manager only)
router.put('/:logId', authenticate, canModifyAttendance, attendanceController.updateAttendanceLog);

module.exports = router;
