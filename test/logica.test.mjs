import { test } from 'node:test';
import assert from 'node:assert/strict';
import { restarHabiles, contarHabiles, esHabil, lunesDe } from '../src/logica/habiles.js';
import {
  unificar, calcularTodo, generarAlertas, agregar, accionesPorSubdireccion, calcularFrescura, estadoPAC, repartirPorFuente,
} from '../src/logica/motor.js';
import { PARAMETROS_DEFECTO, mezclarParametros } from '../src/parametros-default.js';
import { conciliar, entradasHistorial } from '../src/conciliacion.js';
import { MESES } from '../src/util.js';
import { fecha } from '../src/formato.js';

const P = mezclarParametros({ valorUTM: 70000 });
const FER = new Set(P.feriados);
const HOY = '2026-09-24';

test('días hábiles: fechas límite referenciales desde el corte 15-12-2026', () => {
  assert.equal(esHabil('2026-10-12', FER), false);
  assert.equal(esHabil('2026-10-13', FER), true);
  assert.equal(esHabil('2026-10-17', FER), false);
  // duración + entrega + recepción/devengo
  assert.equal(restarHabiles('2026-12-15', 10 + 15 + 5, FER), '2026-11-02'); // compra ágil
  assert.equal(restarHabiles('2026-12-15', 7 + 15 + 5, FER), '2026-11-05'); // convenio marco
  assert.equal(restarHabiles('2026-12-15', 20 + 15 + 5, FER), '2026-10-19'); // trato directo / licitación < 100 UTM
  assert.equal(restarHabiles('2026-12-15', 30 + 15 + 5, FER), '2026-10-02'); // licitación 100–1.000 UTM
  assert.equal(contarHabiles('2026-09-24', '2026-10-02', FER), 6);
  assert.equal(contarHabiles('2026-10-02', '2026-09-24', FER), -6);
  assert.equal(contarHabiles(HOY, HOY, FER), 0);
  assert.equal(lunesDe('2026-10-04'), '2026-09-28');
});

test('parámetros: mezcla profunda sobre los valores por defecto', () => {
  const p = mezclarParametros({ duraciones: { compraAgil: { dias: 12 } }, valorUTM: 1 });
  assert.equal(p.duraciones.compraAgil.dias, 12);
  assert.equal(p.duraciones.compraAgil.entrega, 15);
  assert.equal(p.duraciones.licitacionLR.dias, 60);
  assert.equal(PARAMETROS_DEFECTO.duraciones.compraAgil.dias, 10);
  const malo = mezclarParametros({ mesCorte: '<img src=x>', fechaCorteDevengo: '<b>', valorUTM: 'x', hitos: [{ fecha: '<i>', nombre: 'x' }] });
  assert.equal(malo.mesCorte, 8);
  assert.equal(malo.fechaCorteDevengo, '2026-12-15');
  assert.equal(malo.valorUTM, null);
  assert.equal(malo.hitos.length, 0);
});

test('formato: fechas escapadas', () => {
  assert.equal(fecha('2026-10-09'), '09-10-2026');
  assert.ok(!fecha('<img src=x onerror=1>').includes('<'));
});

// ---------------------------------------------------------------- fixtures de compras sintéticas
const meses = (vals = {}) => Object.fromEntries(MESES.map((m) => [m, vals[m] || 0]));
function base(filas, extra = {}) {
  return { unidad: 'UNIDAD X', filas: Object.fromEntries(filas.map((f) => [f.id, {
    programa: '02', subtitulo: '22', asignacion: '2204001', detalle: 'Compra ficticia', tipoCompra: 'LICITACIÓN',
    montoPAC: 0, montoOC: 0, ocs: [], desglose: meses(), obsUnidad: null, estadoInferido: null, estadoUnidad: null,
    devengadoPlanilla: 0, valorRecepcion: 0, advertencias: [], ...f,
  }])), ...extra };
}
const calc = (bases, gestion = {}, p = P, ctx = { hoy: HOY }) => calcularTodo(unificar(bases, gestion, p), p, ctx);
const porId = (arr) => Object.fromEntries(arr.map((c) => [c.id, c]));

