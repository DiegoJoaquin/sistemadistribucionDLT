# KPIs diarios · DLT Sports

Reemplazo del Excel `KPIs_Diarios_DLT` que usa el área de Distribución para
registrar el desempeño diario de las cinco cuentas: Instagram DLT
(@dltsports), Instagram DBF (@debuenafuente.dlt), TikTok (@dltsportsoficial),
YouTube (@dltsportstv) y Twitter/X.

Next.js 16 · TypeScript · Tailwind v4 · Supabase (Postgres + Auth).

---

## Puesta en marcha (local)

Necesitas Docker Desktop corriendo, porque Supabase local levanta Postgres,
Auth y el resto de los servicios en contenedores.

```bash
npm install
npx supabase start
```

`supabase start` imprime las claves al terminar. Copia `.env.example` a
`.env.local` y pega el valor de `anon key`:

```bash
cp .env.example .env.local
```

Aplica el esquema y crea los tres usuarios de prueba:

```bash
npx supabase db reset
```

Y levanta la aplicación:

```bash
npm run dev
```

Usuarios de prueba (solo local), contraseña `kpis2026`:
`cata@dltsports.cl`, `matias@dltsports.cl`, `fernanda@dltsports.cl`.

---

## Cómo se usa

1. **Línea base** — sube las exportaciones de un mes completo. La cuenta y la
   red se detectan solas leyendo el propio archivo. Para Instagram conviene
   subir las dos fuentes: Iconosquare trae alcance y visualizaciones, el CSV de
   Meta trae los nuevos seguidores. Después marca ese mes como referencia
   activa.

   La primera fuente que subas de una plataforma es la **canónica**: define
   cuántas publicaciones tiene ese mes. Las siguientes solo completan campos
   vacíos de esas mismas publicaciones — nunca agregan filas. Es lo que evita
   que subir las dos exportaciones de Instagram cuente el mes dos veces.
2. **Registro** — la vista de todos los días. Una fila por plataforma y
   categoría, con las variaciones contra la línea base al costado.
3. **Panel diario** — el equivalente al bloque "COMPARACIÓN POR DÍA" del Excel.
4. **Histórico** — todos los días cargados, del más reciente al más antiguo, con
   el total de cada plataforma y sus variaciones. Desde acá también se importa
   la hoja de registro del Excel de KPIs, para traer lo que ya estaba cargado a
   mano.
5. **Métricas de perfil** — aparte, porque se ingresan a mano y todavía no
   tienen línea base.
6. **Reporte** — escribe la lectura del día y previsualiza el correo.

---

## Las siete reglas que no se pueden romper

Están en la especificación como §9 y son las que fallaron en el Excel. Cada una
está blindada en el código y cubierta por tests:

| Regla | Dónde vive | Test |
|---|---|---|
| 1. Los valores del día son promedios por publicación, nunca sumas | `promedioPorPublicacion` en `src/lib/dominio/calculo.ts` | `calculo.test.ts` reproduce el `+859%` del Excel y muestra que el valor real era `-31,5%` |
| 2. El TOTAL no se calcula sumando categorías | `filasDeTotal` y la vista `lineas_base_detalle` | `calculo.test.ts` y `esquema.test.ts` |
| 3. Plataforma y categoría son enums, nunca texto libre | tipos de TS + `create type` en Postgres | `esquema.test.ts` rechaza `"Normal (informativo)"` |
| 4. Sin dato no es cero | todas las métricas son nullable; los promedios ignoran nulos | `calculo.test.ts` |
| 5. `publicaciones` refleja cuántas publicaciones representa la fila | `check (publicaciones >= 1)` + validación en el formulario | `esquema.test.ts` |
| 6. YouTube no tiene alcance | `check (plataforma <> 'YouTube' or alcance is null)` | `esquema.test.ts` |
| 7. Las métricas de perfil no tienen línea base | vista propia, sin columnas de variación | `calculo.test.ts` |

```bash
npm test
```

Los tests de importación corren contra los archivos de exportación **reales**
que están en la carpeta padre, y contrastan los promedios con los que el Excel
ya había calculado para agosto 2026. Si un lector se rompe, el promedio deja de
calzar.

---

## Seguridad: quién puede ver los datos

La `anon key` de Supabase es **pública por diseño** — viaja al navegador de
cualquiera que abra la aplicación. Por eso hay que hacer dos cosas en el panel
de Supabase, en **Authentication → Sign In / Providers → Email**:

- **Desactivar "Allow new users to sign up".** Si queda activo, cualquiera con
  esa clave puede crearse una cuenta llamando a la API, sin pasar por la
  aplicación.
- **Desactivar "Confirm email"**, o crear cada usuario con *Auto Confirm User*
  marcado. Una cuenta sin confirmar no puede iniciar sesión.

