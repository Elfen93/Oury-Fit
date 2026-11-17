// ── Entrenador: progresión automática, contexto para la IA y aplicación de sus decisiones ──
import { NEON_COACH, uid, DIAS, COLORES, coachVacio } from "./data.js";
export { coachVacio };
import { hoy, sumarDias, lunesDe, diffDias, r1, diaSemana } from "./calc.js";
import { token, SinSesion } from "./neon.js";

export const esCoach = (e) => e && e.repsMin != null && e.repsMax != null;
const redondear = (kg) => Math.max(0, Math.round(kg * 2) / 2); // a 0,5 kg

// Peso y objetivo que tocan hoy para un ejercicio del plan
export function prescripcion(d, e) {
  if (!esCoach(e)) return null;
  const st = d.coach?.estado?.[e.nombre];
  const peso = e.tipo === "peso" ? (st?.peso ?? e.pesoInicial ?? 0) : 0;
  return { peso, repsMin: e.repsMin, repsMax: e.repsMax, tipo: e.tipo || "peso", calibrando: !st || (st.sesiones || 0) < 2 };
}

// Doble progresión. Devuelve el nuevo estado y los cambios para mostrarlos.
export function aplicarProgresion(estadoPrevio, sesion, fecha) {
  const estado = { ...estadoPrevio };
  const cambios = [];
  for (const e of sesion.ejercicios) {
    if (!esCoach(e)) continue;
    const hechas = e.sets.filter((s) => s.done);
    if (!hechas.length) continue;
    const st = { peso: e.pesoPrescrito ?? 0, fallos: 0, sesiones: 0, ...(estado[e.nombre] || {}) };
    const antes = st.peso;
    const reps = hechas.map((s) => +s.reps || 0);
    const completa = hechas.length >= e.series && reps.every((r) => r >= e.repsMax);
    const corta = reps.some((r) => r < e.repsMin) || e.sensacion === "nopude";

    if ((e.tipo || "peso") === "peso") {
      const usado = Math.max(...hechas.map((s) => +s.kg || 0)) || st.peso;
      const inc = +e.incremento || 2.5;
      if (completa && e.sensacion !== "nopude") {
        st.peso = redondear(usado + (st.sesiones < 2 && e.sensacion === "facil" ? inc * 2 : inc));
        st.fallos = 0;
      } else if (corta) {
        st.fallos = (st.fallos || 0) + 1;
        st.peso = usado;
        if (st.fallos >= 2) { st.peso = redondear(usado * 0.9); st.fallos = 0; }
      } else {
        st.peso = usado;
        st.fallos = 0;
      }
    } else {
      st.fallos = corta ? (st.fallos || 0) + 1 : 0;
    }
    st.sesiones = (st.sesiones || 0) + 1;
    st.ultima = fecha;
    estado[e.nombre] = st;
    if ((e.tipo || "peso") === "peso" && st.peso !== antes)
      cambios.push({ nombre: e.nombre, antes, despues: st.peso, sube: st.peso > antes });
  }
  return { estado, cambios };
}

// Convierte el programa que genera la IA en rutinas y plan de la app
export function aplicarPrograma(d, prog) {
  const rutinas = prog.sesiones.map((s) => ({
    id: s.id || uid(),
    nombre: s.nombre,
    corto: (s.corto || s.nombre).slice(0, 10),
    icon: s.icon || "barbell",
    acento: COLORES[s.acento] ? s.acento : "lime",
    calentamiento: s.calentamiento || "",
    ejercicios: s.ejercicios.map((e) => ({
      id: uid(),
      nombre: e.nombre,
      tipo: e.tipo || "peso",
      series: e.series,
      repsMin: e.repsMin,
      repsMax: e.repsMax,
      reps: e.tipo === "tiempo" ? `${e.repsMin}-${e.repsMax}s` : `${e.repsMin}-${e.repsMax}`,
      descanso: e.descanso,
      pesoInicial: e.pesoInicial || 0,
      incremento: e.incremento || 0,
      notas: e.tecnica || "",
      tecnica: e.tecnica || "",
      alternativas: e.alternativas || [],
    })),
  }));
  const ids = new Set(rutinas.map((r) => r.id));
  const plan = Array.from({ length: 7 }, (_, i) => (ids.has(prog.plan?.[i]) ? prog.plan[i] : null));
  const estado = { ...(d.coach?.estado || {}) };
  for (const r of rutinas) for (const e of r.ejercicios)
    if (e.tipo === "peso" && estado[e.nombre]?.peso == null) estado[e.nombre] = { peso: e.pesoInicial, fallos: 0, sesiones: 0 };
  return {
    ...d,
    rutinas,
    plan,
    coach: {
      ...d.coach,
      estado,
      programa: { nombre: prog.nombre, resumen: prog.resumen, semanas: prog.semanas, inicio: hoy() },
    },
  };
}

// Sustituye un ejercicio del plan (por máquina ocupada, molestias...)
export function sustituir(d, { sesionId, ejercicioOriginal, nuevo }) {
  let hecho = false;
  const rutinas = d.rutinas.map((r) => {
    if (sesionId && r.id !== sesionId && r.ejercicios.every((e) => e.nombre !== ejercicioOriginal)) return r;
    return {
      ...r,
      ejercicios: r.ejercicios.map((e) => {
        if (e.nombre !== ejercicioOriginal) return e;
        hecho = true;
        return aplicarPrograma({ coach: {} }, { sesiones: [{ id: "x", nombre: "x", ejercicios: [nuevo] }], plan: [] }).rutinas[0].ejercicios[0];
      }),
    };
  });
  if (!hecho) return d;
  const estado = { ...(d.coach?.estado || {}) };
  if (nuevo.tipo === "peso" && nuevo.pesoInicial > 0 && estado[nuevo.nombre]?.peso == null) estado[nuevo.nombre] = { peso: nuevo.pesoInicial || 0, fallos: 0, sesiones: 0 };
  return { ...d, rutinas, coach: { ...d.coach, estado } };
}

