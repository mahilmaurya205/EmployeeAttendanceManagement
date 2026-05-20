const jwt = require('jsonwebtoken');
const User = require('../models/User.model');
const Employee = require('../models/Employee.model');
const {
  ROLES,
  ATTENDANCE_MODIFY_ROLES,
  EMPLOYEE_MANAGEMENT_ROLES,
  REPORT_VIEW_ROLES,
} = require('../utils/access');

const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey123';

// Verify JWT token
const authenticate = async (req, res, next) => {
  try {
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({ success: false, message: 'Authentication required. No token provided.' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.id).populate('employee');

    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, message: 'User not found or deactivated.' });
    }

    // Legacy single-tenant data migration for the original seeded admin account.
    if (user.role === ROLES.ADMIN && user.email === 'admin@company.com') {
      await Promise.all([
        User.updateMany(
          { role: { $in: [ROLES.EMPLOYEE, ROLES.MANAGER, ROLES.HR, ROLES.SUPERVISOR] }, adminOwner: { $exists: false } },
          { $set: { adminOwner: user._id } }
        ),
        Employee.updateMany(
          { adminOwner: { $exists: false } },
          { $set: { adminOwner: user._id } }
        ),
      ]);
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ success: false, message: 'Invalid token.' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Token expired. Please login again.' });
    }
    next(error);
  }
};

// Role-based authorization
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Required role(s): ${roles.join(', ')}. Your role: ${req.user.role}`
      });
    }
    next();
  };
};

// Check if user can modify attendance
const canModifyAttendance = authorize(...ATTENDANCE_MODIFY_ROLES);

// Check if user can view reports
const canViewReports = authorize(...REPORT_VIEW_ROLES);

// Check if user can manage employees
const canManageEmployees = authorize(...EMPLOYEE_MANAGEMENT_ROLES);

module.exports = authenticate;
module.exports.authenticate = authenticate;
module.exports.authorize = authorize;
module.exports.canModifyAttendance = canModifyAttendance;
module.exports.canViewReports = canViewReports;
module.exports.canManageEmployees = canManageEmployees;
