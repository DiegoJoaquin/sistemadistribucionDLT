import "server-only";

import {
  construirLinea,
  construirLineaPerfil,
  delta,
  engagement,
  type FilaCalculo,
  type LineaPanel,
  type LineaPerfil,
  promedioPorPublicacion,
  type PromediosBase,
} from "@/lib/dominio/calculo";
import {
  type Categoria,
  categoriasDe,
  ORDEN_PLATAFORMAS,
  type Plataforma,
} from "@/lib/dominio/plataformas";
import { supabaseServidor } from "@/lib/supabase/servidor";
import type {
  LineaBaseDetalleRow,
  LineaBaseRow,
  PublicacionBaseRow,
  RegistroConAutor,
  ReporteRow,
} from "@/lib/supabase/tipos-db";

const SELECT_REGISTRO = `
  id, fecha, plataforma, categoria, publicaciones,
  alcance, visualizaciones, interacciones, nuevos_seguidores,
  visitas_perfil, vistas_seguidores, vistas_no_seguidores,
  titulo_contenido, enlace,
  created_by, created_at, updated_at,
  autor:perfiles!registros_created_by_fkey ( id, nombre, email )
`;

export interface FiltrosRegistro {
  desde?: string;
  hasta?: string;
  plataforma?: Plataforma;
  categoria?: Categoria;
  usuario?: string;
}

export async function listarRegistros(
  filtros: FiltrosRegistro,
): Promise<RegistroConAutor[]> {
  const supabase = await supabaseServidor();
  let q = supabase.from("registros").select(SELECT_REGISTRO);

  if (filtros.desde) q = q.gte("fecha", filtros.desde);
  if (filtros.hasta) q = q.lte("fecha", filtros.hasta);
  if (filtros.plataforma) q = q.eq("plataforma", filtros.plataforma);
  if (filtros.categoria) q = q.eq("categoria", filtros.categoria);
  if (filtros.usuario) q = q.eq("created_by", filtros.usuario);

  const { data, error } = await q
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) throw new Error(`No pude leer los registros: ${error.message}`);
  return (data ?? []) as unknown as RegistroConAutor[];
}

export async function registrosDelDia(fecha: string): Promise<RegistroConAutor[]> {
  return listarRegistros({ desde: fecha, hasta: fecha });
}

/* ------------------------------------------------------------------ */
/* Líneas base                                                         */
/* ------------------------------------------------------------------ */

export async function listarLineasBase(): Promise<LineaBaseRow[]> {
  const supabase = await supabaseServidor();
  const { data, error } = await supabase
    .from("lineas_base")
    .select("*")
    .order("mes", { ascending: false });
  if (error) throw new Error(`No pude leer las líneas base: ${error.message}`);
  return (data ?? []) as LineaBaseRow[];
}

export async function lineaBaseActiva(): Promise<LineaBaseRow | null> {
  const supabase = await supabaseServidor();
  const { data } = await supabase
    .from("lineas_base")
    .select("*")
    .eq("activa", true)
    .maybeSingle<LineaBaseRow>();
  return data ?? null;
}

/** Clave estable para el mapa de promedios: la fila TOTAL es `categoria = null`. */
export function claveBase(plataforma: Plataforma, categoria: Categoria | null): string {
  return `${plataforma}|${categoria ?? "TOTAL"}`;
}

export type MapaBase = Map<string, PromediosBase>;

export async function promediosDeLineaBase(lineaBaseId: string): Promise<MapaBase> {
  const supabase = await supabaseServidor();
  const { data, error } = await supabase
    .from("lineas_base_detalle")
    .select("*")
    .eq("linea_base_id", lineaBaseId);

  if (error) throw new Error(`No pude leer la línea base: ${error.message}`);

  const mapa: MapaBase = new Map();
  for (const fila of (data ?? []) as LineaBaseDetalleRow[]) {
    mapa.set(claveBase(fila.plataforma, fila.categoria), {
      n_publicaciones: fila.n_publicaciones,
      alcance_prom: fila.alcance_prom,
      visualizaciones_prom: fila.visualizaciones_prom,
      interacciones_prom: fila.interacciones_prom,
      nuevos_seguidores_prom: fila.nuevos_seguidores_prom,
      engagement_prom: fila.engagement_prom,
    });
  }
  return mapa;
}

