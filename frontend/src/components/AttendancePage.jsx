import React, { useState, useEffect, useCallback, useRef } from 'react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import useAuthStore from '../store/authStore';
import { attendanceAPI, employeeAPI } from '../utils/api/api';
import { getCurrentLocation } from '../services/geolocation';
import { loadModels, detectFace, matchFace, buildLabeledDescriptors, captureSnapshot } from './faceRecognition';
import Webcam from 'react-webcam';

const ACTION_CONFIG = {
  PUNCH_IN:    { label: 'Punch In',    color: 'btn-success',  next: 'PUNCH_OUT',   icon: '🟢' },
  PUNCH_OUT:   { label: 'Punch Out',   color: 'btn-danger',   next: null,          icon: '🔴' },
  BREAK_START: { label: 'Take Break',  color: 'btn-secondary',next: 'BREAK_END',   icon: '☕' },
  BREAK_END:   { label: 'Break Done',  color: 'btn-primary',  next: 'PUNCH_OUT',   icon: '▶️' },
};

const ALLOWED_ACTIONS = {
  NOT_STARTED: ['PUNCH_IN'],
  PUNCH_IN:    ['PUNCH_OUT', 'BREAK_START'],
  BREAK_START: ['BREAK_END'],
  BREAK_END:   ['PUNCH_OUT', 'BREAK_START'],
  PUNCH_OUT:   [],
};

