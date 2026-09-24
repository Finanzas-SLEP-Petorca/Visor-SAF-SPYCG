import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizarPlanilla, unidadDesdeArchivo, resolverSubtituloAsignacion, extraerOCs,
  normalizarTipoCompra, inferirEstado, separarSeguimientos, normalizarPrograma,
} from '../src/normalizer.js';
import { normalizarSEP, detectarVinculos } from '../src/normalizer-sep.js';
import { libroUnidad, fila, libroSEP, ENCABEZADOS_UNIDAD } from './fixtures/generar.mjs';

const M = (vals) => { const a = new Array(12).fill(0); Object.entries(vals).forEach(([i, v]) => { a[i] = v; }); return a; };
const cuenta = (r, codigo) => r.advertencias.filter((a) => a.codigo === codigo).length;

test('unidad y slug desde el nombre del archivo', () => {
  assert.equal(unidadDesdeArchivo('ESTATUS DEVENGOS COMPRAS UNIDAD UNO 2026.xlsx'), 'UNIDAD UNO');
  assert.equal(unidadDesdeArchivo('C:\\x\\ESTATUS DEVENGOS COMPRAS UNIDAD DOS 2026.xlsx'), 'UNIDAD DOS');
  assert.equal(unidadDesdeArchivo('ESTATUS DEVENGOS COMPRAS NUEVA UNIDAD 2026.xlsx'), 'NUEVA UNIDAD');
  assert.equal(unidadDesdeArchivo('otra cosa.xlsx'), null);
  const r = normalizarPlanilla(libroUnidad('UNIDAD UNO', [fila({ nro: 12 })]), 'ESTATUS DEVENGOS COMPRAS UNIDAD UNO 2026.xlsx');
  assert.equal(r.slug, 'UNIDAD-UNO');
  assert.equal(r.filas[0].id, 'UNIDAD-UNO-012');
});

test('regla 1: subtítulo/asignación invertidos, deducidos y normales', () => {
  assert.deepEqual(resolverSubtituloAsignacion(22, 2204001), { subtitulo: '22', asignacion: '2204001', ajuste: null });
  assert.deepEqual(resolverSubtituloAsignacion(2208007, 22), { subtitulo: '22', asignacion: '2208007', ajuste: 'invertido' });
  assert.deepEqual(resolverSubtituloAsignacion(null, '29 06 001'), { subtitulo: '29', asignacion: '2906001', ajuste: 'deducido' });
  assert.deepEqual(resolverSubtituloAsignacion(31, null), { subtitulo: '31', asignacion: null, ajuste: null });
  assert.deepEqual(resolverSubtituloAsignacion(null, '22'), { subtitulo: '22', asignacion: null, ajuste: null });
  const r = normalizarPlanilla(libroUnidad('UNIDAD UNO', [
    fila({ nro: 1, c: 2204001, d: 22 }), fila({ nro: 2, c: 2906001, d: 29 }), fila({ nro: 3, c: 22, d: '-' }),
    fila({ nro: 4, c: null, d: '22' }),
  ]), 'ESTATUS DEVENGOS COMPRAS UNIDAD UNO 2026.xlsx');
  assert.ok(r.filas.every((f) => /^\d{2}$/.test(f.subtitulo)));
  assert.equal(cuenta(r, 'SUBT_INVERTIDO'), 2);
  assert.equal(cuenta(r, 'ASIG_VACIA'), 2);
  assert.equal(r.filas[3].subtitulo, '22');
  assert.equal(r.filas[3].asignacion, null);
});

test('regla 2: programa como texto de 2 dígitos', () => {
  assert.equal(normalizarPrograma(1), '01');
  assert.equal(normalizarPrograma('02'), '02');
  assert.equal(normalizarPrograma(' 2 '), '02');
  assert.equal(normalizarPrograma('-'), null);
});

test('regla 3: tipo de compra corregido, vacío e inferido desde la OC', () => {
  assert.deepEqual(normalizarTipoCompra('comra ágil'), { tipo: 'COMPRA ÁGIL', corregido: true });
  assert.deepEqual(normalizarTipoCompra('COMPRA  AGIL'), { tipo: 'COMPRA ÁGIL', corregido: false });
  assert.deepEqual(normalizarTipoCompra('-'), { tipo: null, corregido: false });
  const r = normalizarPlanilla(libroUnidad('TRES', [
    fila({ nro: 1, tipo: 'COMRA ÁGIL' }),
    fila({ nro: 2, tipo: '-', oc: '1506668-10-AG26' }),
    fila({ nro: 3, tipo: 'CONVENIO MARCO', oc: '1506668-11-SE26' }),
    fila({ nro: 4, tipo: null }),
  ]), 'ESTATUS DEVENGOS COMPRAS TRES 2026.xlsx');
  assert.equal(r.filas[0].tipoCompra, 'COMPRA ÁGIL');
  assert.equal(r.filas[1].tipoCompra, null);
  assert.equal(r.filas[1].tipoCompraInferido, 'COMPRA ÁGIL');
  assert.equal(cuenta(r, 'TIPO_CORREGIDO'), 1);
  assert.equal(cuenta(r, 'TIPO_VACIO'), 2);
  assert.equal(cuenta(r, 'TIPO_DISTINTO_OC'), 1);
});

