// Calendario y ventanas: línea de tiempo septiembre–diciembre y mapa de calor semanal.
import { lunesDe, sumarDias } from '../logica/habiles.js';
import { esc, fecha, clp } from '../formato.js';
import { activarTooltips } from '../ui.js';
import { colorCalor, tintaCalor } from './graficos.js';

const COLOR = { rojo: 'var(--st-rojo)', amarillo: 'var(--st-amarillo)', verde: 'var(--st-verde)', azul: 'var(--st-azul)', gris: 'var(--st-gris)' };
const FORMA = { rojo: '▲', amarillo: '◆', verde: '●', azul: '●', gris: '○' };

export function render(el, ctx) {
  const p = ctx.p;
  const anio = p.fechaCorteDevengo.slice(0, 4);
  const ini = `${anio}-09-01`;
  const fin = `${anio}-12-31`;
  const dias = (a, b) => (Date.parse(b) - Date.parse(a)) / 86400000;
  const total = dias(ini, fin);
  const W = 1000; const ml = 20; const mr = 20;
  const x = (iso) => ml + (Math.max(0, Math.min(total, dias(ini, iso))) / total) * (W - ml - mr);
  const activas = ctx.calc.filter((c) => c.enTotales && c.v.aplica);
  // Ubicar compras en filas para evitar superposición
  const pos = activas.map((c) => ({ c, x: x(c.v.fechaLimite) })).sort((a, b) => a.x - b.x);
  const carriles = [];
  for (const q of pos) {
    let k = carriles.findIndex((ult) => q.x - ult > 12);
    if (k === -1) { carriles.push(q.x); k = carriles.length - 1; } else carriles[k] = q.x;
    q.k = k;
  }
  const nCarr = Math.min(Math.max(carriles.length, 1), 24);
  const topC = 110;
  const H = topC + nCarr * 14 + 30;
  let svg = `<svg class="grafico" viewBox="0 0 ${W} ${H}" role="img" aria-label="Línea de tiempo de hitos, ventanas y fechas límite">`;
  // meses
  for (const m of ['09', '10', '11', '12']) {
    const d = `${anio}-${m}-01`;
    svg += `<line class="grid" x1="${x(d)}" x2="${x(d)}" y1="0" y2="${H}"/><text x="${x(d) + 4}" y="12">${['Septiembre', 'Octubre', 'Noviembre', 'Diciembre'][Number(m) - 9]}</text>`;
  }
  // hoy y corte
  svg += `<line x1="${x(ctx.hoy)}" x2="${x(ctx.hoy)}" y1="16" y2="${H}" stroke="var(--accent)" stroke-width="2"/><text x="${x(ctx.hoy) + 4}" y="28" style="fill:var(--accent)">Hoy</text>`;
  svg += `<line x1="${x(p.fechaCorteDevengo)}" x2="${x(p.fechaCorteDevengo)}" y1="16" y2="${H}" stroke="var(--st-rojo)" stroke-width="2" stroke-dasharray="5 4"/><text x="${x(p.fechaCorteDevengo) - 4}" y="28" text-anchor="end" style="fill:var(--st-rojo)">Corte devengo</text>`;
  // ventanas institucionales
  (p.ventanas || []).forEach((v, i) => {
    const y = 38 + i * 14;
    svg += `<rect x="${x(ctx.hoy < v.fin ? ctx.hoy : ini)}" y="${y}" width="${Math.max(2, x(v.fin) - x(ctx.hoy < v.fin ? ctx.hoy : ini))}" height="9" rx="4" fill="var(--s3)" opacity=".75" data-tip="${esc(`<b>${esc(v.nombre)}</b><br>Hasta ${fecha(v.fin)}`)}"/>`;
    svg += `<text x="${x(v.fin) + 4}" y="${y + 8}">${esc(v.nombre)}</text>`;
  });
  // hitos
  (p.hitos || []).forEach((h) => {
    svg += `<g data-tip="${esc(`<b>${fecha(h.fecha)}</b><br>${esc(h.nombre)}<br>${esc(h.responsable || '')}`)}" tabindex="0"><line x1="${x(h.fecha)}" x2="${x(h.fecha)}" y1="${topC - 8}" y2="${H - 20}" stroke="var(--s4)" stroke-width="1.5"/>
      <circle cx="${x(h.fecha)}" cy="${topC - 10}" r="5" fill="var(--s4)" stroke="var(--surface)" stroke-width="2"/></g>`;
  });
  // compras por fecha límite
  for (const q of pos) {
    if (q.k >= nCarr) continue;
    const c = q.c;
    const tip = `<b>${esc(c.id)}</b> ${esc(c.detalle || '')}<br>Fecha límite de inicio: ${fecha(c.v.fechaLimite)} (${c.v.margen} días háb.)<br>${esc(c.v.modalidadNombre)} · PAC ${clp(c.m.pac)}`;
    svg += `<text x="${q.x}" y="${topC + q.k * 14 + 4}" text-anchor="middle" style="fill:${COLOR[c.s.color]};font-size:12px" data-tip="${esc(tip)}" tabindex="0">${FORMA[c.s.color]}</text>`;
  }
  svg += `<text x="${ml}" y="${H - 6}">Cada símbolo es una compra en etapa 0–1 ubicada en su fecha límite para iniciar (▲ rojo · ◆ amarillo · ● verde).</text></svg>`;

  // mapa de calor semanal
  const semanas = [];
  for (let d = lunesDe(ini); d <= fin; d = sumarDias(d, 7)) semanas.push(d);
  const conteo = Object.fromEntries(semanas.map((s) => [s, { n: 0, monto: 0, ids: [] }]));
  for (const c of activas) {
    const w = lunesDe(c.v.fechaLimite);
    if (conteo[w]) { conteo[w].n += 1; conteo[w].monto += c.m.pac; conteo[w].ids.push(c.id); }
  }
  const max = Math.max(0, ...Object.values(conteo).map((v) => v.n));
  const umbral = p.umbralProcesosSemana;
  const vencidas = activas.filter((c) => c.v.margen < 0);
  el.innerHTML = `<h2>Calendario y ventanas</h2>
  <div class="tarjeta"><h3>Línea de tiempo septiembre–diciembre</h3>${svg}
    <div class="leyenda"><span><i style="background:var(--s3)"></i>Ventanas institucionales</span><span><i style="background:var(--s4)"></i>Hitos</span><span><i style="background:var(--accent)"></i>Hoy</span></div>
    ${carriles.length > nCarr ? `<p class="small muted">Se muestran ${nCarr} filas de compras; use el mapa semanal para el total.</p>` : ''}</div>
  <div class="tarjeta" style="margin-top:1rem"><h3>Procesos que deben iniciarse por semana</h3>
    <div class="tabla-wrap libre"><table class="t calor"><thead><tr><th>Semana del</th>${semanas.map((s) => `<th class="num">${fecha(s).slice(0, 5)}</th>`).join('')}</tr></thead>
    <tbody><tr><td>Compras</td>${semanas.map((s) => { const v = conteo[s]; return `<td class="celda" style="background:${colorCalor(v.n, max)};color:${tintaCalor(v.n, max)}${v.n > umbral ? ';box-shadow:inset 0 0 0 2px var(--st-rojo)' : ''}" data-tip="${esc(`<b>Semana del ${fecha(s)}</b><br>${v.n} compras · PAC ${clp(v.monto)}${v.ids.length ? `<br>${v.ids.slice(0, 12).map(esc).join(', ')}` : ''}`)}" tabindex="0">${v.n || ''}</td>`; }).join('')}</tr></tbody></table></div>
    <p class="small muted">Recuadro rojo: más de ${umbral} procesos en la semana (cuello de botella en jurídica, comisiones y firma). ${vencidas.length} compras en etapa 0–1 ya tienen la ventana vencida.</p></div>
  <div class="tarjeta" style="margin-top:1rem"><h3>Hitos internos</h3><table class="t"><thead><tr><th>Fecha</th><th>Hito</th><th>Responsable</th></tr></thead><tbody>
    ${(p.hitos || []).map((h) => `<tr${h.fecha < ctx.hoy ? ' class="muted"' : ''}><td class="nowrap">${fecha(h.fecha)}</td><td>${esc(h.nombre)}</td><td>${esc(h.responsable || '')}</td></tr>`).join('')}</tbody></table></div>`;
  activarTooltips(el);
}
