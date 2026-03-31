// Geolocation service
const OFFICE_LAT = parseFloat(import.meta.env.VITE_OFFICE_LAT || '23.063596');
const OFFICE_LNG = parseFloat(import.meta.env.VITE_OFFICE_LNG || '72.651390');
const OFFICE_RADIUS = parseFloat(import.meta.env.VITE_OFFICE_RADIUS || '100');

export const getDistanceMeters = (lat1, lon1, lat2, lon2) => {
  const R = 6371000;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

export const getCurrentLocation = () => {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported by your browser.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        const distance = getDistanceMeters(latitude, longitude, OFFICE_LAT, OFFICE_LNG);
        resolve({
          latitude,
          longitude,
          accuracy,
          distanceFromOffice: Math.round(distance),
          isOfficeLocation: distance <= OFFICE_RADIUS,
        });
      },
      (err) => {
        const messages = {
          1: 'Location permission denied. Please allow location access.',
          2: 'Location unavailable. Check your GPS/network.',
          3: 'Location request timed out.',
        };
        reject(new Error(messages[err.code] || 'Failed to get location.'));
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
    );
  });
};

export const OFFICE = { lat: OFFICE_LAT, lng: OFFICE_LNG, radius: OFFICE_RADIUS };
