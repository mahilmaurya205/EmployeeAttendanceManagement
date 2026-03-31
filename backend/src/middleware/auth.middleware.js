const jwt = require('jsonwebtoken');
const User = require('../models/User.model');

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

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).populate('employee');

    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, message: 'User not found or deactivated.' });
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

// Check if user can modify attendance (Admin, Manager only)
const canModifyAttendance = authorize('Admin', 'Manager');

// Check if user can view reports (Admin, Manager, HR, Supervisor)
const canViewReports = authorize('Admin', 'Manager', 'HR', 'Supervisor');

// Check if user can manage employees (Admin, Manager)
const canManageEmployees = authorize('Admin', 'Manager');

module.exports = authenticate;
module.exports.authenticate = authenticate;
module.exports.authorize = authorize;
module.exports.canModifyAttendance = canModifyAttendance;
module.exports.canViewReports = canViewReports;
module.exports.canManageEmployees = canManageEmployees;