export async function publicacionesDeLineaBase(
  lineaBaseId: string,
  plataforma?: Plataforma,
): Promise<PublicacionBaseRow[]> {
  const supabase = await supabaseServidor();
  let q = supabase
    .from("publicaciones_base")
    .select("*")
    .eq("linea_base_id", lineaBaseId);
  if (plataforma) q = q.eq("plataforma", plataforma);

  const { data, error } = await q
    .order("publicado_en", { ascending: false })
    .limit(1000);
  if (error) throw new Error(`No pude leer las publicaciones: ${error.message}`);
  return (data ?? []) as PublicacionBaseRow[];
}

/* ------------------------------------------------------------------ */
/* Panel diario (§4.2)                                                 */
/* ------------------------------------------------------------------ */

export interface BloquePlataforma {
  plataforma: Plataforma;
  total: LineaPanel;
  categorias: LineaPanel[];
  /** true si no hay ninguna fila registrada para esa plataforma ese día. */
  sinDatos: boolean;
}

export interface PanelDiario {
  fecha: string;
  base: LineaBaseRow | null;
  bloques: BloquePlataforma[];
  perfil: LineaPerfil[];
  hayAlgo: boolean;
}

export function aFilaCalculo(r: RegistroConAutor): FilaCalculo {
  return {
    plataforma: r.plataforma,
    categoria: r.categoria,
    publicaciones: r.publicaciones,
    alcance: r.alcance,
    visualizaciones: r.visualizaciones,
    interacciones: r.interacciones,
    nuevos_seguidores: r.nuevos_seguidores,
    visitas_perfil: r.visitas_perfil,
    vistas_seguidores: r.vistas_seguidores,
    vistas_no_seguidores: r.vistas_no_seguidores,
  };
}

export async function panelDelDia(fecha: string): Promise<PanelDiario> {
  const [registros, base] = await Promise.all([
    registrosDelDia(fecha),
    lineaBaseActiva(),
  ]);

  const mapa = base ? await promediosDeLineaBase(base.id) : (new Map() as MapaBase);
  const filas = registros.map(aFilaCalculo);

  const bloques: BloquePlataforma[] = ORDEN_PLATAFORMAS.map((plataforma) => {
    const propias = filas.filter((f) => f.plataforma === plataforma);

    // §9.2: el TOTAL sale de todas las filas de la plataforma, sin filtrar.
    const total = construirLinea(
      filas,
      plataforma,
      null,
      mapa.get(claveBase(plataforma, null)) ?? null,
    );

    const categorias = categoriasDe(plataforma).map((categoria) =>
      construirLinea(
        filas,
        plataforma,
        categoria,
        mapa.get(claveBase(plataforma, categoria)) ?? null,
      ),
    );

    return { plataforma, total, categorias, sinDatos: propias.length === 0 };
  });

  const perfil: LineaPerfil[] = [
    ...ORDEN_PLATAFORMAS.map((p) => construirLineaPerfil(filas, p)),
    construirLineaPerfil(filas, "TOTAL"),
  ];

  return {
    fecha,
    base,
    bloques,
    perfil,
    hayAlgo: registros.length > 0,
  };
}

/* ------------------------------------------------------------------ */
/* Reporte diario                                                      */
/* ------------------------------------------------------------------ */

export async function reporteDe(fecha: string): Promise<ReporteRow | null> {
  const supabase = await supabaseServidor();
  const { data } = await supabase
    .from("reportes")
    .select("*")
    .eq("fecha", fecha)
    .maybeSingle<ReporteRow>();
  return data ?? null;
}

export async function listarPerfiles() {
  const supabase = await supabaseServidor();
  const { data } = await supabase
    .from("perfiles")
    .select("id, nombre, email")
    .order("nombre");
  return data ?? [];
}

/* ------------------------------------------------------------------ */
/* Resumen de una línea base, por plataforma                           */
/* ------------------------------------------------------------------ */

