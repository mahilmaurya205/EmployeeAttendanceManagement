import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { paymentAPI } from '../utils/api/api';
import useAuthStore from '../store/authStore';

const formatCurrency = (value) => new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
}).format(Number(value || 0));

const formatDate = (value) => {
  if (!value) return 'N/A';
  return new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const loadRazorpay = () => new Promise((resolve) => {
  if (window.Razorpay) return resolve(true);
  const script = document.createElement('script');
  script.src = 'https://checkout.razorpay.com/v1/checkout.js';
  script.onload = () => resolve(true);
  script.onerror = () => resolve(false);
  document.body.appendChild(script);
});

function PlanPrice({ plan }) {
  return (
    <div className="text-sm text-slate-300 space-y-1">
      <div className="flex justify-between"><span>Base</span><span>{formatCurrency(plan.amounts?.base)}</span></div>
      <div className="flex justify-between"><span>GST</span><span>{formatCurrency(plan.amounts?.gst)}</span></div>
      <div className="flex justify-between"><span>CGST</span><span>{formatCurrency(plan.amounts?.cgst)}</span></div>
      <div className="flex justify-between"><span>SGST</span><span>{formatCurrency(plan.amounts?.sgst)}</span></div>
      <div className="flex justify-between"><span>IGST</span><span>{formatCurrency(plan.amounts?.igst)}</span></div>
      <div className="flex justify-between pt-2 border-t border-slate-800 font-semibold text-white">
        <span>Total</span><span>{formatCurrency(plan.amounts?.total)}</span>
      </div>
    </div>
  );
}

export default function BillingPage() {
  const { user, isSuperAdmin, isAdmin, updateStoredUser } = useAuthStore();
  const [plans, setPlans] = useState([]);
  const [selectedPlan, setSelectedPlan] = useState('');
  const [transactions, setTransactions] = useState([]);
  const [saving, setSaving] = useState(false);
  const [paying, setPaying] = useState(false);

  const paymentRequired = user?.paymentRequired || user?.subscription?.status === 'pending_payment';
  const payablePlans = useMemo(() => {
    const activePlans = plans.filter((plan) => plan.isActive);
    if (paymentRequired && user?.subscription?.planSnapshot) {
      return [{
        code: user.subscription.planCode,
        label: user.subscription.planSnapshot.label || user.subscription.planLabel,
        months: user.subscription.planSnapshot.months,
        basePrice: user.subscription.planSnapshot.basePrice,
        taxes: user.subscription.planSnapshot.taxes,
        amounts: user.subscription.planSnapshot.amounts,
        isActive: true,
      }];
    }
    if (!paymentRequired) return activePlans;
    return activePlans.filter((plan) => plan.code === user?.subscription?.planCode);
  }, [plans, paymentRequired, user?.subscription?.planCode]);

  useEffect(() => {
    fetchPlans();
    fetchTransactions();
  }, []);

  useEffect(() => {
    if (paymentRequired && user?.subscription?.planCode) {
      setSelectedPlan(user.subscription.planCode);
      return;
    }
    if (!selectedPlan && payablePlans.length) setSelectedPlan(payablePlans[0].code);
  }, [payablePlans, paymentRequired, selectedPlan, user?.subscription?.planCode]);

  const fetchPlans = async () => {
    try {
      const { data } = await paymentAPI.plans();
      setPlans(data.data || []);
    } catch (error) {
      toast.error('Failed to load billing plans');
    }
  };

  const fetchTransactions = async () => {
    try {
      const { data } = await paymentAPI.transactions();
      setTransactions(data.data || []);
    } catch (error) {
      toast.error('Failed to load payment transactions');
    }
  };

  const updatePlanValue = (code, path, value) => {
    setPlans((prev) => prev.map((plan) => {
      if (plan.code !== code) return plan;
      if (path.startsWith('taxes.')) {
        const key = path.split('.')[1];
        return { ...plan, taxes: { ...plan.taxes, [key]: value } };
      }
      return { ...plan, [path]: value };
    }));
  };

  const savePlans = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = plans.map((plan) => ({
        code: plan.code,
        basePrice: Number(plan.basePrice),
        taxes: {
          gst: Number(plan.taxes?.gst || 0),
          cgst: Number(plan.taxes?.cgst || 0),
          sgst: Number(plan.taxes?.sgst || 0),
          igst: Number(plan.taxes?.igst || 0),
        },
        isActive: plan.isActive,
      }));
      const { data } = await paymentAPI.updatePlans(payload);
      setPlans(data.data || []);
      toast.success('Plan prices updated');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to update plans');
    } finally {
      setSaving(false);
    }
  };

  const openReceipt = async (paymentId) => {
    try {
      const { data } = await paymentAPI.receipt(paymentId);
      const receipt = data.data;
      const payment = receipt.payment;
      const html = `
        <html>
          <head>
            <title>Receipt ${receipt.receiptNumber || ''}</title>
            <style>
              body { font-family: Arial, sans-serif; color: #111827; padding: 32px; }
              .top { display: flex; justify-content: space-between; gap: 24px; border-bottom: 1px solid #d1d5db; padding-bottom: 18px; margin-bottom: 22px; }
              h1 { margin: 0 0 6px; font-size: 28px; }
              h2 { margin: 0 0 8px; font-size: 18px; }
              p { margin: 4px 0; }
              table { width: 100%; border-collapse: collapse; margin-top: 18px; }
              th, td { border: 1px solid #d1d5db; padding: 10px; text-align: left; }
              th { background: #f3f4f6; }
              .right { text-align: right; }
              .total { font-weight: 700; }
              .muted { color: #6b7280; }
            </style>
          </head>
          <body>
            <div class="top">
              <div>
                <h1>AttendanceIQ Receipt</h1>
                <p class="muted">Receipt No: ${receipt.receiptNumber || 'Pending'}</p>
                <p class="muted">Payment ID: ${payment.razorpayPaymentId || 'N/A'}</p>
              </div>
              <div class="right">
                <h2>${payment.companyName || receipt.issuedTo?.companyName || 'Company'}</h2>
                <p>${payment.adminName || receipt.issuedTo?.name || ''}</p>
                <p>${payment.adminEmail || receipt.issuedTo?.email || ''}</p>
              </div>
            </div>
            <p><strong>Status:</strong> ${payment.status}</p>
            <p><strong>Paid At:</strong> ${payment.paidAt ? new Date(payment.paidAt).toLocaleString('en-IN') : 'N/A'}</p>
            <p><strong>Plan:</strong> ${payment.planSnapshot?.label || payment.planCode}</p>
            <p><strong>Subscription:</strong> ${formatDate(payment.subscriptionStartDate)} to ${formatDate(payment.subscriptionEndDate)}</p>
            <table>
              <thead><tr><th>Description</th><th class="right">Amount</th></tr></thead>
              <tbody>
                <tr><td>Base Price</td><td class="right">${formatCurrency(payment.planSnapshot?.basePrice)}</td></tr>
                <tr><td>GST</td><td class="right">${formatCurrency(payment.planSnapshot?.taxAmounts?.gst)}</td></tr>
                <tr><td>CGST</td><td class="right">${formatCurrency(payment.planSnapshot?.taxAmounts?.cgst)}</td></tr>
                <tr><td>SGST</td><td class="right">${formatCurrency(payment.planSnapshot?.taxAmounts?.sgst)}</td></tr>
                <tr><td>IGST</td><td class="right">${formatCurrency(payment.planSnapshot?.taxAmounts?.igst)}</td></tr>
                <tr class="total"><td>Total Paid</td><td class="right">${formatCurrency(payment.amount)}</td></tr>
              </tbody>
            </table>
            <script>window.print();</script>
          </body>
        </html>
      `;
      const receiptWindow = window.open('', '_blank', 'width=900,height=700');
      receiptWindow.document.write(html);
      receiptWindow.document.close();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to open receipt');
    }
  };

  const renewPlan = async () => {
    if (!selectedPlan) return;
    setPaying(true);
    try {
      const loaded = await loadRazorpay();
      if (!loaded) {
        toast.error('Razorpay checkout failed to load');
        return;
      }

      const { data } = await paymentAPI.createRenewalOrder(selectedPlan);
      const options = {
        key: data.keyId,
        amount: data.order.amount,
        currency: data.order.currency,
        name: 'AttendanceIQ',
        description: paymentRequired ? `${data.plan.label} activation` : `${data.plan.label} renewal`,
        order_id: data.order.id,
        prefill: {
          name: user?.name,
          email: user?.email,
        },
        handler: async (response) => {
          try {
            const verified = await paymentAPI.verifyRenewalPayment(response);
            updateStoredUser(verified.data.user);
            fetchTransactions();
            toast.success(paymentRequired ? 'Plan activated successfully' : 'Plan renewed successfully');
          } catch (error) {
            toast.error(error.response?.data?.message || 'Payment verification failed');
          }
        },
        modal: {
          ondismiss: () => toast.error('Payment cancelled'),
        },
      };

      const checkout = new window.Razorpay(options);
      checkout.open();
    } catch (error) {
      toast.error(error.response?.data?.message || error.message || 'Failed to start payment');
    } finally {
      setPaying(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold text-white">Billing</h1>
        <p className="text-slate-400">{isSuperAdmin() ? 'Set plan pricing, taxes, and track all company payments.' : 'Pay, review, and renew your company plan.'}</p>
      </div>

      {isSuperAdmin() && (
        <form onSubmit={savePlans} className="card space-y-5">
          <div>
            <h2 className="text-xl font-semibold text-white">Plan Pricing</h2>
            <p className="text-sm text-slate-400">Amounts are in INR. Tax fields are percentages.</p>
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            {plans.map((plan) => (
              <div key={plan.code} className="rounded-lg border border-slate-800 bg-slate-900 p-4 space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-white">{plan.label}</h3>
                    <p className="text-xs text-slate-500">{plan.months} month{plan.months === 1 ? '' : 's'}</p>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-slate-300">
                    <input type="checkbox" checked={plan.isActive} onChange={(e) => updatePlanValue(plan.code, 'isActive', e.target.checked)} />
                    Active
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <label className="space-y-1 col-span-2">
                    <span className="label text-xs">Base Price</span>
                    <input className="input" type="number" min="0" step="0.01" value={plan.basePrice} onChange={(e) => updatePlanValue(plan.code, 'basePrice', e.target.value)} />
                  </label>
                  {['gst', 'cgst', 'sgst', 'igst'].map((tax) => (
                    <label key={tax} className="space-y-1">
                      <span className="label text-xs uppercase">{tax} %</span>
                      <input className="input" type="number" min="0" step="0.01" value={plan.taxes?.[tax] || 0} onChange={(e) => updatePlanValue(plan.code, `taxes.${tax}`, e.target.value)} />
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-end">
            <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Save Plans'}</button>
          </div>
        </form>
      )}

      {isAdmin() && (
        <div className="grid grid-cols-1 xl:grid-cols-[360px,1fr] gap-6">
          <div className="card space-y-4">
            <div>
              <h2 className="text-xl font-semibold text-white">{paymentRequired ? 'Activation Pending' : 'Current Plan'}</h2>
              <p className="text-sm text-slate-400">
                {paymentRequired ? 'Pay the plan selected for your company to unlock all features.' : 'Renewal starts after your current end date when time is still left.'}
              </p>
            </div>
            {paymentRequired && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-950/30 px-4 py-3 text-sm text-amber-200">
                Your company is created with the {user?.subscription?.planLabel} plan. Payment is required before using the application.
              </div>
            )}
            {user?.renewalNotice && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-950/30 px-4 py-3 text-sm text-amber-200">
                {user.renewalNotice.message}
              </div>
            )}
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-slate-400">Plan</span><span className="text-white">{user?.subscription?.planLabel || 'N/A'}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Starts</span><span className="text-white">{formatDate(user?.subscription?.startDate)}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Ends</span><span className="text-white">{formatDate(user?.subscription?.endDate)}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Status</span><span className="text-white capitalize">{user?.subscription?.status || 'N/A'}</span></div>
            </div>
          </div>

          <div className="card space-y-4">
            <h2 className="text-xl font-semibold text-white">{paymentRequired ? 'Pay Selected Plan' : 'Renew Plan'}</h2>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {payablePlans.map((plan) => (
                <button
                  key={plan.code}
                  type="button"
                  onClick={() => !paymentRequired && setSelectedPlan(plan.code)}
                  className={`text-left rounded-lg border p-4 transition-colors ${
                    selectedPlan === plan.code ? 'border-blue-500 bg-blue-950/30' : 'border-slate-800 bg-slate-900 hover:bg-slate-800'
                  }`}
                >
                  <h3 className="font-semibold text-white">{plan.label}</h3>
                  <p className="text-xs text-slate-500 mb-4">{plan.months} month{plan.months === 1 ? '' : 's'}</p>
                  <PlanPrice plan={plan} />
                </button>
              ))}
            </div>
            <div className="flex justify-end">
              <button type="button" onClick={renewPlan} className="btn-primary" disabled={paying || !selectedPlan}>
                {paying ? 'Opening Payment...' : paymentRequired ? 'Pay and Activate' : 'Pay with Razorpay'}
              </button>
            </div>
          </div>
        </div>
      )}

      {(isSuperAdmin() || isAdmin()) && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-semibold text-white">Payment Transactions</h2>
              <p className="text-sm text-slate-400">{isSuperAdmin() ? 'All company plan payments are listed here.' : 'Your company payment history and receipts.'}</p>
            </div>
            <button type="button" onClick={fetchTransactions} className="btn-secondary btn-sm">Refresh</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-slate-300">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left py-3 px-4">Company</th>
                  <th className="text-left py-3 px-4">Plan</th>
                  <th className="text-left py-3 px-4">Purpose</th>
                  <th className="text-left py-3 px-4">Amount</th>
                  <th className="text-left py-3 px-4">Status</th>
                  <th className="text-left py-3 px-4">Paid At</th>
                  <th className="text-left py-3 px-4">Receipt</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((payment) => (
                  <tr key={payment._id} className="border-b border-slate-800">
                    <td className="py-3 px-4">
                      <p className="font-medium text-white">{payment.companyName || payment.adminName || 'N/A'}</p>
                      <p className="text-xs text-slate-500">{payment.adminEmail}</p>
                    </td>
                    <td className="py-3 px-4">{payment.planSnapshot?.label || payment.planCode}</td>
                    <td className="py-3 px-4 capitalize">{payment.purpose}</td>
                    <td className="py-3 px-4">{formatCurrency(payment.amount)}</td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${payment.status === 'paid' ? 'bg-green-900/30 text-green-400' : payment.status === 'failed' ? 'bg-red-900/30 text-red-400' : 'bg-amber-900/30 text-amber-300'}`}>
                        {payment.status}
                      </span>
                    </td>
                    <td className="py-3 px-4">{payment.paidAt ? new Date(payment.paidAt).toLocaleString('en-IN') : 'N/A'}</td>
                    <td className="py-3 px-4">
                      {payment.status === 'paid' ? (
                        <button type="button" onClick={() => openReceipt(payment._id)} className="btn-secondary btn-sm">Receipt</button>
                      ) : (
                        <span className="text-slate-500">Pending</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {transactions.length === 0 && <div className="text-center py-10 text-slate-500">No payment transactions found</div>}
        </div>
      )}
    </div>
  );
}
