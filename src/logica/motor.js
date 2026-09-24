// Motor de negocio (sección 7): unifica compras, etapa, ventana, semáforo, proyección,
// alertas y acciones. Puro: sin DOM ni Firebase.

import { MESES, normTxt, suma } from '../util.js';
import { categoriaTipo } from '../normalizer.js';
import { MODALIDADES } from '../parametros-default.js';
import { restarHabiles, contarHabiles, finDeMes, lunesDe, hoyISO } from './habiles.js';

export const ETAPAS = {
  0: 'Planificada',
  1: 'En proceso de compra',
  2: 'Adjudicada / formalizada',
  3: 'En ejecución',
  4: 'Ejecutada / cerrada',
  X: 'Desistida / liberada',
};

const DE_COMPRAS = {
  'Sin iniciar': 0, 'Elaboración de bases': 1, Publicada: 1, 'En evaluación': 1,
  Desierta: 1, Revocada: 1, Adjudicada: 2, Desistida: 'X',
};
const DE_INFERIDO = {
  DESISTIDA: 'X', DESIERTA: 1, ADJUDICADA: 2, 'EN EVALUACIÓN': 1, PUBLICADA: 1, 'ELABORACIÓN DE BASES': 1, EJECUTADA: 4,
};

// ------------------------------------------------------------------ unificación

/**
 * Convierte las bases (por slug) y la gestión (por compraId) en una lista única de compras.
 * @param {Record<string, object>} bases  documentos visor_base
 * @param {Record<string, object>} gestion documentos visor_gestion
 * @param {object} p parámetros
 */
export function unificar(bases, gestion = {}, p) {
  const out = [];
  const vinculos = calcularVinculos(bases, p);
  const sepVinculado = new Map(vinculos.filter((v) => v.estado !== 'descartado').map((v) => [v.sepId, v]));
  const unidadVinculada = new Map();
  for (const v of vinculos) if (v.estado !== 'descartado') unidadVinculada.set(v.compraId, v);
  for (const [slug, b] of Object.entries(bases)) {
    if (slug === 'SEP') {
      for (const it of Object.values(b.filas || {})) {
        const v = sepVinculado.get(it.id);
        out.push({
          id: it.id, origen: 'SEP', unidad: 'SEP', slug, programa: '02', subtitulo: it.subtitulo, asignacion: null,
          detalle: it.item, tipoTexto: it.modalidad, pac: it.montoPresupuestado, montoOC: it.montoAdjudicado,
          ocs: it.ocs || [], desglose: null, obsUnidad: it.observaciones, estadoInferido: null, estadoUnidad: null,
          // SEP es solo seguimiento: sus compras se abren en las planillas de las unidades, por eso nunca suman.
          base: it, g: gestion[it.id] || {}, vinculo: v || null, enTotales: false, advertencias: it.advertencias || [],
        });
      }
      continue;
    }
    for (const f of Object.values(b.filas || {})) {
      out.push({
        id: f.id, origen: 'unidad', unidad: b.unidad, slug, programa: f.programa, subtitulo: f.subtitulo,
        asignacion: f.asignacion, detalle: f.detalle, tipoTexto: f.tipoCompra || f.tipoCompraInferido,
        pac: f.montoPAC, montoOC: f.montoOC, ocs: f.ocs || [], desglose: f.desglose, obsUnidad: f.obsUnidad,
        estadoInferido: f.estadoInferido, estadoUnidad: f.estadoUnidad, base: f, g: gestion[f.id] || {},
        vinculo: unidadVinculada.get(f.id) || null, enTotales: true, advertencias: f.advertencias || [],
      });
    }
  }
  out.sort((a, b) => a.id.localeCompare(b.id, 'es', { numeric: true }));
  return out;
}

