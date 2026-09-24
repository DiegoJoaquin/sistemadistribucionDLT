-- ===========================================================================
-- Registro de los reportes semanales que se enviaron.
--
-- El botón de enviar tiene que poder decir "esta semana ya se mandó el lunes a
-- las 9:41, la envió Diego, a estas dos direcciones". Sin eso, dos personas
-- del equipo mandan el mismo reporte a los jefes sin saberlo — y no hay forma
-- de responder "¿ya lo enviaste?" mirando la aplicación.
--
-- La clave es el LUNES de la semana, no la fecha de envío: así reenviar el
-- reporte de una semana pasada queda registrado contra la semana que reporta,
-- no contra el día en que alguien lo mandó.
--
-- Se guardan los envíos, en plural: si hubo que reenviar porque la primera vez
-- faltaban datos, las dos veces quedan. Reemplazar la fila anterior borraría
-- justamente lo que se quiere poder auditar.
-- ===========================================================================

create table public.envios_reporte (
  id            uuid primary key default gen_random_uuid(),
  -- Lunes de la semana que reporta.
  semana        date not null,
  destinatarios text[] not null,
  asunto        text not null,
  -- Lo que devolvió el servidor de correo, para poder rastrear un envío.
  id_mensaje    text,
  enviado_por   uuid not null references public.perfiles(id),
  enviado_en    timestamptz not null default now(),
  constraint envios_reporte_semana_es_lunes
    check (extract(isodow from semana) = 1),
  /*
   * El coalesce es imprescindible: `array_length('{}', 1)` devuelve NULL, no
   * 0, y un CHECK que evalúa a NULL pasa. Sin él, la restricción aceptaba
   * exactamente el caso que tiene que rechazar — un envío sin destinatarios.
   */
  constraint envios_reporte_con_destinatarios
    check (coalesce(array_length(destinatarios, 1), 0) >= 1)
);

comment on table public.envios_reporte is
  'Cada vez que se envió el reporte semanal por correo. La semana es el lunes '
  'que la inicia. Sirve para avisar que ya se mandó y para saber quién lo hizo.';

create index envios_reporte_semana_idx
  on public.envios_reporte (semana desc, enviado_en desc);

-- ---------------------------------------------------------------------------
-- RLS: lo ve y lo escribe el equipo, igual que todo lo demás
-- ---------------------------------------------------------------------------

alter table public.envios_reporte enable row level security;

create policy "envios: el equipo lee"
  on public.envios_reporte for select to authenticated
  using (public.es_del_equipo());

/*
 * Insert y nada más: un envío ocurrió y no se puede deshacer. Permitir
 * borrarlo sería permitir esconder que el reporte salió.
 */
create policy "envios: el equipo registra"
  on public.envios_reporte for insert to authenticated
  with check (public.es_del_equipo() and enviado_por = auth.uid());
