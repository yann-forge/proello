// Dates au format local 'AAAA-MM-JJ' (jamais en UTC, pour éviter les décalages d'un jour)

const DAY = 86400000;
const pad = (n) => String(n).padStart(2, '0');

export const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Date et heure locales 'AAAA-MM-JJTHH:MM' (relues comme heure locale par new Date()). */
export const toLocalStamp = (d) => `${toISO(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

export const fromISO = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const todayISO = () => toISO(new Date());

export const addDays = (iso, n) => {
  const d = fromISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
};

export const diffDays = (a, b) => Math.round((fromISO(b) - fromISO(a)) / DAY);

const fmtDay = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });
const fmtWeekday = new Intl.DateTimeFormat('fr-FR', { weekday: 'long' });
const fmtWeekdayShort = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric' });

export const fmtShort = (iso) => fmtDay.format(fromISO(iso));

/** Libellé lisible : « Aujourd'hui », « Demain », « jeudi », « 12 déc. »… */
export function relLabel(iso) {
  const n = diffDays(todayISO(), iso);
  if (n === 0) return "Aujourd'hui";
  if (n === 1) return 'Demain';
  if (n === -1) return 'Hier';
  if (n > 1 && n < 7) {
    const w = fmtWeekday.format(fromISO(iso));
    return w[0].toUpperCase() + w.slice(1);
  }
  if (n >= 7 && n < 14) return fmtWeekdayShort.format(fromISO(iso));
  return fmtShort(iso);
}
