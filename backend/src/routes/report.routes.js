const express = require('express');
const router = express.Router();
const AttendanceSummary = require('../models/AttendanceSummary.model');
const Employee = require('../models/Employee.model');
const { authenticate, canViewReports } = require('../middleware/auth.middleware');

// GET /api/reports/monthly?month=2024-01&department=IT Software
router.get('/monthly', authenticate, canViewReports, async (req, res, next) => {
  try {
    const { month, department, employeeId } = req.query;
    if (!month) return res.status(400).json({ success: false, message: 'month (YYYY-MM) is required.' });

    const startDate = `${month}-01`;
    const endDate = `${month}-31`;

    const employeeFilter = { isActive: true };
    if (department) employeeFilter.department = department;

    let employeeIds;
    if (employeeId) {
      employeeIds = [employeeId];
    } else {
      const employees = await Employee.find(employeeFilter).select('_id');
      employeeIds = employees.map(e => e._id);
    }

    const summaries = await AttendanceSummary.find({
      employee: { $in: employeeIds },
      date: { $gte: startDate, $lte: endDate },
    }).populate('employee', 'name employeeCode department designation');

    // Group by employee
    const grouped = {};
    for (const s of summaries) {
      if (!s.employee) continue;
      const empId = s.employee._id.toString();
      if (!grouped[empId]) {
        grouped[empId] = {
          employee: s.employee,
          records: [],
          stats: { present: 0, absent: 0, halfDay: 0, late: 0, totalWorkMinutes: 0, totalOvertimeMinutes: 0 },
        };
      }
      grouped[empId].records.push(s);
      if (s.status === 'Present') grouped[empId].stats.present++;
      if (s.status === 'Absent') grouped[empId].stats.absent++;
      if (s.status === 'Half Day') grouped[empId].stats.halfDay++;
      if (s.isLate) grouped[empId].stats.late++;
      grouped[empId].stats.totalWorkMinutes += s.totalWorkMinutes || 0;
      grouped[empId].stats.totalOvertimeMinutes += s.overtimeMinutes || 0;
    }

    res.json({ success: true, data: Object.values(grouped), month });
  } catch (err) { next(err); }
});

// GET /api/reports/dashboard - Dashboard stats
router.get('/dashboard', authenticate, canViewReports, async (req, res, next) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const thisMonth = today.substring(0, 7);

    const [
      totalEmployees,
      itSoftwareCount,
      itHardwareCount,
      todayPresent,
      todayAbsent,
      todayLate,
    ] = await Promise.all([
      Employee.countDocuments({ isActive: true }),
      Employee.countDocuments({ isActive: true, department: 'IT Software' }),
      Employee.countDocuments({ isActive: true, department: 'IT Hardware' }),
      AttendanceSummary.countDocuments({ date: today, status: 'Present' }),
      AttendanceSummary.countDocuments({ date: today, status: 'Absent' }),
      AttendanceSummary.countDocuments({ date: today, isLate: true }),
    ]);

    // Last 7 days attendance trend
    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const present = await AttendanceSummary.countDocuments({ date: dateStr, status: { $in: ['Present', 'Half Day'] } });
      last7Days.push({ date: dateStr, present });
    }

    res.json({
      success: true,
      data: {
        employees: { total: totalEmployees, itSoftware: itSoftwareCount, itHardware: itHardwareCount },
        today: { present: todayPresent, absent: todayAbsent, late: todayLate, date: today },
        trend: last7Days,
      },
    });
  } catch (err) { next(err); }
});

module.exports = router;