/** Vínculos por OC (automáticos) más los confirmados/descartados en parámetros. */
export function calcularVinculos(bases, p) {
  const sep = bases.SEP ? Object.values(bases.SEP.filas || {}) : [];
  const porOC = new Map();
  for (const [slug, b] of Object.entries(bases)) {
    if (slug === 'SEP') continue;
    for (const f of Object.values(b.filas || {})) for (const oc of f.ocs || []) {
      if (!porOC.has(oc)) porOC.set(oc, []);
      porOC.get(oc).push({ compraId: f.id, unidad: b.unidad });
    }
  }
  const descartados = new Set((p?.vinculosDescartados || []).map((v) => `${v.sepId}|${v.compraId}`));
  const out = [];
  const vistos = new Set();
  for (const it of sep) for (const oc of it.ocs || []) for (const d of porOC.get(oc) || []) {
    const k = `${it.id}|${d.compraId}`;
    if (vistos.has(k)) continue;
    vistos.add(k);
    out.push({ oc, sepId: it.id, compraId: d.compraId, unidad: d.unidad, estado: descartados.has(k) ? 'descartado' : 'automatico' });
  }
  for (const v of p?.vinculosConfirmados || []) {
    const k = `${v.sepId}|${v.compraId}`;
    if (!vistos.has(k) && !descartados.has(k)) { vistos.add(k); out.push({ ...v, oc: v.oc || null, estado: 'confirmado' }); }
  }
  return out;
}

// ------------------------------------------------------------------ montos

export function montos(c, p) {
  const mc = p.mesCorte;
  const g = c.g;
  let real;
  let fuenteReal;
  let restante;
  if (c.desglose) {
    const hasta = suma(MESES.slice(0, mc).map((m) => c.desglose[m]));
    restante = suma(MESES.slice(mc).map((m) => c.desglose[m]));
    if (Number.isFinite(g.finanzas_devengadoSigfe)) { real = g.finanzas_devengadoSigfe; fuenteReal = 'sigfe'; }
    else { real = hasta; fuenteReal = 'planilla'; }
  } else {
    // SEP: sin desglose mensual; lo pendiente se proyecta sin mes asignado.
    real = Number.isFinite(g.finanzas_devengadoSigfe) ? g.finanzas_devengadoSigfe : c.base.montoDevengado || 0;
    fuenteReal = Number.isFinite(g.finanzas_devengadoSigfe) ? 'sigfe' : 'planilla';
    restante = Math.max(0, (c.pac || 0) - real);
  }
  const tieneOC = c.ocs.length > 0 || (g.compras_ocs || []).length > 0;
  const adjudicado = Number.isFinite(g.compras_montoAdjudicado) ? g.compras_montoAdjudicado
    : (c.origen === 'SEP' ? c.base.montoAdjudicado || 0 : (tieneOC ? (c.pac > 0 ? Math.min(c.montoOC, c.pac) : c.montoOC) : 0));
  return { pac: c.pac || 0, real, fuenteReal, restante, adjudicado, tieneOC };
}

// ------------------------------------------------------------------ etapa (7.1)

function detalleEstado(txt) {
  const t = normTxt(txt);
  if (!t) return null;
  if (t.includes('DESIERT')) return 'desierta';
  if (t.includes('PUBLICADA')) return 'publicada';
  if (t.includes('EVALUACION')) return 'evaluacion';
  if (t.includes('BASES')) return 'bases';
  if (t.includes('ADJUDIC')) return 'adjudicada';
  if (t.includes('REVOCADA')) return 'revocada';
  return null;
}

