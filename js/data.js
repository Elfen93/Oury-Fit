// ── Configuración, valores por defecto y migración de datos ─────────────

// Neon (proyecto "ouryfit"): Auth para la sesión y Data API para los datos.
// Son URLs públicas; la seguridad la ponen la sesión y las reglas RLS de la tabla.
export const NEON = {
  auth: "https://ep-frosty-wildflower-a1axnxg9.neonauth.ap-southeast-1.aws.neon.tech/neondb/auth",
  rest: "https://ep-frosty-wildflower-a1axnxg9.apirest.ap-southeast-1.aws.neon.tech/neondb/rest/v1",
};

// Función del entrenador IA (Neon Functions)
export const NEON_COACH = "https://br-nameless-credit-a1wax9gf-coach.compute.c-1.ap-southeast-1.aws.neon.tech/";

// Solo para importar una vez los datos que quedaron en la hoja de Google.
export const SHEETS_URL_ANTIGUA =
  "https://script.google.com/macros/s/AKfycbx9a53S1XnVF062jH6zPP9gsBruTWSlBn7EBbMq-YGVwTjuD-tiQ2MgfxMNMWqeK8f3ZQ/exec";

export const VERSION = 5;
export const LS = {
  data: "ouryfit_v5",
  legacy: "ouryfit_v4",
  owner: "ouryfit_owner",
  dirty: "ouryfit_dirty",
  email: "ouryfit_email",
  mode: "ouryfit_mode",
  session: "ouryfit_session_v5",
};

export const COLORES = {
  lime: "#c4f542",
  cyan: "#22d3ee",
  violet: "#8b5cf6",
  amber: "#fbbf24",
  rose: "#fb7185",
};
export const ACENTOS = Object.keys(COLORES);
export const ICONOS_RUTINA = ["barbell", "stretching", "run", "flame", "bike", "heartbeat", "yoga", "swimming"];

export const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
export const DIAS_CORTOS = ["L", "M", "X", "J", "V", "S", "D"];

export const uid = () => Math.random().toString(36).slice(2, 9);

const ej = (nombre, series, reps, descanso, notas) => ({ id: uid(), nombre, series, reps, descanso, notas });

export function rutinasPorDefecto() {
  return [
    {
      id: "empuje", nombre: "Pecho + Tríceps", corto: "Empuje", icon: "barbell", acento: "lime",
      ejercicios: [
        ej("Press banca plano", 4, "8-10", 90, "Baja controlado 3s, no rebotes"),
        ej("Press inclinado mancuernas", 3, "10-12", 75, "Codos a 45°"),
        ej("Aperturas en máquina", 3, "12-15", 60, "Aprieta el pecho al cerrar"),
        ej("Fondos en paralelas", 3, "10-12", 60, "Inclínate hacia adelante"),
        ej("Press francés", 3, "10-12", 60, "Codos quietos, solo antebrazo"),
      ],
    },
    {
      id: "tiron", nombre: "Espalda + Bíceps", corto: "Tirón", icon: "stretching", acento: "cyan",
      ejercicios: [
        ej("Jalón al pecho", 4, "8-10", 90, "Lleva el pecho hacia la barra"),
        ej("Remo con barra", 4, "8-10", 90, "Espalda recta, tira al ombligo"),
        ej("Remo en polea sentado", 3, "12-15", 60, "Junta las escápulas"),
        ej("Curl bíceps con barra", 3, "10-12", 60, "Sin balanceo, codos fijos"),
        ej("Curl martillo", 3, "12-15", 60, "Trabaja el braquial"),
      ],
    },
    {
      id: "pierna", nombre: "Piernas completas", corto: "Pierna", icon: "run", acento: "violet",
      ejercicios: [
        ej("Sentadilla en Smith", 4, "8-10", 120, "Baja hasta paralelo"),
        ej("Prensa de piernas", 4, "10-12", 90, "No bloquees rodillas"),
        ej("Extensión de cuádriceps", 3, "15-20", 60, "Pausa 1s en contracción"),
        ej("Curl femoral tumbado", 3, "12-15", 60, "Talón hacia el glúteo"),
        ej("Elevación de gemelos", 4, "20-25", 45, "Rango completo"),
      ],
    },
    {
      id: "hombro", nombre: "Hombros + Core", corto: "Hombro", icon: "flame", acento: "amber",
      ejercicios: [
        ej("Press militar máquina", 4, "8-10", 90, "No arquees la zona lumbar"),
        ej("Elevaciones laterales", 4, "12-15", 60, "Sube hasta altura del hombro"),
        ej("Pájaros en polea", 3, "15", 60, "Deltoides posterior"),
        ej("Plancha", 3, "45s", 45, "Cuerpo en línea recta"),
        ej("Crunch en máquina", 3, "15-20", 45, "Lento, sin tirones"),
      ],
    },
  ];
}

