-- ===========================================================================
-- Las cuentas pasan a ser datos, no código.
--
-- Hasta acá `plataforma` era un enum de cinco valores fijos que mezclaba dos
-- cosas: la cuenta y la red social. Funcionaba mientras las cuentas fueran
-- cinco y no cambiaran. Ahora hay que sumar las cuentas de los influencers
-- (DiegoAT, Pedro Canales, José Mora, Living DLT, DLT Running y más), así que
-- agregar una cuenta no puede seguir significando modificar un enum, tocar el
-- código y desplegar.
--
-- La red queda como atributo de la cuenta, y de ella salen las reglas que ya
-- existían: qué categorías aplican (§3.2) y que YouTube no entrega alcance
-- (§9.6).
--
-- La migración es ADITIVA a propósito: agrega `cuenta_id` y deja `plataforma`
-- en su lugar, sincronizadas por trigger. Así se puede aplicar con la
-- aplicación andando y sin ventana de caída; el código viejo sigue escribiendo
-- `plataforma` y el nuevo escribe `cuenta_id`. Una migración posterior borra la
-- columna vieja, cuando ya no quede código que la use.
-- ===========================================================================

create type public.red as enum ('Instagram', 'TikTok', 'YouTube', 'Twitter/X');

create table public.cuentas (
  id        uuid primary key default gen_random_uuid(),
  -- Cómo se llama en los reportes: "Instagram DLT", "DiegoAT", "DLT Running".
  nombre    text not null unique,
  -- El @ de la cuenta, para poder distinguir dos cuentas del mismo nombre.
  usuario   text,
  red       public.red not null,
  /*
   * Separa las cuentas propias del grupo de las de los influencers: el catastro
   * semanal los agrupa distinto, y son públicos distintos.
   */
  es_influencer boolean not null default false,
  -- Una cuenta que se deja de usar se desactiva, no se borra: sus registros
  -- históricos tienen que seguir existiendo.
  activa    boolean not null default true,
  orden     integer not null default 100,
  creado_en timestamptz not null default now(),
  constraint cuentas_nombre_no_vacio check (length(trim(nombre)) > 0)
);

comment on table public.cuentas is
  'Cuentas donde publica DLT, propias y de influencers. Se agregan desde la '
  'aplicación: no son un enum.';

create index cuentas_orden_idx on public.cuentas (activa, orden, nombre);

-- ---------------------------------------------------------------------------
-- Las cinco cuentas que ya existían
--
-- El nombre calza exactamente con los valores del enum viejo: de eso depende
-- que el backfill y el trigger de transición puedan mapear las filas
-- existentes sin ambigüedad. Se pueden renombrar después desde la aplicación.
-- ---------------------------------------------------------------------------

insert into public.cuentas (nombre, usuario, red, es_influencer, orden) values
  ('Instagram DLT', '@dltsports',         'Instagram', false, 1),
  ('Instagram DBF', '@debuenafuente.dlt', 'Instagram', false, 2),
  ('TikTok',        '@dltsportsoficial',  'TikTok',    false, 3),
  ('YouTube',       '@dltsportstv',       'YouTube',   false, 4),
  ('Twitter/X',     'Cuenta DLT',         'Twitter/X', false, 5);

-- ---------------------------------------------------------------------------
-- Reglas que antes dependían de la plataforma y ahora dependen de la red
-- ---------------------------------------------------------------------------

create or replace function public.categoria_valida_red(
  r public.red,
  c public.categoria
)
returns boolean
language sql
immutable
as $$
  select case r
    when 'Instagram' then c in ('Reactivo', 'Normal', 'Imagen', 'Reel', 'Carrusel')
    when 'TikTok'    then c in ('Video')
    when 'YouTube'   then c in ('Short', 'Video')
    when 'Twitter/X' then c in ('Video', 'Foto')
  end;
$$;

/** §9.6 — YouTube no entrega alcance. */
create or replace function public.red_tiene_alcance(r public.red)
returns boolean
language sql
immutable
as $$
  select r <> 'YouTube';
$$;

-- ---------------------------------------------------------------------------
-- cuenta_id en las dos tablas que tenían plataforma
-- ---------------------------------------------------------------------------

alter table public.registros
  add column cuenta_id uuid references public.cuentas(id);

