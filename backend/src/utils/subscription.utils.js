const PLAN_DEFINITIONS = {
  monthly: { code: 'monthly', label: 'Monthly', months: 1 },
  six_month: { code: 'six_month', label: '6 Months', months: 6 },
  yearly: { code: 'yearly', label: 'Yearly', months: 12 },
};

const PLAN_CODES = Object.keys(PLAN_DEFINITIONS);

const startOfDay = (value = new Date()) => {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
};

const addMonths = (date, months) => {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
};

const addDays = (date, days) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const calculatePlanEnd = (startDate, planCode) => addDays(addMonths(startOfDay(startDate), PLAN_DEFINITIONS[planCode].months), -1);

const calculateRenewalStart = (currentEndDate) => {
  const today = startOfDay();
  if (!currentEndDate) return today;
  const currentEnd = startOfDay(currentEndDate);
  return currentEnd >= today ? addDays(currentEnd, 1) : today;
};

const daysUntil = (date) => {
  if (!date) return null;
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.ceil((startOfDay(date).getTime() - startOfDay().getTime()) / msPerDay);
};

const buildRenewalNotice = (subscription) => {
  if (!subscription?.endDate) return null;
  const remainingDays = daysUntil(subscription.endDate);
  if (remainingDays == null || remainingDays > 15) return null;

  if (remainingDays < 0) {
    return {
      type: 'expired',
      remainingDays,
      message: 'Your plan has expired. Please renew to continue your subscription.',
    };
  }

  return {
    type: remainingDays === 0 ? 'expires_today' : 'renewal_due',
    remainingDays,
    message: remainingDays === 0
      ? 'Your plan expires today. Please renew your subscription.'
      : `Your plan expires in ${remainingDays} day${remainingDays === 1 ? '' : 's'}. Please renew your subscription.`,
  };
};

const moneyToPaise = (value) => Math.round(Number(value || 0) * 100);

const paiseToMoney = (value) => Number((Number(value || 0) / 100).toFixed(2));

const calculateTaxes = (basePrice, taxRates = {}) => {
  const base = Number(basePrice || 0);
  const gstRate = Number(taxRates.gst || 0);
  const cgstRate = Number(taxRates.cgst || 0);
  const sgstRate = Number(taxRates.sgst || 0);
  const igstRate = Number(taxRates.igst || 0);
  const gst = Number((base * gstRate / 100).toFixed(2));
  const cgst = Number((base * cgstRate / 100).toFixed(2));
  const sgst = Number((base * sgstRate / 100).toFixed(2));
  const igst = Number((base * igstRate / 100).toFixed(2));
  const total = Number((base + gst + cgst + sgst + igst).toFixed(2));

  return { base, gst, cgst, sgst, igst, total };
};

module.exports = {
  PLAN_DEFINITIONS,
  PLAN_CODES,
  startOfDay,
  addDays,
  calculatePlanEnd,
  calculateRenewalStart,
  daysUntil,
  buildRenewalNotice,
  moneyToPaise,
  paiseToMoney,
  calculateTaxes,
};
