-- ===========================================================================
-- El registro guarda el formato y el tipo por separado.
--
-- §3.2 — en Instagram una publicación tiene dos clasificaciones a la vez: su
-- formato (Imagen, Reel, Carrusel) y su tipo de contenido (Reactivo, Normal).
-- Mientras una fila representaba varias publicaciones agrupadas, había que
-- elegir una sola y se etiquetaba con la que interesara.
--
-- Con una fila por publicación ya no hay que elegir, y hay que no elegir: al
-- importar una exportación se conoce el formato objetivamente y el tipo se
-- deduce del hashtag. Si guardáramos solo el formato, el corte
-- Reactivo/Normal del panel quedaría vacío para todos los días importados —
-- una función que hoy existe y se perdería sin que nadie lo pidiera.
--
-- Es la misma forma que ya tiene `publicaciones_base`, que guarda `formato` y
-- `tipo` en columnas distintas justamente por esto.
-- ===========================================================================

alter table public.registros
  add column tipo public.categoria;

comment on column public.registros.tipo is
  'Reactivo o Normal, la otra clasificación de Instagram (§3.2). La columna '
  'categoria sigue guardando el formato. Una publicación puede tener las dos, '
  'y el TOTAL no se calcula sumándolas (§9.2).';

/*
 * El tipo solo puede ser Reactivo o Normal: es una clasificación de contenido,
 * no un formato. Va como CHECK porque no necesita mirar otra tabla.
 */
alter table public.registros
  add constraint registros_tipo_valido
  check (tipo is null or tipo in ('Reactivo', 'Normal'));

-- El panel agrupa por esta columna igual que por categoria.
create index registros_tipo_idx on public.registros (fecha, tipo);
