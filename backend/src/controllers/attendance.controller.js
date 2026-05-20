const Employee = require('../models/Employee.model');
const AttendanceLog = require('../models/AttendanceLog.model');
const AttendanceSummary = require('../models/AttendanceSummary.model');
const { getDistanceMeters } = require('../middleware/location.middleware');
const { saveBase64Image } = require('../middleware/upload.middleware');
const {
  ROLES,
  buildEmployeeScopeFilter,
} = require('../utils/access');
const User = require('../models/User.model');

const VALID_ACTIONS = ['PUNCH_IN', 'PUNCH_OUT', 'BREAK_START', 'BREAK_END'];

const getTodayStr = () => new Date().toISOString().split('T')[0];

const findScopedEmployee = (user, employeeId) => Employee.findOne({
  _id: employeeId,
  ...buildEmployeeScopeFilter(user),
});

const getAdminSettings = async (employee, user) => {
  const adminOwnerId = employee?.adminOwner || user?.adminOwner || (user?.role === ROLES.ADMIN ? user._id : null);
  if (!adminOwnerId) return null;
  return User.findById(adminOwnerId).select('officeLocation attendancePolicy');
};

const getOrCreateSummary = async (employeeId, date) => {
  let summary = await AttendanceSummary.findOne({ employee: employeeId, date });
  if (!summary) {
    summary = await AttendanceSummary.create({ employee: employeeId, date });
  }
  return summary;
};

const updateSummary = async (employeeId, date) => {
  const logs = await AttendanceLog.find({
    employee: employeeId,
    date,
    status: 'SUCCESS',
  }).sort({ timestamp: 1 });

  const summary = await getOrCreateSummary(employeeId, date);
  const employee = await Employee.findById(employeeId).select('workSchedule');
  const adminSettings = await getAdminSettings(employee, { adminOwner: employee?.adminOwner });
  const halfDayLateAfterMinutes = Number(adminSettings?.attendancePolicy?.halfDayLateAfterMinutes ?? 30);

  let punchIn = null;
  let punchOut = null;
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

  const totalBreakMinutes = breaks.reduce((sum, item) => sum + item.duration, 0);
  let totalWorkMinutes = 0;

  if (punchIn && punchOut) {
    totalWorkMinutes = Math.max(0, Math.round((punchOut - punchIn) / 60000) - totalBreakMinutes);
  } else if (punchIn) {
    totalWorkMinutes = Math.max(0, Math.round((new Date() - punchIn) / 60000) - totalBreakMinutes);
  }

  let isLate = false;
  let lateByMinutes = 0;
  if (punchIn && employee?.workSchedule?.shiftStart) {
    const [hours, minutes] = employee.workSchedule.shiftStart.split(':').map(Number);
    const shiftStart = new Date(punchIn);
    shiftStart.setHours(hours, minutes, 0, 0);
    const lateThreshold = new Date(shiftStart);
    lateThreshold.setMinutes(lateThreshold.getMinutes() + 30);
    if (punchIn > lateThreshold) {
      isLate = true;
      lateByMinutes = Math.round((punchIn - shiftStart) / 60000);
    }
  }

  let isEarlyLeave = false;
  let earlyLeaveByMinutes = 0;
  if (punchOut && employee?.workSchedule?.shiftEnd) {
    const [hours, minutes] = employee.workSchedule.shiftEnd.split(':').map(Number);
    const shiftEnd = new Date(punchOut);
    shiftEnd.setHours(hours, minutes, 0, 0);
    if (punchOut < shiftEnd) {
      isEarlyLeave = true;
      earlyLeaveByMinutes = Math.round((shiftEnd - punchOut) / 60000);
    }
  }

  const overtimeMinutes = Math.max(0, totalWorkMinutes - 480);
  const isHalfDayByLate = isLate && lateByMinutes >= halfDayLateAfterMinutes;
  const status = !punchIn
    ? 'Absent'
    : (isHalfDayByLate || totalWorkMinutes < 240 ? 'Half Day' : 'Present');

  await AttendanceSummary.findOneAndUpdate(
    { employee: employeeId, date: summary.date },
    {
      punchIn,
      punchOut,
      breaks,
      totalBreakMinutes,
      totalWorkMinutes,
      isLate,
      lateByMinutes,
      isEarlyLeave,
      earlyLeaveByMinutes,
      overtimeMinutes,
      status,
    },
    { upsert: true, new: true }
  );
};

