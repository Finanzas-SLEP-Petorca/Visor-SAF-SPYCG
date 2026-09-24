// Fixtures SINTÉTICOS: datos inventados que reproducen cada anomalía conocida de las
// planillas reales, sin usar ninguna cifra ni texto real. Se generan en memoria.
import * as XLSX from '@e965/xlsx';

const MESES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO',
  'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];

export const ENCABEZADOS_UNIDAD = [
  'N°', 'PROGRAMA', 'SUBTÍTULO', 'ASIG PPTO', 'ADMINISTRADOR CONTRATO', 'DETALLE COMPRA',
  'TEMPORALIDAD DE FACTURACIÓN', 'MONTO $ INICIAL PAC', 'MONTO $ INICIAL ORDEN DE COMPRA',
  'N° ORDEN DE COMPRA', 'TIPO DE COMPRA', 'VALOR $ ORDENES DE TRABAJOS', '% AVANCE ORDENES DE TRABAJOS',
  'VALOR $ RECEPCIÓN CONFORME', 'VALOR $ FACTURADO = DEVENGADO', 'VALOR $ PENDIENTE DE ORDEN DE TRABAJO',
  null, ...MESES, 'MONTO EJECUTADO DEVENGO', 'DIFERENCIA EJECUTADO VS MONTO INICIAL OC',
  'DIFERENCIA EJECUTADO VS MONTO PAC (HOLGURA PPTO)', 'OBSERVACIONES',
];

/** Fila de datos con valores por defecto. `meses` = arreglo de 12 números. */
export function fila(p) {
  const meses = p.meses || new Array(12).fill(0);
  const total = 'total' in p ? p.total : meses.reduce((a, b) => a + b, 0);
  return [
    p.nro, p.programa ?? '02', p.c ?? 22, p.d ?? 2204001, p.admin ?? 'Persona Ficticia', p.detalle ?? 'Compra de prueba',
    p.temporalidad ?? 'ÚNICO', p.pac ?? 1000000, p.montoOC ?? 0, p.oc ?? null, 'tipo' in p ? p.tipo : 'COMPRA ÁGIL',
    p.valorOT ?? 0, p.avance ?? 0, p.recepcion ?? 0, p.devengado ?? 0, p.pendiente ?? 0,
    p.estado ?? null, ...meses, total, 0, 0, p.obs ?? null,
  ];
}

/** Libro con la estructura de una planilla de unidad (hoja de datos + LISTA). */
export function libroUnidad(unidad, filas, { encabezados = ENCABEZADOS_UNIDAD, extraCol = false } = {}) {
  const enc = extraCol ? [...encabezados, null] : encabezados;
  const aoa = [
    ['ESTATUS DEVENGOS COMPRAS ' + unidad],
    [null, null, null, null, null, null, null, null, null, null, null, 'CICLO GESTIÓN DE CONTRATO', null, null, null, null, null, 'DESGLOSE DE PAGOS TEMPORAL'],
    [null, null, null, null, null, null, null, 99999999, 99999999],
    enc,
    ...filas.map((f) => (extraCol ? [...f, null] : f)),
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), `COMPRAS ${unidad}`);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['PROYECTADO', null, 'COMPRA ÁGIL'], ['EN PROCESO'], ['FINALIZADO']]), 'LISTA');
  return roundtrip(wb);
}

/** Escribe y relee el libro, como si viniera de un archivo real. */
export function roundtrip(wb) {
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  return XLSX.read(buf, { type: 'buffer' });
}

export const ENCABEZADOS_SEP = ['N°', 'Subt.', 'Ítem', 'Monto presupuestado', 'Modalidad de compra',
  'ID Mercado Público', 'Estado proceso de compra', 'Documento que formaliza', 'N° OC', 'Monto adjudicado',
  'Estado ejecución', 'Verificadores de ejecución', 'Monto devengado', 'Monto pagado', 'Saldo', 'Por pagar',
  '% ejecución', 'Etapa actual', 'Observaciones'];

export function libroSEP(items, { refEnEtapa = [] } = {}) {
  const aoa = [['Seguimiento Gastos SEP'], [], [], ENCABEZADOS_SEP];
  items.forEach((it, i) => aoa.push([
    i + 1, it.subt ?? '22', it.item, it.monto ?? 0, it.modalidad ?? null, it.idmp ?? null, it.estadoCompra ?? 'Sin iniciar',
    null, it.oc ?? null, it.adjudicado ?? 0, it.estadoEjecucion ?? 'Sin iniciar', null, it.devengado ?? 0, it.pagado ?? 0,
    0, 0, 0, 'Identificación', it.obs ?? null,
  ]));
  aoa.push(['TOTAL', null, null, items.reduce((s, x) => s + (x.monto || 0), 0)]);
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  for (const i of refEnEtapa) ws[XLSX.utils.encode_cell({ r: 4 + i, c: 17 })] = { t: 'e', v: 0x17, w: '#REF!' };
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Resumen']]), 'Resumen');
  XLSX.utils.book_append_sheet(wb, ws, 'Seguimiento SEP');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Sin iniciar']]), 'Listas');
  return roundtrip(wb);
}
