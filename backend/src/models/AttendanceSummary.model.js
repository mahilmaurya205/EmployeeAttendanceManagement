const mongoose = require('mongoose');

const breakReviewSchema = new mongoose.Schema({
  status: {
    type: String,
    enum: ['Pending', 'Approved', 'Rejected'],
    default: 'Pending',
  },
  reason: String,
  note: String,
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  reviewedAt: Date,
}, { _id: false });

// Aggregated daily record per employee
const attendanceSummarySchema = new mongoose.Schema({
  employee: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: true,
  },
  date: {
    type: String, // YYYY-MM-DD
    required: true,
  },
  punchIn:   Date,
  punchOut:  Date,
  breaks: [{
    type: {
      type: String,
      enum: ['GENERAL', 'TEA', 'LUNCH'],
      default: 'GENERAL',
    },
    start: Date,
    end:   Date,
    duration: Number, // minutes
    allowedDuration: { type: Number, default: 0 },
    lateByMinutes: { type: Number, default: 0 },
  }],
  totalBreakMinutes: { type: Number, default: 0 },
  teaBreakMinutes: { type: Number, default: 0 },
  lunchBreakMinutes: { type: Number, default: 0 },
  teaBreakLateByMinutes: { type: Number, default: 0 },
  lunchBreakLateByMinutes: { type: Number, default: 0 },
  teaBreakReview: {
    type: breakReviewSchema,
    default: () => ({ status: 'Pending' }),
  },
  lunchBreakReview: {
    type: breakReviewSchema,
    default: () => ({ status: 'Pending' }),
  },
  totalWorkMinutes:  { type: Number, default: 0 },
  status: {
    type: String,
    enum: ['Present', 'Absent', 'Half Day', 'Leave', 'Holiday', 'Weekend'],
    default: 'Absent',
  },
  isLate:          { type: Boolean, default: false },
  lateByMinutes:   { type: Number, default: 0 },
  isEarlyLeave:    { type: Boolean, default: false },
  earlyLeaveByMinutes: { type: Number, default: 0 },
  // Overtime
  overtimeMinutes: { type: Number, default: 0 },
  // Remarks
  remarks: String,
}, { timestamps: true });

attendanceSummarySchema.index({ employee: 1, date: 1 }, { unique: true });
attendanceSummarySchema.index({ date: 1 });

module.exports = mongoose.model('AttendanceSummary', attendanceSummarySchema);
