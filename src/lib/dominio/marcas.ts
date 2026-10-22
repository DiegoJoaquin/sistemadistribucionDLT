/**
 * Global de marcas: cuánto contenido se subió de cada marca comercial.
 *
 * Una marca se reconoce por sus SEÑALES en la publicación:
 *
 *  - hashtags (#SPARTAxDLT, #ELLIVINGDELTEAMCHILE),
 *  - arrobas (@spartachile, @crocschile),
 *  - campañas con que Iconosquare etiqueta la publicación ("SPARTA GLOBAL").
 *
 * Las listas son EXACTAS, igual que las de los clientes: un patrón como «todo
 * lo que contenga SPARTA» parece cómodo hasta que cuenta como de la marca una
 * nota que solo la nombra. Para que no se escape una marca nueva por omisión,
 * `arrobasSinMarca` muestra las arrobas que aparecen y no son de ninguna.
 *
 * Aquí solo se cuenta: cuántas piezas, dónde y cuándo. El rendimiento de cada
 * marca está en los informes por cliente.
 *
 * Todo es puro, sin base de datos, para poder testearlo.
 */

import { normalizarHashtag } from "./hashtag";
import { type Granularidad, type Periodo, periodosDelRango } from "./hashtags";
import type { Red } from "./redes";

export type TipoSenal = "hashtag" | "mencion" | "campana";

export interface Senal {
  tipo: TipoSenal;
  valor: string;
}

export interface Marca {
  id: string;
  nombre: string;
  activa: boolean;
  senales: Senal[];
}

/* ------------------------------------------------------------------ */
/* Normalización                                                       */
/* ------------------------------------------------------------------ */