Además, **tener sesión no alcanza para ver nada**. Cada persona se habilita a
mano con `perfiles.autorizado`, y todas las políticas de RLS pasan por esa
puerta. Así, si los registros quedaran abiertos por descuido, quien se
registrara solo vería exactamente cero filas y no podría escribir ninguna. Para
sumar a alguien al equipo, después de crear su usuario:

```sql
update public.perfiles set autorizado = true where email = 'nuevo@dltsports.cl';
```

Está cubierto por `src/lib/datos/autorizacion.test.ts`, que levanta un Postgres
con RLS activo y comprueba que un usuario no autorizado no puede leer, escribir,
borrar, cambiar la línea base activa ni autorizarse a sí mismo.

## Decisiones que conviene conocer

**El engagement se calcula como razón de sumas.** El Excel promediaba las
razones por publicación para la línea base (`AVERAGE` de la columna de
engagement) pero dividía promedios para el día. Son dos operaciones distintas, y
compararlas entre sí produce un delta que no significa nada. Acá ambos lados
usan `suma(interacciones) / suma(alcance)`.

**Las fechas de las exportaciones se guardan sin zona horaria.** Lo que importa
es la hora que muestra la plataforma. Convertir a UTC y de vuelta movería
publicaciones de día, y de mes en los bordes. Los dos exportadores además usan
formatos distintos: Meta entrega `MM/DD/YYYY` y YouTube `DD/MM/YYYY`, así que el
orden va explícito en cada lector en vez de adivinarse.

**En Zod 4, una clave ausente no es lo mismo que un `undefined`.** Meter
`z.undefined()` dentro de una unión acepta un undefined explícito pero rechaza
una clave que no viene, con el mensaje "expected nonoptional, received
undefined". Y una clave que no viene es exactamente lo que manda el navegador
cuando el campo no se renderizó o está deshabilitado — el caso de las tres
métricas de perfil, que viven en una sección colapsada. La optatividad se
declara con `.optional()`, y `esquemas.test.ts` valida los formularios con
FormData armado como lo envía el navegador, incluidos los campos que faltan.

**TikTok tiene una categoría: Video.** La especificación original decía "sin
categorías, solo total", y por eso sus filas quedaban etiquetadas como "sin
categoría". El equipo lo registra como Video, así que esa es su única categoría
válida. Cuando una plataforma tiene una sola categoría posible, la interfaz la
deja puesta sola y el importador del Excel la deduce en vez de dejar la fila sin
clasificar: si solo hay una opción, no hay nada que adivinar.

**Las fechas se formatean con zona explícita y en 24 horas.** Node y el
navegador traen versiones distintas de ICU: una separa el "a. m." con espacio
fino sin salto (U+202F) y la otra con espacio normal. El texto se ve idéntico y
React igual descarta el árbol con un error de hidratación. Formatear en 24 horas
y normalizar esos espacios lo elimina de raíz; `formato.test.ts` lo cuida.

**La importación del histórico no duplica.** Volver a subir el mismo Excel omite
las filas idénticas a una que ya está — importar dos veces por equivocación
habría duplicado las publicaciones de esos días y roto todos sus promedios. Para
reimportar de verdad hay una casilla que reemplaza los días que trae el archivo.

**El desfase entre Iconosquare y Meta se estima, no se asume.** La
especificación dice que Meta reporta 3 horas atrás, y ese es el valor por
defecto, pero cuando el cruce logra calzar publicaciones por su texto usa la
mediana de las diferencias reales. Así el cruce sobrevive a un cambio de hora o
a un ajuste de configuración en cualquiera de los dos exportadores.

**El día de hoy se calcula en horario de Santiago.** En Vercel el servidor corre
en UTC: sin esto, todo lo que se cargara después de las 21:00 caería al día
siguiente.

**La clasificación Reactivo/Normal es editable.** Se guarda tanto lo que decidió
el algoritmo (`tipo_auto`) como lo que quedó (`tipo`), y la vista de promedios se
recalcula sola al corregir una publicación.

---

## Lo que quedó pendiente

- **Envío del reporte por correo.** El reporte se genera, se previsualiza y se
  copia o descarga como HTML. Falta conectar Resend y decidir destinatarios y
  horario.
- Línea base propia para las métricas de perfil (requiere acumular un mes de
  registro manual).
- Gráficos de evolución temporal, comparación entre meses y exportación a PDF.

---

## Despliegue

El repositorio está pensado para Vercel con despliegue automático desde `main`.
Hay que crear un proyecto en Supabase, aplicar la migración con
`npx supabase db push`, crear los tres usuarios desde el panel, y cargar
`NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` como variables de
entorno en Vercel.

> **Nota sobre OneDrive:** el proyecto vive dentro de una carpeta sincronizada.
> Conviene excluir `node_modules` y `.next` de la sincronización, o mover el
> repositorio fuera de OneDrive: la sincronización de miles de archivos
> pequeños hace lento el build y a veces bloquea archivos.
