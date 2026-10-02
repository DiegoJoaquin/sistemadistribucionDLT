/**
 * Rendimiento publicación por publicación.
 *
 * Es la única parte de la plataforma que NO promedia. Todo el resto trabaja con
 * promedios por publicación (§9.1) porque la pregunta es "¿cómo va la cuenta?".
 * Acá la pregunta es otra: "¿qué publicación rindió, y qué tienen en común las
 * que rinden?". Para eso hay que ver las publicaciones una por una, y un
 * promedio las esconde — que es justamente el problema: con estos datos el
 * promedio casi nunca describe a la publicación típica, porque dos virales lo
 * arrastran. Por eso acá aparecen la mediana y los cuartiles.
 *
 * Cuatro gráficos sobre los mismos datos, cada uno para una pregunta distinta:
 *
 *  - **dispersión** — ¿tiene que ver una métrica con otra? Dos ejes elegibles y
 *    el color como tercera variable. Es lo que pidió el área.
 *  - **caja** — ¿qué tipo de post rinde mejor? Compara la DISTRIBUCIÓN de cada
 *    grupo, no su promedio, que es lo que hace falta cuando hay virales.
 *  - **distribución** — ¿cuánto rinde una publicación normal? Dónde se junta la
 *    mayoría, y cuánto se separan la mediana y el promedio.
 *  - **ranking** — ¿cuáles fueron las mejores? Con nombre y enlace.
 *
 * Las reglas de §9 no se relajan por ser gráficos distintos:
 *
 *  - §9.4 — a una publicación a la que le falta el dato NO se le dibuja un
 *    cero: queda fuera y se cuenta. Un punto en el origen se lee como "tuvo
 *    cero likes", que es otra cosa que "la fuente no entrega likes".
 *  - §9.5 — una marca es UNA publicación. Las filas cargadas a mano que
 *    representan varias quedan fuera, porque no hay forma de saber cuántos de
 *    esos likes fueron de cuál.
 *  - §9.6 — el engagement de YouTube se calcula sobre visualizaciones y el del
 *    resto sobre alcance. Si la métrica es engagement y hay publicaciones de
 *    las dos clases, ese eje no mide lo mismo en todas y se avisa.
 */

import { type Categoria, FORMATOS_INSTAGRAM } from "./categorias";
import { GUION, numero, numeroFino, porcentaje } from "./formato";
import { SERIES } from "./paleta";
import { denominadorEngagementRed, type Red } from "./redes";

/* ------------------------------------------------------------------ */
/* Qué gráfico                                                         */
/* ------------------------------------------------------------------ */

export const TIPOS_GRAFICO = [
  "dispersion",
  "telarana",
  "caja",
  "distribucion",
  "ranking",
] as const;
export type TipoGrafico = (typeof TIPOS_GRAFICO)[number];

export const NOMBRE_GRAFICO: Record<TipoGrafico, string> = {
  dispersion: "Dispersión",
  telarana: "Telaraña",
  caja: "Comparar grupos",
  distribucion: "Distribución",
  ranking: "Ranking",
};

/** La pregunta que contesta cada uno, para poder elegir sin adivinar. */
export const PREGUNTA_GRAFICO: Record<TipoGrafico, string> = {
  dispersion: "¿Tiene que ver una métrica con otra?",
  telarana: "¿Cómo le fue a esta publicación contra su línea?",
  caja: "¿Qué tipo de post rinde mejor?",
  distribucion: "¿Cuánto rinde una publicación normal?",
  ranking: "¿Cuáles fueron las mejores?",
};

/**
 * Cuántas métricas elige el usuario en la fila de controles.
 *
 * La dispersión pide dos —una por eje—, el resto una, y la telaraña ninguna:
 * usa varios radios a la vez y los elige aparte.
 */
export function ejesQueUsa(tipo: TipoGrafico): 0 | 1 | 2 {
  if (tipo === "telarana") return 0;
  return tipo === "dispersion" ? 2 : 1;
}

/**
 * Si el color de la marca codifica el grupo, o es decorativo.
 *
 * En la caja los grupos ya están separados en el eje, así que pintarlos de
 * colores distintos codificaría dos veces el mismo dato. En la dispersión y en
 * el ranking el grupo no se ve por ningún otro lado y el color es la única
 * forma de saberlo.
 */
export function usaColorPorGrupo(tipo: TipoGrafico): boolean {
  return tipo === "dispersion" || tipo === "ranking";
}

/**
 * Si el gráfico compara publicaciones elegidas a mano en vez de todo el
 * conjunto. Solo la telaraña: las demás dibujan lo que haya.
 */
export function eligePublicaciones(tipo: TipoGrafico): boolean {
  return tipo === "telarana";
}

export function esTipoGrafico(v: unknown): v is TipoGrafico {
  return typeof v === "string" && (TIPOS_GRAFICO as readonly string[]).includes(v);
}

/* ------------------------------------------------------------------ */
/* Las métricas                                                        */
/* ------------------------------------------------------------------ */

/**
 * Lo que se puede medir de una publicación.
 *
 * El orden es el del selector y agrupa a propósito: primero el desglose de
 * interacciones —que es lo que se pidió—, después los alcances, y al final las
 * dos derivadas.
 */
export const EJES = [
  "me_gusta",
  "comentarios",
  "compartidos",
  "guardados",
  "favoritos",
  "interacciones",
  "visualizaciones",
  "alcance",
  "nuevos_seguidores",
  "engagement",
  "duracion_s",
] as const;

export type Eje = (typeof EJES)[number];

export const NOMBRE_EJE: Record<Eje, string> = {
  me_gusta: "Me gusta",
  comentarios: "Comentarios",
  compartidos: "Compartidos (reposts)",
  guardados: "Guardados",
  favoritos: "Favoritos",
  interacciones: "Interacciones (total)",
  visualizaciones: "Visualizaciones",
  alcance: "Alcance",
  nuevos_seguidores: "Nuevos seguidores",
  engagement: "Engagement",
  duracion_s: "Duración del video",
};

export function esEje(v: unknown): v is Eje {
  return typeof v === "string" && (EJES as readonly string[]).includes(v);
}

/** Cómo se escribe el valor de esta métrica. */
export type FormatoEje = "numero" | "porcentaje" | "segundos";

export function formatoDeEje(eje: Eje): FormatoEje {
  if (eje === "engagement") return "porcentaje";
  if (eje === "duracion_s") return "segundos";
  return "numero";
}

/**
 * El valor de una métrica, escrito.
 *
 * Vive acá y no en los componentes porque el eje, el tooltip y la tabla tienen
 * que escribir el mismo número de la misma forma: si el eje dice "1:23" y la
 * tabla dice "83", parecen dos datos distintos.
 */
export function escribirEnEje(v: number | null, eje: Eje, decimales = 1): string {
  if (v === null) return GUION;
  switch (formatoDeEje(eje)) {
    case "porcentaje":
      return porcentaje(v, decimales);
    case "segundos":
      // Hasta un minuto en segundos, que es como habla el equipo de los reels.
      return v < 60
        ? `${numeroFino(v)} s`
        : `${Math.floor(v / 60)}:${String(Math.round(v % 60)).padStart(2, "0")}`;
    default:
      return v < 100 && !Number.isInteger(v) ? numeroFino(v) : numero(v);
  }
}

