// Herramientas para que el entrenador consulte todo el historial del usuario (sus propios datos).
import type Anthropic from "@anthropic-ai/sdk";

type Serie = { kg: number; reps: number };
type EjReg = { nombre: string; sets: Serie[]; sensacion?: string };
type Registro = { rutina: string; sets?: number; minutos?: number; volumen?: number; ejercicios?: EjReg[] };
export type Datos = {
  registros?: Record<string, Registro>;
  plan?: (string | null)[];
  pesoCorporal?: Record<string, number>;
  coach?: { capitulos?: { mes: string; titulo: string; texto: string }[] };
};

const DIAS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
const aFecha = (k: string) => { const [y, m, d] = k.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const clave = (d: Date) => d.toISOString().slice(0, 10);
const diaSemana = (k: string) => (aFecha(k).getUTCDay() + 6) % 7;
const lunes = (k: string) => { const d = aFecha(k); d.setUTCDate(d.getUTCDate() - diaSemana(k)); return clave(d); };
const e1rm = (kg: number, reps: number) => (!kg ? 0 : reps <= 1 ? kg : kg * (1 + Math.min(reps, 15) / 30));
const r1 = (n: number) => Math.round(n * 10) / 10;
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

function registros(d: Datos) {
  return Object.entries(d.registros || {}).sort((a, b) => a[0].localeCompare(b[0]));
}

function enRango(fecha: string, desde?: string, hasta?: string) {
  return (!desde || fecha >= desde) && (!hasta || fecha <= hasta);
}

export const HERRAMIENTAS: Anthropic.Tool[] = [
  {
    name: "resumen_ejercicios",
    description: "Lista todos los ejercicios que ha hecho alguna vez, con primera y última fecha, número de sesiones y la mejor serie al principio frente a ahora. Úsala para ver la evolución a largo plazo.",
    strict: true,
    input_schema: { type: "object", properties: {}, required: [], additionalProperties: false },
  },
  {
    name: "historial_ejercicio",
    description: "Todas las sesiones de un ejercicio concreto (fecha, series kg×reps, sensación). El nombre se busca sin distinguir mayúsculas ni tildes y admite coincidencia parcial.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        nombre: { type: "string", description: "Nombre o parte del nombre del ejercicio" },
        desde: { type: ["string", "null"], description: "Fecha YYYY-MM-DD o null" },
        hasta: { type: ["string", "null"], description: "Fecha YYYY-MM-DD o null" },
      },
      required: ["nombre", "desde", "hasta"],
      additionalProperties: false,
    },
  },
  {
    name: "asistencia",
    description: "Sesiones hechas por semana (de lunes a domingo) y qué días de la semana suele ir o fallar, en un rango de fechas. Úsala para entender patrones de constancia.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        desde: { type: ["string", "null"], description: "Fecha YYYY-MM-DD o null para desde el principio" },
        hasta: { type: ["string", "null"], description: "Fecha YYYY-MM-DD o null para hasta hoy" },
      },
      required: ["desde", "hasta"],
      additionalProperties: false,
    },
  },
  {
    name: "sesiones",
    description: "Detalle de las sesiones de entrenamiento en un rango de fechas (máximo 40, las más recientes del rango).",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        desde: { type: ["string", "null"], description: "Fecha YYYY-MM-DD o null" },
        hasta: { type: ["string", "null"], description: "Fecha YYYY-MM-DD o null" },
      },
      required: ["desde", "hasta"],
      additionalProperties: false,
    },
  },
  {
    name: "leer_capitulo",
    description: "Lee el texto completo de un capítulo mensual que escribiste antes sobre el usuario.",
    strict: true,
    input_schema: {
      type: "object",
      properties: { mes: { type: "string", description: "Mes en formato YYYY-MM" } },
      required: ["mes"],
      additionalProperties: false,
    },
  },
];