const ensureDailySummaries = async (date, department) => {
  const employeeFilter = { isActive: true };
  if (department) employeeFilter.department = department;

  const employees = await Employee.find(employeeFilter).select('_id');
  if (employees.length === 0) return [];

  const employeeIds = employees.map((employee) => employee._id);
  const existingSummaries = await AttendanceSummary.find({ employee: { $in: employeeIds }, date }).select('employee');
  const existingIds = new Set(existingSummaries.map((summary) => summary.employee.toString()));

  const missingEmployees = employeeIds.filter((id) => !existingIds.has(id.toString()));
  if (missingEmployees.length > 0) {
    await AttendanceSummary.insertMany(
      missingEmployees.map((employeeId) => ({ employee: employeeId, date, status: 'Absent' })),
      { ordered: false }
    ).catch(() => {});
  }

  return employeeIds;
};

exports.recordAttendanceAction = async (req, res, next) => {
  try {
    const { action, location, faceVerified, faceMatchScore, matchedEmployeeId, snapshotBase64, outsideReason } = req.body;

    if (!VALID_ACTIONS.includes(action)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid action. Must be PUNCH_IN, PUNCH_OUT, BREAK_START, or BREAK_END.',
      });
    }

    let employeeId;
    if (req.user.role === ROLES.EMPLOYEE) {
      if (!req.user.employee) {
        return res.status(400).json({ success: false, message: 'No employee profile linked to this account.' });
      }
      employeeId = req.user.employee._id || req.user.employee;
    } else {
      employeeId = req.body.employeeId;
      if (!employeeId) {
        return res.status(400).json({ success: false, message: 'employeeId required.' });
      }
    }

    const employee = await findScopedEmployee(req.user, employeeId);
    if (!employee || !employee.isActive) {
      return res.status(404).json({ success: false, message: 'Employee not found or inactive.' });
    }

    if (!employee.faceEnrolled) {
      return res.status(400).json({ success: false, message: 'Face is not enrolled for this employee.' });
    }

    if (!location || location.latitude == null || location.longitude == null) {
      return res.status(400).json({ success: false, message: 'Location is required.' });
    }

    const adminSettings = await getAdminSettings(employee, req.user);
    const officeLocation = adminSettings?.officeLocation;
    if (!officeLocation?.latitude || !officeLocation?.longitude || !officeLocation?.radius) {
      return res.status(400).json({
        success: false,
        message: 'Admin office location is not configured yet. Please contact your Admin.',
      });
    }

    const distance = getDistanceMeters(location.latitude, location.longitude, officeLocation.latitude, officeLocation.longitude);
    const isOfficeLocation = distance <= officeLocation.radius;

    if (!isOfficeLocation) {
      return res.status(403).json({
        success: false,
        message: `Attendance is allowed only within ${officeLocation.radius}m of your Admin office location. You are ${Math.round(distance)}m away.`,
        distanceFromOffice: Math.round(distance),
        requiredRadius: officeLocation.radius,
      });
    }

    const FACE_THRESHOLD = 0.45;
    if (!faceVerified || Number(faceMatchScore) < FACE_THRESHOLD) {
      return res.status(403).json({
        success: false,
        message: 'Face verification failed. Please try again with better lighting.',
        faceMatchScore,
      });
    }

    if (!matchedEmployeeId) {
      return res.status(400).json({
        success: false,
        message: 'Matched employee identity is required for attendance verification.',
      });
    }

    if (String(matchedEmployeeId) !== String(employeeId)) {
      return res.status(403).json({
        success: false,
        message: 'Face verification does not match the selected employee. Attendance can only be marked by the same employee.',
      });
    }

    const today = getTodayStr();
    const todayLogs = await AttendanceLog.find({
      employee: employeeId,
      date: today,
      status: 'SUCCESS',
    }).sort({ timestamp: 1 });

    const lastAction = todayLogs.length > 0 ? todayLogs[todayLogs.length - 1].action : null;
    const actionValidations = {
      PUNCH_IN: () => (lastAction === 'PUNCH_IN' ? 'Already punched in.' : lastAction === 'BREAK_START' ? 'End your break first.' : null),
      PUNCH_OUT: () => (!lastAction || lastAction === 'PUNCH_OUT' ? 'Not punched in.' : lastAction === 'BREAK_START' ? 'End your break before punching out.' : null),
      BREAK_START: () => (!lastAction || (lastAction !== 'PUNCH_IN' && lastAction !== 'BREAK_END') ? 'Punch in first.' : lastAction === 'BREAK_START' ? 'Already on break.' : null),
      BREAK_END: () => (lastAction !== 'BREAK_START' ? 'Not on break.' : null),
    };

    const validationError = actionValidations[action]?.();
    if (validationError) {
      return res.status(400).json({ success: false, message: validationError });
    }

    const snapshotPath = snapshotBase64 ? saveBase64Image(snapshotBase64, 'snapshots') : null;

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
      faceMatchScore: Number(faceMatchScore),
      snapshotPath,
      outsideReason: outsideReason || null,
      isManualEntry: false,
      status: 'SUCCESS',
      ipAddress: req.ip,
    });

    await updateSummary(employeeId, today);

    res.json({
      success: true,
      message: `${action.replace('_', ' ')} recorded successfully.`,
      data: {
        action,
        timestamp: log.timestamp,
        location: log.location,
        faceMatchScore: log.faceMatchScore,
        matchedEmployeeId,
      },
    });
  } catch (err) {
    next(err);
  }
};

