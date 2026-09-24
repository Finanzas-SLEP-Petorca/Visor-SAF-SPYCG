// Normalizador de las planillas "ESTATUS DEVENGOS COMPRAS <UNIDAD> 2026.xlsx".
// Módulo ES puro: no usa DOM, Firebase ni SheetJS directamente. Recibe el libro
// ya leído (objeto de SheetJS: { SheetNames, Sheets }) y el nombre del archivo.
// Lo reutilizan el navegador, el agente local y el conector en la nube.

import { MESES, MESES_LARGOS, normTxt, esVacio, parseMonto, slugUnidad, pad3 } from './util.js';

export const VERSION_NORMALIZADOR = 1;

export const PATRON_ARCHIVO_UNIDAD = /ESTATUS\s+DEVENGOS\s+COMPRAS\s+(.+?)\s+(20\d{2})\s*\.xls[xm]?$/i;

/** Expresión de OC. Admite sufijo con letra+dígito (L1) además de dos letras. */
export const PATRON_OC = /\d{6,8}-\d{1,4}-[A-Z][A-Z0-9]\d{2}/g;

/** Prefijo de la unidad compradora en Mercado Público → programa. */
export const PREFIJOS_OC = { '1375756': '01', '1506668': '02' };

export const TIPOS = {
  AGIL: 'COMPRA ÁGIL',
  CM: 'CONVENIO MARCO',
  LIC: 'LICITACIÓN',
  TD: 'TRATO DIRECTO',
};

const SUFIJO_A_TIPO = { AG: 'AGIL', CM: 'CM', SE: 'LIC', LE: 'LIC', LP: 'LIC', LQ: 'LIC', LR: 'LIC', L1: 'LIC', TD: 'TD' };

/** Errores de tipeo conocidos en el tipo de compra. */
const ESTADOS_UNIDAD = ['PROYECTADO', 'EN PROCESO', 'FINALIZADO'];

/** Reglas de estado inferido desde observaciones (en orden de precedencia). */
const REGLAS_INFERENCIA = [
  [/no se realizar|no se ejecutar|se libera|eliminar|proximo ano|aplazad/, 'DESISTIDA'],
  [/desiert/, 'DESIERTA'],
  [/adjudic/, 'ADJUDICADA'],
  [/evaluaci/, 'EN EVALUACIÓN'],
  [/publicaci/, 'PUBLICADA'],
  [/bases/, 'ELABORACIÓN DE BASES'],
  [/ejecutad/, 'EJECUTADA'],
];

// Columna por defecto de cada campo (respaldo si el encabezado no se reconoce).
const COLUMNAS_DEFECTO = {
  nro: 'A', programa: 'B', subtitulo: 'C', asignacion: 'D', adminContrato: 'E', detalle: 'F',
  temporalidad: 'G', montoPAC: 'H', montoOC: 'I', ocs: 'J', tipoCompra: 'K', valorOT: 'L',
  avanceOT: 'M', valorRecepcion: 'N', devengadoPlanilla: 'O', pendienteOT: 'P', estadoUnidad: 'Q',
  ENE: 'R', FEB: 'S', MAR: 'T', ABR: 'U', MAY: 'V', JUN: 'W', JUL: 'X', AGO: 'Y', SEP: 'Z',
  OCT: 'AA', NOV: 'AB', DIC: 'AC', totalDesglose: 'AD', obsUnidad: 'AG',
};

// Encabezado estándar esperado por campo (normalizado).
const ENCABEZADO_ESTANDAR = {
  programa: 'PROGRAMA', subtitulo: 'SUBTITULO', asignacion: 'ASIG PPTO',
  adminContrato: 'ADMINISTRADOR CONTRATO', detalle: 'DETALLE COMPRA',
  temporalidad: 'TEMPORALIDAD DE FACTURACION', montoPAC: 'MONTO $ INICIAL PAC',
  montoOC: 'MONTO $ INICIAL ORDEN DE COMPRA', ocs: 'N° ORDEN DE COMPRA', tipoCompra: 'TIPO DE COMPRA',
};

