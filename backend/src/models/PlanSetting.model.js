const mongoose = require('mongoose');

const planSchema = new mongoose.Schema({
  code: {
    type: String,
    enum: ['monthly', 'six_month', 'yearly'],
    required: true,
  },
  label: {
    type: String,
    required: true,
  },
  months: {
    type: Number,
    required: true,
  },
  basePrice: {
    type: Number,
    default: 0,
    min: 0,
  },
  taxes: {
    gst: { type: Number, default: 0, min: 0 },
    cgst: { type: Number, default: 0, min: 0 },
    sgst: { type: Number, default: 0, min: 0 },
    igst: { type: Number, default: 0, min: 0 },
  },
  isActive: {
    type: Boolean,
    default: true,
  },
}, { timestamps: true });

planSchema.index({ code: 1 }, { unique: true });

module.exports = mongoose.model('PlanSetting', planSchema);
