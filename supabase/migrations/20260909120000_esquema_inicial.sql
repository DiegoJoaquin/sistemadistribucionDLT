-- ===========================================================================
-- Plataforma de KPIs diarios — DLT Sports
-- Esquema inicial.
--
-- Las reglas de negocio de §9 que se rompieron en el Excel se blindan acá,
-- en la base, no solo en la interfaz:
--   §9.3  plataforma y categoría son ENUM, jamás texto libre
--   §9.5  publicaciones >= 1 obligatorio
--   §9.6  YouTube no puede tener alcance
--   §9.4  todas las métricas son NULLABLE: sin dato no es cero
-- ===========================================================================

create type public.plataforma as enum (
  'Instagram DLT',
  'Instagram DBF',
  'TikTok',
  'YouTube',
  'Twitter/X'
);

create type public.categoria as enum (
  'Reactivo',
  'Normal',
  'Imagen',
  'Reel',
  'Carrusel',
  'Short',
  'Video',
  'Foto'
);

create type public.fuente_import as enum (
  'meta',
  'iconosquare',
  'tiktok',
  'youtube',
  'manual'
);

-- ---------------------------------------------------------------------------
-- Perfiles de usuario
-- ---------------------------------------------------------------------------

create table public.perfiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text not null,
  nombre     text not null,
  creado_en  timestamptz not null default now()
);

comment on table public.perfiles is
  'Datos visibles del usuario. §2: cada registro guarda quién lo creó.';

-- Alta automática del perfil al crearse el usuario en auth.
create or replace function public.manejar_usuario_nuevo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.perfiles (id, email, nombre)
  values (
    new.id,
    new.email,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'nombre', ''),
      split_part(new.email, '@', 1)
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger al_crear_usuario
  after insert on auth.users
  for each row execute function public.manejar_usuario_nuevo();

-- ---------------------------------------------------------------------------
-- Validación categoría / plataforma (§3.2)
-- ---------------------------------------------------------------------------

create or replace function public.categoria_valida(
  p public.plataforma,
  c public.categoria
)
returns boolean
language sql
immutable
as $$
  select case p
    when 'Instagram DLT' then c in ('Reactivo', 'Normal', 'Imagen', 'Reel', 'Carrusel')
    when 'Instagram DBF' then c in ('Reactivo', 'Normal', 'Imagen', 'Reel', 'Carrusel')
    when 'TikTok'        then false           -- TikTok no tiene categorías
    when 'YouTube'       then c in ('Short', 'Video')
    when 'Twitter/X'     then c in ('Video', 'Foto')
  end;
$$;

-- ---------------------------------------------------------------------------
-- Registro diario de publicaciones (§3.3)
-- ---------------------------------------------------------------------------