export function ejecutar(nombre: string, input: any, d: Datos): unknown {
  const regs = registros(d);
  switch (nombre) {
    case "resumen_ejercicios": {
      const m = new Map<string, { primera: string; ultima: string; sesiones: number; inicio: string; actual: string; mejorE1rm: number }>();
      for (const [fecha, r] of regs) for (const e of r.ejercicios || []) {
        if (!e.sets?.length) continue;
        const top = e.sets.reduce((a, s) => (s.kg > a.kg || (s.kg === a.kg && s.reps > a.reps) ? s : a), e.sets[0]);
        const txt = `${top.kg}kg×${top.reps}`;
        const x = m.get(e.nombre);
        const best = Math.max(...e.sets.map((s) => e1rm(s.kg, s.reps)));
        if (!x) m.set(e.nombre, { primera: fecha, ultima: fecha, sesiones: 1, inicio: txt, actual: txt, mejorE1rm: r1(best) });
        else { x.ultima = fecha; x.sesiones++; x.actual = txt; x.mejorE1rm = Math.max(x.mejorE1rm, r1(best)); }
      }
      return { totalSesiones: regs.length, primeraSesion: regs[0]?.[0] ?? null, ejercicios: Object.fromEntries(m) };
    }
    case "historial_ejercicio": {
      const q = norm(String(input?.nombre || ""));
      const out: unknown[] = [];
      for (const [fecha, r] of regs) {
        if (!enRango(fecha, input?.desde, input?.hasta)) continue;
        for (const e of r.ejercicios || []) if (norm(e.nombre).includes(q))
          out.push({ fecha, ejercicio: e.nombre, series: e.sets.map((s) => `${s.kg}×${s.reps}`).join(" "), sensacion: e.sensacion ?? null });
      }
      return out.length ? out.slice(-80) : { aviso: "No hay registros de ese ejercicio con ese nombre." };
    }
    case "asistencia": {
      const semanas = new Map<string, number>();
      const porDia = [0, 0, 0, 0, 0, 0, 0];
      for (const [fecha] of regs) {
        if (!enRango(fecha, input?.desde, input?.hasta)) continue;
        semanas.set(lunes(fecha), (semanas.get(lunes(fecha)) || 0) + 1);
        porDia[diaSemana(fecha)]++;
      }
      // Rellena semanas vacías para que se vean los huecos
      const lista: { semanaDel: string; sesiones: number }[] = [];
      const claves = [...semanas.keys()].sort();
      if (claves.length) {
        const fin = input?.hasta ? lunes(input.hasta) : lunes(clave(new Date()));
        for (let k = claves[0]; k <= fin; ) {
          lista.push({ semanaDel: k, sesiones: semanas.get(k) || 0 });
          const n = aFecha(k); n.setUTCDate(n.getUTCDate() + 7); k = clave(n);
        }
      }
      const previstas = (d.plan || []).filter(Boolean).length;
      return {
        previstasPorSemanaSegunPlanActual: previstas,
        semanas: lista.slice(-60),
        sesionesPorDiaDeLaSemana: Object.fromEntries(DIAS.map((dia, i) => [dia, porDia[i]])),
      };
    }
    case "sesiones":
      return regs
        .filter(([f]) => enRango(f, input?.desde, input?.hasta))
        .slice(-40)
        .map(([fecha, r]) => ({
          fecha, dia: DIAS[diaSemana(fecha)], rutina: r.rutina, minutos: r.minutos ?? null,
          ejercicios: (r.ejercicios || []).map((e) => ({ n: e.nombre, series: e.sets.map((s) => `${s.kg}×${s.reps}`).join(" "), sensacion: e.sensacion ?? null })),
        }));
    case "leer_capitulo": {
      const c = (d.coach?.capitulos || []).find((x) => x.mes === input?.mes);
      return c ?? { aviso: "No hay capítulo de ese mes." };
    }
    default:
      return { error: `Herramienta desconocida: ${nombre}` };
  }
}
