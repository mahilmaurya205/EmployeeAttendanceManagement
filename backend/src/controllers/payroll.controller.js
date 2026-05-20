const User = require('../models/User.model');
const Employee = require('../models/Employee.model');
const PayrollRun = require('../models/PayrollRun.model');
const LeaveRequest = require('../models/LeaveRequest.model');
const { ROLES, asId, getAdminOwnerId, getDistributorOwnerId, buildEmployeeScopeFilter } = require('../utils/access');

const DEFAULT_COMPONENTS = {
  basicPay: 100,
  hra: 40,
  medical: 10,
  standardAllowance: 15,
  conveyanceAllowance: 10,
  nightAllowance: 0,
  ltc: 0,
  otherIncome: 0,
};

const COMPONENT_LABELS = {
  basicPay: 'Basic Pay',
  hra: 'HRA',
  medical: 'Medical',
  standardAllowance: 'Standard Allowance',
  conveyanceAllowance: 'Conveyance Allowance',
  nightAllowance: 'Night Allowance',
  ltc: 'LTC',
  otherIncome: 'Other Income',
};

const parseMonthRange = (month) => {
  const match = /^(\d{4})-(\d{2})$/.exec(String(month || '').trim());
  if (!match) return null;

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const start = new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, monthIndex + 1, 0, 23, 59, 59, 999));
  const totalDays = end.getUTCDate();

  return { year, month: `${match[1]}-${match[2]}`, start, end, totalDays };
};

const roundCurrency = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

const getAdminPayrollPolicy = async (user) => {
  const adminOwnerId = getAdminOwnerId(user);
  if (!adminOwnerId) return null;

  const adminOwner = user.role === ROLES.ADMIN
    ? user
    : await User.findById(adminOwnerId).select('payrollPolicy companyName name');

  return adminOwner || null;
};

const normalizePayrollPolicy = (input) => {
  const policy = input || {};
  const sourceComponents = policy.components || {};
  const components = {};

  Object.keys(DEFAULT_COMPONENTS).forEach((key) => {
    const value = Number(sourceComponents[key]);
    components[key] = Number.isFinite(value) && value >= 0 ? value : DEFAULT_COMPONENTS[key];
  });

  const salarySlipGenerationDay = Number(policy.salarySlipGenerationDay);
  return {
    salarySlipGenerationDay: Number.isFinite(salarySlipGenerationDay) && salarySlipGenerationDay >= 1 && salarySlipGenerationDay <= 31
      ? salarySlipGenerationDay
      : 1,
    components,
  };
};

const getLeaveBreakdown = async ({ employeeId, start, end }) => {
  const requests = await LeaveRequest.find({
    employee: employeeId,
    status: 'Approved',
    startDate: { $lte: end },
    endDate: { $gte: start },
  }).select('totalDays leaveTypeCode');

  return requests.reduce((acc, item) => {
    acc.total += Number(item.totalDays || 0);
    if (item.leaveTypeCode === 'LOSS_OF_PAY') {
      acc.unpaid += Number(item.totalDays || 0);
    } else {
      acc.paid += Number(item.totalDays || 0);
    }
    return acc;
  }, { total: 0, paid: 0, unpaid: 0 });
};

const buildPayrollRecord = async ({ employee, month, range, policy, generatedBy }) => {
  const leaveBreakdown = await getLeaveBreakdown({
    employeeId: employee._id,
    start: range.start,
    end: range.end,
  });

  const salaryRatio = Math.max(0, (range.totalDays - leaveBreakdown.unpaid) / range.totalDays);
  const components = Object.entries(policy.components).map(([key, percentage]) => {
    const monthlyAmount = roundCurrency((Number(employee.basicSalary || 0) * Number(percentage || 0)) / 100);
    return {
      name: COMPONENT_LABELS[key] || key,
      percentage,
      monthlyAmount,
      payableAmount: roundCurrency(monthlyAmount * salaryRatio),
    };
  });

  const grossPay = roundCurrency(components.reduce((sum, item) => sum + item.monthlyAmount, 0));
  const netPay = roundCurrency(components.reduce((sum, item) => sum + item.payableAmount, 0));

  return {
    adminOwner: employee.adminOwner,
    distributorOwner: employee.distributorOwner,
    employee: employee._id,
    user: employee.user || null,
    month,
    totalSalaryDays: roundCurrency(range.totalDays - leaveBreakdown.unpaid),
    totalLeaveDays: roundCurrency(leaveBreakdown.total),
    paidLeaveDays: roundCurrency(leaveBreakdown.paid),
    unpaidLeaveDays: roundCurrency(leaveBreakdown.unpaid),
    basicSalary: roundCurrency(employee.basicSalary || 0),
    components,
    grossPay,
    netPay,
    generatedBy,
    generatedAt: new Date(),
  };
};