function sinTildes(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * Una señal escrita como sea, llevada a la forma en que se compara.
 *
 * Las arrobas van en minúsculas porque así son los usuarios de Instagram y
 * TikTok; el punto final se quita porque en un texto "@spartachile." el punto
 * es de la oración. Hashtags y campañas van como el resto de la aplicación: en
 * mayúsculas y sin tildes.
 */
export function normalizarSenal(tipo: TipoSenal, crudo: string): string | null {
  if (tipo === "hashtag") return normalizarHashtag(crudo);
  if (tipo === "mencion") {
    const v = sinTildes(crudo).replace(/@/g, "").trim().toLowerCase().replace(/\.+$/, "");
    return v === "" ? null : v;
  }
  const v = sinTildes(crudo).replace(/\s+/g, " ").trim().toUpperCase();
  return v === "" ? null : v;
}

/**
 * La lista de señales de una marca, como texto libre.
 *
 * Llega pegada de un correo, así que se acepta como venga: separada por
 * espacio, coma o salto de línea. Lo que empieza con # es hashtag, lo que
 * empieza con @ es arroba y una línea que empieza con «campaña:» trae
 * campañas de Iconosquare (que pueden tener espacios: "SPARTA GLOBAL"), una o
 * varias separadas por coma. Una palabra sin prefijo se toma como hashtag,
 * igual que en los clientes.
 */
export function parsearSenales(crudo: string | null | undefined): Senal[] {
  const salida: Senal[] = [];
  const vistas = new Set<string>();
  const agregar = (tipo: TipoSenal, valor: string) => {
    const v = normalizarSenal(tipo, valor);
    if (v === null) return;
    const clave = `${tipo}:${v}`;
    if (vistas.has(clave)) return;
    vistas.add(clave);
    salida.push({ tipo, valor: v });
  };

  for (const linea of (crudo ?? "").split(/\r?\n/)) {
    const campana = linea.match(/^\s*campa(?:ñ|n)as?\s*:\s*(.*)$/iu);
    if (campana) {
      for (const c of campana[1].split(/[,;]/)) agregar("campana", c);
      continue;
    }
    for (const trozo of linea.split(/[\s,;]+/)) {
      if (trozo === "") continue;
      if (trozo.startsWith("@")) agregar("mencion", trozo);
      else agregar("hashtag", trozo);
    }
  }
  return salida;
}

/** Cómo se escribe una señal para mostrarla o editarla. */
export function rotularSenal(s: Senal): string {
  if (s.tipo === "hashtag") return `#${s.valor}`;
  if (s.tipo === "mencion") return `@${s.valor}`;
  return `campaña: ${s.valor}`;
}

/** Las señales como texto editable: una por línea, campañas al final. */
export function senalesComoTexto(senales: readonly Senal[]): string {
  const orden: Record<TipoSenal, number> = { hashtag: 0, mencion: 1, campana: 2 };
  return [...senales]
    .sort((a, b) => orden[a.tipo] - orden[b.tipo] || a.valor.localeCompare(b.valor, "es"))
    .map(rotularSenal)
    .join("\n");
}

/* ------------------------------------------------------------------ */
/* Qué señales lleva una publicación                                   */
/* ------------------------------------------------------------------ */

const PATRON_HASHTAG = /#([\p{L}\p{N}_]+)/gu;
// Los usuarios de Instagram y TikTok: letras, números, punto y guion bajo.
const PATRON_ARROBA = /@([\p{L}\p{N}_.]+)/gu;

export interface SenalesPublicacion {
  hashtags: Set<string>;
  menciones: Set<string>;
  campanas: Set<string>;
}

/**
 * Hashtags, arrobas y campañas de una publicación, ya normalizados.
 *
 * La serie del registro también cuenta como hashtag: lo cargado a mano no
 * tiene texto, pero sí su serie.
 */
export function senalesDe(
  texto: string | null,
  campanas: string | null,
  serie: string | null = null,
): SenalesPublicacion {
  const hashtags = new Set<string>();
  const menciones = new Set<string>();
  const camps = new Set<string>();

  const s = normalizarHashtag(serie);
  if (s) hashtags.add(s);

  if (texto) {
    for (const m of texto.matchAll(PATRON_HASHTAG)) {
      const h = normalizarSenal("hashtag", m[1]);
      if (h) hashtags.add(h);
    }
    for (const m of texto.matchAll(PATRON_ARROBA)) {
      const a = normalizarSenal("mencion", m[1]);
      if (a) menciones.add(a);
    }
  }

  for (const c of (campanas ?? "").split(/[,;]/)) {
    const v = normalizarSenal("campana", c);
    if (v) camps.add(v);
  }

  return { hashtags, menciones, campanas: camps };
}

function tiene(s: SenalesPublicacion, senal: Senal): boolean {
  if (senal.tipo === "hashtag") return s.hashtags.has(senal.valor);
  if (senal.tipo === "mencion") return s.menciones.has(senal.valor);
  return s.campanas.has(senal.valor);
}

export interface Reconocida {
  marcaId: string;
  /** Las señales de la marca que aparecieron, para poder explicar por qué cuenta. */
  por: Senal[];
}

/** Las marcas que lleva una publicación, y por qué. Solo las activas. */
export function marcasDe(s: SenalesPublicacion, marcas: readonly Marca[]): Reconocida[] {
  const salida: Reconocida[] = [];
  for (const m of marcas) {
    if (!m.activa) continue;
    const por = m.senales.filter((senal) => tiene(s, senal));
    if (por.length > 0) salida.push({ marcaId: m.id, por });
  }
  return salida;
}

/* ------------------------------------------------------------------ */
/* El conteo                                                           */
/* ------------------------------------------------------------------ */

/** Una publicación del registro, con lo que el global necesita. */
export interface PublicacionMarca {
  id: string;
  /** "YYYY-MM-DD" */
  fecha: string;
  cuentaId: string;
  cuenta: string;
  red: Red;
  /** DLT o rostro: el global los separa. */
  esInfluencer: boolean;
  /** El formato: Reel, Carrusel, Imagen, Video, Short. */
  categoria: string | null;
  titulo: string | null;
  enlace: string | null;
  /** false si solo se tiene el texto recortado: puede faltar una marca. */
  textoCompleto: boolean;
  senales: SenalesPublicacion;
}

/** Los formatos que se pueden elegir al cargar una pieza de marca a mano. */
export const FORMATOS_PIEZA_MANUAL = ["Reel", "Carrusel", "Imagen", "Historia", "Video", "Short", "Otro"] as const;

/**
 * Una pieza de marca cargada a mano: lo que el global no puede reconocer solo
 * (historias, videos sin hashtag, cuentas que no están cargadas).
 */
export interface PiezaManual {
  id: string;
  marcaId: string;
  /** "YYYY-MM-DD" */
  fecha: string;
  cuentaId: string | null;
  cuenta: string | null;
  red: Red | null;
  esInfluencer: boolean;
  formato: string | null;
  descripcion: string;
  enlace: string | null;
  /** «4 historias» es una sola pieza manual con cantidad 4. */
  cantidad: number;
}

export interface PiezaMarca {
  id: string;
  fecha: string;
  cuentaId: string | null;
  cuenta: string | null;
  red: Red | null;
  categoria: string | null;
  titulo: string | null;
  enlace: string | null;
  /** Las señales que la reconocieron. Vacío en las cargadas a mano. */
  por: Senal[];
  /** Cuántas piezas representa: 1, salvo en las manuales. */
  cantidad: number;
  /** El id de la carga manual, para poder borrarla. Null si se reconoció sola. */
  manualId: string | null;
}

export interface ConteoMarca {
  marca: Marca;
  /** Total de piezas: las reconocidas más las cargadas a mano (con su cantidad). */
  n: number;
  /** De ese total, cuántas se cargaron a mano. */
  manuales: number;
  piezas: PiezaMarca[];
  porRed: Partial<Record<Red, number>>;
  porFormato: Record<string, number>;
  porCuenta: { cuentaId: string | null; cuenta: string; red: Red | null; esInfluencer: boolean; n: number }[];
  /** Mismo largo y orden que los períodos pedidos. */
  porPeriodo: number[];
  /** Cuántos de los períodos tuvieron al menos una pieza. */
  periodosConPiezas: number;
  enCuentasDLT: number;
  enRostros: number;
  primera: string | null;
  ultima: string | null;
}

export interface GlobalMarcas {
  periodos: Periodo[];
  granularidad: Granularidad;
  /** Una por marca activa, de la que tiene más piezas a la que tiene menos. */
  marcas: ConteoMarca[];
  /** Publicaciones del rango, para poner el conteo en perspectiva. */
  publicaciones: number;
  /** Piezas con al menos una marca: una pieza con dos marcas cuenta una vez. */
  conMarca: number;
  /** De esas, cuántas se cargaron a mano. */
  manuales: number;
  /** Publicaciones con dos marcas o más. */
  conVariasMarcas: number;
  /** De las piezas con marca, cuántas salieron en cuentas de rostros. */
  conMarcaEnRostros: number;
  /** Piezas con marca por período, sin contar dos veces las de dos marcas. */
  porPeriodo: number[];
  /** Publicaciones de las que solo se tiene el texto recortado. */
  sinTextoCompleto: number;
  /** Cargas manuales que no se suman porque su enlace ya se reconoció solo. */
  manualesRepetidas: number;
}

function indicePeriodo(periodos: readonly Periodo[], fecha: string): number {
  return periodos.findIndex((p) => fecha >= p.desde && fecha <= p.hasta);
}

/**
 * Un enlace comparable: sin parámetros ni barra final. Iconosquare agrega
 * "?utm_campaign=..." a los de TikTok, y la misma publicación no puede contarse
 * dos veces por eso.
 */
export function enlaceComparable(enlace: string | null): string | null {
  if (!enlace) return null;
  const v = enlace.trim().split(/[?#]/)[0].replace(/\/+$/, "").toLowerCase();
  return v === "" ? null : v;
}

function nuevoConteo(m: Marca, periodos: readonly Periodo[]): ConteoMarca {
  return {
    marca: m,
    n: 0,
    manuales: 0,
    piezas: [],
    porRed: {},
    porFormato: {},
    porCuenta: [],
    porPeriodo: periodos.map(() => 0),
    periodosConPiezas: 0,
    enCuentasDLT: 0,
    enRostros: 0,
    primera: null,
    ultima: null,
  };
}

/** Suma una pieza al conteo de su marca. */
function sumar(c: ConteoMarca, pieza: PiezaMarca, esInfluencer: boolean, i: number): void {
  const k = pieza.cantidad;
  c.piezas.push(pieza);
  c.n += k;
  if (pieza.manualId) c.manuales += k;
  if (pieza.red) c.porRed[pieza.red] = (c.porRed[pieza.red] ?? 0) + k;
  const formato = pieza.categoria ?? "Sin formato";
  c.porFormato[formato] = (c.porFormato[formato] ?? 0) + k;
  const enCuenta = c.porCuenta.find((x) => x.cuentaId === pieza.cuentaId);
  if (enCuenta) enCuenta.n += k;
  else
    c.porCuenta.push({
      cuentaId: pieza.cuentaId,
      cuenta: pieza.cuenta ?? "Sin cuenta",
      red: pieza.red,
      esInfluencer,
      n: k,
    });
  if (i >= 0) c.porPeriodo[i] += k;
  if (esInfluencer) c.enRostros += k;
  else c.enCuentasDLT += k;
  if (c.primera === null || pieza.fecha < c.primera) c.primera = pieza.fecha;
  if (c.ultima === null || pieza.fecha > c.ultima) c.ultima = pieza.fecha;
}

/**
 * El global del rango: para cada marca, cuántas piezas, en qué red, con qué
 * formato, en qué cuentas y en qué semana o mes.
 *
 * Las piezas cargadas a mano se suman con su cantidad. Si una trae el enlace de
 * una publicación que la marca ya reconoció sola, no se suma: sería contarla
 * dos veces.
 */
export function globalDeMarcas(
  pubs: readonly PublicacionMarca[],
  marcas: readonly Marca[],
  desde: string,
  hasta: string,
  granularidad: Granularidad,
  manuales: readonly PiezaManual[] = [],
): GlobalMarcas {
  const periodos = periodosDelRango(desde, hasta, granularidad);
  const activas = marcas.filter((m) => m.activa);
  const conteos = new Map<string, ConteoMarca>(activas.map((m) => [m.id, nuevoConteo(m, periodos)]));

  let conMarca = 0;
  let totalManuales = 0;
  let conVariasMarcas = 0;
  let conMarcaEnRostros = 0;
  let sinTextoCompleto = 0;
  let manualesRepetidas = 0;
  const porPeriodo = periodos.map(() => 0);
  // Por marca, los enlaces que ya se reconocieron solos.
  const enlacesReconocidos = new Map<string, Set<string>>();

  const ordenadas = [...pubs].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id.localeCompare(b.id));
  for (const p of ordenadas) {
    if (!p.textoCompleto) sinTextoCompleto += 1;
    const reconocidas = marcasDe(p.senales, activas);
    if (reconocidas.length === 0) continue;

    conMarca += 1;
    if (reconocidas.length > 1) conVariasMarcas += 1;
    if (p.esInfluencer) conMarcaEnRostros += 1;
    const i = indicePeriodo(periodos, p.fecha);
    if (i >= 0) porPeriodo[i] += 1;
    const enlace = enlaceComparable(p.enlace);

    for (const r of reconocidas) {
      sumar(
        conteos.get(r.marcaId)!,
        {
          id: p.id,
          fecha: p.fecha,
          cuentaId: p.cuentaId,
          cuenta: p.cuenta,
          red: p.red,
          categoria: p.categoria,
          titulo: p.titulo,
          enlace: p.enlace,
          por: r.por,
          cantidad: 1,
          manualId: null,
        },
        p.esInfluencer,
        i,
      );
      if (enlace) {
        const set = enlacesReconocidos.get(r.marcaId) ?? new Set<string>();
        set.add(enlace);
        enlacesReconocidos.set(r.marcaId, set);
      }
    }
  }

  for (const m of [...manuales].sort((a, b) => a.fecha.localeCompare(b.fecha))) {
    const c = conteos.get(m.marcaId);
    if (!c || m.fecha < desde || m.fecha > hasta) continue;
    const enlace = enlaceComparable(m.enlace);
    if (enlace && enlacesReconocidos.get(m.marcaId)?.has(enlace)) {
      manualesRepetidas += 1;
      continue;
    }
    const i = indicePeriodo(periodos, m.fecha);
    sumar(
      c,
      {
        id: `manual-${m.id}`,
        fecha: m.fecha,
        cuentaId: m.cuentaId,
        cuenta: m.cuenta,
        red: m.red,
        categoria: m.formato,
        titulo: m.descripcion,
        enlace: m.enlace,
        por: [],
        cantidad: m.cantidad,
        manualId: m.id,
      },
      m.esInfluencer,
      i,
    );
    conMarca += m.cantidad;
    totalManuales += m.cantidad;
    if (m.esInfluencer) conMarcaEnRostros += m.cantidad;
    if (i >= 0) porPeriodo[i] += m.cantidad;
  }

  for (const c of conteos.values()) {
    c.periodosConPiezas = c.porPeriodo.filter((n) => n > 0).length;
    c.porCuenta.sort((a, b) => b.n - a.n || a.cuenta.localeCompare(b.cuenta, "es"));
    c.piezas.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id.localeCompare(b.id));
  }

  return {
    periodos,
    granularidad,
    marcas: [...conteos.values()].sort((a, b) => b.n - a.n || a.marca.nombre.localeCompare(b.marca.nombre, "es")),
    publicaciones: pubs.length,
    conMarca,
    manuales: totalManuales,
    conVariasMarcas,
    conMarcaEnRostros,
    porPeriodo,
    sinTextoCompleto,
    manualesRepetidas,
  };
}

/**
 * Arrobas que aparecen en el rango y no son de ninguna marca ni de una cuenta
 * propia, de la más usada a la menos.
 *
 * Es el contrapeso de las listas exactas: así aparecieron Eucerin y Marco Polo
 * en el conteo a mano de octubre. No todas son marcas —muchas son personas—,
 * pero una marca nueva tiene que poder verse acá antes de que alguien la eche
 * de menos en el conteo.
 */
export function arrobasSinMarca(
  pubs: readonly PublicacionMarca[],
  marcas: readonly Marca[],
  propias: readonly string[],
): { arroba: string; publicaciones: number; ultima: string }[] {
  const conocidas = new Set<string>();
  for (const m of marcas) for (const s of m.senales) if (s.tipo === "mencion") conocidas.add(s.valor);
  for (const u of propias) {
    const v = normalizarSenal("mencion", u);
    if (v) conocidas.add(v);
  }

  const conteo = new Map<string, { n: number; ultima: string }>();
  for (const p of pubs) {
    for (const a of p.senales.menciones) {
      if (conocidas.has(a)) continue;
      const previo = conteo.get(a);
      if (previo) {
        previo.n += 1;
        if (p.fecha > previo.ultima) previo.ultima = p.fecha;
      } else conteo.set(a, { n: 1, ultima: p.fecha });
    }
  }

  return [...conteo.entries()]
    .map(([arroba, { n, ultima }]) => ({ arroba, publicaciones: n, ultima }))
    .sort((a, b) => b.publicaciones - a.publicaciones || a.arroba.localeCompare(b.arroba, "es"));
}
