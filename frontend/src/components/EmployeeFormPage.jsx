import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Webcam from 'react-webcam';
import toast from 'react-hot-toast';
import { employeeAPI, resolveUploadUrl } from '../utils/api/api';

const FormField = ({ label, error, children }) => (
  <div>
    <label className="label">{label}</label>
    {children}
    {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
  </div>
);

export default function EmployeeFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const webcamRef = useRef(null);
  const isEdit = !!id;

  const [form, setForm] = useState({
    name: '', employeeCode: '', email: '', mobile: '', department: 'IT Software',
    designation: '', aadharNo: '', panNo: '', password: '',
    address: { street: '', city: '', state: '', pincode: '' },
    workSchedule: { shiftStart: '09:00', shiftEnd: '18:00' },
  });
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [showWebcam, setShowWebcam] = useState(false);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isEdit) {
      employeeAPI.get(id).then(({ data }) => {
        const emp = data.data;
        setForm({
          name: emp.name || '', employeeCode: emp.employeeCode || '',
          email: emp.email || '', mobile: emp.mobile || '',
          department: emp.department || 'IT Software', designation: emp.designation || '',
          aadharNo: '', panNo: '', password: '',
          address: emp.address || { street: '', city: '', state: '', pincode: '' },
          workSchedule: {
            shiftStart: emp.workSchedule?.shiftStart || '09:00',
            shiftEnd: emp.workSchedule?.shiftEnd || '18:00',
          },
        });
        if (emp.photo) setPhotoPreview(resolveUploadUrl(emp.photo));
      });
    }
  }, [id, isEdit]);

  const set = (key, value) => setForm(f => ({ ...f, [key]: value }));
  const setAddr = (key, value) => setForm(f => ({ ...f, address: { ...f.address, [key]: value } }));
  const setWorkSchedule = (key, value) => setForm(f => ({ ...f, workSchedule: { ...f.workSchedule, [key]: value } }));

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = 'Name is required';
    if (!form.employeeCode.trim()) e.employeeCode = 'Employee code required';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Valid email required';
    if (!/^[6-9]\d{9}$/.test(form.mobile)) e.mobile = 'Valid 10-digit Indian mobile required';
    if (!form.workSchedule.shiftStart) e.shiftStart = 'Start time is required';
    if (!form.workSchedule.shiftEnd) e.shiftEnd = 'End time is required';
    if (!isEdit) {
      if (!/^\d{12}$/.test(form.aadharNo)) e.aadharNo = 'Aadhar must be 12 digits';
      if (!/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(form.panNo.toUpperCase())) e.panNo = 'Invalid PAN format (e.g. ABCDE1234F)';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const captureFromWebcam = () => {
    const screenshot = webcamRef.current?.getScreenshot();
    if (screenshot) {
      setPhotoPreview(screenshot);
      // Convert to File
      fetch(screenshot).then(r => r.blob()).then(blob => {
        const file = new File([blob], 'webcam-photo.jpg', { type: 'image/jpeg' });
        setPhotoFile(file);
      });
      setShowWebcam(false);
      toast.success('Photo captured');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    const formData = new FormData();
    Object.entries(form).forEach(([k, v]) => {
      if (k === 'address' || k === 'workSchedule') formData.append(k, JSON.stringify(v));
      else if (v) formData.append(k, v);
    });
    if (photoFile) formData.append('photo', photoFile);

    try {
      if (isEdit) {
        await employeeAPI.update(id, formData);
        toast.success('Employee updated!');
      } else {
        const { data } = await employeeAPI.create(formData);
        toast.success(`Employee created! ${data.defaultPassword ? `Default password: ${data.defaultPassword}` : ''}`);
      }
      navigate('/employees');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save employee.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
      <div className="flex items-center gap-4">
        <button onClick={() => navigate(-1)} className="text-slate-400 hover:text-white transition-colors">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </button>
        <h1 className="text-2xl font-bold text-white">{isEdit ? 'Edit Employee' : 'Add Employee'}</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Photo */}
        <div className="card">
          <h2 className="font-semibold text-white mb-4">Profile Photo</h2>
          <div className="flex items-center gap-6">
            <div className="w-24 h-24 rounded-xl overflow-hidden bg-slate-800 border border-slate-700 shrink-0">
              {photoPreview ? (
                <img src={photoPreview} alt="Preview" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-slate-600">
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                </div>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <label className="btn-secondary cursor-pointer">
                📁 Upload Photo
                <input type="file" accept="image/*" className="hidden" onChange={e => {
                  const f = e.target.files[0];
                  if (f) { setPhotoFile(f); setPhotoPreview(URL.createObjectURL(f)); }
                }} />
              </label>
              <button type="button" onClick={() => setShowWebcam(!showWebcam)} className="btn-secondary">
                📷 Use Webcam
              </button>
            </div>
          </div>
          {showWebcam && (
            <div className="mt-4 space-y-3">
              <Webcam ref={webcamRef} screenshotFormat="image/jpeg" className="w-full rounded-xl" videoConstraints={{ facingMode: 'user' }} />
              <button type="button" onClick={captureFromWebcam} className="btn-primary w-full">Capture</button>
            </div>
          )}
        </div>

        {/* Basic Info */}
        <div className="card">
          <h2 className="font-semibold text-white mb-4">Basic Information</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Full Name *" error={errors.name}>
              <input className="input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="John Doe" />
            </FormField>
            <FormField label="Employee Code *" error={errors.employeeCode}>
              <input className="input uppercase" value={form.employeeCode} onChange={e => set('employeeCode', e.target.value.toUpperCase())} placeholder="EMP001" disabled={isEdit} />
            </FormField>
            <FormField label="Email *" error={errors.email}>
              <input className="input" type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="john@company.com" />
            </FormField>
            <FormField label="Mobile *" error={errors.mobile}>
              <input className="input" value={form.mobile} onChange={e => set('mobile', e.target.value)} placeholder="9876543210" maxLength={10} />
            </FormField>
            <FormField label="Department *">
              <select className="input" value={form.department} onChange={e => set('department', e.target.value)}>
                <option value="IT Software">IT Software</option>
                <option value="IT Hardware">IT Hardware</option>
              </select>
            </FormField>
            <FormField label="Designation">
              <input className="input" value={form.designation} onChange={e => set('designation', e.target.value)} placeholder="Software Engineer" />
            </FormField>
            {!isEdit && (
              <FormField label="Initial Password">
                <input className="input" value={form.password} onChange={e => set('password', e.target.value)} placeholder="Leave blank for auto-generated" />
              </FormField>
            )}
          </div>
        </div>

        <div className="card">
          <h2 className="font-semibold text-white mb-4">Work Schedule</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Shift Start *" error={errors.shiftStart}>
              <input
                className="input"
                type="time"
                value={form.workSchedule.shiftStart}
                onChange={e => setWorkSchedule('shiftStart', e.target.value)}
              />
            </FormField>
            <FormField label="Shift End *" error={errors.shiftEnd}>
              <input
                className="input"
                type="time"
                value={form.workSchedule.shiftEnd}
                onChange={e => setWorkSchedule('shiftEnd', e.target.value)}
              />
            </FormField>
          </div>
          <p className="text-xs text-slate-500 mt-3">Late attendance is counted only if punch-in happens more than 30 minutes after shift start.</p>
        </div>

        {/* Identity */}
        {!isEdit && (
          <div className="card">
            <h2 className="font-semibold text-white mb-4">Identity Documents</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField label="Aadhar Number *" error={errors.aadharNo}>
                <input className="input font-mono" value={form.aadharNo} onChange={e => set('aadharNo', e.target.value.replace(/\D/g, ''))} placeholder="123456789012" maxLength={12} />
              </FormField>
              <FormField label="PAN Number *" error={errors.panNo}>
                <input className="input font-mono uppercase" value={form.panNo} onChange={e => set('panNo', e.target.value.toUpperCase())} placeholder="ABCDE1234F" maxLength={10} />
              </FormField>
            </div>
          </div>
        )}

        {/* Address */}
        <div className="card">
          <h2 className="font-semibold text-white mb-4">Address</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <FormField label="Street">
                <input className="input" value={form.address.street} onChange={e => setAddr('street', e.target.value)} placeholder="123 Main St" />
              </FormField>
            </div>
            <FormField label="City"><input className="input" value={form.address.city} onChange={e => setAddr('city', e.target.value)} placeholder="Ahmedabad" /></FormField>
            <FormField label="State"><input className="input" value={form.address.state} onChange={e => setAddr('state', e.target.value)} placeholder="Gujarat" /></FormField>
            <FormField label="Pincode"><input className="input" value={form.address.pincode} onChange={e => setAddr('pincode', e.target.value.replace(/\D/g, ''))} placeholder="380001" maxLength={6} /></FormField>
          </div>
        </div>

        {/* Submit */}
        <div className="flex gap-3 justify-end">
          <button type="button" onClick={() => navigate(-1)} className="btn-secondary">Cancel</button>
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? (
              <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Saving...</>
            ) : (isEdit ? '💾 Update Employee' : '➕ Create Employee')}
          </button>
        </div>
      </form>
    </div>
  );
}
