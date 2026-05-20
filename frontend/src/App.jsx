import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import useAuthStore from './store/authStore';
import './App.css';

// Layouts
import AppLayout from './layout/AppLayout';
import ProtectedRoute from './components/ProtectedRoute';

// Pages
import LoginPage from './components/LoginPage';
import DashboardPage from './components/DashboardPage';
import EmployeeListPage from './components/EmployeeListPage';
import EmployeeFormPage from './components/EmployeeFormPage';
import EmployeeDetailPage from './components/EmployeeDetailPage';
import FaceEnrollPage from './components/FaceEnrollPage';
import AttendancePage from './components/AttendancePage';
import AttendanceLogPage from './components/AttendanceLogPage';
import MonthlyReportPage from './components/MonthlyReportPage';
import AdminUsersPage from './components/AdminUsersPage';
import ProfilePage from './components/ProfilePage';
import PayrollPage from './components/PayrollPage';
import LeaveManagementPage from './components/LeaveManagementPage';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    console.error('Error boundary caught:', error);
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Component error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ width: '100%', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0f172a' }}>
          <div style={{ maxWidth: '600px', padding: '40px', backgroundColor: '#1e293b', borderRadius: '8px', color: 'white', textAlign: 'center' }}>
            <h2 style={{ color: '#ef4444', marginBottom: '20px' }}>Component Error</h2>
            <p style={{ color: '#94a3b8', marginBottom: '20px', wordBreak: 'break-all' }}>
              {this.state.error?.message || 'Unknown error'}
            </p>
            <button 
              onClick={() => window.location.reload()} 
              style={{ backgroundColor: '#3b82f6', color: 'white', padding: '10px 20px', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

function AppRoutes() {
  const { user, fetchMe } = useAuthStore();
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    console.log('AppRoutes: Initializing...');
    const init = async () => {
      try {
        const token = localStorage.getItem('att_token');
        if (token) {
          console.log('Token found, fetching user...');
          await fetchMe();
        }
      } catch (err) {
        console.error('Auth error:', err);
      } finally {
        setInitialized(true);
      }
    };
    init();
  }, []);

  if (!initialized) {
    return (
      <div style={{ width: '100%', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0f172a' }}>
        <p style={{ color: '#94a3b8' }}>Loading...</p>
      </div>
    );
  }

  console.log('User state:', user);

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
        <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route index element={<DashboardPage />} />
          <Route element={<ProtectedRoute roles={['Admin', 'Manager', 'HR', 'Supervisor']} />}>
            <Route path="employees">
              <Route index element={<EmployeeListPage />} />
              <Route path="new" element={<EmployeeFormPage />} />
              <Route path=":id" element={<EmployeeDetailPage />} />
              <Route path=":id/edit" element={<EmployeeFormPage />} />
              <Route path=":id/face-enroll" element={<FaceEnrollPage />} />
            </Route>
            <Route path="attendance/logs" element={<AttendanceLogPage />} />
            <Route path="reports/monthly" element={<MonthlyReportPage />} />
          </Route>
          <Route element={<ProtectedRoute roles={['SuperAdmin', 'Distributor', 'Admin']} />}>
            <Route path="admin/users" element={<AdminUsersPage />} />
            <Route path="admin/distributors" element={<AdminUsersPage />} />
            <Route path="admin/companies" element={<AdminUsersPage />} />
          </Route>
          <Route element={<ProtectedRoute roles={['Employee', 'Admin', 'Manager', 'HR', 'Supervisor']} />}>
            <Route path="attendance" element={<AttendancePage />} />
            <Route path="leaves" element={<LeaveManagementPage />} />
            <Route path="payroll" element={<PayrollPage />} />
          </Route>
          <Route path="profile" element={<ProfilePage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to={user ? "/" : "/login"} replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Toaster
          position="top-right"
          toastOptions={{
            style: { background: '#1e293b', color: '#f1f5f9', border: '1px solid #334155' },
            success: { iconTheme: { primary: '#10b981', secondary: '#f1f5f9' } },
            error: { iconTheme: { primary: '#ef4444', secondary: '#f1f5f9' } },
          }}
        />
        <AppRoutes />
      </BrowserRouter>
    </ErrorBoundary>
  );
}
