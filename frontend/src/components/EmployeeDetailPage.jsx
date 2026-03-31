import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { employeeAPI } from '../utils/api/api';
import toast from 'react-hot-toast';

export default function EmployeeDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [employee, setEmployee] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchEmployee();
  }, [id]);

  const fetchEmployee = async () => {
    setLoading(true);
    try {
      const res = await employeeAPI.get(id);
      setEmployee(res.data.data);
    } catch (error) {
      toast.error('Failed to load employee details');
      navigate('/employees');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!employee) {
    return <div className="text-center py-16 text-slate-500">Employee not found</div>;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">{employee.name}</h1>
          <p className="text-slate-400">{employee.employeeCode} · {employee.department}</p>
        </div>
        <button onClick={() => navigate(`/employees/${id}/edit`)} className="btn-primary">
          ✏️ Edit
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="card">
          <h2 className="text-lg font-semibold text-white mb-4">Personal Information</h2>
          <div className="space-y-3 text-sm">
            <div><span className="text-slate-400">Email:</span> <span className="text-white">{employee.email}</span></div>
            <div><span className="text-slate-400">Phone:</span> <span className="text-white">{employee.phone || 'N/A'}</span></div>
            <div><span className="text-slate-400">Department:</span> <span className="text-white">{employee.department}</span></div>
            <div><span className="text-slate-400">Position:</span> <span className="text-white">{employee.position || 'N/A'}</span></div>
            <div><span className="text-slate-400">Joined:</span> <span className="text-white">{format(new Date(employee.createdAt), 'MMMM dd, yyyy')}</span></div>
            <div><span className="text-slate-400">Status:</span> <span className={`font-semibold ${employee.isActive ? 'text-green-400' : 'text-red-400'}`}>{employee.isActive ? 'Active' : 'Inactive'}</span></div>
          </div>
        </div>

        <div className="card">
          <h2 className="text-lg font-semibold text-white mb-4">Face Recognition</h2>
          <div className="space-y-3">
            {employee.faceDescriptors && employee.faceDescriptors.length > 0 ? (
              <>
                <p className="text-sm text-green-400">✓ Face enrolled ({employee.faceDescriptors.length} samples)</p>
                <button onClick={() => navigate(`/employees/${id}/face-enroll`)} className="btn-secondary w-full">
                  🔄 Re-enroll Face
                </button>
              </>
            ) : (
              <>
                <p className="text-sm text-amber-400">⚠ Face not enrolled</p>
                <button onClick={() => navigate(`/employees/${id}/face-enroll`)} className="btn-primary w-full">
                  📸 Enroll Face
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {employee.photo && (
        <div className="card text-center">
          <h2 className="text-lg font-semibold text-white mb-4">Photo</h2>
          <img src={`/${employee.photo}`} alt={employee.name} className="w-32 h-32 rounded-lg object-cover mx-auto" />
        </div>
      )}
    </div>
  );
}