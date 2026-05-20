import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import useAuthStore from '../store/authStore';
import { payrollAPI } from '../utils/api/api';

const COMPONENT_FIELDS = [
  { key: 'basicPay', label: 'Basic Pay' },
  { key: 'hra', label: 'HRA' },
  { key: 'medical', label: 'Medical' },
  { key: 'standardAllowance', label: 'Standard Allowance' },
  { key: 'conveyanceAllowance', label: 'Conveyance Allowance' },
  { key: 'nightAllowance', label: 'Night Allowance' },
  { key: 'ltc', label: 'LTC' },
  { key: 'otherIncome', label: 'Other Income' },
];

const currentMonth = new Date().toISOString().slice(0, 7);

const formatCurrency = (value) => new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
}).format(Number(value || 0));

export default function PayrollPage() {
  const { user, isAdmin, canViewAll } = useAuthStore();
  const canManagePayroll = isAdmin();
  const [month, setMonth] = useState(currentMonth);
  const [policy, setPolicy] = useState({
    salarySlipGenerationDay: 1,
    components: {
      basicPay: 100,
      hra: 40,
      medical: 10,
      standardAllowance: 15,
      conveyanceAllowance: 10,
      nightAllowance: 0,
      ltc: 0,
      otherIncome: 0,
    },
  });
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);

  const loadData = async (selectedMonth = month) => {
    setLoading(true);
    try {
      const [policyRes, runsRes] = await Promise.all([
        payrollAPI.getPolicy(),
        payrollAPI.listRuns({ month: selectedMonth }),
      ]);
      setPolicy({
        salarySlipGenerationDay: policyRes.data.data.salarySlipGenerationDay,
        components: policyRes.data.data.components,
      });
      setRuns(runsRes.data.data || []);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load payroll data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(month);
  }, [month]);

  const grossPercentage = useMemo(
    () => COMPONENT_FIELDS.reduce((sum, field) => sum + Number(policy.components[field.key] || 0), 0),
    [policy]
  );

  const handleComponentChange = (key, value) => {
    setPolicy((prev) => ({
      ...prev,
      components: {
        ...prev.components,
        [key]: value,
      },
    }));
  };

  const handleSavePolicy = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await payrollAPI.updatePolicy({
        salarySlipGenerationDay: Number(policy.salarySlipGenerationDay),
        components: Object.fromEntries(
          Object.entries(policy.components).map(([key, value]) => [key, Number(value || 0)])
        ),
      });
      toast.success('Payroll policy updated successfully');
      loadData(month);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to update payroll policy');
    } finally {
      setSaving(false);
    }
  };

  const handleGeneratePayroll = async () => {
    setGenerating(true);
    try {
      const { data } = await payrollAPI.generate(month);
      setRuns(data.data || []);
      toast.success(data.message || 'Payroll generated');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to generate payroll');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Payroll</h1>
          <p className="text-sm text-slate-400">
            {canManagePayroll
              ? 'Configure salary structure percentages and generate monthly payslips.'
              : 'View your generated payslips and salary breakdown.'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="month"
            className="input w-full sm:w-44"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
          {canManagePayroll && (
            <button type="button" className="btn-primary" onClick={handleGeneratePayroll} disabled={generating}>
              {generating ? 'Generating...' : 'Generate Payroll'}
            </button>
          )}
        </div>
      </div>

      {canManagePayroll && (
        <form onSubmit={handleSavePolicy} className="card space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">Payroll Policy</h2>
              <p className="text-sm text-slate-500">All earnings are calculated as percentages of each employee&apos;s basic salary.</p>
            </div>
            <div className="rounded-xl border border-blue-900/40 bg-blue-950/20 px-3 py-2 text-right">
              <p className="text-xs uppercase tracking-wide text-slate-500">Gross %</p>
              <p className="text-lg font-semibold text-blue-300">{grossPercentage}%</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="label text-sm text-slate-300">Salary Slip Generation Day</label>
              <input
                type="number"
                min="1"
                max="31"
                className="input"
                value={policy.salarySlipGenerationDay}
                onChange={(e) => setPolicy((prev) => ({ ...prev, salarySlipGenerationDay: e.target.value }))}
                required
              />
            </div>
            {COMPONENT_FIELDS.map((field) => (
              <div key={field.key}>
                <label className="label text-sm text-slate-300">{field.label} (%)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="input"
                  value={policy.components[field.key]}
                  onChange={(e) => handleComponentChange(field.key, e.target.value)}
                  required
                />
              </div>
            ))}
          </div>

          <p className="text-xs text-slate-500">
            Payroll generation date is stored here for your company. Payroll records are generated from this screen for the selected month, and each payslip uses the current policy percentages against the employee&apos;s basic salary.
          </p>

          <div className="flex justify-end">
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Saving...' : 'Save Payroll Policy'}
            </button>
          </div>
        </form>
      )}

      <div className="card space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">{canManagePayroll ? 'Generated Payslips' : 'My Payslips'}</h2>
            <p className="text-sm text-slate-500">Month: {month}</p>
          </div>
          {canViewAll() && !canManagePayroll && (
            <span className="badge badge-info">View only</span>
          )}
        </div>

        {loading ? (
          <div className="py-10 text-center text-slate-500">Loading payroll data...</div>
        ) : runs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-800 px-4 py-10 text-center text-slate-500">
            No payroll records found for this month.
          </div>
        ) : (
          <div className="space-y-4">
            {runs.map((run) => (
              <div key={run._id} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-white">{run.employee?.name || user?.name}</h3>
                    <p className="text-sm text-slate-400">
                      {run.employee?.employeeCode || 'Employee'} {run.employee?.department ? `· ${run.employee.department}` : ''}
                    </p>
                  </div>
                  <div className="text-left sm:text-right">
                    <p className="text-xs uppercase tracking-wide text-slate-500">Net Pay</p>
                    <p className="text-2xl font-bold text-emerald-400">{formatCurrency(run.netPay)}</p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-4 text-sm md:grid-cols-5">
                  <div><span className="text-slate-500">Basic Salary</span><p className="text-white">{formatCurrency(run.basicSalary)}</p></div>
                  <div><span className="text-slate-500">Total Salary Days</span><p className="text-white">{run.totalSalaryDays}</p></div>
                  <div><span className="text-slate-500">Total Leave Days</span><p className="text-white">{run.totalLeaveDays}</p></div>
                  <div><span className="text-slate-500">Gross Pay</span><p className="text-white">{formatCurrency(run.grossPay)}</p></div>
                  <div><span className="text-slate-500">Month</span><p className="text-white">{run.month}</p></div>
                </div>

                <div className="mt-4 overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left text-slate-500">
                        <th className="pb-2 pr-4 font-medium">Component</th>
                        <th className="pb-2 pr-4 font-medium">Percent</th>
                        <th className="pb-2 pr-4 font-medium">Monthly</th>
                        <th className="pb-2 font-medium">Payable</th>
                      </tr>
                    </thead>
                    <tbody>
                      {run.components.map((component) => (
                        <tr key={`${run._id}-${component.name}`} className="border-t border-slate-800 text-slate-300">
                          <td className="py-2 pr-4">{component.name}</td>
                          <td className="py-2 pr-4">{component.percentage}%</td>
                          <td className="py-2 pr-4">{formatCurrency(component.monthlyAmount)}</td>
                          <td className="py-2 text-white">{formatCurrency(component.payableAmount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
