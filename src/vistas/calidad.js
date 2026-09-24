// Calidad de datos y sincronización: estado de cada planilla e importación desde el navegador.
import { estado, escribirImportacion } from '../datos.js';
import { prepararArchivo, clasificarArchivo } from '../importacion.js';
import { cargarSheetJS } from './exportar.js';
import { esc, fechaHora, clp } from '../formato.js';
import { toast } from '../ui.js';

let preparados = null; // resultado de la vista previa
let procesando = false;

const NOMBRES = {
  SUBT_INVERTIDO: 'Subtítulo/asignación invertidos', SUBT_DEDUCIDO: 'Subtítulo deducido', ASIG_VACIA: 'Asignación vacía',
  TIPO_VACIO: 'Tipo de compra vacío', TIPO_CORREGIDO: 'Tipo de compra corregido', TIPO_DISTINTO_OC: 'Tipo distinto al de la OC',
  OC_MONTO_SIN_NUMERO: 'Monto OC sin N° de OC', OC_IGUAL_PAC_TODAS: 'Monto OC = PAC en todas las filas', OC_VARIAS: 'Varias OC en una celda',
  OC_PREFIJO_PROGRAMA: 'OC de otro programa', DESGLOSE_NO_CUADRA: 'Total de desglose no cuadra', DESGLOSE_VACIO: 'Desglose vacío con PAC',
  PLANILLA_DESACTUALIZADA: 'Planilla desactualizada', ENCABEZADO_DISTINTO: 'Encabezado distinto al estándar', NRO_VACIO: 'Sin N°',
  NRO_DUPLICADO: 'N° duplicado', MONTO_NO_NUMERICO: 'Monto no numérico', SEP_ADJUDICADA_SIN_MONTO: 'SEP adjudicado sin monto',
  SEP_SIN_VISACION: 'SEP sin visación UATP', SEP_ETAPA_REF: 'SEP: "Etapa actual" con #REF!',
};

function conteo(advs) {
  const c = {};
  for (const a of advs || []) c[a.codigo] = (c[a.codigo] || 0) + 1;
  return Object.entries(c).map(([k, n]) => `<span class="tag${['PLANILLA_DESACTUALIZADA', 'DESGLOSE_NO_CUADRA', 'OC_IGUAL_PAC_TODAS'].includes(k) ? ' alerta' : ''}" title="${esc(k)}">${esc(NOMBRES[k] || k)}: ${n}</span>`).join('');
}

export function render(el, ctx) {
  const bases = Object.entries(ctx.estado.bases).sort((a, b) => a[0].localeCompare(b[0]));
  const nombreDe = (em) => ctx.estado.rolesDoc?.usuarios?.[em]?.nombre || em;
  const admin = estado.esAdmin;
  el.innerHTML = `<h2>Calidad de datos y sincronización</h2>
  <div class="tabla-wrap libre"><table class="t"><thead><tr><th>Planilla</th><th>Archivo</th><th>Última modificación</th><th class="num">Días</th><th>Última sincronización</th><th>Origen</th><th class="num">Filas</th><th class="num">PAC</th><th>Advertencias</th></tr></thead><tbody>
  ${bases.map(([slug, b]) => { const fr = ctx.frescura[slug]; return `<tr><td><b>${esc(b.unidad)}</b></td><td class="small">${esc(b.archivo)}</td><td class="nowrap">${fechaHora(b.fileModifiedAt)}${b.fileModifiedBy ? `<br><span class="small">${esc(b.fileModifiedBy)}</span>` : ''}</td>
    <td class="num">${fr ? fr.dias : '—'}${fr && fr.dias > ctx.p.diasFrescura ? ' ⚠' : ''}</td><td class="nowrap">${fechaHora(b.syncedAt)}<br><span class="small">${esc(nombreDe(b.syncedBy))}</span></td><td class="small">${esc(b.origen)}</td>
    <td class="num">${Object.keys(b.filas || {}).length}</td><td class="num">${clp(b.resumen?.montoPAC ?? b.resumen?.montoPresupuestado)}</td>
    <td><details><summary class="small">${(b.advertencias || []).length} advertencias</summary>${conteo(b.advertencias)}
      <ul class="small">${(b.advertencias || []).slice(0, 300).map((a) => `<li>${esc(a.mensaje)}</li>`).join('')}</ul></details></td></tr>`; }).join('') || '<tr><td colspan="9" class="muted">Sin planillas importadas.</td></tr>'}
  </tbody></table></div>
  <p class="small muted">La sincronización es manual en esta fase (botón de abajo). Con el agente local o el conector en la nube, esta tabla se actualiza sola.</p>
  ${admin ? `<div class="tarjeta" style="margin-top:1rem"><h3>Importar planillas</h3>
    <p class="small">Seleccione la carpeta sincronizada de OneDrive "Monitoreo control de pagos y ejecucion 2026" o los archivos. Se leen en este navegador y <b>nunca se modifican</b>.
    Se reconocen los archivos "ESTATUS DEVENGOS COMPRAS &lt;UNIDAD&gt; 2026.xlsx" y el Seguimiento SEP.</p>
    <div class="fila"><label class="btn">Elegir carpeta<input type="file" id="imp-carpeta" webkitdirectory multiple class="oculto"></label>
    <label class="btn">Elegir archivos<input type="file" id="imp-archivos" accept=".xlsx,.xlsm,.xls" multiple class="oculto"></label>
    ${procesando ? '<span class="muted">Procesando…</span>' : ''}</div>
    <div id="imp-previa"></div></div>` : '<p class="small">Solo la administración puede importar planillas.</p>'}`;
  if (!admin) return;
  const alElegir = (inp) => { inp.onchange = () => procesar([...inp.files], el, ctx); };
  alElegir(el.querySelector('#imp-carpeta'));
  alElegir(el.querySelector('#imp-archivos'));
  if (preparados) pintarPrevia(el.querySelector('#imp-previa'), el, ctx);
}

