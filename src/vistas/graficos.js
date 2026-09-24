// Gráficos SVG livianos (sin librerías). Un solo eje Y, líneas de 2px, tooltip por mes,
// etiquetas directas al final de cada serie, leyenda y tabla alternativa.
import { esc, clp, clpCorto } from '../formato.js';

function escala(max) {
  if (max <= 0) return { tope: 1, paso: 1 };
  const bruto = max / 4;
  const p10 = 10 ** Math.floor(Math.log10(bruto));
  const paso = [1, 2, 2.5, 5, 10].map((m) => m * p10).find((x) => x >= bruto);
  return { tope: Math.ceil(max / paso) * paso, paso };
}

/**
 * @param {{etiquetas: string[], series: {nombre, color, valores: number[], discontinua?: boolean}[], alto?: number}} o
 */
export function lineas(o) {
  const W = 760; const H = o.alto || 280; const ml = 86; const mr = 110; const mt = 12; const mb = 28;
  const n = o.etiquetas.length;
  const max = Math.max(0, ...o.series.flatMap((s) => s.valores));
  const { tope, paso } = escala(max);
  const x = (i) => ml + (i * (W - ml - mr)) / Math.max(1, n - 1);
  const y = (v) => mt + (H - mt - mb) * (1 - v / tope);
  let svg = `<svg class="grafico" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.titulo || 'Gráfico de líneas')}">`;
  for (let v = 0; v <= tope + 1e-9; v += paso) {
    svg += `<line class="${v === 0 ? 'eje' : 'grid'}" x1="${ml}" x2="${W - mr}" y1="${y(v)}" y2="${y(v)}"/>`;
    svg += `<text x="${ml - 6}" y="${y(v) + 4}" text-anchor="end">${esc(clpCorto(v))}</text>`;
  }
  o.etiquetas.forEach((e, i) => { svg += `<text x="${x(i)}" y="${H - 8}" text-anchor="middle">${esc(e)}</text>`; });
  const finales = [];
  for (const s of o.series) {
    let d = '';
    let pluma = false;
    s.valores.forEach((v, i) => {
      if (v === null) { pluma = false; return; }
      d += `${pluma ? 'L' : 'M'}${x(i)},${y(v)}`;
      pluma = true;
    });
    svg += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"${s.discontinua ? ' stroke-dasharray="6 4"' : ''}/>`;
    const ult = s.valores.map((v, i) => [v, i]).filter(([v]) => v !== null).pop();
    if (ult) finales.push({ s, yv: y(ult[0]), xv: x(ult[1]), v: ult[0] });
  }
  // etiquetas directas sin superponerse
  finales.sort((a, b) => a.yv - b.yv);
  let prev = -Infinity;
  for (const f of finales) {
    const yy = Math.max(f.yv, prev + 13);
    prev = yy;
    svg += `<circle cx="${f.xv}" cy="${f.yv}" r="4" fill="${f.s.color}" stroke="var(--surface)" stroke-width="2"/>`;
    svg += `<text x="${f.xv + 8}" y="${yy + 4}" style="fill:var(--ink-2)">${esc(f.s.nombre)}</text>`;
  }
  // zonas de hover por mes
  const ancho = (W - ml - mr) / Math.max(1, n - 1);
  o.etiquetas.forEach((e, i) => {
    const tip = `<b>${esc(e)}</b><br>${o.series.map((s) => (s.valores[i] === null ? '' : `${esc(s.nombre)}: ${clp(s.valores[i])}`)).filter(Boolean).join('<br>')}`;
    svg += `<rect x="${x(i) - ancho / 2}" y="${mt}" width="${ancho}" height="${H - mt - mb}" fill="transparent" data-tip="${esc(tip)}" tabindex="0"/>`;
  });
  svg += '</svg>';
  const leyenda = `<div class="leyenda">${o.series.map((s) => `<span><i class="${s.discontinua ? 'discontinua' : ''}" style="background:${s.color};color:${s.color}"></i>${esc(s.nombre)}</span>`).join('')}</div>`;
  const tabla = `<details class="small"><summary>Ver tabla</summary><div class="tabla-wrap libre"><table class="t"><thead><tr><th>Serie</th>${o.etiquetas.map((e) => `<th class="num">${esc(e)}</th>`).join('')}</tr></thead><tbody>${
    o.series.map((s) => `<tr><td>${esc(s.nombre)}</td>${s.valores.map((v) => `<td class="num">${v === null ? '—' : clp(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details>`;
  return leyenda + svg + tabla;
}

/** Barras verticales de una serie. */
export function barras(o) {
  const W = 520; const H = o.alto || 220; const ml = 64; const mr = 10; const mt = 16; const mb = 28;
  const max = Math.max(0, ...o.valores);
  const { tope, paso } = escala(max);
  const n = o.valores.length;
  const bw = (W - ml - mr) / n;
  const y = (v) => mt + (H - mt - mb) * (1 - v / tope);
  const fmt = o.formato || clpCorto;
  let svg = `<svg class="grafico" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.titulo || 'Gráfico de barras')}">`;
  for (let v = 0; v <= tope + 1e-9; v += paso) {
    svg += `<line class="${v === 0 ? 'eje' : 'grid'}" x1="${ml}" x2="${W - mr}" y1="${y(v)}" y2="${y(v)}"/>`;
    svg += `<text x="${ml - 6}" y="${y(v) + 4}" text-anchor="end">${esc(fmt(v))}</text>`;
  }
  o.valores.forEach((v, i) => {
    const x0 = ml + i * bw + 3;
    const w = Math.max(2, bw - 6);
    const h = Math.max(0, y(0) - y(v));
    const r = Math.min(4, w / 2, h);
    const top = y(v);
    const path = h > 0 ? `M${x0},${y(0)}V${top + r}Q${x0},${top} ${x0 + r},${top}H${x0 + w - r}Q${x0 + w},${top} ${x0 + w},${top + r}V${y(0)}Z` : '';
    const color = (o.colores && o.colores[i]) || o.color || 'var(--s1)';
    const tip = `<b>${esc(o.etiquetas[i])}</b><br>${esc(o.nombre || '')} ${esc(fmt === clpCorto ? clp(v) : fmt(v))}${o.extra ? `<br>${esc(o.extra[i])}` : ''}`;
    if (path) svg += `<path d="${path}" fill="${color}"/>`;
    if (o.etiquetasValor) svg += `<text x="${x0 + w / 2}" y="${top - 4}" text-anchor="middle" style="fill:var(--ink-2)">${esc(fmt(v))}</text>`;
    svg += `<rect x="${ml + i * bw}" y="${mt}" width="${bw}" height="${H - mt - mb}" fill="transparent" data-tip="${esc(tip)}" tabindex="0"/>`;
    svg += `<text x="${x0 + w / 2}" y="${H - 8}" text-anchor="middle">${esc(o.etiquetas[i])}</text>`;
  });
  return `${svg}</svg>`;
}

/** Color secuencial (7 pasos) para mapas de calor. */
export function colorCalor(v, max) {
  if (!v || max <= 0) return 'var(--seq-0)';
  const k = Math.min(6, 1 + Math.floor((v / max) * 5.999));
  return `var(--seq-${k})`;
}
export const tintaCalor = (v, max) => (max > 0 && v / max > 0.55 ? '#fff' : 'var(--ink)');
