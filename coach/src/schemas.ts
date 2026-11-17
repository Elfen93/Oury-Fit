// Formatos de respuesta del entrenador (salidas estructuradas de Claude).
import { z } from "zod/v4";

export const ICONOS = ["barbell", "stretching", "run", "flame", "bike", "heartbeat", "yoga", "swimming"] as const;
export const ACENTOS = ["lime", "cyan", "violet", "amber", "rose"] as const;

export const Ejercicio = z.object({
  nombre: z.string().describe("Nombre en español, claro para un principiante"),
  tipo: z.enum(["peso", "corporal", "tiempo"]).describe("peso = con carga en kg; corporal = peso corporal (progresa en reps); tiempo = isométrico en segundos"),
  series: z.number().int(),
  repsMin: z.number().int().describe("Mínimo del rango de repeticiones (o segundos si tipo=tiempo)"),
  repsMax: z.number().int().describe("Máximo del rango de repeticiones (o segundos si tipo=tiempo)"),
  descanso: z.number().int().describe("Descanso entre series en segundos"),
  pesoInicial: z.number().describe("Peso de partida en kg; prudente para calibrar. 0 si tipo no es peso"),
  incremento: z.number().describe("Kg a subir cuando se completa el rango (p. ej. 2.5, 1, 5). 0 si tipo no es peso"),
  tecnica: z.string().describe("2-3 claves de técnica en frases cortas y sencillas"),
  alternativas: z.array(z.string()).describe("2-3 ejercicios equivalentes por si la máquina está ocupada"),
});

export const Sesion = z.object({
  id: z.string().describe("Identificador corto en minúsculas sin espacios, p. ej. 'fullbody-a'"),
  nombre: z.string(),
  corto: z.string().describe("Nombre de máximo 10 caracteres"),
  icon: z.enum(ICONOS),
  acento: z.enum(ACENTOS),
  calentamiento: z.string().describe("Calentamiento de 5-8 minutos en una o dos frases"),
  ejercicios: z.array(Ejercicio),
  minima: z.array(z.string()).describe("Versión corta para días sin ganas o sin tiempo (unos 25 min): nombres exactos de 2-3 ejercicios de esta sesión, los más importantes"),
});

export const Programa = z.object({
  nombre: z.string().describe("Nombre de la fase, p. ej. 'Fase 1 · Aprender y calibrar'"),
  resumen: z.string().describe("2-3 frases para el usuario: qué vais a hacer y por qué"),
  semanas: z.number().int().describe("Semanas que dura esta fase antes de replantearla"),
  sesiones: z.array(Sesion),
  plan: z.array(z.string()).describe("Exactamente 7 elementos, de lunes a domingo: id de sesión o 'descanso'"),
});

export const Perfil = z.object({
  objetivo: z.string().describe("El objetivo con sus palabras, resumido"),
  objetivoTipo: z.enum(["musculo", "fuerza", "salud", "perder_grasa", "rendimiento"]),
  experiencia: z.enum(["cero", "poca", "intermedia", "avanzada"]),
  dias: z.number().int().describe("Días por semana que puede entrenar"),
  minutos: z.number().int().describe("Minutos por sesión"),
  diasPreferidos: z.array(z.string()).describe("Días de la semana que le vienen mejor, en español"),
  material: z.string().describe("Qué tiene su gimnasio (máquinas, pesos libres, etc.)"),
  lesiones: z.string().describe("Lesiones, dolores o limitaciones; 'ninguna' si no hay"),
  gustos: z.string().describe("Qué le gusta, qué odia, preferencias"),
  notas: z.string().describe("Cualquier otra cosa relevante"),
});

export const TurnoEntrevista = z.object({
  mensaje: z.string().describe("Lo que le dices ahora: una sola pregunta, cercana y breve"),
  opciones: z.array(z.string()).describe("2-5 respuestas rápidas sugeridas; vacío si es pregunta abierta"),
  terminado: z.boolean().describe("true solo cuando ya tienes todo lo necesario para diseñar el plan"),
  perfil: Perfil.nullable().describe("El perfil completo cuando terminado=true; null en otro caso"),
});

export const Revision = z.object({
  mensaje: z.string().describe("2-4 frases para el usuario: cómo va, qué cambias y por qué. Cercano, sin reproches"),
  cambios: z.array(z.object({ ejercicio: z.string(), cambio: z.string(), motivo: z.string() })),
  pesos: z.array(z.object({ ejercicio: z.string(), peso: z.number() })).describe("Solo si corriges el peso de trabajo de algún ejercicio"),
  programa: Programa.nullable().describe("Programa nuevo completo si cambias ejercicios, sesiones o plan; null si se mantiene"),
  memoria: z.array(z.string()).describe("Notas nuevas que conviene recordar sobre el usuario"),
  libreta: z.string().describe("Tu libreta sobre este cliente, reescrita entera con lo nuevo (ver instrucciones)"),
  capitulos: z.array(z.object({ mes: z.string(), titulo: z.string(), texto: z.string() })).describe("Capítulos de los meses pendientes que se te piden; vacío si no hay"),
});

export const Respuesta = z.object({
  respuesta: z.string().describe("Respuesta breve y práctica, en español sencillo"),
  dolor: z.boolean().describe("true si menciona dolor (no cansancio) y debe parar o consultar"),
  sustitucion: z
    .object({ sesionId: z.string(), ejercicioOriginal: z.string(), nuevo: Ejercicio })
    .nullable()
    .describe("Si conviene cambiar un ejercicio de su plan, el cambio; null si no"),
  memoria: z.array(z.string()).describe("Notas nuevas que conviene recordar; vacío si no hay"),
});
