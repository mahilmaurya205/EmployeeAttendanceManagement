const LeavePolicy = require('../models/LeavePolicy.model');
const LeaveRequest = require('../models/LeaveRequest.model');
const Employee = require('../models/Employee.model');
const { DEFAULT_LEAVE_TYPES } = require('../utils/leaveDefaults');
const { ROLES, asId, getAdminOwnerId, getDistributorOwnerId } = require('../utils/access');

const startOfDay = (value) => {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
};

const endOfDay = (value) => {
  const date = new Date(value);
  date.setHours(23, 59, 59, 999);
  return date;
};

const dayDiffInclusive = (startDate, endDate) => {
  const diffMs = endOfDay(endDate) - startOfDay(startDate);
  return Math.floor(diffMs / (24 * 60 * 60 * 1000)) + 1;
};

const buildLeaveRequestScope = (user) => {
  if (!user) return { _id: null };

  if (user.role === ROLES.SUPER_ADMIN) return {};
  if (user.role === ROLES.DISTRIBUTOR) return { distributorOwner: asId(user._id) };

  const adminOwnerId = getAdminOwnerId(user);
  if ([ROLES.ADMIN, ROLES.MANAGER, ROLES.HR, ROLES.SUPERVISOR].includes(user.role) && adminOwnerId) {
    return { adminOwner: adminOwnerId };
  }

  if (user.role === ROLES.EMPLOYEE && user.employee) {
    return { employee: asId(user.employee) };
  }

  return { _id: null };
};

const normalizeLeaveTypes = (leaveTypes) => {
  if (!Array.isArray(leaveTypes) || leaveTypes.length === 0) return DEFAULT_LEAVE_TYPES;

  return leaveTypes
    .map((item) => ({
      code: String(item.code || '').trim().toUpperCase(),
      name: String(item.name || '').trim(),
      annualQuota: Number(item.annualQuota || 0),
      isPaid: item.isPaid !== false,
      requiresApproval: item.requiresApproval !== false,
      allowCarryForward: item.allowCarryForward === true,
      enabled: item.enabled !== false,
    }))
    .filter((item) => item.code && item.name && Number.isFinite(item.annualQuota) && item.annualQuota >= 0);
};

const ensurePolicy = async (user) => {
  const adminOwner = getAdminOwnerId(user);
  if (!adminOwner) return null;

  let policy = await LeavePolicy.findOne({ adminOwner });
  if (!policy) {
    policy = await LeavePolicy.create({
      adminOwner,
      distributorOwner: getDistributorOwnerId(user),
      leaveTypes: DEFAULT_LEAVE_TYPES,
    });
  }
  return policy;
};

const getUsedQuotaDays = async ({ employeeId, leaveTypeCode, year, excludeRequestId }) => {
  const rangeStart = new Date(`${year}-01-01T00:00:00.000Z`);
  const rangeEnd = new Date(`${year}-12-31T23:59:59.999Z`);
  const filter = {
    employee: employeeId,
    leaveTypeCode,
    status: 'Approved',
    startDate: { $lte: rangeEnd },
    endDate: { $gte: rangeStart },
  };

  if (excludeRequestId) {
    filter._id = { $ne: excludeRequestId };
  }

  const approved = await LeaveRequest.find(filter).select('totalDays');
  return approved.reduce((total, item) => total + Number(item.totalDays || 0), 0);
};

exports.getLeavePolicy = async (req, res, next) => {
  try {
    const policy = await ensurePolicy(req.user);
    if (!policy) {
      return res.status(400).json({ success: false, message: 'Leave policy is available only inside an Admin company.' });
    }

    res.json({ success: true, data: policy });
  } catch (err) {
    next(err);
  }
};

exports.updateLeavePolicy = async (req, res, next) => {
  try {
    if (req.user.role !== ROLES.ADMIN) {
      return res.status(403).json({ success: false, message: 'Only Admin can update leave policy.' });
    }

    const leaveTypes = normalizeLeaveTypes(req.body.leaveTypes);
    if (leaveTypes.length === 0) {
      return res.status(400).json({ success: false, message: 'At least one leave type is required.' });
    }

    const policy = await LeavePolicy.findOneAndUpdate(
      { adminOwner: req.user._id },
      {
        adminOwner: req.user._id,
        distributorOwner: getDistributorOwnerId(req.user),
        leaveTypes,
      },
      {
        new: true,
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      }
    );

    res.json({ success: true, message: 'Leave policy updated successfully.', data: policy });
  } catch (err) {
    next(err);
  }
};

