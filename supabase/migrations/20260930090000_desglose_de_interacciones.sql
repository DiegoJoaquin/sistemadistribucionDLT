-- ===========================================================================
-- El registro guarda el desglose de las interacciones, no solo la suma.
--
-- Hasta acá `registros` tenía una sola columna `interacciones`, que es lo que
-- necesita el panel diario: el engagement se calcula sobre el total y nadie
-- pedía las partes. Pero los lectores de exportaciones SÍ leen las partes —
-- `PublicacionImportada` trae me_gusta, comentarios, compartidos, guardados,
-- favoritos y duracion_s, y `publicaciones_base` las guarda desde el principio
-- — y se descartaban al armar la fila del registro.
--
-- Se descartaba información que el archivo ya traía. Cualquier pregunta del
-- tipo "¿los que se comparten más son los que más se ven?" era incontestable
-- con lo guardado, aunque el dato hubiera estado en el Excel de Meta.
--
-- Son las mismas columnas y los mismos nombres que `publicaciones_base`, para
-- que las dos tablas se lean igual y el cruce de la línea base no tenga que
-- traducir nombres.
--
-- IMPORTANTE: las filas ya importadas quedan en null, no en cero (§9.4). Para
-- llenarlas hay que volver a subir las exportaciones; la reimportación
-- reconoce la publicación por (cuenta, id_externo) y completa lo que falta sin
-- duplicar nada ni pisar lo que ya estaba.
-- ===========================================================================

/*
 * `if not exists` en cada columna: estas migraciones se aplican a mano, pegadas
 * en el editor de Supabase, y no hay nada que lleve la cuenta de cuáles ya
 * corrieron. Sin esto, volver a pegarla falla entera con "column already
 * exists" en la primera columna —aunque falten las otras cinco— y no queda
 * claro si el problema es que ya estaba hecho o que quedó a medias.
 */
alter table public.registros
  -- §9.4: null = no se midió. Ninguna es not null y ninguna tiene default 0.
  add column if not exists me_gusta    bigint check (me_gusta    >= 0),
  add column if not exists comentarios bigint check (comentarios >= 0),
  add column if not exists compartidos bigint check (compartidos >= 0),
  add column if not exists guardados   bigint check (guardados   >= 0),
  add column if not exists favoritos   bigint check (favoritos   >= 0),
  -- Duración del video en segundos. Permite preguntar si los reels largos
  -- rinden distinto, que es una de las preguntas que se hacen a mano hoy.
  add column if not exists duracion_s  integer check (duracion_s >= 0);

comment on column public.registros.me_gusta is
  'Likes de la publicación. null = la fuente no lo entregó (§9.4). El total '
  'sigue viviendo en interacciones: esta columna NO se suma con las otras '
  'para obtenerlo, porque cada red compone su total de forma distinta.';

comment on column public.registros.compartidos is
  'Compartidos / reposts. null = la fuente no lo entregó (§9.4).';

comment on column public.registros.favoritos is
  'Favoritos de TikTok. Las demás redes no tienen el concepto y quedan en '
  'null, que no es lo mismo que cero.';

comment on column public.registros.duracion_s is
  'Duración del video en segundos. null en los formatos que no son video.';

/*
 * No se agrega índice.
 *
 * Estas columnas no se filtran ni se ordenan en la base: la dispersión lee el
 * rango de fechas —que ya tiene índice— y arma los puntos en memoria. Un
 * índice por cada una sería seis índices que solo encarecen la importación.
 */
