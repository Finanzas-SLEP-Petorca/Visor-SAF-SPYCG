// Observaciones separadas por rol, filtrables por fecha, unidad y compra.
import { leerObservaciones } from '../datos.js';
import { ROLES_OBS, ROLES } from '../parametros-default.js';
import { esc, fechaHora, aDate } from '../formato.js';
import { opciones, toast } from '../ui.js';

let cache = null;
let cargando = false;
const f = { rol: 'todos', unidad: '', desde: '', hasta: '', compra: '' };

export function render(el, ctx) {
  if (!cache && !cargando) {
    cargando = true;
    leerObservaciones(1000).then((r) => { cache = r; cargando = false; render(el, ctx); })
      .catch((e) => { cargando = false; toast(e.message, true); });
  }
  const lista = (cache || []).filter((o) => {
    const c = ctx.porId[o.compraId];
    const d = aDate(o.createdAt);
    const iso = d ? d.toISOString().slice(0, 10) : '';
    return (f.rol === 'todos' || o.rol === f.rol) && (!f.unidad || c?.unidad === f.unidad)
      && (!f.desde || iso >= f.desde) && (!f.hasta || iso <= f.hasta)
      && (!f.compra || `${o.compraId} ${c?.detalle || ''}`.toLowerCase().includes(f.compra.toLowerCase()));
  });
  const unidades = [...new Set(ctx.calc.map((c) => c.unidad))].sort();
  el.innerHTML = `<div class="fila"><h2 style="margin:0">Observaciones por rol</h2><div class="espacio"></div><button id="ob-rec">Recargar</button></div>
  <div class="subpestanas" style="margin-top:.5rem">${[['todos', 'Todas'], ...ROLES_OBS.map((r) => [r, ROLES[r]])].map(([k, t]) => `<button data-rol="${k}" aria-pressed="${f.rol === k}">${esc(t)}</button>`).join('')}</div>
  <div class="filtros">
    <label>Unidad<select data-f="unidad">${opciones(unidades, f.unidad, 'Todas')}</select></label>
    <label>Desde<input type="date" data-f="desde" value="${f.desde}"></label>
    <label>Hasta<input type="date" data-f="hasta" value="${f.hasta}"></label>
    <label>Compra<input type="search" data-f="compra" value="${esc(f.compra)}" placeholder="ID o detalle"></label>
  </div>
  ${!cache ? '<p class="muted">Cargando…</p>' : `<p class="small muted">${lista.length} observaciones (se muestran las últimas 1.000). Las observaciones no se editan ni se borran.</p>
  <div class="tabla-wrap"><table class="t"><thead><tr><th>Fecha</th><th>Rol</th><th>Autor</th><th>Compra</th><th>Unidad</th><th>Observación</th></tr></thead><tbody>
  ${lista.map((o) => { const c = ctx.porId[o.compraId]; return `<tr><td class="nowrap">${fechaHora(o.createdAt)}</td><td>${esc(ROLES[o.rol] || o.rol)}</td><td>${esc(o.autorNombre || o.autorEmail)}</td>
    <td><button class="chico" data-abrir="${esc(o.compraId)}">${esc(o.compraId)}</button></td><td>${esc(c?.unidad || '')}</td><td style="white-space:pre-wrap">${esc(o.texto)}</td></tr>`; }).join('')}
  </tbody></table></div>`}`;
  el.querySelectorAll('[data-rol]').forEach((b) => { b.onclick = () => { f.rol = b.dataset.rol; render(el, ctx); }; });
  el.querySelectorAll('[data-f]').forEach((i) => { i.onchange = () => { f[i.dataset.f] = i.value; render(el, ctx); }; });
  el.querySelectorAll('[data-abrir]').forEach((b) => { b.onclick = () => ctx.abrirDetalle(b.dataset.abrir); });
  el.querySelector('#ob-rec').onclick = () => { cache = null; render(el, ctx); };
}
