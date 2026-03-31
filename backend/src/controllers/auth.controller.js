const jwt = require('jsonwebtoken');
const User = require('../models/User.model');

const generateToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET || 'supersecretkey123', {
    expiresIn: process.env.JWT_EXPIRE || '7d',
  });
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

    // Return response
    res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      user: user.toJSON(),
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

    res.status(200).json({
      success: true,
      user: user.toJSON(),
    });
  } catch (err) {
    console.error('Me error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch user', error: err.message });
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