export default function AttendancePage() {
  const { user } = useAuthStore();
  const webcamRef = useRef(null);
  const canvasRef = useRef(null);

  const [todayData, setTodayData] = useState(null);
  const [location, setLocation] = useState(null);
  const [locationError, setLocationError] = useState(null);
  const [outsideReason, setOutsideReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeAction, setActiveAction] = useState(null);
  const [faceStage, setFaceStage] = useState('idle'); // idle | scanning | verified | failed
  const [faceResult, setFaceResult] = useState(null);
  const [labeledDescriptors, setLabeledDescriptors] = useState(null);
  const [modelsReady, setModelsReady] = useState(false);
  const scanInterval = useRef(null);

  const currentStatus = todayData?.currentStatus || 'NOT_STARTED';
  const allowedActions = ALLOWED_ACTIONS[currentStatus] || [];

  // Fetch today's status
  const fetchToday = async () => {
    try {
      const { data } = await attendanceAPI.today();
      setTodayData(data.data);
    } catch (_) {}
  };

  // Load location
  const fetchLocation = async () => {
    try {
      const loc = await getCurrentLocation();
      setLocation(loc);
      setLocationError(null);
    } catch (err) {
      setLocationError(err.message);
    }
  };

  // Load face models + descriptors
  const initFace = async () => {
    const ok = await loadModels();
    setModelsReady(ok);
    if (ok) {
      try {
        const { data } = await employeeAPI.getAllFaceDescriptors();
        const descriptors = buildLabeledDescriptors(data.data);
        setLabeledDescriptors(descriptors);
      } catch (_) {}
    }
  };

  useEffect(() => {
    fetchToday();
    fetchLocation();
    initFace();
    const interval = setInterval(fetchToday, 30000);
    return () => { clearInterval(interval); clearInterval(scanInterval.current); };
  }, []);

  // Face scan loop
  const startFaceScan = useCallback(() => {
    setFaceStage('scanning');
    setFaceResult(null);

    scanInterval.current = setInterval(async () => {
      const video = webcamRef.current?.video;
      if (!video || video.readyState !== 4 || !modelsReady) return;

      const detection = await detectFace(video);
      if (!detection) return;

      const result = matchFace(detection.descriptor, labeledDescriptors);
      if (result.matched) {
        clearInterval(scanInterval.current);
        setFaceStage('verified');
        setFaceResult(result);
      } else {
        setFaceStage('failed');
        setTimeout(() => setFaceStage('scanning'), 2000);
      }
    }, 500);
  }, [modelsReady, labeledDescriptors]);

  const stopFaceScan = () => {
    clearInterval(scanInterval.current);
    setFaceStage('idle');
    setFaceResult(null);
  };

  const handleActionClick = (action) => {
    setActiveAction(action);
    setFaceStage('idle');
    setFaceResult(null);
    setOutsideReason('');
  };

  const handleSubmit = async () => {
    if (faceStage !== 'verified' || !faceResult) {
      toast.error('Please complete face verification first.');
      return;
    }
    if (!location) {
      toast.error('Location is required. ' + (locationError || ''));
      return;
    }

    const employee = user?.employee;
    const dept = typeof employee === 'object' ? employee?.department : null;
    if (dept === 'IT Hardware' && !location.isOfficeLocation && !outsideReason.trim()) {
      toast.error('Please provide a reason for being outside the office.');
      return;
    }

    const snapshot = webcamRef.current ? captureSnapshot(webcamRef.current.video) : null;
    setLoading(true);

    try {
      await attendanceAPI.action({
        action: activeAction,
        location: { latitude: location.latitude, longitude: location.longitude, accuracy: location.accuracy },
        faceVerified: true,
        faceMatchScore: faceResult.score,
        snapshotBase64: snapshot,
        outsideReason: outsideReason || undefined,
      });

      toast.success(`${ACTION_CONFIG[activeAction].label} recorded!`);
      setActiveAction(null);
      setFaceStage('idle');
      await fetchToday();
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to record attendance.';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const summary = todayData?.summary;
  const logs = todayData?.logs || [];

  const faceStatusConfig = {
    idle:     { bg: 'border-slate-700 bg-slate-900',       text: 'text-slate-400',   label: 'Ready to scan' },
    scanning: { bg: 'border-blue-500/50 bg-blue-950/30',   text: 'text-blue-400',    label: 'Scanning face...' },
    verified: { bg: 'border-emerald-500/50 bg-emerald-950/30', text: 'text-emerald-400', label: `Verified: ${faceResult?.name}` },
    failed:   { bg: 'border-red-500/50 bg-red-950/30',     text: 'text-red-400',     label: 'Face not matched' },
  };
  const fs = faceStatusConfig[faceStage];

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">My Attendance</h1>
        <p className="text-slate-400 text-sm">{format(new Date(), 'EEEE, MMMM d, yyyy')}</p>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Left: Status & Actions */}
        <div className="space-y-4">
          {/* Today's Summary */}
          <div className="card">
            <h2 className="font-semibold text-white mb-4">Today's Summary</h2>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="bg-slate-800 rounded-lg p-3">
                <p className="text-xs text-slate-400 mb-1">Punch In</p>
                <p className="text-sm font-mono font-semibold text-white">
                  {summary?.punchIn ? format(new Date(summary.punchIn), 'hh:mm a') : '--:--'}
                </p>
              </div>
              <div className="bg-slate-800 rounded-lg p-3">
                <p className="text-xs text-slate-400 mb-1">Work Time</p>
                <p className="text-sm font-mono font-semibold text-emerald-400">
                  {summary?.totalWorkMinutes ? `${Math.floor(summary.totalWorkMinutes / 60)}h ${summary.totalWorkMinutes % 60}m` : '0h 0m'}
                </p>
              </div>
              <div className="bg-slate-800 rounded-lg p-3">
                <p className="text-xs text-slate-400 mb-1">Punch Out</p>
                <p className="text-sm font-mono font-semibold text-white">
                  {summary?.punchOut ? format(new Date(summary.punchOut), 'hh:mm a') : '--:--'}
                </p>
              </div>
            </div>

            {summary?.isLate && (
              <div className="mt-3 flex items-center gap-2 text-amber-400 text-xs bg-amber-900/20 border border-amber-800/30 rounded-lg px-3 py-2">
                <span>⚠️</span> Late by {summary.lateByMinutes} minutes
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="card">
            <h2 className="font-semibold text-white mb-4">Actions</h2>
            {allowedActions.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                <p className="text-3xl mb-2">✅</p>
                <p className="text-sm">You've completed your shift for today!</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {allowedActions.map(action => {
                  const cfg = ACTION_CONFIG[action];
                  return (
                    <button
                      key={action}
                      onClick={() => handleActionClick(action)}
                      className={`${cfg.color} ${activeAction === action ? 'ring-2 ring-white/20 scale-95' : ''} py-4 text-base flex-col h-auto`}
                    >
                      <span className="text-2xl mb-1">{cfg.icon}</span>
                      <span>{cfg.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Location Status */}
          <div className="card">
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-semibold text-white text-sm">Location</h2>
              <button onClick={fetchLocation} className="text-xs text-blue-400 hover:text-blue-300">Refresh</button>
            </div>
            {locationError ? (
              <div className="text-red-400 text-xs bg-red-900/20 border border-red-800/30 rounded-lg p-3">{locationError}</div>
            ) : location ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${location.isOfficeLocation ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                  <span className={`text-sm font-medium ${location.isOfficeLocation ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {location.isOfficeLocation ? 'At Office' : `${location.distanceFromOffice}m from office`}
                  </span>
                </div>
                <p className="text-xs text-slate-500 font-mono">
                  {location.latitude.toFixed(5)}, {location.longitude.toFixed(5)}
                </p>
                {!location.isOfficeLocation && (
                  <input
                    className="input text-sm mt-2"
                    placeholder="Reason for being outside office..."
                    value={outsideReason}
                    onChange={e => setOutsideReason(e.target.value)}
                  />
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 text-slate-400 text-sm">
                <div className="w-4 h-4 border-2 border-slate-500 border-t-transparent rounded-full animate-spin" />
                Getting location...
              </div>
            )}
          </div>

          {/* Timeline */}
          {logs.length > 0 && (
            <div className="card">
              <h2 className="font-semibold text-white mb-4">Today's Timeline</h2>
              <div className="space-y-3">
                {logs.map((log, i) => {
                  const colors = { PUNCH_IN: 'text-emerald-400 bg-emerald-900/40', PUNCH_OUT: 'text-red-400 bg-red-900/40', BREAK_START: 'text-amber-400 bg-amber-900/40', BREAK_END: 'text-blue-400 bg-blue-900/40' };
                  const labels = { PUNCH_IN: 'Punch In', PUNCH_OUT: 'Punch Out', BREAK_START: 'Break Start', BREAK_END: 'Break End' };
                  return (
                    <div key={i} className="flex items-center gap-3">
                      <span className={`text-xs font-medium px-2 py-1 rounded-md ${colors[log.action]}`}>
                        {labels[log.action]}
                      </span>
                      <span className="text-sm font-mono text-white">{format(new Date(log.timestamp), 'hh:mm:ss a')}</span>
                      {log.faceVerified && <span className="text-xs text-emerald-500">● Face OK</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right: Face Verification */}
        <div className="space-y-4">
          {activeAction ? (
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-white">Face Verification</h2>
                <button onClick={() => { setActiveAction(null); stopFaceScan(); }} className="text-xs text-slate-400 hover:text-slate-200">
                  Cancel
                </button>
              </div>

              <p className="text-sm text-slate-400 mb-4">
                Action: <span className="text-white font-medium">{ACTION_CONFIG[activeAction].label}</span>
              </p>

              {/* Camera */}
              <div className={`relative rounded-xl overflow-hidden border-2 transition-colors ${fs.bg}`}>
                <Webcam
                  ref={webcamRef}
                  audio={false}
                  width={480}
                  height={360}
                  screenshotFormat="image/jpeg"
                  videoConstraints={{ facingMode: 'user' }}
                  className="w-full"
                />
                {/* Scan animation */}
                {faceStage === 'scanning' && (
                  <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute left-0 right-0 h-0.5 bg-blue-400/60 animate-bounce" style={{ top: '50%' }} />
                  </div>
                )}
                {/* Status overlay */}
                <div className="absolute bottom-0 left-0 right-0 bg-black/70 p-2 text-center">
                  <p className={`text-sm font-medium ${fs.text}`}>{fs.label}</p>
                  {faceResult && <p className="text-xs text-slate-400">Score: {(faceResult.score * 100).toFixed(1)}%</p>}
                </div>
              </div>
              <canvas ref={canvasRef} className="hidden" />

              {/* Scan controls */}
              <div className="mt-4 space-y-3">
                {faceStage !== 'scanning' && faceStage !== 'verified' && (
                  <button onClick={startFaceScan} className="btn-primary w-full" disabled={!modelsReady}>
                    {!modelsReady ? 'Loading models...' : '📷 Start Face Scan'}
                  </button>
                )}
                {faceStage === 'scanning' && (
                  <button onClick={stopFaceScan} className="btn-secondary w-full">Stop Scanning</button>
                )}
                {faceStage === 'verified' && (
                  <button
                    onClick={handleSubmit}
                    disabled={loading}
                    className="btn-success w-full"
                  >
                    {loading ? (
                      <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Submitting...</>
                    ) : (
                      `✅ Confirm ${ACTION_CONFIG[activeAction].label}`
                    )}
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="card flex flex-col items-center justify-center py-16 text-center">
              <div className="w-20 h-20 bg-slate-800 rounded-full flex items-center justify-center mb-4">
                <svg className="w-10 h-10 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <p className="text-slate-400 text-sm">Select an action to start face verification</p>
              <p className="text-slate-600 text-xs mt-2">Camera will activate when you choose an action</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}