/**
 * Qué entrega esta métrica, para poder explicar un eje que sale casi vacío.
 *
 * No es una regla nueva: es lo que ya se sabía de cada exportación (§5.1),
 * escrito donde el selector de métricas lo pueda mostrar.
 */
export const SOLO_EN: Partial<Record<Eje, string>> = {
  guardados: "Instagram y TikTok",
  favoritos: "TikTok",
  alcance: "todas las redes menos YouTube",
  duracion_s: "los formatos de video",
};

/* ------------------------------------------------------------------ */
/* La publicación                                                      */
/* ------------------------------------------------------------------ */

/** Una publicación del registro, con lo que los gráficos necesitan de ella. */
export interface PublicacionPunto {
  id: string;
  fecha: string;
  cuentaId: string;
  cuenta: string;
  red: Red;
  /** El formato: Reel, Imagen, Carrusel, Video, Short, Foto. */
  categoria: Categoria | null;
  /** §3.2 — Reactivo o Normal. */
  tipo: Categoria | null;
  hashtag: string | null;
  titulo: string | null;
  enlace: string | null;
  /** §9.5 — cuántas publicaciones representa la fila. Solo se dibuja si es 1. */
  publicaciones: number;
  alcance: number | null;
  visualizaciones: number | null;
  interacciones: number | null;
  nuevos_seguidores: number | null;
  me_gusta: number | null;
  comentarios: number | null;
  compartidos: number | null;
  guardados: number | null;
  favoritos: number | null;
  duracion_s: number | null;
}

/**
 * El valor de una publicación en una métrica.
 *
 * El engagement se calcula acá y por publicación: interacciones sobre el
 * denominador de SU red (§9.6). No da el mismo número que el engagement del
 * panel, que es una razón de sumas de muchas publicaciones — y no tiene por qué
 * darlo: acá la unidad es la publicación.
 */
export function valorEnEje(p: PublicacionPunto, eje: Eje): number | null {
  if (eje !== "engagement") return p[eje];

  const denominador = p[denominadorEngagementRed(p.red)];
  if (p.interacciones === null || denominador === null || denominador === 0) return null;
  return p.interacciones / denominador;
}

/* ------------------------------------------------------------------ */
/* La tercera variable: cómo se agrupan las publicaciones              */
/* ------------------------------------------------------------------ */

export const AGRUPACIONES = ["tipo_post", "serie", "formato", "tipo", "cuenta", "red"] as const;
export type Agrupacion = (typeof AGRUPACIONES)[number];

export const NOMBRE_AGRUPACION: Record<Agrupacion, string> = {
  tipo_post: "Tipo de post (reel / reactivo / editorial)",
  serie: "Serie (hashtag)",
  formato: "Formato",
  tipo: "Reactivo o Normal",
  cuenta: "Cuenta",
  red: "Red",
};

export function esAgrupacion(v: unknown): v is Agrupacion {
  return typeof v === "string" && (AGRUPACIONES as readonly string[]).includes(v);
}

export const TIPOS_POST = ["Reactivo", "Reel", "Editorial"] as const;
export type TipoPost = (typeof TIPOS_POST)[number];

/** Los formatos que son un video corto vertical, cualquiera sea su nombre. */
const VIDEO_CORTO: readonly Categoria[] = ["Reel", "Short", "Video"];

/**
 * Reel / reactivo / editorial, que es el corte que pidió el área.
 *
 * Los tres no son excluyentes en los datos, y conviene decirlo: "reactivo" es
 * una decisión editorial (§3.2, la columna `tipo`) y "reel" es un formato (la
 * columna `categoria`). Un reel puede ser reactivo, así que hay que elegir a
 * qué grupo va, y acá **manda lo reactivo**: lo que distingue a esa publicación
 * de las demás es que salió a responder algo, no que se haya subido como video
 * vertical. Los gráficos dicen cuántas cayeron en ese cruce, para que la
 * decisión quede a la vista y no escondida en el código.
 *
 * "Editorial" no es una categoría de la base: es el nombre que le da el área al
 * contenido propio planificado, o sea todo lo que no es reactivo ni video
 * corto. Sin formato ni tipo devuelve null, que se dibuja como "sin clasificar"
 * y no como editorial: una publicación sin clasificar no es contenido propio,
 * es una publicación que nadie clasificó.
 */
export function tipoDePost(p: PublicacionPunto): TipoPost | null {
  if (p.tipo === "Reactivo") return "Reactivo";
  if (p.categoria !== null && VIDEO_CORTO.includes(p.categoria)) return "Reel";
  if (p.categoria !== null || p.tipo === "Normal") return "Editorial";
  return null;
}

/** Cuántas publicaciones son reel Y reactivo a la vez, o sea el cruce. */
export function reelesReactivos(puntos: readonly PublicacionPunto[]): number {
  return puntos.filter(
    (p) =>
      p.tipo === "Reactivo" && p.categoria !== null && VIDEO_CORTO.includes(p.categoria),
  ).length;
}

/** A qué grupo va una publicación. null = no se pudo clasificar. */
export function grupoDe(p: PublicacionPunto, agrupacion: Agrupacion): string | null {
  switch (agrupacion) {
    case "tipo_post":
      return tipoDePost(p);
    case "serie":
      return p.hashtag;
    case "formato":
      return p.categoria;
    case "tipo":
      return p.tipo;
    case "cuenta":
      return p.cuenta;
    case "red":
      return p.red;
  }
}

/** La clave de "sin clasificar": no es un grupo más, va siempre en gris. */
export const SIN_CLASIFICAR = "\u0000sin-clasificar";

/**
 * Cómo se llama el cajón de las que no entran en ningún grupo, en cada corte.
 *
 * "Sin clasificar" servía cuando el único corte era reel/reactivo/editorial,
 * pero una publicación sin hashtag no está sin clasificar: no pertenece a
 * ninguna serie, que es otra cosa y se lee distinto en la leyenda.
 */
const SIN_DATO: Record<Agrupacion, string> = {
  tipo_post: "Sin clasificar",
  serie: "Sin hashtag",
  formato: "Sin formato",
  tipo: "Sin tipo",
  cuenta: "Sin cuenta",
  red: "Sin red",
};

/** Cómo se escribe la clave de un grupo. */
export function etiquetaDeGrupo(clave: string, agrupacion: Agrupacion): string {
  return clave === SIN_CLASIFICAR ? SIN_DATO[agrupacion] : clave;
}

/**
 * Cuántos grupos llevan color.
 *
 * Tres, y no los ocho de la paleta. En una línea se sigue un color porque el
 * trazo es continuo; en una nube de puntos superpuestos hay que distinguir
 * colores en discos de siete píxeles medio transparentes, y ahí cuatro
 * categorías ya se confunden. Los grupos que se pasan van en gris y el gráfico
 * los nombra: apagando los otros en la leyenda se puede mirar cualquiera solo.
 */
export const MAXIMO_COLORES = 3;

