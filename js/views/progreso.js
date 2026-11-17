import { html, useState } from "../lib.js";
import { DIAS_CORTOS } from "../data.js";
import {
  hoy, rachas, semanaPrograma, lunesDe, sumarDias, fechaCorta, fechaRelativa, fmtKg, r1,
  historialEjercicio, ejerciciosConHistorial, recalcularRecords, fmtSeries, modoEjercicio,
} from "../calc.js";
import { Icon, TopBar, Section, LineChart, useApp, Empty } from "../ui.js";

const SEMANAS = 12;

export function Progreso() {
  const { data, update, toast } = useApp();
  const k = hoy();
  const [pw, setPw] = useState("");
  const ejs = ejerciciosConHistorial(data);
  const [ej, setEj] = useState(ejs[0] || null);
  const [metrica, setMetrica] = useState("top");
  const [abierto, setAbierto] = useState(null);
  const [verTodo, setVerTodo] = useState(false);

  const { actual, mejor } = rachas(data);
  const entrenos = Object.entries(data.registros).sort((a, b) => b[0].localeCompare(a[0]));
  const pesos = Object.entries(data.pesoCorporal).sort((a, b) => a[0].localeCompare(b[0]));
  const records = Object.entries(data.records).sort((a, b) => b[1].peso - a[1].peso);
  const hist = ej ? historialEjercicio(data, ej) : [];

  // Calendario: SEMANAS columnas × 7 filas (lunes arriba)
  const inicio = sumarDias(lunesDe(k), -(SEMANAS - 1) * 7);
  const semanas = Array.from({ length: SEMANAS }, (_, w) => Array.from({ length: 7 }, (_, d) => sumarDias(inicio, w * 7 + d)));
  const ult28 = Array.from({ length: 28 }, (_, i) => sumarDias(k, -i)).filter((x) => data.registros[x]).length;

  function guardarPeso() {
    const v = +String(pw).replace(",", ".");
    if (!v || v < 30 || v > 300) return;
    update((d) => ({ ...d, pesoCorporal: { ...d.pesoCorporal, [k]: v }, profile: { ...d.profile, peso: v } }));
    setPw("");
    toast("Peso guardado");
  }

  function borrarEntreno(fecha) {
    if (!confirm(`¿Borrar el entreno del ${fechaCorta(fecha)}?`)) return;
    update((d) => {
      const registros = { ...d.registros };
      delete registros[fecha];
      const nd = { ...d, registros };
      return { ...nd, records: recalcularRecords(nd) };
    });
    setAbierto(null);
  }

  function borrarPeso(fecha) {
    update((d) => { const p = { ...d.pesoCorporal }; delete p[fecha]; return { ...d, pesoCorporal: p }; });
  }

  const ptsPeso = pesos.slice(-30).map(([f, v]) => ({ x: fechaCorta(f), y: v }));
  const ptsEj = hist.slice(-20).map((h) => ({ x: fechaCorta(h.fecha), y: metrica === "top" ? h.top : metrica === "e1rm" ? r1(h.e1rm) : Math.round(h.volumen) }));
  const deltaPeso = pesos.length >= 2 ? r1(pesos[pesos.length - 1][1] - pesos[0][1]) : null;

  return html`<div class="page">
    <${TopBar} titulo="Progreso" sub="Semana ${semanaPrograma(data)}"/>

    <div class="grid3">
      <div class="card stat"><${Icon} n="flame" size=${20} style="color:var(--amber)"/><b>${actual}</b><span>racha</span></div>
      <div class="card stat"><${Icon} n="star" size=${20} style="color:var(--rose)"/><b>${mejor}</b><span>mejor racha</span></div>
      <div class="card stat"><${Icon} n="barbell" size=${20} style="color:var(--lime)"/><b>${entrenos.length}</b><span>entrenos</span></div>
    </div>

    <${Section} titulo="Constancia" extra=${html`<span class="small lime"><b>${ult28}</b> en 28 días</span>`}>
      <div class="heat">
        <div class="heat-days">${DIAS_CORTOS.map((d) => html`<span>${d}</span>`)}</div>
        ${semanas.map((sem) => html`<div class="heat-col">
          ${sem.map((dk) => {
            const done = !!data.registros[dk];
            const fut = dk > k;
            return html`<div class="heat-cell ${done ? "on" : ""} ${fut ? "fut" : ""} ${dk === k ? "today" : ""}" title=${dk}/>`;
          })}
        </div>`)}
      </div>
      <p class="small faint" style="margin-top:10px">La racha cuenta sesiones seguidas sin saltarte un día de tu plan. Los días de descanso no la rompen.</p>
    <//>

    <${Section} titulo="Peso corporal" extra=${deltaPeso != null && html`<span class="small" style="color:${deltaPeso >= 0 ? "var(--lime)" : "var(--cyan)"}">${deltaPeso > 0 ? "+" : ""}${fmtKg(deltaPeso)} kg</span>`}>
      ${ptsPeso.length >= 2
        ? html`<${LineChart} pts=${ptsPeso} meta=${data.metas.pesoObjetivo} unidad=" kg"/>`
        : html`<p class="small faint" style="text-align:center;padding:12px">Registra tu peso 2 o más días para ver la gráfica.</p>`}
      <div class="row" style="gap:9px;margin-top:14px">
        <input type="text" inputmode="decimal" placeholder=${data.pesoCorporal[k] ? `Hoy: ${fmtKg(data.pesoCorporal[k])} kg` : "Peso de hoy (kg)"}
          value=${pw} onInput=${(e) => setPw(e.target.value)} onKeyDown=${(e) => e.key === "Enter" && guardarPeso()} style="flex:1"/>
        <button class="btn primary press" style="flex:0 0 auto;width:auto;padding:0 20px" onClick=${guardarPeso}>Guardar</button>
      </div>
      ${pesos.length > 0 && html`<details class="more"><summary>Ver registros (${pesos.length})</summary>
        ${pesos.slice().reverse().map(([f, v]) => html`<div class="kv"><span>${fechaRelativa(f)}</span><span class="row" style="gap:8px;align-items:center"><b>${fmtKg(v)} kg</b>
          <button class="icon-btn xs press" onClick=${() => borrarPeso(f)} aria-label="Borrar"><${Icon} n="x" size=${14}/></button></span></div>`)}
      </details>`}
    <//>

    <${Section} titulo="Fuerza por ejercicio">
      ${ejs.length === 0
        ? html`<p class="small faint">Cuando completes entrenos con kilos y repeticiones verás aquí cómo progresas en cada ejercicio.</p>`
        : html`<div>
          <div class="chips">${ejs.map((n) => html`<button class=${n === ej ? "on" : ""} onClick=${() => setEj(n)}>${n}</button>`)}</div>
          <div class="seg sm" style="margin:12px 0">
            ${[["top", "Peso máx."], ["e1rm", "1RM est."], ["vol", "Volumen"]].map(([id, l]) => html`<button class=${metrica === id ? "on" : ""} onClick=${() => setMetrica(id)}>${l}</button>`)}
          </div>
          ${ptsEj.length >= 2
            ? html`<${LineChart} pts=${ptsEj} c="var(--violet)" unidad=" kg"/>`
            : html`<p class="small faint" style="text-align:center;padding:12px">Necesitas 2 sesiones de ${ej} para ver la curva.</p>`}
          ${hist.length > 0 && html`<div class="small dim" style="margin-top:8px">Última: ${fmtSeries("peso", hist[hist.length - 1].sets)}</div>`}
        </div>`}
    <//>

    ${records.length > 0 && html`<${Section} titulo="Récords personales">
      ${records.slice(0, verTodo ? undefined : 6).map(([n, r]) => html`<div class="kv">
        <span>${n}</span><span class="pr">${fmtKg(r.peso)} kg${r.reps ? ` × ${r.reps}` : ""}</span>
      </div>`)}
      ${records.length > 6 && html`<button class="link" style="margin-top:8px" onClick=${() => setVerTodo(!verTodo)}>${verTodo ? "Ver menos" : `Ver los ${records.length}`}</button>`}
    <//>`}

    <${Section} titulo="Historial">
      ${entrenos.length === 0 && html`<${Empty} icon="calendar">Aún no hay sesiones.<//>`}
      ${entrenos.slice(0, 20).map(([f, r]) => html`<div class="hist">
        <button class="hist-row" onClick=${() => setAbierto(abierto === f ? null : f)}>
          <span class="faint small" style="width:64px;text-align:left">${fechaRelativa(f)}</span>
          <b style="flex:1;text-align:left">${r.rutina}</b>
          <span class="small dim">${r.sets} series</span>
          <${Icon} n=${abierto === f ? "chevron-up" : "chevron-down"} size=${16} class="faint"/>
        </button>
        ${abierto === f && html`<div class="hist-body">
          ${(r.minutos || r.volumen) && html`<div class="small dim" style="margin-bottom:8px">${r.minutos ? `${r.minutos} min` : ""}${r.minutos && r.volumen ? " · " : ""}${r.volumen ? `${Math.round(r.volumen).toLocaleString("es-ES")} kg` : ""}</div>`}
          ${(r.ejercicios || []).map((e) => html`<div class="kv small"><span>${e.nombre}</span><span class="dim">${fmtSeries(modoEjercicio(e), e.sets)}</span></div>`)}
          ${!r.ejercicios && html`<p class="small faint">Sesión de la versión anterior (sin detalle por serie).</p>`}
          <button class="btn tiny ghost danger-text press" style="margin-top:10px" onClick=${() => borrarEntreno(f)}><${Icon} n="trash" size=${14}/> Borrar sesión</button>
        </div>`}
      </div>`)}
    <//>
  </div>`;
}
