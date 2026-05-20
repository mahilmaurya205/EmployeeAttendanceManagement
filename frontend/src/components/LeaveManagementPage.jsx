import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import useAuthStore from '../store/authStore';
import { leaveAPI } from '../utils/api/api';

const currentYear = new Date().getFullYear();

const statusClassNames = {
  Pending: 'badge-warning',
  Approved: 'badge-success',
  Rejected: 'badge-danger',
  Cancelled: 'badge-info',
};

const formatDate = (value) => {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

export default function LeaveManagementPage() {
  const { user, isAdmin, isEmployee, canViewAll } = useAuthStore();
  const canReview = isAdmin();
  const canApply = isEmployee();
  const [policy, setPolicy] = useState({ leaveTypes: [] });
  const [requests, setRequests] = useState([]);
  const [policyDraft, setPolicyDraft] = useState([]);
  const [filterStatus, setFilterStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingPolicy, setSavingPolicy] = useState(false);
  const [submittingLeave, setSubmittingLeave] = useState(false);
  const [reviewingId, setReviewingId] = useState(null);
  const [form, setForm] = useState({
    leaveTypeCode: '',
    startDate: '',
    endDate: '',
    unit: 'full',
    halfDaySession: 'First Half',
    reason: '',
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const [policyRes, requestsRes] = await Promise.all([
        leaveAPI.getPolicy(),
        leaveAPI.listRequests({ status: filterStatus || undefined, year: currentYear }),
      ]);
      setPolicy(policyRes.data.data || { leaveTypes: [] });
      setPolicyDraft(policyRes.data.data?.leaveTypes || []);
      setRequests(requestsRes.data.data || []);
      setForm((prev) => ({
        ...prev,
        leaveTypeCode: prev.leaveTypeCode || policyRes.data.data?.leaveTypes?.find((item) => item.enabled)?.code || '',
      }));
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load leave data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [filterStatus]);

  const enabledLeaveTypes = useMemo(
    () => (policy.leaveTypes || []).filter((item) => item.enabled),
    [policy]
  );

  const handlePolicyChange = (index, key, value) => {
    setPolicyDraft((prev) => prev.map((item, itemIndex) => (
      itemIndex === index
        ? { ...item, [key]: value }
        : item
    )));
  };

  const handleSavePolicy = async (e) => {
    e.preventDefault();
    setSavingPolicy(true);
    try {
      await leaveAPI.updatePolicy(policyDraft.map((item) => ({
        ...item,
        annualQuota: Number(item.annualQuota || 0),
      })));
      toast.success('Leave policy updated successfully');
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to update leave policy');
    } finally {
      setSavingPolicy(false);
    }
  };

  const handleApplyLeave = async (e) => {
    e.preventDefault();
    setSubmittingLeave(true);
    try {
      await leaveAPI.createRequest({
        ...form,
        endDate: form.unit === 'half' ? form.startDate : form.endDate,
      });
      toast.success('Leave request submitted');
      setForm((prev) => ({ ...prev, reason: '', startDate: '', endDate: '', unit: 'full', halfDaySession: 'First Half' }));
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to submit leave request');
    } finally {
      setSubmittingLeave(false);
    }
  };

  const reviewRequest = async (id, status) => {
    const adminComment = window.prompt(`Optional comment for ${status.toLowerCase()} this leave request:`, '') || '';
    setReviewingId(id);
    try {
      await leaveAPI.updateStatus(id, { status, adminComment });
      toast.success(`Leave ${status.toLowerCase()} successfully`);
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to update leave request');
    } finally {
      setReviewingId(null);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-white">Leave Management</h1>
        <p className="text-sm text-slate-400">
          {canReview
            ? 'Set leave templates for your company and review employee requests.'
            : 'Apply for leave within your company template and track approvals.'}
        </p>
      </div>

      {canReview && (
        <form onSubmit={handleSavePolicy} className="card space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">Leave Templates</h2>
              <p className="text-sm text-slate-500">Admin controls which leave types are enabled and how many days each employee can use per year.</p>
            </div>
            <button type="submit" className="btn-primary" disabled={savingPolicy}>
              {savingPolicy ? 'Saving...' : 'Save Leave Policy'}
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="pb-2 pr-4 font-medium">Leave Type</th>
                  <th className="pb-2 pr-4 font-medium">Quota / Year</th>
                  <th className="pb-2 pr-4 font-medium">Paid</th>
                  <th className="pb-2 pr-4 font-medium">Approval</th>
                  <th className="pb-2 font-medium">Enabled</th>
                </tr>
              </thead>
              <tbody>
                {policyDraft.map((item, index) => (
                  <tr key={item.code} className="border-t border-slate-800">
                    <td className="py-3 pr-4 text-white">{item.name}</td>
                    <td className="py-3 pr-4">
                      <input
                        type="number"
                        min="0"
                        className="input w-28"
                        value={item.annualQuota}
                        onChange={(e) => handlePolicyChange(index, 'annualQuota', e.target.value)}
                      />
                    </td>
                    <td className="py-3 pr-4">
                      <label className="inline-flex items-center gap-2 text-slate-300">
                        <input
                          type="checkbox"
                          checked={item.isPaid}
                          onChange={(e) => handlePolicyChange(index, 'isPaid', e.target.checked)}
                        />
                        Paid
                      </label>
                    </td>
                    <td className="py-3 pr-4">
                      <label className="inline-flex items-center gap-2 text-slate-300">
                        <input
                          type="checkbox"
                          checked={item.requiresApproval}
                          onChange={(e) => handlePolicyChange(index, 'requiresApproval', e.target.checked)}
                        />
                        Required
                      </label>
                    </td>
                    <td className="py-3">
                      <label className="inline-flex items-center gap-2 text-slate-300">
                        <input
                          type="checkbox"
                          checked={item.enabled}
                          onChange={(e) => handlePolicyChange(index, 'enabled', e.target.checked)}
                        />
                        Active
                      </label>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </form>
      )}

      {!canReview && enabledLeaveTypes.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {enabledLeaveTypes.map((leaveType) => (
            <div key={leaveType.code} className="card">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-white">{leaveType.name}</h3>
                  <p className="text-sm text-slate-500">{leaveType.annualQuota} day(s) / year</p>
                </div>
                <span className={`badge ${leaveType.isPaid ? 'badge-success' : 'badge-warning'}`}>
                  {leaveType.isPaid ? 'Paid' : 'Unpaid'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {canApply && (
        <form onSubmit={handleApplyLeave} className="card space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Apply For Leave</h2>
            <p className="text-sm text-slate-500">If your request exceeds the configured quota, it will still go to Admin for approval.</p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="label">Leave Type</label>
              <select
                className="input"
                value={form.leaveTypeCode}
                onChange={(e) => setForm((prev) => ({ ...prev, leaveTypeCode: e.target.value }))}
                required
              >
                <option value="">Select leave type</option>
                {enabledLeaveTypes.map((item) => (
                  <option key={item.code} value={item.code}>{item.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Unit</label>
              <select
                className="input"
                value={form.unit}
                onChange={(e) => setForm((prev) => ({ ...prev, unit: e.target.value }))}
              >
                <option value="full">Full Day(s)</option>
                <option value="half">Half Day</option>
              </select>
            </div>
            <div>
              <label className="label">Start Date</label>
              <input
                type="date"
                className="input"
                value={form.startDate}
                onChange={(e) => setForm((prev) => ({ ...prev, startDate: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className="label">End Date</label>
              <input
                type="date"
                className="input"
                value={form.unit === 'half' ? form.startDate : form.endDate}
                onChange={(e) => setForm((prev) => ({ ...prev, endDate: e.target.value }))}
                disabled={form.unit === 'half'}
                required
              />
            </div>
            {form.unit === 'half' && (
              <div>
                <label className="label">Half Day Session</label>
                <select
                  className="input"
                  value={form.halfDaySession}
                  onChange={(e) => setForm((prev) => ({ ...prev, halfDaySession: e.target.value }))}
                >
                  <option value="First Half">First Half</option>
                  <option value="Second Half">Second Half</option>
                </select>
              </div>
            )}
            <div className="md:col-span-2">
              <label className="label">Reason</label>
              <textarea
                className="input min-h-28"
                value={form.reason}
                onChange={(e) => setForm((prev) => ({ ...prev, reason: e.target.value }))}
                placeholder="Add a short reason for your leave request"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button type="submit" className="btn-primary" disabled={submittingLeave}>
              {submittingLeave ? 'Submitting...' : 'Submit Leave Request'}
            </button>
          </div>
        </form>
      )}

      <div className="card space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">{canReview || canViewAll() ? 'Leave Requests' : 'My Leave Requests'}</h2>
            <p className="text-sm text-slate-500">Track current leave requests and approvals.</p>
          </div>
          <select className="input w-full sm:w-44" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="">All Statuses</option>
            <option value="Pending">Pending</option>
            <option value="Approved">Approved</option>
            <option value="Rejected">Rejected</option>
          </select>
        </div>

        {loading ? (
          <div className="py-10 text-center text-slate-500">Loading leave requests...</div>
        ) : requests.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-800 px-4 py-10 text-center text-slate-500">
            No leave requests found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="pb-2 pr-4 font-medium">Employee</th>
                  <th className="pb-2 pr-4 font-medium">Leave</th>
                  <th className="pb-2 pr-4 font-medium">Dates</th>
                  <th className="pb-2 pr-4 font-medium">Days</th>
                  <th className="pb-2 pr-4 font-medium">Status</th>
                  <th className="pb-2 pr-4 font-medium">Quota</th>
                  <th className="pb-2 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((request) => (
                  <tr key={request._id} className="border-t border-slate-800">
                    <td className="py-3 pr-4">
                      <div className="text-white">{request.employee?.name || user?.name}</div>
                      <div className="text-xs text-slate-500">{request.employee?.employeeCode || '-'}</div>
                    </td>
                    <td className="py-3 pr-4 text-white">
                      <div>{request.leaveTypeName}</div>
                      {request.reason && <div className="text-xs text-slate-500">{request.reason}</div>}
                    </td>
                    <td className="py-3 pr-4 text-slate-300">
                      {formatDate(request.startDate)} - {formatDate(request.endDate)}
                    </td>
                    <td className="py-3 pr-4 text-slate-300">{request.totalDays}</td>
                    <td className="py-3 pr-4">
                      <span className={`badge ${statusClassNames[request.status] || 'badge-info'}`}>{request.status}</span>
                    </td>
                    <td className="py-3 pr-4">
                      <div className="text-slate-300">{request.quotaUsedBeforeRequest}/{request.quotaLimitAtRequest}</div>
                      {request.exceedsQuota && <div className="text-xs text-amber-400">Exceeds quota</div>}
                    </td>
                    <td className="py-3">
                      {canReview && request.status === 'Pending' ? (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            className="btn-secondary px-3 py-2 text-xs"
                            disabled={reviewingId === request._id}
                            onClick={() => reviewRequest(request._id, 'Approved')}
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            className="btn-danger px-3 py-2 text-xs"
                            disabled={reviewingId === request._id}
                            onClick={() => reviewRequest(request._id, 'Rejected')}
                          >
                            Reject
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-500">
                          {request.reviewedBy?.name ? `By ${request.reviewedBy.name}` : '-'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
