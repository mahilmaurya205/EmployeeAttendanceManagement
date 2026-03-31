const express = require('express');
const router = express.Router();
const Employee = require('../models/Employee.model');
const AttendanceLog = require('../models/AttendanceLog.model');
const AttendanceSummary = require('../models/AttendanceSummary.model');
const { authenticate, canModifyAttendance, canViewReports } = require('../middleware/auth.middleware');
const { getDistanceMeters, OFFICE_LAT, OFFICE_LNG, OFFICE_RADIUS } = require('../middleware/location.middleware');
const { saveBase64Image } = require('../middleware/upload.middleware');

// Helper: get today string YYYY-MM-DD
const getTodayStr = () => new Date().toISOString().split('T')[0];

// Helper: get or create today's summary
const getOrCreateSummary = async (employeeId, date) => {
  let summary = await AttendanceSummary.findOne({ employee: employeeId, date });
  if (!summary) {
    summary = await AttendanceSummary.create({ employee: employeeId, date });
  }
  return summary;
};

// Helper: update summary after a log
const updateSummary = async (employeeId, date) => {
  const logs = await AttendanceLog.find({ employee: employeeId, date, status: 'SUCCESS' }).sort({ timestamp: 1 });

  const summary = await getOrCreateSummary(employeeId, date);
  const employee = await Employee.findById(employeeId).select('workSchedule');

  let punchIn = null, punchOut = null;
  const breaks = [];
  let currentBreakStart = null;

  for (const log of logs) {
    if (log.action === 'PUNCH_IN' && !punchIn) punchIn = log.timestamp;
    if (log.action === 'PUNCH_OUT') punchOut = log.timestamp;
    if (log.action === 'BREAK_START') currentBreakStart = log.timestamp;
    if (log.action === 'BREAK_END' && currentBreakStart) {
      const duration = Math.round((log.timestamp - currentBreakStart) / 60000);
      breaks.push({ start: currentBreakStart, end: log.timestamp, duration });
      currentBreakStart = null;
    }
  }

  const totalBreakMinutes = breaks.reduce((sum, b) => sum + b.duration, 0);
  let totalWorkMinutes = 0;
  if (punchIn && punchOut) {
    totalWorkMinutes = Math.round((punchOut - punchIn) / 60000) - totalBreakMinutes;
  } else if (punchIn) {
    totalWorkMinutes = Math.round((new Date() - punchIn) / 60000) - totalBreakMinutes;
  }

  // Late calculation
  let isLate = false, lateByMinutes = 0;
  if (punchIn && employee?.workSchedule?.shiftStart) {
    const [h, m] = employee.workSchedule.shiftStart.split(':').map(Number);
    const shiftStart = new Date(punchIn);
    shiftStart.setHours(h, m, 0, 0);
    if (punchIn > shiftStart) {
      isLate = true;
      lateByMinutes = Math.round((punchIn - shiftStart) / 60000);
    }
  }

  // Overtime: work > 8 hours
  const overtimeMinutes = Math.max(0, totalWorkMinutes - 480);

  const status = punchIn ? (totalWorkMinutes >= 240 ? 'Present' : 'Half Day') : 'Absent';

  await AttendanceSummary.findOneAndUpdate(
    { employee: employeeId, date },
    { punchIn, punchOut, breaks, totalBreakMinutes, totalWorkMinutes, isLate, lateByMinutes, overtimeMinutes, status },
    { upsert: true, new: true }
  );
};

