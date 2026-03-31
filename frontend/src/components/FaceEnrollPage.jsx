import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Webcam from 'react-webcam';
import toast from 'react-hot-toast';
import { employeeAPI } from '../utils/api/api';
import { loadModels, detectFace, captureSnapshot, getModelLoadError } from './faceRecognition';

const ANGLES = [
  { key: 'front', label: 'Front',      instruction: 'Look straight at the camera', emoji: '😐' },
  { key: 'left',  label: 'Left Side',  instruction: 'Turn your head slightly to the left', emoji: '👈' },
  { key: 'right', label: 'Right Side', instruction: 'Turn your head slightly to the right', emoji: '👉' },
  { key: 'up',    label: 'Look Up',    instruction: 'Tilt your head slightly upward', emoji: '☝️' },
  { key: 'down',  label: 'Look Down',  instruction: 'Tilt your head slightly downward', emoji: '👇' },
];

export default function FaceEnrollPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const webcamRef = useRef(null);

  const [employee, setEmployee] = useState(null);
  const [currentAngleIdx, setCurrentAngleIdx] = useState(0);
  const [capturedAngles, setCapturedAngles] = useState({});
  const [capturing, setCapturing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [modelsReady, setModelsReady] = useState(false);
  const [modelError, setModelError] = useState('');
  const [countdown, setCountdown] = useState(null);

  useEffect(() => {
    employeeAPI.get(id).then(({ data }) => setEmployee(data.data));
    loadModels().then(ok => {
      setModelsReady(ok);
      if (!ok) {
        const err = getModelLoadError();
        const message = err?.message || 'Face models failed to load.';
        setModelError(message);
        toast.error('Face models failed to load. Check internet or add model files in frontend/public/models.');
      }
    });
  }, [id]);

  const currentAngle = ANGLES[currentAngleIdx];
  const allCaptured = ANGLES.every(a => capturedAngles[a.key]);

  const captureAngle = useCallback(async () => {
    setCapturing(true);
    // Countdown
    for (let i = 3; i >= 1; i--) {
      setCountdown(i);
      await new Promise(r => setTimeout(r, 800));
    }
    setCountdown(null);

    const video = webcamRef.current?.video;
    if (!video) { setCapturing(false); return; }

    const detection = await detectFace(video);
    if (!detection) {
      toast.error('No face detected. Position your face clearly in the frame.');
      setCapturing(false);
      return;
    }

    const snapshot = captureSnapshot(video);
    setCapturedAngles(prev => ({
      ...prev,
      [currentAngle.key]: { descriptor: Array.from(detection.descriptor), imageBase64: snapshot },
    }));

    toast.success(`${currentAngle.label} captured!`);
    if (currentAngleIdx < ANGLES.length - 1) {
      setCurrentAngleIdx(i => i + 1);
    }
    setCapturing(false);
  }, [currentAngle, currentAngleIdx]);

  const handleSubmit = async () => {
    if (!allCaptured) { toast.error('Capture all angles first.'); return; }
    setSubmitting(true);
    try {
      const descriptors = Object.entries(capturedAngles).map(([angle, data]) => ({
        angle,
        descriptor: data.descriptor,
        imageBase64: data.imageBase64,
      }));
      await employeeAPI.enrollFace(id, { descriptors });
      toast.success('Face enrollment complete!');
      navigate(`/employees/${id}`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Enrollment failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-white">Face Enrollment</h1>
        {employee && <p className="text-slate-400 text-sm mt-1">{employee.name} · {employee.employeeCode}</p>}
      </div>

      {/* Progress */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          {ANGLES.map((a, i) => (
            <div key={a.key} className="flex-1">
              <div className={`h-2 rounded-full transition-colors ${
                capturedAngles[a.key] ? 'bg-emerald-500' : i === currentAngleIdx ? 'bg-blue-500' : 'bg-slate-700'
              }`} />
              <p className="text-xs text-slate-500 mt-1 text-center">{a.label}</p>
            </div>
          ))}
        </div>
        <p className="text-sm text-slate-400">
          {Object.keys(capturedAngles).length} of {ANGLES.length} angles captured
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Camera */}
        <div className="space-y-4">
          <div className="card">
            <h2 className="font-semibold text-white mb-3">
              {currentAngle.emoji} {currentAngle.label}
            </h2>
            <p className="text-sm text-slate-400 mb-4">{currentAngle.instruction}</p>

            {/* Camera feed */}
            <div className="relative rounded-xl overflow-hidden bg-slate-900 border border-slate-700">
              <Webcam
                ref={webcamRef}
                audio={false}
                width={400}
                height={300}
                screenshotFormat="image/jpeg"
                videoConstraints={{ facingMode: 'user' }}
                className="w-full"
              />
              {countdown && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                  <span className="text-7xl font-bold text-white animate-pulse">{countdown}</span>
                </div>
              )}
              {/* Guide oval */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="border-2 border-blue-400/50 rounded-full w-40 h-52" />
              </div>
            </div>

            <button
              onClick={captureAngle}
              disabled={capturing || !modelsReady || allCaptured}
              className={`btn-primary w-full mt-4 ${capturedAngles[currentAngle.key] ? 'opacity-60' : ''}`}
            >
              {capturing ? (
                <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Capturing...</>
              ) : capturedAngles[currentAngle.key] ? (
                '✅ Captured — Recapture?'
              ) : (
                '📸 Capture This Angle'
              )}
            </button>
            {!modelsReady && (
              <div className="mt-3 rounded-lg border border-amber-800/40 bg-amber-950/20 px-3 py-2 text-xs text-amber-300">
                Face model files are not loaded yet, so capture is disabled.
                {modelError ? ` Error: ${modelError}` : ''}
                {' '}Add the face-api model files to `frontend/public/models` or allow access to jsDelivr.
              </div>
            )}
            {!allCaptured && capturedAngles[currentAngle.key] && currentAngleIdx < ANGLES.length - 1 && (
              <button onClick={() => setCurrentAngleIdx(i => i + 1)} className="btn-secondary w-full mt-2">
                Next Angle →
              </button>
            )}
          </div>
        </div>

        {/* Captures preview */}
        <div className="card">
          <h2 className="font-semibold text-white mb-4">Captured Angles</h2>
          <div className="grid grid-cols-2 gap-3">
            {ANGLES.map((a, i) => (
              <div
                key={a.key}
                onClick={() => setCurrentAngleIdx(i)}
                className={`relative rounded-lg overflow-hidden cursor-pointer border-2 transition-all ${
                  capturedAngles[a.key] ? 'border-emerald-500/60' : i === currentAngleIdx ? 'border-blue-500/60' : 'border-slate-700'
                }`}
              >
                {capturedAngles[a.key] ? (
                  <>
                    <img src={capturedAngles[a.key].imageBase64} alt={a.label} className="w-full h-24 object-cover" />
                    <div className="absolute top-1 right-1 w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center">
                      <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </div>
                  </>
                ) : (
                  <div className="h-24 flex flex-col items-center justify-center bg-slate-800/50">
                    <span className="text-2xl mb-1">{a.emoji}</span>
                    <span className="text-xs text-slate-500">{a.label}</span>
                  </div>
                )}
              </div>
            ))}
          </div>

          {allCaptured && (
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="btn-success w-full mt-6"
            >
              {submitting ? (
                <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Enrolling...</>
              ) : '🎉 Complete Enrollment'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
