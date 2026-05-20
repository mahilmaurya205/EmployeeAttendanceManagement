const crypto = require('crypto');
const PlanSetting = require('../models/PlanSetting.model');
const Payment = require('../models/Payment.model');
const User = require('../models/User.model');
const { ROLES } = require('../utils/access');
const {
  PLAN_DEFINITIONS,
  PLAN_CODES,
  calculateTaxes,
  calculatePlanEnd,
  calculateRenewalStart,
  startOfDay,
  moneyToPaise,
  buildRenewalNotice,
} = require('../utils/subscription.utils');

const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || '';
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || '';
const RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || '';

const ensurePlans = async () => {
  const plans = [];
  for (const code of PLAN_CODES) {
    const definition = PLAN_DEFINITIONS[code];
    const plan = await PlanSetting.findOneAndUpdate(
      { code },
      {
        $setOnInsert: {
          code,
          label: definition.label,
          months: definition.months,
          basePrice: 0,
          taxes: { gst: 0, cgst: 0, sgst: 0, igst: 0 },
          isActive: true,
        },
      },
      { new: true, upsert: true }
    );
    plans.push(plan);
  }
  return plans.sort((a, b) => PLAN_CODES.indexOf(a.code) - PLAN_CODES.indexOf(b.code));
};

const serializePlan = (plan) => {
  const amounts = calculateTaxes(plan.basePrice, plan.taxes);
  return {
    _id: plan._id,
    code: plan.code,
    label: plan.label,
    months: plan.months,
    basePrice: plan.basePrice,
    taxes: plan.taxes,
    amounts,
    isActive: plan.isActive,
  };
};

const findActivePlan = async (code) => {
  if (!PLAN_CODES.includes(code)) return null;
  await ensurePlans();
  return PlanSetting.findOne({ code, isActive: true });
};

const planFromPendingSubscription = (subscription) => {
  if (!subscription?.planCode || !subscription?.planSnapshot) return null;
  return {
    code: subscription.planCode,
    label: subscription.planSnapshot.label || subscription.planLabel,
    months: subscription.planSnapshot.months || PLAN_DEFINITIONS[subscription.planCode]?.months,
    basePrice: subscription.planSnapshot.basePrice,
    taxes: subscription.planSnapshot.taxes || {},
  };
};

const createRazorpayOrder = async ({ amount, receipt, notes }) => {
  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
    throw new Error('Razorpay key id and key secret are not configured.');
  }

  const auth = Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString('base64');
  const response = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      amount: moneyToPaise(amount),
      currency: 'INR',
      receipt,
      notes,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.description || 'Unable to create Razorpay order.');
  }
  return data;
};

