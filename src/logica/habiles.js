// Días hábiles sobre fechas ISO "aaaa-mm-dd" (sin horas ni zona horaria).

const aUTC = (iso) => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d); };
const deUTC = (t) => new Date(t).toISOString().slice(0, 10);

export function sumarDias(iso, n) {
  return deUTC(aUTC(iso) + n * 86400000);
}

export function esHabil(iso, feriados = new Set()) {
  const dow = new Date(aUTC(iso)).getUTCDay();
  return dow !== 0 && dow !== 6 && !feriados.has(iso);
}

/** Fecha que queda `n` días hábiles antes de `iso` (hay n días hábiles entre ella, inclusive, e `iso`, exclusive). */
export function restarHabiles(iso, n, feriados = new Set()) {
  let d = iso;
  let c = 0;
  while (c < n) { d = sumarDias(d, -1); if (esHabil(d, feriados)) c += 1; }
  return d;
}

/** Días hábiles de `desde` (exclusive) a `hasta` (inclusive); negativo si `hasta` es anterior. */
export function contarHabiles(desde, hasta, feriados = new Set()) {
  if (desde === hasta) return 0;
  const signo = hasta > desde ? 1 : -1;
  let d = desde;
  let c = 0;
  while (d !== hasta) {
    d = sumarDias(d, signo);
    if (esHabil(d, feriados)) c += 1;
  }
  return signo * c;
}

/** Fecha de hoy en America/Santiago como "aaaa-mm-dd". */
export function hoyISO(fecha = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(fecha);
}

/** Lunes de la semana ISO de una fecha. */
export function lunesDe(iso) {
  const dow = new Date(aUTC(iso)).getUTCDay();
  return sumarDias(iso, dow === 0 ? -6 : 1 - dow);
}

/** Último día del mes (1-12) de 2026 u otro año. */
export function finDeMes(anio, mes) {
  return deUTC(Date.UTC(anio, mes, 0));
}
