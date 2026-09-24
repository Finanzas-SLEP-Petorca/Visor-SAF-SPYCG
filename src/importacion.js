// Preparación de una importación (navegador o agente local): normaliza cada libro, lo concilia
// contra visor_base y arma el documento y las entradas de historial. Sin DOM ni Firebase.
import { normalizarPlanilla, PATRON_ARCHIVO_UNIDAD, VERSION_NORMALIZADOR } from './normalizer.js';
import { normalizarSEP, PATRON_ARCHIVO_SEP } from './normalizer-sep.js';
import { conciliar, entradasHistorial } from './conciliacion.js';

export function clasificarArchivo(nombre) {
  const base = String(nombre).split(/[\\/]/).pop();
  if (base.startsWith('~$') || !/\.xls[xm]?$/i.test(base)) return 'ignorado';
  if (PATRON_ARCHIVO_UNIDAD.test(base)) return 'unidad';
  if (PATRON_ARCHIVO_SEP.test(base)) return 'SEP';
  return 'ignorado';
}

export async function sha256(texto) {
  const buf = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * @param {{nombre: string, lastModified: number|Date, libro: object}} archivo
 * @param {Record<string, object>} basesPrevias  visor_base actual por slug
 * @param {object} p parámetros
 * @param {string} [hoy]
 */
export async function prepararArchivo(archivo, basesPrevias, p, hoy) {
  const tipo = clasificarArchivo(archivo.nombre);
  const fileModifiedAt = new Date(archivo.lastModified).toISOString();
  if (tipo === 'ignorado') return { nombre: archivo.nombre, tipo };
  let r;
  if (tipo === 'SEP') {
    const s = normalizarSEP(archivo.libro, archivo.nombre);
    r = { unidad: 'SEP', slug: 'SEP', filas: s.items, advertencias: s.advertencias, resumen: s.resumen };
  } else {
    r = normalizarPlanilla(archivo.libro, archivo.nombre, { mesCorte: p.mesCorte, fileModifiedAt, hoy, diasFrescura: p.diasFrescura });
  }
  const previo = basesPrevias[r.slug];
  const conc = conciliar(previo?.filas || {}, r.filas, p.umbralSimilitud ?? 0.5);
  const filas = Object.fromEntries(r.filas.map((f) => [f.id, f]));
  const hash = await sha256(JSON.stringify(filas));
  const doc = JSON.parse(JSON.stringify({
    unidad: r.unidad,
    slug: r.slug,
    archivo: archivo.nombre.split(/[\\/]/).pop(),
    fileModifiedAt,
    fileModifiedBy: archivo.modificadoPor || null,
    hash,
    normalizador: VERSION_NORMALIZADOR,
    advertencias: r.advertencias,
    resumen: r.resumen,
    filas,
  }));
  return {
    nombre: archivo.nombre, tipo, slug: r.slug, unidad: r.unidad, resumen: r.resumen, advertencias: r.advertencias,
    conc, doc, sinCambios: previo?.hash === hash, historial: entradasHistorial(r.slug, conc),
  };
}
