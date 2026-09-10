-- ===========================================================================
-- Autorización explícita por persona.
--
-- Por qué: la `anon key` es pública por diseño (viaja al navegador). Si el
-- proyecto tiene los registros abiertos, cualquiera puede crearse una cuenta
-- por API. Con las políticas originales —que daban acceso total a todo usuario
-- `authenticated`— ese desconocido habría podido leer y escribir todos los KPIs
-- sin pasar nunca por la aplicación.
--
-- Tener sesión ya no alcanza: hay que estar en el equipo. Desactivar los
-- registros en Supabase sigue siendo lo correcto, pero ahora no es lo único
-- que nos protege.
-- ===========================================================================

alter table public.perfiles
  add column if not exists autorizado boolean not null default false;

comment on column public.perfiles.autorizado is
  'Solo las personas autorizadas pueden leer y escribir datos. Se activa a '
  'mano al sumar alguien al equipo: es la puerta, no un detalle de perfil.';

-- Quienes ya estaban son el equipo real: se autorizan.
update public.perfiles set autorizado = true;

/*
 * SECURITY DEFINER a propósito: esta función se usa DENTRO de las políticas de
 * `perfiles`, así que si leyera la tabla con los permisos del llamante se
 * activaría su propio RLS y la evaluación entraría en recursión infinita.
 */
create or replace function public.es_del_equipo()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.perfiles
    where id = auth.uid() and autorizado
  );
$$;

revoke all on function public.es_del_equipo() from public;
grant execute on function public.es_del_equipo() to authenticated;

-- ---------------------------------------------------------------------------
-- Se reemplazan todas las políticas: `authenticated` ya no basta.
-- ---------------------------------------------------------------------------

drop policy if exists "perfiles: todos leen"              on public.perfiles;
drop policy if exists "perfiles: cada uno edita el suyo"  on public.perfiles;
drop policy if exists "registros: todos leen"             on public.registros;
drop policy if exists "registros: crear a nombre propio"  on public.registros;
drop policy if exists "registros: todos editan"           on public.registros;
drop policy if exists "registros: todos borran"           on public.registros;
drop policy if exists "lineas_base: todos leen"           on public.lineas_base;
drop policy if exists "lineas_base: todos escriben"       on public.lineas_base;
drop policy if exists "publicaciones_base: todos leen"    on public.publicaciones_base;
drop policy if exists "publicaciones_base: todos escriben" on public.publicaciones_base;
drop policy if exists "reportes: todos leen"              on public.reportes;
drop policy if exists "reportes: todos escriben"          on public.reportes;

/*
 * Cada persona puede leer SU propia fila aunque no esté autorizada: es lo que
 * permite que la aplicación le diga "tu cuenta no está habilitada" en vez de
 * mostrarle una pantalla en blanco. Es la única excepción.
 */
create policy "perfiles: el equipo lee, cada uno se ve a sí mismo"
  on public.perfiles for select to authenticated
  using (id = (select auth.uid()) or public.es_del_equipo());

create policy "perfiles: cada uno edita el suyo"
  on public.perfiles for update to authenticated
  using (id = (select auth.uid()) and public.es_del_equipo())
  with check (id = (select auth.uid()) and public.es_del_equipo());

-- §2: dentro del equipo todos ven todo, no hay datos privados entre ellos.
create policy "registros: el equipo lee"
  on public.registros for select to authenticated
  using (public.es_del_equipo());

-- created_by tiene que ser el propio usuario: la trazabilidad no se falsea.
create policy "registros: el equipo crea a nombre propio"
  on public.registros for insert to authenticated
  with check (created_by = (select auth.uid()) and public.es_del_equipo());

create policy "registros: el equipo edita"
  on public.registros for update to authenticated
  using (public.es_del_equipo()) with check (public.es_del_equipo());

create policy "registros: el equipo borra"
  on public.registros for delete to authenticated
  using (public.es_del_equipo());

create policy "lineas_base: el equipo lee"
  on public.lineas_base for select to authenticated
  using (public.es_del_equipo());
create policy "lineas_base: el equipo escribe"
  on public.lineas_base for all to authenticated
  using (public.es_del_equipo()) with check (public.es_del_equipo());

create policy "publicaciones_base: el equipo lee"
  on public.publicaciones_base for select to authenticated
  using (public.es_del_equipo());
create policy "publicaciones_base: el equipo escribe"
  on public.publicaciones_base for all to authenticated
  using (public.es_del_equipo()) with check (public.es_del_equipo());

create policy "reportes: el equipo lee"
  on public.reportes for select to authenticated
  using (public.es_del_equipo());
create policy "reportes: el equipo escribe"
  on public.reportes for all to authenticated
  using (public.es_del_equipo()) with check (public.es_del_equipo());

-- Activar una línea base también queda detrás de la puerta: la función es
-- SECURITY DEFINER y sin este control cualquier sesión podría cambiar la
-- referencia contra la que se comparan todos los días.
create or replace function public.activar_linea_base(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.es_del_equipo() then
    raise exception 'No autorizado';
  end if;

  update public.lineas_base set activa = false where activa and id <> p_id;
  update public.lineas_base set activa = true where id = p_id;
end;
$$;

revoke all on function public.activar_linea_base(uuid) from public;
grant execute on function public.activar_linea_base(uuid) to authenticated;
