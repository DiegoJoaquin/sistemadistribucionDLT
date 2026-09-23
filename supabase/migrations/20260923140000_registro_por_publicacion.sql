-- ===========================================================================
-- El registro pasa a ser una fila por publicación.
--
-- Hasta acá una fila podía representar varias publicaciones juntas (el campo
-- `publicaciones`). Para el catastro semanal eso no sirve: hay que poder decir
-- qué hashtag salió, cuántas veces y cómo le fue a cada una. Y si las filas se
-- van a llenar desde las exportaciones, cada publicación del archivo es una
-- fila.
--
-- Lo que se agrega:
--   hashtag       el corte nuevo del reporte semanal
--   publicado_en  la hora que muestra la plataforma, sin zona (igual que en la
--                 línea base: convertir a UTC movería publicaciones de día)
--   id_externo    para que reimportar el mismo archivo no duplique nada
--   fuente        de dónde vino la fila, para distinguir lo cargado a mano
--
-- Las filas agrupadas que ya existen no se tocan: siguen válidas, con su
-- `publicaciones` mayor que 1 y sin hashtag.
-- ===========================================================================

alter table public.registros
  add column hashtag      text,
  add column publicado_en timestamp,
  add column id_externo    text,
  add column fuente        public.fuente_import not null default 'manual';

comment on column public.registros.hashtag is
  'Serie o hashtag principal, normalizado en mayúsculas y sin el #. Es el '
  'corte del catastro semanal.';

comment on column public.registros.id_externo is
  'Identificador de la publicación en la plataforma, normalmente su URL. '
  'Permite reimportar una exportación sin duplicar filas.';

/*
 * Reimportar el mismo archivo no puede duplicar el mes. La restricción es por
 * cuenta: el mismo video subido a Instagram y a TikTok son dos publicaciones
 * distintas, cada una con su propio identificador, y así tiene que ser — el
 * reporte las muestra por separado.
 */
create unique index registros_sin_duplicados
  on public.registros (cuenta_id, id_externo)
  where id_externo is not null;

-- El catastro semanal agrupa por fecha y hashtag.
create index registros_hashtag_idx on public.registros (fecha, hashtag);

/*
 * Normalización del hashtag.
 *
 * Es la misma preocupación de §9.3: si una semana se escribe #FECHA17xDLT y la
 * otra #fecha17xdlt, el corte por hashtag los cuenta como dos series distintas
 * y el promedio de cada una queda mal. La aplicación ya normaliza antes de
 * escribir (además quita las tildes, que Postgres no puede sin extensiones);
 * esto es la red de seguridad para lo que entre por SQL a mano.
 */
create or replace function public.normalizar_hashtag()
returns trigger
language plpgsql
as $$
begin
  if new.hashtag is not null then
    new.hashtag := upper(trim(both from replace(new.hashtag, '#', '')));
    if new.hashtag = '' then
      new.hashtag := null;
    end if;
  end if;
  return new;
end;
$$;

create trigger registros_normalizar_hashtag
  before insert or update on public.registros
  for each row execute function public.normalizar_hashtag();