exports.listLeaveRequests = async (req, res, next) => {
  try {
    const { status, employeeId, year } = req.query;
    const filter = { ...buildLeaveRequestScope(req.user) };

    if (status) filter.status = status;
    if (employeeId && [ROLES.ADMIN, ROLES.MANAGER, ROLES.HR, ROLES.SUPERVISOR, ROLES.SUPER_ADMIN, ROLES.DISTRIBUTOR].includes(req.user.role)) {
      filter.employee = employeeId;
    }
    if (year) {
      filter.startDate = { $gte: new Date(`${year}-01-01T00:00:00.000Z`) };
      filter.endDate = { $lte: new Date(`${year}-12-31T23:59:59.999Z`) };
    }

    const requests = await LeaveRequest.find(filter)
      .populate('employee', 'name employeeCode department basicSalary')
      .populate('reviewedBy', 'name role')
      .sort({ createdAt: -1 });

    res.json({ success: true, data: requests });
  } catch (err) {
    next(err);
  }
};

exports.createLeaveRequest = async (req, res, next) => {
  try {
    const employeeId = req.user.employee?._id?.toString() || req.user.employee?.toString();
    if (!employeeId) {
      return res.status(400).json({ success: false, message: 'Only employee-linked accounts can apply for leave.' });
    }

    const employee = await Employee.findById(employeeId).select('name employeeCode adminOwner distributorOwner user isActive');
    if (!employee || !employee.isActive) {
      return res.status(404).json({ success: false, message: 'Employee record not found or inactive.' });
    }

    const { leaveTypeCode, startDate, endDate, unit = 'full', halfDaySession = null, reason } = req.body;
    const normalizedCode = String(leaveTypeCode || '').trim().toUpperCase();
    const start = startOfDay(startDate);
    const end = startOfDay(endDate);

    if (!normalizedCode || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return res.status(400).json({ success: false, message: 'Leave type, start date, and end date are required.' });
    }
    if (end < start) {
      return res.status(400).json({ success: false, message: 'End date cannot be before start date.' });
    }

    const policy = await ensurePolicy(req.user);
    const leaveType = policy?.leaveTypes?.find((item) => item.code === normalizedCode && item.enabled);
    if (!leaveType) {
      return res.status(400).json({ success: false, message: 'This leave type is not enabled in your company policy.' });
    }

    const totalDays = unit === 'half' ? 0.5 : dayDiffInclusive(start, end);
    if (unit === 'half' && start.getTime() !== end.getTime()) {
      return res.status(400).json({ success: false, message: 'Half-day leave must start and end on the same date.' });
    }

    const year = start.getFullYear();
    const quotaUsedBeforeRequest = await getUsedQuotaDays({ employeeId: employee._id, leaveTypeCode: normalizedCode, year });
    const exceedsQuota = quotaUsedBeforeRequest + totalDays > Number(leaveType.annualQuota || 0);

    const request = await LeaveRequest.create({
      employee: employee._id,
      user: req.user._id,
      adminOwner: employee.adminOwner,
      distributorOwner: employee.distributorOwner,
      leaveTypeCode: leaveType.code,
      leaveTypeName: leaveType.name,
      startDate: start,
      endDate: endOfDay(end),
      totalDays,
      unit,
      halfDaySession: unit === 'half' ? halfDaySession || 'First Half' : null,
      reason: String(reason || '').trim(),
      quotaLimitAtRequest: Number(leaveType.annualQuota || 0),
      quotaUsedBeforeRequest,
      exceedsQuota,
    });

    res.status(201).json({
      success: true,
      message: exceedsQuota
        ? 'Leave request submitted and marked for Admin approval because it exceeds the configured quota.'
        : 'Leave request submitted successfully.',
      data: request,
    });
  } catch (err) {
    next(err);
  }
};

exports.updateLeaveRequestStatus = async (req, res, next) => {
  try {
    if (req.user.role !== ROLES.ADMIN) {
      return res.status(403).json({ success: false, message: 'Only Admin can approve or reject leave requests.' });
    }

    const { status, adminComment } = req.body;
    if (!['Approved', 'Rejected'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Status must be Approved or Rejected.' });
    }

    const request = await LeaveRequest.findOne({
      _id: req.params.id,
      adminOwner: req.user._id,
    });

    if (!request) {
      return res.status(404).json({ success: false, message: 'Leave request not found.' });
    }

    request.status = status;
    request.adminComment = String(adminComment || '').trim() || undefined;
    request.reviewedBy = req.user._id;
    request.reviewedAt = new Date();
    await request.save();

    const populated = await LeaveRequest.findById(request._id)
      .populate('employee', 'name employeeCode department')
      .populate('reviewedBy', 'name role');

    res.json({
      success: true,
      message: `Leave request ${status.toLowerCase()} successfully.`,
      data: populated,
    });
  } catch (err) {
    next(err);
  }
};