export interface ResumenPlataformaBase {
  plataforma: Plataforma;
  n_publicaciones: number;
  alcance_prom: number | null;
  visualizaciones_prom: number | null;
  interacciones_prom: number | null;
  nuevos_seguidores_prom: number | null;
  engagement_prom: number | null;
}

/**
 * Filas TOTAL (categoria is null) de cada plataforma: sirve para mostrar de un
 * vistazo qué trae una línea base sin cargar las publicaciones una por una.
 */
export async function resumenLineaBase(
  lineaBaseId: string,
): Promise<ResumenPlataformaBase[]> {
  const supabase = await supabaseServidor();
  const { data, error } = await supabase
    .from("lineas_base_detalle")
    .select("*")
    .eq("linea_base_id", lineaBaseId)
    .is("categoria", null);

  if (error) throw new Error(`No pude leer el resumen: ${error.message}`);

  const filas = (data ?? []) as LineaBaseDetalleRow[];
  return ORDEN_PLATAFORMAS.flatMap((plataforma) => {
    const f = filas.find((x) => x.plataforma === plataforma);
    return f
      ? [
          {
            plataforma,
            n_publicaciones: f.n_publicaciones,
            alcance_prom: f.alcance_prom,
            visualizaciones_prom: f.visualizaciones_prom,
            interacciones_prom: f.interacciones_prom,
            nuevos_seguidores_prom: f.nuevos_seguidores_prom,
            engagement_prom: f.engagement_prom,
          },
        ]
      : [];
  });
}

/** Detalle completo por categoría, para la vista de una línea base. */
export async function detalleLineaBase(
  lineaBaseId: string,
): Promise<LineaBaseDetalleRow[]> {
  const supabase = await supabaseServidor();
  const { data, error } = await supabase
    .from("lineas_base_detalle")
    .select("*")
    .eq("linea_base_id", lineaBaseId);
  if (error) throw new Error(`No pude leer el detalle: ${error.message}`);
  return (data ?? []) as LineaBaseDetalleRow[];
}

export async function lineaBasePorId(id: string): Promise<LineaBaseRow | null> {
  const supabase = await supabaseServidor();
  const { data } = await supabase
    .from("lineas_base")
    .select("*")
    .eq("id", id)
    .maybeSingle<LineaBaseRow>();
  return data ?? null;
}

/* ------------------------------------------------------------------ */
/* Histórico: un día por bloque, todas las plataformas con actividad   */
/* ------------------------------------------------------------------ */

/**
 * Una fila individual del registro, con sus propios promedios por publicación
 * y sus deltas. Es el desglose que se abre al expandir una plataforma: si un
 * día hubo 17 publicaciones, se ve cuánto hizo cada carga.
 */
export interface DetalleFila {
  id: string;
  categoria: Categoria | null;
  publicaciones: number;
  titulo: string | null;
  enlace: string | null;
  autor: string | null;
  creadoEn: string;
  editado: boolean;
  /** Promedios por publicación de esta fila sola. */
  porPublicacion: {
    alcance: number | null;
    visualizaciones: number | null;
    interacciones: number | null;
    nuevos_seguidores: number | null;
    engagement: number | null;
  };
  deltas: {
    alcance: number | null;
    visualizaciones: number | null;
    interacciones: number | null;
    nuevos_seguidores: number | null;
  };
  sinBase: boolean;
}

export interface BloqueDia {
  linea: LineaPanel;
  detalle: DetalleFila[];
}

export interface DiaHistorico {
  fecha: string;
  /** Publicaciones de todas las plataformas ese día. */
  publicaciones: number;
  filas: number;
  bloques: BloqueDia[];
  /** Quiénes cargaron datos ese día. */
  autores: string[];
}

/**
 * Días con registros, del más reciente al más antiguo, con el TOTAL de cada
 * plataforma comparado contra la línea base activa.
 *
 * Es la vista que reemplaza al scroll interminable de la hoja REGISTRO: en vez
 * de 234 filas sueltas, un bloque por día con lo que pasó en cada plataforma.
 */
