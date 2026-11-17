import { html, useState, useEffect } from "../lib.js";
import { uid } from "../data.js";
import { hoy, rutinaDelDia, crearSesion, progresoSesion, cerrarSesion, fechaLarga, fmtKg, modoEjercicio, fmtSeries } from "../calc.js";
import { Icon, Bar, TopBar, useApp, color, Empty, Sheet } from "../ui.js";
import { aplicarProgresion, esCoach, sustituir, prescripcion, fmtObjetivo, unidadKg } from "../entrenador.js";

export function useAhora(ms = 1000, activo = true) {
  const [, setT] = useState(0);
  useEffect(() => {
    if (!activo) return;
    const id = setInterval(() => setT((n) => n + 1), ms);
    return () => clearInterval(id);
  }, [ms, activo]);
  return Date.now(); // el estado solo fuerza el repintado; la hora siempre es la real
}

const num = (s) => String(s ?? "").replace(",", ".").replace(/[^\d.]/g, "");

export function Gym() {
  const { sesion, setSesion } = useApp();
  const [resumen, setResumen] = useState(null);
  if (resumen) return html`<${Resumen} r=${resumen} onClose=${() => setResumen(null)}/>`;
  if (!sesion) return html`<${Selector}/>`;
  return html`<${Sesion} sesion=${sesion} setSesion=${setSesion} onFin=${setResumen}/>`;
}

