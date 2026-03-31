import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { reportAPI } from '../utils/api/api';
import toast from 'react-hot-toast';

export default function MonthlyReportPage() {
  const thisMonth = new Date().toISOString().substring(0, 7);
  const [month, setMonth] = useState(thisMonth);
  const [department, setDepartment] = useState('');
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchReport = async () => {
    setLoading(true);
    try {
      const res = await reportAPI.monthly({ month, department });
      setData(res.data.data);
    } catch { toast.error('Failed to load report'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchReport(); }, [month, department]);

  const pct = (a, b) => b > 0 ? Math.round((a / b) * 100) : 0;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-white">Monthly Report</h1>
        <p className="text-slate-400 text-sm">Attendance summary by employee</p>
      </div>

      <div className="flex flex-wrap gap-3">
        <input type="month" className="input w-auto" value={month} onChange={e => setMonth(e.target.value)} max={thisMonth} />
        <select className="input w-48" value={department} onChange={e => setDepartment(e.target.value)}>
          <option value="">All Departments</option>
          <option value="IT Software">IT Software</option>
          <option value="IT Hardware">IT Hardware</option>
        </select>
        <button onClick={fetchReport} className="btn-secondary">🔄 Refresh</button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-4">
          {data.length === 0 ? (
            <div className="card text-center py-16 text-slate-500">No data for this period</div>
          ) : data.map(({ employee, stats }) => (
            <div key={employee._id} className="card">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-bold">
                    {employee.name?.charAt(0)}
                  </div>
                  <div>
                    <p className="font-semibold text-white">{employee.name}</p>
                    <p className="text-xs text-slate-500">{employee.employeeCode} · {employee.department}</p>
                  </div>
                </div>
                <div className="flex gap-4 text-sm text-center">
                  <div><p className="text-emerald-400 font-bold text-lg">{stats.present}</p><p className="text-slate-500 text-xs">Present</p></div>
                  <div><p className="text-red-400 font-bold text-lg">{stats.absent}</p><p className="text-slate-500 text-xs">Absent</p></div>
                  <div><p className="text-amber-400 font-bold text-lg">{stats.halfDay}</p><p className="text-slate-500 text-xs">Half Day</p></div>
                  <div><p className="text-orange-400 font-bold text-lg">{stats.late}</p><p className="text-slate-500 text-xs">Late</p></div>
                  <div>
                    <p className="text-blue-400 font-bold text-lg">{Math.floor(stats.totalWorkMinutes / 60)}h</p>
                    <p className="text-slate-500 text-xs">Work Hours</p>
                  </div>
                </div>
              </div>
              {/* Attendance rate bar */}
              <div>
                <div className="flex justify-between text-xs text-slate-500 mb-1">
                  <span>Attendance Rate</span>
                  <span>{pct(stats.present, stats.present + stats.absent + stats.halfDay)}%</span>
                </div>
                <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-600 to-emerald-500 rounded-full transition-all"
                    style={{ width: `${pct(stats.present, stats.present + stats.absent + stats.halfDay)}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}