// ─── MAIN ACTION ENDPOINT ────────────────────────────────────────────────────
// POST /api/attendance/action
router.post('/action', authenticate, async (req, res, next) => {
  try {
    const { action, location, faceVerified, faceMatchScore, snapshotBase64, outsideReason } = req.body;

    // Validate action type
    const validActions = ['PUNCH_IN', 'PUNCH_OUT', 'BREAK_START', 'BREAK_END'];
    if (!validActions.includes(action)) {
      return res.status(400).json({ success: false, message: 'Invalid action. Must be PUNCH_IN, PUNCH_OUT, BREAK_START, or BREAK_END.' });
    }

    // Get employee
    let employeeId;
    if (req.user.role === 'Employee') {
      if (!req.user.employee) return res.status(400).json({ success: false, message: 'No employee profile linked to this account.' });
      employeeId = req.user.employee._id || req.user.employee;
    } else {
      // Admin/Manager can log for others
      employeeId = req.body.employeeId;
      if (!employeeId) return res.status(400).json({ success: false, message: 'employeeId required.' });
    }

    const employee = await Employee.findById(employeeId);
    if (!employee || !employee.isActive) {
      return res.status(404).json({ success: false, message: 'Employee not found or inactive.' });
    }

    // Validate location
    if (!location || location.latitude == null || location.longitude == null) {
      return res.status(400).json({ success: false, message: 'Location is required.' });
    }

    const distance = getDistanceMeters(location.latitude, location.longitude, OFFICE_LAT, OFFICE_LNG);
    const isOfficeLocation = distance <= OFFICE_RADIUS;

    // Department-based location rules
    if (employee.department === 'IT Software' && !isOfficeLocation) {
      return res.status(403).json({
        success: false,
        message: `IT Software employees must be within ${OFFICE_RADIUS}m of the office. You are ${Math.round(distance)}m away.`,
        distanceFromOffice: Math.round(distance),
      });
    }

    if (employee.department === 'IT Hardware' && !isOfficeLocation && !outsideReason?.trim()) {
      return res.status(400).json({
        success: false,
        message: 'You are outside the office. Please provide a reason.',
        requiresReason: true,
        distanceFromOffice: Math.round(distance),
      });
    }

    // Face verification check (threshold: 0.55 euclidean distance → score > 0.45 means match)
    const FACE_THRESHOLD = 0.45;
    if (!faceVerified || faceMatchScore < FACE_THRESHOLD) {
      return res.status(403).json({
        success: false,
        message: 'Face verification failed. Please try again with better lighting.',
        faceMatchScore,
      });
    }

    // Business logic validations
    const today = getTodayStr();
    const todayLogs = await AttendanceLog.find({ employee: employeeId, date: today, status: 'SUCCESS' }).sort({ timestamp: 1 });
    const lastAction = todayLogs.length > 0 ? todayLogs[todayLogs.length - 1].action : null;

    const actionValidations = {
      PUNCH_IN: () => lastAction === 'PUNCH_IN' ? 'Already punched in.' : (lastAction === 'BREAK_START' ? 'End your break first.' : null),
      PUNCH_OUT: () => !lastAction || lastAction === 'PUNCH_OUT' ? 'Not punched in.' : (lastAction === 'BREAK_START' ? 'End your break before punching out.' : null),
      BREAK_START: () => !lastAction || lastAction !== 'PUNCH_IN' && lastAction !== 'BREAK_END' ? 'Punch in first.' : (lastAction === 'BREAK_START' ? 'Already on break.' : null),
      BREAK_END: () => lastAction !== 'BREAK_START' ? 'Not on break.' : null,
    };

    const validationError = actionValidations[action]?.();
    if (validationError) {
      return res.status(400).json({ success: false, message: validationError });
    }

    // Save snapshot
    let snapshotPath = null;
    if (snapshotBase64) {
      snapshotPath = saveBase64Image(snapshotBase64, 'snapshots');
    }

    // Create log entry
    const log = await AttendanceLog.create({
      employee: employeeId,
      date: today,
      action,
      timestamp: new Date(),
      location: {
        latitude: location.latitude,
        longitude: location.longitude,
        accuracy: location.accuracy,
        isOfficeLocation,
        distanceFromOffice: Math.round(distance),
      },
      faceVerified: true,
      faceMatchScore,
      snapshotPath,
      outsideReason: outsideReason || null,
      isManualEntry: false,
      status: 'SUCCESS',
      ipAddress: req.ip,
    });

    // Update daily summary async
    updateSummary(employeeId, today).catch(console.error);

    res.json({
      success: true,
      message: `${action.replace('_', ' ')} recorded successfully.`,
      data: {
        action,
        timestamp: log.timestamp,
        location: log.location,
        faceMatchScore,
      },
    });
  } catch (err) { next(err); }
});

