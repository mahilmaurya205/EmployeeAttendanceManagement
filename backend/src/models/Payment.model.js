const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  admin: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  planCode: {
    type: String,
    enum: ['monthly', 'six_month', 'yearly'],
    required: true,
  },
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
    taxAmounts: {
      gst: Number,
      cgst: Number,
      sgst: Number,
      igst: Number,
    },
    total: Number,
  },
  amount: {
    type: Number,
    required: true,
  },
  currency: {
    type: String,
    default: 'INR',
  },
  status: {
    type: String,
    enum: ['created', 'paid', 'failed'],
    default: 'created',
  },
  purpose: {
    type: String,
    enum: ['initial', 'renewal'],
    default: 'renewal',
  },
  receiptNumber: {
    type: String,
    trim: true,
    index: true,
  },
  razorpayOrderId: {
    type: String,
    required: true,
    index: true,
  },
  razorpayPaymentId: String,
  razorpaySignature: String,
  paidAt: Date,
  subscriptionStartDate: Date,
  subscriptionEndDate: Date,
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  rawPayload: mongoose.Schema.Types.Mixed,
}, { timestamps: true });

module.exports = mongoose.model('Payment', paymentSchema);
