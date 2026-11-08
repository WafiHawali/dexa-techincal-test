import { afterEach, describe, expect, it, vi } from 'vitest';
import { attendanceApi } from './api';
import { loadOwnOverview } from './queries';
import type { Attendance } from './types';

const attendance = (date: string, id: string): Attendance => ({
  id, employeeId: 'employee-1', attendanceDate: date, checkInAt: `${date}T01:00:00.000Z`,
  status: 'PRESENT', latitude: 0, longitude: 0, gpsAccuracy: 10,
});

afterEach(() => vi.restoreAllMocks());

describe('own attendance overview', () => {
  it('does not fetch extra history if today is already present', async () => {
    const mine = vi.spyOn(attendanceApi, 'mine').mockResolvedValue({
      items: [attendance('2026-11-08', 'today')], page: 1, pageSize: 100, total: 200,
    });
    const result = await loadOwnOverview('2026-11-08');
    expect(mine).toHaveBeenCalledTimes(1);
    expect(result.items[0]?.id).toBe('today');
  });
  it('finds today on later pages and respects a server page-size cap', async () => {
    const mine = vi.spyOn(attendanceApi, 'mine')
      .mockResolvedValueOnce({ items: [attendance('2026-11-07', 'old')], page: 1, pageSize: 1, total: 3 })
      .mockResolvedValueOnce({ items: [attendance('2026-11-08', 'today')], page: 2, pageSize: 1, total: 3 });
    const result = await loadOwnOverview('2026-11-08');
    expect(mine).toHaveBeenCalledTimes(2);
    expect(mine).toHaveBeenLastCalledWith({ page: 2, pageSize: 1 }, undefined);
    expect(result.items.map((item) => item.id)).toEqual(['today', 'old']);
    expect(result.total).toBe(3);
  });
  it('finishes after exhausting history when today has no check-in', async () => {
    const mine = vi.spyOn(attendanceApi, 'mine')
      .mockResolvedValueOnce({ items: [attendance('2026-11-07', 'old')], page: 1, pageSize: 1, total: 2 })
      .mockResolvedValueOnce({ items: [attendance('2026-11-06', 'older')], page: 2, pageSize: 1, total: 2 });
    const result = await loadOwnOverview('2026-11-08');
    expect(mine).toHaveBeenCalledTimes(2);
    expect(result.items).toHaveLength(2);
  });
  it('forwards query cancellation to the API request', async () => {
    const controller = new AbortController();
    const mine = vi.spyOn(attendanceApi, 'mine').mockResolvedValue({ items: [], page: 1, pageSize: 100, total: 0 });
    await loadOwnOverview('2026-11-08', controller.signal);
    expect(mine).toHaveBeenCalledWith({ page: 1, pageSize: 100 }, controller.signal);
  });
});
