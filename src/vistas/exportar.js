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

export async function exportarExcel(lista, ctx, sufijo = '') {
  const X = await cargarSheetJS();
  const wb = X.utils.book_new();
  X.utils.book_append_sheet(wb, X.utils.json_to_sheet(filas(lista)), 'Compras');
  X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(pie(ctx).map((l) => [l])), 'Fuente');
  X.writeFile(wb, `visor-saf-spycg-${sufijo ? `${sufijo}-` : ''}${ctx.hoy}.xlsx`);
}

export function exportarCSV(lista, ctx, sufijo = '') {
  const datos = filas(lista);
  const cols = Object.keys(datos[0] || { ID: '' });
  const q = (v) => { const s = String(v ?? ''); return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const lineas = [cols.map(q).join(';'), ...datos.map((d) => cols.map((c) => q(d[c])).join(';')), '', ...pie(ctx).map(q)];
  descargar(`visor-saf-spycg-${sufijo ? `${sufijo}-` : ''}${ctx.hoy}.csv`, `﻿${lineas.join('\r\n')}`, 'text/csv;charset=utf-8');
}

/** Encabezado y pie para impresión a PDF (horizontal). */
export function encabezadoImpresion(ctx, titulo) {
  return `<div class="solo-impresion" style="margin-bottom:.5rem"><h2>${esc(titulo)}</h2>
    <div class="small">${pie(ctx).map(esc).join(' · ')}</div></div>`;
}

// ------------------------------------------------------------------ una sola compra (detalle)

const valorTexto = (v) => {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'boolean') return v ? 'Sí' : 'No';
  if (typeof v?.toDate === 'function') return fechaHora(v);
  if (Array.isArray(v)) return v.map((x) => (typeof x === 'object' ? Object.values(x).join(' ') : x)).join('; ');
  if (typeof v === 'object') return Object.entries(v).map(([k, x]) => `${k}: ${typeof x?.toDate === 'function' ? fechaHora(x) : x}`).join('; ');
  return String(v);
};

const ETIQUETAS_BASE = {
  programa: 'Programa', subtitulo: 'Subtítulo', asignacion: 'Asignación', adminContrato: 'Administrador contrato',
  detalle: 'Detalle', proveedor: 'Proveedor', temporalidad: 'Temporalidad', montoPAC: 'Monto PAC', montoOC: 'Monto OC',
  ocTexto: 'N° OC (texto original)', idMercadoPublico: 'ID Mercado Público / cotización', tipoCompra: 'Tipo de compra',
  tipoCompraInferido: 'Tipo inferido de la OC', valorOT: 'Valor OT', avanceOT: '% avance OT', valorRecepcion: 'Recepción conforme',
  devengadoPlanilla: 'Facturado = devengado', pendienteOT: 'Pendiente OT', totalDesglose: 'Total desglose', obsUnidad: 'Observaciones de la unidad',
  estadoInferido: 'Estado inferido', item: 'Ítem', montoPresupuestado: 'Monto presupuestado', modalidad: 'Modalidad',
  estadoCompra: 'Estado proceso de compra', documentoFormaliza: 'Documento que formaliza', montoAdjudicado: 'Monto adjudicado',
  estadoEjecucion: 'Estado ejecución', verificadores: 'Verificadores', visacionUATP: 'Visación UATP', montoDevengado: 'Monto devengado',
  montoPagado: 'Monto pagado', observaciones: 'Observaciones', fila: 'Fila en la planilla',
};

/** Filas [sección, campo, valor] con todo lo que el Visor sabe de una compra. */
export function datosCompra(c, ctx) {
  const nombreDe = (em) => ctx.estado.rolesDoc?.usuarios?.[em]?.nombre || em;
  const f = [];
  const add = (s, k, v) => f.push([s, k, valorTexto(v)]);
  add('Compra', 'ID', c.id);
  add('Compra', 'Unidad', c.unidad);
  add('Compra', 'Origen', c.origen === 'SEP' ? 'Seguimiento SEP (solo seguimiento, no suma en totales)' : 'Planilla de la unidad');
  for (const [k, et] of Object.entries(ETIQUETAS_BASE)) if (c.base[k] !== undefined && c.base[k] !== null && c.base[k] !== '') add('Planilla', et, c.base[k]);
  if (c.base.ocs?.length) add('Planilla', 'OC detectadas', c.base.ocs);
  add('Cálculo', 'Etapa', `${c.et.etapa} · ${ETAPAS[c.et.etapa]} (${c.et.marca}, ${c.et.fuente})`);
  add('Cálculo', 'Semáforo', c.s.color);
  if (c.s.motivos.length) add('Cálculo', 'Motivos', c.s.motivos.map((m) => m.texto).join(' | '));
  if (c.s.etiqueta) add('Cálculo', 'Etiqueta', c.s.etiqueta);
  add('Cálculo', 'PAC / presupuestado', c.m.pac);
  add('Cálculo', 'Adjudicado u OC anual', c.m.adjudicado);
  add('Cálculo', `Devengado real (${c.m.fuenteReal === 'sigfe' ? 'SIGFE' : 'según planilla'})`, c.m.real);
  add('Cálculo', 'Modalidad para la ventana', c.v.modalidadNombre);
  add('Cálculo', 'Fecha límite para iniciar', c.v.fechaLimite ? c.v.fechaLimite.split('-').reverse().join('-') : '');
  add('Cálculo', 'Margen (días hábiles)', c.v.aplica ? c.v.margen : 'No aplica');
  if (c.v.ventanaAsignada) add('Cálculo', 'Ventana asignada', c.v.ventanaAsignada.nombre);
  add('Cálculo', 'Proyección conservador', c.pr.conservador);
  add('Cálculo', 'Proyección probable', c.pr.probable);
  add('Cálculo', 'Proyección planificado', c.pr.planificado);
  if (c.v.supuestos.length) add('Cálculo', 'Supuestos', c.v.supuestos.join(' | '));
  if (c.vinculo) add('Cálculo', 'Vínculo', `${c.vinculo.sepId} ↔ ${c.vinculo.compraId}${c.vinculo.oc ? ` (OC ${c.vinculo.oc})` : ''}`);
  for (const [k, v] of Object.entries(c.g).sort()) {
    if (['compraId', 'updatedAt', 'updatedBy'].includes(k) || k.startsWith('obs_')) continue;
    add(`Gestión ${k.split('_')[0]}`, k.split('_').slice(1).join('_'), v);
  }
  for (const r of ROLES_OBS) {
    const o = c.g[`obs_${r}`];
    if (o) add('Última observación', ROLES[r], `${o.texto} — ${nombreDe(o.autor)}, ${fechaHora(o.fecha)}`);
  }
  if (c.g.updatedBy) add('Gestión', 'Última edición', `${nombreDe(c.g.updatedBy)}, ${fechaHora(c.g.updatedAt)}`);
  return f;
}