test('regla 4: varias OC, separadores, NO APLICA y prefijo de otro programa', () => {
  assert.deepEqual(extraerOCs('1375756-5-SE26 // 1375756-6-CM26 - 1375756-7-AG26').ocs,
    ['1375756-5-SE26', '1375756-6-CM26', '1375756-7-AG26']);
  assert.deepEqual(extraerOCs('NO APLICA'), { ocs: [], cotizaciones: [], repetidas: [], noAplica: true });
  assert.deepEqual(extraerOCs('1506668-7-COT26'), { ocs: [], cotizaciones: ['1506668-7-COT26'], repetidas: [], noAplica: false });
  assert.deepEqual(extraerOCs('1375756-8-SE26 // 1375756-8-SE26').repetidas, ['1375756-8-SE26']);
  assert.deepEqual(extraerOCs('1506668-3-L126').ocs, ['1506668-3-L126']);
  const r = normalizarPlanilla(libroUnidad('CUATRO', [
    fila({ nro: 1, programa: '02', oc: '1506668-901-SE26 1506668-902-SE26', montoOC: 5, tipo: 'LICITACIÓN' }),
    fila({ nro: 2, programa: '02', oc: '1375756-9-CM26', montoOC: 5, tipo: 'CONVENIO MARCO' }),
    fila({ nro: 3, programa: '02', oc: null, montoOC: 7 }),
    fila({ nro: 4, programa: '02', oc: 'NO APLICA', montoOC: 9 }), // consumo sin OC: no es "monto OC sin N°"
    fila({ nro: 5, programa: '02', oc: '1506668-40-COT26', montoOC: 3 }), // cotización de compra ágil
    fila({ nro: 6, programa: '02', oc: '1506668-41-SE26 - 1506668-41-SE26', montoOC: 3, tipo: 'LICITACIÓN' }),
  ]), 'ESTATUS DEVENGOS COMPRAS CUATRO 2026.xlsx');
  assert.equal(cuenta(r, 'OC_VARIAS'), 1);
  assert.equal(cuenta(r, 'OC_PREFIJO_PROGRAMA'), 1);
  assert.equal(cuenta(r, 'OC_MONTO_SIN_NUMERO'), 1);
  assert.equal(r.filas[3].ocNoAplica, true);
  assert.equal(cuenta(r, 'COTIZACION_SIN_OC'), 1);
  assert.equal(r.filas[4].idMercadoPublico, '1506668-40-COT26');
  assert.deepEqual(r.filas[4].ocs, []);
  assert.equal(cuenta(r, 'OC_REPETIDA'), 1);
  assert.deepEqual(r.filas[5].ocs, ['1506668-41-SE26']);
});

test('regla 5: montos con formato de texto y guiones', () => {
  const r = normalizarPlanilla(libroUnidad('CINCO', [
    fila({ nro: 1, pac: '$1.234.567', montoOC: '-' }),
    fila({ nro: 2, pac: 1000.6 }),
  ]), 'ESTATUS DEVENGOS COMPRAS CINCO 2026.xlsx');
  assert.equal(r.filas[0].montoPAC, 1234567);
  assert.equal(r.filas[0].montoOC, 0);
  assert.equal(r.filas[1].montoPAC, 1001);
});

test('regla 6: desglose que no cuadra, desglose vacío y totales por mes', () => {
  const r = normalizarPlanilla(libroUnidad('CINCO', [
    fila({ nro: 4, detalle: 'Ficticia', meses: M({ 0: 2000, 1: 3000 }), total: 5900 }),
    fila({ nro: 10, meses: M({ 7: 100, 8: 200, 9: 300 }) }),
    fila({ nro: 11, pac: 500 }),
  ]), 'ESTATUS DEVENGOS COMPRAS CINCO 2026.xlsx', { mesCorte: 8 });
  assert.equal(cuenta(r, 'DESGLOSE_NO_CUADRA'), 1);
  assert.equal(r.advertencias.find((a) => a.codigo === 'DESGLOSE_NO_CUADRA').fila, 5);
  assert.equal(cuenta(r, 'DESGLOSE_VACIO'), 1);
  assert.equal(r.resumen.desgloseHastaCorte, 2000 + 3000 + 100);
  assert.equal(r.resumen.desglosePosterior, 200 + 300);
  assert.equal(r.resumen.desglosePorMes.OCT, 300);
});

