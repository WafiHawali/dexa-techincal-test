import { Actor, fail } from '../../../packages/shared/src';

export function object(value: unknown, fields: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(400, 'Expected an object');
  const result = value as Record<string, unknown>;
  if (Object.keys(result).some((key) => !fields.includes(key))) fail(400, 'Unexpected input field');
  return result;
}

export function id(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 2147483647) fail(400, 'Invalid ID');
  return value;
}

export function actor(value: unknown): Actor {
  const input = object(value, ['id', 'employeeId', 'role']);
  id(input.id); id(input.employeeId);
  if (input.role !== 'EMPLOYEE' && input.role !== 'HRD') fail(403, 'Invalid actor role');
  return input as unknown as Actor;
}

export interface Coordinates { latitude: number; longitude: number; gpsAccuracy?: number }
export function coordinates(value: unknown): Coordinates {
  const data = object(value, ['latitude', 'longitude', 'gpsAccuracy']);
  for (const [key, min, max] of [['latitude', -90, 90], ['longitude', -180, 180], ['gpsAccuracy', 0, Number.MAX_VALUE]] as const) {
    const n = data[key];
    if (key === 'gpsAccuracy' && n === undefined) continue;
    if (typeof n !== 'number' || !Number.isFinite(n) || n < min || n > max) fail(400, `Invalid ${key}`);
  }
  return data as unknown as Coordinates;
}

export interface ListQuery { page: number; pageSize: number; search?: string; date?: string }
export function listQuery(value: unknown = {}): ListQuery {
  const query = object(value, ['page', 'pageSize', 'search', 'date']);
  const integer = (v: unknown, fallback: number, max: number) => {
    const n = typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : v === undefined ? fallback : v;
    if (typeof n !== 'number' || !Number.isSafeInteger(n) || n < 1 || n > max) fail(400, 'Invalid pagination');
    return n;
  };
  const page = integer(query.page, 1, 2147483647);
  const pageSize = integer(query.pageSize, 20, 100);
  if ((page - 1) * pageSize > 2147483647) fail(400, 'Pagination offset too large');
  if (query.search !== undefined && (typeof query.search !== 'string' || query.search.length > 191)) fail(400, 'Invalid search');
  if (query.date !== undefined) {
    if (typeof query.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(query.date)
      || query.date < '1000-01-01' || query.date > '9999-12-31') fail(400, 'Invalid date; use YYYY-MM-DD');
    const parsed = new Date(`${query.date}T00:00:00.000Z`);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== query.date) fail(400, 'Invalid calendar date');
  }
  return { page, pageSize, search: (query.search as string | undefined)?.trim() || undefined, date: query.date as string | undefined };
}
