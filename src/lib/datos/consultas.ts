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
  type BloqueCatastro,
  claveHashtag,
  construirBloque,
  type DestacadaCatastro,
  destacadas,
  type FilaCatastro,
  type SerieCruzada,
  seriesCruzadas,
} from "@/lib/dominio/catastro";
import {
  construirInforme,
  type FilaInforme,
  type Informe,
} from "@/lib/dominio/informe";
import { type Categoria } from "@/lib/dominio/categorias";
import type { Plataforma } from "@/lib/dominio/plataformas";
import {
  categoriasDeCuenta,
  type Cuenta,
  ordenarCuentas,
  type Red,
  REDES,
} from "@/lib/dominio/redes";
import { supabaseServidor } from "@/lib/supabase/servidor";
import type {
  CuentaRow,
  LineaBaseDetalleRow,
  LineaBaseHashtagRow,
  LineaBaseRow,
  PublicacionBaseRow,
  RegistroConAutor,
  ReporteRow,
} from "@/lib/supabase/tipos-db";

const SELECT_REGISTRO = `
  id, fecha, cuenta_id, plataforma, categoria, tipo, publicaciones,
  alcance, visualizaciones, interacciones, nuevos_seguidores,
  visitas_perfil, vistas_seguidores, vistas_no_seguidores,
  titulo_contenido, enlace, hashtag, publicado_en, id_externo, fuente,
  created_by, created_at, updated_at,
  autor:perfiles!registros_created_by_fkey ( id, nombre, email )
`;

export interface FiltrosRegistro {
  desde?: string;
  hasta?: string;
  cuentaId?: string;
  /** Heredado: filtra por la columna vieja. Lo usa la vista de registro
   *  mientras su formulario sigue trabajando por plataforma. */
  plataforma?: Plataforma;
  categoria?: Categoria;
  usuario?: string;
  /** Serie o hashtag, ya normalizado. */
  hashtag?: string;
}

