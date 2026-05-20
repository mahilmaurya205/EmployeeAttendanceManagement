const mongoose = require('mongoose');

const leaveRequestSchema = new mongoose.Schema({
  employee: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: true,
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  adminOwner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  distributorOwner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  leaveTypeCode: {
    type: String,
    required: true,
    trim: true,
    uppercase: true,
  },
  leaveTypeName: {
    type: String,
    required: true,
    trim: true,
  },
  startDate: {
    type: Date,
    required: true,
  },
  endDate: {
    type: Date,
    required: true,
  },
  totalDays: {
    type: Number,
    required: true,
    min: 0.5,
  },
  unit: {
    type: String,
    enum: ['full', 'half'],
    default: 'full',
  },
  halfDaySession: {
    type: String,
    enum: ['First Half', 'Second Half', null],
    default: null,
  },
  reason: {
    type: String,
    trim: true,
  },
  status: {
    type: String,
    enum: ['Pending', 'Approved', 'Rejected', 'Cancelled'],
    default: 'Pending',
  },
  quotaLimitAtRequest: {
    type: Number,
    default: 0,
  },
  quotaUsedBeforeRequest: {
    type: Number,
    default: 0,
  },
  exceedsQuota: {
    type: Boolean,
    default: false,
  },
  adminComment: {
    type: String,
    trim: true,
  },
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  reviewedAt: Date,
}, { timestamps: true });

leaveRequestSchema.index({ adminOwner: 1, startDate: 1, endDate: 1 });
leaveRequestSchema.index({ employee: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('LeaveRequest', leaveRequestSchema);
