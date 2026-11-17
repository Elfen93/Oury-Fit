// Función del entrenador IA de OuryFit (Neon Functions).
// - Solo acepta peticiones de la web de OuryFit con una sesión válida de Neon Auth.
// - Llama a Claude con salidas estructuradas; en revisiones y preguntas, Claude puede consultar
//   todo el historial del usuario con herramientas (leído de la base de datos, filtrado por su usuario).
// - No guarda nada: la app recibe el resultado y lo guarda.
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { neon } from "@neondatabase/serverless";
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { z } from "zod/v4";
import { Perfil, Programa, Respuesta, Revision, TurnoEntrevista } from "./schemas.js";
import { ENTREVISTA, GENERAR, PREGUNTA, REVISAR, SISTEMA } from "./prompts.js";
import { HERRAMIENTAS, ejecutar, type Datos } from "./herramientas.js";

const MODELO = "claude-opus-5-5";
const ORIGENES = new Set(["https://ouryfit-1jvh.onrender.com"]);
const MAX_BYTES = 2_000_000; // admite una foto comprimida
const MAX_VUELTAS = 8;
const TIPOS_IMAGEN = new Set(["image/jpeg", "image/png", "image/webp"]);

const jwks = createRemoteJWKSet(new URL(process.env.NEON_AUTH_JWKS_URL!));
const issuer = new URL(process.env.NEON_AUTH_BASE_URL!).origin;
const sql = process.env.DATABASE_URL ? neon(process.env.DATABASE_URL) : null;

// Acceso a Claude: clave propia de Anthropic en ouryfit_secretos (solo legible por el propietario
// de la base de datos) o, si no hay, el AI Gateway de Neon.
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

// Datos completos del usuario (para las herramientas). Solo su fila, por el `sub` verificado.
async function cargarDatos(userId: string): Promise<Datos> {
  if (!sql) return {};
  const filas = await sql`SELECT data FROM ouryfit_datos WHERE user_id = ${userId}`;
  return ((filas[0] as { data?: Datos } | undefined)?.data) || {};
}

type Esfuerzo = "low" | "medium" | "high";
type Uso = { entrada: number; salida: number; cache: number; vueltas: number };

class ErrorCliente extends Error {
  constructor(public status: number, message: string) { super(message); }
}

// Llamada a Claude con salida estructurada y, si hay datos, herramientas de consulta.
// Streaming + finalMessage() para no chocar con timeouts en respuestas largas.
async function pedir<T extends z.ZodType>(
  schema: T,
  instrucciones: string,
  messages: Anthropic.MessageParam[],
  effort: Esfuerzo,
  maxTokens: number,
  datos: Datos | null = null,
): Promise<{ datos: z.infer<T>; uso: Uso }> {
  const client = await obtenerCliente();
  const uso: Uso = { entrada: 0, salida: 0, cache: 0, vueltas: 0 };
  for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
    const stream = client.messages.stream({
      model: MODELO,
      max_tokens: maxTokens,
      system: [
        { type: "text", text: SISTEMA, cache_control: { type: "ephemeral" } },
        { type: "text", text: instrucciones },
      ],
      messages,
      ...(datos ? { tools: HERRAMIENTAS } : {}),
      output_config: { effort, format: zodOutputFormat(schema) },
    });
    const msg = await stream.finalMessage();
    uso.entrada += msg.usage.input_tokens;
    uso.salida += msg.usage.output_tokens;
    uso.cache += msg.usage.cache_read_input_tokens ?? 0;
    uso.vueltas = vuelta + 1;

    if (msg.stop_reason === "refusal") throw new ErrorCliente(422, "El entrenador no ha podido responder a esto. Prueba a decirlo de otra forma.");
    if (msg.stop_reason === "max_tokens") throw new ErrorCliente(502, "La respuesta del entrenador salió incompleta. Inténtalo de nuevo.");

    if (msg.stop_reason === "tool_use" && datos) {
      // Se devuelve el contenido completo (incluidos los bloques de razonamiento) tal cual.
      messages.push({ role: "assistant", content: msg.content });
      const resultados: Anthropic.ToolResultBlockParam[] = msg.content
        .filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use")
        .map((b) => {
          try {
            return { type: "tool_result", tool_use_id: b.id, content: JSON.stringify(ejecutar(b.name, b.input, datos)) };
          } catch (e: any) {
            return { type: "tool_result", tool_use_id: b.id, content: `Error: ${e?.message || e}`, is_error: true };
          }
        });
      messages.push({ role: "user", content: resultados }); // todos los resultados en un único mensaje
      continue;
    }

    if (msg.parsed_output == null) throw new ErrorCliente(502, "La respuesta del entrenador no tenía el formato esperado. Inténtalo de nuevo.");
    return { datos: msg.parsed_output as z.infer<T>, uso };
  }
  throw new ErrorCliente(502, "El entrenador se ha liado consultando datos. Inténtalo de nuevo.");
}

