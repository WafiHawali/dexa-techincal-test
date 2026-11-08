import { useQuery } from '@tanstack/react-query';
import { attendanceApi } from './api';
import { todayJakarta } from './dates';

export async function loadOwnOverview(date: string, signal?: AbortSignal) {
  const first = await attendanceApi.mine({ page: 1, pageSize: 100 }, signal);
  const items = [...first.items];
  const pageSize = Math.max(1, first.pageSize);
  const hasToday = () => items.some((item) => item.attendanceDate.slice(0, 10) === date);
  // The own-list contract has no date filter or guaranteed sort order.
  for (let page = 2; !hasToday() && (page - 1) * pageSize < first.total; page++) {
    const next = await attendanceApi.mine({ page, pageSize }, signal);
    items.push(...next.items);
    if (!next.items.length) break;
  }
  items.sort((a, b) => b.checkInAt.localeCompare(a.checkInAt));
  return { ...first, items };
}

export function useOwnOverview() {
  const date = todayJakarta();
  const query = useQuery({
    queryKey: ['attendances', 'mine', 'overview', date],
    queryFn: ({ signal }) => loadOwnOverview(date, signal),
  });
  const today = query.data?.items.find((item) => item.attendanceDate.slice(0, 10) === date);
  return { ...query, today };
}