export interface GrupoRendimiento {
  clave: string;
  etiqueta: string;
  /** Publicaciones del grupo en todo el período, dibujadas o no. */
  n: number;
  /** null = va en gris porque se pasó del tope de colores. */
  color: string | null;
}

/**
 * Los grupos, de más publicaciones a menos, con su color.
 *
 * Se calculan sobre TODAS las publicaciones del período y no sobre las
 * visibles: si el color saliera de lo que está prendido, apagar un grupo en la
 * leyenda repintaría a los demás. Es la misma razón por la que el color de una
 * cuenta no depende de su puesto en el ranking.
 */
export function gruposDe(
  puntos: readonly PublicacionPunto[],
  agrupacion: Agrupacion,
): GrupoRendimiento[] {
  const cuenta = new Map<string, number>();
  for (const p of puntos) {
    const clave = grupoDe(p, agrupacion) ?? SIN_CLASIFICAR;
    cuenta.set(clave, (cuenta.get(clave) ?? 0) + 1);
  }

  const grupos: GrupoRendimiento[] = [...cuenta.entries()]
    .filter(([clave]) => clave !== SIN_CLASIFICAR)
    .sort(([a, na], [b, nb]) => nb - na || a.localeCompare(b, "es"))
    .map(([clave, n], i) => ({
      clave,
      etiqueta: etiquetaDeGrupo(clave, agrupacion),
      n,
      color: i < MAXIMO_COLORES ? SERIES[i] : null,
    }));

  // Las sin clasificar van al final y siempre en gris: no son una categoría.
  const sin = cuenta.get(SIN_CLASIFICAR);
  if (sin) {
    grupos.push({
      clave: SIN_CLASIFICAR,
      etiqueta: etiquetaDeGrupo(SIN_CLASIFICAR, agrupacion),
      n: sin,
      color: null,
    });
  }

  return grupos;
}

/* ------------------------------------------------------------------ */
/* Las escalas                                                         */
/* ------------------------------------------------------------------ */

export interface Escala {
  log: boolean;
  min: number;
  max: number;
  /** Los valores donde va una marca del eje. */
  marcas: number[];
  /** Dónde cae un valor, de 0 (el mínimo) a 1 (el máximo). */
  posicion: (v: number) => number;
}

/*
 * Los números "redondos": 1, 2 y 5 por una potencia de diez. Es la escalera que
 * usa cualquier eje que se lee de un vistazo, porque 20.000 y 50.000 se
 * comparan de memoria y 37.500 no.
 */
const MANTISAS = [1, 2, 5] as const;
// Tolerancia para que 0.1 * 3 no se caiga del lado equivocado de una marca.
const PELO = 1 + 1e-9;

/** El número redondo inmediatamente por debajo de `v` (o el mismo). */
function redondoAbajo(v: number): number {
  const orden = 10 ** Math.floor(Math.log10(v));
  for (const m of [...MANTISAS].reverse()) {
    if (m * orden <= v * PELO) return m * orden;
  }
  return orden;
}

/** El número redondo inmediatamente por encima de `v` (o el mismo). */
function redondoArriba(v: number): number {
  const orden = 10 ** Math.floor(Math.log10(v));
  for (const m of MANTISAS) {
    if (m * orden * PELO >= v) return m * orden;
  }
  return 10 * orden;
}

/**
 * Entre cuántas marcas se parte un eje lineal.
 *
 * El paso se elige primero y el tope sale de él, no al revés. Partir el máximo
 * en cuatro daba topes correctos con marcas ilegibles: un eje que llega a 2.500
 * quedaba rotulado 625 · 1.250 · 1.875, tres números que nadie compara de
 * memoria. Eligiendo el paso redondo primero, ese mismo eje sale 500 · 1.000 ·
 * 1.500 · 2.000 · 2.500.
 */
const MARCAS_OBJETIVO = 8;

/**
 * La escala de un eje.
 *
 * La lineal **arranca en cero**: son cantidades, y el cero es donde de verdad
 * empieza "no tuvo ninguno". Cortar el eje más arriba pondría a dos
 * publicaciones parecidas en extremos opuestos del panel.
 *
 * La logarítmica existe porque estos datos la piden: una publicación viral con
 * cincuenta veces las visualizaciones de la mediana aplasta a las otras
 * trescientas contra la esquina, y ahí no se ve nada. El precio es que el cero
 * no cabe en un eje logarítmico, así que las publicaciones con cero quedan
 * fuera — y justamente por eso se cuentan aparte y se dicen.
 *
 * Los dos extremos se ajustan al dato y no a la década: redondear el máximo a
 * la potencia de diez de arriba dejaba una década entera vacía —la cuarta parte
 * del panel— cada vez que el dato más grande caía apenas pasada la anterior.
 */
export function escalaDe(valores: readonly number[], log: boolean): Escala {
  if (!log) {
    const tope = valores.length > 0 ? Math.max(...valores, 0) : 1;
    if (tope <= 0) {
      return { log: false, min: 0, max: 1, marcas: [0, 1], posicion: () => 0 };
    }

    const paso = redondoArriba(tope / MARCAS_OBJETIVO);
    const max = Math.ceil((tope / paso) * (1 - 1e-9)) * paso;

    const marcas: number[] = [];
    for (let i = 0; i * paso <= max * PELO; i++) marcas.push(i * paso);

    return {
      log: false,
      min: 0,
      max,
      marcas,
      posicion: (v) => Math.min(1, Math.max(0, v / max)),
    };
  }

  const positivos = valores.filter((v) => v > 0);
  const min = redondoAbajo(positivos.length > 0 ? Math.min(...positivos) : 1);
  const crudo = positivos.length > 0 ? Math.max(...positivos) : 10;
  // Con un solo valor, o con todos iguales, el eje tendría ancho cero.
  const max = crudo <= min ? min * 10 : redondoArriba(crudo);

  // Una marca en cada número redondo del recorrido: 20, 50, 100, 200, 500…
  const marcas: number[] = [];
  const primera = Math.floor(Math.log10(min));
  const ultima = Math.ceil(Math.log10(max));
  for (let k = primera; k <= ultima; k++) {
    for (const m of MANTISAS) {
      const v = m * 10 ** k;
      if (v * PELO >= min && v <= max * PELO) marcas.push(v);
    }
  }

  const abajo = Math.log10(min);
  const arriba = Math.log10(max);
  return {
    log: true,
    min,
    max,
    marcas,
    posicion: (v) =>
      v <= 0 ? 0 : Math.min(1, Math.max(0, (Math.log10(v) - abajo) / (arriba - abajo))),
  };
}

/* ------------------------------------------------------------------ */
/* Estadística de una tanda de valores                                 */
/* ------------------------------------------------------------------ */

/**
 * El cuantil `p` de una lista YA ORDENADA, interpolando.
 *
 * Es el método más común (el "tipo 7" de R, el que usan las planillas), para
 * que un cuartil calculado acá dé lo mismo que si alguien lo comprueba en
 * Excel — que es exactamente lo que va a pasar la primera vez.
 */