const ctx = (titulo: string, datos: unknown) => `${titulo}:\n${JSON.stringify(datos)}`;

function historial(chat: unknown, apertura: string, imagen?: { media_type: string; data: string } | null): Anthropic.MessageParam[] {
  const msgs: { role: "user" | "assistant"; content: string }[] = [{ role: "user", content: apertura }];
  for (const m of Array.isArray(chat) ? chat.slice(-30) : []) {
    const texto = String(m?.texto ?? "").slice(0, 4000);
    if (!texto) continue;
    const role = m?.rol === "coach" ? "assistant" : "user";
    const ultimo = msgs[msgs.length - 1];
    if (ultimo.role === role) ultimo.content += `\n\n${texto}`; // los turnos deben alternar
    else msgs.push({ role, content: texto });
  }
  const out: Anthropic.MessageParam[] = msgs;
  const ultimo = msgs[msgs.length - 1];
  if (imagen && ultimo.role === "user") {
    if (!TIPOS_IMAGEN.has(imagen.media_type) || typeof imagen.data !== "string") throw new ErrorCliente(400, "Formato de imagen no admitido.");
    out[out.length - 1] = {
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: imagen.media_type as "image/jpeg", data: imagen.data } },
        { type: "text", text: ultimo.content },
      ],
    };
  }
  return out;
}