test('etapas: precedencia Compras → Subdirección → datos → observaciones', () => {
  const b = { X: base([
    { id: 'X-001', montoPAC: 1000, desglose: meses({ ENE: 500, FEB: 500 }) }, // devengo 100% → 4
    { id: 'X-002', montoPAC: 1000, desglose: meses({ ENE: 100, OCT: 900 }) }, // devengo parcial → 3
    { id: 'X-003', montoPAC: 1000, ocs: ['1506668-901-SE26'], montoOC: 1000 }, // OC sin devengo → 2
    { id: 'X-004', montoPAC: 1000, estadoInferido: 'DESISTIDA' },
    { id: 'X-005', montoPAC: 1000, estadoInferido: 'PUBLICADA' },
    { id: 'X-006', montoPAC: 1000 },
    { id: 'X-007', montoPAC: 1000, estadoInferido: 'PUBLICADA' },
    { id: 'X-008', montoPAC: 1000, ocs: ['1506668-2-SE26'], montoOC: 1000, desglose: meses({ MAR: 300 }) },
  ]) };
  const g = {
    'X-006': { direccion_estadoGeneral: 'EN PROCESO' },
    'X-007': { compras_estadoProceso: 'Desistida' },
    'X-008': { compras_estadoProceso: 'Adjudicada' },
  };
  const r = porId(calc(b, g));
  assert.equal(r['X-001'].et.etapa, 4);
  assert.equal(r['X-002'].et.etapa, 3);
  assert.equal(r['X-003'].et.etapa, 2);
  assert.equal(r['X-003'].et.marca, 'deducido');
  assert.equal(r['X-004'].et.etapa, 'X');
  assert.equal(r['X-004'].et.marca, 'inferido');
  assert.equal(r['X-005'].et.etapa, 1);
  assert.equal(r['X-006'].et.etapa, 1);
  assert.equal(r['X-006'].et.marca, 'confirmado');
  assert.equal(r['X-007'].et.etapa, 'X');
  assert.equal(r['X-008'].et.etapa, 3); // Compras dice adjudicada, los datos muestran devengo
  assert.equal(estadoPAC(4), 'Ejecutado');
  assert.equal(estadoPAC(2), 'En curso');
  assert.equal(estadoPAC(0), 'Pendiente');
  assert.equal(estadoPAC('X'), 'Desistido');
});

