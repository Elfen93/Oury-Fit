import { html, useState } from "../lib.js";
import { DIAS, ACENTOS, ICONOS_RUTINA, uid, calcularMetas } from "../data.js";
import { Icon, TopBar, Section, useApp, color } from "../ui.js";

export function Rutinas() {
  const { data, update, go, back } = useApp();
  const [abierta, setAbierta] = useState(null);

  const setRutina = (id, fn) => update((d) => ({ ...d, rutinas: d.rutinas.map((r) => (r.id === id ? fn(r) : r)) }));
  const setEj = (rid, eid, campo, valor) =>
    setRutina(rid, (r) => ({ ...r, ejercicios: r.ejercicios.map((e) => {
      if (e.id !== eid) return e;
      const n = { ...e, [campo]: valor };
      // Mantiene coherente el rango que usa el entrenador para la progresión
      const m = campo === "reps" && e.repsMin != null && String(valor).match(/(\d+)\s*-\s*(\d+)/);
      if (m) { n.repsMin = +m[1]; n.repsMax = +m[2]; }
      if (campo === "notas" && e.tecnica != null) n.tecnica = valor;
      return n;
    }) }));

  function mover(rid, i, dir) {
    setRutina(rid, (r) => {
      const ej = [...r.ejercicios];
      const j = i + dir;
      if (j < 0 || j >= ej.length) return r;
      [ej[i], ej[j]] = [ej[j], ej[i]];
      return { ...r, ejercicios: ej };
    });
  }

  function nuevaRutina() {
    const id = uid();
    const usados = new Set(data.rutinas.map((r) => r.acento));
    update((d) => ({
      ...d,
      rutinas: [...d.rutinas, { id, nombre: "Nueva rutina", corto: "Nueva", icon: "barbell", acento: ACENTOS.find((a) => !usados.has(a)) || "lime", ejercicios: [] }],
    }));
    setAbierta(id);
  }

  function borrarRutina(r) {
    if (!confirm(`¿Borrar la rutina "${r.nombre}"? El historial de entrenos se conserva.`)) return;
    update((d) => ({ ...d, rutinas: d.rutinas.filter((x) => x.id !== r.id), plan: d.plan.map((x) => (x === r.id ? null : x)) }));
  }

  function setPlan(i, id) {
    update((d) => {
      const plan = d.plan.map((x, j) => (j === i ? id || null : x));
      return { ...d, plan };
    });
  }

  const dias = data.plan.filter(Boolean).length;

  return html`<div class="page">
    <${TopBar} titulo="Rutinas" sub="Tu programa" onBack=${back}/>

    <${Section} titulo="Plan semanal" extra=${html`<span class="small dim">${dias} días de entreno</span>`}>
      ${DIAS.map((dia, i) => html`<div class="kv">
        <span>${dia}</span>
        <select value=${data.plan[i] || ""} onChange=${(e) => setPlan(i, e.target.value)}>
          <option value="">Descanso</option>
          ${data.rutinas.map((r) => html`<option value=${r.id}>${r.nombre}</option>`)}
        </select>
      </div>`)}
    <//>

    ${data.rutinas.map((r) => {
      const on = abierta === r.id, c = color(r.acento);
      return html`<section class="card" style="border-color:${on ? c + "66" : ""}">
        <button class="routine-head" onClick=${() => setAbierta(on ? null : r.id)}>
          <div class="routine-ic" style="--c:${c}"><${Icon} n=${r.icon} size=${20}/></div>
          <div style="flex:1;text-align:left;min-width:0"><b>${r.nombre}</b><div class="small dim">${r.ejercicios.length} ejercicios</div></div>
          <${Icon} n=${on ? "chevron-up" : "chevron-down"} size=${18} class="faint"/>
        </button>

        ${on && html`<div style="margin-top:14px">
          <div class="grid2">
            <label class="field"><span>Nombre</span><input value=${r.nombre} onChange=${(e) => setRutina(r.id, (x) => ({ ...x, nombre: e.target.value || "Rutina" }))}/></label>
            <label class="field"><span>Nombre corto</span><input value=${r.corto} maxlength="10" onChange=${(e) => setRutina(r.id, (x) => ({ ...x, corto: e.target.value || x.nombre.slice(0, 8) }))}/></label>
          </div>
          <div class="field"><span>Color</span><div class="row" style="gap:8px">
            ${ACENTOS.map((a) => html`<button class="swatch ${r.acento === a ? "on" : ""}" style="background:${color(a)}" onClick=${() => setRutina(r.id, (x) => ({ ...x, acento: a }))} aria-label=${a}/>`)}
          </div></div>
          <div class="field"><span>Icono</span><div class="row" style="gap:6px;flex-wrap:wrap">
            ${ICONOS_RUTINA.map((ic) => html`<button class="icon-btn sm ${r.icon === ic ? "sel" : ""}" style="--c:${c}" onClick=${() => setRutina(r.id, (x) => ({ ...x, icon: ic }))} aria-label=${ic}><${Icon} n=${ic} size=${18}/></button>`)}
          </div></div>

          <div class="label" style="margin:18px 0 10px">Ejercicios</div>
          ${r.ejercicios.map((e, i) => html`<div class="ex-edit" key=${e.id}>
            <div class="row" style="gap:6px;align-items:center">
              <input value=${e.nombre} onChange=${(ev) => setEj(r.id, e.id, "nombre", ev.target.value || "Ejercicio")} style="flex:1;font-weight:600"/>
              <button class="icon-btn xs press" disabled=${i === 0} onClick=${() => mover(r.id, i, -1)} aria-label="Subir"><${Icon} n="arrow-up" size=${15}/></button>
              <button class="icon-btn xs press" disabled=${i === r.ejercicios.length - 1} onClick=${() => mover(r.id, i, 1)} aria-label="Bajar"><${Icon} n="arrow-down" size=${15}/></button>
              <button class="icon-btn xs danger press" onClick=${() => confirm(`¿Quitar ${e.nombre}?`) && setRutina(r.id, (x) => ({ ...x, ejercicios: x.ejercicios.filter((y) => y.id !== e.id) }))} aria-label="Quitar"><${Icon} n="x" size=${15}/></button>
            </div>
            <div class="grid3" style="margin-top:8px">
              <label class="field sm"><span>Series</span><input type="number" inputmode="numeric" min="1" max="10" value=${e.series} onChange=${(ev) => setEj(r.id, e.id, "series", Math.max(1, Math.min(10, +ev.target.value || 1)))}/></label>
              <label class="field sm"><span>Reps</span><input value=${e.reps} onChange=${(ev) => setEj(r.id, e.id, "reps", ev.target.value || "10")}/></label>
              <label class="field sm"><span>Descanso (s)</span><input type="number" inputmode="numeric" step="15" value=${e.descanso} onChange=${(ev) => setEj(r.id, e.id, "descanso", Math.max(0, +ev.target.value || 0))}/></label>
            </div>
            <input placeholder="Notas de técnica (opcional)" value=${e.notas} onChange=${(ev) => setEj(r.id, e.id, "notas", ev.target.value)} style="margin-top:8px;font-size:13px"/>
          </div>`)}
          <button class="btn ghost press" onClick=${() => setRutina(r.id, (x) => ({ ...x, ejercicios: [...x.ejercicios, { id: uid(), nombre: "Nuevo ejercicio", series: 3, reps: "10-12", descanso: 60, notas: "" }] }))}>
            <${Icon} n="plus" size=${17}/> Añadir ejercicio
          </button>
          <button class="btn ghost danger-text press" style="margin-top:10px" onClick=${() => borrarRutina(r)}><${Icon} n="trash" size=${16}/> Borrar rutina</button>
        </div>`}
      </section>`;
    })}

    <button class="btn primary press" onClick=${nuevaRutina}><${Icon} n="plus" size=${18}/> Nueva rutina</button>
    <p class="small faint" style="text-align:center;margin-top:12px">Los cambios se guardan solos. Si cambias los días de entreno, revisa tus metas en Ajustes.</p>
  </div>`;
}
