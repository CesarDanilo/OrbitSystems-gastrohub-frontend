import { describe, expect, it } from 'vitest';
import { isOpenAt, isWithinWindow, localTime, type WeeklySchedule } from './hours';

const TZ = 'America/Sao_Paulo'; // UTC-3, no DST since 2019

// 2026-10-07 is a Wednesday (day 3).
const at = (isoLocal: string) => new Date(`${isoLocal}-03:00`);

describe('localTime', () => {
  it('converts instants to the restaurant time zone', () => {
    expect(localTime(at('2026-10-07T19:30:00'), TZ)).toEqual({ day: 3, minutes: 19 * 60 + 30 });
  });
});

describe('isOpenAt', () => {
  const schedule: WeeklySchedule = {
    '3': [
      { open: '11:00', close: '14:00' },
      { open: '18:00', close: '02:00' },
    ],
  };

  it('is open inside a same-day interval and closed outside', () => {
    expect(isOpenAt(schedule, at('2026-10-07T12:00:00'), TZ)).toBe(true);
    expect(isOpenAt(schedule, at('2026-10-07T15:00:00'), TZ)).toBe(false);
    expect(isOpenAt(schedule, at('2026-10-07T14:00:00'), TZ)).toBe(false);
  });

  it('handles intervals that cross midnight', () => {
    expect(isOpenAt(schedule, at('2026-10-07T23:00:00'), TZ)).toBe(true);
    // Thursday 01:00 still belongs to Wednesday's night shift
    expect(isOpenAt(schedule, at('2026-10-08T01:00:00'), TZ)).toBe(true);
    expect(isOpenAt(schedule, at('2026-10-08T02:30:00'), TZ)).toBe(false);
  });

  it('is closed on days without intervals', () => {
    expect(isOpenAt(schedule, at('2026-10-09T12:00:00'), TZ)).toBe(false);
  });
});

describe('isWithinWindow', () => {
  it('restricts by weekday and time window', () => {
    const lunch = { availableDays: [1, 2, 3, 4, 5], availableFrom: '11:00', availableTo: '15:00' };
    expect(isWithinWindow(lunch, at('2026-10-07T12:00:00'), TZ)).toBe(true);
    expect(isWithinWindow(lunch, at('2026-10-07T16:00:00'), TZ)).toBe(false);
    expect(isWithinWindow(lunch, at('2026-10-11T12:00:00'), TZ)).toBe(false); // Sunday
  });

  it('is always available without restrictions', () => {
    const always = { availableDays: [], availableFrom: null, availableTo: null };
    expect(isWithinWindow(always, at('2026-10-11T03:00:00'), TZ)).toBe(true);
  });
});
