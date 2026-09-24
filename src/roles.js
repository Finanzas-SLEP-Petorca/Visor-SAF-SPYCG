// Campos de visor_gestion que cada rol puede escribir. DEBE coincidir con vCamposRol() de
// firestore.rules (la prueba test/roles.test.mjs lo verifica cuando las reglas están disponibles).
import { MODALIDADES, ESTADOS_PROCESO, ESTADOS_GENERALES } from './parametros-default.js';

export const CAMPOS_DIRECCION = [
  'direccion_estadoGeneral', 'direccion_fuentes', 'direccion_fechaEstimadaRequerimiento', 'direccion_prioridad',
  'direccion_acuerdo', 'direccion_responsable', 'direccion_fechaCompromiso', 'direccion_cumplido',
];

export const CAMPOS_ROL = {
  compras: [
    'compras_estadoProceso', 'compras_modalidad', 'compras_idMercadoPublico', 'compras_nLlamado',
    'compras_fechaPublicacion', 'compras_fechaCierre', 'compras_fechaAdjudicacion', 'compras_montoAdjudicado',
    'compras_ocs', 'compras_fechaAceptacionOC', 'compras_ventanaId', 'compras_plazoEntregaDias',
    'compras_contactoRealizado', 'compras_fechaUltimoContacto', 'obs_compras',
  ],
  presupuesto: [
    'presupuesto_asignacionValidada', 'presupuesto_cdp', 'presupuesto_comprometidoSigfe',
    'presupuesto_accion', 'presupuesto_definicionPendiente', 'obs_presupuesto',
  ],
  finanzas: [
    'finanzas_devengadoSigfe', 'finanzas_pagadoSigfe', 'finanzas_fechaCorteSigfe', 'finanzas_programacionCaja', 'obs_finanzas',
  ],
  subdirSAF: [...CAMPOS_DIRECCION, 'obs_subdirSAF'],
  subdirSPYCG: [...CAMPOS_DIRECCION, 'obs_subdirSPYCG'],
};

export const puedeEscribir = (rol, campo) => !!(rol && CAMPOS_ROL[rol]?.includes(campo));
export const esEditor = (rol) => rol in CAMPOS_ROL;

/**
 * Formularios de gestión por grupo. tipo: text | number | date | bool | select | textarea | ocs | fuentes | cdp | meses
 * `opciones` puede ser una función (parámetros) → lista de [valor, etiqueta].
 */
export const FORMULARIOS = [
  {
    grupo: 'compras', titulo: 'Compras', campos: [
      { k: 'compras_estadoProceso', label: 'Estado del proceso', tipo: 'select', opciones: () => ESTADOS_PROCESO.map((e) => [e, e]) },
      { k: 'compras_modalidad', label: 'Modalidad', tipo: 'select', opciones: () => MODALIDADES.map((m) => [m.key, m.nombre]) },
      { k: 'compras_idMercadoPublico', label: 'ID Mercado Público', tipo: 'text' },
      { k: 'compras_nLlamado', label: 'N° de llamado', tipo: 'number' },
      { k: 'compras_fechaPublicacion', label: 'Fecha de publicación', tipo: 'date' },
      { k: 'compras_fechaCierre', label: 'Fecha de cierre', tipo: 'date' },
      { k: 'compras_fechaAdjudicacion', label: 'Fecha de adjudicación', tipo: 'date' },
      { k: 'compras_montoAdjudicado', label: 'Monto adjudicado ($)', tipo: 'number' },
      { k: 'compras_ocs', label: 'OC (separadas por coma)', tipo: 'ocs' },
      { k: 'compras_fechaAceptacionOC', label: 'Fecha aceptación OC', tipo: 'date' },
      { k: 'compras_ventanaId', label: 'Ventana institucional', tipo: 'select', opciones: (p) => (p.ventanas || []).map((v) => [v.id, `${v.nombre} (hasta ${v.fin.split('-').reverse().join('-')})`]) },
      { k: 'compras_plazoEntregaDias', label: 'Plazo de entrega (días hábiles)', tipo: 'number' },
      { k: 'compras_contactoRealizado', label: 'Contacto con proveedores realizado', tipo: 'bool' },
      { k: 'compras_fechaUltimoContacto', label: 'Fecha último contacto', tipo: 'date' },
    ],
  },
  {
    grupo: 'presupuesto', titulo: 'Presupuesto', campos: [
      { k: 'presupuesto_asignacionValidada', label: 'Asignación validada', tipo: 'bool' },
      { k: 'presupuesto_cdp', label: 'CDP', tipo: 'cdp' },
      { k: 'presupuesto_comprometidoSigfe', label: 'Comprometido SIGFE ($)', tipo: 'number' },
      { k: 'presupuesto_accion', label: 'Acción', tipo: 'select', opciones: () => [['mantener', 'Mantener'], ['liberar', 'Liberar'], ['reasignar', 'Reasignar']] },
      { k: 'presupuesto_definicionPendiente', label: 'Definición pendiente', tipo: 'select', opciones: (p) => p.listas.definicionesPendientes.map((d) => [d, d]) },
    ],
  },
  {
    grupo: 'finanzas', titulo: 'Finanzas', campos: [
      { k: 'finanzas_devengadoSigfe', label: 'Devengado SIGFE ($)', tipo: 'number' },
      { k: 'finanzas_pagadoSigfe', label: 'Pagado SIGFE ($)', tipo: 'number' },
      { k: 'finanzas_fechaCorteSigfe', label: 'Fecha de corte SIGFE', tipo: 'date' },
      { k: 'finanzas_programacionCaja', label: 'Programación de caja por mes ($)', tipo: 'meses' },
    ],
  },
  {
    grupo: 'direccion', titulo: 'Subdirecciones (SAF / SPYCG)', campos: [
      { k: 'direccion_estadoGeneral', label: 'Estado general', tipo: 'select', opciones: () => ESTADOS_GENERALES.map((e) => [e, e]) },
      { k: 'direccion_fuentes', label: 'Fuentes de financiamiento', tipo: 'fuentes' },
      { k: 'direccion_fechaEstimadaRequerimiento', label: 'Fecha estimada del requerimiento completo', tipo: 'date' },
      { k: 'direccion_prioridad', label: 'Prioridad', tipo: 'select', opciones: () => [['alta', 'Alta'], ['media', 'Media'], ['baja', 'Baja']] },
      { k: 'direccion_acuerdo', label: 'Acuerdo', tipo: 'textarea' },
      { k: 'direccion_responsable', label: 'Responsable', tipo: 'text' },
      { k: 'direccion_fechaCompromiso', label: 'Fecha compromiso', tipo: 'date' },
      { k: 'direccion_cumplido', label: 'Cumplido', tipo: 'bool' },
    ],
  },
];
