const mongoose = require('mongoose');

const faceDescriptorSchema = new mongoose.Schema({
  angle: {
    type: String,
    enum: ['front', 'left', 'right', 'up', 'down'],
    required: true,
  },
  descriptor: {
    type: [Number], // Float32Array serialized as number array
    required: true,
  },
  imagePath: String,
  capturedAt: { type: Date, default: Date.now },
}, { _id: false });

const employeeSchema = new mongoose.Schema({
  employeeCode: {
    type: String,
    required: [true, 'Employee code is required'],
    unique: true,
    uppercase: true,
    trim: true,
  },
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
  },
  mobile: {
    type: String,
    required: [true, 'Mobile number is required'],
    match: [/^[6-9]\d{9}$/, 'Please enter a valid Indian mobile number'],
  },
  department: {
    type: String,
    enum: ['IT Hardware', 'IT Software'],
    required: [true, 'Department is required'],
  },
  designation: {
    type: String,
    trim: true,
  },
  address: {
    street: String,
    city: String,
    state: String,
    pincode: String,
    country: { type: String, default: 'India' },
  },
  aadharNo: {
    type: String,
    required: [true, 'Aadhar number is required'],
    match: [/^\d{12}$/, 'Aadhar number must be 12 digits'],
  },
  panNo: {
    type: String,
    required: [true, 'PAN number is required'],
    match: [/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/, 'Invalid PAN format'],
    uppercase: true,
  },
  // Profile photo (primary)
  photo: {
    type: String, // file path
  },
  // Face recognition data (multiple angles)
  faceDescriptors: [faceDescriptorSchema],
  faceEnrolled: {
    type: Boolean,
    default: false,
  },
  // Work schedule
  workSchedule: {
    shiftStart: { type: String, default: '09:00' },
    shiftEnd: { type: String, default: '18:00' },
    workDays: { type: [Number], default: [1, 2, 3, 4, 5] }, // Mon-Fri
  },
  // Manager / Supervisor reference
  reportingTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  joiningDate: {
    type: Date,
    default: Date.now,
  },
}, { timestamps: true });

// Index for fast lookups
employeeSchema.index({ employeeCode: 1 });
employeeSchema.index({ department: 1 });
employeeSchema.index({ email: 1 });

module.exports = mongoose.model('Employee', employeeSchema);