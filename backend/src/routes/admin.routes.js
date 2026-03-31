const express = require('express');
const router = express.Router();
const User = require('../models/User.model');
const { authenticate, authorize } = require('../middleware/auth.middleware');

// GET /api/admin/users
router.get('/users', authenticate, authorize('Admin'), async (req, res, next) => {
  try {
    const users = await User.find().populate('employee', 'name employeeCode department').sort({ createdAt: -1 });
    res.json({ success: true, data: users });
  } catch (err) { next(err); }
});

// PUT /api/admin/users/:id/role
router.put('/users/:id/role', authenticate, authorize('Admin'), async (req, res, next) => {
  try {
    const { role } = req.body;
    const validRoles = ['Admin', 'Manager', 'HR', 'Supervisor', 'Employee'];
    if (!validRoles.includes(role)) return res.status(400).json({ success: false, message: 'Invalid role.' });

    const user = await User.findByIdAndUpdate(req.params.id, { role }, { new: true });
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

    res.json({ success: true, message: 'Role updated.', data: user });
  } catch (err) { next(err); }
});

// PUT /api/admin/users/:id/toggle-active
router.put('/users/:id/toggle-active', authenticate, authorize('Admin'), async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
    user.isActive = !user.isActive;
    await user.save();
    res.json({ success: true, message: `User ${user.isActive ? 'activated' : 'deactivated'}.` });
  } catch (err) { next(err); }
});

// POST /api/admin/users - Create non-employee user (HR, Manager, etc.)
router.post('/users', authenticate, authorize('Admin'), async (req, res, next) => {
  try {
    const { name, email, password, role } = req.body;
    const existing = await User.findOne({ email });
    if (existing) return res.status(409).json({ success: false, message: 'Email already in use.' });

    const user = await User.create({ name, email, password, role });
    res.status(201).json({ success: true, data: user });
  } catch (err) { next(err); }
});

module.exports = router;