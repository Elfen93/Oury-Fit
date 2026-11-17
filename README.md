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

- **Con cuenta**: email y contraseña (Neon Auth). Los datos se guardan en Neon (Postgres, proyecto `ouryfit`) en la tabla `ouryfit_datos`, una fila por usuario protegida con Row-Level Security. Primero se guarda todo en el dispositivo y luego se sube; si no hay conexión se reintenta solo.
- **Historial de versiones**: cada vez que se sobrescriben los datos, la versión anterior se copia en `ouryfit_historial` (como mucho una cada 10 minutos, se conservan 200). Sirve para recuperar datos si algo se sobrescribe por error.
- **Modo local**: sin cuenta; los datos se quedan en el navegador. Si luego entras y tu cuenta no tiene datos, se suben.
- **Importar desde Google Sheets**: en Ajustes → Tus datos, para traer una vez lo que quedó en la hoja de la versión anterior.
- Los datos de la versión anterior (v4) guardados en el navegador se migran solos.

### Despliegue

`render.yaml` publica la carpeta como sitio estático en Render y reenvía `/neon-auth/*` al servidor de autenticación de Neon, para que la cookie de sesión sea del mismo dominio que la app. Hay que añadir la URL de Render como dominio de confianza en Neon Auth.

## Estructura

Sin paso de compilación: HTML + módulos ES. Preact, htm y los iconos de Tabler van incluidos en `vendor/` y `js/icons.js` (no depende de CDNs).

```
index.html            entrada
css/app.css           estilos
js/app.js             app, navegación, temporizador de descanso
js/store.js           guardado local + sincronización
js/neon.js            sesión (Neon Auth) y datos (Data API)
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
