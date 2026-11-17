# OuryFit

App web (PWA) para registrar el gimnasio, la comida y el progreso. Pensada para el móvil: se instala desde el navegador («Añadir a pantalla de inicio») y funciona sin conexión.

## Qué hace

- **Hoy**: el entreno que toca según tu plan, calorías y macros del día, agua, peso y la semana de un vistazo.
- **Gym**: registro serie a serie (kg y repeticiones), «última vez» de cada ejercicio, kilos que se copian solos a las series siguientes, descanso con aviso (vibración y pitido), récords personales y resumen al terminar. Se pueden añadir series o ejercicios sobre la marcha. Si cierras la app a mitad, la sesión sigue ahí.
- **Rutinas**: crea y edita rutinas y ejercicios (series, reps, descanso, notas) y asigna cada día de la semana.
- **Comer**: base de alimentos y tus propios alimentos, raciones (½, 1, 1½…), entrada manual, agua, navegar por días y repetir lo del día anterior.
- **Progreso**: racha real (no se rompe en días de descanso), calendario de 12 semanas, gráfica de peso con meta, gráfica de fuerza por ejercicio (peso máximo, 1RM estimado, volumen), récords e historial.
- **Ajustes**: perfil, metas (calculadas con Mifflin-St Jeor según objetivo y días de entreno, o a mano), copia de seguridad JSON, restaurar, exportar CSV.

## Datos

- **Con Google**: inicia sesión y los datos se guardan en tu hoja mediante el Apps Script (`SCRIPT_URL` en `js/data.js`). Primero se guarda todo en el dispositivo y luego se sube; si no hay conexión se reintenta solo.
- **Modo local**: sin cuenta; los datos se quedan en el navegador. Si luego entras con Google y tu hoja está vacía, se suben.
- Los datos de la versión anterior (v4) se migran solos.

El contrato con el Apps Script no cambia (`perfil`, `entrenos`, `comidas`, `agua`, `peso`, `records`). Las rutinas, el plan semanal y los alimentos propios viajan dentro de `perfil`.

## Estructura

Sin paso de compilación: HTML + módulos ES. Preact, htm y los iconos de Tabler van incluidos en `vendor/` y `js/icons.js` (no depende de CDNs).

```
index.html            entrada
css/app.css           estilos
js/app.js             app, navegación, temporizador de descanso
js/store.js           guardado local + sincronización con Google Sheets
js/data.js            configuración, rutinas y alimentos por defecto, migración
js/calc.js            lógica: fechas, rachas, historial, récords, nutrición
js/ui.js              componentes compartidos
js/views/*.js         pantallas
sw.js                 caché sin conexión (sube CACHE al publicar cambios)
```

Para probar en local hace falta servir la carpeta (los módulos no cargan con `file://`):

```bash
python3 -m http.server 8000
```
