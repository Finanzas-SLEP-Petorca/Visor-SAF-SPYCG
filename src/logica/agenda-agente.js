// Horario del agente local: una revisión diaria los días hábiles a las 12:00 (hora de Santiago).
// Puro: sin DOM ni Firebase.
import { esHabil, sumarDias } from './habiles.js?v=202610022053';

export const HORA_AGENTE = 12; // 12:00
export const TOLERANCIA_MIN = 30; // minutos de gracia antes de dar la revisión por atrasada

/** Fecha ISO y minutos del día en America/Santiago. */
export function enSantiago(fecha) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(fecha).map((x) => [x.type, x.value]));
  return { iso: `${p.year}-${p.month}-${p.day}`, min: Number(p.hour) * 60 + Number(p.minute) };
}

/** Día hábil de la última revisión que ya debió ocurrir (a las 12:00 + tolerancia). */
export function revisionEsperada(ahora, feriados = new Set()) {
  const h = enSantiago(ahora);
  let d = h.iso;
  if (!(esHabil(d, feriados) && h.min >= HORA_AGENTE * 60 + TOLERANCIA_MIN)) {
    do { d = sumarDias(d, -1); } while (!esHabil(d, feriados));
  }
  return d;
}

/**
 * ¿La última revisión del agente está al día?
 * @returns {{ alDia: boolean, esperada: string }} esperada = fecha ISO del día hábil que debía revisarse
 */
export function agenteAlDia(ultimaRevision, ahora = new Date(), feriados = new Set()) {
  const esperada = revisionEsperada(ahora, feriados);
  if (!ultimaRevision) return { alDia: false, esperada };
  const u = enSantiago(ultimaRevision);
  const alDia = u.iso > esperada || (u.iso === esperada && u.min >= HORA_AGENTE * 60 - 5);
  return { alDia, esperada };
}