test('ventanas, semáforo y etiqueta "No alcanza 2026"', () => {
  const b = { X: base([
    { id: 'X-001', montoPAC: 70000 * 2000, tipoCompra: 'LICITACIÓN' }, // 2.000 UTM → 45+20+5 días: vencida
    { id: 'X-002', montoPAC: 70000 * 10, tipoCompra: 'COMPRA ÁGIL' }, // 02-11: 27 días de margen, verde salvo fuente
    { id: 'X-003', montoPAC: 70000 * 10, tipoCompra: 'COMPRA ÁGIL' },
    { id: 'X-004', montoPAC: 70000 * 500, tipoCompra: 'LICITACIÓN' }, // 02-10: margen 6 → amarillo
    { id: 'X-005', montoPAC: 1000, estadoInferido: 'DESIERTA' },
    { id: 'X-006', montoPAC: 1000, asignacion: null, estadoInferido: 'PUBLICADA', tipoCompra: 'COMPRA ÁGIL' },
  ]) };
  const g = {
    'X-002': { direccion_fuentes: [{ fuente: 'Aporte Fiscal', monto: 1 }] },
    'X-003': { direccion_fuentes: [{ fuente: 'SEP', monto: 1 }], direccion_fechaEstimadaRequerimiento: '2026-11-20' },
    'X-005': { compras_estadoProceso: 'Desierta', compras_nLlamado: 2 },
  };
  const r = porId(calc(b, g));
  assert.equal(r['X-001'].v.modalidad, 'licitacionLP');
  assert.ok(r['X-001'].v.margen < 0);
  assert.equal(r['X-001'].s.color, 'rojo');
  assert.equal(r['X-001'].s.etiqueta, 'No alcanza 2026 → evaluar liberar o reasignar');
  assert.equal(r['X-002'].v.fechaLimite, '2026-11-02');
  assert.equal(r['X-002'].s.color, 'verde');
  assert.equal(r['X-003'].s.color, 'rojo');
  assert.ok(r['X-003'].s.motivos.some((m) => m.codigo === 'REQ_FUERA_VENTANA'));
  assert.equal(r['X-004'].v.fechaLimite, '2026-10-02');
  assert.equal(r['X-004'].s.color, 'amarillo');
  assert.ok(r['X-005'].s.motivos.some((m) => m.codigo === 'DESIERTA_2'));
  assert.ok(r['X-006'].s.motivos.some((m) => m.codigo === 'SIN_ASIGNACION'));
  // Sin UTM se asume un tramo y queda registrado como supuesto
  const sinUTM = porId(calc(b, g, mezclarParametros({})));
  assert.ok(sinUTM['X-001'].v.supuestos.some((s) => s.includes('Sin valor UTM')));
});

test('proyección en tres escenarios y condicionado', () => {
  const b = { X: base([
    { id: 'X-001', montoPAC: 1200, desglose: meses({ ENE: 100, SEP: 100, OCT: 100 }), ocs: ['1506668-901-SE26'], montoOC: 1200 },
    { id: 'X-002', montoPAC: 1000, desglose: meses({ OCT: 600, NOV: 400 }), tipoCompra: 'COMPRA ÁGIL' }, // etapa 0 en ventana
    { id: 'X-003', montoPAC: 1000, desglose: meses({ OCT: 1000 }), estadoInferido: 'DESISTIDA' },
    { id: 'X-004', montoPAC: 1000, desglose: meses({ DIC: 1000 }), tipoCompra: 'COMPRA ÁGIL' },
  ]) };
  const g = {
    'X-001': { finanzas_devengadoSigfe: 150 },
    'X-004': { compras_estadoProceso: 'Publicada', presupuesto_definicionPendiente: 'PRORRETENCIÓN' },
  };
  const r = porId(calc(b, g));
  assert.equal(r['X-001'].m.fuenteReal, 'sigfe');
  assert.deepEqual([r['X-001'].pr.conservador, r['X-001'].pr.probable, r['X-001'].pr.planificado], [350, 350, 350]);
  assert.deepEqual([r['X-002'].pr.conservador, r['X-002'].pr.probable, r['X-002'].pr.planificado], [0, 200, 1000]);
  assert.deepEqual([r['X-003'].pr.conservador, r['X-003'].pr.probable, r['X-003'].pr.planificado], [0, 0, 0]);
  assert.equal(r['X-004'].pr.probable, 700);
  assert.equal(r['X-004'].pr.condicionado, true);
  assert.equal(r['X-002'].pr.porMes.probable.OCT, 120);
});

