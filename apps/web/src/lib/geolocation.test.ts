import { afterEach, describe, expect, it, vi } from 'vitest';
import { geolocationError, getCheckInLocation } from './geolocation';

function setup(getCurrentPosition = vi.fn(), secure = true) {
  vi.stubGlobal('window', { isSecureContext: secure });
  vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } });
  return getCurrentPosition;
}
afterEach(() => vi.unstubAllGlobals());

describe('check-in geolocation', () => {
  it('does not request permission until explicitly invoked', () => {
    const get = setup();
    expect(get).not.toHaveBeenCalled();
  });
  it('gets a fresh high-accuracy position once', async () => {
    const get = setup(vi.fn((success) => success({ coords: { latitude: -6.2, longitude: 106.8, accuracy: 12 } })));
    await expect(getCheckInLocation()).resolves.toEqual({ latitude: -6.2, longitude: 106.8, gpsAccuracy: 12 });
    expect(get).toHaveBeenCalledTimes(1);
    expect(get.mock.calls[0]?.[2]).toEqual({ enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  });
  it.each([1, 2, 3, 99])('provides actionable errors for location failure %i', async (code) => {
    setup(vi.fn((_success, failure) => failure({ code })));
    await expect(getCheckInLocation()).rejects.toThrow(geolocationError(code));
  });
  it('rejects insecure origins before asking for location', async () => {
    const get = setup(vi.fn(), false);
    await expect(getCheckInLocation()).rejects.toThrow('HTTPS or localhost');
    expect(get).not.toHaveBeenCalled();
  });
  it('handles unsupported browsers', async () => {
    setup();
    vi.stubGlobal('navigator', {});
    await expect(getCheckInLocation()).rejects.toThrow('does not support');
  });
  it('rejects invalid coordinates', async () => {
    setup(vi.fn((success) => success({ coords: { latitude: 91, longitude: 0, accuracy: 0 } })));
    await expect(getCheckInLocation()).rejects.toThrow('invalid location');
  });
  it('omits unavailable accuracy but preserves valid zero coordinates', async () => {
    setup(vi.fn((success) => success({ coords: { latitude: 0, longitude: 0, accuracy: NaN } })));
    await expect(getCheckInLocation()).resolves.toEqual({ latitude: 0, longitude: 0, gpsAccuracy: null });
  });
});
