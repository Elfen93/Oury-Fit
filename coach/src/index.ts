// Función del entrenador IA de OuryFit (Neon Functions).
// - Solo acepta peticiones de la web de OuryFit con una sesión válida de Neon Auth.
// - Llama a Claude a través del AI Gateway de Neon (credenciales inyectadas por Neon).
// - No guarda nada: la app recibe el resultado y lo guarda en su base de datos.
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { neon } from "@neondatabase/serverless";
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { z } from "zod/v4";
import { Perfil, Programa, Respuesta, Revision, TurnoEntrevista } from "./schemas.js";
import { ENTREVISTA, GENERAR, PREGUNTA, REVISAR, SISTEMA } from "./prompts.js";

const MODELO = "claude-opus-5-5";
const ORIGENES = new Set(["https://ouryfit-1jvh.onrender.com"]);
const MAX_BYTES = 300_000;

const jwks = createRemoteJWKSet(new URL(process.env.NEON_AUTH_JWKS_URL!));
const issuer = new URL(process.env.NEON_AUTH_BASE_URL!).origin;

// Acceso a Claude: si hay una clave propia de Anthropic guardada en la tabla ouryfit_secretos
// (solo legible por el propietario de la base de datos), se usa directamente; si no, el AI Gateway de Neon.
const sql = process.env.DATABASE_URL ? neon(process.env.DATABASE_URL) : null;
let cliente: Anthropic | null = null;
let clienteDesde = 0;

async function obtenerCliente(): Promise<Anthropic> {
  if (cliente && Date.now() - clienteDesde < 5 * 60_000) return cliente;
  let clave: string | null = null;
  try {
    const filas = sql ? await sql`SELECT valor FROM ouryfit_secretos WHERE nombre = 'anthropic_api_key'` : [];
    clave = (filas[0] as { valor?: string } | undefined)?.valor?.trim() || null;
  } catch (e) {
    console.error("No se pudo leer ouryfit_secretos", e);
  }
  cliente = clave
    ? new Anthropic({ apiKey: clave })
    : new Anthropic({ authToken: process.env.NEON_AI_GATEWAY_TOKEN, baseURL: `${process.env.NEON_AI_GATEWAY_BASE_URL}/anthropic` });
  clienteDesde = Date.now();
  return cliente;
}

type Esfuerzo = "low" | "medium" | "high";
type Mensaje = { role: "user" | "assistant"; content: string };

class ErrorCliente extends Error {
  constructor(public status: number, message: string) { super(message); }
}

// Llamada a Claude con salida estructurada. Streaming para no chocar con timeouts en respuestas largas.
async function pedir<T extends z.ZodType>(
  schema: T,
  instrucciones: string,
  messages: Mensaje[],
  effort: Esfuerzo,
  maxTokens: number,
): Promise<{ datos: z.infer<T>; uso: Anthropic.Usage }> {
  const client = await obtenerCliente();
  const stream = client.messages.stream({
    model: MODELO,
    max_tokens: maxTokens,
    system: [
      { type: "text", text: SISTEMA, cache_control: { type: "ephemeral" } },
      { type: "text", text: instrucciones },
    ],
    messages,
    output_config: { effort, format: zodOutputFormat(schema) },
  });
  const msg = await stream.finalMessage();
  if (msg.stop_reason === "refusal") throw new ErrorCliente(422, "El entrenador no ha podido responder a esto. Prueba a decirlo de otra forma.");
  if (msg.stop_reason === "max_tokens") throw new ErrorCliente(502, "La respuesta del entrenador salió incompleta. Inténtalo de nuevo.");
  if (msg.parsed_output == null) throw new ErrorCliente(502, "La respuesta del entrenador no tenía el formato esperado. Inténtalo de nuevo.");
  return { datos: msg.parsed_output as z.infer<T>, uso: msg.usage };
}

const ctx = (titulo: string, datos: unknown) => `${titulo}:\n${JSON.stringify(datos)}`;

function historial(chat: unknown, apertura: string): Mensaje[] {
  const msgs: Mensaje[] = [{ role: "user", content: apertura }];
  for (const m of Array.isArray(chat) ? chat.slice(-30) : []) {
    const texto = String(m?.texto ?? "").slice(0, 4000);
    if (!texto) continue;
    const role = m?.rol === "coach" ? "assistant" : "user";
    const ultimo = msgs[msgs.length - 1];
    if (ultimo.role === role) ultimo.content += `\n\n${texto}`; // los turnos deben alternar
    else msgs.push({ role, content: texto });
  }
  return msgs;
}