/** Excel de una compra: resumen, desglose, observaciones, contactos, historial y fuente. */
export async function exportarCompraExcel(c, extra, ctx) {
  const X = await cargarSheetJS();
  const nombreDe = (em) => ctx.estado.rolesDoc?.usuarios?.[em]?.nombre || em;
  const wb = X.utils.book_new();
  X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([['Sección', 'Campo', 'Valor'], ...datosCompra(c, ctx)]), 'Compra');
  if (c.desglose) {
    X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([
      ['Mes', ...MESES], ['Monto', ...MESES.map((m) => c.desglose[m])],
      ['Tipo', ...MESES.map((m, i) => (i < ctx.p.mesCorte ? 'reportado ejecutado' : 'proyectado'))],
    ]), 'Desglose');
  }
  X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([['Fecha', 'Rol', 'Autor', 'Observación'],
    ...extra.obs.map((o) => [fechaHora(o.createdAt), ROLES[o.rol] || o.rol, o.autorNombre || o.autorEmail, o.texto])]), 'Observaciones');
  const contactos = ctx.estado.contactos.filter((x) => x.compraId === c.id);
  X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([['Fecha', 'Medio', 'Proveedor', 'RUT', 'Llamado', 'Resultado', 'Próxima acción', 'Registró'],
    ...contactos.map((x) => [x.fecha, x.medio, x.proveedor, x.rut, x.nLlamado, x.resultado, x.proximaAccion, nombreDe(x.registradoPor)])]), 'Contactos');
  X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([['Fecha', 'Tipo', 'Campo', 'Antes', 'Después', 'Autor'],
    ...extra.hist.map((h) => [fechaHora(h.createdAt), h.tipo, h.campo, valorTexto(h.antes), valorTexto(h.despues), nombreDe(h.autor)])]), 'Historial');
  X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(pie(ctx).map((l) => [l])), 'Fuente');
  X.writeFile(wb, `visor-${c.id}-${ctx.hoy}.xlsx`);
}

/** PDF de una compra: arma una versión de lectura y abre el diálogo de impresión (Guardar como PDF). */
export function imprimirCompra(c, extra, ctx) {
  const nombreDe = (em) => ctx.estado.rolesDoc?.usuarios?.[em]?.nombre || em;
  const filas = datosCompra(c, ctx);
  const secciones = [...new Set(filas.map((f) => f[0]))];
  const tabla = (cab, filasT) => `<table class="t"><thead><tr>${cab.map((x) => `<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${
    filasT.map((r) => `<tr>${r.map((x) => `<td>${esc(x)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  const contactos = ctx.estado.contactos.filter((x) => x.compraId === c.id);
  let cont = document.getElementById('impresion');
  if (!cont) { cont = document.createElement('div'); cont.id = 'impresion'; document.body.appendChild(cont); }
  cont.innerHTML = `<h2>${esc(c.id)} · ${esc(c.detalle || '')}</h2><div class="small">${pie(ctx).map(esc).join(' · ')}</div>
    ${secciones.map((s) => `<h3 style="margin-top:.8rem">${esc(s)}</h3>${tabla(['Campo', 'Valor'], filas.filter((f) => f[0] === s).map((f) => [f[1], f[2]]))}`).join('')}
    ${c.desglose ? `<h3 style="margin-top:.8rem">Desglose mensual</h3>${tabla(MESES, [MESES.map((m) => `$${Math.round(c.desglose[m]).toLocaleString('es-CL')}`)])}` : ''}
    <h3 style="margin-top:.8rem">Observaciones</h3>${extra.obs.length ? tabla(['Fecha', 'Rol', 'Autor', 'Observación'], extra.obs.map((o) => [fechaHora(o.createdAt), ROLES[o.rol] || o.rol, o.autorNombre || o.autorEmail, o.texto])) : '<p>Sin observaciones.</p>'}
    <h3 style="margin-top:.8rem">Contacto con proveedores</h3>${contactos.length ? tabla(['Fecha', 'Medio', 'Proveedor', 'Resultado', 'Próxima acción', 'Registró'], contactos.map((x) => [fecha(x.fecha), x.medio, x.proveedor, x.resultado, x.proximaAccion, nombreDe(x.registradoPor)])) : '<p>Sin contactos.</p>'}`;
  document.body.classList.add('imprimir-detalle');
  const limpiar = () => { document.body.classList.remove('imprimir-detalle'); cont.innerHTML = ''; window.removeEventListener('afterprint', limpiar); };
  window.addEventListener('afterprint', limpiar);
  window.print();
}
