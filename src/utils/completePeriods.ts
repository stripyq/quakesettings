// Activity charts plot a month or week only once it is complete: the archive's newest match day
// (UTC) must be on or after the period's last day. The current, partial period is left out, not
// drawn as a drop to near zero. Applied at render time; the data files under public/data stay
// complete. CTF and TDM are synced together, so the newest day is taken over both.
import fs from 'node:fs';
import path from 'node:path';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
  'September', 'October', 'November', 'December'];

// Newest YYYY-MM-DD key in public/data/{ctf,tdm}/activity.json by_day (derive-archive.cjs,
// derive-tdm-all.cjs); '' when neither file can be read.
export function archiveNewestDay(): string {
  let newest = '';
  for (const gt of ['ctf', 'tdm']) {
    try {
      const file = path.join(process.cwd(), `public/data/${gt}/activity.json`);
      const days = Object.keys(JSON.parse(fs.readFileSync(file, 'utf8')).by_day ?? {});
      for (const d of days) if (d > newest) newest = d;
    } catch {
      // No activity data for this gametype
    }
  }
  return newest;
}

// Last day of a YYYY-MM month, as YYYY-MM-DD.
export function monthLastDay(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

// Last day (Sunday) of the Monday-aligned week starting on YYYY-MM-DD `monday`.
export function weekLastDay(monday: string): string {
  const d = new Date(`${monday}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 6);
  return d.toISOString().slice(0, 10);
}

// Without a known newest day nothing is dropped.
export function isComplete(lastDay: string, newestDay: string): boolean {
  return newestDay === '' || newestDay >= lastDay;
}

// "October 2026" for 2026-10.
export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

// "1 November 2026" for 2026-11-01.
export function dayLabel(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return `${d} ${MONTH_NAMES[m - 1]} ${y}`;
}
