// Exportaciones: Excel (SheetJS desde su CDN oficial), CSV y preparación de impresión a PDF.
// Todas incluyen fuente, fecha de corte y usuario que exportó.
import { estado } from '../datos.js';
import { ETAPAS, repartirPorFuente } from '../logica/motor.js';
import { MESES } from '../util.js';
import { ROLES_OBS, ROLES } from '../parametros-default.js';
import { fecha, fechaHora, esc } from '../formato.js';
import { descargar } from '../ui.js';

const URL_SHEETJS = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs';
let XLSX = null;
export async function cargarSheetJS() {
  if (!XLSX) XLSX = await import(URL_SHEETJS);
  return XLSX;
}

export function pie(ctx) {
  return [
    `Fuente: planillas de unidades (última modificación ${fecha(ctx.corteBase)})${ctx.hayBaseSEP ? ' y Seguimiento SEP' : ''}; gestión SAF/SPYCG en el Visor`,
    `Mes de corte real/proyectado: ${ctx.p.mesCorte}; corte de devengo ${fecha(ctx.p.fechaCorteDevengo)}`,
    `Exportado por ${estado.nombre} (${estado.email}) el ${fechaHora(new Date())}`,
  ];
}

function filas(lista) {
  return lista.map((c) => {
    const g = c.g;
    const o = {
      ID: c.id, Unidad: c.unidad, Programa: c.programa, Subtítulo: c.subtitulo, Asignación: c.asignacion, Detalle: c.detalle,
      'Fuente(s)': Object.keys(repartirPorFuente(c, 1)).join(', '), 'Tipo/Modalidad': c.v.modalidadNombre,
      PAC: c.m.pac, 'Adjudicado/OC': c.m.adjudicado, Devengado: c.m.real, 'Fuente devengado': c.m.fuenteReal,
      Etapa: `${c.et.etapa} ${ETAPAS[c.et.etapa]}`, 'Marca etapa': c.et.marca, 'Estado proceso': g.compras_estadoProceso || '',
      'Estado general': g.direccion_estadoGeneral || '', 'Fecha límite inicio': c.v.aplica ? c.v.fechaLimite : '',
      'Margen (días háb.)': c.v.aplica ? c.v.margen : '', 'Ventana asignada': c.v.ventanaAsignada?.nombre || '',
      Semáforo: c.s.color, Alertas: c.s.motivos.map((m) => m.texto).join(' | '),
      'Proy. conservador': c.pr.conservador, 'Proy. probable': c.pr.probable, 'Proy. planificado': c.pr.planificado,
      Condicionado: c.pr.condicionado ? 'Sí' : '', OC: c.ocs.join(' '),
    };
    for (const m of MESES) o[m] = c.desglose ? c.desglose[m] : '';
    for (const r of ROLES_OBS) o[`Obs. ${ROLES[r]}`] = g[`obs_${r}`]?.texto || '';
    o['Obs. unidad'] = c.obsUnidad || '';
    return o;
  });
}

export async function exportarExcel(lista, ctx) {
  const X = await cargarSheetJS();
  const wb = X.utils.book_new();
  X.utils.book_append_sheet(wb, X.utils.json_to_sheet(filas(lista)), 'Compras');
  X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(pie(ctx).map((l) => [l])), 'Fuente');
  X.writeFile(wb, `visor-saf-spycg-${ctx.hoy}.xlsx`);
}

export function exportarCSV(lista, ctx) {
  const datos = filas(lista);
  const cols = Object.keys(datos[0] || { ID: '' });
  const q = (v) => { const s = String(v ?? ''); return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const lineas = [cols.map(q).join(';'), ...datos.map((d) => cols.map((c) => q(d[c])).join(';')), '', ...pie(ctx).map(q)];
  descargar(`visor-saf-spycg-${ctx.hoy}.csv`, `﻿${lineas.join('\r\n')}`, 'text/csv;charset=utf-8');
}

/** Encabezado y pie para impresión a PDF (horizontal). */
export function encabezadoImpresion(ctx, titulo) {
  return `<div class="solo-impresion" style="margin-bottom:.5rem"><h2>${esc(titulo)}</h2>
    <div class="small">${pie(ctx).map(esc).join(' · ')}</div></div>`;
}
