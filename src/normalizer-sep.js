// Normalizador del "Seguimiento Gastos SEP" (hoja "Seguimiento SEP").
// Módulo ES puro. No lee la columna "Etapa actual" (trae #REF!): la etapa se recalcula.

import { normTxt, esVacio, parseMonto, pad3 } from './util.js';
import { hojaAMatriz, extraerOCs } from './normalizer.js';

export const PATRON_ARCHIVO_SEP = /SEGUIMIENTO.*SEP.*\.xls[xm]?$/i;

const ENCABEZADOS = [
  // [campo, prueba sobre el encabezado normalizado] — el orden importa
  ['etapaActual', (h) => h.includes('ETAPA')],
  ['nro', (h) => /^(N|NO|NRO|#)\s*[°º.]?$/.test(h)],
  ['subtitulo', (h) => h.startsWith('SUBT')],
  ['item', (h) => h === 'ITEM' || h.startsWith('ITEM')],
  ['montoPresupuestado', (h) => h.includes('PRESUPUESTADO')],
  ['modalidad', (h) => h.includes('MODALIDAD')],
  ['idMercadoPublico', (h) => h.includes('MERCADO PUBLICO') || h === 'ID MP'],
  ['estadoCompra', (h) => h.includes('ESTADO') && h.includes('COMPRA')],
  ['documentoFormaliza', (h) => h.includes('FORMALIZA')],
  ['ocs', (h) => /\bOC\b/.test(h) || h.includes('ORDEN DE COMPRA')],
  ['montoAdjudicado', (h) => h.includes('ADJUDICADO')],
  ['estadoEjecucion', (h) => h.includes('ESTADO') && h.includes('EJECUCION')],
  ['verificadores', (h) => h.includes('VERIFICADOR')],
  ['visacionUATP', (h) => h.includes('VISACION')],
  ['montoDevengado', (h) => h.includes('DEVENGADO')],
  ['montoPagado', (h) => h.includes('PAGADO') && !h.includes('POR PAGAR')],
  ['porPagar', (h) => h.includes('POR PAGAR')],
  ['saldo', (h) => h.startsWith('SALDO')],
  ['porcentajeEjecucion', (h) => h.includes('%')],
  ['observaciones', (h) => h.startsWith('OBSERVACION')],
];

function campoSEP(h) {
  if (!h) return null;
  for (const [campo, prueba] of ENCABEZADOS) if (prueba(h)) return campo;
  return null;
}

const txt = (v) => (esVacio(v) || (typeof v === 'object' && v && 'error' in v) ? null : String(v).trim());

/**
 * Etapa 0–4 / X de un ítem SEP según sus estados (sección 7.1).
 */
export function etapaSEP(item) {
  const ej = normTxt(item.estadoEjecucion);
  const co = normTxt(item.estadoCompra);
  if (ej.startsWith('PAGADO')) return 4;
  if (ej.startsWith('EN EJECUCION') || ej.startsWith('RECEPCION')) return 3;
  if (item.montoDevengado > 0) return 3;
  if (co.startsWith('ADJUDICADA')) return 2;
  if (item.ocs.length) return 2;
  if (['ELABORACION DE BASES', 'PUBLICADA', 'EN EVALUACION', 'DESIERTA', 'REVOCADA'].some((e) => co.startsWith(e))) return 1;
  return 0;
}

/**
 * @returns {{ unidad:'SEP', slug:'SEP', items: object[], advertencias: object[], resumen: object }}
 */
export function normalizarSEP(libro, nombreArchivo, op = {}) {
  const advertencias = [];
  const adv = (codigo, mensaje, extra = {}) => advertencias.push({ codigo, mensaje, ...extra });
  const nombreHoja = libro.SheetNames.find((n) => normTxt(n) === 'SEGUIMIENTO SEP')
    || libro.SheetNames.find((n) => normTxt(n).includes('SEGUIMIENTO'))
    || libro.SheetNames[0];
  const m = hojaAMatriz(libro.Sheets[nombreHoja]);

  // Encabezado: fila con "ITEM" y "PRESUPUESTADO" (fila 4 por defecto).
  let filaEnc = 3;
  for (let r = 0; r < Math.min(m.length, 12); r++) {
    const hs = (m[r] || []).map((v) => normTxt(txt(v)));
    if (hs.some((h) => h.startsWith('ITEM')) && hs.some((h) => h.includes('PRESUPUESTADO'))) { filaEnc = r; break; }
  }
  const col = {};
  (m[filaEnc] || []).forEach((v, i) => {
    const c = campoSEP(normTxt(txt(v)));
    if (c && !(c in col)) col[c] = i;
  });
  for (const req of ['item', 'montoPresupuestado']) {
    if (!(req in col)) throw new Error(`Seguimiento SEP: no se encontró la columna "${req}" en la fila ${filaEnc + 1}`);
  }
  const get = (f, c) => (c in col ? f[col[c]] ?? null : null);

  const items = [];
  let refs = 0;
  let correlativo = 0;
  for (let r = filaEnc + 1; r < m.length; r++) {
    const f = m[r] || [];
    const item = txt(get(f, 'item'));
    const nroTxt = txt(get(f, 'nro'));
    if (/^TOTAL/.test(normTxt(item)) || /^TOTAL/.test(normTxt(nroTxt))) break;
    if (!item) continue;
    correlativo += 1;
    const filaExcel = r + 1;
    const et = get(f, 'etapaActual');
    if (et && typeof et === 'object' && 'error' in et) refs += 1;
    const nro = Number(String(nroTxt ?? '').replace(/\D/g, '')) || correlativo;
    const monto = (c) => parseMonto(txt(get(f, c)) === null ? null : get(f, c)).valor;
    const { ocs } = extraerOCs(txt(get(f, 'ocs')));
    const it = {
      id: `SEP-${pad3(nro)}`,
      fila: filaExcel,
      nro,
      subtitulo: txt(get(f, 'subtitulo')),
      item,
      detalle: item,
      montoPresupuestado: monto('montoPresupuestado'),
      modalidad: txt(get(f, 'modalidad')),
      idMercadoPublico: txt(get(f, 'idMercadoPublico')),
      estadoCompra: txt(get(f, 'estadoCompra')),
      documentoFormaliza: txt(get(f, 'documentoFormaliza')),
      ocs,
      ocTexto: txt(get(f, 'ocs')),
      montoAdjudicado: monto('montoAdjudicado'),
      estadoEjecucion: txt(get(f, 'estadoEjecucion')),
      verificadores: txt(get(f, 'verificadores')),
      visacionUATP: 'visacionUATP' in col ? txt(get(f, 'visacionUATP')) : undefined,
      montoDevengado: monto('montoDevengado'),
      montoPagado: monto('montoPagado'),
      observaciones: txt(get(f, 'observaciones')),
      advertencias: [],
    };
    if (it.visacionUATP === undefined) delete it.visacionUATP;
    it.etapa = etapaSEP(it);
    if (normTxt(it.estadoCompra).startsWith('ADJUDICADA') && !it.montoAdjudicado) {
      it.advertencias.push('SEP_ADJUDICADA_SIN_MONTO');
      adv('SEP_ADJUDICADA_SIN_MONTO', `Fila ${filaExcel}: ítem adjudicado sin monto adjudicado`, { fila: filaExcel });
    }
    if ('visacionUATP' in it && !it.visacionUATP) {
      it.advertencias.push('SEP_SIN_VISACION');
      adv('SEP_SIN_VISACION', `Fila ${filaExcel}: ítem sin visación UATP`, { fila: filaExcel });
    }
    items.push(it);
  }
  if (refs) adv('SEP_ETAPA_REF', `La columna "Etapa actual" trae errores (#REF!) en ${refs} filas; se ignora y la etapa se recalcula`, { filas: refs });

  const resumen = {
    items: items.length,
    montoPresupuestado: items.reduce((s, x) => s + x.montoPresupuestado, 0),
    montoAdjudicado: items.reduce((s, x) => s + x.montoAdjudicado, 0),
    montoDevengado: items.reduce((s, x) => s + x.montoDevengado, 0),
    montoPagado: items.reduce((s, x) => s + x.montoPagado, 0),
    etapaREF: refs,
    porEtapa: items.reduce((a, x) => ({ ...a, [x.etapa]: (a[x.etapa] || 0) + 1 }), {}),
  };
  return { unidad: 'SEP', slug: 'SEP', hoja: nombreHoja, archivo: nombreArchivo, items, advertencias, resumen };
}

/**
 * Vínculos por OC entre ítems SEP y filas de unidades (sección 7.9).
 * @param {object[]} itemsSEP
 * @param {Record<string, {unidad:string, filas:object[]}>} bases  por slug
 * @returns {{ oc, sepId, compraId, unidad }[]}
 */
export function detectarVinculos(itemsSEP, bases) {
  const porOC = new Map();
  for (const [slug, b] of Object.entries(bases)) {
    if (slug === 'SEP') continue;
    for (const f of b.filas) for (const oc of f.ocs || []) {
      if (!porOC.has(oc)) porOC.set(oc, []);
      porOC.get(oc).push({ compraId: f.id, unidad: b.unidad });
    }
  }
  const out = [];
  for (const it of itemsSEP) for (const oc of it.ocs) {
    for (const d of porOC.get(oc) || []) out.push({ oc, sepId: it.id, compraId: d.compraId, unidad: d.unidad });
  }
  return out;
}
