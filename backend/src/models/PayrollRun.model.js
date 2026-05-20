const mongoose = require('mongoose');

const payrollComponentSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  percentage: {
    type: Number,
    required: true,
    min: 0,
  },
  monthlyAmount: {
    type: Number,
    required: true,
    min: 0,
  },
  payableAmount: {
    type: Number,
    required: true,
    min: 0,
  },
}, { _id: false });

const payrollRunSchema = new mongoose.Schema({
  adminOwner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  distributorOwner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  employee: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: true,
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  month: {
    type: String,
    required: true,
    match: [/^\d{4}-\d{2}$/, 'Month must be in YYYY-MM format'],
  },
  totalSalaryDays: {
    type: Number,
    required: true,
    min: 0,
  },
  totalLeaveDays: {
    type: Number,
    required: true,
    min: 0,
  },
  paidLeaveDays: {
    type: Number,
    required: true,
    min: 0,
  },
  unpaidLeaveDays: {
    type: Number,
    required: true,
    min: 0,
  },
  basicSalary: {
    type: Number,
    required: true,
    min: 0,
  },
  components: {
    type: [payrollComponentSchema],
    default: [],
  },
  grossPay: {
    type: Number,
    required: true,
    min: 0,
  },
  netPay: {
    type: Number,
    required: true,
    min: 0,
  },
  generatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  generatedAt: {
    type: Date,
    default: Date.now,
  },
}, { timestamps: true });

payrollRunSchema.index({ adminOwner: 1, month: 1 });
payrollRunSchema.index({ employee: 1, month: 1 }, { unique: true });

module.exports = mongoose.model('PayrollRun', payrollRunSchema);
