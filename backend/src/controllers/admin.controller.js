const User = require('../models/User.model');
const Employee = require('../models/Employee.model');
const AttendanceLog = require('../models/AttendanceLog.model');
const AttendanceSummary = require('../models/AttendanceSummary.model');
const PlanSetting = require('../models/PlanSetting.model');
const {
  ROLES,
  ALL_ROLES,
  ADMIN_STAFF_ROLES,
  asId,
  normalizeRole,
  getAdminOwnerId,
  getDistributorOwnerId,
  buildUserScopeFilter,
} = require('../utils/access');
const {
  PLAN_DEFINITIONS,
  PLAN_CODES,
  calculateTaxes,
  buildRenewalNotice,
} = require('../utils/subscription.utils');

const normalizeString = (value) => {
  if (value == null) return undefined;
  const normalized = String(value).trim();
  return normalized || undefined;
};

const buildAssetPath = (file) => {
  if (!file?.path) return undefined;
  const normalized = file.path.replace(/\\/g, '/');
  const uploadIndex = normalized.lastIndexOf('uploads/');
  return uploadIndex >= 0 ? normalized.substring(uploadIndex) : normalized;
};

const getPlanForAdminCreation = async (planCode) => {
  if (!PLAN_CODES.includes(planCode)) return null;
  const definition = PLAN_DEFINITIONS[planCode];
  return PlanSetting.findOneAndUpdate(
    { code: planCode },
    {
      $setOnInsert: {
        code: planCode,
        label: definition.label,
        months: definition.months,
        basePrice: 0,
        taxes: { gst: 0, cgst: 0, sgst: 0, igst: 0 },
        isActive: true,
      },
    },
    { new: true, upsert: true }
  );
};

const findScopedUser = (requestUser, targetId) => User.findOne({
  _id: targetId,
  ...buildUserScopeFilter(requestUser),
});

const canManageTarget = (requestUser, targetUser) => {
  if (!targetUser) return false;

  if (requestUser.role === ROLES.SUPER_ADMIN) {
    return targetUser.role !== ROLES.SUPER_ADMIN;
  }

  if (requestUser.role === ROLES.DISTRIBUTOR) {
    return asId(targetUser.distributorOwner) === asId(requestUser._id) && targetUser.role !== ROLES.DISTRIBUTOR;
  }

  if (requestUser.role === ROLES.ADMIN) {
    return asId(targetUser.adminOwner) === asId(requestUser._id) && ![ROLES.ADMIN, ROLES.DISTRIBUTOR, ROLES.SUPER_ADMIN].includes(targetUser.role);
  }

  return false;
};

