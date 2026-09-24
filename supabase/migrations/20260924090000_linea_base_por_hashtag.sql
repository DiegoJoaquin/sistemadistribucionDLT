-- ===========================================================================
-- La línea base gana un corte por hashtag.
--
-- Hasta acá la línea base se cortaba por cuenta y formato, que es lo que pedía
-- el panel diario. El catastro semanal necesita otra pregunta: cómo le fue a
-- #FECHA21xDLT esta semana comparado con cómo le va normalmente, y además si
-- esa serie rinde por encima o por debajo del promedio de la cuenta.
--
-- Son DOS comparaciones distintas y las dos hacen falta:
--   vs su propia base   — ¿esta semana la serie anduvo mejor que de costumbre?
--   vs el total de la cuenta — ¿esta serie vale más que el promedio de la cuenta?
--
-- Una sola de las dos engaña. Una serie puede estar 20% bajo su propio
-- promedio y aun así ser lo mejor que tiene la cuenta.
--
-- El dato ya estaba: `publicaciones_base.serie_hashtag` lo llenan los lectores
-- desde el primer hashtag del caption. Lo que faltaba era agruparlo.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Normalización, igual que en `registros.hashtag`
--
-- Sin esto, #Fecha21xDLT en la línea base y FECHA21XDLT en el registro serían
-- dos series distintas, y el corte semanal no encontraría base para ninguna:
-- todas las variaciones saldrían como guion sin explicar por qué.
-- ---------------------------------------------------------------------------

create or replace function public.normalizar_serie_hashtag()
returns trigger
language plpgsql
as $$
begin
  if new.serie_hashtag is not null then
    new.serie_hashtag := upper(trim(both from replace(new.serie_hashtag, '#', '')));
    if new.serie_hashtag = '' then
      new.serie_hashtag := null;
    end if;
  end if;
  return new;
end;
$$;

create trigger publicaciones_base_normalizar_hashtag
  before insert or update on public.publicaciones_base
  for each row execute function public.normalizar_serie_hashtag();

-- Lo que ya estaba cargado, al mismo formato.
update public.publicaciones_base
   set serie_hashtag = nullif(upper(trim(both from replace(serie_hashtag, '#', ''))), '')
 where serie_hashtag is not null;

create index publicaciones_base_hashtag_idx
  on public.publicaciones_base (linea_base_id, cuenta_id, serie_hashtag);

-- ---------------------------------------------------------------------------
-- Promedios por hashtag
--
-- Misma forma que `lineas_base_detalle` para que la aplicación pueda tratar
-- las dos igual, pero agrupando por serie en vez de por formato.
--
-- A diferencia de esa vista, acá NO hay fila TOTAL: el total de la cuenta ya
-- vive en `lineas_base_detalle` con categoria nula, y duplicarlo sería crear
-- dos fuentes para el mismo número.
--
-- Las publicaciones sin hashtag quedan como su propio grupo, con serie nula. No
-- se descartan: son parte de lo que publicó la cuenta y el catastro tiene que
-- poder decir cuántas fueron y cómo les fue.
-- ---------------------------------------------------------------------------

create or replace view public.lineas_base_hashtag
with (security_invoker = on) as
select
  p.linea_base_id,
  p.cuenta_id,
  c.nombre                                       as cuenta,
  c.red,
  p.serie_hashtag                                as hashtag,
  count(*)::int                                  as n_publicaciones,
  avg(p.alcance)                                 as alcance_prom,
  avg(p.visualizaciones)                         as visualizaciones_prom,
  avg(p.interacciones)                           as interacciones_prom,
  avg(p.nuevos_seguidores)                       as nuevos_seguidores_prom,
  case
    -- §9.6: sin alcance, el engagement va sobre visualizaciones.
    when sum(coalesce(p.alcance, p.visualizaciones)) > 0
    then sum(p.interacciones)::numeric / sum(coalesce(p.alcance, p.visualizaciones))
  end                                            as engagement_prom
from public.publicaciones_base p
join public.cuentas c on c.id = p.cuenta_id
group by p.linea_base_id, p.cuenta_id, c.nombre, c.red, p.serie_hashtag;

comment on view public.lineas_base_hashtag is
  'Promedios por publicación de cada línea base, cortados por cuenta y serie '
  'o hashtag. Es el comparador propio de cada sección del catastro semanal. '
  'La fila con hashtag nulo son las publicaciones sin hashtag, no un total.';
