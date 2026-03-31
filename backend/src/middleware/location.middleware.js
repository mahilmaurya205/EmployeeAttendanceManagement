const getDistanceMeters = (lat1, lon1, lat2, lon2) => {
  const R = 6371000; // Earth radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const OFFICE_LAT = parseFloat(process.env.OFFICE_LAT || '23.063596');
const OFFICE_LNG = parseFloat(process.env.OFFICE_LNG || '72.651390');
const OFFICE_RADIUS = parseFloat(process.env.OFFICE_RADIUS_METERS || '100');

const validateLocation = (req, res, next) => {
  const { latitude, longitude } = req.body.location || {};

  if (latitude == null || longitude == null) {
    return res.status(400).json({ success: false, message: 'Location (latitude, longitude) is required.' });
  }

  const distance = getDistanceMeters(latitude, longitude, OFFICE_LAT, OFFICE_LNG);
  const isOfficeLocation = distance <= OFFICE_RADIUS;

  req.locationInfo = {
    latitude,
    longitude,
    distanceFromOffice: Math.round(distance),
    isOfficeLocation,
  };

  // IT Software employees MUST be at office
  if (req.employeeDepartment === 'IT Software' && !isOfficeLocation) {
    return res.status(403).json({
      success: false,
      message: `IT Software employees must be within ${OFFICE_RADIUS}m of office. You are ${Math.round(distance)}m away.`,
      distanceFromOffice: Math.round(distance),
      requiredRadius: OFFICE_RADIUS,
    });
  }

  // IT Hardware outside office — must provide reason
  if (req.employeeDepartment === 'IT Hardware' && !isOfficeLocation) {
    if (!req.body.outsideReason || req.body.outsideReason.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'You are outside the office. Please provide a reason for marking attendance from this location.',
        distanceFromOffice: Math.round(distance),
        requiresReason: true,
      });
    }
  }

  next();
};

module.exports = { validateLocation, getDistanceMeters, OFFICE_LAT, OFFICE_LNG, OFFICE_RADIUS };
