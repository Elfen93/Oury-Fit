import { html, useState, useEffect, useRef } from "../lib.js";
import { hoy, fechaRelativa, fmtKg, diffDias } from "../calc.js";
import { DIAS } from "../data.js";
import {
  llamar, basicos, programaActual, aplicarPrograma, aplicarRevision, sustituir, anadirMemoria,
  contextoRevision, revisionPendiente, SinAcceso, camino,
} from "../entrenador.js";
import { SinSesion } from "../neon.js";
import { Icon, TopBar, Section, Spinner, useApp, color } from "../ui.js";

// ── Tareas largas del entrenador (viven en App para sobrevivir a cambios de pantalla) ──
export function useTareasCoach({ data, update, cuenta, toast, subir }) {
  const [ocupado, setOcupado] = useState(null); // null | "generar" | "revision"
  const [error, setError] = useState(null);
  const lanzada = useRef(false);
  const ref = useRef(data);
  ref.current = data; // las tareas siempre leen los datos más recientes

  const enCurso = useRef(false); // evita lanzar dos veces la misma tarea (cada llamada cuesta dinero)
  async function ejecutar(tipo, fn) {
    if (enCurso.current) return;
    enCurso.current = true;
    setOcupado(tipo); setError(null);
    try { await fn(); }
    catch (e) { setError({ tipo, msg: e.message, acceso: e instanceof SinAcceso }); if (e instanceof SinSesion) toast("Vuelve a iniciar sesión", "alert-triangle"); }
    finally { enCurso.current = false; setOcupado(null); }
  }

  const generar = () => ejecutar("generar", async () => {
    await subir(); // el entrenador consulta el historial guardado en la base de datos
    const d = ref.current;
    const prog = await llamar("generar", { basicos: basicos(d), perfil: d.coach.perfil, memoria: d.coach.memoria, libreta: d.coach.libreta || "", capitulos: (d.coach.capitulos || []).map((c) => ({ mes: c.mes, titulo: c.titulo })) });
    update((x) => aplicarPrograma(x, prog));
    toast("¡Tu plan está listo!", "sparkles");
  });

  const revisar = () => ejecutar("revision", async () => {
    await subir();
    const rev = await llamar("revision", contextoRevision(ref.current));
    update((x) => aplicarRevision(x, rev));
    toast("Tu entrenador ha revisado tu semana", "sparkles");
  });

  // Revisión semanal automática al abrir la app (una vez por sesión de la app)
  useEffect(() => {
    if (lanzada.current || cuenta?.modo !== "neon" || !data || !navigator.onLine) return;
    if (revisionPendiente(data)) { lanzada.current = true; revisar(); }
  }, [data, cuenta]);

  return { ocupado, error, generar, revisar, limpiarError: () => setError(null) };
}

export function Coach() {
  const app = useApp();
  const { data, cuenta } = app;
  const c = data.coach;

  if (cuenta?.modo !== "neon") return html`<div class="page">
    <${TopBar} titulo="Entrenador"/>
    <section class="card"><p class="dim">El entrenador necesita tu cuenta para funcionar (usa la IA desde el servidor). Entra con tu cuenta desde Ajustes.</p></section>
  </div>`;

  if (!c.perfil) return html`<${Entrevista}/>`;
  if (!c.programa || app.coach.ocupado === "generar") return html`<${Generando}/>`;
  return html`<${Panel}/>`;
}

