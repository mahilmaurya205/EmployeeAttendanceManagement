const jwt = require('jsonwebtoken');
const User = require('../models/User.model');
const { ROLES, getAdminOwnerId } = require('../utils/access');
const { buildRenewalNotice } = require('../utils/subscription.utils');

const generateToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET || 'supersecretkey123', {
    expiresIn: process.env.JWT_EXPIRE || '7d',
  });
};

const enrichUser = async (user) => {
  if (!user) return null;
  const plain = user.toJSON();

  const adminOwnerId = getAdminOwnerId(user);
  let adminOwner = null;

  if (user.role === ROLES.ADMIN) {
    adminOwner = user;
  } else if (adminOwnerId) {
    adminOwner = await User.findById(adminOwnerId).select('name companyName officeLocation attendancePolicy payrollPolicy subscription');
  }

  plain.resolvedOfficeLocation = adminOwner?.officeLocation || null;
  plain.adminCompanyName = adminOwner?.companyName || null;
  plain.adminName = adminOwner?.name || null;
  plain.resolvedAttendancePolicy = adminOwner?.attendancePolicy || null;
  plain.resolvedPayrollPolicy = adminOwner?.payrollPolicy || null;
  plain.renewalNotice = buildRenewalNotice(user.role === ROLES.ADMIN ? user.subscription : adminOwner?.subscription);
  plain.paymentRequired = user.role === ROLES.ADMIN && user.subscription?.status === 'pending_payment';

  return plain;
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    // Find user with password field (normally excluded)
    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }
    if (!user.isActive) {
      return res.status(403).json({ success: false, message: 'Your account has been deactivated. Please contact Admin.' });
    }

    // Compare password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    // Generate token
    const token = generateToken(user._id);

    // Update lastLogin
    user.lastLogin = new Date();
    await user.save();
    const enrichedUser = await enrichUser(user);

    // Return response
    res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      user: enrichedUser,
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, message: 'Login failed', error: err.message });
  }
};

exports.me = async (req, res) => {
  try {
    const user = req.user; // Already loaded by auth middleware
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const enrichedUser = await enrichUser(user);

    res.status(200).json({
      success: true,
      user: enrichedUser,
    });
  } catch (err) {
    console.error('Me error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch user', error: err.message });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (req.body.name) user.name = String(req.body.name).trim();

    if (user.role === ROLES.ADMIN && req.body.officeLocation) {
      const { latitude, longitude, radius } = req.body.officeLocation;
      const lat = Number(latitude);
      const lng = Number(longitude);
      const rad = Number(radius);

      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return res.status(400).json({ success: false, message: 'Valid latitude and longitude are required.' });
      }

      if (!Number.isFinite(rad) || rad <= 0) {
        return res.status(400).json({ success: false, message: 'Valid radius is required.' });
      }

      user.officeLocation = {
        latitude: lat,
        longitude: lng,
        radius: rad,
      };
    }

    if (user.role === ROLES.ADMIN && req.body.attendancePolicy) {
      const currentPolicy = user.attendancePolicy || {};
      const halfDayLateAfterMinutes = Number(req.body.attendancePolicy.halfDayLateAfterMinutes ?? currentPolicy.halfDayLateAfterMinutes ?? 30);
      const teaBreakMinutes = Number(req.body.attendancePolicy.teaBreakMinutes ?? currentPolicy.teaBreakMinutes ?? 15);
      const lunchBreakMinutes = Number(req.body.attendancePolicy.lunchBreakMinutes ?? currentPolicy.lunchBreakMinutes ?? 40);

      if (!Number.isFinite(halfDayLateAfterMinutes) || halfDayLateAfterMinutes < 0) {
        return res.status(400).json({ success: false, message: 'Valid half day late minutes are required.' });
      }

      if (!Number.isFinite(teaBreakMinutes) || teaBreakMinutes < 0) {
        return res.status(400).json({ success: false, message: 'Valid tea break minutes are required.' });
      }

      if (!Number.isFinite(lunchBreakMinutes) || lunchBreakMinutes < 0) {
        return res.status(400).json({ success: false, message: 'Valid lunch break minutes are required.' });
      }

      user.attendancePolicy = {
        ...(user.attendancePolicy || {}),
        halfDayLateAfterMinutes,
        teaBreakMinutes,
        lunchBreakMinutes,
      };
    }

    if (user.role === ROLES.ADMIN && req.body.payrollPolicy) {
      const salarySlipGenerationDay = Number(req.body.payrollPolicy.salarySlipGenerationDay);
      const nextComponents = req.body.payrollPolicy.components || {};

      if (!Number.isFinite(salarySlipGenerationDay) || salarySlipGenerationDay < 1 || salarySlipGenerationDay > 31) {
        return res.status(400).json({ success: false, message: 'Salary slip generation day must be between 1 and 31.' });
      }

      const currentComponents = user.payrollPolicy?.components || {};
      const normalizedComponents = {};
      ['basicPay', 'hra', 'medical', 'standardAllowance', 'conveyanceAllowance', 'nightAllowance', 'ltc', 'otherIncome']
        .forEach((key) => {
          const value = Number(nextComponents[key] ?? currentComponents[key] ?? 0);
          if (!Number.isFinite(value) || value < 0) {
            throw new Error(`Invalid payroll percentage for ${key}.`);
          }
          normalizedComponents[key] = value;
        });

      user.payrollPolicy = {
        salarySlipGenerationDay,
        components: normalizedComponents,
      };
    }

    await user.save();
    const enrichedUser = await enrichUser(user);

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      user: enrichedUser,
    });
  } catch (err) {
    console.error('Update profile error:', err);
    res.status(500).json({ success: false, message: 'Failed to update profile', error: err.message });
  }
};

exports.changePassword = async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'Old and new passwords are required' });
    }

    const user = await User.findById(req.user._id).select('+password');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Verify old password
    const isPasswordValid = await user.comparePassword(oldPassword);
    if (!isPasswordValid) {
      return res.status(401).json({ success: false, message: 'Old password is incorrect' });
    }

    // Update password
    user.password = newPassword;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Password changed successfully',
    });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ success: false, message: 'Failed to change password', error: err.message });
  }
};

exports.logout = async (req, res) => {
  try {
    // Logout is mostly client-side (clear token)
    // But we can update lastLogout if needed
    const user = await User.findById(req.user._id);
    if (user) {
      user.lastLogout = new Date();
      await user.save();
    }

    res.status(200).json({
      success: true,
      message: 'Logout successful',
    });
  } catch (err) {
    console.error('Logout error:', err);
    res.status(500).json({ success: false, message: 'Logout failed', error: err.message });
  }
};