exports.listUsers = async (req, res, next) => {
  try {
    const users = await User.find(buildUserScopeFilter(req.user))
      .populate('employee', 'name employeeCode department')
      .sort({ createdAt: -1 });

    const data = users.map((user) => {
      const plain = user.toJSON();
      plain.renewalNotice = buildRenewalNotice(user.subscription);
      return plain;
    });

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

exports.updateUserRole = async (req, res, next) => {
  try {
    const role = normalizeRole(req.body.role);

    if (!ALL_ROLES.includes(role)) {
      return res.status(400).json({ success: false, message: 'Invalid role.' });
    }

    const existingUser = await findScopedUser(req.user, req.params.id);
    if (!existingUser) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    if (!canManageTarget(req.user, existingUser)) {
      return res.status(403).json({ success: false, message: 'You cannot manage this user.' });
    }

    if ([ROLES.ADMIN, ROLES.DISTRIBUTOR, ROLES.SUPER_ADMIN].includes(existingUser.role)) {
      return res.status(400).json({ success: false, message: 'Top-level roles cannot be changed from this page.' });
    }

    if (existingUser.employee) {
      return res.status(400).json({ success: false, message: 'Employee-linked users always keep the Employee role.' });
    }

    if (req.user.role !== ROLES.ADMIN || !ADMIN_STAFF_ROLES.includes(role)) {
      return res.status(400).json({ success: false, message: 'Only Admin can assign Manager, HR, or Supervisor roles.' });
    }

    const user = await User.findByIdAndUpdate(req.params.id, { role }, { new: true })
      .populate('employee', 'name employeeCode department');

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    res.json({ success: true, message: 'Role updated.', data: user });
  } catch (err) {
    next(err);
  }
};

exports.toggleUserActive = async (req, res, next) => {
  try {
    const user = await findScopedUser(req.user, req.params.id);

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    if (!canManageTarget(req.user, user)) {
      return res.status(403).json({ success: false, message: 'You cannot manage this user.' });
    }

    user.isActive = !user.isActive;
    await user.save();

    if (user.employee) {
      await Employee.findByIdAndUpdate(user.employee, { isActive: user.isActive });
    }

    res.json({
      success: true,
      message: `User ${user.isActive ? 'activated' : 'deactivated'}.`,
      data: user,
    });
  } catch (err) {
    next(err);
  }
};

exports.deleteUser = async (req, res, next) => {
  try {
    const user = await findScopedUser(req.user, req.params.id);

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    if (!canManageTarget(req.user, user)) {
      return res.status(403).json({ success: false, message: 'You cannot manage this user.' });
    }

    if ([ROLES.SUPER_ADMIN, ROLES.DISTRIBUTOR, ROLES.ADMIN].includes(user.role)) {
      return res.status(400).json({ success: false, message: 'Top-level accounts can be deactivated, but not deleted.' });
    }

    if (user.employee) {
      await Promise.all([
        AttendanceLog.deleteMany({ employee: user.employee }),
        AttendanceSummary.deleteMany({ employee: user.employee }),
        Employee.findByIdAndDelete(user.employee),
      ]);
    }

    await User.findByIdAndDelete(user._id);

    res.json({
      success: true,
      message: 'User deleted successfully.',
      data: { userId: req.params.id },
    });
  } catch (err) {
    next(err);
  }
};

exports.resetUserPassword = async (req, res, next) => {
  try {
    const { newPassword } = req.body;

    if (!newPassword || String(newPassword).length < 6) {
      return res.status(400).json({ success: false, message: 'New password must be at least 6 characters.' });
    }

    const user = await findScopedUser(req.user, req.params.id).select('+password');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    if (!canManageTarget(req.user, user)) {
      return res.status(403).json({ success: false, message: 'You cannot manage this user.' });
    }

    user.password = String(newPassword);
    await user.save();

    res.json({
      success: true,
      message: 'Password updated successfully.',
      data: { userId: user._id },
    });
  } catch (err) {
    next(err);
  }
};

exports.createUser = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;
    const role = normalizeRole(req.body.role);
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const requesterRole = req.user.role;
    const logoPath = buildAssetPath(req.file);

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Name, email, and password are required.' });
    }

    if (!ALL_ROLES.includes(role)) {
      return res.status(400).json({ success: false, message: 'Invalid role.' });
    }

    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      return res.status(409).json({ success: false, message: 'Email already in use.' });
    }

    let payload;

    if (requesterRole === ROLES.SUPER_ADMIN && role === ROLES.DISTRIBUTOR) {
      const distributorCode = normalizeString(req.body.distributorCode)?.toUpperCase();
      const address = normalizeString(req.body.address);
      const state = normalizeString(req.body.state);
      const district = normalizeString(req.body.district);
      const area = normalizeString(req.body.area);

      if (!distributorCode || !address || !state || !district || !area) {
        return res.status(400).json({
          success: false,
          message: 'Distributor code, address, state, district, and area are required for Distributor.',
        });
      }

      const codeExists = await User.findOne({ distributorCode });
      if (codeExists) {
        return res.status(409).json({ success: false, message: 'Distributor code already exists.' });
      }

      payload = {
        name: normalizeString(name),
        email: normalizedEmail,
        password,
        role,
        creator: req.user._id,
        address,
        state,
        district,
        area,
        distributorCode,
        gstNo: normalizeString(req.body.gstNo),
        panNo: normalizeString(req.body.panNo),
        aadharNo: normalizeString(req.body.aadharNo),
      };
    } else if (
      (requesterRole === ROLES.SUPER_ADMIN || requesterRole === ROLES.DISTRIBUTOR)
      && role === ROLES.ADMIN
    ) {
      const companyName = normalizeString(req.body.companyName);
      const selectedPlan = await getPlanForAdminCreation(req.body.planCode);
      if (!companyName) {
        return res.status(400).json({ success: false, message: 'Company Name is required for Admin.' });
      }
      if (!selectedPlan || !selectedPlan.isActive) {
        return res.status(400).json({ success: false, message: 'Please select a valid active plan for this Admin.' });
      }
      const selectedPlanAmounts = calculateTaxes(selectedPlan.basePrice, selectedPlan.taxes);

      payload = {
        name: normalizeString(name),
        email: normalizedEmail,
        password,
        role,
        companyName,
        logo: logoPath,
        gstNo: normalizeString(req.body.gstNo),
        panNo: normalizeString(req.body.panNo),
        aadharNo: normalizeString(req.body.aadharNo),
        creator: req.user._id,
        distributorOwner: requesterRole === ROLES.DISTRIBUTOR ? req.user._id : undefined,
        subscription: {
          planCode: selectedPlan.code,
          planLabel: selectedPlan.label,
          planSnapshot: {
            label: selectedPlan.label,
            months: selectedPlan.months,
            basePrice: selectedPlanAmounts.base,
            taxes: selectedPlan.taxes,
            amounts: selectedPlanAmounts,
          },
          status: 'pending_payment',
          createdBy: req.user._id,
        },
      };
    } else if (requesterRole === ROLES.ADMIN && ADMIN_STAFF_ROLES.includes(role)) {
      payload = {
        name: normalizeString(name),
        email: normalizedEmail,
        password,
        role,
        creator: req.user._id,
        adminOwner: req.user._id,
        distributorOwner: getDistributorOwnerId(req.user),
      };
    } else {
      return res.status(403).json({
        success: false,
        message: 'You are not allowed to create a user with that role.',
      });
    }

    const user = await User.create(payload);

    if (role === ROLES.ADMIN) {
      user.adminOwner = user._id;
      await user.save();
    }

    const plainUser = user.toJSON();
    plainUser.renewalNotice = buildRenewalNotice(user.subscription);

    res.status(201).json({ success: true, data: plainUser });
  } catch (err) {
    next(err);
  }
};
