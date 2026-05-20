const AttendanceSummary = require('../models/AttendanceSummary.model');
const Employee = require('../models/Employee.model');
const { buildEmployeeScopeFilter } = require('../utils/access');

exports.getMonthlyReport = async (req, res, next) => {
  try {
    const { month, department, employeeId } = req.query;

    if (!month) {
      return res.status(400).json({ success: false, message: 'month (YYYY-MM) is required.' });
    }

    const startDate = `${month}-01`;
    const [year, monthIndex] = month.split('-').map(Number);
    const lastDay = new Date(year, monthIndex, 0).getDate();
    const endDate = `${month}-${String(lastDay).padStart(2, '0')}`;

    const employeeFilter = { ...buildEmployeeScopeFilter(req.user), isActive: true };
    if (department) employeeFilter.department = department;

    let employees;
    if (employeeId) {
      employees = await Employee.find({ _id: employeeId, ...employeeFilter }).select('_id name employeeCode department designation');
    } else {
      employees = await Employee.find(employeeFilter).select('_id name employeeCode department designation');
    }

    const employeeIds = employees.map((employee) => employee._id);
    const summaries = await AttendanceSummary.find({
      employee: { $in: employeeIds },
      date: { $gte: startDate, $lte: endDate },
    }).populate('employee', 'name employeeCode department designation');

    const grouped = {};

    employees.forEach((employee) => {
      grouped[employee._id.toString()] = {
        employee,
        records: [],
        stats: {
          present: 0,
          absent: 0,
          halfDay: 0,
          late: 0,
          totalWorkMinutes: 0,
          totalOvertimeMinutes: 0,
        },
      };
    });

    summaries.forEach((summary) => {
      if (!summary.employee) return;
      const employeeKey = summary.employee._id.toString();
      if (!grouped[employeeKey]) return;

      grouped[employeeKey].records.push(summary);
      if (summary.status === 'Present') grouped[employeeKey].stats.present += 1;
      if (summary.status === 'Absent') grouped[employeeKey].stats.absent += 1;
      if (summary.status === 'Half Day') grouped[employeeKey].stats.halfDay += 1;
      if (summary.isLate) grouped[employeeKey].stats.late += 1;
      grouped[employeeKey].stats.totalWorkMinutes += summary.totalWorkMinutes || 0;
      grouped[employeeKey].stats.totalOvertimeMinutes += summary.overtimeMinutes || 0;
    });

    res.json({ success: true, data: Object.values(grouped), month });
  } catch (err) {
    next(err);
  }
};

exports.getDashboardStats = async (req, res, next) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    const employeeScope = buildEmployeeScopeFilter(req.user);
    const [
      totalEmployees,
      itSoftwareCount,
      itHardwareCount,
      employeeIds,
    ] = await Promise.all([
      Employee.countDocuments({ ...employeeScope, isActive: true }),
      Employee.countDocuments({ ...employeeScope, isActive: true, department: 'IT Software' }),
      Employee.countDocuments({ ...employeeScope, isActive: true, department: 'IT Hardware' }),
      Employee.find({ ...employeeScope, isActive: true }).select('_id'),
    ]);

    const scopedIds = employeeIds.map((item) => item._id);
    const [todayPresent, todayHalfDay, todayLate] = await Promise.all([
      AttendanceSummary.countDocuments({ date: today, employee: { $in: scopedIds }, status: 'Present' }),
      AttendanceSummary.countDocuments({ date: today, employee: { $in: scopedIds }, status: 'Half Day' }),
      AttendanceSummary.countDocuments({ date: today, employee: { $in: scopedIds }, isLate: true }),
    ]);

    const todayCheckedIn = todayPresent + todayHalfDay;
    const todayAbsent = Math.max(0, totalEmployees - todayCheckedIn);

    const trendDates = Array.from({ length: 7 }, (_, index) => {
      const current = new Date();
      current.setDate(current.getDate() - (6 - index));
      return current.toISOString().split('T')[0];
    });

    const trend = await Promise.all(
      trendDates.map(async (date) => {
        const present = await AttendanceSummary.countDocuments({
          date,
          employee: { $in: scopedIds },
          status: { $in: ['Present', 'Half Day'] },
        });
        return { date, present };
      })
    );

    res.json({
      success: true,
      data: {
        employees: { total: totalEmployees, itSoftware: itSoftwareCount, itHardware: itHardwareCount },
        today: { present: todayCheckedIn, absent: todayAbsent, late: todayLate, date: today },
        trend,
      },
    });
  } catch (err) {
    next(err);
  }
};
