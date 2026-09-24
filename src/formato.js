// Formatos de Chile: montos $1.234.567, fechas dd-mm-aaaa, zona America/Santiago.

const nf = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 });
const pf = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 1 });
const TZ = 'America/Santiago';

export const clp = (n) => (n === null || n === undefined || Number.isNaN(n) ? '—' : `$${nf.format(Math.round(n))}`);
export const num = (n) => nf.format(Math.round(n || 0));
export const pct = (x) => (Number.isFinite(x) ? `${pf.format(x * 100)}%` : '—');

/** Monto abreviado: $1.234 MM / $12,3 M. */
export function clpCorto(n) {
  const a = Math.abs(n || 0);
  if (a >= 1e9) return `$${pf.format(n / 1e9)} mil MM`;
  if (a >= 1e6) return `$${pf.format(n / 1e6)} MM`;
  return clp(n);
}

/** "aaaa-mm-dd" → "dd-mm-aaaa". */
export const fecha = (iso) => (iso ? String(iso).slice(0, 10).split('-').reverse().join('-') : '—');

/** Timestamp de Firestore, Date o ISO → Date. */
export function aDate(v) {
  if (!v) return null;
  if (typeof v.toDate === 'function') return v.toDate();
  if (v instanceof Date) return v;
  if (typeof v === 'object' && 'seconds' in v) return new Date(v.seconds * 1000);
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function fechaHora(v) {
  const d = aDate(v);
  if (!d) return '—';
  return new Intl.DateTimeFormat('es-CL', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .format(d).replace(',', '');
}

export function fechaDe(v) {
  const d = aDate(v);
  if (!d) return '—';
  return new Intl.DateTimeFormat('es-CL', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
}

export function hace(v) {
  const d = aDate(v);
  if (!d) return '';
  const min = Math.round((Date.now() - d.getTime()) / 60000);
  if (min < 1) return 'hace instantes';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} días`;
}

/** Escapa texto para insertarlo en HTML. Todo dato de planillas o usuarios pasa por aquí. */
export function esc(v) {
  if (v === null || v === undefined) return '';
  return String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
