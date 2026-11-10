const timeZone = 'Asia/Jakarta';

export function todayJakarta(): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const value = (type: string) => parts.find((part) => part.type === type)?.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}

export function formatDate(value?: string, long = false): string {
  if (!value) return 'Not set';
  const date = new Date(value.length === 10 ? `${value}T00:00:00+07:00` : value);
  if (Number.isNaN(date.getTime())) return 'Not set';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone, day: 'numeric', month: long ? 'long' : 'short', year: 'numeric', ...(long ? { weekday: 'long' as const } : {}),
  }).format(date);
}

export function formatTime(value?: string): string {
  if (!value || Number.isNaN(new Date(value).getTime())) return 'Not set';
  return new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value));
}

export function initials(name?: string): string {
  return (name || 'User').trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}
