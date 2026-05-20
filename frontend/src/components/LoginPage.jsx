import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import useAuthStore from '../store/authStore';

export default function LoginPage() {
  const [email, setEmail] = useState('superadmin@attendanceiq.com');
  const [password, setPassword] = useState('Super@123');
  const [showPw, setShowPw] = useState(false);
  const { login, loading } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await login(email, password);
      toast.success('Welcome back!');
      navigate('/');
    } catch (err) {
      toast.error(err.message || 'Login failed');
    }
  };

  return (
    <div style={{ 
      width: '100%', 
      minHeight: '100vh', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center', 
      backgroundColor: '#0f172a',
      padding: '20px',
      fontFamily: 'Inter, system-ui, sans-serif'
    }}>
      <div style={{ width: '100%', maxWidth: '400px' }}>
        {/* Logo Section */}
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <h1 style={{ fontSize: '28px', fontWeight: 'bold', color: 'white', margin: '0 0 10px 0' }}>
            AttendanceIQ
          </h1>
          <p style={{ color: '#94a3b8', fontSize: '14px', margin: '0' }}>
            Smart Employee Attendance System
          </p>
        </div>

        {/* Login Card */}
        <div style={{ 
          backgroundColor: '#1e293b', 
          border: '1px solid #334155', 
          borderRadius: '8px', 
          padding: '32px'
        }}>
          <h2 style={{ 
            fontSize: '18px', 
            fontWeight: '600', 
            color: 'white', 
            margin: '0 0 24px 0'
          }}>
            Sign in to your account
          </h2>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Email Input */}
            <div>
              <label style={{ 
                display: 'block', 
                fontSize: '14px', 
                fontWeight: '500', 
                color: '#cbd5e1', 
                margin: '0 0 8px 0'
              }}>
                Email address
              </label>
              <input
                type="email"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  backgroundColor: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  color: 'white',
                  fontSize: '14px',
                  outline: 'none',
                  boxSizing: 'border-box',
                  fontFamily: 'inherit'
                }}
                placeholder="superadmin@attendanceiq.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
            </div>

            {/* Password Input */}
            <div>
              <label style={{ 
                display: 'block', 
                fontSize: '14px', 
                fontWeight: '500', 
                color: '#cbd5e1', 
                margin: '0 0 8px 0'
              }}>
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPw ? 'text' : 'password'}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    paddingRight: '40px',
                    backgroundColor: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    color: 'white',
                    fontSize: '14px',
                    outline: 'none',
                    boxSizing: 'border-box',
                    fontFamily: 'inherit'
                  }}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  style={{
                    position: 'absolute',
                    right: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: '#94a3b8',
                    cursor: 'pointer',
                    fontSize: '18px',
                    padding: '0'
                  }}
                >
                  {showPw ? '👁️' : '👁️‍🗨️'}
                </button>
              </div>
            </div>

            {/* Sign In Button */}
            <button
              type="submit"
              disabled={loading}
              style={{
                backgroundColor: loading ? '#1e40af' : '#3b82f6',
                color: 'white',
                padding: '10px 16px',
                border: 'none',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: loading ? 'not-allowed' : 'pointer',
                marginTop: '8px',
                opacity: loading ? 0.7 : 1,
                fontFamily: 'inherit'
              }}
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          {/* Demo Info */}
          <div style={{ 
            marginTop: '20px', 
            paddingTop: '16px', 
            borderTop: '1px solid #334155',
            textAlign: 'center'
          }}>
            <p style={{ fontSize: '12px', color: '#64748b', margin: '0' }}>
              Demo: superadmin@attendanceiq.com / Super@123
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