export function cuantil(ordenados: readonly number[], p: number): number {
  if (ordenados.length === 0) return NaN;
  if (ordenados.length === 1) return ordenados[0];
  const pos = (ordenados.length - 1) * p;
  const abajo = Math.floor(pos);
  const resto = pos - abajo;
  if (abajo + 1 >= ordenados.length) return ordenados[abajo];
  return ordenados[abajo] + resto * (ordenados[abajo + 1] - ordenados[abajo]);
}

/** La mediana, para la línea de referencia. null si no hay valores. */
export function mediana(valores: readonly number[]): number | null {
  if (valores.length === 0) return null;
  return cuantil([...valores].sort((a, b) => a - b), 0.5);
}

/** El promedio. Va al lado de la mediana justamente para compararlos. */
export function promedio(valores: readonly number[]): number | null {
  if (valores.length === 0) return null;
  return valores.reduce((a, b) => a + b, 0) / valores.length;
}

/* ------------------------------------------------------------------ */
/* La base común de los cuatro gráficos                                */
/* ------------------------------------------------------------------ */

export interface PuntoDibujado {
  punto: PublicacionPunto;
  /** El valor en la primera métrica. */
  x: number;
  /** El valor en la segunda. En los gráficos de una sola métrica, igual a x. */
  y: number;
  grupo: string;
  color: string | null;
}

/**
 * Lo que quedó fuera del gráfico, por separado y sumable.
 *
 * Las cuatro categorías son excluyentes y en ese orden, así que
 * `agrupadas + sinX + sinY + noPositivas + las seleccionadas (con los grupos
 * apagados incluidos)` es el total de publicaciones del período. Se muestran
 * porque un gráfico que dibuja 40 de 300 publicaciones sin decirlo es una
 * conclusión sacada de la séptima parte de los datos, y acá pasa de verdad:
 * ninguna exportación trae todas las columnas.
 */
export interface Excluidas {
  /** §9.5 — la fila representa varias publicaciones: no es una publicación. */
  agrupadas: number;
  /** Falta el dato de la primera métrica. */
  sinX: number;
  /** Tiene la primera pero le falta la segunda. */
  sinY: number;
  /** Tiene las dos, pero un cero no entra en una escala logarítmica. */
  noPositivas: number;
}

/** Lo que comparten los cuatro gráficos, calculado una sola vez. */
export interface Base {
  agrupacion: Agrupacion;
  puntos: PuntoDibujado[];
  grupos: GrupoRendimiento[];
  excluidas: Excluidas;
  /** Publicaciones del período, dibujadas o no. */
  total: number;
  /** Cuántas se dejaron fuera por el tope de marcas. */
  recortados: number;
  /**
   * §9.6 — la métrica es engagement y hay publicaciones de redes que lo
   * calculan con denominadores distintos, así que no mide lo mismo en todas.
   */
  mezclaDenominadores: boolean;
  /** Cuántas publicaciones son reel y reactivo a la vez (solo en tipo_post). */
  cruceReelReactivo: number;
}

export interface OpcionesBase {
  agrupacion: Agrupacion;
  /** Grupos apagados en la leyenda. */
  ocultos?: ReadonlySet<string>;
}

/**
 * Tope de marcas dibujadas.
 *
 * Nueve meses de todas las cuentas son unas 3.000 publicaciones, y esa cantidad
 * de círculos SVG se dibuja sin problemas. El tope existe para que un rango
 * absurdo no cuelgue el navegador; cuando se alcanza, el gráfico lo dice.
 */
export const MAXIMO_PUNTOS = 6_000;

/**
 * Selecciona las publicaciones que se pueden dibujar y cuenta las que no.
 *
 * `ejes` lleva una métrica o dos según el gráfico, y `logs` va alineado con
 * ella. Todo el filtrado vive acá para que los cuatro gráficos excluyan
 * exactamente por los mismos motivos: si cada uno lo resolviera por su cuenta,
 * cambiar de gráfico movería el total sin que nada más cambiara.
 */
export function baseDe(
  puntos: readonly PublicacionPunto[],
  ejes: readonly [Eje] | readonly [Eje, Eje],
  logs: readonly boolean[],
  { agrupacion, ocultos }: OpcionesBase,
): Base {
  const grupos = gruposDe(puntos, agrupacion);
  const colorPorGrupo = new Map(grupos.map((g) => [g.clave, g.color]));

  const [ejeX, ejeY] = [ejes[0], ejes[1] ?? ejes[0]];
  const [logX, logY] = [logs[0] ?? false, logs[1] ?? logs[0] ?? false];
  const dosEjes = ejes.length === 2;

  const seleccionados: PuntoDibujado[] = [];
  const excluidas: Excluidas = { agrupadas: 0, sinX: 0, sinY: 0, noPositivas: 0 };

  for (const p of puntos) {
    /*
     * §9.5 — una marca es una publicación. Una fila cargada a mano que
     * representa tres no cabe en una marca: no hay forma de saber cuántos de
     * esos likes fueron de cuál, y dibujarla como una sola publicación con los
     * valores de las tres la haría parecer un éxito.
     */
    if (p.publicaciones !== 1) {
      excluidas.agrupadas += 1;
      continue;
    }

    const x = valorEnEje(p, ejeX);
    if (x === null) {
      excluidas.sinX += 1;
      continue;
    }
    const y = dosEjes ? valorEnEje(p, ejeY) : x;
    if (y === null) {
      excluidas.sinY += 1;
      continue;
    }
    if ((logX && x <= 0) || (dosEjes && logY && y <= 0)) {
      excluidas.noPositivas += 1;
      continue;
    }

    /*
     * El filtro de la leyenda va DESPUÉS de contar lo excluido: apagar un grupo
     * es mirar menos, no descubrir que faltaban datos.
     */
    const grupo = grupoDe(p, agrupacion) ?? SIN_CLASIFICAR;
    if (ocultos?.has(grupo)) continue;

    seleccionados.push({ punto: p, x, y, grupo, color: colorPorGrupo.get(grupo) ?? null });
  }

  const visibles = seleccionados.slice(0, MAXIMO_PUNTOS);
  const denominadores = new Set(visibles.map((d) => denominadorEngagementRed(d.punto.red)));

  return {
    agrupacion,
    puntos: visibles,
    grupos,
    excluidas,
    total: puntos.length,
    recortados: seleccionados.length - visibles.length,
    mezclaDenominadores:
      (ejeX === "engagement" || (dosEjes && ejeY === "engagement")) &&
      denominadores.size > 1,
    cruceReelReactivo: agrupacion === "tipo_post" ? reelesReactivos(puntos) : 0,
  };
}

/* ------------------------------------------------------------------ */
/* Dispersión                                                          */
/* ------------------------------------------------------------------ */

export interface Dispersion extends Base {
  ejeX: Eje;
  ejeY: Eje;
  escalaX: Escala;
  escalaY: Escala;
  medianaX: number | null;
  medianaY: number | null;
}

export interface OpcionesDispersion extends OpcionesBase {
  ejeX: Eje;
  ejeY: Eje;
  logX?: boolean;
  logY?: boolean;
}

/**
 * Una publicación, un punto.
 *
 * Las medianas de los dos ejes van como referencia: parten el panel en cuatro
 * cuadrantes y "arriba a la derecha" pasa a ser una respuesta y no una
 * impresión.
 */