// ── Entrevista inicial ──
function Entrevista() {
  const { data, update } = useApp();
  const [texto, setTexto] = useState("");
  const [esperando, setEsperando] = useState(false);
  const [error, setError] = useState(null);
  const fin = useRef();
  const conv = data.coach.entrevista;

  async function turno(chat) {
    setEsperando(true); setError(null);
    try {
      const r = await llamar("entrevista", { basicos: basicos(data) }, chat);
      const nuevo = [...chat, { rol: "coach", texto: r.mensaje, opciones: r.opciones || [] }];
      update((d) => ({ ...d, coach: { ...d.coach, entrevista: nuevo, ...(r.terminado && r.perfil ? { perfil: r.perfil } : {}) } }));
    } catch (e) {
      setError(e.message);
    } finally { setEsperando(false); }
  }

  useEffect(() => { if (!conv.length && !esperando) turno([]); }, []);
  useEffect(() => { fin.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [conv.length, esperando]);

  function responder(t) {
    t = (t ?? texto).trim();
    if (!t || esperando) return;
    setTexto("");
    const chat = [...conv, { rol: "usuario", texto: t }];
    update((d) => ({ ...d, coach: { ...d.coach, entrevista: chat } }));
    turno(chat);
  }

  const ultimo = conv[conv.length - 1];
  return html`<div class="page chat-page">
    <${TopBar} titulo="Tu entrenador" sub="Primero, conocerte"/>
    <div class="chat">
      ${conv.length === 0 && !esperando && !error && html`<p class="dim">Preparando la entrevista…</p>`}
      ${conv.map((m) => html`<div class="msg ${m.rol}">${m.texto}</div>`)}
      ${esperando && html`<div class="msg coach typing"><span/><span/><span/></div>`}
      ${error && html`<div class="alert" style="max-width:none">${error} <button class="link" onClick=${() => turno(conv[conv.length - 1]?.rol === "usuario" ? conv : conv)}>Reintentar</button></div>`}
      <div ref=${fin}/>
    </div>
    ${ultimo?.rol === "coach" && ultimo.opciones?.length > 0 && !esperando && html`<div class="quick">
      ${ultimo.opciones.map((o) => html`<button class="press" onClick=${() => responder(o)}>${o}</button>`)}
    </div>`}
    <${Caja} valor=${texto} setValor=${setTexto} onEnviar=${() => responder()} deshabilitado=${esperando} placeholder="Escribe tu respuesta…"/>
  </div>`;
}

const FRASES_GEN = ["Analizando tu perfil…", "Eligiendo ejercicios para ti…", "Calculando pesos de partida…", "Repartiendo los días…", "Escribiendo las claves de técnica…", "Repasando que todo cuadre…"];

function Generando() {
  const { coach: tareas, data, update } = useApp();
  const [i, setI] = useState(0);
  useEffect(() => { const t = setInterval(() => setI((x) => x + 1), 4000); return () => clearInterval(t); }, []);
  useEffect(() => { if (!tareas.ocupado && !tareas.error && !data.coach.programa) tareas.generar(); }, []);
  const err = tareas.error?.tipo === "generar" ? tareas.error : null;
  return html`<div class="page">
    <div class="center-block fade" style="text-align:center;padding-top:4rem">
      ${err ? html`<div class="logo" style="background:var(--rose)"><${Icon} n="alert-triangle" size=${34}/></div>
          <h1>No se pudo crear el plan</h1><p class="dim" style="margin:8px 0 20px">${err.msg}</p>
          ${err.acceso && html`<p class="small faint" style="margin-bottom:16px">Falta dar acceso a la IA: activa los créditos del AI Gateway en Neon o guarda tu clave de Anthropic (te lo explico en el chat de configuración).</p>`}
          <button class="btn primary press" onClick=${() => { tareas.limpiarError(); tareas.generar(); }}>Reintentar</button>
          <button class="link" style="margin-top:14px" onClick=${() => update((d) => ({ ...d, coach: { ...d.coach, perfil: null, entrevista: [] } }))}>Repetir la entrevista</button>`
        : html`<div class="logo pulse"><${Icon} n="sparkles" size=${36}/></div>
          <h1>Diseñando tu plan</h1>
          <p class="dim" style="margin:8px 0 26px">${FRASES_GEN[i % FRASES_GEN.length]}</p>
          <${Spinner}/>
          <p class="small faint" style="margin-top:22px">Tarda alrededor de un minuto. Puedes salir de esta pantalla; te aviso al terminar.</p>`}
    </div>
  </div>`;
}

// ── Panel principal ──
function Panel() {
  const { data, update, coach: tareas, preguntaCoach, setPreguntaCoach, sesion, toast, subir } = useApp();
  const [foto, setFoto] = useState(null); // {media_type, data, url}
  const [verLibreta, setVerLibreta] = useState(false);
  const [capAbierto, setCapAbierto] = useState(null);
  const c = data.coach;
  const [texto, setTexto] = useState(preguntaCoach || "");
  const [esperando, setEsperando] = useState(false);
  const [error, setError] = useState(null);
  const [verMemoria, setVerMemoria] = useState(false);
  const fin = useRef();
  const semana = Math.floor(diffDias(c.programa.inicio, hoy()) / 7) + 1;
  const ultimaRev = c.revisiones[0];
  const proxRevision = Math.max(0, 7 - diffDias(c.ultimaRevision || c.programa.inicio, hoy()));

  useEffect(() => { if (preguntaCoach) setPreguntaCoach(null); }, []);
  useEffect(() => { if (ultimaRev && !ultimaRev.vista) update((d) => ({ ...d, coach: { ...d.coach, revisiones: d.coach.revisiones.map((r, i) => (i === 0 ? { ...r, vista: true } : r)) } })); }, [ultimaRev?.fecha]);
  useEffect(() => { fin.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [c.chat.length, esperando]);

  async function enviar(t) {
    t = (t ?? texto).trim();
    const imagen = foto;
    if (imagen && !t) t = "¿Qué tal mi técnica en esta foto?";
    if (!t || esperando) return;
    setTexto(""); setError(null); setFoto(null);
    const chat = [...c.chat, { rol: "usuario", texto: imagen ? `📷 ${t}` : t, fecha: hoy() }];
    update((d) => ({ ...d, coach: { ...d.coach, chat } }));
    setEsperando(true);
    try {
      await subir().catch(() => {});
      const ahora = sesion ? { sesion: sesion.rutina, ejercicios: sesion.ejercicios.map((e) => e.nombre) } : null;
      const r = await llamar("pregunta", {
        hoy: `${hoy()} (${DIAS[(new Date().getDay() + 6) % 7]})`, basicos: basicos(data), perfil: c.perfil,
        libreta: c.libreta || "", memoria: c.memoria, programa: programaActual(data), ahora,
      }, chat.slice(-16), imagen ? { media_type: imagen.media_type, data: imagen.data } : null);
      update((d) => {
        let nd = { ...d, coach: anadirMemoria({ ...d.coach, chat: [...chat, { rol: "coach", texto: r.respuesta, fecha: hoy(), dolor: r.dolor, cambio: r.sustitucion ? `${r.sustitucion.ejercicioOriginal} → ${r.sustitucion.nuevo.nombre}` : null }].slice(-60) }, r.memoria) };
        if (r.sustitucion) nd = sustituir(nd, r.sustitucion);
        return nd;
      });
      if (r.sustitucion) toast(`Plan actualizado: ${r.sustitucion.nuevo.nombre}`, "arrows-exchange");
    } catch (e) {
      setError(e.message);
    } finally { setEsperando(false); }
  }

  function rehacer() {
    if (!confirm("¿Repetir la entrevista y crear un plan nuevo desde cero? Tu historial se conserva.")) return;
    update((d) => ({ ...d, coach: { ...d.coach, perfil: null, entrevista: [], programa: null } }));
  }

  const err = tareas.error?.tipo === "revision" ? tareas.error : null;
  return html`<div class="page">
    <${TopBar} titulo="Tu entrenador" sub=${`${c.programa.nombre} · semana ${Math.min(semana, c.programa.semanas || semana)}${c.programa.semanas ? ` de ${c.programa.semanas}` : ""}`}/>

    <section class="card coach-plan">
      <p>${c.programa.resumen}</p>
      <div class="plan-days">
        ${DIAS.map((dia, i) => {
          const r = data.rutinas.find((x) => x.id === data.plan[i]);
          return html`<div class=${r ? "on" : ""} style=${r ? `--c:${color(r.acento)}` : ""}><span>${dia.slice(0, 3)}</span><b>${r ? r.corto : "·"}</b></div>`;
        })}
      </div>
    </section>

    ${tareas.ocupado === "revision" && html`<div class="note"><${Spinner} size=${18}/><span>Tu entrenador está revisando tu semana…</span></div>`}
    ${err && html`<div class="alert" style="max-width:none">${err.msg} <button class="link" onClick=${() => { tareas.limpiarError(); tareas.revisar(); }}>Reintentar</button></div>`}

    ${ultimaRev && html`<${Section} titulo=${`Revisión · ${fechaRelativa(ultimaRev.fecha)}`}>
      <p style="line-height:1.5">${ultimaRev.mensaje}</p>
      ${ultimaRev.cambios?.length > 0 && html`<div style="margin-top:10px">${ultimaRev.cambios.map((x) => html`<div class="change"><b>${x.ejercicio}</b>: ${x.cambio}<div class="small faint">${x.motivo}</div></div>`)}</div>`}
    <//>`}

    <div class="row small dim" style="justify-content:space-between;align-items:center;margin:-4px 2px 14px">
      <span>${proxRevision ? `Próxima revisión en ${proxRevision} ${proxRevision === 1 ? "día" : "días"}` : "Revisión pendiente"}</span>
      <button class="link" disabled=${!!tareas.ocupado} onClick=${() => tareas.revisar()}>Revisar ahora</button>
    </div>

    <${Section} titulo="Pregúntale">
      <div class="chat">
        ${c.chat.length === 0 && html`<p class="small dim">Lo que quieras: técnica, una máquina ocupada, una molestia, si hoy no te da tiempo… Te responde con tu plan delante.</p>`}
        ${c.chat.slice(-20).map((m) => html`<div class="msg ${m.rol} ${m.dolor ? "dolor" : ""}">
          ${m.dolor && html`<div class="small" style="font-weight:800;margin-bottom:4px"><${Icon} n="alert-triangle" size=${14}/> Para si duele</div>`}
          ${m.texto}
          ${m.cambio && html`<div class="small" style="margin-top:6px;opacity:.8"><${Icon} n="arrows-exchange" size=${13}/> ${m.cambio}</div>`}
        </div>`)}
        ${esperando && html`<div class="msg coach typing"><span/><span/><span/></div>`}
        ${error && html`<div class="alert" style="max-width:none">${error}</div>`}
        <div ref=${fin}/>
      </div>
      ${c.chat.length === 0 && html`<div class="quick" style="margin:0 0 10px">
        ${["La máquina está ocupada", "Me molesta algo", "Hoy tengo poco tiempo", "¿Cómo hago el primer ejercicio?"].map((q) => html`<button class="press" onClick=${() => enviar(q)}>${q}</button>`)}
      </div>`}
      ${foto && html`<div class="foto-prev"><img src=${foto.url} alt="Foto para el entrenador"/><button class="icon-btn xs press" onClick=${() => setFoto(null)} aria-label="Quitar foto"><${Icon} n="x" size=${14}/></button><span class="small dim">Se envía para analizarla y no se guarda.</span></div>`}
      <${Caja} valor=${texto} setValor=${setTexto} onEnviar=${() => enviar()} deshabilitado=${esperando} placeholder=${foto ? "¿Qué quieres que mire? (opcional)" : "Escribe a tu entrenador…"} onFoto=${async (f) => { try { setFoto(await prepararFoto(f)); } catch { toast("No se pudo leer la foto", "alert-triangle"); } }} conFoto=${!foto} hayFoto=${!!foto}/>
    <//>

    <${Camino} data=${data} capAbierto=${capAbierto} setCapAbierto=${setCapAbierto}/>

    <${Section} titulo="Lo que sabe de ti">
      ${c.libreta ? html`<button class="link" style="margin-bottom:10px" onClick=${() => setVerLibreta(!verLibreta)}>${verLibreta ? "Ocultar su libreta" : "Leer su libreta sobre ti"}</button>
        ${verLibreta && html`<div class="libreta">${c.libreta}</div>`}`
        : html`<p class="small faint" style="margin-bottom:10px">Tras la primera revisión semanal escribirá su libreta sobre ti: tus patrones, qué te funciona y qué está probando.</p>`}
      <div class="small dim" style="line-height:1.55">
        <div><b class="dim">Objetivo:</b> ${c.perfil.objetivo}</div>
        <div><b class="dim">Disponibilidad:</b> ${c.perfil.dias} días · ${c.perfil.minutos} min</div>
        <div><b class="dim">Limitaciones:</b> ${c.perfil.lesiones}</div>
      </div>
      ${c.memoria.length > 0 && html`<button class="link" style="margin-top:10px" onClick=${() => setVerMemoria(!verMemoria)}>${verMemoria ? "Ocultar notas" : `Ver sus notas (${c.memoria.length})`}</button>`}
      ${verMemoria && html`<ul class="mem">${c.memoria.map((m, i) => html`<li>${m} <button class="icon-btn xs press" aria-label="Borrar nota" onClick=${() => update((d) => ({ ...d, coach: { ...d.coach, memoria: d.coach.memoria.filter((_, j) => j !== i) } }))}><${Icon} n="x" size=${13}/></button></li>`)}</ul>`}
      <button class="btn ghost press" style="margin-top:14px" onClick=${rehacer}><${Icon} n="refresh" size=${17}/> Repetir entrevista y plan nuevo</button>
    <//>
  </div>`;
}

// Reduce la foto a 1280 px (JPEG) para enviarla rápido y barata
async function prepararFoto(file) {
  const bmp = await createImageBitmap(file);
  const escala = Math.min(1, 1280 / Math.max(bmp.width, bmp.height));
  const cv = document.createElement("canvas");
  cv.width = Math.round(bmp.width * escala); cv.height = Math.round(bmp.height * escala);
  cv.getContext("2d").drawImage(bmp, 0, 0, cv.width, cv.height);
  const url = cv.toDataURL("image/jpeg", 0.82);
  return { media_type: "image/jpeg", data: url.split(",")[1], url };
}

function Camino({ data, capAbierto, setCapAbierto }) {
  const cm = camino(data);
  const caps = [...(data.coach.capitulos || [])].reverse();
  if (!cm.sesiones) return null;
  const mes = (m) => new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric" }).format(new Date(+m.slice(0, 4), +m.slice(5, 7) - 1, 1));
  return html`<${Section} titulo="Tu camino" extra=${html`<span class="small dim">${cm.sesiones} sesiones desde ${fechaRelativa(cm.desde)}</span>`}>
    ${cm.ejercicios.length > 0 && html`<div class="camino">
      ${cm.ejercicios.map((x) => { const dif = x.actual.kg - x.inicio.kg; return html`<div class="kv">
        <span>${x.nombre}</span>
        <span class="small"><span class="faint">${fmtKg(x.inicio.kg)}×${x.inicio.reps} →</span> <b>${fmtKg(x.actual.kg)}×${x.actual.reps}</b>${dif ? html` <b style="color:${dif > 0 ? "var(--lime)" : "var(--amber)"}">${dif > 0 ? "+" : ""}${fmtKg(dif)}</b>` : ""}</span>
      </div>`; })}
    </div>`}
    ${caps.length > 0 ? html`<div class="label" style="margin:16px 0 8px">Capítulos</div>
      ${caps.map((cp) => html`<div class="hist">
        <button class="hist-row" onClick=${() => setCapAbierto(capAbierto === cp.mes ? null : cp.mes)}>
          <span class="faint small" style="width:92px;text-align:left">${mes(cp.mes).replace(/^./, (x) => x.toUpperCase())}</span>
          <b style="flex:1;text-align:left">${cp.titulo}</b>
          <${Icon} n=${capAbierto === cp.mes ? "chevron-up" : "chevron-down"} size=${16} class="faint"/>
        </button>
        ${capAbierto === cp.mes && html`<p class="small" style="line-height:1.55;padding-bottom:12px;white-space:pre-wrap">${cp.texto}</p>`}
      </div>`)}`
      : html`<p class="small faint" style="margin-top:10px">Al cerrar cada mes, tu entrenador escribe un capítulo de tu historia. Así ninguno de los dos pierde de vista el camino.</p>`}
  <//>`;
}

function Caja({ valor, setValor, onEnviar, deshabilitado, placeholder, onFoto, conFoto, hayFoto }) {
  const input = useRef();
  return html`<form class="chat-box" onSubmit=${(e) => { e.preventDefault(); onEnviar(); }}>
    ${onFoto && conFoto && html`<button type="button" class="icon-btn press" onClick=${() => input.current.click()} aria-label="Enviar foto de técnica"><${Icon} n="camera" size=${19}/></button>
      <input ref=${input} type="file" accept="image/*" capture="environment" style="display:none" onChange=${(e) => { const f = e.target.files?.[0]; if (f) onFoto(f); e.target.value = ""; }}/>`}
    <textarea rows="1" placeholder=${placeholder} value=${valor} onInput=${(e) => { setValor(e.target.value); e.target.style.height = "auto"; e.target.style.height = Math.min(120, e.target.scrollHeight) + "px"; }}
      onKeyDown=${(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onEnviar(); } }}/>
    <button type="submit" class="icon-btn press filled" disabled=${deshabilitado || (!valor.trim() && !hayFoto)} aria-label="Enviar"><${Icon} n="send" size=${19}/></button>
  </form>`;
}
