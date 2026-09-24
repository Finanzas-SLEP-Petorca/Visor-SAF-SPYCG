// Utilidades puras de texto y números (sin DOM ni Firebase).

export const MESES = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
export const MESES_LARGOS = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO',
  'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];

/** Mayúsculas, sin tildes y sin espacios dobles. */
export function normTxt(v) {
  if (v === null || v === undefined) return '';
  return String(v)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Vacío, guion o solo espacios. */
export function esVacio(v) {
  if (v === null || v === undefined) return true;
  if (typeof v === 'number') return Number.isNaN(v);
  const s = String(v).trim();
  return s === '' || /^[-–—]+$/.test(s);
}

/**
 * Convierte un monto a pesos enteros. "-" o vacío → 0.
 * Acepta números y textos con formato chileno ("$1.234.567", "1.234,5").
 * Devuelve { valor, valido }.
 */
export function parseMonto(v) {
  if (esVacio(v)) return { valor: 0, valido: true };
  if (typeof v === 'number') return { valor: Math.round(v), valido: true };
  if (typeof v === 'boolean') return { valor: 0, valido: false };
  let s = String(v).replace(/[$\s]/g, '');
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d+,\d+$/.test(s)) s = s.replace(',', '.');
  const n = Number(s);
  if (!Number.isFinite(n)) return { valor: 0, valido: false };
  return { valor: Math.round(n), valido: true };
}

/** "UNIDAD EJEMPLO" → "UNIDAD-EJEMPLO". */
export function slugUnidad(unidad) {
  return normTxt(unidad).replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export function pad3(n) {
  return String(n).padStart(3, '0');
}

/** Similitud de Dice sobre bigramas (0 a 1) de textos normalizados. */
export function similitud(a, b) {
  const x = normTxt(a).replace(/[^A-Z0-9 ]/g, '');
  const y = normTxt(b).replace(/[^A-Z0-9 ]/g, '');
  if (x === y) return 1;
  if (x.length < 2 || y.length < 2) return 0;
  const bigramas = (s) => {
    const m = new Map();
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2);
      m.set(g, (m.get(g) || 0) + 1);
    }
    return m;
  };
  const bx = bigramas(x);
  const by = bigramas(y);
  let inter = 0;
  for (const [g, n] of bx) inter += Math.min(n, by.get(g) || 0);
  return (2 * inter) / (x.length - 1 + y.length - 1);
}

/** Suma de un arreglo de números. */
export function suma(arr) {
  let s = 0;
  for (const v of arr) s += Number(v) || 0;
  return s;
}