async function atender(cuerpo: any) {
  const c = cuerpo?.contexto ?? {};
  switch (cuerpo?.accion) {
    case "entrevista": {
      const apertura = `${ctx("Datos básicos del cliente", c.basicos)}\n\nEmpieza la entrevista.`;
      const msgs = historial(cuerpo.chat, apertura);
      if (msgs[msgs.length - 1].role !== "user") throw new ErrorCliente(400, "Falta la respuesta del usuario.");
      return pedir(TurnoEntrevista, ENTREVISTA, msgs, "low", 8000);
    }
    case "generar": {
      const perfil = Perfil.parse(c.perfil);
      const contenido = [ctx("Datos básicos", c.basicos), ctx("Perfil", perfil), ctx("Notas que recuerdas", c.memoria ?? []), ctx("Historial resumido (puede estar vacío)", c.historial ?? [])].join("\n\n");
      return pedir(Programa, GENERAR, [{ role: "user", content: `${contenido}\n\nDiseña el programa.` }], "high", 32000);
    }
    case "revision": {
      const contenido = [
        ctx("Hoy", c.hoy), ctx("Datos básicos", c.basicos), ctx("Perfil", c.perfil), ctx("Notas que recuerdas", c.memoria ?? []),
        ctx("Programa actual", c.programa), ctx("Estado de cada ejercicio (peso de trabajo, fallos)", c.estado),
        ctx("Asistencia por semana", c.asistencia), ctx("Sesiones recientes", c.sesiones), ctx("Conversaciones recientes", c.chat ?? []),
        ctx("Revisiones anteriores", c.revisiones ?? []),
      ].join("\n\n");
      return pedir(Revision, REVISAR, [{ role: "user", content: `${contenido}\n\nHaz la revisión.` }], "medium", 32000);
    }
    case "pregunta": {
      const apertura = [ctx("Hoy", c.hoy), ctx("Datos básicos", c.basicos), ctx("Perfil", c.perfil), ctx("Notas que recuerdas", c.memoria ?? []), ctx("Programa actual", c.programa), ctx("Lo que está haciendo ahora (puede ser null)", c.ahora ?? null)].join("\n\n");
      const msgs = historial(cuerpo.chat, `${apertura}\n\n(Conversación con tu cliente a continuación.)`);
      if (msgs[msgs.length - 1].role !== "user") throw new ErrorCliente(400, "Falta la pregunta.");
      return pedir(Respuesta, PREGUNTA, msgs, "low", 8000);
    }
    default:
      throw new ErrorCliente(400, "Acción desconocida.");
  }
}

function cabecerasCors(origen: string | null) {
  return {
    "Access-Control-Allow-Origin": origen && ORIGENES.has(origen) ? origen : "null",
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

async function autorizado(req: Request): Promise<boolean> {
  const auth = req.headers.get("authorization") ?? "";
  // Clave temporal solo para pruebas de despliegue (se borra después).
  const prueba = process.env.TEST_KEY;
  if (prueba && prueba.length >= 32 && auth === `Bearer ${prueba}`) return true;
  if (!auth.toLowerCase().startsWith("bearer ")) return false;
  try {
    await jwtVerify(auth.slice(7), jwks, { issuer });
    return true;
  } catch {
    return false;
  }
}

export default {
  async fetch(req: Request): Promise<Response> {
    const origen = req.headers.get("origin");
    const cors = cabecerasCors(origen);
    const json = (status: number, cuerpo: unknown) => Response.json(cuerpo, { status, headers: cors });

    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (req.method !== "POST") return json(405, { error: "Método no permitido." });
    if (origen && !ORIGENES.has(origen)) return json(403, { error: "Origen no permitido." });
    if (!(await autorizado(req))) return json(401, { error: "Sesión no válida." });

    const texto = await req.text();
    if (texto.length > MAX_BYTES) return json(413, { error: "Demasiados datos." });

    try {
      const { datos, uso } = await atender(JSON.parse(texto));
      return json(200, { datos, uso: { entrada: uso.input_tokens, salida: uso.output_tokens, cache: uso.cache_read_input_tokens ?? 0 } });
    } catch (e: any) {
      if (e instanceof ErrorCliente) return json(e.status, { error: e.message });
      if (e instanceof SyntaxError) return json(400, { error: "JSON no válido." });
      if (e?.name === "ZodError") return json(400, { error: "Datos de perfil incompletos." });
      if (e instanceof Anthropic.RateLimitError) return json(429, { error: "Demasiadas peticiones o sin saldo en el AI Gateway. Revisa los créditos en Neon." });
      if (e instanceof Anthropic.APIError) {
        console.error("Error de la API", e.status, e.message);
        if (e.status === 401 || e.status === 403) {
          cliente = null; // se vuelve a leer la configuración en la próxima petición
          return json(503, { error: "El entrenador aún no tiene acceso a la IA. Falta activar los créditos de Neon o guardar la clave de Anthropic." });
        }
        return json(502, { error: `El servicio de IA ha fallado (${e.status ?? "red"}). Inténtalo de nuevo en un momento.` });
      }
      console.error("Error inesperado", e);
      return json(500, { error: "Error inesperado en el entrenador." });
    }
  },
};
