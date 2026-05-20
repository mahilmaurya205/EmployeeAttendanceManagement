import { create } from 'zustand';
import { authAPI } from '../utils/api/api';

const useAuthStore = create((set, get) => ({
  user: JSON.parse(localStorage.getItem('att_user') || 'null'),
  token: localStorage.getItem('att_token') || null,
  loading: false,
  error: null,

  login: async (email, password) => {
    set({ loading: true, error: null });
    try {
      const { data } = await authAPI.login({ email, password });
      localStorage.setItem('att_token', data.token);
      localStorage.setItem('att_user', JSON.stringify(data.user));
      set({ user: data.user, token: data.token, loading: false });
      return data;
    } catch (err) {
      const msg = err.response?.data?.message || 'Login failed';
      set({ error: msg, loading: false });
      throw new Error(msg);
    }
  },

  logout: async () => {
    try { await authAPI.logout(); } catch (_) {}
    localStorage.removeItem('att_token');
    localStorage.removeItem('att_user');
    set({ user: null, token: null });
  },

  fetchMe: async () => {
    try {
      const { data } = await authAPI.me();
      localStorage.setItem('att_user', JSON.stringify(data.user));
      set({ user: data.user });
    } catch (_) {
      get().logout();
    }
  },

  updateStoredUser: (user) => {
    localStorage.setItem('att_user', JSON.stringify(user));
    set({ user });
  },

  // Role helpers
  isSuperAdmin: () => get().user?.role === 'SuperAdmin',
  isDistributor: () => get().user?.role === 'Distributor',
  isAdmin:      () => ['Admin'].includes(get().user?.role),
  isManager:    () => ['Admin', 'Manager'].includes(get().user?.role),
  canModify:    () => ['Admin', 'Manager'].includes(get().user?.role),
  canViewAll:   () => ['SuperAdmin', 'Distributor', 'Admin', 'Manager', 'HR', 'Supervisor'].includes(get().user?.role),
  canManageUsers: () => ['SuperAdmin', 'Distributor', 'Admin'].includes(get().user?.role),
  isEmployee:   () => get().user?.role === 'Employee',
}));

export default useAuthStore;