export function construirDispersion(
  puntos: readonly PublicacionPunto[],
  opciones: OpcionesDispersion,
): Dispersion {
  const { ejeX, ejeY, logX = false, logY = false } = opciones;
  const base = baseDe(puntos, [ejeX, ejeY], [logX, logY], opciones);

  const xs = base.puntos.map((d) => d.x);
  const ys = base.puntos.map((d) => d.y);

  return {
    ...base,
    ejeX,
    ejeY,
    escalaX: escalaDe(xs, logX),
    escalaY: escalaDe(ys, logY),
    medianaX: mediana(xs),
    medianaY: mediana(ys),
  };
}

/* ------------------------------------------------------------------ */
/* Caja: comparar la distribución de cada grupo                        */
/* ------------------------------------------------------------------ */

/**
 * Debajo de esto, una caja miente.
 *
 * Con cuatro publicaciones los cuartiles no describen nada: cada una mueve la
 * caja entera. Esos grupos se dibujan como puntos sueltos y se rotulan, en vez
 * de fingir una distribución que no existe.
 */
export const MINIMO_CAJA = 5;

export interface Caja {
  clave: string;
  etiqueta: string;
  color: string | null;
  /** Publicaciones con el dato de esta métrica. */
  n: number;
  q1: number;
  mediana: number;
  q3: number;
  /** Extremos de los bigotes: el dato real más lejano dentro de 1,5 × RIC. */
  bigoteBajo: number;
  bigoteAlto: number;
  /** Las que caen fuera de los bigotes. Son las virales: se dibujan una a una. */
  atipicos: PuntoDibujado[];
  /** true si el grupo tiene menos de `MINIMO_CAJA` y la caja no significa nada. */
  pocas: boolean;
  /** Todos sus valores, para dibujar el grupo con pocas como puntos sueltos. */
  valores: number[];
}

export interface Cajas extends Base {
  metrica: Eje;
  cajas: Caja[];
  escala: Escala;
}

export interface OpcionesCaja extends OpcionesBase {
  metrica: Eje;
  log?: boolean;
}

/**
 * Una caja por grupo: mediana, cuartiles y bigotes.
 *
 * Es el gráfico que contesta "¿qué tipo de post rinde mejor?" sin mentir. Una
 * barra con el promedio de cada grupo también lo contestaría, pero el promedio
 * de estos datos está arrastrado por los virales: un grupo con nueve
 * publicaciones flojas y una que explotó sale con el mismo promedio que un
 * grupo de diez publicaciones buenas, y no son lo mismo. La caja muestra dónde
 * cae la MITAD del medio, y los virales aparecen como los puntos sueltos que
 * son.
 *
 * Ordenadas por mediana, de mayor a menor: la pregunta es cuál rinde mejor.
 */
export function construirCajas(
  puntos: readonly PublicacionPunto[],
  opciones: OpcionesCaja,
): Cajas {
  const { metrica, log = false } = opciones;
  const base = baseDe(puntos, [metrica], [log], opciones);

  const porGrupo = new Map<string, PuntoDibujado[]>();
  for (const d of base.puntos) {
    const lista = porGrupo.get(d.grupo);
    if (lista) lista.push(d);
    else porGrupo.set(d.grupo, [d]);
  }

  const cajas: Caja[] = [];
  for (const g of base.grupos) {
    const suyos = porGrupo.get(g.clave);
    // Un grupo sin ninguna publicación con el dato no es una caja vacía: no va.
    if (!suyos || suyos.length === 0) continue;

    const valores = suyos.map((d) => d.x).sort((a, b) => a - b);
    const q1 = cuantil(valores, 0.25);
    const q2 = cuantil(valores, 0.5);
    const q3 = cuantil(valores, 0.75);
    const ric = q3 - q1;

    /*
     * Bigotes a 1,5 × el rango intercuartil, que es la convención de Tukey, y
     * llevados hasta el dato REAL más lejano dentro de ese límite. Terminar el
     * bigote en el límite calculado dibujaría un valor que ninguna publicación
     * tuvo.
     */
    const limiteBajo = q1 - 1.5 * ric;
    const limiteAlto = q3 + 1.5 * ric;
    const dentro = valores.filter((v) => v >= limiteBajo && v <= limiteAlto);

    cajas.push({
      clave: g.clave,
      etiqueta: g.etiqueta,
      color: g.color,
      n: valores.length,
      q1,
      mediana: q2,
      q3,
      bigoteBajo: dentro.length > 0 ? dentro[0] : valores[0],
      bigoteAlto: dentro.length > 0 ? dentro[dentro.length - 1] : valores[valores.length - 1],
      atipicos: suyos.filter((d) => d.x < limiteBajo || d.x > limiteAlto),
      pocas: valores.length < MINIMO_CAJA,
      valores,
    });
  }

  cajas.sort((a, b) => b.mediana - a.mediana);

  return {
    ...base,
    metrica,
    cajas,
    escala: escalaDe(
      base.puntos.map((d) => d.x),
      log,
    ),
  };
}

/* ------------------------------------------------------------------ */
/* Distribución: cómo rinde una publicación normal                     */
/* ------------------------------------------------------------------ */

export interface BarraDistribucion {
  desde: number;
  hasta: number;
  n: number;
}

export interface Distribucion extends Base {
  metrica: Eje;
  barras: BarraDistribucion[];
  escala: Escala;
  /** El `n` más alto: la altura de la barra más alta. */
  pico: number;
  mediana: number | null;
  promedio: number | null;
  /** Cuántas publicaciones entraron al histograma. */
  n: number;
}

export interface OpcionesDistribucion extends OpcionesBase {
  metrica: Eje;
  log?: boolean;
}

/** Cuántas columnas tiene el histograma, según cuántos datos haya. */
function cuantasColumnas(n: number): number {
  return Math.min(20, Math.max(6, Math.ceil(Math.sqrt(n))));
}

/**
 * El histograma de una métrica.
 *
 * Contesta "¿cuánto rinde una publicación normal?", que es la pregunta que hoy
 * se responde con el promedio del panel — y con estos datos el promedio casi
 * nunca es la publicación normal. Por eso se muestran la mediana y el promedio
 * juntos: cuando están lejos, esa distancia ES el dato, y dice que el promedio
 * lo están empujando dos o tres virales.
 *
 * Un solo color: son una sola serie. El corte por grupo se hace apagando los
 * demás en la leyenda, que es más legible que tres histogramas encimados.
 */