// GET /api/attendance/today - Get today's status for logged-in employee
router.get('/today', authenticate, async (req, res, next) => {
  try {
    let employeeId = req.user.employee?._id || req.user.employee;

    if (['Admin', 'Manager', 'HR', 'Supervisor'].includes(req.user.role) && req.query.employeeId) {
      employeeId = req.query.employeeId;
    }

    if (!employeeId) return res.status(400).json({ success: false, message: 'No employee linked.' });

    const today = getTodayStr();
    const [logs, summary] = await Promise.all([
      AttendanceLog.find({ employee: employeeId, date: today }).sort({ timestamp: 1 }),
      AttendanceSummary.findOne({ employee: employeeId, date: today }),
    ]);

    const lastLog = logs[logs.length - 1];
    const currentStatus = lastLog ? lastLog.action : 'NOT_STARTED';

    res.json({
      success: true,
      data: {
        date: today,
        currentStatus,
        logs,
        summary,
      },
    });
  } catch (err) { next(err); }
});

// GET /api/attendance/history - Employee history
router.get('/history', authenticate, async (req, res, next) => {
  try {
    let employeeId = req.user.employee?._id || req.user.employee;
    const { startDate, endDate, page = 1, limit = 30 } = req.query;

    if (['Admin', 'Manager', 'HR', 'Supervisor'].includes(req.user.role) && req.query.employeeId) {
      employeeId = req.query.employeeId;
    }

    const filter = { employee: employeeId };
    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = startDate;
      if (endDate) filter.date.$lte = endDate;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [summaries, total] = await Promise.all([
      AttendanceSummary.find(filter).sort({ date: -1 }).skip(skip).limit(parseInt(limit)),
      AttendanceSummary.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: summaries,
      pagination: { page: parseInt(page), limit: parseInt(limit), total },
    });
  } catch (err) { next(err); }
});

// GET /api/attendance/logs/:date - All logs for a date (Admin/Manager/HR/Supervisor)
router.get('/logs/:date', authenticate, canViewReports, async (req, res, next) => {
  try {
    const { date } = req.params;
    const { department } = req.query;

    const employeeFilter = { isActive: true };
    if (department) employeeFilter.department = department;

    const employees = await Employee.find(employeeFilter).select('_id');
    const employeeIds = employees.map(e => e._id);

    const logs = await AttendanceLog.find({ date, employee: { $in: employeeIds } })
      .populate('employee', 'name employeeCode department')
      .sort({ timestamp: 1 });

    res.json({ success: true, data: logs });
  } catch (err) { next(err); }
});

// GET /api/attendance/summary/:date - Daily summary (Admin/HR/Supervisor view)
router.get('/summary/:date', authenticate, canViewReports, async (req, res, next) => {
  try {
    const { date } = req.params;
    const { department } = req.query;

    const employeeFilter = { isActive: true };
    if (department) employeeFilter.department = department;

    const summaries = await AttendanceSummary.find({ date })
      .populate({
        path: 'employee',
        match: employeeFilter,
        select: 'name employeeCode department designation photo',
      })
      .sort({ 'employee.name': 1 });

    const filtered = summaries.filter(s => s.employee !== null);

    // Stats
    const stats = {
      total: filtered.length,
      present: filtered.filter(s => s.status === 'Present').length,
      absent: filtered.filter(s => s.status === 'Absent').length,
      halfDay: filtered.filter(s => s.status === 'Half Day').length,
      late: filtered.filter(s => s.isLate).length,
    };

    res.json({ success: true, data: filtered, stats });
  } catch (err) { next(err); }
});

// PUT /api/attendance/:logId - Manual correction (Admin/Manager only)
router.put('/:logId', authenticate, canModifyAttendance, async (req, res, next) => {
  try {
    const { note, timestamp } = req.body;
    const log = await AttendanceLog.findById(req.params.logId);
    if (!log) return res.status(404).json({ success: false, message: 'Log not found.' });

    if (timestamp) log.timestamp = new Date(timestamp);
    log.isManualEntry = true;
    log.manualEntryBy = req.user._id;
    log.manualEntryNote = note || 'Manual correction by admin';
    await log.save();

    // Recalculate summary
    await updateSummary(log.employee, log.date);

    res.json({ success: true, message: 'Attendance log updated.', data: log });
  } catch (err) { next(err); }
});

module.exports = router;