exports.getPayrollPolicy = async (req, res, next) => {
  try {
    const adminOwner = await getAdminPayrollPolicy(req.user);
    if (!adminOwner) {
      return res.status(400).json({ success: false, message: 'Payroll policy is available only inside an Admin company.' });
    }

    const policy = normalizePayrollPolicy(adminOwner.payrollPolicy);
    res.json({
      success: true,
      data: {
        salarySlipGenerationDay: policy.salarySlipGenerationDay,
        components: policy.components,
        companyName: adminOwner.companyName || null,
        adminName: adminOwner.name || null,
      },
    });
  } catch (err) {
    next(err);
  }
};

exports.updatePayrollPolicy = async (req, res, next) => {
  try {
    if (req.user.role !== ROLES.ADMIN) {
      return res.status(403).json({ success: false, message: 'Only Admin can update payroll policy.' });
    }

    const policy = normalizePayrollPolicy(req.body);
    const user = await User.findByIdAndUpdate(
      req.user._id,
      {
        payrollPolicy: {
          salarySlipGenerationDay: policy.salarySlipGenerationDay,
          components: policy.components,
        },
      },
      { new: true, runValidators: true }
    );

    res.json({
      success: true,
      message: 'Payroll policy updated successfully.',
      data: user.payrollPolicy,
    });
  } catch (err) {
    next(err);
  }
};

exports.listPayrollRuns = async (req, res, next) => {
  try {
    const { month, employeeId } = req.query;
    const filter = {};

    if (req.user.role === ROLES.EMPLOYEE && req.user.employee) {
      filter.employee = asId(req.user.employee);
    } else {
      const adminOwnerId = getAdminOwnerId(req.user);
      if (!adminOwnerId) {
        return res.status(400).json({ success: false, message: 'Payroll runs are available only inside an Admin company.' });
      }
      filter.adminOwner = adminOwnerId;
      if (employeeId) filter.employee = employeeId;
    }

    if (month) filter.month = month;

    const runs = await PayrollRun.find(filter)
      .populate('employee', 'name employeeCode department designation basicSalary')
      .sort({ month: -1, createdAt: -1 });

    res.json({ success: true, data: runs });
  } catch (err) {
    next(err);
  }
};

exports.generatePayroll = async (req, res, next) => {
  try {
    if (req.user.role !== ROLES.ADMIN) {
      return res.status(403).json({ success: false, message: 'Only Admin can generate payroll.' });
    }

    const range = parseMonthRange(req.body.month);
    if (!range) {
      return res.status(400).json({ success: false, message: 'Month must be in YYYY-MM format.' });
    }

    const adminOwner = await User.findById(req.user._id).select('payrollPolicy');
    const policy = normalizePayrollPolicy(adminOwner?.payrollPolicy);

    const employees = await Employee.find({
      ...buildEmployeeScopeFilter(req.user),
      isActive: true,
    }).select('name employeeCode basicSalary adminOwner distributorOwner user department designation');

    const records = [];
    for (const employee of employees) {
      records.push(await buildPayrollRecord({
        employee,
        month: range.month,
        range,
        policy,
        generatedBy: req.user._id,
      }));
    }

    if (records.length === 0) {
      return res.status(400).json({ success: false, message: 'No active employees found for payroll generation.' });
    }

    await Promise.all(records.map((record) => PayrollRun.findOneAndUpdate(
      { employee: record.employee, month: record.month },
      record,
      { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
    )));

    const runs = await PayrollRun.find({ adminOwner: req.user._id, month: range.month })
      .populate('employee', 'name employeeCode department designation basicSalary')
      .sort({ 'employee.name': 1 });

    res.json({
      success: true,
      message: `Payroll generated for ${range.month}.`,
      data: runs,
    });
  } catch (err) {
    next(err);
  }
};

