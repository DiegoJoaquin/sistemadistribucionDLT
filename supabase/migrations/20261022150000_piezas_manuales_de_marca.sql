-- ===========================================================================
-- Piezas de marca cargadas a mano.
--
-- El global reconoce solo lo que trae una señal en el texto: un hashtag, una
-- arroba o una campaña. Quedan afuera las historias (no se importan), los
-- videos que se subieron sin hashtag y lo que se hizo para una marca en una
-- cuenta que no está cargada. Esto es para sumarlas a mano, con quién las
-- cargó, para que el conteo no dependa de que alguien se acuerde de taggear.
-- ===========================================================================

create table public.marca_piezas_manuales (
  id          uuid primary key default gen_random_uuid(),
  marca_id    uuid not null references public.marcas(id) on delete cascade,
  fecha       date not null,
  -- Opcional: una acción puede no estar en ninguna cuenta cargada.
  cuenta_id   uuid references public.cuentas(id) on delete set null,
  -- Reel, Carrusel, Imagen, Historia, Video... texto libre corto.
  formato     text,
  descripcion text not null,
  enlace      text,
  -- «4 historias» es una sola fila con cantidad 4.
  cantidad    integer not null default 1,
  created_by  uuid not null default auth.uid() references public.perfiles(id),
  creado_en   timestamptz not null default now(),
  constraint marca_piezas_manuales_cantidad check (cantidad between 1 and 500),
  constraint marca_piezas_manuales_descripcion check (length(trim(descripcion)) > 0)
);

comment on table public.marca_piezas_manuales is
  'Piezas de marca que el global no puede reconocer solo (historias, videos '
  'sin hashtag, cuentas no cargadas). Se suman al conteo de su marca.';

create index marca_piezas_manuales_marca_idx on public.marca_piezas_manuales (marca_id, fecha);

alter table public.marca_piezas_manuales enable row level security;

create policy "marca_piezas_manuales: el equipo lee"
  on public.marca_piezas_manuales for select to authenticated
  using (public.es_del_equipo());

-- Quien carga firma con su usuario: la trazabilidad no se falsea (§2).
create policy "marca_piezas_manuales: el equipo agrega"
  on public.marca_piezas_manuales for insert to authenticated
  with check (public.es_del_equipo() and created_by = auth.uid());

create policy "marca_piezas_manuales: el equipo borra"
  on public.marca_piezas_manuales for delete to authenticated
  using (public.es_del_equipo());
