import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatDate } from '../app/utils/date-format';

afterEach(() => vi.unstubAllEnvs());
describe('deployment date format', () => {
  it('uses local calendar fields, bracketed literals and daylight saving offsets', () => {
    vi.stubEnv('TZ', 'Europe/Berlin');
    expect(formatDate('2026-04-16T00:05:09Z', 'DD.MM.YYYY HH:mm:ss Z')).toBe('16.04.2026 02:05:09 +02:00');
    expect(formatDate('2026-01-01T00:00:00Z', 'YYYY-MM-DD[T]HH:mm:ssZ')).toBe('2026-01-01T01:00:00+01:00');
    expect(formatDate('2026-04-16T00:05:09Z', '[YYYY] YYYY [at] HH:mm / DD DD')).toBe('YYYY 2026 at 02:05 / 16 16');
  });
  it('supports negative timezone offsets and calendar rollover', () => {
    vi.stubEnv('TZ', 'America/New_York');
    expect(formatDate('2026-01-01T00:00:00Z', 'YYYY-MM-DD HH:mm Z')).toBe('2025-12-31 19:00 -05:00');
    vi.stubEnv('TZ', 'Asia/Kolkata');
    expect(formatDate('2026-01-01T00:00:00Z', 'HH:mm Z')).toBe('05:30 +05:30');
  });
  it.each(['', 'yyyy-MM-dd', 'YYYY-MM-DD HH:mm [oops', '[literal]', 'HH:mm A', 'YYYY]', '[[]YYYY', 'YYYY foo'])(
    'falls back for %j',
    (pattern) => {
      const value = '2026-04-16T00:05:09Z';
      expect(formatDate(value, pattern)).toBe(
        new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)),
      );
    },
  );
  it.each([undefined, null, '', 'invalid', NaN, Infinity, new Date(NaN)])(
    'handles invalid or absent value %j',
    (value) => {
      expect(formatDate(value, 'YYYY')).toBe('—');
    },
  );
  it('accepts numeric timestamps, dates and epoch zero', () => {
    vi.stubEnv('TZ', 'UTC');
    expect(formatDate(0, 'YYYY-MM-DD HH:mm:ss Z')).toBe('1970-01-01 00:00:00 +00:00');
    expect(formatDate(new Date('2026-04-16T00:00:00Z'), 'DD.MM.YYYY')).toBe('16.04.2026');
  });
});