export function construirDistribucion(
  puntos: readonly PublicacionPunto[],
  opciones: OpcionesDistribucion,
): Distribucion {
  const { metrica, log = false } = opciones;
  const base = baseDe(puntos, [metrica], [log], opciones);

  const valores = base.puntos.map((d) => d.x);
  const escala = escalaDe(valores, log);

  const columnas = cuantasColumnas(valores.length);
  const barras: BarraDistribucion[] = [];

  if (valores.length > 0) {
    /*
     * En escala logarítmica las columnas son iguales EN LOGARITMOS, no en
     * unidades: si no, la primera columna se comería casi todas las
     * publicaciones y las demás saldrían vacías, que es el mismo problema que
     * la escala logarítmica viene a resolver.
     */
    const a = log ? Math.log10(escala.min) : escala.min;
    const b = log ? Math.log10(escala.max) : escala.max;
    const paso = (b - a) / columnas;
    const borde = (i: number) => (log ? 10 ** (a + i * paso) : a + i * paso);

    for (let i = 0; i < columnas; i++) {
      const primera = i === 0;
      const ultima = i === columnas - 1;
      /*
       * Los bordes de las puntas se fijan a los extremos de la escala en vez de
       * calcularse. En logaritmos, `10 ** log10(x)` no siempre devuelve x
       * exactamente, y ese pelo de diferencia dejaba la publicación más grande
       * del período justo afuera de la última columna: el histograma perdía un
       * dato sin avisar.
       */
      const desde = primera ? escala.min : borde(i);
      const hasta = ultima ? escala.max : borde(i + 1);

      barras.push({
        desde,
        hasta,
        // La última columna incluye su borde derecho: si no, el valor máximo
        // quedaría fuera del histograma que lo tiene que contener.
        n: valores.filter((v) => v >= desde && (ultima ? v <= hasta : v < hasta)).length,
      });
    }
  }

  return {
    ...base,
    metrica,
    barras,
    escala,
    pico: Math.max(...barras.map((b) => b.n), 0),
    mediana: mediana(valores),
    promedio: promedio(valores),
    n: valores.length,
  };
}

/* ------------------------------------------------------------------ */
/* Ranking: las mejores, con nombre                                    */
/* ------------------------------------------------------------------ */

export interface Ranking extends Base {
  metrica: Eje;
  /** Las mejores, de mayor a menor. */
  mejores: PuntoDibujado[];
  escala: Escala;
  mediana: number | null;
}

export interface OpcionesRanking extends OpcionesBase {
  metrica: Eje;
  cuantas?: number;
}

export const CUANTAS_EN_RANKING = 20;

/**
 * Las publicaciones que más rindieron, con su nombre y su enlace.
 *
 * La línea de la mediana va también acá y no es decorativa: sin ella, veinte
 * barras ordenadas de mayor a menor siempre parecen un buen período. Con ella
 * se ve de un vistazo cuánto se despegan las mejores del resto.
 *
 * La escala se calcula sobre TODAS las publicaciones y no solo sobre las
 * veinte: si saliera del máximo de las mostradas, la vigésima barra ocuparía
 * media pantalla y parecería que rindió bien.
 */
export function construirRanking(
  puntos: readonly PublicacionPunto[],
  opciones: OpcionesRanking,
): Ranking {
  const { metrica, cuantas = CUANTAS_EN_RANKING } = opciones;
  // Siempre lineal: una barra es una longitud, y una longitud en escala
  // logarítmica no se puede comparar mirándola.
  const base = baseDe(puntos, [metrica], [false], opciones);

  const ordenados = [...base.puntos].sort((a, b) => b.x - a.x);

  return {
    ...base,
    metrica,
    mejores: ordenados.slice(0, cuantas),
    escala: escalaDe(
      base.puntos.map((d) => d.x),
      false,
    ),
    mediana: mediana(base.puntos.map((d) => d.x)),
  };
}

/* ------------------------------------------------------------------ */
/* Telaraña: una publicación contra su línea                           */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* Elegir una publicación entre miles                                  */
/* ------------------------------------------------------------------ */

/**
 * Texto comparable para buscar.
 *
 * Sin tildes y sin mayúsculas por la misma razón que los hashtags se
 * normalizan: quien busca "quecambio" tiene que encontrar #QUÉCAMBIÓ, y quien
 * escribe "Sparta" tiene que encontrar SPARTA. El numeral se quita porque el
 * hashtag se guarda sin él, así que buscar "#sparta" tiene que funcionar igual.
 */
export function paraBuscar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/#/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Si una publicación calza con lo que se escribió en el buscador.
 *
 * Busca en el título, en el hashtag y en el nombre de la cuenta, porque son las
 * tres formas en que alguien se acuerda de una publicación. Todas las palabras
 * de la consulta tienen que aparecer en alguna parte —no la frase entera— así
 * que "sparta reel" encuentra la que tiene las dos cosas sin importar el orden.
 */
export function coincideBusqueda(p: PublicacionPunto, consulta: string): boolean {
  const palabras = paraBuscar(consulta).split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return true;

  const heno = paraBuscar(
    [p.titulo ?? "", p.hashtag ?? "", p.cuenta, p.fecha].join(" "),
  );
  return palabras.every((palabra) => heno.includes(palabra));
}

export interface SerieDisponible {
  /** La clave para filtrar: el hashtag, o `SIN_CLASIFICAR` si no tiene. */
  clave: string;
  etiqueta: string;
  /** Publicaciones de esa serie en el período. */
  n: number;
}

/**
 * Las series que hay en el período, de más publicaciones a menos.
 *
 * Es lo que hace falta para poder elegir: sin la lista, encontrar una serie
 * entre miles de publicaciones es adivinar cómo se escribió el hashtag.
 */
export function seriesDisponibles(
  puntos: readonly PublicacionPunto[],
): SerieDisponible[] {
  const cuenta = new Map<string, number>();
  for (const p of puntos) {
    if (p.publicaciones !== 1) continue;
    const clave = p.hashtag ?? SIN_CLASIFICAR;
    cuenta.set(clave, (cuenta.get(clave) ?? 0) + 1);
  }

  const series = [...cuenta.entries()]
    .filter(([clave]) => clave !== SIN_CLASIFICAR)
    .sort(([a, na], [b, nb]) => nb - na || a.localeCompare(b, "es"))
    .map(([clave, n]) => ({ clave, etiqueta: clave, n }));

  // Las sin hashtag al final: son el resto, no una serie.
  const sin = cuenta.get(SIN_CLASIFICAR);
  if (sin) {
    series.push({
      clave: SIN_CLASIFICAR,
      etiqueta: etiquetaDeGrupo(SIN_CLASIFICAR, "serie"),
      n: sin,
    });
  }

  return series;
}

export interface FiltroCandidatas {
  /** Por cuál métrica se ordena la lista. */
  metrica: Eje;
  /** Texto del buscador. Vacío = no filtra. */
  consulta?: string;
  /** Series elegidas. Vacío = todas. */
  series?: ReadonlySet<string>;
}

/**
 * Las publicaciones entre las que se puede elegir, filtradas y ordenadas.
 *
 * Las que no traen la métrica de orden NO se dejan fuera: se van al final. Que
 * una publicación no tenga me gusta no es razón para que no se pueda comparar
 * por sus comentarios, y sacarla de la lista la volvía imposible de encontrar.
 */
export function candidatas(
  puntos: readonly PublicacionPunto[],
  { metrica, consulta = "", series }: FiltroCandidatas,
): PublicacionPunto[] {
  const filtrar = series !== undefined && series.size > 0;

  return puntos
    // §9.5 — una fila que representa varias publicaciones no es una.
    .filter((p) => p.publicaciones === 1)
    .filter((p) => !filtrar || series.has(p.hashtag ?? SIN_CLASIFICAR))
    .filter((p) => coincideBusqueda(p, consulta))
    .map((p) => ({ p, v: valorEnEje(p, metrica) }))
    .sort(
      (a, b) =>
        // Las que no traen la métrica van al fondo, no al principio.
        (b.v ?? -Infinity) - (a.v ?? -Infinity) ||
        b.p.fecha.localeCompare(a.p.fecha),
    )
    .map((x) => x.p);
}

