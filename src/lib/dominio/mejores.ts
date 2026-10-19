/**
 * Los mejores reels de un cliente: los N con más visualizaciones (u otra
 * métrica) en Instagram y en TikTok, en un período.
 *
 * El informe por cliente responde "¿cómo le fue al cliente en promedio?". Este
 * responde la otra pregunta que hace un cliente: "¿cuáles fueron los mejores?".
 * Por eso acá sí se ordena por el valor de cada publicación y no por promedios.
 *
 * Tres decisiones:
 *
 *  - Una publicación es del cliente si lleva CUALQUIERA de sus hashtags, no solo
 *    el primero. En el informe por cliente basta la serie, porque agrupa por
 *    ella; acá lo que importa es no dejar fuera un reel que llevaba el hashtag
 *    del cliente en segundo lugar.
 *  - Reel en Instagram es el formato Reel. En TikTok todo es video, así que
 *    entra todo.
 *  - Una colaboración sale en las dos cuentas que la publican (la del cliente y
 *    la de DLT), con el mismo enlace. Contarla dos veces la pondría dos veces en
 *    el ranking, así que se queda una sola: la que trae más visualizaciones.
 *
 * §9.4 — un reel sin la métrica con que se ordena no entra al ranking: no se
 * puede decir dónde va. Se dice cuántos quedaron fuera por eso.
 */

import { denominadorEngagementRed, type Red } from "./redes";

export interface Reel {
  id: string;
  fecha: string;
  cuentaId: string;
  cuenta: string;
  red: Red;
  categoria: string | null;
  /** Normalizados: la serie más los del texto. */
  hashtags: string[];
  titulo: string | null;
  enlace: string | null;
  visualizaciones: number | null;
  alcance: number | null;
  interacciones: number | null;
  me_gusta: number | null;
  comentarios: number | null;
  compartidos: number | null;
  guardados: number | null;
}

export const METRICAS_MEJORES = ["visualizaciones", "interacciones", "alcance", "compartidos"] as const;
export type MetricaMejores = (typeof METRICAS_MEJORES)[number];

export const NOMBRE_METRICA_MEJORES: Record<MetricaMejores, string> = {
  visualizaciones: "visualizaciones",
  interacciones: "interacciones",
  alcance: "alcance",
  compartidos: "compartidos",
};

export function esMetricaMejores(v: unknown): v is MetricaMejores {
  return typeof v === "string" && (METRICAS_MEJORES as readonly string[]).includes(v);
}

/** Las redes del informe, en el orden en que se muestran. */
export const REDES_MEJORES = ["Instagram", "TikTok"] as const satisfies readonly Red[];

export const CUANTOS_MEJORES = 10;

export function esReel(r: Pick<Reel, "red" | "categoria">): boolean {
  if (r.red === "Instagram") return r.categoria === "Reel";
  return r.red === "TikTok";
}

/** El enlace sin parámetros ni barra final: así se reconoce una colaboración. */
export function claveEnlace(enlace: string | null): string | null {
  if (!enlace) return null;
  return enlace.split(/[?#]/)[0].replace(/\/+$/, "").toLowerCase();
}

/** Una por enlace: la que trae más visualizaciones. Las sin enlace se quedan todas. */
export function sinDuplicados(reels: readonly Reel[]): Reel[] {
  const porEnlace = new Map<string, Reel>();
  const sueltos: Reel[] = [];
  for (const r of reels) {
    const k = claveEnlace(r.enlace);
    if (k === null) {
      sueltos.push(r);
      continue;
    }
    const previo = porEnlace.get(k);
    if (!previo || (r.visualizaciones ?? -1) > (previo.visualizaciones ?? -1)) porEnlace.set(k, r);
  }
  return [...porEnlace.values(), ...sueltos];
}

/** Interacciones sobre alcance (en YouTube sería sobre visualizaciones, §9.6). */
export function engagementDe(r: Reel): number | null {
  const d = r[denominadorEngagementRed(r.red)];
  if (d === null || d <= 0 || r.interacciones === null) return null;
  return r.interacciones / d;
}

export interface MejoresDeRed {
  red: (typeof REDES_MEJORES)[number];
  /** Todos los reels del cliente en esa red, sin duplicados. */
  total: number;
  /** Cuántos no entran al ranking porque no traen la métrica. */
  sinMetrica: number;
  /** Suma de visualizaciones de todos sus reels, para el resumen. */
  visualizaciones: number;
  mejores: Reel[];
}

export interface Mejores {
  cliente: string;
  hashtags: string[];
  desde: string;
  hasta: string;
  metrica: MetricaMejores;
  cuantos: number;
  redes: MejoresDeRed[];
  hayDatos: boolean;
}

export function mejoresReels(
  todos: readonly Reel[],
  cliente: { nombre: string; hashtags: readonly string[] },
  periodo: { desde: string; hasta: string },
  metrica: MetricaMejores,
  cuantos = CUANTOS_MEJORES,
): Mejores {
  const set = new Set(cliente.hashtags);
  const delCliente = sinDuplicados(
    todos.filter(
      (r) =>
        r.fecha >= periodo.desde &&
        r.fecha <= periodo.hasta &&
        esReel(r) &&
        r.hashtags.some((h) => set.has(h)),
    ),
  );

  const redes = REDES_MEJORES.map((red) => {
    const suyos = delCliente.filter((r) => r.red === red);
    const conMetrica = suyos.filter((r) => r[metrica] !== null);
    const mejores = [...conMetrica]
      .sort(
        (a, b) =>
          (b[metrica] ?? 0) - (a[metrica] ?? 0) ||
          (b.visualizaciones ?? 0) - (a.visualizaciones ?? 0) ||
          b.fecha.localeCompare(a.fecha),
      )
      .slice(0, cuantos);
    return {
      red,
      total: suyos.length,
      sinMetrica: suyos.length - conMetrica.length,
      visualizaciones: suyos.reduce((acc, r) => acc + (r.visualizaciones ?? 0), 0),
      mejores,
    };
  });

  return {
    cliente: cliente.nombre,
    hashtags: [...cliente.hashtags],
    desde: periodo.desde,
    hasta: periodo.hasta,
    metrica,
    cuantos,
    redes,
    hayDatos: redes.some((r) => r.total > 0),
  };
}