// Plan semanal: índice 0 = lunes. Valor = id de rutina o null (descanso).
export const PLAN_POR_DEFECTO = ["empuje", "tiron", null, "pierna", "hombro", null, null];

// Base de alimentos (valores por ración indicada). Aproximados.
export const ALIMENTOS = [
  { n: "Pechuga de pollo", g: "100 g", cal: 165, p: 31, c: 0, gr: 4 },
  { n: "Arroz blanco cocido", g: "100 g", cal: 130, p: 2.7, c: 28, gr: 0.3 },
  { n: "Huevo entero", g: "1 ud", cal: 78, p: 6, c: 0.6, gr: 5 },
  { n: "Claras de huevo", g: "100 g", cal: 52, p: 11, c: 0.7, gr: 0.2 },
  { n: "Avena", g: "50 g", cal: 190, p: 6.5, c: 33, gr: 3.5 },
  { n: "Plátano", g: "1 ud", cal: 105, p: 1.3, c: 27, gr: 0.4 },
  { n: "Manzana", g: "1 ud", cal: 95, p: 0.5, c: 25, gr: 0.3 },
  { n: "Atún en lata (natural)", g: "100 g", cal: 116, p: 26, c: 0, gr: 1 },
  { n: "Salmón", g: "100 g", cal: 208, p: 20, c: 0, gr: 13 },
  { n: "Ternera magra", g: "100 g", cal: 187, p: 26, c: 0, gr: 9 },
  { n: "Batido de proteína", g: "1 scoop", cal: 120, p: 24, c: 3, gr: 1.5 },
  { n: "Pasta cocida", g: "100 g", cal: 158, p: 5.8, c: 31, gr: 0.9 },
  { n: "Patata cocida", g: "100 g", cal: 87, p: 1.9, c: 20, gr: 0.1 },
  { n: "Lentejas cocidas", g: "100 g", cal: 116, p: 9, c: 20, gr: 0.4 },
  { n: "Pan integral", g: "1 rebanada", cal: 100, p: 4, c: 17, gr: 1.5 },
  { n: "Leche entera", g: "250 ml", cal: 150, p: 8, c: 12, gr: 8 },
  { n: "Yogur natural", g: "125 g", cal: 75, p: 4.5, c: 5.5, gr: 4 },
  { n: "Queso fresco batido 0%", g: "100 g", cal: 46, p: 8, c: 3.5, gr: 0.2 },
  { n: "Aguacate", g: "1/2 ud", cal: 160, p: 2, c: 9, gr: 15 },
  { n: "Crema de cacahuete", g: "30 g", cal: 188, p: 8, c: 6, gr: 16 },
  { n: "Frutos secos", g: "30 g", cal: 190, p: 5, c: 5, gr: 17 },
  { n: "Aceite de oliva", g: "1 cucharada", cal: 88, p: 0, c: 0, gr: 10 },
];

export const FRASES = [
  "El músculo se construye con consistencia.",
  "Hoy, más fuerte que ayer.",
  "No perfecto. Solo constante.",
  "Cada serie cuenta.",
  "La disciplina pesa gramos.",
  "Sigue. Eso es todo el secreto.",
  "Descansar también es entrenar.",
];

export const OBJETIVOS = {
  ganar: { l: "Ganar músculo", d: "Superávit ligero (+10%)", f: 1.1, prot: 2.0, dPeso: 3 },
  mantener: { l: "Mantener", d: "Calorías de mantenimiento", f: 1.0, prot: 1.8, dPeso: 0 },
  perder: { l: "Perder grasa", d: "Déficit moderado (−20%)", f: 0.8, prot: 2.2, dPeso: -5 },
};

// Mifflin-St Jeor + factor de actividad según días de entreno del plan.
export function calcularMetas(profile, diasEntreno = 4) {
  const p = +profile.peso || 70, h = +profile.altura || 175, e = +profile.edad || 25;
  const bmr = 10 * p + 6.25 * h - 5 * e + (profile.sexo === "m" ? -161 : 5);
  const actividad = diasEntreno >= 5 ? 1.725 : diasEntreno >= 3 ? 1.55 : diasEntreno >= 1 ? 1.375 : 1.2;
  const obj = OBJETIVOS[profile.objetivo] || OBJETIVOS.ganar;
  const calorias = Math.round((bmr * actividad * obj.f) / 10) * 10;
  const proteina = Math.round(p * obj.prot);
  const grasa = Math.round((calorias * 0.25) / 9);
  const carbs = Math.max(0, Math.round((calorias - proteina * 4 - grasa * 9) / 4));
  return {
    calorias, proteina, carbs, grasa,
    agua: Math.round(p * 0.04 * 4) / 4,
    pesoObjetivo: Math.round((p + obj.dPeso) * 10) / 10,
  };
}