export async function historicoPorDia(
  desde: string,
  hasta: string,
): Promise<{ dias: DiaHistorico[]; base: LineaBaseRow | null }> {
  const [registros, base] = await Promise.all([
    listarRegistros({ desde, hasta }),
    lineaBaseActiva(),
  ]);

  const mapa = base ? await promediosDeLineaBase(base.id) : (new Map() as MapaBase);

  const porFecha = new Map<string, RegistroConAutor[]>();
  for (const r of registros) {
    const lista = porFecha.get(r.fecha);
    if (lista) lista.push(r);
    else porFecha.set(r.fecha, [r]);
  }

  const dias: DiaHistorico[] = [...porFecha.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([fecha, delDia]) => {
      const filas = delDia.map(aFilaCalculo);

      // Solo las plataformas que tuvieron actividad: §8, nada de filas de ceros.
      const bloques = ORDEN_PLATAFORMAS.filter((p) =>
        filas.some((f) => f.plataforma === p),
      ).map((plataforma) => ({
        linea: construirLinea(
          filas,
          plataforma,
          null,
          mapa.get(claveBase(plataforma, null)) ?? null,
        ),
        detalle: delDia
          .filter((r) => r.plataforma === plataforma)
          .map((r) => detalleDeFila(r, mapa)),
      }));

      return {
        fecha,
        publicaciones: filas.reduce((a, f) => a + f.publicaciones, 0),
        filas: delDia.length,
        bloques,
        autores: [
          ...new Set(delDia.map((r) => r.autor?.nombre).filter((n): n is string => !!n)),
        ].sort(),
      };
    });

  return { dias, base };
}

/**
 * Promedios y deltas de UNA fila del registro.
 *
 * §9.1 sigue rigiendo también acá: una fila que representa 3 publicaciones con
 * 30.000 de alcance vale 10.000 por publicación, no 30.000. Compararla contra
 * el promedio de la línea base sin dividir sería el mismo error del +859%.
 */
function detalleDeFila(r: RegistroConAutor, mapa: MapaBase): DetalleFila {
  const calc = aFilaCalculo(r);
  const uno = [calc];
  const b = mapa.get(claveBase(r.plataforma, r.categoria)) ?? null;

  const porPublicacion = {
    alcance: promedioPorPublicacion(uno, "alcance"),
    visualizaciones: promedioPorPublicacion(uno, "visualizaciones"),
    interacciones: promedioPorPublicacion(uno, "interacciones"),
    nuevos_seguidores: promedioPorPublicacion(uno, "nuevos_seguidores"),
    engagement: engagement(uno, r.plataforma),
  };

  return {
    id: r.id,
    categoria: r.categoria,
    publicaciones: r.publicaciones,
    titulo: r.titulo_contenido,
    enlace: r.enlace,
    autor: r.autor?.nombre ?? null,
    creadoEn: r.created_at,
    editado: r.updated_at !== r.created_at,
    porPublicacion,
    deltas: {
      alcance: delta(porPublicacion.alcance, b?.alcance_prom),
      visualizaciones: delta(porPublicacion.visualizaciones, b?.visualizaciones_prom),
      interacciones: delta(porPublicacion.interacciones, b?.interacciones_prom),
      nuevos_seguidores: delta(
        porPublicacion.nuevos_seguidores,
        b?.nuevos_seguidores_prom,
      ),
    },
    sinBase: b === null,
  };
}

/** Primera y última fecha con registros, para acotar los filtros. */
export async function rangoDeRegistros(): Promise<{ desde: string; hasta: string } | null> {
  const supabase = await supabaseServidor();
  const [{ data: prim }, { data: ult }] = await Promise.all([
    supabase.from("registros").select("fecha").order("fecha", { ascending: true }).limit(1),
    supabase.from("registros").select("fecha").order("fecha", { ascending: false }).limit(1),
  ]);
  if (!prim?.[0] || !ult?.[0]) return null;
  return {
    desde: (prim[0] as { fecha: string }).fecha,
    hasta: (ult[0] as { fecha: string }).fecha,
  };
}