/**
 * Contra qué se compara una publicación.
 *
 * Son las tres líneas que pidió el área, de la más cercana a la más lejana:
 * cómo le fue respecto a las otras publicaciones de SU serie, respecto a las de
 * SU cuenta, y respecto a todo lo publicado en el período. Es la misma idea que
 * el catastro semanal —cada hashtag contra su línea base y contra el total de
 * la cuenta— bajada al nivel de una publicación suelta.
 */
export const NIVELES = ["serie", "cuenta", "global"] as const;
export type Nivel = (typeof NIVELES)[number];

export const NOMBRE_NIVEL: Record<Nivel, string> = {
  serie: "Su serie (hashtag)",
  cuenta: "Su cuenta",
  global: "Todo el período",
};

export const EXPLICACION_NIVEL: Record<Nivel, string> = {
  serie: "Contra el promedio de las demás publicaciones con el mismo hashtag.",
  cuenta: "Contra el promedio de todo lo que publicó esa misma cuenta.",
  global: "Contra el promedio de todas las cuentas juntas en el período.",
};

export function esNivel(v: unknown): v is Nivel {
  return typeof v === "string" && (NIVELES as readonly string[]).includes(v);
}

/**
 * Las métricas que se ofrecen como radios.
 *
 * No están todas: `duracion_s` no es un resultado sino una característica de la
 * publicación —un reel más largo no rindió más— y mezclarla con las demás haría
 * que la figura creciera por algo que no es rendimiento.
 */
export const EJES_TELARANA: readonly Eje[] = [
  "visualizaciones",
  "alcance",
  "me_gusta",
  "comentarios",
  "compartidos",
  "guardados",
  "favoritos",
  "nuevos_seguidores",
  "engagement",
];

/** Los radios que trae una telaraña recién abierta. */
export const EJES_TELARANA_POR_DEFECTO: readonly Eje[] = [
  "visualizaciones",
  "alcance",
  "me_gusta",
  "comentarios",
  "compartidos",
  "engagement",
];

/** Menos de tres radios no es una figura, es una línea. */
export const MINIMO_RADIOS = 3;

/** Cuántas publicaciones se pueden superponer sin que la figura se ensucie. */
export const MAXIMO_POLIGONOS = 3;

/**
 * Agrega o quita una publicación de la comparación.
 *
 * El orden importa y se conserva: el color de cada figura sale de su puesto en
 * la lista, así que quitar la primera no tiene que repintar a las otras dos.
 *
 * El caso raro es el primer clic. Al abrir la telaraña viene dibujada la mejor
 * publicación del período sin que nadie la haya elegido —`implicita`—, y si al
 * agregar una segunda se armara la lista solo con ella, la primera
 * desaparecería del gráfico justo cuando el usuario quiso comparar dos. Así
 * que ese primer clic las pone a las dos.
 */
export function alternarElegida(
  previas: readonly string[],
  id: string,
  implicita?: string,
): string[] {
  if (previas.includes(id)) return previas.filter((x) => x !== id);
  if (previas.length === 0 && implicita !== undefined && implicita !== id) {
    return [implicita, id];
  }
  return previas.length >= MAXIMO_POLIGONOS ? [...previas] : [...previas, id];
}

/**
 * El promedio de una métrica en un conjunto de publicaciones.
 *
 * §9.1 — promedio POR PUBLICACIÓN, igual que en todo el resto de la plataforma:
 * las que no traen la métrica quedan fuera del numerador Y del denominador, así
 * que no diluyen el promedio inventando ceros (§9.4).
 *
 * El engagement va por otro camino porque es una razón de sumas y no un
 * promedio de razones, y su denominador depende de la red (§9.6): si el
 * conjunto mezcla YouTube con el resto, no hay un engagement que signifique lo
 * mismo para todos y devuelve null en vez de un número que parece comparable.
 */
export function promedioDeNivel(
  puntos: readonly PublicacionPunto[],
  eje: Eje,
): number | null {
  if (eje === "engagement") {
    const denominadores = new Set(puntos.map((p) => denominadorEngagementRed(p.red)));
    if (denominadores.size > 1) return null;

    let interacciones = 0;
    let denominador = 0;
    let hubo = false;
    for (const p of puntos) {
      const d = p[denominadorEngagementRed(p.red)];
      if (p.interacciones === null || d === null) continue;
      interacciones += p.interacciones;
      denominador += d;
      hubo = true;
    }
    return !hubo || denominador === 0 ? null : interacciones / denominador;
  }

  let suma = 0;
  let cuantas = 0;
  for (const p of puntos) {
    const v = p[eje];
    if (v === null) continue;
    suma += v;
    cuantas += 1;
  }
  return cuantas === 0 ? null : suma / cuantas;
}

export interface Referencia {
  nivel: Nivel;
  /** "#SPARTA", "Instagram DLT", "Todo el período". */
  etiqueta: string;
  /** Sobre cuántas publicaciones se calculó. */
  n: number;
  valores: Partial<Record<Eje, number | null>>;
  /**
   * §9.6 — la línea del engagement se calculó solo con las publicaciones de la
   * misma red, porque el resto lo mide con otro denominador.
   */
  engagementAcotado: boolean;
  /** Sobre cuántas publicaciones salió esa línea acotada. */
  nEngagement: number;
}

/**
 * Las publicaciones que forman la línea de comparación de una publicación.
 *
 * Se calculan sobre TODO el período y no sobre lo que quedó visible en la
 * leyenda: si apagar un grupo moviera la línea, el mismo post daría 120% o 90%
 * según lo que estuviera prendido, y ese número dejaría de significar algo.
 */
function puntosDelNivel(
  todos: readonly PublicacionPunto[],
  p: PublicacionPunto,
  nivel: Nivel,
): readonly PublicacionPunto[] {
  // §9.5 — una fila que representa varias publicaciones no promedia igual.
  const base = todos.filter((x) => x.publicaciones === 1);
  switch (nivel) {
    case "serie":
      return p.hashtag === null ? [] : base.filter((x) => x.hashtag === p.hashtag);
    case "cuenta":
      return base.filter((x) => x.cuentaId === p.cuentaId);
    case "global":
      return base;
  }
}

