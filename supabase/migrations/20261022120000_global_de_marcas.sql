-- ===========================================================================
-- Global de marcas: contar cuánto contenido se sube de cada marca comercial.
--
-- Nadie lleva la cuenta de lo que se publica para cada marca. La información
-- ya está en el registro —cada publicación con su texto— y lo que falta es
-- decirle a la aplicación cómo se reconoce cada marca: sus hashtags
-- (#SPARTAxDLT), sus arrobas (@spartachile) y las campañas con que
-- Iconosquare etiqueta las publicaciones ("SPARTA GLOBAL").
--
-- Va aparte de `clientes` a propósito. Un cliente es una lista de hashtags
-- para emitir un informe de rendimiento; una marca es lo que se cuenta en el
-- global, y se reconoce también por arroba y por campaña. Mezclarlos haría que
-- agregar una arroba para el conteo cambiara un informe que se le manda al
-- cliente.
--
-- El reconocimiento NO se guarda por publicación: se calcula al leer, con las
-- señales vigentes. Así, agregar una arroba a una marca corrige todo lo
-- importado desde enero sin tener que recalcular nada, y lo que se sube cada
-- semana entra al conteo apenas se importa.
-- ===========================================================================

/*
 * El texto completo de la publicación.
 *
 * `titulo_contenido` guarda los primeros 300 caracteres en una línea, para
 * mostrar en tablas. Las marcas suelen ir al final del caption ("... #SPARTA
 * #TEAMCHILE" o "@nikefootball"), así que con eso se perdían. Lo ya importado
 * queda con `texto` vacío hasta que se vuelva a subir su archivo: reimportar no
 * duplica nada y completa la columna.
 */
alter table public.registros
  add column texto    text,
  add column campanas text;

comment on column public.registros.texto is
  'Caption completo, tal como lo trae la exportación (limpio de caracteres '
  'inválidos). Es lo que lee el global de marcas para reconocer hashtags y '
  'arrobas. Null en lo cargado antes de octubre de 2026 o a mano.';

comment on column public.registros.campanas is
  'Campañas y etiquetas con que Iconosquare marca la publicación, separadas '
  'por coma. Null si la fuente no las trae.';

create table public.marcas (
  id        uuid primary key default gen_random_uuid(),
  -- Cómo aparece en el global: "Sparta".
  nombre    text not null unique,
  notas     text,
  activa    boolean not null default true,
  creado_en timestamptz not null default now(),
  constraint marcas_nombre_no_vacio check (length(trim(nombre)) > 0)
);

comment on table public.marcas is
  'Marcas comerciales que se cuentan en el global de marcas. Lo que define a '
  'una marca son sus señales: hashtags, arrobas y campañas.';

create table public.marca_senales (
  marca_id    uuid not null references public.marcas(id) on delete cascade,
  tipo        text not null,
  valor       text not null,
  agregado_en timestamptz not null default now(),
  primary key (marca_id, tipo, valor),
  constraint marca_senales_tipo_valido check (tipo in ('hashtag', 'mencion', 'campana')),
  constraint marca_senales_no_vacia check (length(trim(valor)) > 0)
);

comment on table public.marca_senales is
  'Cómo se reconoce una marca en el texto de una publicación. hashtag: en '
  'mayúsculas, sin # ni tildes. mencion: en minúsculas, sin @. campana: '
  'en mayúsculas, sin tildes, igual que la escribe Iconosquare.';

create index marca_senales_valor_idx on public.marca_senales (tipo, valor);

/*
 * Red de seguridad para lo que entre por SQL a mano: la aplicación ya
 * normaliza (y además quita tildes, que Postgres no puede sin extensiones).
 * Si una arroba se guardara con mayúsculas, no calzaría con ninguna
 * publicación y la marca saldría en cero sin explicar por qué.
 */
create or replace function public.normalizar_senal_marca()
returns trigger
language plpgsql
as $$
begin
  if new.tipo = 'hashtag' then
    new.valor := upper(trim(both from replace(new.valor, '#', '')));
  elsif new.tipo = 'mencion' then
    new.valor := lower(trim(both from replace(new.valor, '@', '')));
  else
    new.valor := upper(trim(both from new.valor));
  end if;
  return new;
end;
$$;

create trigger marca_senales_normalizar
  before insert or update on public.marca_senales
  for each row execute function public.normalizar_senal_marca();

-- ---------------------------------------------------------------------------
-- RLS: lo ve y lo administra el equipo, igual que los clientes
-- ---------------------------------------------------------------------------

alter table public.marcas        enable row level security;
alter table public.marca_senales enable row level security;

create policy "marcas: el equipo lee"
  on public.marcas for select to authenticated
  using (public.es_del_equipo());

create policy "marcas: el equipo escribe"
  on public.marcas for all to authenticated
  using (public.es_del_equipo()) with check (public.es_del_equipo());

create policy "marca_senales: el equipo lee"
  on public.marca_senales for select to authenticated
  using (public.es_del_equipo());

create policy "marca_senales: el equipo escribe"
  on public.marca_senales for all to authenticated
  using (public.es_del_equipo()) with check (public.es_del_equipo());