export function calcularEtapa(c, m) {
  const g = c.g;
  let datos = null;
  const comprometido = m.adjudicado > 0 ? m.adjudicado : m.pac;
  if (m.real > 0 && comprometido > 0 && m.real >= 0.95 * comprometido) datos = 4;
  else if (m.real > 0) datos = 3;
  else if (m.tieneOC || m.adjudicado > 0) datos = 2;

  const ep = g.compras_estadoProceso;
  if (ep && ep !== 'No aplica' && ep in DE_COMPRAS) {
    const e = DE_COMPRAS[ep];
    if (e === 'X') return { etapa: 'X', marca: 'confirmado', fuente: 'Compras', detalle: 'desistida', texto: ep };
    const etapa = e >= 2 && datos !== null && datos > e ? datos : e;
    return { etapa, marca: 'confirmado', fuente: 'Compras', detalle: detalleEstado(ep), texto: ep };
  }
  const eg = g.direccion_estadoGeneral;
  if (eg) {
    const base = { marca: 'confirmado', fuente: 'Subdirección', texto: eg };
    if (eg === 'DESISTIDA') return { ...base, etapa: 'X', detalle: 'desistida' };
    if (eg === 'FINALIZADO') return { ...base, etapa: 4, detalle: null };
    if (eg === 'EN PROCESO') return { ...base, etapa: datos ?? 1, detalle: detalleEstado(c.estadoInferido) };
    if (eg === 'PROYECTADO') return { ...base, etapa: datos !== null && datos >= 2 ? datos : 0, detalle: null };
  }
  if (c.origen === 'SEP') {
    return { etapa: c.base.etapa ?? 0, marca: 'confirmado', fuente: 'Seguimiento SEP', detalle: detalleEstado(c.base.estadoCompra), texto: c.base.estadoCompra };
  }
  if (datos !== null) return { etapa: datos, marca: 'deducido', fuente: 'Datos (OC/devengo)', detalle: null, texto: null };
  if (c.estadoUnidad) {
    const e = { PROYECTADO: 0, 'EN PROCESO': 1, FINALIZADO: 4 }[c.estadoUnidad];
    return { etapa: e, marca: 'deducido', fuente: 'Planilla de la unidad', detalle: null, texto: c.estadoUnidad };
  }
  if (c.estadoInferido && c.estadoInferido in DE_INFERIDO) {
    return { etapa: DE_INFERIDO[c.estadoInferido], marca: 'inferido', fuente: 'Observaciones de la unidad',
      detalle: detalleEstado(c.estadoInferido) || (c.estadoInferido === 'DESISTIDA' ? 'desistida' : null), texto: c.estadoInferido };
  }
  return { etapa: 0, marca: 'deducido', fuente: 'Sin información de avance', detalle: null, texto: null };
}

/** Alerta de consistencia entre el estado general (Subdirección) y el proceso (Compras). */
export function consistencia(c) {
  const eg = c.g.direccion_estadoGeneral;
  const ep = c.g.compras_estadoProceso;
  if (!eg || !ep || ep === 'No aplica') return null;
  const e = DE_COMPRAS[ep];
  const malo = (eg === 'FINALIZADO' && (e === 'X' || e < 2))
    || (eg === 'DESISTIDA' && e !== 'X')
    || (eg === 'PROYECTADO' && (e === 'X' || e >= 2))
    || (eg === 'EN PROCESO' && e === 'X');
  return malo ? `Estado general "${eg}" contradice el proceso de compra "${ep}"` : null;
}

// ------------------------------------------------------------------ ventana (7.2)

export function modalidadCompra(c, montoUTM, p) {
  const supuestos = [];
  const decl = c.g.compras_modalidad;
  if (decl && MODALIDADES.some((x) => x.key === decl)) return { key: decl, supuestos };
  let cat = categoriaTipo(normTxt(c.tipoTexto));
  if (!cat || cat === 'OTRO') {
    cat = 'LIC';
    supuestos.push('Modalidad no definida: se asume licitación según monto');
  }
  if (cat === 'AGIL') {
    if (montoUTM !== null && montoUTM > p.duraciones.compraAgil.limiteUTM) supuestos.push('Monto sobre el límite de compra ágil');
    return { key: 'compraAgil', supuestos };
  }
  if (cat === 'TD') return { key: 'tratoDirecto', supuestos };
  if (montoUTM === null) {
    supuestos.push('Sin valor UTM: se asume el tramo de 100 a 1.000 UTM');
    return { key: cat === 'CM' ? 'convenioMarco' : 'licitacionLE', supuestos };
  }
  if (cat === 'CM') return { key: montoUTM > 1000 ? 'convenioMarcoGrande' : 'convenioMarco', supuestos };
  const key = montoUTM < 100 ? 'licitacionL1' : montoUTM <= 1000 ? 'licitacionLE' : montoUTM <= 5000 ? 'licitacionLP' : 'licitacionLR';
  return { key, supuestos };
}