const verifyPaymentSignature = ({ orderId, paymentId, signature }) => {
  if (!RAZORPAY_KEY_SECRET) return false;
  const expected = crypto
    .createHmac('sha256', RAZORPAY_KEY_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
  return expected === signature;
};

const buildReceiptNumber = (payment) => {
  const date = new Date();
  const year = date.getFullYear();
  return `AIQ-${year}-${String(payment._id).slice(-8).toUpperCase()}`;
};

const serializePayment = (payment) => {
  const plain = payment.toJSON ? payment.toJSON() : payment;
  const admin = plain.admin || {};
  return {
    ...plain,
    companyName: admin.companyName,
    adminName: admin.name,
    adminEmail: admin.email,
  };
};

const canViewPayment = (requestUser, payment) => {
  const admin = payment.admin;
  if (!admin) return false;
  if (requestUser.role === ROLES.SUPER_ADMIN) return true;
  if (requestUser.role === ROLES.ADMIN) return String(admin._id || admin) === String(requestUser._id);
  if (requestUser.role === ROLES.DISTRIBUTOR) return String(admin.distributorOwner || '') === String(requestUser._id);
  return false;
};

const applyPaymentToAdmin = async (payment, payload = {}) => {
  const admin = await User.findById(payment.admin);
  if (!admin || admin.role !== ROLES.ADMIN) {
    throw new Error('Admin account not found for this payment.');
  }

  if (payment.status === 'paid') return admin;

  const isInitialPayment = admin.subscription?.status === 'pending_payment' || payment.purpose === 'initial';
  const startDate = isInitialPayment ? startOfDay() : calculateRenewalStart(admin.subscription?.endDate);
  const endDate = calculatePlanEnd(startDate, payment.planCode);

  payment.status = 'paid';
  payment.razorpayPaymentId = payload.razorpay_payment_id || payment.razorpayPaymentId;
  payment.razorpaySignature = payload.razorpay_signature || payment.razorpaySignature;
  payment.paidAt = new Date();
  payment.receiptNumber = payment.receiptNumber || buildReceiptNumber(payment);
  payment.subscriptionStartDate = startDate;
  payment.subscriptionEndDate = endDate;
  payment.rawPayload = payload;
  await payment.save();

  admin.subscription = {
    planCode: payment.planCode,
    planLabel: payment.planSnapshot.label,
    startDate,
    endDate,
    status: 'active',
    lastPayment: payment._id,
    createdBy: admin.subscription?.createdBy,
  };
  await admin.save();
  return admin;
};

const createPlanPaymentOrder = async ({ admin, plan, purpose }) => {
  const amounts = calculateTaxes(plan.basePrice, plan.taxes);
  if (amounts.total <= 0) {
    throw new Error('Selected plan price is not configured yet.');
  }

  const payment = await Payment.create({
    admin: admin._id,
    planCode: plan.code,
    purpose,
    createdBy: admin.subscription?.createdBy,
    planSnapshot: {
      label: plan.label,
      months: plan.months,
      basePrice: amounts.base,
      taxes: plan.taxes,
      taxAmounts: {
        gst: amounts.gst,
        cgst: amounts.cgst,
        sgst: amounts.sgst,
        igst: amounts.igst,
      },
      total: amounts.total,
    },
    amount: amounts.total,
    status: 'created',
    razorpayOrderId: `pending_${Date.now()}`,
  });

  const order = await createRazorpayOrder({
    amount: amounts.total,
    receipt: `${purpose}_${String(payment._id).slice(-16)}`,
    notes: {
      paymentId: String(payment._id),
      adminId: String(admin._id),
      planCode: plan.code,
      purpose,
    },
  });

  payment.razorpayOrderId = order.id;
  await payment.save();

  return { payment, order, amounts };
};

exports.listPlans = async (req, res, next) => {
  try {
    const plans = await ensurePlans();
    res.json({ success: true, data: plans.map(serializePlan), keyId: RAZORPAY_KEY_ID });
  } catch (err) {
    next(err);
  }
};

exports.updatePlans = async (req, res, next) => {
  try {
    const updates = Array.isArray(req.body.plans) ? req.body.plans : [];
    const validCodes = new Set(PLAN_CODES);

    for (const item of updates) {
      if (!validCodes.has(item.code)) {
        return res.status(400).json({ success: false, message: 'Invalid plan code.' });
      }

      const definition = PLAN_DEFINITIONS[item.code];
      const basePrice = Number(item.basePrice);
      if (!Number.isFinite(basePrice) || basePrice < 0) {
        return res.status(400).json({ success: false, message: 'Plan price must be zero or greater.' });
      }

      const taxes = {
        gst: Number(item.taxes?.gst || 0),
        cgst: Number(item.taxes?.cgst || 0),
        sgst: Number(item.taxes?.sgst || 0),
        igst: Number(item.taxes?.igst || 0),
      };

      if (Object.values(taxes).some((value) => !Number.isFinite(value) || value < 0)) {
        return res.status(400).json({ success: false, message: 'Tax percentages must be zero or greater.' });
      }

      await PlanSetting.findOneAndUpdate(
        { code: item.code },
        {
          code: item.code,
          label: definition.label,
          months: definition.months,
          basePrice,
          taxes,
          isActive: item.isActive !== false,
        },
        { upsert: true, new: true }
      );
    }

    const plans = await ensurePlans();
    res.json({ success: true, message: 'Plans updated successfully.', data: plans.map(serializePlan) });
  } catch (err) {
    next(err);
  }
};

exports.createRenewalOrder = async (req, res, next) => {
  try {
    if (req.user.role !== ROLES.ADMIN) {
      return res.status(403).json({ success: false, message: 'Only Admin can renew a plan.' });
    }

    const isInitialPayment = req.user.subscription?.status === 'pending_payment';
    const pendingPlanCode = isInitialPayment ? req.user.subscription?.planCode : null;
    const planCode = pendingPlanCode || req.body.planCode;
    const purpose = pendingPlanCode ? 'initial' : 'renewal';
    const plan = isInitialPayment ? planFromPendingSubscription(req.user.subscription) : await findActivePlan(planCode);
    if (!plan) {
      return res.status(400).json({ success: false, message: 'Please select a valid active plan.' });
    }

    const { payment, order } = await createPlanPaymentOrder({ admin: req.user, plan, purpose });

    res.status(201).json({
      success: true,
      keyId: RAZORPAY_KEY_ID,
      order,
      paymentId: payment._id,
      plan: serializePlan(plan),
      purpose,
    });
  } catch (err) {
    next(err);
  }
};

exports.listPayments = async (req, res, next) => {
  try {
    let filter = {};
    if (req.user.role === ROLES.ADMIN) {
      filter.admin = req.user._id;
    } else if (req.user.role === ROLES.DISTRIBUTOR) {
      const admins = await User.find({ role: ROLES.ADMIN, distributorOwner: req.user._id }).select('_id');
      filter.admin = { $in: admins.map((admin) => admin._id) };
    } else if (req.user.role !== ROLES.SUPER_ADMIN) {
      return res.status(403).json({ success: false, message: 'You cannot view payments.' });
    }

    const payments = await Payment.find(filter)
      .populate('admin', 'name email companyName distributorOwner')
      .sort({ createdAt: -1 });

    res.json({ success: true, data: payments.map(serializePayment) });
  } catch (err) {
    next(err);
  }
};

exports.getReceipt = async (req, res, next) => {
  try {
    const payment = await Payment.findById(req.params.id)
      .populate('admin', 'name email companyName gstNo panNo')
      .populate('createdBy', 'name email role');

    if (!payment || !canViewPayment(req.user, payment)) {
      return res.status(404).json({ success: false, message: 'Receipt not found.' });
    }

    res.json({
      success: true,
      data: {
        receiptNumber: payment.receiptNumber || (payment.status === 'paid' ? buildReceiptNumber(payment) : null),
        payment: serializePayment(payment),
        issuedTo: payment.admin,
        issuedBy: payment.createdBy || { name: 'SuperAdmin', role: ROLES.SUPER_ADMIN },
      },
    });
  } catch (err) {
    next(err);
  }
};

exports.verifyRenewalPayment = async (req, res, next) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ success: false, message: 'Payment verification details are required.' });
    }

    if (!verifyPaymentSignature({ orderId: razorpay_order_id, paymentId: razorpay_payment_id, signature: razorpay_signature })) {
      return res.status(400).json({ success: false, message: 'Invalid Razorpay payment signature.' });
    }

    const payment = await Payment.findOne({ razorpayOrderId: razorpay_order_id, admin: req.user._id });
    if (!payment) {
      return res.status(404).json({ success: false, message: 'Payment order not found.' });
    }

    const admin = await applyPaymentToAdmin(payment, req.body);
    const plain = admin.toJSON();
    plain.renewalNotice = buildRenewalNotice(admin.subscription);

    res.json({
      success: true,
      message: 'Plan renewed successfully.',
      user: plain,
      payment,
    });
  } catch (err) {
    next(err);
  }
};

exports.handleWebhook = async (req, res, next) => {
  try {
    if (!RAZORPAY_WEBHOOK_SECRET) {
      return res.status(200).json({ success: true, message: 'Webhook secret is not configured.' });
    }

    const signature = req.headers['x-razorpay-signature'];
    const expected = crypto
      .createHmac('sha256', RAZORPAY_WEBHOOK_SECRET)
      .update(req.body)
      .digest('hex');

    if (signature !== expected) {
      return res.status(400).json({ success: false, message: 'Invalid webhook signature.' });
    }

    const event = JSON.parse(req.body.toString('utf8'));
    if (event.event === 'payment.captured') {
      const paymentEntity = event.payload?.payment?.entity;
      const orderId = paymentEntity?.order_id;
      if (orderId) {
        const payment = await Payment.findOne({ razorpayOrderId: orderId });
        if (payment) {
          await applyPaymentToAdmin(payment, {
            webhookEvent: event.event,
            razorpay_order_id: orderId,
            razorpay_payment_id: paymentEntity.id,
          });
        }
      }
    }

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};
