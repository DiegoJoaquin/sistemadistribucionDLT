/**
 * Informe por cliente: las mismas métricas del catastro, pero solo de los
 * hashtags de un cliente y en un período libre.
 *
 * Reutiliza el motor del catastro entero. La diferencia es de dos cosas:
 *
 *  - Las filas se filtran a los hashtags del cliente ANTES de construir los
 *    bloques. Con eso, el "TOTAL" de cada bloque deja de ser el total de la
 *    cuenta y pasa a ser el total del cliente EN esa cuenta, que es justo lo
 *    que un informe de patrocinio tiene que decir.
 *  - El período es libre, no una semana. Un informe de nueve meses esconde la
 *    evolución detrás de un promedio, así que además se calcula mes a mes.
 *
 * Las dos comparaciones no cambian: cada serie contra su propio promedio en la
 * línea base, y contra el promedio total de la cuenta. La segunda es la que le
 * interesa al cliente — "¿mi contenido rinde más que el promedio de la cuenta
 * donde lo publican?".
 */

import {
  type BloqueCatastro,
  construirBloque,
  type FilaCatastro,
  type MapaPromedios,
  type Metricas,
} from "./catastro";
import {
  engagement,
  promedioPorPublicacion,
  publicacionesConMetrica,
  totalPublicaciones,
} from "./calculo";
import { type Cuenta, ordenarCuentas } from "./redes";

/** Una fila del registro con la fecha, que el corte mensual necesita. */
export interface FilaInforme extends FilaCatastro {
  /** "YYYY-MM-DD" */
  fecha: string;
}

/**
 * Deja solo las filas cuyo hashtag pertenece al cliente.
 *
 * Las publicaciones sin hashtag nunca entran: no se puede afirmar que sean del
 * cliente. Meterlas «por si acaso» inflaría el informe con contenido ajeno.
 */
export function filtrarPorHashtags<T extends FilaCatastro>(
  filas: readonly T[],
  hashtags: readonly string[],
): T[] {
  const set = new Set(hashtags);
  return filas.filter((f) => f.hashtag !== null && set.has(f.hashtag));
}

export interface MesInforme {
  /** "YYYY-MM" */
  mes: string;
  publicaciones: number;
  alcance: number | null;
  visualizaciones: number | null;
  interacciones: number | null;
  nuevos_seguidores: number | null;
}

/**
 * La evolución mes a mes del cliente, sumando todas sus cuentas.
 *
 * Sin engagement a propósito: §9.6 — YouTube lo calcula sobre visualizaciones
 * y el resto sobre alcance, así que un engagement que mezcle cuentas de redes
 * distintas no significa nada. El engagement va por cuenta, en los bloques.
 *
 * Las métricas sí se pueden mezclar porque son promedios por publicación con
 * denominador por métrica: una publicación de YouTube, que no trae alcance, no
 * entra al promedio de alcance ni al denominador (§9.4).
 */
export function evolucionMensual(filas: readonly FilaInforme[]): MesInforme[] {
  const meses = new Map<string, FilaInforme[]>();
  for (const f of filas) {
    const mes = f.fecha.slice(0, 7);
    const lista = meses.get(mes);
    if (lista) lista.push(f);
    else meses.set(mes, [f]);
  }

  return [...meses.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([mes, suyas]) => ({
      mes,
      publicaciones: totalPublicaciones(suyas),
      alcance: promedioPorPublicacion(suyas, "alcance"),
      visualizaciones: promedioPorPublicacion(suyas, "visualizaciones"),
      interacciones: promedioPorPublicacion(suyas, "interacciones"),
      nuevos_seguidores: promedioPorPublicacion(suyas, "nuevos_seguidores"),
    }));
}

/** Una serie del cliente, con en cuántas cuentas salió. */
export interface SerieDelCliente {
  hashtag: string;
  publicaciones: number;
  cuentas: number;
  /** Promedios por publicación sumando todas las cuentas donde salió. */
  total: Omit<Metricas, "engagement">;
}

/**
 * Las series del cliente ordenadas por volumen, con su total agregado.
 *
 * Es la tabla que el cliente mira primero: qué series salieron y cuánto pesó
 * cada una. El detalle por cuenta está en los bloques.
 */
export function seriesDelCliente(filas: readonly FilaInforme[]): SerieDelCliente[] {
  const porHashtag = new Map<string, FilaInforme[]>();
  for (const f of filas) {
    if (f.hashtag === null) continue;
    const lista = porHashtag.get(f.hashtag);
    if (lista) lista.push(f);
    else porHashtag.set(f.hashtag, [f]);
  }

  return [...porHashtag.entries()]
    .map(([hashtag, suyas]) => ({
      hashtag,
      publicaciones: totalPublicaciones(suyas),
      cuentas: new Set(suyas.map((f) => f.cuentaId)).size,
      total: {
        alcance: promedioPorPublicacion(suyas, "alcance"),
        visualizaciones: promedioPorPublicacion(suyas, "visualizaciones"),
        interacciones: promedioPorPublicacion(suyas, "interacciones"),
        nuevos_seguidores: promedioPorPublicacion(suyas, "nuevos_seguidores"),
      },
    }))
    .sort(
      (a, b) =>
        b.publicaciones - a.publicaciones ||
        a.hashtag.localeCompare(b.hashtag, "es"),
    );
}

