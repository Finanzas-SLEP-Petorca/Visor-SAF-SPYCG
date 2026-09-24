// Valores por defecto de visor_config/parametros (sección 7). Todos editables en Parámetros.
// Las duraciones son REFERENCIALES: Compras debe validarlas contra el reglamento vigente
// de la Ley 19.886 modificada por la Ley 21.634.

export const MODALIDADES = [
  { key: 'compraAgil', nombre: 'Compra ágil' },
  { key: 'convenioMarco', nombre: 'Convenio marco (hasta 1.000 UTM)' },
  { key: 'convenioMarcoGrande', nombre: 'Convenio marco, gran compra (más de 1.000 UTM)' },
  { key: 'tratoDirecto', nombre: 'Trato directo' },
  { key: 'licitacionL1', nombre: 'Licitación menor a 100 UTM' },
  { key: 'licitacionLE', nombre: 'Licitación entre 100 y 1.000 UTM' },
  { key: 'licitacionLP', nombre: 'Licitación entre 1.000 y 5.000 UTM' },
  { key: 'licitacionLR', nombre: 'Licitación sobre 5.000 UTM' },
];

export const ESTADOS_PROCESO = ['Sin iniciar', 'Elaboración de bases', 'Publicada', 'En evaluación',
  'Adjudicada', 'Desierta', 'Revocada', 'Desistida', 'No aplica'];

export const ESTADOS_GENERALES = ['PROYECTADO', 'EN PROCESO', 'FINALIZADO', 'DESISTIDA'];

export const ROLES = {
  finanzas: 'Finanzas',
  compras: 'Compras',
  presupuesto: 'Presupuesto',
  subdirSAF: 'Subdirector SAF',
  subdirSPYCG: 'Subdirector SPYCG',
  lectura: 'Lectura',
};
export const ROLES_OBS = ['finanzas', 'compras', 'presupuesto', 'subdirSAF', 'subdirSPYCG'];

export const PARAMETROS_DEFECTO = {
  fechaCorteDevengo: '2026-12-15',
  mesCorte: 8,
  valorUTM: null,
  feriados: ['2026-10-12', '2026-10-31', '2026-12-08', '2026-12-25'],
  hitos: [
    { id: 'req-lic', fecha: '2026-10-09', nombre: 'Entrega de requerimientos completos (TDR o bases técnicas, CDP) para licitaciones', responsable: 'Unidades requirentes' },
    { id: 'pub-lic', fecha: '2026-10-16', nombre: 'Última publicación de licitaciones', responsable: 'Compras' },
    { id: 'pub-otras', fecha: '2026-10-30', nombre: 'Última publicación de compras ágiles, grandes compras y tratos directos', responsable: 'Compras' },
    { id: 'oc', fecha: '2026-11-13', nombre: 'Última emisión y aceptación de OC y firma de contratos', responsable: 'Compras / Jurídica' },
    { id: 'recepcion', fecha: '2026-12-04', nombre: 'Última recepción conforme de bienes en establecimientos', responsable: 'Unidades requirentes' },
    { id: 'devengo', fecha: '2026-12-11', nombre: 'Última recepción de facturas y devengo', responsable: 'Finanzas' },
  ],
  // Ventanas institucionales que Compras asigna a cada compra (compras_ventanaId).
  ventanas: [
    { id: 'v-req-lic', nombre: 'Requerimientos para licitación', fin: '2026-10-09' },
    { id: 'v-pub-lic', nombre: 'Publicación de licitaciones', fin: '2026-10-16' },
    { id: 'v-pub-otras', nombre: 'Publicación compras ágiles, grandes compras y tratos directos', fin: '2026-10-30' },
  ],
  // Días hábiles desde requerimiento completo hasta OC aceptada, y plazo de entrega por defecto.
  duraciones: {
    compraAgil: { dias: 10, entrega: 15, limiteUTM: 100 },
    convenioMarco: { dias: 7, entrega: 15 },
    convenioMarcoGrande: { dias: 30, entrega: 15 },
    tratoDirecto: { dias: 20, entrega: 15 },
    licitacionL1: { dias: 20, entrega: 15 },
    licitacionLE: { dias: 30, entrega: 15 },
    licitacionLP: { dias: 45, entrega: 20 },
    licitacionLR: { dias: 60, entrega: 20 },
    recepcionDevengo: { dias: 5 },
  },
  factores: {
    conservador: { ejecucion: 1, adjudicadaSinOC: 0, publicada: 0, bases: 0, planificada: 0, fueraVentana: 0, desistida: 0 },
    probable: { ejecucion: 1, adjudicadaSinOC: 0.9, publicada: 0.7, bases: 0.4, planificada: 0.2, fueraVentana: 0, desistida: 0 },
    planificado: { ejecucion: 1, adjudicadaSinOC: 1, publicada: 1, bases: 1, planificada: 1, fueraVentana: 1, desistida: 0 },
  },
  umbralAmarillo: 10,
  diasFrescura: 15,
  umbralProcesosSemana: 4,
  umbralSimilitud: 0.5,
  listas: {
    fuentes: ['SEP', 'PIE', 'FAEP', 'Mantenimiento', 'Pro Retención', 'Aporte Fiscal', 'Aporte Fiscal Extraordinario',
      'Subvención General', 'JUNJI/VTF', 'Otra', 'Sin clasificar'],
    mediosContacto: ['Llamado telefónico', 'Correo', 'Reunión', 'Consulta al mercado', '1° llamado', '2° llamado'],
    definicionesPendientes: ['ninguna', 'SEP distribución remuneraciones', 'PRORRETENCIÓN',
      'Alcance DEP ante Aporte Fiscal Extraordinario', 'otra'],
    subdirecciones: ['SAF', 'SPYCG', 'Dirección Ejecutiva', 'Otra'],
  },
  // Unidad requirente → Subdirección (pendiente de definir).
  mapaSubdireccion: {},
  // Vínculos entre ítems SEP y compras de unidades confirmados o descartados por el administrador.
  vinculosConfirmados: [],
  vinculosDescartados: [],
};

/** Mezcla profunda de los parámetros guardados sobre los por defecto. */
export function mezclarParametros(guardados) {
  const out = structuredClone(PARAMETROS_DEFECTO);
  if (!guardados) return out;
  for (const [k, v] of Object.entries(guardados)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object' && !Array.isArray(out[k])) {
      out[k] = mezclarObj(out[k], v);
    } else if (v !== undefined) out[k] = v;
  }
  return out;
}
function mezclarObj(a, b) {
  const o = { ...a };
  for (const [k, v] of Object.entries(b)) {
    o[k] = v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object' && !Array.isArray(a[k])
      ? mezclarObj(a[k], v) : v;
  }
  return o;
}