test('SEP es solo seguimiento: no suma en los totales; el vínculo por OC se detecta y se puede descartar', () => {
  const bases = {
    DOS: base([{ id: 'DOS-001', montoPAC: 5000, ocs: ['1506668-901-SE26'], montoOC: 5000 }], { unidad: 'UNIDAD DOS' }),
    SEP: { unidad: 'SEP', filas: {
      'SEP-001': { id: 'SEP-001', item: 'Ítem ficticio', montoPresupuestado: 900, montoAdjudicado: 0, ocs: ['1506668-901-SE26'], etapa: 2, estadoCompra: 'Adjudicada', montoDevengado: 0 },
      'SEP-002': { id: 'SEP-002', item: 'Otro', montoPresupuestado: 100, montoAdjudicado: 0, ocs: [], etapa: 0, montoDevengado: 0 },
    } },
  };
  const r = calc(bases);
  const tot = agregar(r, () => 'Servicio');
  assert.equal(tot[0].pac, 5000);
  assert.equal(porId(r)['SEP-001'].vinculo.compraId, 'DOS-001');
  const p2 = mezclarParametros({ valorUTM: 70000, vinculosDescartados: [{ sepId: 'SEP-001', compraId: 'DOS-001' }] });
  const r2 = calc(bases, {}, p2);
  assert.equal(agregar(r2, () => 'S')[0].pac, 5000);
  assert.equal(porId(r2)['SEP-001'].vinculo, null);
});

test('reparto por fuente, alertas agrupadas y acciones por Subdirección', () => {
  const b = { X: base([
    { id: 'X-001', montoPAC: 1000, desglose: meses({ NOV: 500, DIC: 400, OCT: 100 }) },
    { id: 'X-002', montoPAC: 1000 },
  ]), };
  const g = { 'X-001': { direccion_fuentes: [{ fuente: 'SEP', monto: 750 }, { fuente: 'PIE', monto: 250 }] } };
  const r = calc(b, g);
  assert.deepEqual(repartirPorFuente(r[0], 100), { SEP: 75, PIE: 25 });
  const f = Object.fromEntries(agregar(r, 'fuente').map((x) => [x.clave, x.pac]));
  assert.deepEqual(f, { SEP: 750, PIE: 250, 'Sin clasificar': 1000 });
  const fr = calcularFrescura({ X: { unidad: 'UNIDAD X', fileModifiedAt: '2026-07-10T10:00:00Z' } }, HOY);
  assert.equal(fr.X.dias, 76);
  const al = generarAlertas(r, P, { frescura: fr });
  assert.ok(al.some((a) => a.codigo === 'CONCENTRACION_NOV_DIC' && a.compraId === 'X-001'));
  assert.equal(al.filter((a) => a.codigo === 'SIN_FUENTE').length, 1);
  assert.ok(al.some((a) => a.codigo === 'PLANILLA_DESACTUALIZADA'));
  const acc = accionesPorSubdireccion(al, mezclarParametros({ mapaSubdireccion: { 'UNIDAD X': 'SAF' } }));
  assert.ok(acc.SAF['UNIDAD X'].length > 0);
});

test('conciliación: nuevos, desaparecidos, detalle muy distinto y cambios', () => {
  const prev = {
    'T-001': { id: 'T-001', detalle: 'Arriendo de impresoras', montoPAC: 100 },
    'T-002': { id: 'T-002', detalle: 'Licencias de software', montoPAC: 50 },
    'T-003': { id: 'T-003', detalle: 'Mantención', montoPAC: 1 },
  };
  const nuevas = [
    { id: 'T-001', detalle: 'Arriendo de impresoras', montoPAC: 120 },
    { id: 'T-002', detalle: 'Servicio de aseo y jardinería', montoPAC: 50 },
    { id: 'T-004', detalle: 'Nueva', montoPAC: 1 },
  ];
  const c = conciliar(prev, nuevas);
  assert.deepEqual(c.nuevos, ['T-004']);
  assert.deepEqual(c.desaparecidos, ['T-003']);
  assert.equal(c.detalleCambiado.length, 1);
  assert.equal(c.detalleCambiado[0].id, 'T-002');
  assert.equal(c.modificados.length, 2);
  const h = entradasHistorial('T', c);
  assert.ok(h.some((e) => e.compraId === 'T-001' && e.campo === 'montoPAC' && e.antes === 100 && e.despues === 120));
  assert.equal(entradasHistorial('T', conciliar({}, nuevas)).length, 1);
});