export function calcularVentana(c, et, m, p, hoy) {
  const fer = new Set(p.feriados || []);
  const pendiente = Math.max(0, m.pac - m.real);
  const montoUTM = p.valorUTM > 0 ? pendiente / p.valorUTM : null;
  const { key, supuestos } = modalidadCompra(c, montoUTM, p);
  const d = p.duraciones[key] || { dias: 30, entrega: 15 };
  const entrega = Number.isFinite(c.g.compras_plazoEntregaDias) ? c.g.compras_plazoEntregaDias : d.entrega;
  const recep = p.duraciones.recepcionDevengo?.dias ?? 5;
  const diasTotales = d.dias + entrega + recep;
  const fechaLimite = restarHabiles(p.fechaCorteDevengo, diasTotales, fer);
  const aplica = et.etapa === 0 || et.etapa === 1;
  const margen = contarHabiles(hoy, fechaLimite, fer);
  const va = (p.ventanas || []).find((v) => v.id === c.g.compras_ventanaId) || null;
  const req = c.g.direccion_fechaEstimadaRequerimiento || null;
  return {
    modalidad: key,
    modalidadNombre: MODALIDADES.find((x) => x.key === key)?.nombre || key,
    diasTotales, fechaLimite, margen, aplica, montoUTM,
    ventanaAsignada: va,
    ventanaTardia: !!(va && va.fin > fechaLimite),
    fechaEstimadaRequerimiento: req,
    requerimientoFuera: !!(req && req > fechaLimite),
    supuestos,
  };
}

// ------------------------------------------------------------------ semáforo (7.3)

function programadoHasta(c, iso) {
  if (!c.desglose) return 0;
  const [y, mo, d] = iso.split('-').map(Number);
  let s = 0;
  MESES.forEach((m, i) => { if (finDeMes(y, i + 1) <= `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`) s += c.desglose[m]; });
  return s;
}

