const mongoose = require('mongoose');

const leaveTypeSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    trim: true,
    uppercase: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  annualQuota: {
    type: Number,
    required: true,
    min: 0,
    default: 0,
  },
  isPaid: {
    type: Boolean,
    default: true,
  },
  requiresApproval: {
    type: Boolean,
    default: true,
  },
  allowCarryForward: {
    type: Boolean,
    default: false,
  },
  enabled: {
    type: Boolean,
    default: true,
  },
}, { _id: false });

const leavePolicySchema = new mongoose.Schema({
  adminOwner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
  },
  distributorOwner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  leaveTypes: {
    type: [leaveTypeSchema],
    default: [],
  },
}, { timestamps: true });

leavePolicySchema.index({ adminOwner: 1 }, { unique: true });

module.exports = mongoose.model('LeavePolicy', leavePolicySchema);
