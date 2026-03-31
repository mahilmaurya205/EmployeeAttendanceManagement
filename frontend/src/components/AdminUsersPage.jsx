import React, { useState, useEffect } from 'react';
import { adminAPI } from '../utils/api/api';
import toast from 'react-hot-toast';

export default function AdminUsersPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await adminAPI.users();
      setUsers(res.data.data);
    } catch (error) {
      toast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleActive = async (userId) => {
    try {
      await adminAPI.toggleActive(userId);
      toast.success('User status updated');
      fetchUsers();
    } catch (error) {
      toast.error('Failed to update user status');
    }
  };

  const handleUpdateRole = async (userId, newRole) => {
    try {
      await adminAPI.updateRole(userId, newRole);
      toast.success('User role updated');
      fetchUsers();
    } catch (error) {
      toast.error('Failed to update user role');
    }
  };

  const handleDeleteUser = async (user) => {
    if (!window.confirm(`Delete ${user.name} permanently?${user.employee ? ' Linked employee and attendance data will also be deleted.' : ''}`)) return;
    try {
      await adminAPI.deleteUser(user._id);
      toast.success('User deleted');
      fetchUsers();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to delete user');
    }
  };

  const handleResetPassword = async (user) => {
    const newPassword = window.prompt(`Set new password for ${user.name}`, '');
    if (newPassword == null) return;
    if (newPassword.trim().length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    try {
      await adminAPI.resetPassword(user._id, newPassword.trim());
      toast.success('Password updated successfully');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to update password');
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold text-white">Admin Users</h1>
        <p className="text-slate-400">Manage system users and roles</p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm text-slate-300">
          <thead>
            <tr className="border-b border-slate-700">
              <th className="text-left py-3 px-4">Name</th>
              <th className="text-left py-3 px-4">Email</th>
              <th className="text-left py-3 px-4">Role</th>
              <th className="text-left py-3 px-4">Status</th>
              <th className="text-left py-3 px-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map(user => (
              <tr key={user._id} className="border-b border-slate-700 hover:bg-slate-800/50">
                <td className="py-3 px-4">{user.name}</td>
                <td className="py-3 px-4">{user.email}</td>
                <td className="py-3 px-4">
                  {user.role === 'Admin' || user.employee ? (
                    <span className="text-sm font-medium text-slate-200">{user.role}</span>
                  ) : (
                    <select value={user.role} onChange={(e) => handleUpdateRole(user._id, e.target.value)} className="input input-sm w-32">
                      <option value="Manager">Manager</option>
                      <option value="HR">HR</option>
                      <option value="Supervisor">Supervisor</option>
                    </select>
                  )}
                </td>
                <td className="py-3 px-4">
                  <span className={`px-2 py-1 rounded text-xs font-semibold ${user.isActive ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'}`}>
                    {user.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="py-3 px-4">
                  <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
                    <button onClick={() => handleResetPassword(user)} className="btn-primary btn-sm whitespace-nowrap">
                      Set Password
                    </button>
                    <button onClick={() => handleToggleActive(user._id)} className="btn-secondary btn-sm whitespace-nowrap">
                      {user.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                    {user.role !== 'Admin' && (
                      <button onClick={() => handleDeleteUser(user)} className="btn-danger btn-sm whitespace-nowrap">
                        Delete
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {users.length === 0 && (
        <div className="card text-center py-16 text-slate-500">No users found</div>
      )}
    </div>
  );
}
