const mongoose = require('mongoose');

const locationSchema = new mongoose.Schema({
  latitude:  { type: Number, required: true },
  longitude: { type: Number, required: true },
  accuracy:  Number,
  address:   String,
  isOfficeLocation: { type: Boolean, default: false },
  distanceFromOffice: Number, // in meters
}, { _id: false });

const attendanceLogSchema = new mongoose.Schema({
  employee: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: true,
  },
  date: {
    type: String, // YYYY-MM-DD format for easy querying
    required: true,
  },
  action: {
    type: String,
    enum: ['PUNCH_IN', 'PUNCH_OUT', 'BREAK_START', 'BREAK_END'],
    required: true,
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
  location: {
    type: locationSchema,
    required: true,
  },
  // Face recognition
  faceVerified: {
    type: Boolean,
    default: false,
  },
  faceMatchScore: {
    type: Number, // 0 to 1
    min: 0,
    max: 1,
  },
  snapshotPath: String, // captured image at time of action

  // For IT Hardware employees outside office
  outsideReason: String,

  // Manual override by admin
  isManualEntry: { type: Boolean, default: false },
  manualEntryBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  manualEntryNote: String,

  // Status
  status: {
    type: String,
    enum: ['SUCCESS', 'FAILED', 'PENDING'],
    default: 'SUCCESS',
  },
  failReason: String,

  // IP address
  ipAddress: String,
}, { timestamps: true });

// Compound index for employee + date queries
attendanceLogSchema.index({ employee: 1, date: 1 });
attendanceLogSchema.index({ date: 1 });
attendanceLogSchema.index({ action: 1 });

module.exports = mongoose.model('AttendanceLog', attendanceLogSchema);