export function calcularSemaforo(c, et, v, m, p, ctx) {
  const motivos = [];
  const rojo = (codigo, texto) => motivos.push({ nivel: 'rojo', codigo, texto });
  const amarillo = (codigo, texto) => motivos.push({ nivel: 'amarillo', codigo, texto });
  let etiqueta = null;
  if (et.etapa === 'X') return { color: 'gris', motivos, etiqueta };
  const e = et.etapa;
  const desierta = et.detalle === 'desierta';
  const nLlamado = Number(c.g.compras_nLlamado) || 1;
  if (e <= 1) {
    if (v.margen < 0) rojo('VENTANA_VENCIDA', `Ventana vencida hace ${-v.margen} días hábiles (límite ${v.fechaLimite})`);
    else if (v.margen <= p.umbralAmarillo) amarillo('VENTANA_PROXIMA', `Quedan ${v.margen} días hábiles para iniciar (límite ${v.fechaLimite})`);
    if (e === 0 && v.margen < 0) etiqueta = 'No alcanza 2026 → evaluar liberar o reasignar';
  }
  if (v.requerimientoFuera) rojo('REQ_FUERA_VENTANA', 'Requerimiento programado fuera de ventana');
  if (v.ventanaTardia && e <= 1) rojo('VENTANA_ASIGNADA_TARDIA', `La ventana asignada (${v.ventanaAsignada.nombre}) termina después de la fecha límite calculada`);
  if (desierta && nLlamado >= 2) rojo('DESIERTA_2', `Desierta en el ${nLlamado}° llamado`);
  else if (desierta) amarillo('DESIERTA_1', 'Desierta en primer llamado');
  if (e >= 1 && m.pac > 0 && !c.asignacion && c.origen !== 'SEP') rojo('SIN_ASIGNACION', 'Monto mayor que 0 sin asignación presupuestaria');
  const cdp = c.g.presupuesto_cdp;
  if (m.adjudicado > m.pac && m.pac > 0 && !(cdp && cdp.monto >= m.adjudicado)) rojo('ADJ_SOBRE_PAC', 'Adjudicado mayor que el PAC sin CDP que lo respalde');
  if (e >= 2 && m.fuenteReal === 'sigfe' && c.desglose) {
    const hace30 = new Date(Date.parse(ctx.hoy) - 30 * 86400000).toISOString().slice(0, 10);
    const prog30 = programadoHasta(c, hace30);
    const progHoy = programadoHasta(c, ctx.hoy);
    if (m.real + 1 < prog30) rojo('DEVENGO_ATRASADO', 'Devengo atrasado más de 30 días respecto de lo programado');
    else if (progHoy > 0 && m.real < 0.8 * progHoy) amarillo('DEVENGO_BAJO', 'Devengo menor al 80% de lo programado a la fecha');
  }
  const fuentes = c.g.direccion_fuentes || [];
  if (!fuentes.length) amarillo('SIN_FUENTE', 'Sin fuente de financiamiento definida por las Subdirecciones');
  const fr = ctx.frescura?.[c.slug];
  if (fr && fr.dias > p.diasFrescura) amarillo('PLANILLA_DESACTUALIZADA', `Planilla de la unidad sin actualizar hace ${fr.dias} días`);
  const cons = consistencia(c);
  if (cons) amarillo('INCONSISTENCIA', cons);

  if (e === 4 && !motivos.some((x) => x.nivel === 'rojo')) return { color: 'azul', motivos, etiqueta };
  const color = motivos.some((x) => x.nivel === 'rojo') ? 'rojo' : motivos.some((x) => x.nivel === 'amarillo') ? 'amarillo' : 'verde';
  return { color, motivos, etiqueta };
}

// ------------------------------------------------------------------ proyección (7.4)

export function situacionProyeccion(et, v, m) {
  const e = et.etapa;
  if (e === 'X') return 'desistida';
  if (e >= 3) return 'ejecucion';
  if (e === 2) return m.tieneOC ? 'ejecucion' : 'adjudicadaSinOC';
  if (v.margen < 0) return 'fueraVentana';
  if (e === 1) return et.detalle === 'publicada' || et.detalle === 'evaluacion' ? 'publicada' : 'bases';
  return 'planificada';
}

export function calcularProyeccion(c, et, v, m, p) {
  const sit = situacionProyeccion(et, v, m);
  const esc = {};
  const porMes = {};
  for (const [nombre, f] of Object.entries(p.factores)) {
    const k = f[sit] ?? 0;
    esc[nombre] = Math.round(m.real + m.restante * k);
    const meses = {};
    if (c.desglose) {
      MESES.forEach((mes, i) => {
        meses[mes] = i < p.mesCorte ? (m.fuenteReal === 'planilla' ? c.desglose[mes] : 0) : Math.round(c.desglose[mes] * k);
      });
      if (m.fuenteReal === 'sigfe') meses[MESES[p.mesCorte - 1]] = m.real;
    } else {
      MESES.forEach((mes) => { meses[mes] = 0; });
      meses[MESES[p.mesCorte - 1]] = m.real;
      meses.SIN_MES = Math.round(m.restante * k);
    }
    porMes[nombre] = meses;
  }
  const dp = c.g.presupuesto_definicionPendiente;
  return { situacion: sit, ...esc, porMes, condicionado: !!(dp && dp !== 'ninguna') };
}

// ------------------------------------------------------------------ cálculo completo

/**
 * Calcula todo lo derivado de cada compra.
 * @param {object[]} compras resultado de unificar()
 * @param {object} p parámetros
 * @param {object} [ctx] { hoy: 'aaaa-mm-dd', frescura: {slug: {dias}} }
 */
