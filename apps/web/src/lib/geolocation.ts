export interface Coordinates {
  latitude: number;
  longitude: number;
  gpsAccuracy: number | null;
}

export function geolocationError(code: number): string {
  switch (code) {
    case 1: return 'Location permission was denied. Allow location access in your browser site settings, then submit again.';
    case 2: return 'Your location is unavailable. Enable device location services or GPS, move to an area with a better signal, and try again.';
    case 3: return 'Getting your location timed out. Check your GPS or connection and submit again.';
    default: return 'Unable to get your location. Check your browser permissions and try again.';
  }
}

// Invoke only from the user's explicit check-in action; never watch or poll location.
export function getCheckInLocation(): Promise<Coordinates> {
  return new Promise((resolve, reject) => {
    if (!window.isSecureContext) {
      reject(new Error('Location requires HTTPS or localhost. Open this application over a secure connection.'));
      return;
    }
    if (!navigator.geolocation) {
      reject(new Error('Your browser does not support location access. Use a current browser with location services enabled.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        if (!Number.isFinite(coords.latitude) || !Number.isFinite(coords.longitude) ||
            Math.abs(coords.latitude) > 90 || Math.abs(coords.longitude) > 180) {
          reject(new Error('Your device returned an invalid location. Please try again.'));
          return;
        }
        resolve({ latitude: coords.latitude, longitude: coords.longitude,
          gpsAccuracy: Number.isFinite(coords.accuracy) && coords.accuracy >= 0 ? coords.accuracy : null });
      },
      (error) => reject(new Error(geolocationError(error.code))),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  });
}
