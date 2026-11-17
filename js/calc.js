// ── Lógica pura: fechas, rachas, historial, récords, nutrición ──────────
import { uid } from "./data.js";

// Fechas en hora LOCAL (la v4 mezclaba local y UTC y descuadraba el calendario).
export const pad = (n) => String(n).padStart(2, "0");
export const claveFecha = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const hoy = () => claveFecha();
export const aFecha = (k) => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d, 12); };
export const sumarDias = (k, n) => { const d = aFecha(k); d.setDate(d.getDate() + n); return claveFecha(d); };
export const diaSemana = (k) => (aFecha(k).getDay() + 6) % 7; // 0 = lunes
export const diffDias = (a, b) => Math.round((aFecha(b) - aFecha(a)) / 86400000);
export const lunesDe = (k) => sumarDias(k, -diaSemana(k));

const fmtLargo = new Intl.DateTimeFormat("es-ES", { weekday: "long", day: "numeric", month: "long" });
const fmtCorto = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short" });
export const fechaLarga = (k) => fmtLargo.format(aFecha(k));
export const fechaCorta = (k) => fmtCorto.format(aFecha(k));
export function fechaRelativa(k) {
  const d = diffDias(k, hoy());
  if (d === 0) return "Hoy";
  if (d === 1) return "Ayer";
  if (d === -1) return "Mañana";
  return fechaCorta(k);
}

export const r1 = (n) => Math.round(n * 10) / 10;
export const fmtKg = (n) => (Number.isInteger(+n) ? String(+n) : r1(+n).toString().replace(".", ","));

// ── Plan y rachas ──────────────────────────────────────────────────────
export const rutinaPorId = (d, id) => d.rutinas.find((r) => r.id === id) || null;
export const rutinaDelDia = (d, k) => rutinaPorId(d, d.plan[diaSemana(k)]);
export const diasEntreno = (d) => d.plan.filter(Boolean).length;

function primeraFecha(d) {
  const ks = Object.keys(d.registros).sort();
  return ks[0] || null;
}

// Racha = sesiones seguidas sin saltarse un día planificado.
// Los días de descanso no rompen la racha; entrenar un día libre suma.
export function rachas(d, ref = hoy()) {
  const inicio = primeraFecha(d);
  if (!inicio) return { actual: 0, mejor: 0 };
  let cur = 0, mejor = 0;
  for (let k = inicio; k <= ref; k = sumarDias(k, 1)) {
    if (d.registros[k]) { cur++; mejor = Math.max(mejor, cur); }
    else if (d.plan[diaSemana(k)] && k !== ref) cur = 0;
  }
  return { actual: cur, mejor };
}

export function semanaPrograma(d, ref = hoy()) {
  const inicio = primeraFecha(d);
  if (!inicio) return 1;
  return Math.floor(diffDias(lunesDe(inicio), ref) / 7) + 1;
}

// ── Series, volumen, 1RM ───────────────────────────────────────────────
// Epley. Para series de 1 rep devuelve el propio peso.
export const e1rm = (kg, reps) => (!kg ? 0 : reps <= 1 ? kg : kg * (1 + Math.min(reps, 15) / 30));

export function mejorSerie(sets) {
  let best = null;
  for (const s of sets || []) {
    const kg = +s.kg || 0, reps = +s.reps || 0;
    if (!best || kg > best.kg || (kg === best.kg && reps > best.reps)) best = { kg, reps };
  }
  return best;
}

// Historial de un ejercicio a partir de los registros (formato v5).
export function historialEjercicio(d, nombre) {
  const out = [];
  for (const [fecha, reg] of Object.entries(d.registros).sort((a, b) => a[0].localeCompare(b[0]))) {
    for (const e of reg.ejercicios || []) {
      if (e.nombre !== nombre || !e.sets?.length) continue;
      const best = mejorSerie(e.sets);
      out.push({
        fecha,
        sets: e.sets,
        top: best?.kg || 0,
        reps: best?.reps || 0,
        e1rm: Math.max(...e.sets.map((s) => e1rm(+s.kg || 0, +s.reps || 0))),
        volumen: e.sets.reduce((a, s) => a + (+s.kg || 0) * (+s.reps || 0), 0),
      });
    }
  }
  return out;
}

