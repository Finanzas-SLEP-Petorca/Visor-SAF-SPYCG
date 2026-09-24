// Conciliación de una importación contra lo ya guardado en visor_base (regla 10).
// Puro: sin DOM ni Firebase.

import { similitud } from './util.js';

/** Campos que se comparan para registrar cambios en el historial. */
export const CAMPOS_COMPARADOS = [
  'programa', 'subtitulo', 'asignacion', 'adminContrato', 'detalle', 'temporalidad',
  'montoPAC', 'montoOC', 'ocs', 'tipoCompra', 'valorOT', 'avanceOT', 'valorRecepcion',
  'devengadoPlanilla', 'pendienteOT', 'estadoUnidad', 'desglose', 'totalDesglose', 'obsUnidad',
  // SEP
  'item', 'montoPresupuestado', 'modalidad', 'idMercadoPublico', 'estadoCompra', 'documentoFormaliza',
  'montoAdjudicado', 'estadoEjecucion', 'verificadores', 'visacionUATP', 'montoDevengado', 'montoPagado', 'observaciones',
];

const igual = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * @param {Record<string, object>} anteriores  filas guardadas por ID
 * @param {object[]} nuevas                    filas normalizadas
 * @param {number} [umbral=0.5]                similitud mínima del detalle
 * @returns {{ nuevos: string[], desaparecidos: string[], detalleCambiado: {id, antes, despues, similitud}[],
 *             modificados: {id, cambios: {campo, antes, despues}[]}[], sinCambios: number, primeraCarga: boolean }}
 */
export function conciliar(anteriores, nuevas, umbral = 0.5) {
  const prev = anteriores || {};
  const primeraCarga = Object.keys(prev).length === 0;
  const idsNuevos = new Set(nuevas.map((f) => f.id));
  const out = { nuevos: [], desaparecidos: [], detalleCambiado: [], modificados: [], sinCambios: 0, primeraCarga };
  for (const f of nuevas) {
    const a = prev[f.id];
    if (!a) { out.nuevos.push(f.id); continue; }
    const s = similitud(a.detalle, f.detalle);
    if ((a.detalle || f.detalle) && s < umbral) out.detalleCambiado.push({ id: f.id, antes: a.detalle, despues: f.detalle, similitud: Math.round(s * 100) / 100 });
    const cambios = [];
    for (const c of CAMPOS_COMPARADOS) {
      if (!(c in f) && !(c in a)) continue;
      if (!igual(a[c], f[c])) cambios.push({ campo: c, antes: a[c] ?? null, despues: f[c] ?? null });
    }
    if (cambios.length) out.modificados.push({ id: f.id, cambios });
    else out.sinCambios += 1;
  }
  for (const id of Object.keys(prev)) if (!idsNuevos.has(id)) out.desaparecidos.push(id);
  return out;
}

/**
 * Entradas de historial (tipo 'sync') que resumen una conciliación. Se limita la cantidad
 * para no superar el tamaño de un lote de Firestore: sobre `max` se agrupa por compra.
 */
export function entradasHistorial(slug, conc, { max = 300 } = {}) {
  if (conc.primeraCarga) {
    return [{ compraId: null, tipo: 'sync', campo: `importacion:${slug}`, antes: null, despues: { nuevas: conc.nuevos.length } }];
  }
  const e = [];
  for (const id of conc.nuevos) e.push({ compraId: id, tipo: 'sync', campo: 'alta', antes: null, despues: null });
  for (const id of conc.desaparecidos) e.push({ compraId: id, tipo: 'sync', campo: 'baja', antes: null, despues: null });
  const detallado = conc.modificados.reduce((n, m) => n + m.cambios.length, 0) + e.length <= max;
  for (const m of conc.modificados) {
    if (detallado) for (const c of m.cambios) e.push({ compraId: m.id, tipo: 'sync', campo: c.campo, antes: c.antes, despues: c.despues });
    else e.push({ compraId: m.id, tipo: 'sync', campo: m.cambios.map((c) => c.campo).join(','), antes: null, despues: null });
  }
  if (e.length > max) {
    return [{ compraId: null, tipo: 'sync', campo: `importacion:${slug}`, antes: null,
      despues: { nuevas: conc.nuevos.length, desaparecidas: conc.desaparecidos.length, modificadas: conc.modificados.length } }];
  }
  return e;
}