/** Reconoce el campo de un encabezado normalizado. El orden importa. */
function campoDeEncabezado(h) {
  if (!h) return null;
  if (h.includes('DIFERENCIA')) return null;
  const mes = MESES_LARGOS.indexOf(h === 'SETIEMBRE' ? 'SEPTIEMBRE' : h);
  if (mes >= 0) return MESES[mes];
  if (/^(N|NO|NRO|NUMERO|#)\s*[°º.]?$/.test(h) || /^N\s*[°º]$/.test(h)) return 'nro';
  if (h.includes('PENDIENTE')) return 'pendienteOT';
  if (h.includes('AVANCE')) return 'avanceOT';
  if (h.includes('EJECUTADO')) return 'totalDesglose';
  if (h.includes('FACTURADO')) return 'devengadoPlanilla';
  if (h.includes('RECEPCION')) return 'valorRecepcion';
  if (h.includes('ORDENES DE TRABAJO') || h.includes('ORDEN DE TRABAJO')) return 'valorOT';
  if (h.includes('TEMPORALIDAD')) return 'temporalidad';
  if (/\bPAC\b/.test(h)) return 'montoPAC';
  if (h.includes('ORDEN DE COMPRA') && h.includes('MONTO')) return 'montoOC';
  if (h.includes('ORDEN DE COMPRA')) return 'ocs';
  if (h.includes('TIPO DE COMPRA')) return 'tipoCompra';
  if (h.startsWith('PROGRAMA')) return 'programa';
  if (h.startsWith('SUBTITULO')) return 'subtitulo';
  if (h.startsWith('ASIG')) return 'asignacion';
  if (h.includes('ADMINISTRADOR')) return 'adminContrato';
  if (h.includes('DETALLE')) return 'detalle';
  if (h.includes('PROVEEDOR')) return 'detalle';
  if (h.startsWith('OBSERVACION')) return 'obsUnidad';
  if (h.startsWith('ESTADO')) return 'estadoUnidad';
  return null;
}

// ---------------------------------------------------------------- hoja → matriz

export function colALetra(i) {
  let s = '';
  i += 1;
  while (i > 0) { const r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26); }
  return s;
}
export function letraACol(l) {
  let n = 0;
  for (const ch of l.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}
function decodificarCelda(ref) {
  const m = /^([A-Z]+)(\d+)$/.exec(ref);
  return { c: letraACol(m[1]), r: Number(m[2]) - 1 };
}

/**
 * Convierte una hoja de SheetJS en una matriz [fila][columna] de valores.
 * Las celdas con error (#REF!, #N/A…) se devuelven como { error: '#REF!' }.
 */
export function hojaAMatriz(ws) {
  if (!ws || !ws['!ref']) return [];
  const [ini, fin] = ws['!ref'].split(':');
  const a = decodificarCelda(ini);
  const b = decodificarCelda(fin || ini);
  const filas = [];
  for (let r = 0; r <= b.r; r++) {
    const fila = new Array(b.c + 1).fill(null);
    for (let c = a.c; c <= b.c; c++) {
      const cel = ws[colALetra(c) + (r + 1)];
      if (!cel) continue;
      if (cel.t === 'e') fila[c] = { error: cel.w || '#ERROR' };
      else if (cel.t === 'z') fila[c] = null;
      else fila[c] = cel.v;
    }
    filas.push(fila);
  }
  return filas;
}

const esError = (v) => v !== null && typeof v === 'object' && !(v instanceof Date) && 'error' in v;
const valor = (v) => (esError(v) ? null : v);

// ---------------------------------------------------------------- reglas por campo

/** Regla 1: subtítulo (2 dígitos) y asignación (4 o más dígitos) entre C y D. */
export function resolverSubtituloAsignacion(c, d) {
  const limpiar = (v) => (esVacio(v) ? '' : String(v).replace(/\s+/g, ''));
  const dig = (s) => s.replace(/\D/g, '').length;
  const sc = limpiar(c);
  const sd = limpiar(d);
  const dc = dig(sc);
  const dd = dig(sd);
  let subtitulo = null;
  let asignacion = null;
  let ajuste = null; // 'invertido' | 'deducido' | null
  if (dc === 2 && (dd >= 4 || dd === 0)) { subtitulo = sc; asignacion = sd || null; }
  else if (dc >= 4 && dd === 2) { subtitulo = sd; asignacion = sc; ajuste = 'invertido'; }
  else if (dc >= 4 && dd === 0) { asignacion = sc; subtitulo = sc.replace(/\D/g, '').slice(0, 2); ajuste = 'deducido'; }
  else if (dd >= 4 && dc !== 2) { asignacion = sd; subtitulo = sd.replace(/\D/g, '').slice(0, 2); ajuste = 'deducido'; }
  else { subtitulo = sc || null; asignacion = sd || null; }
  return { subtitulo, asignacion, ajuste };
}

/** Regla 2: programa como texto de 2 dígitos. */
export function normalizarPrograma(v) {
  if (esVacio(v)) return null;
  const d = String(v).replace(/\D/g, '');
  if (!d) return null;
  return d.slice(-2).padStart(2, '0');
}

/** Categoría (AGIL, CM, LIC, TD, OTRO) de un tipo de compra normalizado. */
export function categoriaTipo(tipoNorm) {
  if (!tipoNorm) return null;
  if (tipoNorm.includes('AGIL')) return 'AGIL';
  if (tipoNorm.includes('CONVENIO') || tipoNorm.includes('GRAN COMPRA')) return 'CM';
  if (tipoNorm.includes('LICITACION')) return 'LIC';
  if (tipoNorm.includes('TRATO')) return 'TD';
  return 'OTRO';
}

/** Regla 3: tipo de compra en mayúsculas; corrige errores de tipeo conocidos ("COMRA"). */
export function normalizarTipoCompra(v) {
  if (esVacio(v)) return { tipo: null, corregido: false };
  let tipo = String(v).toUpperCase().replace(/\s+/g, ' ').trim();
  let corregido = false;
  if (/\bCOMRA\b/.test(tipo)) { tipo = tipo.replace(/\bCOMRA\b/g, 'COMPRA'); corregido = true; }
  if (normTxt(tipo) === 'COMPRA AGIL') tipo = TIPOS.AGIL;
  return { tipo, corregido };
}

/** Regla 4: extrae las OC de una celda. */
export function extraerOCs(v) {
  if (esVacio(v)) return { ocs: [], noAplica: false };
  const s = String(v).toUpperCase();
  const ocs = [...new Set(s.match(PATRON_OC) || [])];
  const noAplica = ocs.length === 0 && normTxt(s).includes('NO APLICA');
  return { ocs, noAplica };
}

export function tipoDesdeOC(oc) {
  const suf = /-([A-Z][A-Z0-9])\d{2}$/.exec(oc);
  return suf ? SUFIJO_A_TIPO[suf[1]] || null : null;
}
export function programaDesdeOC(oc) {
  return PREFIJOS_OC[oc.split('-')[0]] || null;
}

/** Regla 8: estado sugerido desde las observaciones. */
export function inferirEstado(obs) {
  if (esVacio(obs)) return null;
  const t = String(obs).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  for (const [re, estado] of REGLAS_INFERENCIA) if (re.test(t)) return estado;
  return null;
}

/** Regla 9: separa los seguimientos fechados "dd/mm …" de las observaciones. */
export function separarSeguimientos(obs) {
  if (esVacio(obs)) return [];
  const s = String(obs).replace(/\r/g, '');
  const re = /(^|[\s;,.])(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?=[\s:\-–]|$)/g;
  const cortes = [];
  let m;
  while ((m = re.exec(s))) {
    const dd = Number(m[2]);
    const mm = Number(m[3]);
    if (dd >= 1 && dd <= 31 && mm >= 1 && mm <= 12) {
      cortes.push({ pos: m.index + m[1].length, fecha: `${pad2(dd)}/${pad2(mm)}`, largo: m[0].length - m[1].length });
    }
  }
  const out = [];
  const limpiar = (t) => t.replace(/^[\s:\-–]+/, '').replace(/[\s;,]+$/, '').trim();
  const previo = limpiar(s.slice(0, cortes.length ? cortes[0].pos : s.length));
  if (previo) out.push({ fecha: null, texto: previo });
  cortes.forEach((c, i) => {
    const texto = limpiar(s.slice(c.pos + c.largo, i + 1 < cortes.length ? cortes[i + 1].pos : s.length));
    out.push({ fecha: c.fecha, texto });
  });
  return out;
}
const pad2 = (n) => String(n).padStart(2, '0');

// ---------------------------------------------------------------- principal

/** Unidad a partir del nombre de archivo ("ESTATUS DEVENGOS COMPRAS X 2026.xlsx" → "X"). */
export function unidadDesdeArchivo(nombre) {
  const base = String(nombre).split(/[\\/]/).pop();
  const m = PATRON_ARCHIVO_UNIDAD.exec(base);
  return m ? normTxt(m[1]) : null;
}

function detectarEncabezado(matriz) {
  let mejor = { fila: 3, n: 0 };
  for (let r = 0; r < Math.min(matriz.length, 12); r++) {
    const campos = new Set((matriz[r] || []).map((v) => campoDeEncabezado(normTxt(valor(v)))).filter(Boolean));
    const clave = campos.has('programa') || campos.has('detalle');
    if (clave && campos.size > mejor.n) mejor = { fila: r, n: campos.size };
  }
  return mejor.fila;
}

/**
 * Normaliza una planilla de unidad.
 * @param {object} libro   Libro de SheetJS.
 * @param {string} nombreArchivo
 * @param {object} [op]
 * @param {number} [op.mesCorte=8]       Último mes (1-12) que se trata como ejecutado.
 * @param {Date|string} [op.fileModifiedAt]
 * @param {Date|string} [op.hoy]
 * @param {number} [op.diasFrescura=15]
 * @returns {{ unidad, slug, filas: object[], advertencias: object[], resumen: object }}
 */
export function normalizarPlanilla(libro, nombreArchivo, op = {}) {
  const mesCorte = op.mesCorte ?? 8;
  const diasFrescura = op.diasFrescura ?? 15;
  const advertencias = [];
  const adv = (codigo, mensaje, extra = {}) => advertencias.push({ codigo, mensaje, ...extra });

  const unidad = op.unidad || unidadDesdeArchivo(nombreArchivo);
  if (!unidad) throw new Error(`El nombre "${nombreArchivo}" no sigue el patrón "ESTATUS DEVENGOS COMPRAS <UNIDAD> 2026.xlsx"`);
  const slug = slugUnidad(unidad);

  const nombreHoja = libro.SheetNames.find((n) => normTxt(n) !== 'LISTA') || libro.SheetNames[0];
  const matriz = hojaAMatriz(libro.Sheets[nombreHoja]);
  const filaEnc = detectarEncabezado(matriz);
  const enc = (matriz[filaEnc] || []).map((v) => normTxt(valor(v)));

  // Mapa campo → índice de columna: letra por defecto, reemplazada por el encabezado si se reconoce.
  const col = {};
  for (const [campo, letra] of Object.entries(COLUMNAS_DEFECTO)) col[campo] = letraACol(letra);
  const encontrados = new Set();
  let detalleEsProveedor = false;
  const distintos = [];
  enc.forEach((h, i) => {
    const campo = campoDeEncabezado(h);
    if (!campo || encontrados.has(campo)) return;
    encontrados.add(campo);
    col[campo] = i;
    if (campo === 'detalle' && h.includes('PROVEEDOR') && !h.includes('DETALLE')) detalleEsProveedor = true;
    const est = ENCABEZADO_ESTANDAR[campo];
    if (est && h !== est && !(campo === 'ocs' && /^N\s*[°ºO]?\s*ORDEN DE COMPRA$/.test(h))) {
      distintos.push(`${colALetra(i)}: "${h}" (se esperaba "${est}")`);
    }
  });
  if (distintos.length) adv('ENCABEZADO_DISTINTO', `Encabezados distintos al estándar: ${distintos.join('; ')}`);
  // Columna de estado (Q) solo si su encabezado está vacío o dice ESTADO.
  const hQ = enc[col.estadoUnidad] || '';
  const usarEstado = encontrados.has('estadoUnidad') || hQ === '';

  const celda = (fila, campo) => valor(fila[col[campo]] ?? null);

  const filas = [];
  const vistos = new Map();
  let correlativo = 0;
  for (let r = filaEnc + 1; r < matriz.length; r++) {
    const f = matriz[r] || [];
    const claves = ['programa', 'subtitulo', 'asignacion', 'adminContrato', 'detalle'];
    if (claves.every((k) => esVacio(celda(f, k)))) continue;
    const detalleTxt = esVacio(celda(f, 'detalle')) ? null : String(celda(f, 'detalle')).trim();
    if (esVacio(celda(f, 'nro')) && detalleTxt && /^TOTAL/.test(normTxt(detalleTxt))) continue;
    correlativo += 1;
    const filaExcel = r + 1;
    const codigos = [];
    const advFila = (codigo, mensaje) => { codigos.push(codigo); adv(codigo, mensaje, { fila: filaExcel }); };

    // N° e ID estable
    let nro = celda(f, 'nro');
    const nroNum = Number(String(nro ?? '').replace(/\D/g, ''));
    if (esVacio(nro) || !nroNum) {
      nro = null;
      advFila('NRO_VACIO', `Fila ${filaExcel}: sin N° correlativo; se usa la posición ${correlativo}`);
    }
    let id = `${slug}-${pad3(nro ? nroNum : correlativo)}`;
    if (vistos.has(id)) {
      advFila('NRO_DUPLICADO', `Fila ${filaExcel}: N° repetido (${id}, ya usado en la fila ${vistos.get(id)})`);
      id = `${id}-F${filaExcel}`;
    }
    vistos.set(id, filaExcel);

    const programa = normalizarPrograma(celda(f, 'programa'));
    const sa = resolverSubtituloAsignacion(celda(f, 'subtitulo'), celda(f, 'asignacion'));
    if (sa.ajuste === 'invertido') advFila('SUBT_INVERTIDO', `Fila ${filaExcel}: subtítulo y asignación venían invertidos (C/D)`);
    if (sa.ajuste === 'deducido') advFila('SUBT_DEDUCIDO', `Fila ${filaExcel}: subtítulo deducido de la asignación`);
    if (!sa.asignacion) advFila('ASIG_VACIA', `Fila ${filaExcel}: asignación vacía`);

    // Montos
    const monto = (campo) => {
      const m = parseMonto(celda(f, campo));
      if (!m.valido) advFila('MONTO_NO_NUMERICO', `Fila ${filaExcel}: valor no numérico en ${campo}`);
      return m.valor;
    };
    const montoPAC = monto('montoPAC');
    const montoOC = monto('montoOC');

    // OC
    const ocTextoCrudo = celda(f, 'ocs');
    const { ocs, noAplica } = extraerOCs(ocTextoCrudo);
    if (ocs.length > 1) advFila('OC_VARIAS', `Fila ${filaExcel}: ${ocs.length} OC en la misma celda`);
    if (montoOC > 0 && ocs.length === 0) advFila('OC_MONTO_SIN_NUMERO', `Fila ${filaExcel}: monto OC mayor que 0 sin N° de OC`);
    const progOC = [...new Set(ocs.map(programaDesdeOC).filter(Boolean))];
    if (programa && progOC.some((p) => p !== programa)) {
      advFila('OC_PREFIJO_PROGRAMA', `Fila ${filaExcel}: OC de otra unidad compradora (programa ${progOC.join('/')}) en una fila del programa ${programa}`);
    }

    // Tipo de compra
    const tipoOriginal = esVacio(celda(f, 'tipoCompra')) ? null : String(celda(f, 'tipoCompra')).trim();
    const { tipo, corregido } = normalizarTipoCompra(tipoOriginal);
    if (!tipo) advFila('TIPO_VACIO', `Fila ${filaExcel}: tipo de compra sin definir`);
    if (corregido) advFila('TIPO_CORREGIDO', `Fila ${filaExcel}: tipo de compra corregido ("${tipoOriginal}" → "${tipo}")`);
    const tiposOC = [...new Set(ocs.map(tipoDesdeOC).filter(Boolean))];
    const tipoCompraInferido = tiposOC.length === 1 ? TIPOS[tiposOC[0]] : null;
    const catDecl = categoriaTipo(normTxt(tipo));
    if (catDecl && catDecl !== 'OTRO' && tiposOC.length && !tiposOC.includes(catDecl)) {
      advFila('TIPO_DISTINTO_OC', `Fila ${filaExcel}: tipo declarado "${tipo}" no coincide con el sufijo de la OC (${tiposOC.map((t) => TIPOS[t]).join(', ')})`);
    }

    // Desglose mensual
    const desglose = {};
    for (const m of MESES) desglose[m] = monto(m);
    const sumaMeses = MESES.reduce((s, m) => s + desglose[m], 0);
    const totalCrudo = celda(f, 'totalDesglose');
    const totalInformado = !esVacio(totalCrudo);
    const totalDesglose = totalInformado ? parseMonto(totalCrudo).valor : sumaMeses;
    if (totalInformado && Math.abs(totalDesglose - sumaMeses) > 1) {
      advFila('DESGLOSE_NO_CUADRA', `Fila ${filaExcel}: la suma de los meses no cuadra con el total informado`);
    }
    if (sumaMeses === 0 && montoPAC > 0) advFila('DESGLOSE_VACIO', `Fila ${filaExcel}: desglose mensual vacío con PAC mayor que 0`);

    // Estado declarado (columna Q) e inferido
    const q = usarEstado ? normTxt(celda(f, 'estadoUnidad')) : '';
    const estadoUnidad = ESTADOS_UNIDAD.includes(q) ? q : null;
    const obsUnidad = esVacio(celda(f, 'obsUnidad')) ? null : String(celda(f, 'obsUnidad')).trim();

    const avCrudo = celda(f, 'avanceOT');
    let avanceOT = typeof avCrudo === 'number' ? avCrudo
      : (parseFloat(String(avCrudo ?? '').replace('%', '').replace(',', '.')) || 0);
    if ((typeof avCrudo === 'string' && avCrudo.includes('%')) || (avanceOT > 1 && avanceOT <= 100)) avanceOT /= 100;

    filas.push({
      id,
      fila: filaExcel,
      nro: nro ? nroNum : null,
      programa,
      subtitulo: sa.subtitulo,
      asignacion: sa.asignacion,
      adminContrato: esVacio(celda(f, 'adminContrato')) ? null : String(celda(f, 'adminContrato')).trim(),
      detalle: detalleTxt,
      proveedor: detalleEsProveedor ? detalleTxt : null,
      temporalidad: esVacio(celda(f, 'temporalidad')) ? null : normTxt(celda(f, 'temporalidad')),
      montoPAC,
      montoOC,
      ocs,
      ocNoAplica: noAplica,
      ocTexto: esVacio(ocTextoCrudo) ? null : String(ocTextoCrudo).trim(),
      tipoCompra: tipo,
      tipoCompraOriginal: tipoOriginal,
      tipoCompraInferido,
      valorOT: monto('valorOT'),
      avanceOT: Math.round(avanceOT * 10000) / 10000,
      valorRecepcion: monto('valorRecepcion'),
      devengadoPlanilla: monto('devengadoPlanilla'),
      pendienteOT: monto('pendienteOT'),
      estadoUnidad,
      desglose,
      totalDesglose,
      obsUnidad,
      estadoInferido: inferirEstado(obsUnidad),
      seguimientos: separarSeguimientos(obsUnidad),
      advertencias: [...new Set(codigos)],
    });
  }

  // Advertencias por archivo
  const conPAC = filas.filter((x) => x.montoPAC > 0);
  if (conPAC.length > 1 && conPAC.every((x) => x.montoOC === x.montoPAC)) {
    adv('OC_IGUAL_PAC_TODAS', `El monto OC es igual al PAC en todas las filas (${conPAC.length}): probablemente copiado`);
  }
  if (op.fileModifiedAt) {
    const mod = new Date(op.fileModifiedAt);
    const hoy = op.hoy ? new Date(op.hoy) : new Date();
    const dias = Math.floor((hoy - mod) / 86400000);
    if (dias > diasFrescura) adv('PLANILLA_DESACTUALIZADA', `Planilla sin modificar hace ${dias} días (más de ${diasFrescura})`, { dias });
  }

  return { unidad, slug, hoja: nombreHoja, filas, advertencias, resumen: resumir(filas, advertencias, mesCorte) };
}

/** Totales y conteos de control de un conjunto de filas normalizadas. */
export function resumir(filas, advertencias = [], mesCorte = 8) {
  const porMes = Object.fromEntries(MESES.map((m) => [m, 0]));
  let pac = 0;
  let oc = 0;
  for (const f of filas) {
    pac += f.montoPAC;
    oc += f.montoOC;
    for (const m of MESES) porMes[m] += f.desglose[m];
  }
  const hastaCorte = MESES.slice(0, mesCorte).reduce((s, m) => s + porMes[m], 0);
  const despues = MESES.slice(mesCorte).reduce((s, m) => s + porMes[m], 0);
  const conteo = {};
  for (const a of advertencias) conteo[a.codigo] = (conteo[a.codigo] || 0) + 1;
  return {
    filas: filas.length,
    montoPAC: pac,
    montoOC: oc,
    desglosePorMes: porMes,
    desgloseHastaCorte: hastaCorte,
    desglosePosterior: despues,
    mesCorte,
    advertenciasPorCodigo: conteo,
  };
}