export function ultimaVez(d, nombre, hasta = "9999-12-31") {
  const h = historialEjercicio(d, nombre).filter((x) => x.fecha <= hasta);
  return h.length ? h[h.length - 1] : null;
}

export function ejerciciosConHistorial(d) {
  const set = new Map();
  for (const reg of Object.values(d.registros)) for (const e of reg.ejercicios || []) if (e.sets?.length) set.set(e.nombre, (set.get(e.nombre) || 0) + 1);
  return [...set.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n);
}

// ── Sesión de entreno en curso ─────────────────────────────────────────
export function crearSesion(d, rutina, fecha = hoy()) {
  return {
    fecha,
    rutinaId: rutina.id,
    rutina: rutina.nombre,
    acento: rutina.acento,
    inicio: Date.now(),
    calentamiento: rutina.calentamiento || "",
    ejercicios: rutina.ejercicios.map((e) => {
      const prev = ultimaVez(d, e.nombre, fecha);
      const coach = e.repsMin != null && e.repsMax != null;
      // Con entrenador: el peso lo fija la progresión. Sin él: lo de la última vez.
      const pesoPrescrito = coach && (e.tipo || "peso") === "peso" ? (d.coach?.estado?.[e.nombre]?.peso ?? e.pesoInicial ?? 0) : null;
      return {
        id: e.id || uid(),
        nombre: e.nombre, series: e.series, reps: e.reps, descanso: e.descanso, notas: e.tecnica || e.notas,
        ...(coach ? { tipo: e.tipo || "peso", repsMin: e.repsMin, repsMax: e.repsMax, incremento: e.incremento, alternativas: e.alternativas || [], pesoPrescrito, sensacion: null } : {}),
        prev: prev ? prev.sets.map((s) => ({ kg: s.kg, reps: s.reps })) : null,
        sets: Array.from({ length: e.series }, (_, i) => ({
          kg: pesoPrescrito ? String(pesoPrescrito) : prev ? String(prev.sets[Math.min(i, prev.sets.length - 1)].kg ?? "") : "",
          reps: "",
          done: false,
        })),
      };
    }),
  };
}

export function progresoSesion(s) {
  let total = 0, hechas = 0, volumen = 0;
  for (const e of s.ejercicios) for (const st of e.sets) {
    total++;
    if (st.done) { hechas++; volumen += (+st.kg || 0) * (+st.reps || 0); }
  }
  return { total, hechas, volumen, pct: total ? Math.round((hechas / total) * 100) : 0 };
}

// Cierra la sesión: devuelve el registro del día y los nuevos récords.
export function cerrarSesion(d, s) {
  const ejercicios = s.ejercicios
    .map((e) => ({
      nombre: e.nombre,
      sets: e.sets.filter((x) => x.done).map((x) => ({ kg: +x.kg || 0, reps: +x.reps || parseInt(e.reps) || 0 })),
      ...(e.sensacion ? { sensacion: e.sensacion } : {}),
    }))
    .filter((e) => e.sets.length);
  const { hechas, volumen } = progresoSesion(s);
  const minutos = Math.max(1, Math.round((Date.now() - s.inicio) / 60000));

  const records = { ...d.records };
  const nuevos = [];
  for (const e of ejercicios) {
    const best = mejorSerie(e.sets);
    if (!best || !best.kg) continue;
    const prev = records[e.nombre];
    if (!prev || best.kg > +prev.peso || (best.kg === +prev.peso && best.reps > (+prev.reps || 0))) {
      records[e.nombre] = { peso: best.kg, reps: best.reps, fecha: s.fecha };
      nuevos.push({ nombre: e.nombre, ...best, antes: prev ? +prev.peso : null });
    }
  }

  const previo = d.registros[s.fecha];
  const registro = previo
    ? {
        ...previo,
        rutina: `${previo.rutina} + ${s.rutina}`,
        sets: (+previo.sets || 0) + hechas,
        volumen: Math.round((+previo.volumen || 0) + volumen),
        minutos: (+previo.minutos || 0) + minutos,
        ejercicios: [...(previo.ejercicios || []), ...ejercicios],
      }
    : { rutina: s.rutina, rutinaId: s.rutinaId, sets: hechas, volumen: Math.round(volumen), minutos, ejercicios };

  return { registro, records, nuevos, resumen: { hechas, volumen: Math.round(volumen), minutos } };
}

