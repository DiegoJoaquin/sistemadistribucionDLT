-- ===========================================================================
-- TikTok pasa a tener una categoría: Video.
--
-- La especificación original decía "TikTok: sin categorías, solo total", así
-- que sus filas se registraban sin categoría y en pantalla aparecían como
-- "sin categoría". El equipo pidió que sean Video.
--
-- Se migran los datos que ya estaban: las filas de TikTok sin categoría pasan
-- a Video, tanto en el registro diario como en las publicaciones de la línea
-- base. Sin migrar la línea base, la fila "Video" del panel no tendría contra
-- qué compararse y mostraría guiones al lado de un TOTAL con datos.
-- ===========================================================================

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
    when 'TikTok'        then c in ('Video')
    when 'YouTube'       then c in ('Short', 'Video')
    when 'Twitter/X'     then c in ('Video', 'Foto')
  end;
$$;

-- El orden importa: primero la función, porque el CHECK de estas tablas la
-- usa y las filas actualizadas se validan contra ella.
update public.registros
   set categoria = 'Video'
 where plataforma = 'TikTok' and categoria is null;

update public.publicaciones_base
   set formato = 'Video'
 where plataforma = 'TikTok' and formato is null;