export async function listarRegistros(
  filtros: FiltrosRegistro,
): Promise<RegistroConAutor[]> {
  const supabase = await supabaseServidor();
  let q = supabase.from("registros").select(SELECT_REGISTRO);

  if (filtros.desde) q = q.gte("fecha", filtros.desde);
  if (filtros.hasta) q = q.lte("fecha", filtros.hasta);
  if (filtros.cuentaId) q = q.eq("cuenta_id", filtros.cuentaId);
  if (filtros.plataforma) q = q.eq("plataforma", filtros.plataforma);
  if (filtros.categoria) q = q.eq("categoria", filtros.categoria);
  if (filtros.usuario) q = q.eq("created_by", filtros.usuario);
  if (filtros.hashtag) q = q.eq("hashtag", filtros.hashtag);

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

/** Cuántas filas se piden por vuelta al paginar. */
const TANDA = 1_000;

/**
 * TODOS los registros del rango, paginando.
 *
 * `listarRegistros` tiene un tope de 500 filas, que alcanza de sobra para un
 * día o una semana. Para un informe de varios meses no: cortaría el conjunto
 * en silencio y todos los promedios saldrían calculados sobre una parte de los
 * datos, sin ningún aviso. Es exactamente la clase de error que este proyecto
 * viene arrastrando desde el Excel.
 *
 * Se pagina en vez de pedir un límite enorme porque PostgREST puede tener su
 * propio techo de filas por respuesta, y entonces el límite grande tampoco
 * serviría.
 */
export async function listarRegistrosDelRango(
  desde: string,
  hasta: string,
): Promise<RegistroConAutor[]> {
  const supabase = await supabaseServidor();
  const todos: RegistroConAutor[] = [];

  for (let inicio = 0; ; inicio += TANDA) {
    const { data, error } = await supabase
      .from("registros")
      .select(SELECT_REGISTRO)
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .order("fecha", { ascending: true })
      .order("id", { ascending: true })
      .range(inicio, inicio + TANDA - 1);

    if (error) throw new Error(`No pude leer los registros: ${error.message}`);

    const tanda = (data ?? []) as unknown as RegistroConAutor[];
    todos.push(...tanda);

    // Menos filas que la tanda significa que era la última.
    if (tanda.length < TANDA) return todos;

    /*
     * Tope de seguridad. Con un millón de filas algo está muy mal y es mejor
     * cortar que quedarse pidiendo tandas para siempre.
     */
    if (todos.length >= 200_000) return todos;
  }
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
export function claveBase(cuentaId: string, categoria: Categoria | null): string {
  return `${cuentaId}|${categoria ?? "TOTAL"}`;
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
    mapa.set(claveBase(fila.cuenta_id, fila.categoria), {
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

/**
 * Promedios de la línea base cortados por serie, para el catastro semanal.
 *
 * Va aparte de `promediosDeLineaBase` porque es otro grano: esa agrupa por
 * formato y esta por hashtag. Mezclarlas en un mapa obligaría a distinguir a
 * ojo si una clave es "Reel" o una serie.
 */
export async function promediosPorHashtag(lineaBaseId: string): Promise<MapaBase> {
  const supabase = await supabaseServidor();
  const { data, error } = await supabase
    .from("lineas_base_hashtag")
    .select("*")
    .eq("linea_base_id", lineaBaseId);

  if (error) {
    throw new Error(`No pude leer la línea base por hashtag: ${error.message}`);
  }

  const mapa: MapaBase = new Map();
  for (const fila of (data ?? []) as LineaBaseHashtagRow[]) {
    mapa.set(claveHashtag(fila.cuenta_id, fila.hashtag), {
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
  cuentaId?: string,
): Promise<PublicacionBaseRow[]> {
  const supabase = await supabaseServidor();
  let q = supabase
    .from("publicaciones_base")
    .select("*")
    .eq("linea_base_id", lineaBaseId);
  if (cuentaId) q = q.eq("cuenta_id", cuentaId);

  const { data, error } = await q
    .order("publicado_en", { ascending: false })
    .limit(1000);
  if (error) throw new Error(`No pude leer las publicaciones: ${error.message}`);
  return (data ?? []) as PublicacionBaseRow[];
}

/* ------------------------------------------------------------------ */
/* Panel diario (§4.2)                                                 */
/* ------------------------------------------------------------------ */

export interface BloqueCuenta {
  cuenta: CuentaRow;
  total: LineaPanel;
  categorias: LineaPanel[];
  /** true si no hay ninguna fila registrada para esa cuenta ese día. */
  sinDatos: boolean;
}

export interface PanelDiario {
  fecha: string;
  base: LineaBaseRow | null;
  bloques: BloqueCuenta[];
  perfil: LineaPerfil[];
  hayAlgo: boolean;
}

/** Índice de cuentas por id, para resolver la cuenta de cada fila. */
export function cuentasPorId(cuentas: readonly CuentaRow[]): Map<string, CuentaRow> {
  return new Map(cuentas.map((c) => [c.id, c]));
}

export function aFilaCalculo(r: RegistroConAutor, cuenta: Cuenta): FilaCalculo {
  return {
    cuentaId: cuenta.id,
    // Las reglas dependen de la red de la cuenta, no del nombre de la fila.
    red: cuenta.red,
    categoria: r.categoria,
    tipo: r.tipo,
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

export function aFilasCalculo(
  registros: readonly RegistroConAutor[],
  indice: Map<string, CuentaRow>,
): FilaCalculo[] {
  // Una fila sin cuenta no debería existir (hay clave foránea), pero si
  // apareciera, quedarse callado es mejor que caerse: se omite del cálculo.
  return registros.flatMap((r) => {
    const cuenta = indice.get(r.cuenta_id);
    return cuenta ? [aFilaCalculo(r, cuenta)] : [];
  });
}

export async function panelDelDia(fecha: string): Promise<PanelDiario> {
  const [registros, base, cuentas] = await Promise.all([
    registrosDelDia(fecha),
    lineaBaseActiva(),
    listarCuentas(),
  ]);

  const mapa = base ? await promediosDeLineaBase(base.id) : (new Map() as MapaBase);
  const indice = cuentasPorId(cuentas);
  const filas = aFilasCalculo(registros, indice);

  /*
   * Solo las cuentas que tuvieron actividad ese día. Con cinco cuentas fijas
   * mostrar las vacías tenía sentido; con las de los influencers, la mayoría
   * no publica todos los días y el panel se llenaría de bloques en blanco
   * (§8: estados vacíos claros, no tablas de ceros).
   */
  const conActividad = cuentas.filter((c) => filas.some((f) => f.cuentaId === c.id));

  const bloques: BloqueCuenta[] = conActividad.map((cuenta) => ({
    cuenta,
    // §9.2: el TOTAL sale de todas las filas de la cuenta, sin filtrar.
    total: construirLinea(filas, cuenta, null, mapa.get(claveBase(cuenta.id, null)) ?? null),
    categorias: categoriasDeCuenta(cuenta).map((categoria) =>
      construirLinea(
        filas,
        cuenta,
        categoria,
        mapa.get(claveBase(cuenta.id, categoria)) ?? null,
      ),
    ),
    sinDatos: false,
  }));

  const perfil: LineaPerfil[] = [
    ...conActividad.map((c) => construirLineaPerfil(filas, c)),
    construirLineaPerfil(filas, null),
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
/* Catastro por hashtag (§ reporte semanal)                            */
/* ------------------------------------------------------------------ */

export interface Catastro {
  desde: string;
  hasta: string;
  base: LineaBaseRow | null;
  bloques: BloqueCatastro[];
  /** El mismo hashtag publicado en más de una cuenta. */
  cruzadas: SerieCruzada[];
  mejores: DestacadaCatastro[];
  peores: DestacadaCatastro[];
  /**
   * §4.3 — visitas al perfil y vistas de seguidores/no seguidores, como
   * promedio por publicación del período. Una línea por cuenta que tenga
   * alguna cargada; van dentro del bloque de esa cuenta en el reporte.
   */
  perfil: LineaPerfil[];
  publicaciones: number;
  /** Cuántas series distintas salieron en el período. */
  series: number;
  hayAlgo: boolean;
}

export function aFilaCatastro(r: RegistroConAutor, cuenta: Cuenta): FilaCatastro {
  return { ...aFilaCalculo(r, cuenta), hashtag: r.hashtag };
}

/**
 * El catastro de un período: qué se publicó, por cuenta y por serie.
 *
 * Solo aparecen las cuentas que publicaron algo. Con las cuentas de los
 * influencers, mostrar las vacías llenaría la vista de bloques en blanco (§8).
 */
export async function catastroDelPeriodo(
  desde: string,
  hasta: string,
): Promise<Catastro> {
  const [registros, base, cuentas] = await Promise.all([
    listarRegistros({ desde, hasta }),
    lineaBaseActiva(),
    listarCuentas(),
  ]);

  const [porHashtag, porCategoria] = base
    ? await Promise.all([promediosPorHashtag(base.id), promediosDeLineaBase(base.id)])
    : [new Map() as MapaBase, new Map() as MapaBase];

  /*
   * El comparador "promedio de la cuenta" es la fila TOTAL de la línea base,
   * que en el mapa por categoría es la de categoría nula. Se reindexa por id de
   * cuenta para que el motor no tenga que conocer la forma de esa clave.
   */
  const porCuenta: MapaBase = new Map();
  for (const cuenta of cuentas) {
    const total = porCategoria.get(claveBase(cuenta.id, null));
    if (total) porCuenta.set(cuenta.id, total);
  }

  const indice = cuentasPorId(cuentas);
  const filas: FilaCatastro[] = registros.flatMap((r) => {
    const cuenta = indice.get(r.cuenta_id);
    return cuenta ? [aFilaCatastro(r, cuenta)] : [];
  });

  const conActividad = cuentas.filter((c) => filas.some((f) => f.cuentaId === c.id));
  const bloques = conActividad.map((cuenta) =>
    construirBloque(filas, cuenta, { porHashtag, porCuenta }),
  );

  const { mejores, peores } = destacadas(bloques);
  const series = new Set(
    filas.filter((f) => f.hashtag !== null).map((f) => f.hashtag),
  ).size;

  return {
    desde,
    hasta,
    base,
    bloques,
    cruzadas: seriesCruzadas(bloques),
    mejores,
    peores,
    // Solo las cuentas que cargaron alguna: las tres métricas van a mano y lo
    // habitual es que falten (§4.1).
    perfil: conActividad
      .map((c) => construirLineaPerfil(filas, c))
      .filter((l) => !l.sinDatos),
    publicaciones: filas.reduce((n, f) => n + f.publicaciones, 0),
    series,
    hayAlgo: filas.length > 0,
  };
}

/* ------------------------------------------------------------------ */
/* Clientes e informes por cliente                                     */
/* ------------------------------------------------------------------ */

export interface ClienteRow {
  id: string;
  nombre: string;
  notas: string | null;
  activo: boolean;
  creado_en: string;
}

export interface ClienteConHashtags extends ClienteRow {
  hashtags: string[];
}

/** Todos los clientes con su lista de hashtags, ordenados por nombre. */
export async function listarClientes(): Promise<ClienteConHashtags[]> {
  const supabase = await supabaseServidor();

  const [clientes, relaciones] = await Promise.all([
    supabase.from("clientes").select("*").order("nombre"),
    supabase.from("cliente_hashtags").select("cliente_id, hashtag"),
  ]);

  if (clientes.error) {
    throw new Error(`No pude leer los clientes: ${clientes.error.message}`);
  }
  if (relaciones.error) {
    throw new Error(`No pude leer los hashtags: ${relaciones.error.message}`);
  }

  const porCliente = new Map<string, string[]>();
  for (const r of (relaciones.data ?? []) as { cliente_id: string; hashtag: string }[]) {
    const lista = porCliente.get(r.cliente_id);
    if (lista) lista.push(r.hashtag);
    else porCliente.set(r.cliente_id, [r.hashtag]);
  }

  return ((clientes.data ?? []) as ClienteRow[]).map((c) => ({
    ...c,
    hashtags: (porCliente.get(c.id) ?? []).sort((a, b) => a.localeCompare(b, "es")),
  }));
}

export async function clientePorId(id: string): Promise<ClienteConHashtags | null> {
  return (await listarClientes()).find((c) => c.id === id) ?? null;
}

/**
 * Hashtags que aparecen en los registros y no están en la lista de ningún
 * cliente.
 *
 * Es el contrapeso de haber elegido listas explícitas en vez de patrones: una
 * serie nueva del cliente no entra sola al informe, así que hay que poder ver
 * qué quedó afuera y decidir. Sin esto, un informe incompleto no se nota.
 */
export async function hashtagsSinCliente(
  desde?: string,
  hasta?: string,
): Promise<{ hashtag: string; publicaciones: number }[]> {
  const supabase = await supabaseServidor();

  let q = supabase.from("registros").select("hashtag, publicaciones").not("hashtag", "is", null);
  if (desde) q = q.gte("fecha", desde);
  if (hasta) q = q.lte("fecha", hasta);

  const [registros, asignados] = await Promise.all([
    q.limit(20_000),
    supabase.from("cliente_hashtags").select("hashtag"),
  ]);

  if (registros.error) {
    throw new Error(`No pude leer los hashtags: ${registros.error.message}`);
  }

  const yaEstan = new Set(
    ((asignados.data ?? []) as { hashtag: string }[]).map((r) => r.hashtag),
  );

  const conteo = new Map<string, number>();
  for (const r of (registros.data ?? []) as {
    hashtag: string;
    publicaciones: number;
  }[]) {
    if (yaEstan.has(r.hashtag)) continue;
    conteo.set(r.hashtag, (conteo.get(r.hashtag) ?? 0) + r.publicaciones);
  }

  return [...conteo.entries()]
    .map(([hashtag, publicaciones]) => ({ hashtag, publicaciones }))
    .sort((a, b) => b.publicaciones - a.publicaciones || a.hashtag.localeCompare(b.hashtag, "es"));
}

function aFilaInforme(r: RegistroConAutor, cuenta: Cuenta): FilaInforme {
  return { ...aFilaCatastro(r, cuenta), fecha: r.fecha };
}

/**
 * El informe de un cliente en un período.
 *
 * Las comparaciones salen de la línea base activa, igual que en todo el resto
 * de la aplicación: cada serie contra su propio promedio histórico y contra el
 * promedio total de la cuenta donde se publicó.
 */
export async function informeDeCliente(
  cliente: ClienteConHashtags,
  desde: string,
  hasta: string,
): Promise<{ informe: Informe; base: LineaBaseRow | null }> {
  const [registros, base, cuentas] = await Promise.all([
    listarRegistrosDelRango(desde, hasta),
    lineaBaseActiva(),
    listarCuentas(),
  ]);

  const [porHashtag, porCategoria] = base
    ? await Promise.all([promediosPorHashtag(base.id), promediosDeLineaBase(base.id)])
    : [new Map() as MapaBase, new Map() as MapaBase];

  const porCuenta: MapaBase = new Map();
  for (const cuenta of cuentas) {
    const total = porCategoria.get(claveBase(cuenta.id, null));
    if (total) porCuenta.set(cuenta.id, total);
  }

  const indice = cuentasPorId(cuentas);
  const filas: FilaInforme[] = registros.flatMap((r) => {
    const cuenta = indice.get(r.cuenta_id);
    return cuenta ? [aFilaInforme(r, cuenta)] : [];
  });

  return {
    informe: construirInforme(
      cliente.nombre,
      cliente.hashtags,
      filas,
      cuentas,
      { desde, hasta },
      { porHashtag, porCuenta },
    ),
    base,
  };
}

/* ------------------------------------------------------------------ */
/* Envíos del reporte semanal                                          */
/* ------------------------------------------------------------------ */

export interface EnvioReporte {
  id: string;
  semana: string;
  destinatarios: string[];
  asunto: string;
  id_mensaje: string | null;
  enviado_en: string;
  enviado_por: string;
  /** Quién lo mandó, para poder mostrarlo. */
  autor: { nombre: string; email: string } | null;
}

/**
 * Los envíos de una semana, del más reciente al más antiguo.
 *
 * En plural porque puede haberse reenviado: si la primera vez faltaban datos,
 * interesa ver las dos veces y no solo la última.
 */
export async function enviosDeSemana(lunes: string): Promise<EnvioReporte[]> {
  const supabase = await supabaseServidor();
  const { data, error } = await supabase
    .from("envios_reporte")
    .select(
      `id, semana, destinatarios, asunto, id_mensaje, enviado_en, enviado_por,
       autor:perfiles!envios_reporte_enviado_por_fkey ( nombre, email )`,
    )
    .eq("semana", lunes)
    .order("enviado_en", { ascending: false });

  /*
   * Un error acá no puede voltear la página del reporte: lo más probable es
   * que falte la migración de `envios_reporte`, y en ese caso conviene poder
   * seguir viendo y copiando el reporte aunque el historial de envíos no esté.
   */
  if (error) {
    console.error("No pude leer los envíos del reporte:", error.message);
    return [];
  }

  return (data ?? []) as unknown as EnvioReporte[];
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

export interface ResumenCuentaBase {
  cuenta_id: string;
  cuenta: string;
  red: Red;
  n_publicaciones: number;
  alcance_prom: number | null;
  visualizaciones_prom: number | null;
  interacciones_prom: number | null;
  nuevos_seguidores_prom: number | null;
  engagement_prom: number | null;
}

/**
 * Filas TOTAL (categoria is null) de cada cuenta: sirve para mostrar de un
 * vistazo qué trae una línea base sin cargar las publicaciones una por una.
 *
 * El nombre y la red vienen en la vista, así que no hace falta consultar la
 * tabla de cuentas.
 */
export async function resumenLineaBase(
  lineaBaseId: string,
): Promise<ResumenCuentaBase[]> {
  const supabase = await supabaseServidor();
  const { data, error } = await supabase
    .from("lineas_base_detalle")
    .select("*")
    .eq("linea_base_id", lineaBaseId)
    .is("categoria", null);

  if (error) throw new Error(`No pude leer el resumen: ${error.message}`);

  return ((data ?? []) as LineaBaseDetalleRow[])
    .map((f) => ({
      cuenta_id: f.cuenta_id,
      cuenta: f.cuenta,
      red: f.red,
      n_publicaciones: f.n_publicaciones,
      alcance_prom: f.alcance_prom,
      visualizaciones_prom: f.visualizaciones_prom,
      interacciones_prom: f.interacciones_prom,
      nuevos_seguidores_prom: f.nuevos_seguidores_prom,
      engagement_prom: f.engagement_prom,
    }))
    .sort(
      (a, b) =>
        REDES.indexOf(a.red) - REDES.indexOf(b.red) ||
        a.cuenta.localeCompare(b.cuenta, "es"),
    );
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

/* ------------------------------------------------------------------ */
/* Cuentas                                                             */
/* ------------------------------------------------------------------ */

/**
 * Todas las cuentas, ordenadas para mostrar: primero las propias, después las
 * de influencers. Incluye las desactivadas, porque sus registros históricos
 * siguen existiendo y hay que poder rotularlos.
 */
export async function listarCuentas(): Promise<CuentaRow[]> {
  const supabase = await supabaseServidor();
  const { data, error } = await supabase.from("cuentas").select("*");
  if (error) throw new Error(`No pude leer las cuentas: ${error.message}`);
  return ordenarCuentas((data ?? []) as CuentaRow[]) as CuentaRow[];
}

/** Solo las que están en uso, para los selectores de carga. */
export async function cuentasActivas(): Promise<CuentaRow[]> {
  return (await listarCuentas()).filter((c) => c.activa);
}

/** Cuántas filas depende de cada cuenta, para avisar antes de desactivarla. */
export async function usoDeCuentas(): Promise<Map<string, number>> {
  const supabase = await supabaseServidor();
  const { data } = await supabase.from("registros").select("cuenta_id").limit(10_000);
  const uso = new Map<string, number>();
  for (const fila of (data ?? []) as { cuenta_id: string | null }[]) {
    if (!fila.cuenta_id) continue;
    uso.set(fila.cuenta_id, (uso.get(fila.cuenta_id) ?? 0) + 1);
  }
  return uso;
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
  /**
   * La fila completa, no una proyección: el histórico permite editarla en el
   * lugar y el formulario necesita todos los campos, incluidas las métricas de
   * perfil, el título y el enlace.
   */
  registro: RegistroConAutor;
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
  const [registros, base, cuentas] = await Promise.all([
    listarRegistros({ desde, hasta }),
    lineaBaseActiva(),
    listarCuentas(),
  ]);

  const mapa = base ? await promediosDeLineaBase(base.id) : (new Map() as MapaBase);
  const indice = cuentasPorId(cuentas);

  const porFecha = new Map<string, RegistroConAutor[]>();
  for (const r of registros) {
    const lista = porFecha.get(r.fecha);
    if (lista) lista.push(r);
    else porFecha.set(r.fecha, [r]);
  }

  const dias: DiaHistorico[] = [...porFecha.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([fecha, delDia]) => {
      const filas = aFilasCalculo(delDia, indice);

      // Solo las cuentas que tuvieron actividad: §8, nada de filas de ceros.
      const bloques = cuentas
        .filter((c) => filas.some((f) => f.cuentaId === c.id))
        .map((cuenta) => ({
          linea: construirLinea(
            filas,
            cuenta,
            null,
            mapa.get(claveBase(cuenta.id, null)) ?? null,
          ),
          detalle: delDia
            .filter((r) => r.cuenta_id === cuenta.id)
            .map((r) => detalleDeFila(r, cuenta, mapa)),
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
function detalleDeFila(
  r: RegistroConAutor,
  cuenta: Cuenta,
  mapa: MapaBase,
): DetalleFila {
  const uno = [aFilaCalculo(r, cuenta)];
  const b = mapa.get(claveBase(cuenta.id, r.categoria)) ?? null;

  const porPublicacion = {
    alcance: promedioPorPublicacion(uno, "alcance"),
    visualizaciones: promedioPorPublicacion(uno, "visualizaciones"),
    interacciones: promedioPorPublicacion(uno, "interacciones"),
    nuevos_seguidores: promedioPorPublicacion(uno, "nuevos_seguidores"),
    engagement: engagement(uno, cuenta.red),
  };

  return {
    registro: r,
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
