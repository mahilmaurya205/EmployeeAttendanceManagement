const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
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
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: 6,
    select: false,
  },
  role: {
    type: String,
    enum: ['SuperAdmin', 'Distributor', 'Admin', 'Manager', 'HR', 'Supervisor', 'Employee'],
    default: 'Employee',
  },
  companyName: {
    type: String,
    trim: true,
  },
  logo: {
    type: String,
    trim: true,
  },
  gstNo: {
    type: String,
    trim: true,
    uppercase: true,
  },
  panNo: {
    type: String,
    trim: true,
    uppercase: true,
  },
  aadharNo: {
    type: String,
    trim: true,
  },
  distributorCode: {
    type: String,
    trim: true,
    uppercase: true,
    sparse: true,
  },
  address: {
    type: String,
    trim: true,
  },
  state: {
    type: String,
    trim: true,
  },
  district: {
    type: String,
    trim: true,
  },
  area: {
    type: String,
    trim: true,
  },
  creator: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  adminOwner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  distributorOwner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  officeLocation: {
    latitude: Number,
    longitude: Number,
    radius: {
      type: Number,
      default: 100,
    },
  },
  attendancePolicy: {
    halfDayLateAfterMinutes: {
      type: Number,
      default: 30,
    },
  },
  payrollPolicy: {
    salarySlipGenerationDay: {
      type: Number,
      default: 1,
    },
    components: {
      basicPay: { type: Number, default: 100 },
      hra: { type: Number, default: 40 },
      medical: { type: Number, default: 10 },
      standardAllowance: { type: Number, default: 15 },
      conveyanceAllowance: { type: Number, default: 10 },
      nightAllowance: { type: Number, default: 0 },
      ltc: { type: Number, default: 0 },
      otherIncome: { type: Number, default: 0 },
    },
  },
  subscription: {
    planCode: {
      type: String,
      enum: ['monthly', 'six_month', 'yearly'],
    },
    planLabel: String,
    planSnapshot: {
      label: String,
      months: Number,
      basePrice: Number,
      taxes: {
        gst: Number,
        cgst: Number,
        sgst: Number,
        igst: Number,
      },
      amounts: {
        base: Number,
        gst: Number,
        cgst: Number,
        sgst: Number,
        igst: Number,
        total: Number,
      },
    },
    startDate: Date,
    endDate: Date,
    status: {
      type: String,
      enum: ['active', 'expired', 'none', 'pending_payment'],
      default: 'none',
    },
    lastPayment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Payment',
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  employee: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  lastLogin: Date,
}, { timestamps: true });

userSchema.index({ distributorCode: 1 }, { unique: true, sparse: true });

// Hash password before save
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

module.exports = mongoose.model('User', userSchema);