test('reglas 7-9: estado Q, estado inferido y seguimientos fechados', () => {
  assert.equal(inferirEstado('Se libera el saldo'), 'DESISTIDA');
  assert.equal(inferirEstado('Queda para el próximo año'), 'DESISTIDA');
  assert.equal(inferirEstado('Licitación desierta, se republica'), 'DESIERTA');
  assert.equal(inferirEstado('En evaluación de ofertas'), 'EN EVALUACIÓN');
  assert.equal(inferirEstado('Elaborando bases técnicas'), 'ELABORACIÓN DE BASES');
  assert.equal(inferirEstado(null), null);
  const seg = separarSeguimientos('Contrato anual. 02/09 se envían bases 15/09: publicada');
  assert.deepEqual(seg, [
    { fecha: null, texto: 'Contrato anual.' },
    { fecha: '02/09', texto: 'se envían bases' },
    { fecha: '15/09', texto: 'publicada' },
  ]);
  const r = normalizarPlanilla(libroUnidad('TRES', [
    fila({ nro: 1, estado: 'EN PROCESO', obs: '02/09 adjudicada' }), fila({ nro: 2, estado: 'otra cosa' }),
  ]), 'ESTATUS DEVENGOS COMPRAS TRES 2026.xlsx');
  assert.equal(r.filas[0].estadoUnidad, 'EN PROCESO');
  assert.equal(r.filas[0].estadoInferido, 'ADJUDICADA');
  assert.equal(r.filas[1].estadoUnidad, null);
});

test('regla 11: encabezado PROVEEDOR, OC igual al PAC en todo el archivo y frescura', () => {
  const enc = [...ENCABEZADOS_UNIDAD];
  enc[5] = 'PROVEEDOR';
  const r = normalizarPlanilla(libroUnidad('SEIS', [
    fila({ nro: 1, detalle: 'Proveedor Ficticio SpA', pac: 100, montoOC: 100 }),
    fila({ nro: 2, pac: 200, montoOC: 200 }),
  ], { encabezados: enc }), 'ESTATUS DEVENGOS COMPRAS SEIS 2026.xlsx',
  { fileModifiedAt: '2026-07-01T12:00:00Z', hoy: '2026-09-24T12:00:00Z', diasFrescura: 15 });
  assert.equal(r.filas[0].detalle, 'Proveedor Ficticio SpA');
  assert.equal(r.filas[0].proveedor, 'Proveedor Ficticio SpA');
  assert.equal(cuenta(r, 'ENCABEZADO_DISTINTO'), 1);
  assert.equal(cuenta(r, 'OC_IGUAL_PAC_TODAS'), 1);
  assert.equal(cuenta(r, 'PLANILLA_DESACTUALIZADA'), 1);
  const fresca = normalizarPlanilla(libroUnidad('TRES', [fila({ nro: 1 })]), 'ESTATUS DEVENGOS COMPRAS TRES 2026.xlsx',
    { fileModifiedAt: '2026-09-20T12:00:00Z', hoy: '2026-09-24T12:00:00Z' });
  assert.equal(cuenta(fresca, 'PLANILLA_DESACTUALIZADA'), 0);
});

test('filas vacías, fila de totales, columna AH extra y N° duplicado', () => {
  const vacia = new Array(33).fill(null);
  const r = normalizarPlanilla(libroUnidad('CINCO', [
    fila({ nro: 1 }), vacia, fila({ nro: 1, detalle: 'Otra' }), [null, null, null, null, null, 'TOTAL', null, 999],
  ], { extraCol: true }), 'ESTATUS DEVENGOS COMPRAS CINCO 2026.xlsx');
  assert.equal(r.filas.length, 2);
  assert.equal(cuenta(r, 'NRO_DUPLICADO'), 1);
  assert.notEqual(r.filas[0].id, r.filas[1].id);
});

test('SEP: ítems, sumas, etapa recalculada ignorando #REF! y vínculo por OC', () => {
  const libro = libroSEP([
    { item: 'Ítem A', monto: 1000, estadoCompra: 'Adjudicada', adjudicado: 800, oc: '1506668-901-SE26' },
    { item: 'Ítem B', monto: 500, estadoCompra: 'Publicada' },
    { item: 'Ítem C', monto: 300, estadoCompra: 'Adjudicada' },
  ], { refEnEtapa: [0, 1] });
  const s = normalizarSEP(libro, 'SEGUIMIENTO GASTOS SEP 2026.xlsx');
  assert.equal(s.items.length, 3);
  assert.equal(s.resumen.montoPresupuestado, 1800);
  assert.equal(s.resumen.montoAdjudicado, 800);
  assert.equal(s.resumen.etapaREF, 2);
  assert.deepEqual(s.items.map((i) => i.etapa), [2, 1, 2]);
  assert.ok(s.advertencias.some((a) => a.codigo === 'SEP_ADJUDICADA_SIN_MONTO'));
  const infra = normalizarPlanilla(libroUnidad('UNIDAD DOS', [fila({ nro: 3, oc: '1506668-901-SE26', montoOC: 10, tipo: 'LICITACIÓN' })]),
    'ESTATUS DEVENGOS COMPRAS UNIDAD DOS 2026.xlsx');
  const v = detectarVinculos(s.items, { 'UNIDAD-DOS': infra });
  assert.deepEqual(v, [{ oc: '1506668-901-SE26', sepId: 'SEP-001', compraId: 'UNIDAD-DOS-003', unidad: 'UNIDAD DOS' }]);
});
