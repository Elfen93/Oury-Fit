import { html, useState, useEffect } from "../lib.js";
import { uid } from "../data.js";
import { hoy, rutinaDelDia, crearSesion, progresoSesion, cerrarSesion, fechaLarga, fmtKg } from "../calc.js";
import { Icon, Bar, TopBar, useApp, color, Empty } from "../ui.js";

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
      ${rut.ejercicios.map((e) => html`<div class="kv"><span>${e.nombre}</span><b class="small" style="color:${color(rut.acento)}">${e.series}×${e.reps}</b></div>`)}
      ${!rut.ejercicios.length && html`<p class="small faint">Esta rutina no tiene ejercicios todavía.</p>`}
      <button class="btn primary press" style="margin-top:16px" disabled=${!rut.ejercicios.length}
        onClick=${() => setSesion(crearSesion(data, rut, k))}><${Icon} n="player-play-filled" size=${18}/> Empezar</button>
    </section>`}
  </div>`;
}

function Sesion({ sesion, setSesion, onFin }) {
  const { data, update, startRest, stopRest, toast } = useApp();
  const ahora = useAhora(1000);
  const [notas, setNotas] = useState({});
  const ac = color(sesion.acento);
  const p = progresoSesion(sesion);
  const seg = Math.floor((ahora - sesion.inicio) / 1000);
  const reloj = `${Math.floor(seg / 3600) ? Math.floor(seg / 3600) + ":" : ""}${String(Math.floor((seg % 3600) / 60)).padStart(2, "0")}:${String(seg % 60).padStart(2, "0")}`;

  const setEj = (ei, fn) => setSesion({ ...sesion, ejercicios: sesion.ejercicios.map((e, i) => (i === ei ? fn(e) : e)) });

  function cambiar(ei, si, campo, valor) {
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

  function marcar(ei, si) {
    const e = sesion.ejercicios[ei];
    const s = e.sets[si];
    const done = !s.done;
    const reps = s.reps || (e.prev?.[si]?.reps ? String(e.prev[si].reps) : String(parseInt(e.reps) || ""));
    const kg = s.kg || (si > 0 ? e.sets[si - 1].kg : "");
    setEj(ei, (x) => ({ ...x, sets: x.sets.map((y, j) => (j === si ? { ...y, done, reps: done ? reps : y.reps, kg: done ? kg : y.kg } : y)) }));
    if (done) {
      const rec = data.records[e.nombre];
      if (rec && +kg > +rec.peso) toast(`¡Nuevo récord en ${e.nombre}! ${fmtKg(+kg)} kg`, "trophy");
      startRest(e.descanso);
    }
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
    update((d) => ({ ...d, registros: { ...d.registros, [sesion.fecha]: registro }, records }));
    stopRest();
    setSesion(null);
    onFin({ ...resumen, nuevos, rutina: sesion.rutina, acento: sesion.acento });
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

    ${sesion.ejercicios.map((e, ei) => {
      const completo = e.sets.length && e.sets.every((s) => s.done);
      const rec = data.records[e.nombre];
      return html`<section class="card ex ${completo ? "complete" : ""}" style="--c:${ac}" key=${e.id}>
        <div class="row" style="justify-content:space-between;align-items:flex-start;gap:8px">
          <div style="min-width:0">
            <h3>${e.nombre}</h3>
            <div class="small dim"><b style="color:${ac}">${e.series}×${e.reps}</b> · ${e.descanso}s descanso</div>
          </div>
          <div class="row" style="gap:6px;flex-shrink:0">
            ${rec && html`<span class="pr"><${Icon} n="trophy" size=${13}/>${fmtKg(rec.peso)}</span>`}
            ${e.notas && html`<button class="icon-btn sm press" onClick=${() => setNotas({ ...notas, [ei]: !notas[ei] })} aria-label="Notas"><${Icon} n="bulb" size=${17} style="color:var(--amber)"/></button>`}
            <button class="icon-btn sm press" onClick=${() => quitarEjercicio(ei)} aria-label="Quitar ejercicio"><${Icon} n="x" size=${17}/></button>
          </div>
        </div>
        ${notas[ei] && html`<div class="tip">${e.notas}</div>`}
        ${e.prev && html`<div class="prev small faint"><${Icon} n="history" size=${14}/> Última vez: ${e.prev.map((s) => `${fmtKg(s.kg)}×${s.reps}`).join(" · ")}</div>`}

        <div class="sets">
          <div class="set-row head"><span>#</span><span>kg</span><span>reps</span><span/></div>
          ${e.sets.map((s, si) => html`<div class="set-row ${s.done ? "done" : ""}">
            <span class="set-n">${si + 1}</span>
            <input type="text" inputmode="decimal" placeholder=${e.prev?.[si]?.kg ?? "kg"} value=${s.kg}
              onInput=${(ev) => cambiar(ei, si, "kg", num(ev.target.value))} aria-label="Kilos serie ${si + 1}"/>
            <input type="text" inputmode="numeric" placeholder=${e.prev?.[si]?.reps ?? String(e.reps)} value=${s.reps}
              onInput=${(ev) => cambiar(ei, si, "reps", num(ev.target.value))} aria-label="Repeticiones serie ${si + 1}"/>
            <button class="set-check press" onClick=${() => marcar(ei, si)} aria-label=${s.done ? "Desmarcar serie" : "Marcar serie"}>
              <${Icon} n="check" size=${20}/>
            </button>
          </div>`)}
        </div>
        <div class="row" style="gap:8px;margin-top:10px">
          <button class="btn tiny ghost press" onClick=${() => serie(ei, 1)}><${Icon} n="plus" size=${15}/> Serie</button>
          ${e.sets.length > 1 && !e.sets[e.sets.length - 1].done && html`<button class="btn tiny ghost press" onClick=${() => serie(ei, -1)}><${Icon} n="minus" size=${15}/> Serie</button>`}
        </div>
      </section>`;
    })}

    <button class="btn ghost press" onClick=${anadirEjercicio} style="margin-bottom:12px"><${Icon} n="plus" size=${18}/> Añadir ejercicio</button>
    <button class="btn primary press" disabled=${!p.hechas} onClick=${terminar}>
      <${Icon} n="flag-check" size=${19}/> ${p.hechas ? "Terminar entreno" : "Marca al menos una serie"}
    </button>
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
    ${r.nuevos.length > 0 && html`<section class="card" style="border-color:var(--amber)">
      <div class="card-head"><span class="label" style="color:var(--amber)">Nuevos récords</span><${Icon} n="trophy" size=${18} style="color:var(--amber)"/></div>
      ${r.nuevos.map((n) => html`<div class="kv"><span>${n.nombre}</span><b>${fmtKg(n.kg)} kg × ${n.reps}${n.antes != null ? html` <span class="faint small">(antes ${fmtKg(n.antes)})</span>` : ""}</b></div>`)}
    </section>`}
    <button class="btn primary press" onClick=${() => { onClose(); go("hoy"); }}>Volver al inicio</button>
    <button class="btn ghost press" style="margin-top:10px" onClick=${() => { onClose(); go("progreso"); }}>Ver progreso</button>
  </div>`;
}
