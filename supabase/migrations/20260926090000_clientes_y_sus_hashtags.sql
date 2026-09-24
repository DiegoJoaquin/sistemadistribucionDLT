-- ===========================================================================
-- Informes por cliente: un cliente es una lista de hashtags.
--
-- El pedido concreto fue un informe de los hashtags de Sparta, con las mismas
-- métricas del catastro, desde enero de 2026. Pero la herramienta se hace
-- genérica a propósito: el próximo cliente se agrega desde la aplicación, sin
-- tocar código ni esperar un despliegue. Es la misma decisión que se tomó con
-- las cuentas cuando dejaron de ser un enum.
--
-- La lista es explícita y no un patrón de texto ("todo lo que contenga
-- SPARTA"). Un patrón parece más cómodo hasta que arrastra un hashtag ajeno a
-- un informe que se le manda al cliente. Para que no se pierda nada por
-- omisión, la aplicación muestra aparte los hashtags que aparecen en los
-- registros y no están en ninguna lista.
-- ===========================================================================

create table public.clientes (
  id        uuid primary key default gen_random_uuid(),
  -- Cómo aparece en el informe: "Sparta".
  nombre    text not null unique,
  -- Para anotar el contacto, el contrato, lo que sea.
  notas     text,
  activo    boolean not null default true,
  creado_en timestamptz not null default now(),
  constraint clientes_nombre_no_vacio check (length(trim(nombre)) > 0)
);

comment on table public.clientes is
  'Clientes o marcas de los que se emite un informe aparte. Lo que define a '
  'un cliente es su lista de hashtags.';

create table public.cliente_hashtags (
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  /*
   * Se llama `hashtag` a propósito: así le sirve el mismo trigger de
   * normalización que usa `registros.hashtag`, y las dos columnas quedan
   * escritas igual. Si se escribieran distinto, el informe no encontraría
   * ninguna publicación y saldría vacío sin explicar por qué.
   */
  hashtag    text not null,
  agregado_en timestamptz not null default now(),
  primary key (cliente_id, hashtag),
  constraint cliente_hashtags_no_vacio check (length(trim(hashtag)) > 0)
);

comment on table public.cliente_hashtags is
  'Los hashtags que pertenecen a cada cliente, normalizados igual que '
  'registros.hashtag. Un hashtag puede estar en más de un cliente: hay '
  'contenido con dos marcas.';

-- El informe parte de los hashtags de un cliente y busca sus registros.
create index cliente_hashtags_hashtag_idx on public.cliente_hashtags (hashtag);

/*
 * Misma normalización que en `registros`: mayúsculas, sin numeral, sin
 * espacios. La aplicación además quita las tildes antes de escribir, que
 * Postgres no puede hacer sin extensiones. Esto es la red de seguridad para lo
 * que entre por SQL a mano.
 */
create trigger cliente_hashtags_normalizar
  before insert or update on public.cliente_hashtags
  for each row execute function public.normalizar_hashtag();

-- ---------------------------------------------------------------------------
-- RLS: lo ve y lo administra el equipo, igual que las cuentas
-- ---------------------------------------------------------------------------

alter table public.clientes         enable row level security;
alter table public.cliente_hashtags enable row level security;

create policy "clientes: el equipo lee"
  on public.clientes for select to authenticated
  using (public.es_del_equipo());

create policy "clientes: el equipo escribe"
  on public.clientes for all to authenticated
  using (public.es_del_equipo()) with check (public.es_del_equipo());

create policy "cliente_hashtags: el equipo lee"
  on public.cliente_hashtags for select to authenticated
  using (public.es_del_equipo());

create policy "cliente_hashtags: el equipo escribe"
  on public.cliente_hashtags for all to authenticated
  using (public.es_del_equipo()) with check (public.es_del_equipo());