export function calcularTodo(compras, p, ctx = {}) {
  const c2 = { hoy: ctx.hoy || hoyISO(), frescura: ctx.frescura || {} };
  return compras.map((c) => {
    const m = montos(c, p);
    const et = calcularEtapa(c, m);
    const v = calcularVentana(c, et, m, p, c2.hoy);
    const s = calcularSemaforo(c, et, v, m, p, c2);
    const pr = calcularProyeccion(c, et, v, m, p);
    return { ...c, m, et, v, s, pr };
  });
}

export function estadoPAC(etapa) {
  if (etapa === 'X') return 'Desistido';
  if (etapa >= 3) return 'Ejecutado';
  if (etapa >= 1) return 'En curso';
  return 'Pendiente';
}

/** Reparte un monto según direccion_fuentes (proporcional); lo no asignado va a "Sin clasificar". */
export function repartirPorFuente(c, monto) {
  const fs = (c.g.direccion_fuentes || []).filter((f) => f && f.fuente);
  const tot = suma(fs.map((f) => f.monto));
  if (!fs.length) return { 'Sin clasificar': monto };
  if (tot <= 0) return Object.fromEntries(fs.map((f) => [f.fuente, monto / fs.length]));
  const out = {};
  for (const f of fs) out[f.fuente] = (out[f.fuente] || 0) + monto * ((Number(f.monto) || 0) / tot);
  return out;
}

/** Agrega compras calculadas por una clave. */
export function agregar(calc, clave) {
  const grupos = new Map();
  for (const c of calc) {
    if (!c.enTotales) continue;
    const ks = clave === 'fuente' ? null : [typeof clave === 'function' ? clave(c) : c[clave] ?? 'Sin dato'];
    const reparto = ks ? Object.fromEntries(ks.map((k) => [k, 1])) : null;
    const partes = reparto || Object.fromEntries(Object.entries(repartirPorFuente(c, 1)));
    for (const [k, w] of Object.entries(partes)) {
      if (!grupos.has(k)) grupos.set(k, { clave: k, n: 0, pac: 0, adjudicado: 0, real: 0, conservador: 0, probable: 0, planificado: 0, riesgo: 0, condicionado: 0 });
      const gg = grupos.get(k);
      gg.n += w;
      gg.pac += c.m.pac * w;
      gg.adjudicado += c.m.adjudicado * w;
      gg.real += c.m.real * w;
      gg.conservador += c.pr.conservador * w;
      gg.probable += c.pr.probable * w;
      gg.planificado += c.pr.planificado * w;
      gg.riesgo += montoEnRiesgo(c) * w;
      if (c.pr.condicionado) gg.condicionado += c.pr.planificado * w;
    }
  }
  return [...grupos.values()].sort((a, b) => b.pac - a.pac);
}

/** Monto en riesgo de una compra roja: lo planificado que el escenario probable no alcanza, o el PAC pendiente. */
export function montoEnRiesgo(c) {
  if (c.s.color !== 'rojo') return 0;
  return Math.max(c.pr.planificado - c.pr.conservador, c.m.pac - c.m.real, 0);
}

// ------------------------------------------------------------------ alertas y acciones (7.7, 7.8)

const RESPONSABLE = {
  VENTANA_VENCIDA: 'Unidad requirente', VENTANA_PROXIMA: 'Unidad requirente', REQ_FUERA_VENTANA: 'Unidad requirente',
  VENTANA_ASIGNADA_TARDIA: 'Compras', DESIERTA_2: 'Compras', DESIERTA_1: 'Compras', SIN_ASIGNACION: 'Presupuesto',
  ADJ_SOBRE_PAC: 'Presupuesto', DEVENGO_ATRASADO: 'Finanzas', DEVENGO_BAJO: 'Finanzas', SIN_FUENTE: 'Subdirecciones',
  PLANILLA_DESACTUALIZADA: 'Unidad requirente', INCONSISTENCIA: 'Subdirecciones',
};

