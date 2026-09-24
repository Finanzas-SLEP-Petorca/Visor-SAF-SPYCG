// Planilla en línea: una fila por compra, filtros, edición en la celda para el rol conectado.
import { estado, guardarGestion } from '../datos.js';
import { puedeEscribir } from '../roles.js';
import { ESTADOS_PROCESO, ESTADOS_GENERALES, MODALIDADES, ROLES_OBS, ROLES } from '../parametros-default.js';
import { ETAPAS, repartirPorFuente } from '../logica/motor.js';
import { MESES } from '../util.js';
import { esc, clp, fecha, fechaDe, pct } from '../formato.js';
import { semaforo, etapa, opciones, toast, ordenar, activarTooltips, fuenteCifra, activarScrollSuperior } from '../ui.js';
import { exportarExcel, exportarCSV } from './exportar.js';

const f = {
  unidad: '', subdir: '', programa: '', subtitulo: '', fuente: '', modalidad: '', etapa: '', semaforo: '', ventana: '', texto: '',
};
let orden = { k: 'id', dir: 1 };
let doceMeses = false;
/** Compras marcadas para exportar (se conservan al filtrar u ordenar). */
const seleccion = new Set();

const fuentesDe = (c) => Object.keys(repartirPorFuente(c, 1));
const ventanaEstado = (c) => (!c.v.aplica ? 'na' : c.v.margen < 0 ? 'vencida' : c.v.margen <= 10 ? 'proxima' : 'ok');

export function filtrar(ctx) {
  const mapa = ctx.p.mapaSubdireccion || {};
  const t = f.texto.trim().toLowerCase();
  return ctx.calc.filter((c) => (!f.unidad || c.unidad === f.unidad)
    && (!f.subdir || (mapa[c.unidad] || 'Sin asignar') === f.subdir)
    && (!f.programa || c.programa === f.programa)
    && (!f.subtitulo || c.subtitulo === f.subtitulo)
    && (!f.fuente || fuentesDe(c).includes(f.fuente))
    && (!f.modalidad || c.v.modalidad === f.modalidad)
    && (!f.etapa || String(c.et.etapa) === f.etapa)
    && (!f.semaforo || c.s.color === f.semaforo)
    && (!f.ventana || ventanaEstado(c) === f.ventana)
    && (!t || `${c.id} ${c.detalle} ${c.asignacion} ${c.ocs.join(' ')} ${c.obsUnidad || ''}`.toLowerCase().includes(t)));
}

const CLAVES_ORDEN = {
  id: (c) => c.id, unidad: (c) => c.unidad, pac: (c) => c.m.pac, adj: (c) => c.m.adjudicado, real: (c) => c.m.real,
  pct: (c) => (c.m.pac ? c.m.real / c.m.pac : -1), etapa: (c) => (c.et.etapa === 'X' ? 9 : c.et.etapa),
  margen: (c) => (c.v.aplica ? c.v.margen : 9999), sem: (c) => ({ rojo: 0, amarillo: 1, verde: 2, azul: 3, gris: 4 }[c.s.color]),
  oct: (c) => c.desglose?.OCT || 0, nov: (c) => c.desglose?.NOV || 0, dic: (c) => c.desglose?.DIC || 0, detalle: (c) => c.detalle,
};

function celdaEditable(c, campo, contenido) {
  return puedeEscribir(estado.rol, campo) ? `<td class="editable" data-campo="${campo}">${contenido}</td>` : null;
}