async function atender(cuerpo: any, userId: string | null, datosPrueba: Datos | null) {
  const c = cuerpo?.contexto ?? {};
  const datosUsuario = async () => datosPrueba ?? (userId ? await cargarDatos(userId) : {});
  switch (cuerpo?.accion) {
    case "entrevista": {
      const apertura = `${ctx("Datos básicos del cliente", c.basicos)}\n\nEmpieza la entrevista.`;
      const msgs = historial(cuerpo.chat, apertura);
      if (msgs[msgs.length - 1].role !== "user") throw new ErrorCliente(400, "Falta la respuesta del usuario.");
      return pedir(TurnoEntrevista, ENTREVISTA, msgs, "low", 8000);
    }
    case "generar": {
      const perfil = Perfil.parse(c.perfil);
      const contenido = [
        ctx("Datos básicos", c.basicos), ctx("Perfil", perfil), ctx("Notas que recuerdas", c.memoria ?? []),
        ctx("Tu libreta sobre este cliente (puede estar vacía)", c.libreta ?? ""), ctx("Capítulos anteriores (títulos)", c.capitulos ?? []),
      ].join("\n\n");
      const datos = await datosUsuario();
      return pedir(Programa, GENERAR, [{ role: "user", content: `${contenido}\n\nDiseña el programa. Si tiene historial, consúltalo antes para partir de su nivel real.` }], "high", 32000, datos);
    }
    case "revision": {
      const contenido = [
        ctx("Hoy", c.hoy), ctx("Datos básicos", c.basicos), ctx("Perfil", c.perfil),
        ctx("Tu libreta sobre este cliente (puede estar vacía si es la primera revisión)", c.libreta ?? ""),
        ctx("Capítulos que ya escribiste (mes y título)", c.capitulos ?? []),
        ctx("Capítulos pendientes (meses que debes escribir ahora)", c.capitulosPendientes ?? []),
        ctx("Notas sueltas", c.memoria ?? []),
        ctx("Programa actual", c.programa), ctx("Estado de cada ejercicio (peso de trabajo, fallos)", c.estado),
        ctx("Asistencia de las últimas 4 semanas", c.asistencia), ctx("Sesiones de las últimas 4 semanas", c.sesiones),
        ctx("Conversaciones recientes", c.chat ?? []), ctx("Revisiones anteriores", c.revisiones ?? []),
      ].join("\n\n");
      const datos = await datosUsuario();
      return pedir(Revision, REVISAR, [{ role: "user", content: `${contenido}\n\nHaz la revisión.` }], "medium", 32000, datos);
    }
    case "pregunta": {
      const apertura = [
        ctx("Hoy", c.hoy), ctx("Datos básicos", c.basicos), ctx("Perfil", c.perfil),
        ctx("Tu libreta sobre este cliente", c.libreta ?? ""), ctx("Notas sueltas", c.memoria ?? []),
        ctx("Programa actual", c.programa), ctx("Lo que está haciendo ahora (puede ser null)", c.ahora ?? null),
      ].join("\n\n");
      const msgs = historial(cuerpo.chat, `${apertura}\n\n(Conversación con tu cliente a continuación.)`, cuerpo.imagen ?? null);
      if (msgs[msgs.length - 1].role !== "user") throw new ErrorCliente(400, "Falta la pregunta.");
      const datos = await datosUsuario();
      return pedir(Respuesta, PREGUNTA, msgs, cuerpo.imagen ? "medium" : "low", 8000, datos);
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

// Devuelve el id de usuario verificado, "prueba" para la clave temporal de pruebas, o null.
async function autenticar(req: Request): Promise<string | null> {
  const auth = req.headers.get("authorization") ?? "";
  const prueba = process.env.TEST_KEY;
  if (prueba && prueba.length >= 32 && auth === `Bearer ${prueba}`) return "prueba";
  if (!auth.toLowerCase().startsWith("bearer ")) return null;
  try {
    const { payload } = await jwtVerify(auth.slice(7), jwks, { issuer });
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
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
    const usuario = await autenticar(req);
    if (!usuario) return json(401, { error: "Sesión no válida." });

    const texto = await req.text();
    if (texto.length > MAX_BYTES) return json(413, { error: "Demasiados datos (¿foto muy grande?)." });

    try {
      const cuerpo = JSON.parse(texto);
      // Con la clave de pruebas no se leen datos reales: se usan los de prueba que vengan en la petición.
      const datosPrueba = usuario === "prueba" ? (cuerpo.datosPrueba ?? {}) : null;
      const { datos, uso } = await atender(cuerpo, usuario === "prueba" ? null : usuario, datosPrueba);
      return json(200, { datos, uso });
    } catch (e: any) {
      if (e instanceof ErrorCliente) return json(e.status, { error: e.message });
      if (e instanceof SyntaxError) return json(400, { error: "JSON no válido." });
      if (e?.name === "ZodError") return json(400, { error: "Datos de perfil incompletos." });
      if (e instanceof Anthropic.APIError) {
        console.error("Error de la API", e.status, e.message);
        if (e.status === 401 || e.status === 403) {
          cliente = null; // se vuelve a leer la configuración en la próxima petición
          return json(503, { error: "El entrenador no tiene acceso a la IA. Revisa la clave de Anthropic o los créditos." });
        }
        if (e.status === 429) return json(429, { error: "Demasiadas peticiones o sin saldo en Anthropic. Inténtalo en un momento." });
        return json(502, { error: `El servicio de IA ha fallado (${e.status ?? "red"}). Inténtalo de nuevo en un momento.` });
      }
      console.error("Error inesperado", e);
      return json(500, { error: "Error inesperado en el entrenador." });
    }
  },
};
