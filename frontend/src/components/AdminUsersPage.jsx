import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';
import { adminAPI, paymentAPI, resolveUploadUrl } from '../utils/api/api';
import useAuthStore from '../store/authStore';
import { INDIAN_STATES, getDistrictsForState } from '../utils/indiaLocations';

const emptyDistributorForm = {
  name: '',
  address: '',
  gstNo: '',
  panNo: '',
  aadharNo: '',
  distributorCode: '',
  state: '',
  district: '',
  otherDistrict: '',
  area: '',
  email: '',
  password: '',
};

const emptyAdminForm = {
  name: '',
  companyName: '',
  planCode: '',
  gstNo: '',
  aadharNo: '',
  panNo: '',
  email: '',
  password: '',
  logo: null,
};

const emptyStaffForm = {
  name: '',
  email: '',
  password: '',
  role: 'Manager',
};

const roleLabels = {
  SuperAdmin: 'Super Admin',
  Distributor: 'Distributor',
  Admin: 'Admin',
  Manager: 'Manager',
  HR: 'HR',
  Supervisor: 'Supervisor',
  Employee: 'Employee',
};

function FormField({ label, children, hint }) {
  return (
    <div className="space-y-2">
      <label className="label">{label}</label>
      {children}
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

function buildFormData(payload) {
  const formData = new FormData();
  Object.entries(payload).forEach(([key, value]) => {
    if (value == null || value === '') return;
    formData.append(key, value);
  });
  return formData;
}

function NavChip({ to, label, active }) {
  return (
    <Link
      to={to}
      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
        active ? 'bg-blue-600 text-white' : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
      }`}
    >
      {label}
    </Link>
  );
}

export default function AdminUsersPage() {
  const location = useLocation();
  const { user, isSuperAdmin, isDistributor, isAdmin } = useAuthStore();
  const [users, setUsers] = useState([]);
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState('');
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [distributorForm, setDistributorForm] = useState(emptyDistributorForm);
  const [adminForm, setAdminForm] = useState(emptyAdminForm);
  const [staffForm, setStaffForm] = useState(emptyStaffForm);

  const pageMode = isSuperAdmin()
    ? (location.pathname.includes('/admin/distributors') ? 'distributors' : location.pathname.includes('/admin/companies') ? 'companies' : 'companies')
    : 'users';

  const districts = useMemo(() => getDistrictsForState(distributorForm.state), [distributorForm.state]);

  useEffect(() => {
    fetchUsers();
    fetchPlans();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await adminAPI.users();
      const nextUsers = res.data.data || [];
      setUsers(nextUsers);
    } catch (error) {
      toast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const fetchPlans = async () => {
    try {
      const res = await paymentAPI.plans();
      const activePlans = (res.data.data || []).filter((plan) => plan.isActive);
      setPlans(activePlans);
      setAdminForm((prev) => (prev.planCode || activePlans.length === 0 ? prev : { ...prev, planCode: activePlans[0].code }));
    } catch (error) {
      toast.error('Failed to load plans');
    }
  };

  const distributors = useMemo(
    () => users.filter((item) => item.role === 'Distributor').sort((a, b) => a.name.localeCompare(b.name)),
    [users]
  );

  const companies = useMemo(
    () => users.filter((item) => item.role === 'Admin').sort((a, b) => (a.companyName || a.name).localeCompare(b.companyName || b.name)),
    [users]
  );

  useEffect(() => {
    if (pageMode === 'companies' && companies.length > 0 && !companies.some((item) => item._id === selectedCompanyId)) {
      setSelectedCompanyId(companies[0]._id);
    }
    if (pageMode === 'companies' && companies.length === 0) {
      setSelectedCompanyId('');
    }
  }, [pageMode, companies, selectedCompanyId]);

  const selectedCompany = companies.find((item) => item._id === selectedCompanyId) || null;
  const selectedCompanyUsers = useMemo(() => {
    if (!selectedCompany) return [];
    return users
      .filter((item) => item._id === selectedCompany._id || item.adminOwner === selectedCompany._id)
      .sort((a, b) => {
        const priority = ['Admin', 'Manager', 'HR', 'Supervisor', 'Employee'];
        return priority.indexOf(a.role) - priority.indexOf(b.role);
      });
  }, [users, selectedCompany]);

  const handleToggleActive = async (targetUser) => {
    try {
      await adminAPI.toggleActive(targetUser._id);
      toast.success('User status updated');
      fetchUsers();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to update user status');
    }
  };

  const handleUpdateRole = async (userId, newRole) => {
    try {
      await adminAPI.updateRole(userId, newRole);
      toast.success('User role updated');
      fetchUsers();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to update user role');
    }
  };

  const handleDeleteUser = async (targetUser) => {
    if (!window.confirm(`Delete ${targetUser.name} permanently?`)) return;
    try {
      await adminAPI.deleteUser(targetUser._id);
      toast.success('User deleted');
      fetchUsers();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to delete user');
    }
  };

  const handleResetPassword = async (targetUser) => {
    const newPassword = window.prompt(`Set new password for ${targetUser.name}`, '');
    if (newPassword == null) return;
    if (newPassword.trim().length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    try {
      await adminAPI.resetPassword(targetUser._id, newPassword.trim());
      toast.success('Password updated successfully');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to update password');
    }
  };

  const formatPlanDate = (value) => {
    if (!value) return 'N/A';
    return new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const renderSubscription = (item) => {
    if (item.role !== 'Admin') return <span className="text-slate-500">N/A</span>;
    return (
      <div className="space-y-1">
        <p className="font-medium text-slate-200">{item.subscription?.planLabel || 'No plan'}</p>
        <p className="text-xs text-slate-500">Ends {formatPlanDate(item.subscription?.endDate)}</p>
        {item.renewalNotice && <p className="text-xs text-amber-300">{item.renewalNotice.message}</p>}
      </div>
    );
  };

  const submitDistributor = async (e) => {
    e.preventDefault();
    setSubmitting('distributor');
    try {
      const payload = {
        ...distributorForm,
        role: 'Distributor',
        district: distributorForm.district === 'Other' ? distributorForm.otherDistrict : distributorForm.district,
      };
      await adminAPI.createUser(buildFormData(payload));
      toast.success('Distributor created successfully');
      setDistributorForm(emptyDistributorForm);
      fetchUsers();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to create distributor');
    } finally {
      setSubmitting('');
    }
  };

  const submitAdmin = async (e) => {
    e.preventDefault();
    setSubmitting('admin');
    try {
      await adminAPI.createUser(buildFormData({ ...adminForm, role: 'Admin' }));
      toast.success('Admin created successfully');
      setAdminForm({ ...emptyAdminForm, planCode: plans[0]?.code || '' });
      fetchUsers();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to create admin');
    } finally {
      setSubmitting('');
    }
  };

  const submitStaff = async (e) => {
    e.preventDefault();
    setSubmitting('staff');
    try {
      await adminAPI.createUser(buildFormData(staffForm));
      toast.success(`${staffForm.role} created successfully`);
      setStaffForm(emptyStaffForm);
      fetchUsers();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to create team member');
    } finally {
      setSubmitting('');
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const renderActions = (item, allowRoleEdit = false) => {
    const canDelete = !['SuperAdmin', 'Distributor', 'Admin'].includes(item.role);

    return (
      <tr key={item._id} className="border-b border-slate-800 hover:bg-slate-900/40">
        <td className="py-3 px-4">
          <div className="flex items-center gap-3">
            {item.logo ? (
              <img src={resolveUploadUrl(item.logo)} alt={item.name} className="w-10 h-10 rounded-lg object-cover border border-slate-700" />
            ) : (
              <div className="w-10 h-10 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 font-semibold">
                {item.name?.charAt(0)?.toUpperCase()}
              </div>
            )}
            <div>
              <p className="font-medium text-white">{item.companyName || item.name}</p>
              <p className="text-xs text-slate-500">{item.email}</p>
            </div>
          </div>
        </td>
        <td className="py-3 px-4">
          {allowRoleEdit ? (
            <select value={item.role} onChange={(e) => handleUpdateRole(item._id, e.target.value)} className="input input-sm w-36">
              <option value="Manager">Manager</option>
              <option value="HR">HR</option>
              <option value="Supervisor">Supervisor</option>
            </select>
          ) : (
            <span className="text-sm font-medium text-slate-200">{roleLabels[item.role] || item.role}</span>
          )}
        </td>
        <td className="py-3 px-4">
          <span className={`px-2 py-1 rounded text-xs font-semibold ${item.isActive ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'}`}>
            {item.isActive ? 'Active' : 'Inactive'}
          </span>
        </td>
        <td className="py-3 px-4">{renderSubscription(item)}</td>
        <td className="py-3 px-4">
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => handleResetPassword(item)} className="btn-primary btn-sm whitespace-nowrap">Set Password</button>
            {item._id !== user?._id && (
              <button onClick={() => handleToggleActive(item)} className="btn-secondary btn-sm whitespace-nowrap">
                {item.isActive ? 'Deactivate' : 'Activate'}
              </button>
            )}
            {canDelete && (
              <button onClick={() => handleDeleteUser(item)} className="btn-danger btn-sm whitespace-nowrap">Delete</button>
            )}
          </div>
        </td>
      </tr>
    );
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="space-y-3">
        <div>
          <h1 className="text-3xl font-bold text-white">
            {pageMode === 'distributors' ? 'Distributors' : pageMode === 'companies' ? 'Companies' : 'User Management'}
          </h1>
          <p className="text-slate-400">
            {isSuperAdmin()
              ? pageMode === 'distributors'
                ? 'Create and manage distributor partners.'
                : 'Select a company to see the users inside that tenant.'
              : isDistributor()
                ? 'Create and manage your admin customers.'
                : 'Create internal users for your company and manage access.'}
          </p>
        </div>

        {isSuperAdmin() && (
          <div className="flex gap-3">
            <NavChip to="/admin/distributors" label="Distributors" active={pageMode === 'distributors'} />
            <NavChip to="/admin/companies" label="Companies" active={pageMode === 'companies'} />
          </div>
        )}
      </div>

      {isSuperAdmin() && pageMode === 'distributors' && (
        <>
          <form onSubmit={submitDistributor} className="card space-y-4">
            <div>
              <h2 className="text-xl font-semibold text-white">Create Distributor</h2>
              <p className="text-sm text-slate-400">This account can onboard Admin companies under its network.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField label="Distributor Name *">
                <input className="input" value={distributorForm.name} onChange={(e) => setDistributorForm((prev) => ({ ...prev, name: e.target.value }))} required />
              </FormField>
              <FormField label="Distributor Code *">
                <input className="input uppercase" value={distributorForm.distributorCode} onChange={(e) => setDistributorForm((prev) => ({ ...prev, distributorCode: e.target.value.toUpperCase() }))} required />
              </FormField>
              <div className="md:col-span-2">
                <FormField label="Address *">
                  <textarea className="input min-h-24" value={distributorForm.address} onChange={(e) => setDistributorForm((prev) => ({ ...prev, address: e.target.value }))} required />
                </FormField>
              </div>
              <FormField label="State *">
                <select className="input" value={distributorForm.state} onChange={(e) => setDistributorForm((prev) => ({ ...prev, state: e.target.value, district: '', otherDistrict: '' }))} required>
                  <option value="">Select State</option>
                  {INDIAN_STATES.map((state) => <option key={state} value={state}>{state}</option>)}
                </select>
              </FormField>
              <FormField label="District *">
                <select className="input" value={distributorForm.district} onChange={(e) => setDistributorForm((prev) => ({ ...prev, district: e.target.value }))} required>
                  <option value="">Select District</option>
                  {districts.map((district) => <option key={district} value={district}>{district}</option>)}
                </select>
              </FormField>
              {distributorForm.district === 'Other' && (
                <FormField label="Enter District *">
                  <input className="input" value={distributorForm.otherDistrict} onChange={(e) => setDistributorForm((prev) => ({ ...prev, otherDistrict: e.target.value }))} required />
                </FormField>
              )}
              <FormField label="Area *">
                <input className="input" value={distributorForm.area} onChange={(e) => setDistributorForm((prev) => ({ ...prev, area: e.target.value }))} required />
              </FormField>
              <FormField label="GST">
                <input className="input uppercase" value={distributorForm.gstNo} onChange={(e) => setDistributorForm((prev) => ({ ...prev, gstNo: e.target.value.toUpperCase() }))} />
              </FormField>
              <FormField label="PAN">
                <input className="input uppercase" value={distributorForm.panNo} onChange={(e) => setDistributorForm((prev) => ({ ...prev, panNo: e.target.value.toUpperCase() }))} />
              </FormField>
              <FormField label="Aadhar">
                <input className="input" value={distributorForm.aadharNo} onChange={(e) => setDistributorForm((prev) => ({ ...prev, aadharNo: e.target.value.replace(/\D/g, '') }))} maxLength={12} />
              </FormField>
              <FormField label="E-mail *">
                <input className="input" type="email" value={distributorForm.email} onChange={(e) => setDistributorForm((prev) => ({ ...prev, email: e.target.value }))} required />
              </FormField>
              <FormField label="Password *">
                <input className="input" type="password" value={distributorForm.password} onChange={(e) => setDistributorForm((prev) => ({ ...prev, password: e.target.value }))} required />
              </FormField>
            </div>
            <div className="flex justify-end">
              <button type="submit" className="btn-primary" disabled={submitting === 'distributor'}>
                {submitting === 'distributor' ? 'Creating...' : 'Create Distributor'}
              </button>
            </div>
          </form>

          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-semibold text-white">Distributor Accounts</h2>
                <p className="text-sm text-slate-400">Only distributor accounts are shown here.</p>
              </div>
              <button onClick={fetchUsers} className="btn-secondary btn-sm">Refresh</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-slate-300">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="text-left py-3 px-4">Distributor</th>
                    <th className="text-left py-3 px-4">Role</th>
                    <th className="text-left py-3 px-4">Status</th>
                    <th className="text-left py-3 px-4">Plan</th>
                    <th className="text-left py-3 px-4">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {distributors.map((item) => renderActions(item, false))}
                </tbody>
              </table>
            </div>
            {distributors.length === 0 && <div className="text-center py-12 text-slate-500">No distributors found</div>}
          </div>
        </>
      )}

      {isSuperAdmin() && pageMode === 'companies' && (
        <>
          <form onSubmit={submitAdmin} className="card space-y-4">
            <div>
              <h2 className="text-xl font-semibold text-white">Create Company Admin</h2>
              <p className="text-sm text-slate-400">Create a new Admin company and then select it below to view its users.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField label="Admin Name *">
                <input className="input" value={adminForm.name} onChange={(e) => setAdminForm((prev) => ({ ...prev, name: e.target.value }))} required />
              </FormField>
              <FormField label="Company Name *">
                <input className="input" value={adminForm.companyName} onChange={(e) => setAdminForm((prev) => ({ ...prev, companyName: e.target.value }))} required />
              </FormField>
              <FormField label="Plan *">
                <select className="input" value={adminForm.planCode} onChange={(e) => setAdminForm((prev) => ({ ...prev, planCode: e.target.value }))} required>
                  <option value="">Select Plan</option>
                  {plans.map((plan) => (
                    <option key={plan.code} value={plan.code}>{plan.label} - Rs. {plan.amounts?.total || 0}</option>
                  ))}
                </select>
              </FormField>
              <FormField label="Logo">
                <input className="input file:mr-3 file:border-0 file:bg-slate-800 file:px-3 file:py-2 file:text-slate-200" type="file" accept="image/*" onChange={(e) => setAdminForm((prev) => ({ ...prev, logo: e.target.files?.[0] || null }))} />
              </FormField>
              <FormField label="GST">
                <input className="input uppercase" value={adminForm.gstNo} onChange={(e) => setAdminForm((prev) => ({ ...prev, gstNo: e.target.value.toUpperCase() }))} />
              </FormField>
              <FormField label="Aadhar">
                <input className="input" value={adminForm.aadharNo} onChange={(e) => setAdminForm((prev) => ({ ...prev, aadharNo: e.target.value.replace(/\D/g, '') }))} maxLength={12} />
              </FormField>
              <FormField label="PAN">
                <input className="input uppercase" value={adminForm.panNo} onChange={(e) => setAdminForm((prev) => ({ ...prev, panNo: e.target.value.toUpperCase() }))} />
              </FormField>
              <FormField label="E-mail *">
                <input className="input" type="email" value={adminForm.email} onChange={(e) => setAdminForm((prev) => ({ ...prev, email: e.target.value }))} required />
              </FormField>
              <FormField label="Password *">
                <input className="input" type="password" value={adminForm.password} onChange={(e) => setAdminForm((prev) => ({ ...prev, password: e.target.value }))} required />
              </FormField>
            </div>
            <div className="flex justify-end">
              <button type="submit" className="btn-primary" disabled={submitting === 'admin'}>
                {submitting === 'admin' ? 'Creating...' : 'Create Company'}
              </button>
            </div>
          </form>

          <div className="grid grid-cols-1 xl:grid-cols-[320px,1fr] gap-6">
            <div className="card space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-white">Companies</h2>
                  <p className="text-sm text-slate-400">Choose a company to view its users.</p>
                </div>
                <button onClick={fetchUsers} className="btn-secondary btn-sm">Refresh</button>
              </div>
              <div className="space-y-2">
                {companies.map((company) => (
                  <button
                    key={company._id}
                    type="button"
                    onClick={() => setSelectedCompanyId(company._id)}
                    className={`w-full text-left p-4 rounded-xl border transition-colors ${
                      selectedCompanyId === company._id
                        ? 'border-blue-500 bg-blue-950/30'
                        : 'border-slate-800 bg-slate-900 hover:bg-slate-800'
                    }`}
                  >
                    <p className="font-semibold text-white">{company.companyName || company.name}</p>
                    <p className="text-sm text-slate-400 mt-1">{company.email}</p>
                    <p className="text-xs text-slate-500 mt-2">{company.name}</p>
                    <p className="text-xs text-slate-400 mt-2">{company.subscription?.planLabel || 'No plan'} - Ends {formatPlanDate(company.subscription?.endDate)}</p>
                  </button>
                ))}
              </div>
              {companies.length === 0 && <div className="text-center py-12 text-slate-500">No companies found</div>}
            </div>

            <div className="card">
              {selectedCompany ? (
                <>
                  <div className="flex items-start justify-between gap-4 mb-5">
                    <div className="flex items-center gap-4">
                      {selectedCompany.logo ? (
                        <img src={resolveUploadUrl(selectedCompany.logo)} alt={selectedCompany.companyName || selectedCompany.name} className="w-14 h-14 rounded-xl object-cover border border-slate-700" />
                      ) : (
                        <div className="w-14 h-14 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 font-semibold text-lg">
                          {(selectedCompany.companyName || selectedCompany.name)?.charAt(0)?.toUpperCase()}
                        </div>
                      )}
                      <div>
                        <h2 className="text-xl font-semibold text-white">{selectedCompany.companyName || selectedCompany.name}</h2>
                        <p className="text-sm text-slate-400">{selectedCompany.email}</p>
                        <p className="text-xs text-slate-500 mt-1">Admin owner: {selectedCompany.name}</p>
                      </div>
                    </div>
                    <div className="text-right text-sm text-slate-400">
                      <p>Users in company</p>
                      <p className="text-2xl font-bold text-white">{selectedCompanyUsers.length}</p>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-slate-300">
                      <thead>
                        <tr className="border-b border-slate-700">
                          <th className="text-left py-3 px-4">User</th>
                          <th className="text-left py-3 px-4">Role</th>
                          <th className="text-left py-3 px-4">Status</th>
                          <th className="text-left py-3 px-4">Plan</th>
                          <th className="text-left py-3 px-4">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedCompanyUsers.map((item) => renderActions(item, false))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <div className="text-center py-16 text-slate-500">Select a company to view its users</div>
              )}
            </div>
          </div>
        </>
      )}

      {!isSuperAdmin() && (isDistributor() || isAdmin()) && (
        <>
          {isDistributor() && (
            <form onSubmit={submitAdmin} className="card space-y-4">
              <div>
                <h2 className="text-xl font-semibold text-white">Create Admin</h2>
                <p className="text-sm text-slate-400">This Admin will manage its own employees and internal team.</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField label="Admin Name *">
                  <input className="input" value={adminForm.name} onChange={(e) => setAdminForm((prev) => ({ ...prev, name: e.target.value }))} required />
                </FormField>
                <FormField label="Company Name *">
                  <input className="input" value={adminForm.companyName} onChange={(e) => setAdminForm((prev) => ({ ...prev, companyName: e.target.value }))} required />
                </FormField>
                <FormField label="Plan *">
                  <select className="input" value={adminForm.planCode} onChange={(e) => setAdminForm((prev) => ({ ...prev, planCode: e.target.value }))} required>
                    <option value="">Select Plan</option>
                    {plans.map((plan) => (
                      <option key={plan.code} value={plan.code}>{plan.label} - Rs. {plan.amounts?.total || 0}</option>
                    ))}
                  </select>
                </FormField>
                <FormField label="Logo">
                  <input className="input file:mr-3 file:border-0 file:bg-slate-800 file:px-3 file:py-2 file:text-slate-200" type="file" accept="image/*" onChange={(e) => setAdminForm((prev) => ({ ...prev, logo: e.target.files?.[0] || null }))} />
                </FormField>
                <FormField label="GST">
                  <input className="input uppercase" value={adminForm.gstNo} onChange={(e) => setAdminForm((prev) => ({ ...prev, gstNo: e.target.value.toUpperCase() }))} />
                </FormField>
                <FormField label="Aadhar">
                  <input className="input" value={adminForm.aadharNo} onChange={(e) => setAdminForm((prev) => ({ ...prev, aadharNo: e.target.value.replace(/\D/g, '') }))} maxLength={12} />
                </FormField>
                <FormField label="PAN">
                  <input className="input uppercase" value={adminForm.panNo} onChange={(e) => setAdminForm((prev) => ({ ...prev, panNo: e.target.value.toUpperCase() }))} />
                </FormField>
                <FormField label="E-mail *">
                  <input className="input" type="email" value={adminForm.email} onChange={(e) => setAdminForm((prev) => ({ ...prev, email: e.target.value }))} required />
                </FormField>
                <FormField label="Password *">
                  <input className="input" type="password" value={adminForm.password} onChange={(e) => setAdminForm((prev) => ({ ...prev, password: e.target.value }))} required />
                </FormField>
              </div>
              <div className="flex justify-end">
                <button type="submit" className="btn-primary" disabled={submitting === 'admin'}>
                  {submitting === 'admin' ? 'Creating...' : 'Create Admin'}
                </button>
              </div>
            </form>
          )}

          {isAdmin() && (
            <form onSubmit={submitStaff} className="card space-y-4">
              <div>
                <h2 className="text-xl font-semibold text-white">Create Internal User</h2>
                <p className="text-sm text-slate-400">Add Manager, HR, or Supervisor accounts under your Admin tenant.</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField label="Name *">
                  <input className="input" value={staffForm.name} onChange={(e) => setStaffForm((prev) => ({ ...prev, name: e.target.value }))} required />
                </FormField>
                <FormField label="Role *">
                  <select className="input" value={staffForm.role} onChange={(e) => setStaffForm((prev) => ({ ...prev, role: e.target.value }))}>
                    <option value="Manager">Manager</option>
                    <option value="HR">HR</option>
                    <option value="Supervisor">Supervisor</option>
                  </select>
                </FormField>
                <FormField label="E-mail *">
                  <input className="input" type="email" value={staffForm.email} onChange={(e) => setStaffForm((prev) => ({ ...prev, email: e.target.value }))} required />
                </FormField>
                <FormField label="Password *">
                  <input className="input" type="password" value={staffForm.password} onChange={(e) => setStaffForm((prev) => ({ ...prev, password: e.target.value }))} required />
                </FormField>
              </div>
              <div className="flex justify-end">
                <button type="submit" className="btn-primary" disabled={submitting === 'staff'}>
                  {submitting === 'staff' ? 'Creating...' : `Create ${staffForm.role}`}
                </button>
              </div>
            </form>
          )}

          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-semibold text-white">{isDistributor() ? 'Admin Accounts' : 'Company Users'}</h2>
                <p className="text-sm text-slate-400">
                  {isDistributor() ? 'Only your admin companies are shown here.' : 'Users are already limited to your company.'}
                </p>
              </div>
              <button onClick={fetchUsers} className="btn-secondary btn-sm">Refresh</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-slate-300">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="text-left py-3 px-4">Account</th>
                    <th className="text-left py-3 px-4">Role</th>
                    <th className="text-left py-3 px-4">Status</th>
                    <th className="text-left py-3 px-4">Plan</th>
                    <th className="text-left py-3 px-4">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(isDistributor() ? companies : users).map((item) => renderActions(item, user?.role === 'Admin' && ['Manager', 'HR', 'Supervisor'].includes(item.role) && !item.employee))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