function filaHTML(c, ctx) {
  const g = c.g;
  const rec = estado.recientes[c.id];
  const flash = rec && Date.now() - rec.t < 4000;
  const nombreDe = (em) => estado.rolesDoc?.usuarios?.[em]?.nombre || em;
  const meses = doceMeses ? MESES : ['OCT', 'NOV', 'DIC'];
  const mc = ctx.p.mesCorte;
  const estProc = celdaEditable(c, 'compras_estadoProceso', `<select aria-label="Estado del proceso">${opciones(ESTADOS_PROCESO, g.compras_estadoProceso)}</select>`)
    || `<td>${esc(g.compras_estadoProceso || (c.et.texto && c.et.marca !== 'confirmado' ? `${c.et.texto} (sugerido)` : '—'))}</td>`;
  const estGen = celdaEditable(c, 'direccion_estadoGeneral', `<select aria-label="Estado general">${opciones(ESTADOS_GENERALES, g.direccion_estadoGeneral)}</select>`)
    || `<td>${esc(g.direccion_estadoGeneral || '—')}</td>`;
  const modal = celdaEditable(c, 'compras_modalidad', `<select aria-label="Modalidad">${opciones(MODALIDADES.map((m) => [m.key, m.nombre]), g.compras_modalidad, c.tipoTexto ? `(${c.tipoTexto})` : 'Sin definir')}</select>`)
    || `<td>${esc(g.compras_modalidad ? MODALIDADES.find((m) => m.key === g.compras_modalidad)?.nombre : c.tipoTexto || 'Sin definir')}</td>`;
  const devengado = celdaEditable(c, 'finanzas_devengadoSigfe', `<input type="number" aria-label="Devengado SIGFE" value="${g.finanzas_devengadoSigfe ?? ''}" placeholder="${c.m.real}" style="width:9em">`)
    || `<td class="num">${clp(c.m.real)}${c.m.fuenteReal === 'planilla' ? '<span class="small muted" title="según planilla"> ᴾ</span>' : ''}</td>`;
  const accion = celdaEditable(c, 'presupuesto_accion', `<select aria-label="Acción presupuestaria">${opciones([['mantener', 'Mantener'], ['liberar', 'Liberar'], ['reasignar', 'Reasignar']], g.presupuesto_accion)}</select>`);
  const obs = ROLES_OBS.map((r) => {
    const o = g[`obs_${r}`];
    return `<td class="obs-celda" data-tip="${esc(o ? `<b>${esc(ROLES[r])}</b><br>${esc(o.texto)}` : '')}">${o ? `${esc(o.texto.length > 70 ? `${o.texto.slice(0, 70)}…` : o.texto)}<div class="autor">${esc(nombreDe(o.autor))} · ${fechaDe(o.fecha)}</div>` : '<span class="muted">—</span>'}</td>`;
  }).join('');
  const contactos = ctx.estado.contactos.filter((x) => x.compraId === c.id);
  const ultC = contactos.map((x) => x.fecha).filter(Boolean).sort().pop() || g.compras_fechaUltimoContacto;
  const tieneC = contactos.length > 0 || g.compras_contactoRealizado;
  const motivos = c.s.motivos.map((m) => esc(m.texto)).join('<br>');
  const sel = seleccion.has(c.id);
  return `<tr data-id="${esc(c.id)}" class="${flash ? 'flash' : ''}${sel ? ' sel' : ''}">
    <td class="col-fija nowrap"><input type="checkbox" class="chk-sel" data-sel="${esc(c.id)}"${sel ? ' checked' : ''} aria-label="Seleccionar ${esc(c.id)}"> <button class="chico" data-abrir="${esc(c.id)}" title="Abrir detalle">${esc(c.id)}</button>${flash ? `<span class="editado-por">editado por ${esc(nombreDe(rec.por))}</span>` : ''}</td>
    <td>${esc(c.unidad)}</td><td>${esc(c.programa || '')}</td><td>${esc(c.subtitulo || '')}</td><td>${esc(c.asignacion || '')}</td>
    <td class="detalle-celda">${esc(c.detalle || '')}${c.vinculo ? ' <span class="tag" title="Vinculada a otro origen por OC">🔗</span>' : ''}</td>
    <td>${fuentesDe(c).map((x) => `<span class="tag">${esc(x)}</span>`).join('')}</td>
    ${modal}
    <td class="num">${clp(c.m.pac)}</td><td class="num">${clp(c.m.adjudicado)}</td>${devengado}
    <td class="num">${pct(c.m.pac ? c.m.real / c.m.pac : NaN)}</td>
    <td>${etapa(c.et)}</td>${estProc}${estGen}
    <td class="nowrap">${c.v.aplica ? `${fecha(c.v.fechaLimite)}<br><span class="small ${c.v.margen < 0 ? '' : 'muted'}">${c.v.margen < 0 ? `vencida (${c.v.margen})` : `${c.v.margen} días háb.`}</span>` : '<span class="muted small">n/a</span>'}${c.v.ventanaAsignada ? `<br><span class="small">${esc(c.v.ventanaAsignada.nombre)}</span>` : ''}</td>
    ${meses.map((m) => `<td class="num ${MESES.indexOf(m) < mc ? 'mes-real' : 'mes-proy'}">${c.desglose ? clp(c.desglose[m]) : '—'}</td>`).join('')}
    <td data-tip="${esc(motivos || 'Sin alertas')}">${semaforo(c.s.color)}${c.s.etiqueta ? `<div class="small">${esc(c.s.etiqueta)}</div>` : ''}</td>
    ${obs}
    <td class="nowrap">${tieneC ? `Sí${ultC ? ` · ${fecha(ultC)}` : ''}` : 'No'}</td>
    ${accion || `<td>${esc(g.presupuesto_accion || '')}</td>`}
  </tr>`;
}

