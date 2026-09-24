// Bitácora de contactos con proveedores y compras desiertas sin contacto registrado.
import { esc, fecha } from '../formato.js';
import { nombreRol, semaforo } from '../ui.js';

export function render(el, ctx) {
  const nombreDe = (em) => ctx.estado.rolesDoc?.usuarios?.[em]?.nombre || em;
  const contactos = [...ctx.estado.contactos].sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || '')));
  const conContacto = new Set(contactos.map((c) => c.compraId));
  const sinContacto = ctx.calc.filter((c) => c.et.detalle === 'desierta' && !conContacto.has(c.id) && !c.g.compras_contactoRealizado);
  el.innerHTML = `<h2>Proveedores</h2>
  <div class="tarjeta"><h3>Compras desiertas o sin ofertas sin contacto registrado (${sinContacto.length})</h3>
    ${sinContacto.length ? `<table class="t"><thead><tr><th>ID</th><th>Unidad</th><th>Detalle</th><th>Llamado</th><th>Semáforo</th></tr></thead><tbody>
    ${sinContacto.map((c) => `<tr><td><button class="chico" data-abrir="${esc(c.id)}">${esc(c.id)}</button></td><td>${esc(c.unidad)}</td><td>${esc(c.detalle)}</td><td>${esc(c.g.compras_nLlamado || 1)}°</td><td>${semaforo(c.s.color)}</td></tr>`).join('')}</tbody></table>`
    : '<p class="small muted">No hay compras desiertas sin contacto.</p>'}</div>
  <div class="tarjeta" style="margin-top:1rem"><h3>Bitácora de contactos (${contactos.length})</h3>
    <p class="small muted">Cualquier rol editor puede registrar contactos desde el detalle de cada compra.</p>
    ${contactos.length ? `<div class="tabla-wrap"><table class="t"><thead><tr><th>Fecha</th><th>Compra</th><th>Medio</th><th>Proveedor</th><th>RUT</th><th>Llamado</th><th>Resultado</th><th>Próxima acción</th><th>Registró</th></tr></thead><tbody>
    ${contactos.map((x) => `<tr><td class="nowrap">${fecha(x.fecha)}</td><td><button class="chico" data-abrir="${esc(x.compraId)}">${esc(x.compraId)}</button></td><td>${esc(x.medio)}</td><td>${esc(x.proveedor)}</td><td>${esc(x.rut)}</td><td>${esc(x.nLlamado)}</td><td>${esc(x.resultado)}</td><td>${esc(x.proximaAccion)}</td><td>${esc(nombreDe(x.registradoPor))} (${esc(nombreRol(x.rol))})</td></tr>`).join('')}
    </tbody></table></div>` : '<p class="small muted">Sin contactos registrados.</p>'}</div>`;
  el.querySelectorAll('[data-abrir]').forEach((b) => { b.onclick = () => ctx.abrirDetalle(b.dataset.abrir); });
}