function referenciaDe(
  todos: readonly PublicacionPunto[],
  p: PublicacionPunto,
  nivel: Nivel,
  ejes: readonly Eje[],
): Referencia {
  const suyas = puntosDelNivel(todos, p, nivel);

  /*
   * §9.6 — la línea del engagement se calcula SOLO con las publicaciones que lo
   * miden con el mismo denominador que ésta.
   *
   * Una serie no vive en una sola red: el mismo hashtag sale en Instagram, en
   * TikTok y en YouTube, y YouTube calcula el engagement sobre visualizaciones
   * porque no entrega alcance. Promediar las tres daría un número sin
   * significado, así que la alternativa era dejar el radio de engagement fuera
   * casi siempre — justo el radio que más se mira. Acotarlo a su red contesta
   * la pregunta que de verdad se hace («¿le fue mejor que a los otros reels de
   * esta serie en Instagram?») y se rotula, para que no parezca que compara
   * contra toda la serie.
   */
  const mismoDenominador = suyas.filter(
    (x) => denominadorEngagementRed(x.red) === denominadorEngagementRed(p.red),
  );

  const valores: Partial<Record<Eje, number | null>> = {};
  for (const eje of ejes) {
    valores[eje] = promedioDeNivel(eje === "engagement" ? mismoDenominador : suyas, eje);
  }

  return {
    nivel,
    etiqueta:
      nivel === "serie"
        ? (p.hashtag ?? "sin hashtag")
        : nivel === "cuenta"
          ? p.cuenta
          : NOMBRE_NIVEL.global,
    n: suyas.length,
    valores,
    engagementAcotado:
      ejes.includes("engagement") && mismoDenominador.length < suyas.length,
    nEngagement: mismoDenominador.length,
  };
}

export interface RadioTelarana {
  eje: Eje;
  /** Lo que tuvo la publicación. */
  valor: number;
  /** El promedio de su línea de comparación. */
  base: number;
  /** valor / base. 1 = exactamente en la línea. */
  razon: number;
}

export interface PoligonoTelarana {
  punto: PublicacionPunto;
  color: string;
  referencia: Referencia;
  /** Alineados con `Telarana.ejes`. */
  radios: RadioTelarana[];
}

export interface Telarana {
  nivel: Nivel;
  /** Los radios que sí se pudieron dibujar, en orden. */
  ejes: Eje[];
  poligonos: PoligonoTelarana[];
  /** El tope de la escala radial. El anillo de la línea está en 1. */
  tope: number;
  marcas: number[];
  /** Radios que se cayeron, con el motivo para poder decirlo. */
  descartados: { eje: Eje; motivo: string }[];
  /**
   * Publicaciones cuya línea se calculó sobre ella misma y nada más: la
   * comparación da 100% por definición y no dice nada.
   */
  lineasDeUna: string[];
  /** Publicaciones sin hashtag, que no tienen serie contra la cual compararse. */
  sinSerie: string[];
  /**
   * §9.6 — la línea del engagement tuvo que acotarse a la red de la publicación
   * porque su serie o su período abarca redes que lo miden distinto.
   */
  engagementAcotado: boolean;
}

export interface OpcionesTelarana {
  /** Las publicaciones elegidas, en orden. Se dibujan hasta `MAXIMO_POLIGONOS`. */
  elegidas: readonly PublicacionPunto[];
  nivel: Nivel;
  ejes?: readonly Eje[];
}

/**
 * La telaraña: cada radio es una métrica, y el valor es cuánto se despegó la
 * publicación de su línea.
 *
 * El truco que hace posible el gráfico es que los radios NO llevan el número
 * crudo. Poner visualizaciones (decenas de miles) y engagement (0,05) en la
 * misma figura no se puede: una métrica taparía a la otra. Lo que se dibuja es
 * la RAZÓN contra la línea elegida, que no tiene unidades — así los seis radios
 * hablan el mismo idioma y el anillo del 100% es "le fue como al promedio".
 *
 * Eso convierte al nivel de comparación en parte del gráfico y no en un filtro
 * más: la misma publicación dibuja una figura distinta contra su serie que
 * contra toda la cuenta, y las dos cosas son ciertas.
 *
 * Un radio se cae si la publicación no trae la métrica o si su línea no la
 * trae: dibujarlo en cero diría "rindió cero" y dibujarlo en 100% diría "le fue
 * igual al promedio", y las dos cosas serían inventadas (§9.4). Se dicen.
 */
export function construirTelarana(
  puntos: readonly PublicacionPunto[],
  opciones: OpcionesTelarana,
): Telarana {
  const { nivel } = opciones;
  const pedidos = (opciones.ejes ?? EJES_TELARANA_POR_DEFECTO).filter((e) =>
    EJES_TELARANA.includes(e),
  );
  const elegidas = opciones.elegidas.slice(0, MAXIMO_POLIGONOS);

  const referencias = elegidas.map((p) => referenciaDe(puntos, p, nivel, pedidos));

  /*
   * Los radios tienen que ser los MISMOS para todas las figuras: un polígono
   * con cinco vértices y otro con seis, superpuestos, no se pueden comparar. Así
   * que se queda solo lo que todas las publicaciones elegidas Y todas sus
   * líneas pueden medir.
   */
  const ejes: Eje[] = [];
  const descartados: { eje: Eje; motivo: string }[] = [];

  for (const eje of pedidos) {
    const sinValor = elegidas.filter((p) => valorEnEje(p, eje) === null);
    if (sinValor.length > 0) {
      descartados.push({
        eje,
        motivo:
          elegidas.length === 1
            ? "la publicación no trae esta métrica"
            : `${sinValor.length} de las publicaciones elegidas no traen esta métrica`,
      });
      continue;
    }

    const sinBase = referencias.filter((r) => {
      const b = r.valores[eje];
      return b === null || b === undefined || b === 0;
    });
    if (sinBase.length > 0) {
      descartados.push({
        eje,
        motivo:
          eje === "engagement"
            ? "ninguna otra publicación de su red mide el engagement en esa línea (§9.6)"
            : "la línea de comparación no tiene este dato",
      });
      continue;
    }

    ejes.push(eje);
  }

  const poligonos: PoligonoTelarana[] = elegidas.map((p, i) => ({
    punto: p,
    color: SERIES[i],
    referencia: referencias[i],
    radios: ejes.map((eje) => {
      const valor = valorEnEje(p, eje)!;
      const base = referencias[i].valores[eje]!;
      return { eje, valor, base, razon: valor / base };
    }),
  }));

  /*
   * La escala radial siempre pasa DE LARGO el anillo de la línea.
   *
   * Que llegue hasta 1 no alcanza: cuando la publicación rindió por debajo en
   * todo, el anillo del 100% quedaba justo en el borde del dibujo y se leía
   * como el marco del gráfico en vez de como la referencia. Con un poco de aire
   * por fuera se ve que es un anillo más, y que la figura está adentro.
   */
  const razones = poligonos.flatMap((p) => p.radios.map((r) => r.razon));
  const escala = escalaDe([Math.max(1.05, ...razones)], false);

  return {
    nivel,
    ejes,
    poligonos,
    tope: escala.max,
    marcas: escala.marcas.filter((m) => m > 0),
    descartados,
    lineasDeUna: poligonos
      .filter((p) => p.referencia.n <= 1)
      .map((p) => p.punto.titulo ?? "Sin título"),
    sinSerie:
      nivel === "serie"
        ? elegidas.filter((p) => p.hashtag === null).map((p) => p.titulo ?? "Sin título")
        : [],
    engagementAcotado: referencias.some((r) => r.engagementAcotado),
  };
}

/* ------------------------------------------------------------------ */

/** Los formatos que existen, sin los tipos de contenido (§3.2). */
export const FORMATOS: readonly Categoria[] = [
  ...FORMATOS_INSTAGRAM,
  "Video",
  "Short",
  "Foto",
];
