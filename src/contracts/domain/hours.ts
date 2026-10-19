/**
 * Opening hours and time-window availability, evaluated in the restaurant's time zone.
 * Day index follows JavaScript: 0 = Sunday ... 6 = Saturday.
 */

export interface TimeInterval {
  /** "HH:MM", 24h */
  open: string;
  /** "HH:MM", 24h. When earlier than `open` the interval crosses midnight. */
  close: string;
}

export type WeeklySchedule = Record<string, TimeInterval[]>;

export const WEEKDAY_LABELS = [
  'Domingo',
  'Segunda',
  'Terça',
  'Quarta',
  'Quinta',
  'Sexta',
  'Sábado',
];

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isValidTime(value: string): boolean {
  return TIME_PATTERN.test(value);
}

export function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export interface LocalTime {
  day: number;
  minutes: number;
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/** Converts an instant to weekday + minutes-of-day in the given IANA time zone. */
export function localTime(date: Date, timeZone: string): LocalTime {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '0';
  return {
    day: WEEKDAY_INDEX[get('weekday')] ?? 0,
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
  };
}

function inInterval(interval: TimeInterval, minutes: number, sameDay: boolean): boolean {
  const open = toMinutes(interval.open);
  const close = toMinutes(interval.close);
  if (open === close) return sameDay; // open 24h
  if (open < close) return sameDay && minutes >= open && minutes < close;
  // crosses midnight: today's part is [open, 24h), yesterday's part is [0, close)
  return sameDay ? minutes >= open : minutes < close;
}

export function isOpenAt(schedule: WeeklySchedule, date: Date, timeZone: string): boolean {
  const { day, minutes } = localTime(date, timeZone);
  const today = schedule[String(day)] ?? [];
  if (today.some((i) => inInterval(i, minutes, true))) return true;
  const yesterday = schedule[String((day + 6) % 7)] ?? [];
  return yesterday.some(
    (i) => toMinutes(i.open) > toMinutes(i.close) && inInterval(i, minutes, false),
  );
}

export interface AvailabilityWindow {
  /** Empty array means every day. */
  availableDays: number[];
  availableFrom: string | null;
  availableTo: string | null;
}

export function isWithinWindow(window: AvailabilityWindow, date: Date, timeZone: string): boolean {
  const { day, minutes } = localTime(date, timeZone);
  if (window.availableDays.length > 0 && !window.availableDays.includes(day)) return false;
  if (!window.availableFrom || !window.availableTo) return true;
  const from = toMinutes(window.availableFrom);
  const to = toMinutes(window.availableTo);
  return from <= to ? minutes >= from && minutes < to : minutes >= from || minutes < to;
}
