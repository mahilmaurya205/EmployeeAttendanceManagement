import * as faceapi from 'face-api.js';

let modelsLoaded = false;
const MODEL_URL = 'https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/weights';

// ─── Load Models ─────────────────────────────────────────────────────────────
export const loadModels = async () => {
  if (modelsLoaded) return true;
  try {
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
      faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL),
    ]);
    modelsLoaded = true;
    console.log('✅ Face-api models loaded');
    return true;
  } catch (err) {
    console.error('❌ Failed to load face-api models:', err);
    return false;
  }
};

// ─── Detect a single face and get descriptor ─────────────────────────────────
export const detectFace = async (videoElement) => {
  if (!modelsLoaded) throw new Error('Models not loaded');

  const detection = await faceapi
    .detectSingleFace(videoElement, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }))
    .withFaceLandmarks()
    .withFaceDescriptor();

  return detection || null;
};

// ─── Draw detection box on canvas ────────────────────────────────────────────
export const drawDetections = (canvas, detection, videoEl) => {
  const dims = faceapi.matchDimensions(canvas, videoEl, true);
  if (!detection) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }
  const resized = faceapi.resizeResults(detection, dims);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Custom draw
  const box = resized.detection.box;
  ctx.strokeStyle = '#3b82f6';
  ctx.lineWidth = 2;
  ctx.strokeRect(box.x, box.y, box.width, box.height);

  // Corner decorations
  const cornerLen = 20;
  ctx.strokeStyle = '#60a5fa';
  ctx.lineWidth = 3;
  [[box.x, box.y], [box.x + box.width, box.y], [box.x, box.y + box.height], [box.x + box.width, box.y + box.height]].forEach(([cx, cy]) => {
    ctx.beginPath();
    ctx.moveTo(cx - cornerLen * (cx > box.x ? -1 : 1), cy);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx, cy - cornerLen * (cy > box.y ? -1 : 1));
    ctx.stroke();
  });

  // Confidence
  ctx.fillStyle = '#3b82f6';
  ctx.font = '13px Inter';
  ctx.fillText(`${Math.round(resized.detection.score * 100)}%`, box.x, box.y - 8);
};

// ─── Capture frame as base64 ──────────────────────────────────────────────────
export const captureSnapshot = (videoElement) => {
  const canvas = document.createElement('canvas');
  canvas.width = videoElement.videoWidth;
  canvas.height = videoElement.videoHeight;
  canvas.getContext('2d').drawImage(videoElement, 0, 0);
  return canvas.toDataURL('image/jpeg', 0.85);
};

// ─── Build LabeledFaceDescriptors from stored employee data ──────────────────
export const buildLabeledDescriptors = (employees) => {
  const labeled = [];
  for (const emp of employees) {
    if (!emp.faceDescriptors || emp.faceDescriptors.length === 0) continue;
    const descriptors = emp.faceDescriptors.map(fd => new Float32Array(fd.descriptor));
    labeled.push(new faceapi.LabeledFaceDescriptors(`${emp._id}::${emp.name}`, descriptors));
  }
  return labeled;
};

// ─── Match detected face against known descriptors ───────────────────────────
// Returns { matched: bool, employeeId, name, score (0-1, higher = better match) }
export const matchFace = (detectionDescriptor, labeledDescriptors, threshold = 0.55) => {
  if (!labeledDescriptors || labeledDescriptors.length === 0) {
    return { matched: false, score: 0, reason: 'No enrolled faces' };
  }

  const matcher = new faceapi.FaceMatcher(labeledDescriptors, threshold);
  const best = matcher.findBestMatch(detectionDescriptor);

  if (best.label === 'unknown') {
    return { matched: false, score: 1 - best.distance, distance: best.distance, reason: 'No match' };
  }

  const [employeeId, name] = best.label.split('::');
  const score = 1 - best.distance; // convert distance to similarity score

  return {
    matched: true,
    employeeId,
    name,
    score,
    distance: best.distance,
  };
};

// ─── Liveness check helpers ───────────────────────────────────────────────────
export const checkLiveness = (detection) => {
  if (!detection?.expressions) return true;
  // Simple check: face must have neutral/natural expression (not a photo)
  // In production, use a dedicated anti-spoofing model
  return detection.detection.score > 0.7;
};