export function render(el, ctx) {
  const lista = ordenar(filtrar(ctx), CLAVES_ORDEN[orden.k] || CLAVES_ORDEN.id, orden.dir);
  const uniq = (fn) => [...new Set(ctx.calc.map(fn).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), 'es', { numeric: true }));
  const meses = doceMeses ? MESES : ['OCT', 'NOV', 'DIC'];
  const th = (k, t, cls = '') => `<th${k ? ` data-orden="${k}"` : ''} class="${cls}">${t}${orden.k === k ? (orden.dir > 0 ? ' ▲' : ' ▼') : ''}</th>`;
  const tot = lista.filter((c) => c.enTotales).reduce((a, c) => ({ pac: a.pac + c.m.pac, adj: a.adj + c.m.adjudicado, real: a.real + c.m.real }), { pac: 0, adj: 0, real: 0 });
  el.innerHTML = `
  <div class="fila no-imprimir" style="margin-bottom:.5rem"><h2 style="margin:0">Planilla en línea</h2><div class="espacio"></div>
    <label class="small"><input type="checkbox" id="pl-12"${doceMeses ? ' checked' : ''}> 12 meses</label>
    <button id="pl-xlsx" title="Exporta todas las compras que muestra el filtro">Exportar Excel</button><button id="pl-csv" title="Exporta todas las compras que muestra el filtro">Exportar CSV</button></div>
  <div id="pl-barra-sel" class="barra-sel no-imprimir"></div>
  <div class="filtros">
    <label>Unidad<select data-f="unidad">${opciones(uniq((c) => c.unidad), f.unidad, 'Todas')}</select></label>
    <label>Subdirección<select data-f="subdir">${opciones([...new Set([...Object.values(ctx.p.mapaSubdireccion || {}), 'Sin asignar'])], f.subdir, 'Todas')}</select></label>
    <label>Programa<select data-f="programa">${opciones(uniq((c) => c.programa), f.programa, 'Todos')}</select></label>
    <label>Subtítulo<select data-f="subtitulo">${opciones(uniq((c) => c.subtitulo), f.subtitulo, 'Todos')}</select></label>
    <label>Fuente<select data-f="fuente">${opciones(ctx.p.listas.fuentes, f.fuente, 'Todas')}</select></label>
    <label>Modalidad<select data-f="modalidad">${opciones(MODALIDADES.map((m) => [m.key, m.nombre]), f.modalidad, 'Todas')}</select></label>
    <label>Etapa<select data-f="etapa">${opciones(Object.entries(ETAPAS).map(([k, v]) => [k, `${k} · ${v}`]), f.etapa, 'Todas')}</select></label>
    <label>Semáforo<select data-f="semaforo">${opciones([['rojo', 'Rojo'], ['amarillo', 'Amarillo'], ['verde', 'Verde'], ['azul', 'Ejecutada'], ['gris', 'Desistida']], f.semaforo, 'Todos')}</select></label>
    <label>Ventana<select data-f="ventana">${opciones([['vencida', 'Vencida'], ['proxima', 'Por vencer (≤10 días)'], ['ok', 'Con margen'], ['na', 'No aplica']], f.ventana, 'Todas')}</select></label>
    <label>Buscar<input type="search" data-f="texto" value="${esc(f.texto)}" placeholder="ID, detalle, OC…"></label>
    <button class="chico" id="pl-limpiar">Limpiar filtros</button>
  </div>
  <div class="small muted" style="margin-bottom:.4rem">${lista.length} de ${ctx.calc.length} compras · totales sin SEP (solo seguimiento): PAC ${clp(tot.pac)} · Adjudicado/OC ${clp(tot.adj)} · Devengado ${clp(tot.real)}
    ${estado.rol ? ' · Las celdas amarillas son editables por su rol' : ''}</div>
  <div class="tabla-wrap"><table class="t" id="tabla-planilla"><thead><tr>
    <th class="col-fija nowrap"><input type="checkbox" id="pl-sel-todas" title="Seleccionar todas las compras filtradas" aria-label="Seleccionar todas las compras filtradas"> <span data-orden="id" style="cursor:pointer">ID${orden.k === 'id' ? (orden.dir > 0 ? ' ▲' : ' ▼') : ''}</span></th>${th('unidad', 'Unidad')}<th>Prog.</th><th>Subt.</th><th>Asig.</th>${th('detalle', 'Detalle')}<th>Fuente(s)</th><th>Modalidad</th>
    ${th('pac', 'PAC', 'num')}${th('adj', 'Adjudicado/OC', 'num')}${th('real', 'Devengado', 'num')}${th('pct', '% ejec.', 'num')}
    ${th('etapa', 'Etapa')}<th>Estado proceso</th><th>Estado general</th>${th('margen', 'Ventana')}
    ${meses.map((m) => th(['OCT', 'NOV', 'DIC'].includes(m) ? m.toLowerCase() : null, m, 'num')).join('')}
    ${th('sem', 'Semáforo')}${ROLES_OBS.map((r) => `<th>Obs. ${esc(ROLES[r])}</th>`).join('')}<th>Contacto</th><th>Acción ppto.</th>
  </tr></thead><tbody>${lista.map((c) => filaHTML(c, ctx)).join('')}</tbody></table></div>
  ${fuenteCifra(ctx, 'ᴾ = devengado según planilla, sin SIGFE')}`;

  el.querySelectorAll('[data-f]').forEach((i) => {
    const ev = i.tagName === 'INPUT' ? 'input' : 'change';
    i.addEventListener(ev, () => {
      f[i.dataset.f] = i.value;
      if (ev === 'input') { clearTimeout(i._t); i._t = setTimeout(() => { render(el, ctx); const n = el.querySelector('[data-f="texto"]'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 250); } else render(el, ctx);
    });
  });
  el.querySelector('#pl-limpiar').onclick = () => { Object.keys(f).forEach((k) => { f[k] = ''; }); render(el, ctx); };
  el.querySelector('#pl-12').onchange = (e) => { doceMeses = e.target.checked; render(el, ctx); };
  // ---- selección para exportar
  const barraSel = () => {
    const b = el.querySelector('#pl-barra-sel');
    const n = seleccion.size;
    const visibles = lista.filter((c) => seleccion.has(c.id)).length;
    b.innerHTML = n ? `<b>${n}</b> ${n === 1 ? 'compra seleccionada' : 'compras seleccionadas'}${visibles < n ? ` <span class="muted">(${n - visibles} fuera del filtro actual)</span>` : ''}
      <button class="chico primario" id="pl-sel-xlsx">Exportar selección a Excel</button><button class="chico" id="pl-sel-csv">Exportar selección a CSV</button>
      <button class="chico" id="pl-sel-limpiar">Quitar selección</button>` : '<span class="muted small">Marque las casillas de la columna ID para exportar solo algunas compras.</span>';
    const todas = el.querySelector('#pl-sel-todas');
    todas.checked = lista.length > 0 && lista.every((c) => seleccion.has(c.id));
    todas.indeterminate = !todas.checked && lista.some((c) => seleccion.has(c.id));
    if (!n) return;
    const elegidas = () => ctx.calc.filter((c) => seleccion.has(c.id));
    b.querySelector('#pl-sel-xlsx').onclick = () => exportarExcel(elegidas(), ctx, 'seleccion').catch((e) => toast(e.message, true));
    b.querySelector('#pl-sel-csv').onclick = () => exportarCSV(elegidas(), ctx, 'seleccion');
    b.querySelector('#pl-sel-limpiar').onclick = () => {
      seleccion.clear();
      el.querySelectorAll('[data-sel]').forEach((x) => { x.checked = false; x.closest('tr').classList.remove('sel'); });
      barraSel();
    };
  };
  barraSel();
  el.querySelector('tbody').addEventListener('change', (e) => {
    const chk = e.target.closest('[data-sel]');
    if (!chk) return;
    if (chk.checked) seleccion.add(chk.dataset.sel); else seleccion.delete(chk.dataset.sel);
    chk.closest('tr').classList.toggle('sel', chk.checked);
    barraSel();
  });
  el.querySelector('#pl-sel-todas').onchange = (e) => {
    for (const c of lista) { if (e.target.checked) seleccion.add(c.id); else seleccion.delete(c.id); }
    el.querySelectorAll('[data-sel]').forEach((x) => { x.checked = e.target.checked; x.closest('tr').classList.toggle('sel', e.target.checked); });
    barraSel();
  };

  el.querySelectorAll('[data-orden]').forEach((h) => {
    h.onclick = () => { const k = h.dataset.orden; orden = { k, dir: orden.k === k ? -orden.dir : 1 }; render(el, ctx); };
  });
  el.querySelector('tbody').addEventListener('click', (e) => {
    const b = e.target.closest('[data-abrir]');
    if (b) ctx.abrirDetalle(b.dataset.abrir);
  });
  el.querySelector('tbody').addEventListener('change', async (e) => {
    const td = e.target.closest('td.editable');
    if (!td || e.target.matches('[data-sel]')) return;
    const id = td.closest('tr').dataset.id;
    const campo = td.dataset.campo;
    let v = e.target.value;
    if (e.target.type === 'number') v = v === '' ? null : Math.round(Number(v));
    else if (v === '') v = null;
    try { await guardarGestion(id, { [campo]: v }); toast(`${id}: guardado`); } catch (err) { toast(`No se pudo guardar: ${err.message}`, true); }
  });
  el.querySelector('#pl-xlsx').onclick = () => exportarExcel(lista, ctx).catch((e) => toast(e.message, true));
  el.querySelector('#pl-csv').onclick = () => exportarCSV(lista, ctx);
  activarTooltips(el);
  activarScrollSuperior(el);
}