function Selector() {
  const { data, go, setSesion } = useApp();
  const k = hoy();
  const plan = rutinaDelDia(data, k);
  const [sel, setSel] = useState(plan?.id || data.rutinas[0]?.id);
  const rut = data.rutinas.find((r) => r.id === sel);

  return html`<div class="page">
    <${TopBar} titulo="Entrenar" sub=${fechaLarga(k)}>
      <button class="icon-btn press" onClick=${() => go("rutinas")} aria-label="Editar rutinas"><${Icon} n="edit"/></button>
    <//>
    ${data.registros[k] && html`<div class="note"><${Icon} n="circle-check" size=${18}/> Hoy ya registraste ${data.registros[k].rutina}. Si entrenas otra vez se sumará a ese día.</div>`}
    ${!data.rutinas.length && html`<${Empty} icon="barbell">No tienes rutinas. <button class="link" onClick=${() => go("rutinas")}>Crea una</button></${Empty}>`}

    <div class="stack">
      ${data.rutinas.map((r) => {
        const on = r.id === sel, c = color(r.acento);
        const dias = data.plan.map((x, i) => (x === r.id ? i : -1)).filter((i) => i >= 0);
        return html`<button class="routine press ${on ? "on" : ""}" style="--c:${c}" onClick=${() => setSel(r.id)}>
          <div class="routine-ic"><${Icon} n=${r.icon} size=${22}/></div>
          <div style="flex:1;text-align:left;min-width:0">
            <b>${r.nombre}</b>
            <div class="small dim">${r.ejercicios.length} ejercicios${dias.length ? " · " + dias.map((i) => ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"][i]).join(", ") : ""}</div>
          </div>
          ${plan?.id === r.id && html`<span class="badge" style="background:${c}">HOY</span>`}
        </button>`;
      })}
    </div>

    ${rut && html`<section class="card" style="margin-top:14px">
      <div class="card-head"><span class="label">${rut.nombre}</span></div>
      ${rut.ejercicios.map((e) => { const p = prescripcion(data, e); return html`<div class="kv"><span>${e.nombre}</span>
        <span class="small" style="text-align:right;white-space:nowrap"><b style="color:${color(rut.acento)}">${fmtObjetivo(e)}</b>${p?.peso ? html`<br/><span class="dim">${fmtKg(p.peso)} ${unidadKg(e.nombre)}</span>` : ""}</span></div>`; })}
      ${rut.ejercicios.some((e) => esCoach(e)) && html`<p class="small faint" style="margin-top:10px">Pesos de tu entrenador. Se ajustan solos según cómo te vaya cada sesión.</p>`}
      ${!rut.ejercicios.length && html`<p class="small faint">Esta rutina no tiene ejercicios todavía.</p>`}
      <button class="btn primary press" style="margin-top:16px" disabled=${!rut.ejercicios.length}
        onClick=${() => setSesion(crearSesion(data, rut, k))}><${Icon} n="player-play-filled" size=${18}/> Empezar</button>
      ${rut.minima?.length > 0 && html`<button class="btn ghost press" style="margin-top:10px" onClick=${() => {
          const corta = { ...rut, nombre: `${rut.nombre} (versión corta)`, ejercicios: rut.ejercicios.filter((e) => rut.minima.includes(e.nombre)) };
          if (!corta.ejercicios.length) corta.ejercicios = rut.ejercicios.slice(0, 3);
          setSesion(crearSesion(data, corta, k));
        }}><${Icon} n="clock" size=${17}/> Versión corta · ${(rut.ejercicios.filter((e) => rut.minima.includes(e.nombre)).length || 3)} ejercicios</button>
        <p class="small faint" style="text-align:center;margin-top:8px">¿Sin ganas o sin tiempo? La corta también cuenta. Lo importante es ir.</p>`}
    </section>`}
  </div>`;
}

function Sesion({ sesion, setSesion, onFin }) {
  const { data, update, startRest, stopRest, toast, go, setPreguntaCoach } = useApp();
  const ahora = useAhora(1000);
  const [notas, setNotas] = useState({});
  const [cambio, setCambio] = useState(null); // índice del ejercicio a cambiar
  const [cronoActivo, setCronoActivo] = useState(null); // {ei, si, inicio}
  const [enPlan, setEnPlan] = useState(true);
  const ac = color(sesion.acento);
  const p = progresoSesion(sesion);
  const seg = Math.floor((ahora - sesion.inicio) / 1000);
  const reloj = `${Math.floor(seg / 3600) ? Math.floor(seg / 3600) + ":" : ""}${String(Math.floor((seg % 3600) / 60)).padStart(2, "0")}:${String(seg % 60).padStart(2, "0")}`;

  const setEj = (ei, fn) => setSesion({ ...sesion, ejercicios: sesion.ejercicios.map((e, i) => (i === ei ? fn(e) : e)) });

  function cambiar(ei, si, campo, valor) {
    if (campo === "min") { // cardio: se escribe en minutos y se guarda en segundos
      setEj(ei, (e) => ({ ...e, sets: e.sets.map((s, j) => (j === si ? { ...s, min: valor, reps: valor ? String(Math.round(+valor * 60)) : "" } : s)) }));
      return;
    }
    setEj(ei, (e) => {
      const viejo = e.sets[si][campo];
      return {
        ...e,
        sets: e.sets.map((s, j) => {
          if (j === si) return { ...s, [campo]: valor };
          // Propaga el peso a las series siguientes que aún no se han hecho
          if (campo === "kg" && j > si && !s.done && (s.kg === "" || s.kg === viejo)) return { ...s, kg: valor };
          return s;
        }),
      };
    });
  }

  function marcar(ei, si, valor) {
    const e = sesion.ejercicios[ei];
    const s = e.sets[si];
    const modo = modoEjercicio(e);
    const done = valor != null ? true : !s.done;
    let reps = valor != null ? String(valor) : s.reps || (esCoach(e) ? String(e.repsMax) : e.prev?.[si]?.reps ? String(e.prev[si].reps) : String(parseInt(e.reps) || ""));
    if (modo === "cardio" && valor == null) reps = s.min ? String(Math.round(+s.min * 60)) : String(e.repsMax);
    const kg = modo === "peso" ? s.kg || (si > 0 ? e.sets[si - 1].kg : "") : "0";
    setEj(ei, (x) => ({ ...x, sets: x.sets.map((y, j) => (j === si ? { ...y, done, reps: done ? reps : y.reps, kg: done ? kg : y.kg,
      ...(modo === "cardio" && done ? { min: y.min || String(Math.round(+reps / 60)) } : {}) } : y)) }));
    if (done) {
      const rec = data.records[e.nombre];
      if (modo === "peso" && rec && +kg > +rec.peso) toast(`¡Nuevo récord en ${e.nombre}! ${fmtKg(+kg)} kg`, "trophy");
      if (modo !== "cardio") startRest(e.descanso);
    }
  }

  // Cronómetro para isométricos: un toque empieza, otro para y apunta los segundos
  function crono(ei, si) {
    if (cronoActivo && cronoActivo.ei === ei && cronoActivo.si === si) {
      const segs = Math.max(1, Math.round((Date.now() - cronoActivo.inicio) / 1000));
      setCronoActivo(null);
      marcar(ei, si, segs);
    } else setCronoActivo({ ei, si, inicio: Date.now() });
  }

  function serie(ei, delta) {
    setEj(ei, (e) => {
      if (delta > 0) { const u = e.sets[e.sets.length - 1]; return { ...e, sets: [...e.sets, { kg: u?.kg || "", reps: "", done: false }] }; }
      if (e.sets.length <= 1) return e;
      return { ...e, sets: e.sets.slice(0, -1) };
    });
  }

  function anadirEjercicio() {
    const nombre = prompt("Nombre del ejercicio");
    if (!nombre?.trim()) return;
    setSesion({ ...sesion, ejercicios: [...sesion.ejercicios, { id: uid(), nombre: nombre.trim(), series: 3, reps: "10", descanso: 60, notas: "", prev: null, sets: [0, 1, 2].map(() => ({ kg: "", reps: "", done: false })) }] });
  }

  function quitarEjercicio(ei) {
    if (!confirm(`¿Quitar ${sesion.ejercicios[ei].nombre} de esta sesión?`)) return;
    setSesion({ ...sesion, ejercicios: sesion.ejercicios.filter((_, i) => i !== ei) });
  }

  function terminar() {
    if (!p.hechas) return;
    if (p.hechas < p.total && !confirm(`Quedan ${p.total - p.hechas} series sin marcar. ¿Terminar igualmente?`)) return;
    const { registro, records, nuevos, resumen } = cerrarSesion(data, sesion);
    const { estado, cambios } = aplicarProgresion(data.coach?.estado || {}, sesion, sesion.fecha);
    update((d) => ({ ...d, registros: { ...d.registros, [sesion.fecha]: registro }, records, coach: { ...d.coach, estado } }));
    stopRest();
    setSesion(null);
    onFin({ ...resumen, nuevos, cambios, rutina: sesion.rutina, acento: sesion.acento });
  }

  const sentir = (ei, v) => setEj(ei, (e) => ({ ...e, sensacion: e.sensacion === v ? null : v }));

  // Cambia un ejercicio de la sesión por una alternativa (y opcionalmente en el plan)
  function cambiarPor(ei, nombre, tambienPlan) {
    const e = sesion.ejercicios[ei];
    const pesoConocido = data.coach?.estado?.[nombre]?.peso;
    const nuevo = { ...e, id: uid(), nombre, notas: "", prev: null, sensacion: null, pesoPrescrito: pesoConocido ?? null,
      alternativas: [e.nombre, ...(e.alternativas || []).filter((x) => x !== nombre)],
      sets: e.sets.map(() => ({ kg: pesoConocido ? String(pesoConocido) : "", reps: "", done: false })) };
    setSesion({ ...sesion, ejercicios: sesion.ejercicios.map((x, i) => (i === ei ? nuevo : x)) });
    if (tambienPlan) update((d) => sustituir(d, { sesionId: sesion.rutinaId, ejercicioOriginal: e.nombre,
      nuevo: { nombre, tipo: e.tipo || "peso", series: e.series, repsMin: e.repsMin, repsMax: e.repsMax, descanso: e.descanso,
        pesoInicial: pesoConocido ?? 0, incremento: e.incremento || 2.5, tecnica: "", alternativas: nuevo.alternativas } }));
    setCambio(null);
    toast(`Cambiado por ${nombre}${tambienPlan ? " (también en tu plan)" : ""}`);
  }

  function descartar() {
    if (!confirm("¿Descartar esta sesión? No se guardará nada.")) return;
    stopRest();
    setSesion(null);
  }

  return html`<div class="page">
    <${TopBar} titulo=${sesion.rutina} sub="En curso · ${reloj}" acento=${sesion.acento}>
      <button class="icon-btn press" onClick=${descartar} aria-label="Descartar sesión"><${Icon} n="trash"/></button>
    <//>

    <section class="card" style="border-color:${ac}44">
      <div class="row" style="justify-content:space-between;align-items:baseline;margin-bottom:10px">
        <span class="label">Progreso</span><b style="font-size:22px;color:${ac}">${p.pct}%</b>
      </div>
      <${Bar} pct=${p.pct} color=${ac} h=${8}/>
      <div class="row small dim" style="justify-content:space-between;margin-top:8px">
        <span>${p.hechas} de ${p.total} series</span><span>${Math.round(p.volumen).toLocaleString("es-ES")} kg</span>
      </div>
    </section>

    ${sesion.calentamiento && html`<div class="note"><${Icon} n="flame" size=${18}/><span><b>Calentamiento:</b> ${sesion.calentamiento}</span></div>`}

    ${sesion.ejercicios.map((e, ei) => {
      const completo = e.sets.length && e.sets.every((s) => s.done);
      const rec = data.records[e.nombre];
      return html`<section class="card ex ${completo ? "complete" : ""}" style="--c:${ac}" key=${e.id}>
        <div class="row" style="justify-content:space-between;align-items:flex-start;gap:8px">
          <div style="min-width:0">
            <h3>${e.nombre}</h3>
            <div class="small dim"><b style="color:${ac}">${fmtObjetivo(e)}${e.pesoPrescrito ? ` · ${fmtKg(e.pesoPrescrito)} ${unidadKg(e.nombre)}` : ""}</b>${e.tipo === "tiempo" && e.repsMax >= 120 ? "" : ` · ${e.descanso}s descanso`}</div>
          </div>
          <div class="row" style="gap:6px;flex-shrink:0">
            ${rec && html`<span class="pr"><${Icon} n="trophy" size=${13}/>${fmtKg(rec.peso)}</span>`}
            ${e.notas && html`<button class="icon-btn sm press" onClick=${() => setNotas({ ...notas, [ei]: !notas[ei] })} aria-label="Notas"><${Icon} n="bulb" size=${17} style="color:var(--amber)"/></button>`}
            <button class="icon-btn sm press" onClick=${() => setCambio(ei)} aria-label="Cambiar o quitar ejercicio"><${Icon} n="arrows-exchange" size=${17}/></button>
          </div>
        </div>
        ${notas[ei] && html`<div class="tip">${e.notas}</div>`}
        ${esCoach(e) && html`<div class="goal small"><${Icon} n="target" size=${15}/><span>${e.tipo === "peso" && e.pesoPrescrito
          ? html`Objetivo: <b>${e.repsMax} reps</b> en cada serie con <b>${fmtKg(e.pesoPrescrito)} ${unidadKg(e.nombre)}</b>. Si llegas, la próxima vez sube.`
          : e.tipo === "peso" ? html`Primera vez: elige un peso con el que hagas ${e.repsMin}-${e.repsMax} reps sin forzar la técnica.`
          : e.tipo === "tiempo" ? (e.repsMax >= 120 ? html`Objetivo: <b>${Math.round(e.repsMin / 60)}-${Math.round(e.repsMax / 60)} minutos</b> a ritmo constante. Márcalo cuando lo termines.` : html`Objetivo: <b>${e.repsMax} s</b> por serie. Pulsa ▶ para cronometrar y otra vez para parar.`) : html`Objetivo: <b>${e.repsMax} reps</b> por serie.`}</span></div>`}
        ${e.prev && html`<div class="prev small faint"><${Icon} n="history" size=${14}/> Última vez: ${fmtSeries(modoEjercicio(e), e.prev)}</div>`}

        <${Series} e=${e} ei=${ei} cambiar=${cambiar} marcar=${marcar} crono=${crono} cronoActivo=${cronoActivo} ahora=${ahora}/>
        ${esCoach(e) && modoEjercicio(e) !== "cardio" && e.sets.some((x) => x.done) && html`<div class="feel">
          <span class="small dim">¿Cómo fue?</span>
          ${[["facil", "Fácil"], ["justo", "Justo"], ["nopude", "No pude"]].map(([v, l]) => html`<button class="press ${e.sensacion === v ? "on " + v : ""}" onClick=${() => sentir(ei, v)}>${l}</button>`)}
        </div>`}
        ${modoEjercicio(e) !== "cardio" && html`<div class="row" style="gap:8px;margin-top:10px">
          <button class="btn tiny ghost press" onClick=${() => serie(ei, 1)}><${Icon} n="plus" size=${15}/> Serie</button>
          ${e.sets.length > 1 && !e.sets[e.sets.length - 1].done && html`<button class="btn tiny ghost press" onClick=${() => serie(ei, -1)}><${Icon} n="minus" size=${15}/> Serie</button>`}
        </div>`}
      </section>`;
    })}

    <${Sheet} abierto=${cambio != null} onClose=${() => setCambio(null)} titulo=${cambio != null ? `Cambiar ${sesion.ejercicios[cambio]?.nombre}` : ""}>
      ${cambio != null && html`<div>
        ${(sesion.ejercicios[cambio]?.alternativas || []).length > 0 && html`<p class="small dim" style="margin-bottom:10px">Alternativas que trabajan lo mismo:</p>
          <div class="stack" style="margin-bottom:12px">
            ${sesion.ejercicios[cambio].alternativas.map((a) => html`<button class="option press" onClick=${() => cambiarPor(cambio, a, enPlan && esCoach(sesion.ejercicios[cambio]))}><span>${a}</span><${Icon} n="chevron-right" size=${18}/></button>`)}
          </div>
          ${esCoach(sesion.ejercicios[cambio]) && html`<label class="check"><input type="checkbox" checked=${enPlan} onChange=${(e) => setEnPlan(e.target.checked)}/> Cambiarlo también en mi plan</label>`}`}
        <button class="btn ghost press" onClick=${() => { const n = sesion.ejercicios[cambio].nombre; setCambio(null); setPreguntaCoach(`Estoy en el gym con ${n}: `); go("coach"); }}>
          <${Icon} n="message-chatbot" size=${18}/> Preguntar al entrenador</button>
        <button class="btn ghost danger-text press" style="margin-top:10px" onClick=${() => { const i = cambio; setCambio(null); quitarEjercicio(i); }}>
          <${Icon} n="trash" size=${16}/> Quitar de esta sesión</button>
      </div>`}
    <//>

    <button class="btn ghost press" onClick=${anadirEjercicio} style="margin-bottom:12px"><${Icon} n="plus" size=${18}/> Añadir ejercicio</button>
    <button class="btn primary press" disabled=${!p.hechas} onClick=${terminar}>
      <${Icon} n="flag-check" size=${19}/> ${p.hechas ? "Terminar entreno" : "Marca al menos una serie"}
    </button>
  </div>`;
}

// Filas de series según el tipo de ejercicio
function Series({ e, ei, cambiar, marcar, crono, cronoActivo, ahora }) {
  const modo = modoEjercicio(e);
  const check = (s, si) => html`<button class="set-check press" onClick=${() => marcar(ei, si)} aria-label=${s.done ? "Desmarcar serie" : "Marcar serie"}><${Icon} n="check" size=${20}/></button>`;

  if (modo === "cardio") {
    const objetivo = e.repsMin != null ? `${Math.round(e.repsMin / 60)}-${Math.round(e.repsMax / 60)}` : "min";
    return html`<div class="sets">
      ${e.sets.map((s, si) => html`<div class="set-row cardio ${s.done ? "done" : ""}">
        <label class="unit-input"><input type="text" inputmode="decimal" placeholder=${objetivo} value=${s.min ?? (s.reps ? String(Math.round(+s.reps / 60)) : "")}
          onInput=${(ev) => cambiar(ei, si, "min", num(ev.target.value))} aria-label="Minutos"/><span>min</span></label>
        ${check(s, si)}
      </div>`)}
    </div>`;
  }

  if (modo === "iso") return html`<div class="sets">
    <div class="set-row iso head"><span>#</span><span>segundos</span><span/><span/></div>
    ${e.sets.map((s, si) => {
      const activo = cronoActivo && cronoActivo.ei === ei && cronoActivo.si === si;
      const t = activo ? Math.floor((ahora - cronoActivo.inicio) / 1000) : null;
      return html`<div class="set-row iso ${s.done ? "done" : ""}">
        <span class="set-n">${si + 1}</span>
        <input type="text" inputmode="numeric" placeholder=${e.repsMax ?? "s"} value=${activo ? String(t) : s.reps}
          onInput=${(ev) => cambiar(ei, si, "reps", num(ev.target.value))} aria-label="Segundos serie ${si + 1}" readonly=${activo}/>
        <button class="crono press ${activo ? "on" : ""}" onClick=${() => crono(ei, si)} aria-label=${activo ? "Parar cronómetro" : "Iniciar cronómetro"}>
          <${Icon} n=${activo ? "player-stop-filled" : "player-play-filled"} size=${16}/>
        </button>
        ${check(s, si)}
      </div>`;
    })}
  </div>`;

  if (modo === "corporal") return html`<div class="sets">
    <div class="set-row corporal head"><span>#</span><span>reps</span><span/></div>
    ${e.sets.map((s, si) => html`<div class="set-row corporal ${s.done ? "done" : ""}">
      <span class="set-n">${si + 1}</span>
      <input type="text" inputmode="numeric" placeholder=${e.prev?.[si]?.reps ?? String(e.repsMax ?? e.reps)} value=${s.reps}
        onInput=${(ev) => cambiar(ei, si, "reps", num(ev.target.value))} aria-label="Repeticiones serie ${si + 1}"/>
      ${check(s, si)}
    </div>`)}
  </div>`;

  return html`<div class="sets">
    <div class="set-row head"><span>#</span><span>kg</span><span>reps</span><span/></div>
    ${e.sets.map((s, si) => html`<div class="set-row ${s.done ? "done" : ""}">
      <span class="set-n">${si + 1}</span>
      <input type="text" inputmode="decimal" placeholder=${e.prev?.[si]?.kg ?? "kg"} value=${s.kg}
        onInput=${(ev) => cambiar(ei, si, "kg", num(ev.target.value))} aria-label="Kilos serie ${si + 1}"/>
      <input type="text" inputmode="numeric" placeholder=${e.prev?.[si]?.reps ?? String(e.repsMax ?? e.reps)} value=${s.reps}
        onInput=${(ev) => cambiar(ei, si, "reps", num(ev.target.value))} aria-label="Repeticiones serie ${si + 1}"/>
      ${check(s, si)}
    </div>`)}
  </div>`;
}

function Resumen({ r, onClose }) {
  const { go } = useApp();
  const c = color(r.acento);
  return html`<div class="page">
    <div class="center-block fade">
      <div class="logo" style="background:${c};margin:0 auto 16px"><${Icon} n="trophy" size=${36}/></div>
      <h1 style="text-align:center">¡Entreno completado!</h1>
      <p class="dim" style="text-align:center;margin-top:4px">${r.rutina}</p>
    </div>
    <div class="grid3" style="margin:22px 0 14px">
      <div class="card stat"><b>${r.hechas}</b><span>series</span></div>
      <div class="card stat"><b>${r.minutos}</b><span>min</span></div>
      <div class="card stat"><b>${r.volumen >= 10000 ? (r.volumen / 1000).toFixed(1).replace(".", ",") + "t" : r.volumen}</b><span>kg totales</span></div>
    </div>
    ${r.cambios?.length > 0 && html`<section class="card" style="border-color:var(--lime)">
      <div class="card-head"><span class="label lime">Próxima vez</span><${Icon} n="trending-up" size=${18} class="lime"/></div>
      ${r.cambios.map((c) => html`<div class="kv"><span>${c.nombre}</span><b style="color:${c.sube ? "var(--lime)" : "var(--amber)"}">${fmtKg(c.antes)} → ${fmtKg(c.despues)} kg</b></div>`)}
      <p class="small faint" style="margin-top:8px">Tu entrenador ajusta los pesos solo según lo que has hecho hoy.</p>
    </section>`}
    ${r.nuevos.length > 0 && html`<section class="card" style="border-color:var(--amber)">
      <div class="card-head"><span class="label" style="color:var(--amber)">Nuevos récords</span><${Icon} n="trophy" size=${18} style="color:var(--amber)"/></div>
      ${r.nuevos.map((n) => html`<div class="kv"><span>${n.nombre}</span><b>${fmtKg(n.kg)} kg × ${n.reps}${n.antes != null ? html` <span class="faint small">(antes ${fmtKg(n.antes)})</span>` : ""}</b></div>`)}
    </section>`}
    <button class="btn primary press" onClick=${() => { onClose(); go("hoy"); }}>Volver al inicio</button>
    <button class="btn ghost press" style="margin-top:10px" onClick=${() => { onClose(); go("progreso"); }}>Ver progreso</button>
  </div>`;
}