alter table public.publicaciones_base
  add column cuenta_id uuid references public.cuentas(id);

-- Backfill: cada fila existente apunta a la cuenta que lleva su mismo nombre.
update public.registros r
   set cuenta_id = c.id
  from public.cuentas c
 where c.nombre = r.plataforma::text
   and r.cuenta_id is null;

update public.publicaciones_base p
   set cuenta_id = c.id
  from public.cuentas c
 where c.nombre = p.plataforma::text
   and p.cuenta_id is null;

-- Si algo quedó sin mapear, la migración se detiene antes de romper nada.
do $$
declare
  huerfanos integer;
begin
  select count(*) into huerfanos from public.registros where cuenta_id is null;
  if huerfanos > 0 then
    raise exception 'Quedaron % registros sin cuenta asignada', huerfanos;
  end if;

  select count(*) into huerfanos from public.publicaciones_base where cuenta_id is null;
  if huerfanos > 0 then
    raise exception 'Quedaron % publicaciones de línea base sin cuenta', huerfanos;
  end if;
end $$;

/*
 * `plataforma` pasa a ser opcional: una cuenta de influencer no tiene
 * equivalente en el enum viejo, así que sus filas no pueden llenarla. Los
 * CHECK que la usan siguen existiendo y con NULL se evalúan como desconocido,
 * que en Postgres los deja pasar; las reglas ahora las hace cumplir el trigger
 * de más abajo, sobre la red de la cuenta.
 */
alter table public.registros          alter column plataforma drop not null;
alter table public.publicaciones_base alter column plataforma drop not null;

create index registros_cuenta_idx on public.registros (cuenta_id, fecha);
create index publicaciones_base_cuenta_idx
  on public.publicaciones_base (linea_base_id, cuenta_id);

-- ---------------------------------------------------------------------------
-- Transición: mantener las dos columnas de acuerdo entre sí
-- ---------------------------------------------------------------------------

/*
 * Mientras conviva el código viejo con el nuevo, cada fila puede llegar con
 * una sola de las dos columnas. Este trigger completa la otra cuando puede.
 * El mapeo a `plataforma` solo existe para las cinco cuentas originales: una
 * cuenta de influencer deja esa columna vacía, que es lo correcto.
 */
create or replace function public.sincronizar_cuenta_plataforma()
returns trigger
language plpgsql
as $$
declare
  nombre_cuenta text;
begin
  if new.cuenta_id is null and new.plataforma is not null then
    select id into new.cuenta_id
      from public.cuentas
     where nombre = new.plataforma::text;

    if new.cuenta_id is null then
      raise exception 'No existe una cuenta llamada %', new.plataforma::text;
    end if;

  elsif new.plataforma is null and new.cuenta_id is not null then
    select nombre into nombre_cuenta from public.cuentas where id = new.cuenta_id;

    if exists (
      select 1
        from unnest(enum_range(null::public.plataforma)) etiqueta
       where etiqueta::text = nombre_cuenta
    ) then
      new.plataforma := nombre_cuenta::public.plataforma;
    end if;
  end if;

  return new;
end;
$$;

create trigger registros_sincronizar_cuenta
  before insert or update on public.registros
  for each row execute function public.sincronizar_cuenta_plataforma();

create trigger publicaciones_base_sincronizar_cuenta
  before insert or update on public.publicaciones_base
  for each row execute function public.sincronizar_cuenta_plataforma();

-- ---------------------------------------------------------------------------
-- Las reglas de §9, ahora sobre la red de la cuenta
-- ---------------------------------------------------------------------------

/*
 * Van como trigger y no como CHECK porque hay que leer la red en otra tabla, y
 * un CHECK solo puede mirar la fila que se está escribiendo.
 */
create or replace function public.validar_fila_de_cuenta()
returns trigger
language plpgsql
as $$
declare
  cuenta record;
begin
  select nombre, red, activa into cuenta
    from public.cuentas where id = new.cuenta_id;

  if cuenta is null then
    raise exception 'La cuenta indicada no existe';
  end if;

  -- §3.2: la categoría tiene que ser de la red de esa cuenta.
  if new.categoria is not null
     and not public.categoria_valida_red(cuenta.red, new.categoria) then
    raise exception '% no es una categoría de % (cuenta %)',
      new.categoria, cuenta.red, cuenta.nombre;
  end if;

  -- §9.6: YouTube no entrega alcance, guardarlo sería inventarlo.
  if new.alcance is not null and not public.red_tiene_alcance(cuenta.red) then
    raise exception '% no entrega alcance: deja ese campo vacío (cuenta %)',
      cuenta.red, cuenta.nombre;
  end if;

  return new;
