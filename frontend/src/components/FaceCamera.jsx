import React, { useRef, useEffect, useState, useCallback } from 'react';
import Webcam from 'react-webcam';
import { loadModels, detectFace, drawDetections, captureSnapshot } from './faceRecognition';

export default function FaceCamera({
  onDetection,      // called with { detection, snapshot }
  continuous = true, // keep scanning
  overlay = true,
  width = 480,
  height = 360,
  label = 'Looking for face...',
}) {
  const webcamRef = useRef(null);
  const canvasRef = useRef(null);
  const intervalRef = useRef(null);

  const [modelsReady, setModelsReady] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [faceDetected, setFaceDetected] = useState(false);
  const [error, setError] = useState(null);

  // Load models on mount
  useEffect(() => {
    loadModels().then(ok => {
      if (ok) setModelsReady(true);
      else setError('Failed to load face detection models. Ensure /public/models/ files are present.');
    });
    return () => clearInterval(intervalRef.current);
  }, []);

  const runDetection = useCallback(async () => {
    const video = webcamRef.current?.video;
    if (!video || video.readyState !== 4 || !modelsReady) return;

    const detection = await detectFace(video);
    setFaceDetected(!!detection);

    if (overlay && canvasRef.current) {
      drawDetections(canvasRef.current, detection, video);
    }

    if (detection && onDetection) {
      const snapshot = captureSnapshot(video);
      onDetection({ detection, snapshot });
      if (!continuous) clearInterval(intervalRef.current);
    }
  }, [modelsReady, onDetection, continuous, overlay]);

  useEffect(() => {
    if (!modelsReady || !cameraReady) return;
    intervalRef.current = setInterval(runDetection, 300);
    return () => clearInterval(intervalRef.current);
  }, [modelsReady, cameraReady, runDetection]);

  if (error) {
    return (
      <div className="bg-red-900/20 border border-red-800/50 rounded-xl p-6 text-center">
        <p className="text-red-400 text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div className="relative rounded-xl overflow-hidden bg-slate-900 border border-slate-700" style={{ width, maxWidth: '100%' }}>
      {/* Camera */}
      <Webcam
        ref={webcamRef}
        audio={false}
        width={width}
        height={height}
        screenshotFormat="image/jpeg"
        videoConstraints={{ width, height, facingMode: 'user' }}
        onUserMedia={() => setCameraReady(true)}
        onUserMediaError={() => setError('Camera access denied. Please allow camera permissions.')}
        className="w-full"
        style={{ display: 'block' }}
      />

      {/* Detection canvas overlay */}
      {overlay && (
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full"
          style={{ pointerEvents: 'none' }}
        />
      )}

      {/* Status bar */}
      <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 to-transparent">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${faceDetected ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
          <span className="text-xs text-white font-medium">
            {!modelsReady ? 'Loading models...' : !cameraReady ? 'Starting camera...' : faceDetected ? 'Face detected ✓' : label}
          </span>
        </div>
      </div>

      {/* Corner frame decorations */}
      <div className="absolute inset-6 pointer-events-none">
        {['top-0 left-0', 'top-0 right-0', 'bottom-0 left-0', 'bottom-0 right-0'].map((pos, i) => (
          <div key={i} className={`absolute ${pos} w-5 h-5 border-blue-400`}
            style={{
              borderTopWidth: i < 2 ? 2 : 0,
              borderBottomWidth: i >= 2 ? 2 : 0,
              borderLeftWidth: i % 2 === 0 ? 2 : 0,
              borderRightWidth: i % 2 === 1 ? 2 : 0,
            }}
          />
        ))}
      </div>
    </div>
  );
}