function accionSugerida(codigo, c) {
  const d = `"${c.detalle || c.id}"`;
  switch (codigo) {
    case 'VENTANA_VENCIDA': return c.et.etapa === 0 ? `Definir si se libera o reasigna el saldo de ${d}` : `Acelerar la adjudicación de ${d} o evaluar liberar el saldo`;
    case 'VENTANA_PROXIMA': return `Enviar el requerimiento completo (TDR o bases, CDP) de ${d} antes del ${fmt(c.v.fechaLimite)}`;
    case 'REQ_FUERA_VENTANA': return `Adelantar el requerimiento de ${d} al ${fmt(c.v.fechaLimite)} o antes`;
    case 'VENTANA_ASIGNADA_TARDIA': return `Reasignar ${d} a una ventana que termine antes del ${fmt(c.v.fechaLimite)}`;
    case 'DESIERTA_2': return `Evaluar trato directo o liberar el saldo de ${d}`;
    case 'DESIERTA_1': return `Publicar el segundo llamado de ${d} y registrar el contacto con proveedores`;
    case 'SIN_ASIGNACION': return `Registrar la asignación presupuestaria de ${d}`;
    case 'ADJ_SOBRE_PAC': return `Emitir CDP que respalde el adjudicado de ${d}`;
    case 'DEVENGO_ATRASADO': case 'DEVENGO_BAJO': return `Gestionar recepción conforme y devengo de ${d}`;
    case 'SIN_FUENTE': return `Definir la fuente de financiamiento de ${d}`;
    case 'PLANILLA_DESACTUALIZADA': return `Actualizar la planilla de ${c.unidad}`;
    case 'INCONSISTENCIA': return `Revisar el estado de ${d} entre Compras y Subdirección`;
    default: return null;
  }
}
const fmt = (iso) => (iso ? iso.split('-').reverse().join('-') : '');

/**
 * Lista de alertas de todas las compras.
 * @returns {{severidad:'roja'|'amarilla'|'info', codigo, compraId, unidad, mensaje, accion, responsable}[]}
 */
