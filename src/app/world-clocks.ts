export interface WorldClock { id: number; name: string; timeZone: string; visible: boolean; }
export const CITIES = [
  ['Warszawa', 'Europe/Warsaw'], ['Londyn', 'Europe/London'], ['Paryż', 'Europe/Paris'],
  ['Berlin', 'Europe/Berlin'], ['Rzym', 'Europe/Rome'], ['Madryt', 'Europe/Madrid'],
  ['Kijów', 'Europe/Kyiv'], ['Moskwa', 'Europe/Moscow'], ['Stambuł', 'Europe/Istanbul'],
  ['Dubaj', 'Asia/Dubai'], ['Kair', 'Africa/Cairo'], ['Lagos', 'Africa/Lagos'],
  ['Johannesburg', 'Africa/Johannesburg'], ['Nowy Jork', 'America/New_York'],
  ['Waszyngton', 'America/New_York'], ['Toronto', 'America/Toronto'], ['Chicago', 'America/Chicago'],
  ['Los Angeles', 'America/Los_Angeles'], ['Meksyk', 'America/Mexico_City'],
  ['São Paulo', 'America/Sao_Paulo'], ['Buenos Aires', 'America/Argentina/Buenos_Aires'],
  ['Nowe Delhi', 'Asia/Kolkata'], ['Singapur', 'Asia/Singapore'], ['Hongkong', 'Asia/Hong_Kong'],
  ['Pekin', 'Asia/Shanghai'], ['Tokio', 'Asia/Tokyo'], ['Seul', 'Asia/Seoul'],
  ['Sydney', 'Australia/Sydney'], ['Auckland', 'Pacific/Auckland'], ['Honolulu', 'Pacific/Honolulu'],
  ['Zurych', 'Europe/Zurich'], ['Sztokholm', 'Europe/Stockholm'], ['Bangkok', 'Asia/Bangkok'],
  ['Dżakarta', 'Asia/Jakarta'], ['Katmandu', 'Asia/Kathmandu'], ['Adelajda', 'Australia/Adelaide'],
  ['Vancouver', 'America/Vancouver'], ['San Francisco', 'America/Los_Angeles']
] as const;
export function defaultWorldClocks(): WorldClock[] {
  return CITIES.slice(0, 30).map(([name, timeZone], index) => ({ id: index + 1, name, timeZone, visible: true }));
}
export function validTimeZone(timeZone: string): boolean {
  try { new Intl.DateTimeFormat('en', { timeZone }); return true; } catch { return false; }
}
export function timeZones(): string[] {
  const known = CITIES.map(([, zone]) => zone);
  return [...new Set(['UTC', ...known, ...(typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [])])].sort();
}
export function zonedTime(now: Date, timeZone: string, locale: string) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const part = (type: string) => Number(parts.find(item => item.type === type)?.value ?? 0);
  const second = part('second');
  const minute = part('minute') + second / 60;
  const hour = part('hour');
  return {
    time: `${String(hour).padStart(2, '0')}:${String(Math.floor(minute)).padStart(2, '0')}:${String(second).padStart(2, '0')}`,
    date: new Intl.DateTimeFormat(locale, { timeZone, day: 'numeric', month: 'short', weekday: 'short' }).format(now),
    offset: new Intl.DateTimeFormat('en', { timeZone, timeZoneName: 'shortOffset' }).formatToParts(now).find(item => item.type === 'timeZoneName')?.value.replace('GMT', 'UTC') ?? 'UTC',
    hourAngle: `${((hour % 12) + minute / 60) * 30}deg`, minuteAngle: `${minute * 6}deg`, secondAngle: `${second * 6}deg`
  };
}