end;
$$;

create trigger registros_validar_cuenta
  after insert or update on public.registros
  for each row execute function public.validar_fila_de_cuenta();

/*
 * En la línea base la categoría vive en `formato`, así que se valida aparte.
 */
create or replace function public.validar_publicacion_base()
returns trigger
language plpgsql
as $$
declare
  cuenta record;
begin
  select nombre, red into cuenta from public.cuentas where id = new.cuenta_id;

  if cuenta is null then
    raise exception 'La cuenta indicada no existe';
  end if;

  if new.formato is not null
     and not public.categoria_valida_red(cuenta.red, new.formato) then
    raise exception '% no es un formato de % (cuenta %)',
      new.formato, cuenta.red, cuenta.nombre;
  end if;

  if new.alcance is not null and not public.red_tiene_alcance(cuenta.red) then
    raise exception '% no entrega alcance (cuenta %)', cuenta.red, cuenta.nombre;
  end if;

  return new;
end;
$$;

create trigger publicaciones_base_validar_cuenta
  after insert or update on public.publicaciones_base
  for each row execute function public.validar_publicacion_base();

-- ---------------------------------------------------------------------------
-- La vista de promedios, ahora por cuenta
-- ---------------------------------------------------------------------------

drop view if exists public.lineas_base_detalle;

create or replace view public.lineas_base_detalle
with (security_invoker = on) as
with etiquetado as (
  select
    p.linea_base_id,
    p.cuenta_id,
    e.categoria,
    p.alcance,
    p.visualizaciones,
    p.interacciones,
    p.nuevos_seguidores,
    -- §9.6: sin alcance, el engagement va sobre visualizaciones
    coalesce(p.alcance, p.visualizaciones) as denominador
  from public.publicaciones_base p
  cross join lateral (
    select distinct cat as categoria
    from (values (p.formato), (p.tipo), (null::public.categoria)) as v(cat)
  ) e
)
select
  e.linea_base_id,
  e.cuenta_id,
  -- El nombre y la red van en la vista para que la aplicación no tenga que
  -- hacer una segunda consulta solo para poder rotular una fila.
  c.nombre                              as cuenta,
  c.red,
  /*
   * Alias de transición: la versión desplegada lee esta columna para armar los
   * deltas. Sin ella, aplicar esta migración haría desaparecer todas las
   * variaciones en silencio hasta que saliera el código nuevo. Como los nombres
   * de las cinco cuentas originales son idénticos a los valores del enum viejo,
   * el alias basta. Se elimina junto con la columna `plataforma`.
   */
  c.nombre                              as plataforma,
  e.categoria,
  count(*)::int                         as n_publicaciones,
  avg(e.alcance)                        as alcance_prom,
  avg(e.visualizaciones)                as visualizaciones_prom,
  avg(e.interacciones)                  as interacciones_prom,
  avg(e.nuevos_seguidores)              as nuevos_seguidores_prom,
  case
    when sum(e.denominador) > 0
    then sum(e.interacciones)::numeric / sum(e.denominador)
  end                                   as engagement_prom
from etiquetado e
join public.cuentas c on c.id = e.cuenta_id
group by e.linea_base_id, e.cuenta_id, c.nombre, c.red, e.categoria;

comment on view public.lineas_base_detalle is
  'Promedios por publicación de cada línea base, por cuenta y categoría. La '
  'fila con categoria nula es el TOTAL de la cuenta (§9.2).';

-- ---------------------------------------------------------------------------
-- RLS: las cuentas las ve y las administra el equipo
-- ---------------------------------------------------------------------------

alter table public.cuentas enable row level security;

create policy "cuentas: el equipo lee"
  on public.cuentas for select to authenticated
  using (public.es_del_equipo());

create policy "cuentas: el equipo escribe"
  on public.cuentas for all to authenticated
  using (public.es_del_equipo()) with check (public.es_del_equipo());
