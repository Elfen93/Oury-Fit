// Cloudflare Pages Function: reenvía /neon-auth/* al servidor de autenticación de Neon.
// Así la cookie de sesión queda en el mismo dominio que la app y ningún navegador la bloquea
// (sin esto, Safari y otros navegadores bloquean la cookie de un dominio ajeno).
const DESTINO = "https://ep-frosty-wildflower-a1axnxg9.neonauth.ap-southeast-1.aws.neon.tech/neondb/auth";

export async function onRequest({ request, params }) {
  const url = new URL(request.url);
  const ruta = Array.isArray(params.path) ? params.path.join("/") : params.path || "";
  const headers = new Headers(request.headers);
  headers.delete("host");
  const respuesta = await fetch(`${DESTINO}/${ruta}${url.search}`, {
    method: request.method,
    headers,
    body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
    redirect: "manual",
  });
  // Se devuelve tal cual: estado, cookies (Set-Cookie) y la cabecera set-auth-jwt incluidas
  return new Response(respuesta.body, { status: respuesta.status, statusText: respuesta.statusText, headers: respuesta.headers });
}