// Recalcula récords desde cero (al borrar una sesión del historial).
export function recalcularRecords(d) {
  const out = {};
  // Conserva récords antiguos (v4) que no tienen historial detallado.
  for (const [n, r] of Object.entries(d.records)) if (!historialEjercicio(d, n).length) out[n] = r;
  for (const n of ejerciciosConHistorial(d)) {
    for (const h of historialEjercicio(d, n)) {
      const prev = out[n];
      if (!prev || h.top > prev.peso || (h.top === prev.peso && h.reps > (prev.reps || 0))) out[n] = { peso: h.top, reps: h.reps, fecha: h.fecha };
    }
  }
  return out;
}

// ── Nutrición ──────────────────────────────────────────────────────────
export const diaVacio = () => ({ cal: 0, prot: 0, carbs: 0, grasa: 0, items: [] });

export function totalesDia(dia) {
  if (!dia) return diaVacio();
  return { cal: +dia.cal || 0, prot: +dia.prot || 0, carbs: +dia.carbs || 0, grasa: +dia.grasa || 0, items: dia.items || [] };
}

export function itemDesdeAlimento(a, cant = 1) {
  return {
    id: uid(), n: a.n, g: a.g, cant,
    cal: r1(a.cal * cant), p: r1((a.p || 0) * cant), c: r1((a.c || 0) * cant), gr: r1((a.gr || 0) * cant),
  };
}

export function anadirItem(dia, it) {
  const t = totalesDia(dia);
  return {
    cal: r1(t.cal + (it.cal || 0)), prot: r1(t.prot + (it.p || 0)),
    carbs: r1(t.carbs + (it.c || 0)), grasa: r1(t.grasa + (it.gr || 0)),
    items: [...t.items, it],
  };
}

export function quitarItem(dia, id) {
  const t = totalesDia(dia);
  const it = t.items.find((x) => x.id === id);
  if (!it) return t;
  return {
    cal: Math.max(0, r1(t.cal - (it.cal || 0))), prot: Math.max(0, r1(t.prot - (it.p || 0))),
    carbs: Math.max(0, r1(t.carbs - (it.c || 0))), grasa: Math.max(0, r1(t.grasa - (it.gr || 0))),
    items: t.items.filter((x) => x.id !== id),
  };
}

// ── Exportación CSV ────────────────────────────────────────────────────
export function aCSV(d) {
  const rows = [["ENTRENOS"], ["Fecha", "Rutina", "Series", "Volumen (kg)", "Minutos"]];
  for (const [k, r] of Object.entries(d.registros).sort()) rows.push([k, r.rutina, r.sets, r.volumen ?? "", r.minutos ?? ""]);
  rows.push([], ["SERIES"], ["Fecha", "Ejercicio", "Serie", "Kg", "Reps"]);
  for (const [k, r] of Object.entries(d.registros).sort())
    for (const e of r.ejercicios || []) e.sets.forEach((s, i) => rows.push([k, e.nombre, i + 1, s.kg, s.reps]));
  rows.push([], ["RÉCORDS"], ["Ejercicio", "Kg", "Reps", "Fecha"]);
  for (const [n, r] of Object.entries(d.records).sort()) rows.push([n, r.peso, r.reps ?? "", r.fecha]);
  rows.push([], ["PESO CORPORAL"], ["Fecha", "Kg"]);
  for (const [k, v] of Object.entries(d.pesoCorporal).sort()) rows.push([k, v]);
  rows.push([], ["NUTRICIÓN"], ["Fecha", "Calorías", "Proteína (g)", "Carbos (g)", "Grasa (g)", "Agua (L)"]);
  const dias = new Set([...Object.keys(d.comidas), ...Object.keys(d.agua)]);
  for (const k of [...dias].sort()) {
    const c = totalesDia(d.comidas[k]);
    rows.push([k, Math.round(c.cal), Math.round(c.prot), Math.round(c.carbs), Math.round(c.grasa), d.agua[k] ?? ""]);
  }
  return rows.map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
}

export function descargar(nombre, contenido, tipo) {
  const blob = new Blob([contenido], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = nombre;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
