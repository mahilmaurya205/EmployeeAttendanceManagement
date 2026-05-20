import React, { useState } from 'react';
import { authAPI } from '../utils/api/api';
import useAuthStore from '../store/authStore';
import toast from 'react-hot-toast';
import { getCurrentLocation } from '../services/geolocation';

export default function ProfilePage() {
  const { user, logout, updateStoredUser } = useAuthStore();
  const employeeCode = typeof user?.employee === 'object' ? user?.employee?.employeeCode : user?.employeeCode;
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [savingLocation, setSavingLocation] = useState(false);
  const [officeLocation, setOfficeLocation] = useState({
    latitude: user?.officeLocation?.latitude ?? user?.resolvedOfficeLocation?.latitude ?? '',
    longitude: user?.officeLocation?.longitude ?? user?.resolvedOfficeLocation?.longitude ?? '',
    radius: user?.officeLocation?.radius ?? user?.resolvedOfficeLocation?.radius ?? 100,
  });
  const [attendancePolicy, setAttendancePolicy] = useState({
    halfDayLateAfterMinutes: user?.attendancePolicy?.halfDayLateAfterMinutes ?? user?.resolvedAttendancePolicy?.halfDayLateAfterMinutes ?? 30,
  });

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    if (newPassword.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    try {
      await authAPI.changePassword({ oldPassword, newPassword });
      toast.success('Password changed successfully');
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error) {
      toast.error('Failed to change password');
    } finally {
      setLoading(false);
    }
  };

  const handleUseCurrentLocation = async () => {
    setSavingLocation(true);
    try {
      const current = await getCurrentLocation();
      setOfficeLocation((prev) => ({
        ...prev,
        latitude: current.latitude.toFixed(6),
        longitude: current.longitude.toFixed(6),
      }));
      toast.success('Current location captured');
    } catch (error) {
      toast.error(error.message || 'Failed to capture location');
    } finally {
      setSavingLocation(false);
    }
  };

  const handleSaveOfficeLocation = async (e) => {
    e.preventDefault();
    setSavingLocation(true);
    try {
      const { data } = await authAPI.updateProfile({
        officeLocation: {
          latitude: Number(officeLocation.latitude),
          longitude: Number(officeLocation.longitude),
          radius: Number(officeLocation.radius),
        },
        attendancePolicy: {
          halfDayLateAfterMinutes: Number(attendancePolicy.halfDayLateAfterMinutes),
        },
      });
      updateStoredUser(data.user);
      toast.success('Office location updated successfully');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to update office location');
    } finally {
      setSavingLocation(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-2xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold text-white">My Profile</h1>
        <p className="text-slate-400">Manage your account settings</p>
      </div>

      <div className="card">
        <h2 className="text-lg font-semibold text-white mb-4">Profile Information</h2>
        <div className="space-y-3 text-sm">
          <div><span className="text-slate-400">Name:</span> <span className="text-white">{user?.name}</span></div>
          <div><span className="text-slate-400">Email:</span> <span className="text-white">{user?.email}</span></div>
          <div><span className="text-slate-400">Role:</span> <span className="text-white capitalize">{user?.role}</span></div>
          <div><span className="text-slate-400">Employee Code:</span> <span className="text-white">{employeeCode || 'N/A'}</span></div>
          {user?.adminCompanyName && <div><span className="text-slate-400">Company:</span> <span className="text-white">{user.adminCompanyName}</span></div>}
        </div>
      </div>

      {user?.role === 'Admin' && (
        <div className="card">
          <h2 className="text-lg font-semibold text-white mb-4">Office Attendance Location</h2>
          <form onSubmit={handleSaveOfficeLocation} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="label text-sm text-slate-300">Latitude</label>
                <input
                  type="text"
                  className="input"
                  value={officeLocation.latitude || 'Use current location to capture latitude'}
                  readOnly
                />
              </div>
              <div>
                <label className="label text-sm text-slate-300">Longitude</label>
                <input
                  type="text"
                  className="input"
                  value={officeLocation.longitude || 'Use current location to capture longitude'}
                  readOnly
                />
              </div>
              <div>
                <label className="label text-sm text-slate-300">Radius (meters)</label>
                <input
                  type="number"
                  min="1"
                  className="input"
                  value={officeLocation.radius}
                  onChange={(e) => setOfficeLocation((prev) => ({ ...prev, radius: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="label text-sm text-slate-300">Half Day After Late Minutes</label>
                <input
                  type="number"
                  min="0"
                  className="input"
                  value={attendancePolicy.halfDayLateAfterMinutes}
                  onChange={(e) => setAttendancePolicy((prev) => ({ ...prev, halfDayLateAfterMinutes: e.target.value }))}
                  required
                />
              </div>
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={handleUseCurrentLocation} className="btn-secondary" disabled={savingLocation}>
                Use Current Location
              </button>
              <button type="submit" className="btn-primary" disabled={savingLocation}>
                {savingLocation ? 'Saving...' : 'Save Office Location'}
              </button>
            </div>
            <p className="text-xs text-slate-500">
              Latitude and longitude are captured automatically from your current device location. All users under this Admin will be required to punch in, punch out, break start, and break end within this radius. Half day will apply after the late minutes you set here.
            </p>
          </form>
        </div>
      )}

      <div className="card">
        <h2 className="text-lg font-semibold text-white mb-4">Change Password</h2>
        <form onSubmit={handleChangePassword} className="space-y-4">
          <div>
            <label className="label text-sm text-slate-300">Current Password</label>
            <input type="password" className="input" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} required />
          </div>
          <div>
            <label className="label text-sm text-slate-300">New Password</label>
            <input type="password" className="input" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
          </div>
          <div>
            <label className="label text-sm text-slate-300">Confirm Password</label>
            <input type="password" className="input" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
          </div>
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? 'Updating...' : 'Update Password'}
          </button>
        </form>
      </div>

      <div className="card">
        <button onClick={logout} className="btn-danger w-full">
          🚪 Logout
        </button>
      </div>
    </div>
  );
}