export const anadirMemoria = (coach, notas) => {
  const nuevas = (notas || []).map((n) => String(n).trim()).filter((n) => n && !coach.memoria.includes(n));
  return nuevas.length ? { ...coach, memoria: [...coach.memoria, ...nuevas].slice(-40) } : coach;
};

// ── Revisión semanal ──
export function revisionPendiente(d, ref = hoy()) {
  const c = d.coach;
  if (!c?.programa) return false;
  const desde = c.ultimaRevision || c.programa.inicio;
  return diffDias(desde, ref) >= 7;
}

export function aplicarRevision(d, rev) {
  let nd = d;
  if (rev.programa) nd = aplicarPrograma(nd, rev.programa);
  const estado = { ...(nd.coach.estado || {}) };
  for (const { ejercicio, peso } of rev.pesos || []) {
    const actual = estado[ejercicio]?.peso;
    if (actual == null || !(peso >= 0)) continue;
    // Límite de seguridad: como mucho ±30% respecto al peso actual
    const limitado = actual > 0 ? Math.min(actual * 1.3, Math.max(actual * 0.7, peso)) : peso;
    estado[ejercicio] = { ...estado[ejercicio], peso: redondear(limitado), fallos: 0 };
  }
  let coach = { ...nd.coach, estado, ultimaRevision: hoy() };
  coach = anadirMemoria(coach, rev.memoria);
  coach.revisiones = [{ fecha: hoy(), mensaje: rev.mensaje, cambios: rev.cambios || [], vista: false }, ...(coach.revisiones || [])].slice(0, 12);
  return { ...nd, coach };
}

// ── Contexto que se envía a la IA (compacto) ──
export function basicos(d) {
  const pesos = Object.entries(d.pesoCorporal).sort((a, b) => a[0].localeCompare(b[0]));
  return {
    nombre: d.profile.name,
    sexo: d.profile.sexo === "m" ? "mujer" : "hombre",
    edad: d.profile.edad,
    pesoKg: pesos.length ? pesos[pesos.length - 1][1] : d.profile.peso,
    alturaCm: d.profile.altura,
  };
}

export function programaActual(d) {
  return {
    ...(d.coach?.programa || {}),
    sesiones: d.rutinas.map((r) => ({
      id: r.id, nombre: r.nombre,
      ejercicios: r.ejercicios.map((e) => ({ nombre: e.nombre, tipo: e.tipo || "peso", series: e.series, reps: e.reps, descanso: e.descanso })),
    })),
    plan: d.plan.map((id, i) => `${DIAS[i]}: ${d.rutinas.find((r) => r.id === id)?.nombre || "descanso"}`),
  };
}

export function contextoRevision(d) {
  const k = hoy();
  const lunes = lunesDe(k);
  const previstos = d.plan.filter(Boolean).length;
  const asistencia = Array.from({ length: 4 }, (_, w) => {
    const ini = sumarDias(lunes, -7 * (w + 1));
    const hechas = Array.from({ length: 7 }, (_, i) => sumarDias(ini, i)).filter((x) => d.registros[x]).length;
    return { semanaDel: ini, previstas: previstos, hechas };
  }).reverse();
  const sesiones = Object.entries(d.registros)
    .filter(([f]) => diffDias(f, k) <= 28)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([fecha, r]) => ({
      fecha, dia: DIAS[diaSemana(fecha)], rutina: r.rutina,
      ejercicios: (r.ejercicios || []).map((e) => ({ n: e.nombre, series: e.sets.map((s) => `${s.kg}x${s.reps}`).join(" "), sensacion: e.sensacion || null })),
    }));
  return {
    hoy: `${k} (${DIAS[diaSemana(k)]})`,
    basicos: basicos(d),
    perfil: d.coach.perfil,
    memoria: d.coach.memoria,
    programa: programaActual(d),
    estado: d.coach.estado,
    asistencia,
    sesiones,
    chat: d.coach.chat.slice(-20),
    revisiones: d.coach.revisiones.slice(0, 3).map((r) => ({ fecha: r.fecha, mensaje: r.mensaje })),
  };
}

// ── Llamada a la función del entrenador ──
export class SinAcceso extends Error {}

export async function llamar(accion, contexto, chat) {
  const t = await token();
  if (!t) throw new SinSesion("sin sesión");
  let r;
  try {
    r = await fetch(NEON_COACH, {
      method: "POST",
      headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
      body: JSON.stringify({ accion, contexto, chat }),
    });
  } catch {
    throw new Error("Sin conexión. El entrenador necesita internet.");
  }
  const j = await r.json().catch(() => ({}));
  if (r.status === 401) throw new SinSesion("sesión caducada");
  if (r.status === 503) throw new SinAcceso(j.error || "El entrenador aún no tiene acceso a la IA.");
  if (!r.ok) throw new Error(j.error || `Error ${r.status}`);
  return j.datos;
}

export { r1 };
