/** Format a date using optional deployment tokens and the browser's timezone. */
export function formatDate(value: string | number | Date | null | undefined, pattern = ''): string {
  if (value == null || value === '') return '—';
  const date = new Date(value instanceof Date ? value.getTime() : value);
  if (Number.isNaN(date.getTime())) return '—';
  const pad = (number: number, width = 2) => String(number).padStart(width, '0');
  const offset = -date.getTimezoneOffset();
  const tokens: Record<string, string> = {
    YYYY: pad(date.getFullYear(), 4),
    MM: pad(date.getMonth() + 1),
    DD: pad(date.getDate()),
    HH: pad(date.getHours()),
    mm: pad(date.getMinutes()),
    ss: pad(date.getSeconds()),
    Z: `${offset >= 0 ? '+' : '-'}${pad(Math.floor(Math.abs(offset) / 60))}:${pad(Math.abs(offset) % 60)}`,
  };
  let valid = true;
  let hasToken = false;
  const formatted = pattern.replace(/\[[^\x5b\x5d]*\]|YYYY|MM|DD|HH|mm|ss|Z|[\s\S]/g, (part) => {
    if (part.startsWith('[') && part.endsWith(']')) return part.slice(1, -1);
    if (Object.hasOwn(tokens, part)) {
      hasToken = true;
      return tokens[part]!;
    }
    if (/[\p{L}\p{N}\x5b\x5d]/u.test(part)) valid = false;
    return part;
  });
  return valid && hasToken
    ? formatted
    : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}
