const mongoose = require('mongoose');

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
    start: Date,
    end:   Date,
    duration: Number, // minutes
  }],
  totalBreakMinutes: { type: Number, default: 0 },
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