create table public.registros (
  id                   uuid primary key default gen_random_uuid(),
  fecha                date not null,
  plataforma           public.plataforma not null,
  categoria            public.categoria,

  -- §9.5: cuántas publicaciones representa esta fila. Si queda en 1 cuando en
  -- realidad eran 3, todos los promedios del día salen mal.
  publicaciones        integer not null check (publicaciones >= 1),

  -- §9.4: null = no se midió. Nunca 0 por defecto.
  alcance              bigint check (alcance >= 0),
  visualizaciones      bigint check (visualizaciones >= 0),
  interacciones        bigint check (interacciones >= 0),
  nuevos_seguidores    bigint,

  -- §4.1: se ingresan siempre a mano, ninguna plataforma las exporta.
  visitas_perfil       bigint check (visitas_perfil >= 0),
  vistas_seguidores    bigint check (vistas_seguidores >= 0),
  vistas_no_seguidores bigint check (vistas_no_seguidores >= 0),

  titulo_contenido     text,
  enlace               text,

  created_by           uuid not null references public.perfiles(id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint registros_categoria_de_la_plataforma check (
    categoria is null or public.categoria_valida(plataforma, categoria)
  ),

  -- §9.6: YouTube no entrega alcance. Guardar uno sería inventarlo.
  constraint registros_youtube_sin_alcance check (
    plataforma <> 'YouTube' or alcance is null
  )
);

create index registros_fecha_idx on public.registros (fecha desc);
create index registros_fecha_plataforma_idx on public.registros (fecha, plataforma);
create index registros_created_by_idx on public.registros (created_by);

create or replace function public.tocar_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  -- created_by es inmutable: la trazabilidad no se reescribe (§2).
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  return new;
end;
$$;

create trigger registros_updated_at
  before update on public.registros
  for each row execute function public.tocar_updated_at();

-- ---------------------------------------------------------------------------
-- Líneas base mensuales (§3.4)
-- ---------------------------------------------------------------------------

create table public.lineas_base (
  id         uuid primary key default gen_random_uuid(),
  mes        date not null unique,       -- siempre el día 1 del mes
  nombre     text not null,
  activa     boolean not null default false,
  creado_por uuid references public.perfiles(id),
  creado_en  timestamptz not null default now(),
  constraint lineas_base_mes_es_dia_1 check (extract(day from mes) = 1)
);

-- §3.4: puede haber varios meses, pero solo uno es la referencia activa.
create unique index lineas_base_una_sola_activa
  on public.lineas_base ((activa)) where activa;

/*
 * Publicaciones importadas que alimentan la línea base.
 *
 * Guardamos la publicación cruda y no solo los promedios, para poder:
 *   - reclasificar Reactivo/Normal a mano (§5.2) y que el promedio se recalcule
 *   - auditar de dónde salió cada número
 */
create table public.publicaciones_base (
  id                uuid primary key default gen_random_uuid(),
  linea_base_id     uuid not null references public.lineas_base(id) on delete cascade,
  plataforma        public.plataforma not null,
  publicado_en      timestamptz,

  -- Imagen | Reel | Carrusel | Short | Video | Foto
  formato           public.categoria,
  -- Reactivo | Normal — solo Instagram (§5.2)
  tipo              public.categoria,
  -- clasificación automática original, para poder ver qué se editó a mano
  tipo_auto         public.categoria,
  clasificado_a_mano boolean not null default false,

  serie_hashtag     text,
  caption           text,
  duracion_s        integer,

  visualizaciones   bigint,
  alcance           bigint,
  me_gusta          bigint,
  comentarios       bigint,
  compartidos       bigint,
  guardados         bigint,
  favoritos         bigint,
  nuevos_seguidores bigint,
  interacciones     bigint,

  enlace            text,
  id_externo        text,
  fuente            public.fuente_import not null,
  importado_en      timestamptz not null default now(),

  constraint publicaciones_base_formato_valido check (
    formato is null or public.categoria_valida(plataforma, formato)
  ),
  constraint publicaciones_base_tipo_valido check (
    tipo is null or tipo in ('Reactivo', 'Normal')
  ),
  constraint publicaciones_base_youtube_sin_alcance check (
    plataforma <> 'YouTube' or alcance is null
  )
);

create index publicaciones_base_linea_idx
  on public.publicaciones_base (linea_base_id, plataforma);
create unique index publicaciones_base_sin_duplicados
  on public.publicaciones_base (linea_base_id, plataforma, id_externo)
  where id_externo is not null;

/*
 * Promedios por publicación de la línea base, por plataforma y categoría.
 *
 * §3.2 — el desdoble: en Instagram una publicación tiene formato (Reel) Y tipo
 * (Reactivo), así que aporta a la línea "Reel", a la línea "Reactivo" y al
 * TOTAL. El `select distinct` evita que una publicación sin formato ni tipo
 * (TikTok) se cuente tres veces en el TOTAL.
 *
 * §9.2 — la fila TOTAL (categoria is null) se calcula sobre todas las
 * publicaciones de la plataforma, no sumando las categorías.
 */
create or replace view public.lineas_base_detalle
with (security_invoker = on) as
with etiquetado as (
  select
    p.linea_base_id,
    p.plataforma,
    e.categoria,
    p.alcance,
    p.visualizaciones,
    p.interacciones,
    p.nuevos_seguidores,
    -- §9.6: YouTube no tiene alcance, su engagement va sobre visualizaciones
    coalesce(p.alcance, p.visualizaciones) as denominador
  from public.publicaciones_base p
  cross join lateral (
    select distinct cat as categoria
    from (values (p.formato), (p.tipo), (null::public.categoria)) as v(cat)
  ) e
)
select
  linea_base_id,
  plataforma,
  categoria,
  count(*)::int                       as n_publicaciones,
  avg(alcance)                        as alcance_prom,
  avg(visualizaciones)                as visualizaciones_prom,
  avg(interacciones)                  as interacciones_prom,
  avg(nuevos_seguidores)              as nuevos_seguidores_prom,
  case
    when sum(denominador) > 0
    then sum(interacciones)::numeric / sum(denominador)
  end                                 as engagement_prom
from etiquetado
group by linea_base_id, plataforma, categoria;

comment on view public.lineas_base_detalle is
  'Promedios por publicación de cada línea base. Se recalcula solo: si se '
  'reclasifica una publicación a mano, los promedios cambian al instante.';

-- ---------------------------------------------------------------------------
-- Reporte diario: textos libres (§6.1)
-- ---------------------------------------------------------------------------

create table public.reportes (
  id                     uuid primary key default gen_random_uuid(),
  fecha                  date not null unique,
  plan_publicaciones     text,
  conversacion_audiencia text,
  aprendizajes           text,
  recomendaciones        text,
  riesgos                text,
  enviado_en             timestamptz,
  actualizado_por        uuid references public.perfiles(id),
  actualizado_en         timestamptz not null default now()
);

create or replace function public.tocar_actualizado_en()
returns trigger
language plpgsql
as $$
begin
  new.actualizado_en := now();
  return new;
end;
$$;

create trigger reportes_actualizado_en
  before update on public.reportes
  for each row execute function public.tocar_actualizado_en();

-- ---------------------------------------------------------------------------
-- RLS — §2: los tres usuarios ven todo, no hay datos privados entre ellos.
-- Lo que se protege es que nadie sin sesión lea ni escriba.
-- ---------------------------------------------------------------------------

alter table public.perfiles            enable row level security;
alter table public.registros           enable row level security;
alter table public.lineas_base         enable row level security;
alter table public.publicaciones_base  enable row level security;
alter table public.reportes            enable row level security;

create policy "perfiles: todos leen"
  on public.perfiles for select to authenticated using (true);
create policy "perfiles: cada uno edita el suyo"
  on public.perfiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "registros: todos leen"
  on public.registros for select to authenticated using (true);
-- created_by tiene que ser el propio usuario: la trazabilidad no se falsea.
create policy "registros: crear a nombre propio"
  on public.registros for insert to authenticated
  with check (created_by = (select auth.uid()));
create policy "registros: todos editan"
  on public.registros for update to authenticated using (true) with check (true);
create policy "registros: todos borran"
  on public.registros for delete to authenticated using (true);

create policy "lineas_base: todos leen"
  on public.lineas_base for select to authenticated using (true);
create policy "lineas_base: todos escriben"
  on public.lineas_base for all to authenticated using (true) with check (true);

create policy "publicaciones_base: todos leen"
  on public.publicaciones_base for select to authenticated using (true);
create policy "publicaciones_base: todos escriben"
  on public.publicaciones_base for all to authenticated using (true) with check (true);

create policy "reportes: todos leen"
  on public.reportes for select to authenticated using (true);
create policy "reportes: todos escriben"
  on public.reportes for all to authenticated using (true) with check (true);

-- ---------------------------------------------------------------------------
-- Activar una línea base (§3.4: el usuario elige cuál es la referencia)
-- ---------------------------------------------------------------------------

create or replace function public.activar_linea_base(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.lineas_base set activa = false where activa and id <> p_id;
  update public.lineas_base set activa = true where id = p_id;
end;
$$;

revoke all on function public.activar_linea_base(uuid) from public;
grant execute on function public.activar_linea_base(uuid) to authenticated;
