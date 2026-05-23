import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { attendanceAPI } from '../utils/api/api';
import toast from 'react-hot-toast';

const actionColors = {
  PUNCH_IN:    'badge-success',
  PUNCH_OUT:   'badge-danger',
  BREAK_START: 'badge-warning',
  BREAK_END:   'badge-info',
  TEA_BREAK_START: 'badge-warning',
  TEA_BREAK_END: 'badge-info',
  LUNCH_BREAK_START: 'badge-warning',
  LUNCH_BREAK_END: 'badge-info',
};
const actionLabels = {
  PUNCH_IN: 'Punch In',
  PUNCH_OUT: 'Punch Out',
  BREAK_START: 'Break Start',
  BREAK_END: 'Break End',
  TEA_BREAK_START: 'Tea Break In',
  TEA_BREAK_END: 'Tea Break Out',
  LUNCH_BREAK_START: 'Lunch Break In',
  LUNCH_BREAK_END: 'Lunch Break Out',
};

export default function AttendanceLogPage() {
  const today = new Date().toISOString().split('T')[0];
  const [date, setDate] = useState(today);
  const [department, setDepartment] = useState('');
  const [logs, setLogs] = useState([]);
  const [summary, setSummary] = useState([]);
  const [lateBreakReport, setLateBreakReport] = useState([]);
  const [lateBreakStats, setLateBreakStats] = useState(null);
  const [reviewDrafts, setReviewDrafts] = useState({});
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('summary'); // summary | logs | breakLate

  const buildReviewDrafts = (items) => {
    const drafts = {};
    items.forEach((item) => {
      if (item.tea?.lateByMinutes > 0) {
        drafts[`${item._id}:TEA`] = {
          reason: item.tea.review?.reason || '',
          note: item.tea.review?.note || '',
        };
      }
      if (item.lunch?.lateByMinutes > 0) {
        drafts[`${item._id}:LUNCH`] = {
          reason: item.lunch.review?.reason || '',
          note: item.lunch.review?.note || '',
        };
      }
    });
    return drafts;
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const [logsRes, summaryRes, lateBreakRes] = await Promise.all([
        attendanceAPI.logsForDate(date, { department }),
        attendanceAPI.summaryForDate(date, { department }),
        attendanceAPI.lateBreakReport(date, { department }),
      ]);
      setLogs(logsRes.data.data);
      setSummary(summaryRes.data.data);
      setStats(summaryRes.data.stats);
      setLateBreakReport(lateBreakRes.data.data);
      setLateBreakStats(lateBreakRes.data.stats);
      setReviewDrafts(buildReviewDrafts(lateBreakRes.data.data));
    } catch { toast.error('Failed to load data'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, [date, department]);

  const statusBadge = (status) => {
    const map = { Present: 'badge-success', Absent: 'badge-danger', 'Half Day': 'badge-warning' };
    return map[status] || 'badge-neutral';
  };

  const reviewBadge = (status) => {
    const map = { Approved: 'badge-success', Rejected: 'badge-danger', Pending: 'badge-warning' };
    return map[status] || 'badge-warning';
  };

  const updateDraft = (summaryId, breakType, field, value) => {
    const key = `${summaryId}:${breakType}`;
    setReviewDrafts((prev) => ({
      ...prev,
      [key]: {
        ...(prev[key] || {}),
        [field]: value,
      },
    }));
  };

  const submitReview = async (item, breakType, status) => {
    const key = `${item._id}:${breakType}`;
    try {
      await attendanceAPI.reviewLateBreak(item._id, {
        breakType,
        status,
        reason: reviewDrafts[key]?.reason || '',
        note: reviewDrafts[key]?.note || '',
      });
      toast.success(`${breakType === 'TEA' ? 'Tea' : 'Lunch'} break ${status.toLowerCase()}`);
      await fetchData();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to update review');
    }
  };

  const renderBreakReviewRow = (item, breakType) => {
    const detail = breakType === 'TEA' ? item.tea : item.lunch;
    if (!detail?.lateByMinutes) return null;

    const key = `${item._id}:${breakType}`;
    const label = breakType === 'TEA' ? 'Tea' : 'Lunch';
    const review = detail.review || { status: 'Pending' };

    return (
      <tr key={key} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors align-top">
        <td className="px-4 py-3">
          <p className="font-medium text-white">{item.employee?.name}</p>
          <p className="text-xs text-slate-500 font-mono">{item.employee?.employeeCode}</p>
        </td>
        <td className="px-4 py-3">
          <span className={`badge ${item.employee?.department === 'IT Software' ? 'badge-info' : 'badge-warning'} text-xs`}>
            {item.employee?.department === 'IT Software' ? 'SW' : 'HW'}
          </span>
        </td>
        <td className="px-4 py-3 text-slate-300">{label}</td>
        <td className="px-4 py-3 text-slate-300">{detail.duration}m</td>
        <td className="px-4 py-3"><span className="badge badge-warning">{detail.lateByMinutes}m</span></td>
        <td className="px-4 py-3"><span className={`badge ${reviewBadge(review.status || 'Pending')}`}>{review.status || 'Pending'}</span></td>
        <td className="px-4 py-3 min-w-56">
          <input
            className="input text-xs py-2"
            placeholder="Reason"
            value={reviewDrafts[key]?.reason || ''}
            onChange={(e) => updateDraft(item._id, breakType, 'reason', e.target.value)}
          />
        </td>
        <td className="px-4 py-3 min-w-56">
          <input
            className="input text-xs py-2"
            placeholder="Admin note"
            value={reviewDrafts[key]?.note || ''}
            onChange={(e) => updateDraft(item._id, breakType, 'note', e.target.value)}
          />
        </td>
        <td className="px-4 py-3">
          <div className="flex gap-2">
            <button onClick={() => submitReview(item, breakType, 'Approved')} className="btn-success text-xs px-3 py-1.5">
              Approve
            </button>
            <button onClick={() => submitReview(item, breakType, 'Rejected')} className="btn-danger text-xs px-3 py-1.5">
              Reject
            </button>
          </div>
        </td>
      </tr>
    );
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-white">Attendance Logs</h1>
        <p className="text-slate-400 text-sm">View daily check-ins and summaries</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input type="date" className="input w-auto" value={date} onChange={e => setDate(e.target.value)} max={today} />
        <select className="input w-48" value={department} onChange={e => setDepartment(e.target.value)}>
          <option value="">All Departments</option>
          <option value="IT Software">IT Software</option>
          <option value="IT Hardware">IT Hardware</option>
        </select>
        <button onClick={fetchData} className="btn-secondary">🔄 Refresh</button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Present', val: stats.present, color: 'text-emerald-400' },
            { label: 'Absent',  val: stats.absent,  color: 'text-red-400' },
            { label: 'Half Day',val: stats.halfDay,  color: 'text-amber-400' },
            { label: 'Late',    val: stats.late,     color: 'text-orange-400' },
          ].map(s => (
            <div key={s.label} className="card text-center py-4">
              <p className={`text-3xl font-bold ${s.color}`}>{s.val}</p>
              <p className="text-xs text-slate-400 mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {lateBreakStats && tab === 'breakLate' && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Employees', val: lateBreakStats.employees, color: 'text-blue-400' },
            { label: 'Late Minutes', val: `${lateBreakStats.totalLateMinutes}m`, color: 'text-amber-400' },
            { label: 'Pending Reviews', val: lateBreakStats.pending, color: 'text-orange-400' },
          ].map(s => (
            <div key={s.label} className="card text-center py-4">
              <p className={`text-2xl font-bold ${s.color}`}>{s.val}</p>
              <p className="text-xs text-slate-400 mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-900 border border-slate-800 rounded-lg p-1 w-fit">
        {[
          { key: 'summary', label: 'Summary' },
          { key: 'logs', label: 'Logs' },
          { key: 'breakLate', label: 'Break Late' },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${tab === t.key ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : tab === 'summary' ? (
        // Summary Table
        <div className="card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800">
                  {['Employee', 'Dept', 'Status', 'Punch In', 'Punch Out', 'Work Hours', 'Late', 'Tea Late', 'Lunch Late'].map(h => (
                    <th key={h} className="text-left text-xs text-slate-400 font-medium px-4 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {summary.length === 0 ? (
                  <tr><td colSpan={9} className="text-center text-slate-500 py-10">No records for this date</td></tr>
                ) : summary.map(s => (
                  <tr key={s._id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                    <td className="px-4 py-3 font-medium text-white">{s.employee?.name}</td>
                    <td className="px-4 py-3">
                      <span className={`badge ${s.employee?.department === 'IT Software' ? 'badge-info' : 'badge-warning'} text-xs`}>
                        {s.employee?.department === 'IT Software' ? 'SW' : 'HW'}
                      </span>
                    </td>
                    <td className="px-4 py-3"><span className={`badge ${statusBadge(s.status)}`}>{s.status}</span></td>
                    <td className="px-4 py-3 font-mono text-slate-300">{s.punchIn ? format(new Date(s.punchIn), 'hh:mm a') : '—'}</td>
                    <td className="px-4 py-3 font-mono text-slate-300">{s.punchOut ? format(new Date(s.punchOut), 'hh:mm a') : '—'}</td>
                    <td className="px-4 py-3 text-slate-300">
                      {s.totalWorkMinutes ? `${Math.floor(s.totalWorkMinutes / 60)}h ${s.totalWorkMinutes % 60}m` : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {s.isLate ? <span className="badge badge-warning">{s.lateByMinutes}m</span> : <span className="text-slate-600">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {s.teaBreakLateByMinutes > 0 ? <span className="badge badge-warning">{s.teaBreakLateByMinutes}m</span> : <span className="text-slate-600">-</span>}
                    </td>
                    <td className="px-4 py-3">
                      {s.lunchBreakLateByMinutes > 0 ? <span className="badge badge-warning">{s.lunchBreakLateByMinutes}m</span> : <span className="text-slate-600">-</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : tab === 'breakLate' ? (
        <div className="card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800">
                  {['Employee', 'Dept', 'Break', 'Duration', 'Late', 'Review', 'Reason', 'Note', 'Action'].map(h => (
                    <th key={h} className="text-left text-xs text-slate-400 font-medium px-4 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lateBreakReport.length === 0 ? (
                  <tr><td colSpan={9} className="text-center text-slate-500 py-10">No late tea or lunch breaks for this date</td></tr>
                ) : lateBreakReport.flatMap(item => [
                  renderBreakReviewRow(item, 'TEA'),
                  renderBreakReviewRow(item, 'LUNCH'),
                ].filter(Boolean))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        // Raw Logs
        <div className="card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800">
                  {['Employee', 'Action', 'Time', 'Location', 'Face', 'Outside Reason'].map(h => (
                    <th key={h} className="text-left text-xs text-slate-400 font-medium px-4 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 ? (
                  <tr><td colSpan={6} className="text-center text-slate-500 py-10">No logs for this date</td></tr>
                ) : logs.map(log => (
                  <tr key={log._id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium text-white">{log.employee?.name}</p>
                        <p className="text-xs text-slate-500 font-mono">{log.employee?.employeeCode}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3"><span className={`badge ${actionColors[log.action]}`}>{actionLabels[log.action]}</span></td>
                    <td className="px-4 py-3 font-mono text-slate-300">{format(new Date(log.timestamp), 'hh:mm:ss a')}</td>
                    <td className="px-4 py-3 text-xs">
                      <div className={`flex items-center gap-1 ${log.location?.isOfficeLocation ? 'text-emerald-400' : 'text-amber-400'}`}>
                        <span>{log.location?.isOfficeLocation ? '🏢' : '📍'}</span>
                        <span>{log.location?.isOfficeLocation ? 'Office' : `${log.location?.distanceFromOffice}m away`}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {log.faceVerified ? (
                        <span className="text-xs text-emerald-400">✓ {(log.faceMatchScore * 100).toFixed(0)}%</span>
                      ) : (
                        <span className="text-xs text-slate-600">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400 max-w-32 truncate">{log.outsideReason || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