export interface TotalInforme {
  publicaciones: number;
  /** Cuántas series distintas del cliente salieron. */
  series: number;
  cuentas: number;
  metricas: Metricas;
  /**
   * Sobre cuántas publicaciones se calculó cada promedio.
   *
   * §9.4 — una publicación que no trae la métrica no entra ni al numerador ni
   * al divisor. En un informe de cliente hay que poder decirlo: "alcance
   * 41.431 sobre 12 de 19 publicaciones, porque YouTube no lo entrega" es un
   * dato; "19 publicaciones, alcance 41.431" invita a una lectura equivocada.
   */
  denominadores: {
    alcance: number;
    visualizaciones: number;
    interacciones: number;
    nuevos_seguidores: number;
  };
}

/**
 * El total del cliente en el período.
 *
 * El engagement queda en null cuando hay más de una red involucrada: sumar
 * interacciones sobre denominadores distintos (§9.6) daría un número que
 * parece comparable y no lo es.
 */
export function totalDelCliente(filas: readonly FilaInforme[]): TotalInforme {
  const redes = new Set(filas.map((f) => f.red));
  const unaSolaRed = redes.size === 1 ? [...redes][0] : null;

  return {
    publicaciones: totalPublicaciones(filas),
    series: new Set(filas.filter((f) => f.hashtag).map((f) => f.hashtag)).size,
    cuentas: new Set(filas.map((f) => f.cuentaId)).size,
    metricas: {
      alcance: promedioPorPublicacion(filas, "alcance"),
      visualizaciones: promedioPorPublicacion(filas, "visualizaciones"),
      interacciones: promedioPorPublicacion(filas, "interacciones"),
      nuevos_seguidores: promedioPorPublicacion(filas, "nuevos_seguidores"),
      engagement: unaSolaRed === null ? null : engagement(filas, unaSolaRed),
    },
    denominadores: {
      alcance: publicacionesConMetrica(filas, "alcance"),
      visualizaciones: publicacionesConMetrica(filas, "visualizaciones"),
      interacciones: publicacionesConMetrica(filas, "interacciones"),
      nuevos_seguidores: publicacionesConMetrica(filas, "nuevos_seguidores"),
    },
  };
}

export interface Informe {
  cliente: string;
  desde: string;
  hasta: string;
  /** Los hashtags que definen al cliente, tal como están configurados. */
  hashtags: string[];
  /** Los que sí aparecieron en el período. */
  hashtagsConDatos: string[];
  /** Los configurados que no tuvieron ninguna publicación en el período. */
  hashtagsSinDatos: string[];
  total: TotalInforme;
  series: SerieDelCliente[];
  porMes: MesInforme[];
  /** Un bloque por cuenta donde salió contenido del cliente. */
  bloques: BloqueCatastro[];
  hayDatos: boolean;
}

export interface OpcionesInforme {
  porHashtag: MapaPromedios;
  porCuenta: MapaPromedios;
}

export function construirInforme(
  cliente: string,
  hashtags: readonly string[],
  filas: readonly FilaInforme[],
  cuentas: readonly Cuenta[],
  periodo: { desde: string; hasta: string },
  opciones: OpcionesInforme,
): Informe {
  const suyas = filtrarPorHashtags(filas, hashtags);
  const conDatos = new Set(suyas.map((f) => f.hashtag as string));

  const conActividad = ordenarCuentas(
    cuentas.filter((c) => suyas.some((f) => f.cuentaId === c.id)),
  );

  return {
    cliente,
    desde: periodo.desde,
    hasta: periodo.hasta,
    hashtags: [...hashtags].sort((a, b) => a.localeCompare(b, "es")),
    hashtagsConDatos: [...conDatos].sort((a, b) => a.localeCompare(b, "es")),
    /*
     * Decir qué series NO salieron importa tanto como las que sí: si el
     * cliente esperaba cinco y salieron tres, el informe tiene que mostrarlo
     * y no dejar que se note por la ausencia de una fila.
     */
    hashtagsSinDatos: [...hashtags]
      .filter((h) => !conDatos.has(h))
      .sort((a, b) => a.localeCompare(b, "es")),
    total: totalDelCliente(suyas),
    series: seriesDelCliente(suyas),
    porMes: evolucionMensual(suyas),
    bloques: conActividad.map((cuenta) => construirBloque(suyas, cuenta, opciones)),
    hayDatos: suyas.length > 0,
  };
}
