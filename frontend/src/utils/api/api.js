import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || '/api';
const API_ROOT = API_BASE.endsWith('/api') ? API_BASE.slice(0, -4) : API_BASE;

const api = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
});

// Request interceptor – attach JWT
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('att_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor – handle 401
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('att_token');
      localStorage.removeItem('att_user');
      window.location.href = '/login';
    }
    if (error.response?.status === 402 && window.location.pathname !== '/billing') {
      window.location.href = '/billing';
    }
    return Promise.reject(error);
  }
);

// ─── Auth ────────────────────────────────────────────────────────────────────
export const authAPI = {
  login: (data) => api.post('/auth/login', data),
  me: () => api.get('/auth/me'),
  changePassword: (data) => api.post('/auth/change-password', data),
  updateProfile: (data) => api.put('/auth/profile', data),
  logout: () => api.post('/auth/logout'),
};

// ─── Employees ───────────────────────────────────────────────────────────────
export const employeeAPI = {
  list: (params) => api.get('/employees', { params }),
  get: (id) => api.get(`/employees/${id}`),
  create: (formData) => api.post('/employees', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  update: (id, formData) => api.put(`/employees/${id}`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  delete: (id) => api.delete(`/employees/${id}`),
  toggleActive: (id) => api.put(`/employees/${id}/toggle-active`),
  deletePermanent: (id) => api.delete(`/employees/${id}/permanent`),
  enrollFace: (id, data) => api.post(`/employees/${id}/face-enroll`, data),
  getFaceDescriptors: (id) => api.get(`/employees/${id}/face-descriptors`),
  getAllFaceDescriptors: () => api.get('/employees/all/face-descriptors'),
};

// ─── Attendance ───────────────────────────────────────────────────────────────
export const attendanceAPI = {
  action: (data) => api.post('/attendance/action', data),
  today: (params) => api.get('/attendance/today', { params }),
  history: (params) => api.get('/attendance/history', { params }),
  logsForDate: (date, params) => api.get(`/attendance/logs/${date}`, { params }),
  summaryForDate: (date, params) => api.get(`/attendance/summary/${date}`, { params }),
  updateLog: (logId, data) => api.put(`/attendance/${logId}`, data),
};

// ─── Reports ─────────────────────────────────────────────────────────────────
export const reportAPI = {
  monthly: (params) => api.get('/reports/monthly', { params }),
  dashboard: () => api.get('/reports/dashboard'),
};

// ─── Admin ───────────────────────────────────────────────────────────────────
export const adminAPI = {
  users: () => api.get('/admin/users'),
  updateRole: (id, role) => api.put(`/admin/users/${id}/role`, { role }),
  toggleActive: (id) => api.put(`/admin/users/${id}/toggle-active`),
  createUser: (data) => api.post('/admin/users', data, { headers: { 'Content-Type': 'multipart/form-data' } }),
  deleteUser: (id) => api.delete(`/admin/users/${id}`),
  resetPassword: (id, newPassword) => api.put(`/admin/users/${id}/password`, { newPassword }),
};

export const paymentAPI = {
  plans: () => api.get('/payments/plans'),
  updatePlans: (plans) => api.put('/payments/plans', { plans }),
  transactions: () => api.get('/payments/transactions'),
  receipt: (id) => api.get(`/payments/transactions/${id}/receipt`),
  createRenewalOrder: (planCode) => api.post('/payments/renewal/order', { planCode }),
  verifyRenewalPayment: (data) => api.post('/payments/renewal/verify', data),
};

export const leaveAPI = {
  getPolicy: () => api.get('/leaves/policy'),
  updatePolicy: (leaveTypes) => api.put('/leaves/policy', { leaveTypes }),
  listRequests: (params) => api.get('/leaves/requests', { params }),
  createRequest: (data) => api.post('/leaves/requests', data),
  updateStatus: (id, data) => api.put(`/leaves/requests/${id}/status`, data),
};

export const payrollAPI = {
  getPolicy: () => api.get('/payroll/policy'),
  updatePolicy: (data) => api.put('/payroll/policy', data),
  listRuns: (params) => api.get('/payroll/runs', { params }),
  generate: (month) => api.post('/payroll/generate', { month }),
};

export const resolveUploadUrl = (assetPath) => {
  if (!assetPath) return null;
  if (/^https?:\/\//i.test(assetPath)) return assetPath;
  const normalized = assetPath.startsWith('/') ? assetPath : `/${assetPath}`;
  return `${API_ROOT}${normalized}`;
};

export default api;
