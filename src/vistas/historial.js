// Historial completo de cambios (quién, qué, cuándo, antes y después).
import { leerHistorial } from '../datos.js';
import { esc, fechaHora } from '../formato.js';
import { opciones, toast } from '../ui.js';

let cache = null;
let cargando = false;
const f = { tipo: '', autor: '', texto: '' };

const corto = (v) => { const s = JSON.stringify(v ?? null); return s.length > 140 ? `${s.slice(0, 140)}…` : s; };

export function render(el, ctx) {
  if (!cache && !cargando) {
    cargando = true;
    leerHistorial(1000).then((r) => { cache = r; cargando = false; render(el, ctx); }).catch((e) => { cargando = false; toast(e.message, true); });
  }
  const nombreDe = (em) => ctx.estado.rolesDoc?.usuarios?.[em]?.nombre || em;
  const t = f.texto.toLowerCase();
  const lista = (cache || []).filter((h) => (!f.tipo || h.tipo === f.tipo) && (!f.autor || h.autor === f.autor)
    && (!t || `${h.compraId || ''} ${h.campo || ''}`.toLowerCase().includes(t)));
  const autores = [...new Set((cache || []).map((h) => h.autor))].map((a) => [a, nombreDe(a)]);
  el.innerHTML = `<div class="fila"><h2 style="margin:0">Historial</h2><div class="espacio"></div><button id="hi-rec">Recargar</button></div>
  <div class="filtros" style="margin-top:.5rem">
    <label>Tipo<select data-f="tipo">${opciones([['gestion', 'Gestión'], ['sync', 'Sincronización'], ['config', 'Configuración']], f.tipo, 'Todos')}</select></label>
    <label>Autor<select data-f="autor">${opciones(autores, f.autor, 'Todos')}</select></label>
    <label>Compra o campo<input type="search" data-f="texto" value="${esc(f.texto)}"></label>
  </div>
  ${!cache ? '<p class="muted">Cargando…</p>' : `<p class="small muted">${lista.length} registros (últimos 1.000). El historial no se puede modificar.</p>
  <div class="tabla-wrap"><table class="t"><thead><tr><th>Fecha</th><th>Tipo</th><th>Compra</th><th>Campo</th><th>Antes</th><th>Después</th><th>Autor</th><th>Origen</th></tr></thead><tbody>
  ${lista.map((h) => `<tr><td class="nowrap">${fechaHora(h.createdAt)}</td><td>${esc(h.tipo)}</td><td>${h.compraId ? `<button class="chico" data-abrir="${esc(h.compraId)}">${esc(h.compraId)}</button>` : '—'}</td>
    <td>${esc(h.campo)}</td><td class="small">${esc(corto(h.antes))}</td><td class="small">${esc(corto(h.despues))}</td><td>${esc(nombreDe(h.autor))}</td><td class="small">${esc(h.origen || '')}</td></tr>`).join('')}
  </tbody></table></div>`}`;
  el.querySelectorAll('[data-f]').forEach((i) => { i.onchange = () => { f[i.dataset.f] = i.value; render(el, ctx); }; });
  el.querySelectorAll('[data-abrir]').forEach((b) => { b.onclick = () => ctx.abrirDetalle(b.dataset.abrir); });
  el.querySelector('#hi-rec').onclick = () => { cache = null; render(el, ctx); };
}