async function procesar(files, el, ctx) {
  const relevantes = files.filter((f) => clasificarArchivo(f.name) !== 'ignorado');
  if (!relevantes.length) { toast('No se encontraron planillas reconocibles en la selección.', true); return; }
  procesando = true;
  render(el, ctx);
  try {
    const X = await cargarSheetJS();
    const out = [];
    for (const f of relevantes) {
      try {
        const libro = X.read(await f.arrayBuffer(), { type: 'array' });
        out.push(await prepararArchivo({ nombre: f.name, lastModified: f.lastModified, libro }, ctx.estado.bases, ctx.p, ctx.hoy));
      } catch (e) {
        out.push({ nombre: f.name, tipo: 'error', error: e.message });
      }
    }
    preparados = out;
  } catch (e) {
    toast(`No se pudo cargar el lector de Excel: ${e.message}`, true);
  } finally {
    procesando = false;
    render(el, ctx);
  }
}

function pintarPrevia(cont, el, ctx) {
  const ok = preparados.filter((x) => x.doc);
  cont.innerHTML = `<h4 style="margin-top:1rem">Vista previa de la conciliación</h4>
  <div class="tabla-wrap libre"><table class="t"><thead><tr><th>Incluir</th><th>Archivo</th><th>Unidad</th><th class="num">Filas</th><th>Conciliación</th><th>Advertencias</th></tr></thead><tbody>
  ${preparados.map((x, i) => (x.error ? `<tr><td></td><td>${esc(x.nombre)}</td><td colspan="4" class="tag alerta">Error: ${esc(x.error)}</td></tr>` : `<tr>
    <td><input type="checkbox" data-incluir="${i}" ${x.sinCambios ? '' : 'checked'} aria-label="Incluir ${esc(x.unidad)}"></td><td class="small">${esc(x.nombre)}</td><td><b>${esc(x.unidad)}</b></td><td class="num">${Object.keys(x.doc.filas).length}</td>
    <td class="small">${x.sinCambios ? 'Sin cambios desde la última importación' : x.conc.primeraCarga ? 'Primera carga' : `Nuevas ${x.conc.nuevos.length} · desaparecidas ${x.conc.desaparecidos.length} · modificadas ${x.conc.modificados.length}`}
      ${x.conc.desaparecidos.length ? `<br>Desaparecidas: ${x.conc.desaparecidos.map(esc).join(', ')}` : ''}
      ${x.conc.detalleCambiado.length ? `<details><summary>⚠ ${x.conc.detalleCambiado.length} compras con detalle muy distinto (posible renumeración)</summary><ul>${x.conc.detalleCambiado.map((d) => `<li><b>${esc(d.id)}</b>: "${esc(d.antes)}" → "${esc(d.despues)}" (similitud ${d.similitud})</li>`).join('')}</ul></details>` : ''}</td>
    <td>${conteo(x.advertencias)}</td></tr>`)).join('')}
  </tbody></table></div>
  <div class="fila" style="margin-top:.6rem"><button class="primario" id="imp-confirmar"${ok.length ? '' : ' disabled'}>Confirmar importación</button><button id="imp-cancelar">Cancelar</button>
    <span class="small muted">Se reemplaza visor_base de cada unidad incluida y se registran las diferencias en el historial. La capa de gestión no se toca.</span></div>`;
  cont.querySelector('#imp-cancelar').onclick = () => { preparados = null; render(el, ctx); };
  cont.querySelector('#imp-confirmar').onclick = async (ev) => {
    const incl = [...cont.querySelectorAll('[data-incluir]')].filter((c) => c.checked).map((c) => preparados[Number(c.dataset.incluir)]);
    if (!incl.length) return toast('No hay planillas seleccionadas.');
    const conDesap = incl.filter((x) => x.conc.desaparecidos.length || x.conc.detalleCambiado.length);
    if (conDesap.length && !confirm(`Hay compras desaparecidas o con detalle muy distinto en: ${conDesap.map((x) => x.unidad).join(', ')}.\nSu gestión y observaciones se conservan con el ID anterior. ¿Continuar?`)) return;
    ev.target.disabled = true;
    try {
      await escribirImportacion(incl.map((x) => ({ slug: x.slug, doc: x.doc, historial: x.historial })));
      toast(`Importadas ${incl.length} planillas.`);
      preparados = null;
      render(el, ctx);
    } catch (e) {
      toast(`Error al guardar: ${e.message}`, true);
      ev.target.disabled = false;
    }
  };
}