export const coachVacio = () => ({
  perfil: null,        // resultado de la entrevista
  entrevista: [],      // [{rol:"coach"|"usuario", texto, opciones?}]
  programa: null,      // {nombre, resumen, semanas, inicio}
  estado: {},          // por nombre de ejercicio: {peso, fallos, sesiones, ultima}
  memoria: [],         // notas que el entrenador recuerda
  chat: [],            // conversación con el entrenador
  revisiones: [],      // [{fecha, mensaje, cambios, vista}]
  ultimaRevision: null,
});

export function datosPorDefecto() {
  return {
    version: VERSION,
    profile: { name: "", sexo: "h", peso: 0, altura: 0, edad: 0, objetivo: "ganar", setup: false },
    metas: { calorias: 2800, proteina: 140, carbs: 350, grasa: 80, agua: 3, pesoObjetivo: 75 },
    rutinas: rutinasPorDefecto(),
    plan: [...PLAN_POR_DEFECTO],
    alimentos: [],
    registros: {},
    comidas: {},
    agua: {},
    pesoCorporal: {},
    records: {},
    coach: coachVacio(),
  };
}

const obj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});

// Acepta cualquier versión anterior (v4 local, hoja de Google, copia JSON) y devuelve v5.
export function migrar(raw) {
  const base = datosPorDefecto();
  const r = obj(raw);
  const d = {
    ...base,
    profile: { ...base.profile, ...obj(r.profile) },
    metas: { ...base.metas, ...obj(r.metas) },
    registros: obj(r.registros),
    comidas: obj(r.comidas),
    agua: obj(r.agua),
    pesoCorporal: obj(r.pesoCorporal),
    records: obj(r.records),
    alimentos: Array.isArray(r.alimentos) ? r.alimentos : [],
    coach: { ...coachVacio(), ...obj(r.coach) },
    version: VERSION,
  };
  // v4 tenía el nombre fijo "Oury"
  if (d.profile.setup && !d.profile.name) d.profile.name = "Oury";
  if (!d.profile.objetivo) d.profile.objetivo = "ganar";

  if (Array.isArray(r.rutinas) && r.rutinas.length) {
    d.rutinas = r.rutinas.map((rt) => ({
      id: rt.id || uid(),
      nombre: rt.nombre || "Rutina",
      corto: rt.corto || (rt.nombre || "Rutina").split(" ")[0],
      icon: String(rt.icon || "barbell").replace(/^ti-/, ""),
      acento: COLORES[rt.acento] ? rt.acento : "lime",
      calentamiento: rt.calentamiento || "",
      ejercicios: (rt.ejercicios || []).map((e) => ({
        ...e, // conserva campos del entrenador (tipo, repsMin, repsMax, incremento, tecnica, alternativas...)
        id: e.id || uid(),
        nombre: e.nombre || "Ejercicio",
        series: +e.series || 3,
        reps: String(e.reps ?? "10"),
        descanso: +e.descanso || 60,
        notas: e.notas || e.notes || "",
      })),
    }));
  }
  const ids = new Set(d.rutinas.map((x) => x.id));
  d.plan = Array.isArray(r.plan) && r.plan.length === 7
    ? r.plan.map((x) => (ids.has(x) ? x : null))
    : PLAN_POR_DEFECTO.map((x) => (ids.has(x) ? x : null));

  // Comidas: asegurar ids y macros por item
  for (const [k, dia] of Object.entries(d.comidas)) {
    const dd = obj(dia);
    d.comidas[k] = {
      cal: +dd.cal || 0, prot: +dd.prot || 0, carbs: +dd.carbs || 0, grasa: +dd.grasa || 0,
      items: (Array.isArray(dd.items) ? dd.items : []).map((it) => ({ id: it.id || uid(), ...it })),
    };
  }
  for (const [k, v] of Object.entries(d.agua)) d.agua[k] = +v || 0;
  for (const [k, v] of Object.entries(d.pesoCorporal)) d.pesoCorporal[k] = +v || 0;
  return d;
}

// ── Importación única desde la hoja de Google (formato v4) ──
export function deHoja(raw) {
  const r = obj(raw);
  const perfil = obj(r.perfil);
  return migrar({
    ...perfil,
    registros: r.entrenos,
    comidas: r.comidas,
    agua: r.agua,
    pesoCorporal: r.peso,
    records: r.records,
  });
}
