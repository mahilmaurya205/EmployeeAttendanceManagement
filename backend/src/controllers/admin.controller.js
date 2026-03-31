const User = require('../models/User.model');
const Employee = require('../models/Employee.model');
const AttendanceLog = require('../models/AttendanceLog.model');
const AttendanceSummary = require('../models/AttendanceSummary.model');

const VALID_ROLES = ['Admin', 'Manager', 'HR', 'Supervisor', 'Employee'];

const normalizeRole = (role) => {
  if (!role) return role;
  const lowered = String(role).trim().toLowerCase();
  return VALID_ROLES.find((item) => item.toLowerCase() === lowered) || role;
};

exports.listUsers = async (req, res, next) => {
  try {
    const users = await User.find()
      .populate('employee', 'name employeeCode department')
      .sort({ createdAt: -1 });

    res.json({ success: true, data: users });
  } catch (err) {
    next(err);
  }
};

exports.updateUserRole = async (req, res, next) => {
  try {
    const role = normalizeRole(req.body.role);

    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({ success: false, message: 'Invalid role.' });
    }

    const existingUser = await User.findById(req.params.id);
    if (!existingUser) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    if (existingUser.role === 'Admin') {
      return res.status(400).json({ success: false, message: 'Admin role cannot be changed from this page.' });
    }

    if (existingUser.employee) {
      return res.status(400).json({ success: false, message: 'Employee-linked users always keep the Employee role.' });
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
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
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
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    if (user.role === 'Admin') {
      return res.status(400).json({ success: false, message: 'Admin users cannot be deleted from this page.' });
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

    const user = await User.findById(req.params.id).select('+password');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
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

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Name, email, and password are required.' });
    }

    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({ success: false, message: 'Invalid role.' });
    }

    const existing = await User.findOne({ email: String(email).trim().toLowerCase() });
    if (existing) {
      return res.status(409).json({ success: false, message: 'Email already in use.' });
    }

    const user = await User.create({
      name: String(name).trim(),
      email: String(email).trim().toLowerCase(),
      password,
      role,
    });

    res.status(201).json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
};
