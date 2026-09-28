// Constantes compartidas por la app y el agente local (sin dependencias).

/** Documento de visor_base donde el agente local deja su "última revisión" (no es una planilla). */
export const MARCA_AGENTE = '_agente';

/** ¿El ID de visor_base corresponde a un documento técnico y no a una planilla? */
export const esDocTecnico = (id) => id.startsWith('_');
