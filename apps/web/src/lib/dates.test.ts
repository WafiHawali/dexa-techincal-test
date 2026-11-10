import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatDate, formatTime, todayJakarta } from './dates';

afterEach(() => vi.useRealTimers());

describe('Jakarta attendance dates', () => {
  it('uses the Jakarta date across a UTC day boundary', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-07T18:00:00Z'));
    expect(todayJakarta()).toBe('2026-11-08');
  });
  it('converts server timestamps to WIB', () => {
    expect(formatTime('2026-11-08T01:35:00Z')).toBe('08:35');
  });
  it('preserves a date-only attendance date', () => {
    expect(formatDate('2026-11-08')).toBe('8 Nov 2026');
  });
  it('handles absent or invalid timestamps', () => {
    expect(formatTime()).toBe('Not set');
    expect(formatTime('invalid')).toBe('Not set');
    expect(formatDate('invalid')).toBe('Not set');
  });
});
