import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { reportAPI, attendanceAPI } from '../utils/api/api';
import useAuthStore from '../store/authStore';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

const StatCard = ({ title, value, sub, color, icon }) => (
  <div className="card flex items-start justify-between">
    <div>
      <p className="text-sm text-slate-400 mb-1">{title}</p>
      <p className={`text-3xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
    </div>
    <div className={`p-3 rounded-xl ${color.replace('text-', 'bg-').replace('-400', '-900/50')}`}>
      {icon}
    </div>
  </div>
);

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 text-sm">
      <p className="text-slate-400">{label}</p>
      <p className="text-blue-400 font-semibold">{payload[0].value} present</p>
    </div>
  );
};

export default function DashboardPage() {
  const { user, canViewAll } = useAuthStore();
  const [stats, setStats] = useState(null);
  const [todayStatus, setTodayStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Try to load dashboard data
        try {
          const dashRes = await reportAPI.dashboard();
          setStats(dashRes.data?.data);
        } catch (e) {
          console.log('Dashboard data not available');
        }

        // Try to load today's attendance
        try {
          const todayRes = await attendanceAPI.today();
          setTodayStatus(todayRes.data?.data);
        } catch (e) {
          console.log('Today attendance not available');
        }
      } catch (err) {
        toast.error('Failed to load dashboard');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const today = format(new Date(), 'EEEE, MMMM d yyyy');
  const currentAction = todayStatus?.currentStatus;

  const statusConfig = {
    NOT_STARTED: { label: 'Not Started', color: 'text-slate-400', bg: 'bg-slate-800' },
    PUNCH_IN:    { label: 'Checked In',  color: 'text-emerald-400', bg: 'bg-emerald-900/30 border border-emerald-800/50' },
    BREAK_START: { label: 'On Break',    color: 'text-amber-400', bg: 'bg-amber-900/30 border border-amber-800/50' },
    BREAK_END:   { label: 'Checked In',  color: 'text-emerald-400', bg: 'bg-emerald-900/30 border border-emerald-800/50' },
    PUNCH_OUT:   { label: 'Checked Out', color: 'text-slate-400', bg: 'bg-slate-800' },
  };

  const sc = statusConfig[currentAction] || statusConfig.NOT_STARTED;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">
            Good {new Date().getHours() < 12 ? 'Morning' : new Date().getHours() < 17 ? 'Afternoon' : 'Evening'}, {user?.name?.split(' ')[0]} 👋
          </h1>
          <p className="text-slate-400 text-sm mt-1">{today}</p>
        </div>
        {user?.employee && (
          <Link to="/attendance" className="btn-primary shrink-0">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Mark Attendance
          </Link>
        )}
      </div>

      {/* My Status Card */}
      {user?.employee && todayStatus && (
        <div className={`rounded-xl p-5 flex items-center justify-between ${sc.bg}`}>
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Today's Status</p>
            <p className={`text-xl font-bold ${sc.color}`}>{sc.label}</p>
            {todayStatus.summary?.punchIn && (
              <p className="text-sm text-slate-400 mt-1">
                In: {format(new Date(todayStatus.summary.punchIn), 'hh:mm a')}
                {todayStatus.summary?.totalWorkMinutes > 0 && (
                  <> · {Math.floor(todayStatus.summary.totalWorkMinutes / 60)}h {todayStatus.summary.totalWorkMinutes % 60}m worked</>
                )}
              </p>
            )}
          </div>
          <div className={`w-12 h-12 rounded-full flex items-center justify-center ${sc.color.replace('text-', 'bg-').replace('-400', '-500/20')}`}>
            <div className={`w-4 h-4 rounded-full ${sc.color.replace('text-', 'bg-')} ${currentAction === 'PUNCH_IN' || currentAction === 'BREAK_END' ? 'animate-pulse' : ''}`} />
          </div>
        </div>
      )}

      {/* Stats Grid (Admin/Manager/HR/Supervisor) */}
      {stats && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              title="Total Employees" value={stats.employees.total} sub="Active"
              color="text-blue-400"
              icon={<svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>}
            />
            <StatCard
              title="Present Today" value={stats.today.present} sub="Marked attendance"
              color="text-emerald-400"
              icon={<svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
            />
            <StatCard
              title="Absent Today" value={stats.today.absent} sub="Not marked"
              color="text-red-400"
              icon={<svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
            />
            <StatCard
              title="Late Today" value={stats.today.late} sub="Arrived late"
              color="text-amber-400"
              icon={<svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>}
            />
          </div>

          {/* Department split */}
          <div className="grid grid-cols-2 gap-4">
            <div className="card">
              <p className="text-sm text-slate-400 mb-3">IT Software</p>
              <p className="text-2xl font-bold text-blue-400">{stats.employees.itSoftware}</p>
              <p className="text-xs text-slate-500 mt-1">Office-only attendance</p>
            </div>
            <div className="card">
              <p className="text-sm text-slate-400 mb-3">IT Hardware</p>
              <p className="text-2xl font-bold text-purple-400">{stats.employees.itHardware}</p>
              <p className="text-xs text-slate-500 mt-1">Remote-allowed</p>
            </div>
          </div>

          {/* Trend Chart */}
          <div className="card">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-semibold text-white">7-Day Attendance Trend</h3>
              <Link to="/attendance/logs" className="text-xs text-blue-400 hover:text-blue-300">View logs →</Link>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={stats.trend} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
                <XAxis
                  dataKey="date"
                  tickFormatter={d => format(new Date(d), 'EEE')}
                  tick={{ fill: '#64748b', fontSize: 12 }}
                  axisLine={false} tickLine={false}
                />
                <YAxis tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="present" radius={[6, 6, 0, 0]}>
                  {stats.trend.map((entry, i) => (
                    <Cell key={i} fill={i === stats.trend.length - 1 ? '#3b82f6' : '#1e3a8a'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {/* Quick links */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {canViewAll() && (
          <>
            <Link to="/employees" className="card hover:border-blue-800/50 transition-colors group cursor-pointer">
              <p className="text-slate-400 group-hover:text-blue-400 transition-colors text-sm font-medium">Manage Employees</p>
              <p className="text-xs text-slate-600 mt-1">Add, edit, enroll →</p>
            </Link>
            <Link to="/attendance/logs" className="card hover:border-blue-800/50 transition-colors group cursor-pointer">
              <p className="text-slate-400 group-hover:text-blue-400 transition-colors text-sm font-medium">Today's Logs</p>
              <p className="text-xs text-slate-600 mt-1">View all check-ins →</p>
            </Link>
            <Link to="/reports/monthly" className="card hover:border-blue-800/50 transition-colors group cursor-pointer">
              <p className="text-slate-400 group-hover:text-blue-400 transition-colors text-sm font-medium">Monthly Report</p>
              <p className="text-xs text-slate-600 mt-1">Export & analyze →</p>
            </Link>
          </>
        )}
      </div>
    </div>
  );
}