export function generarAlertas(calc, p, ctx = {}) {
  const out = [];
  for (const c of calc) {
    if (c.origen === 'SEP' && c.vinculo) continue; // el contrato ya se controla desde la planilla de la unidad
    for (const mo of c.s.motivos) {
      if (mo.codigo === 'SIN_FUENTE' || mo.codigo === 'PLANILLA_DESACTUALIZADA') continue; // se agrupan abajo
      out.push({ severidad: mo.nivel === 'rojo' ? 'roja' : 'amarilla', codigo: mo.codigo, compraId: c.id, unidad: c.unidad,
        mensaje: mo.texto, accion: accionSugerida(mo.codigo, c), responsable: RESPONSABLE[mo.codigo] || null });
    }
    // Concentración noviembre–diciembre
    if (c.desglose && c.et.etapa !== 'X') {
      const tot = suma(MESES.map((mm) => c.desglose[mm]));
      const nd = c.desglose.NOV + c.desglose.DIC;
      if (tot > 0 && nd / tot > 0.5 && nd > 0) {
        out.push({ severidad: 'amarilla', codigo: 'CONCENTRACION_NOV_DIC', compraId: c.id, unidad: c.unidad,
          mensaje: `El ${Math.round((nd / tot) * 100)}% del desglose está en noviembre y diciembre`,
          accion: `Confirmar calendario de recepción y devengo de "${c.detalle || c.id}"`, responsable: 'Unidad requirente' });
      }
      if (c.base.devengadoPlanilla > 0 && !c.base.valorRecepcion) {
        out.push({ severidad: 'amarilla', codigo: 'DEVENGO_SIN_RECEPCION', compraId: c.id, unidad: c.unidad,
          mensaje: 'Contrato con devengo sin recepción conforme registrada',
          accion: `Registrar la recepción conforme de "${c.detalle || c.id}"`, responsable: 'Unidad requirente' });
      }
    }
    if (c.origen === 'SEP' && 'visacionUATP' in c.base && !c.base.visacionUATP) {
      out.push({ severidad: 'amarilla', codigo: 'SEP_SIN_VISACION', compraId: c.id, unidad: 'SEP', mensaje: 'Ítem SEP sin visación UATP',
        accion: `Solicitar visación UATP de "${c.detalle}"`, responsable: 'UATP' });
    }
    if (c.v.supuestos.includes('Monto sobre el límite de compra ágil') && c.et.etapa <= 1) {
      out.push({ severidad: 'amarilla', codigo: 'AGIL_SOBRE_LIMITE', compraId: c.id, unidad: c.unidad, mensaje: 'Monto pendiente sobre el límite de compra ágil',
        accion: `Revisar la modalidad de "${c.detalle || c.id}"`, responsable: 'Compras' });
    }
  }
  // Sin fuente: una alerta por unidad
  const sinFuente = new Map();
  for (const c of calc) if (c.enTotales && c.s.motivos.some((x) => x.codigo === 'SIN_FUENTE')) sinFuente.set(c.unidad, (sinFuente.get(c.unidad) || 0) + 1);
  for (const [u, n] of sinFuente) {
    out.push({ severidad: 'amarilla', codigo: 'SIN_FUENTE', compraId: null, unidad: u, mensaje: `${n} compras sin fuente de financiamiento definida`,
      accion: `Definir la fuente de financiamiento de las compras de ${u}`, responsable: 'Subdirecciones' });
  }
  // Frescura: una por unidad
  for (const [slug, fr] of Object.entries(ctx.frescura || {})) {
    if (fr.dias > p.diasFrescura) {
      out.push({ severidad: 'amarilla', codigo: 'PLANILLA_DESACTUALIZADA', compraId: null, unidad: fr.unidad || slug,
        mensaje: `Planilla sin modificar hace ${fr.dias} días`, accion: `Actualizar la planilla de ${fr.unidad || slug}`, responsable: 'Unidad requirente' });
    }
  }
  // Cuello de botella semanal: procesos que deben iniciarse en la misma semana
  const porSemana = new Map();
  for (const c of calc) {
    if (!c.enTotales || !c.v.aplica || c.v.margen < 0) continue;
    const w = lunesDe(c.v.fechaLimite);
    porSemana.set(w, (porSemana.get(w) || 0) + 1);
  }
  for (const [w, n] of porSemana) {
    if (n > p.umbralProcesosSemana) {
      out.push({ severidad: 'amarilla', codigo: 'CUELLO_BOTELLA', compraId: null, unidad: null,
        mensaje: `${n} procesos con fecha límite en la semana del ${fmt(w)} (umbral ${p.umbralProcesosSemana})`,
        accion: 'Escalonar requerimientos y reservar capacidad de jurídica, comisiones y firma', responsable: 'Compras' });
    }
  }
  const orden = { roja: 0, amarilla: 1, info: 2 };
  return out.sort((a, b) => orden[a.severidad] - orden[b.severidad]);
}

/** Agrupa alertas con acción por unidad y Subdirección. */
export function accionesPorSubdireccion(alertas, p) {
  const mapa = p.mapaSubdireccion || {};
  const out = {};
  for (const a of alertas) {
    if (!a.accion) continue;
    const sub = (a.unidad && mapa[a.unidad]) || 'Sin asignar';
    const u = a.unidad || 'Transversal';
    out[sub] ??= {};
    out[sub][u] ??= [];
    out[sub][u].push(a);
  }
  return out;
}

/** Frescura por planilla a partir de visor_base. */
export function calcularFrescura(bases, hoy) {
  const out = {};
  for (const [slug, b] of Object.entries(bases)) {
    if (!b.fileModifiedAt) continue;
    const dias = Math.floor((Date.parse(hoy) - Date.parse(String(b.fileModifiedAt).slice(0, 10))) / 86400000);
    out[slug] = { dias, unidad: b.unidad, fileModifiedAt: b.fileModifiedAt };
  }
  return out;
}