exports.getTodayAttendance = async (req, res, next) => {
  try {
    let employeeId = req.user.employee?._id || req.user.employee;

    if ([ROLES.SUPER_ADMIN, ROLES.DISTRIBUTOR, ROLES.ADMIN, ROLES.MANAGER, ROLES.HR, ROLES.SUPERVISOR].includes(req.user.role) && req.query.employeeId) {
      employeeId = req.query.employeeId;
    }

    if (!employeeId) {
      return res.status(400).json({ success: false, message: 'No employee linked.' });
    }

    const today = getTodayStr();
    const employee = await findScopedEmployee(req.user, employeeId);
    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee not found.' });
    }

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
  } catch (err) {
    next(err);
  }
};

exports.getAttendanceHistory = async (req, res, next) => {
  try {
    let employeeId = req.user.employee?._id || req.user.employee;
    const { startDate, endDate, page = 1, limit = 30 } = req.query;

    if ([ROLES.SUPER_ADMIN, ROLES.DISTRIBUTOR, ROLES.ADMIN, ROLES.MANAGER, ROLES.HR, ROLES.SUPERVISOR].includes(req.user.role) && req.query.employeeId) {
      employeeId = req.query.employeeId;
    }

    const employee = await findScopedEmployee(req.user, employeeId);
    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee not found.' });
    }

    const filter = { employee: employeeId };
    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = startDate;
      if (endDate) filter.date.$lte = endDate;
    }

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 30;
    const skip = (pageNum - 1) * limitNum;

    const [summaries, total] = await Promise.all([
      AttendanceSummary.find(filter).sort({ date: -1 }).skip(skip).limit(limitNum),
      AttendanceSummary.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: summaries,
      pagination: { page: pageNum, limit: limitNum, total },
    });
  } catch (err) {
    next(err);
  }
};

exports.getLogsForDate = async (req, res, next) => {
  try {
    const { date } = req.params;
    const { department } = req.query;

    const employeeFilter = { ...buildEmployeeScopeFilter(req.user), isActive: true };
    if (department) employeeFilter.department = department;

    const employees = await Employee.find(employeeFilter).select('_id');
    const employeeIds = employees.map((employee) => employee._id);

    const logs = await AttendanceLog.find({ date, employee: { $in: employeeIds } })
      .populate('employee', 'name employeeCode department')
      .sort({ timestamp: 1 });

    res.json({ success: true, data: logs });
  } catch (err) {
    next(err);
  }
};

exports.getSummaryForDate = async (req, res, next) => {
  try {
    const { date } = req.params;
    const { department } = req.query;

    await ensureDailySummaries(date, department);

    const employeeFilter = { ...buildEmployeeScopeFilter(req.user), isActive: true };
    if (department) employeeFilter.department = department;

    const summaries = await AttendanceSummary.find({ date })
      .populate({
        path: 'employee',
        match: employeeFilter,
        select: 'name employeeCode department designation photo email mobile faceEnrolled isActive joiningDate',
      })
      .sort({ createdAt: 1 });

    const filtered = summaries.filter((summary) => summary.employee !== null);
    const stats = {
      total: filtered.length,
      present: filtered.filter((summary) => summary.status === 'Present').length,
      absent: filtered.filter((summary) => summary.status === 'Absent').length,
      halfDay: filtered.filter((summary) => summary.status === 'Half Day').length,
      late: filtered.filter((summary) => summary.isLate).length,
    };

    res.json({ success: true, data: filtered, stats });
  } catch (err) {
    next(err);
  }
};

exports.updateAttendanceLog = async (req, res, next) => {
  try {
    const { note, timestamp } = req.body;
    const log = await AttendanceLog.findById(req.params.logId);

    if (!log) {
      return res.status(404).json({ success: false, message: 'Log not found.' });
    }

    const employee = await findScopedEmployee(req.user, log.employee);
    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee not found.' });
    }

    if (timestamp) log.timestamp = new Date(timestamp);
    log.isManualEntry = true;
    log.manualEntryBy = req.user._id;
    log.manualEntryNote = note || 'Manual correction by admin';
    await log.save();

    await updateSummary(log.employee, log.date);

    res.json({ success: true, message: 'Attendance log updated.', data: log });
  } catch (err) {
    next(err);
  }
};
