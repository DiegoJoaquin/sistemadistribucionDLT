/**
 * Catastro por hashtag: qué se publicó en el período y cómo le fue a cada serie.
 *
 * Es el corte nuevo. El panel diario responde "¿cómo le fue hoy a los Reels de
 * Instagram DLT?"; el catastro responde "¿qué series salieron esta semana, en
 * qué cuentas, y cómo le fue a cada una?".
 *
 * Cada serie se compara contra DOS referencias, porque una sola engaña:
 *
 *   vsSuBase       — contra el promedio de esa misma serie en la línea base.
 *                    Responde: ¿esta semana anduvo mejor que de costumbre?
 *   vsPromedioCuenta — contra el promedio total de la cuenta en la línea base.
 *                    Responde: ¿esta serie vale más que el promedio de la cuenta?
 *
 * Una serie puede estar 20% bajo su propio promedio y seguir siendo lo mejor
 * que tiene la cuenta. Con solo la primera comparación se ve como un fracaso;
 * con solo la segunda, no se nota que viene cayendo.
 *
 * Todo es puro, sin base de datos, igual que `calculo.ts`.
 */

import {
  delta,
  engagement,
  type FilaCalculo,
  promedioPorPublicacion,
  type PromediosBase,
  totalPublicaciones,
} from "./calculo";
import { type Cuenta, tieneAlcanceRed } from "./redes";

/** Una fila del registro con lo que el catastro necesita además del cálculo. */
export interface FilaCatastro extends FilaCalculo {
  /** Ya normalizado. null = la publicación no traía hashtag. */
  hashtag: string | null;
}

/**
 * Qué representa una línea.
 *
 * Va discriminado y no como `hashtag: string | null` porque null tendría dos
 * significados incompatibles: el TOTAL de la cuenta y las publicaciones sin
 * hashtag. Confundirlos hacía que el total apareciera como si fuera una serie.
 */
export type Corte =
  | { tipo: "total" }
  | { tipo: "hashtag"; hashtag: string }
  | { tipo: "sin-hashtag" };

export function etiquetaDeCorte(corte: Corte): string {
  switch (corte.tipo) {
    case "total":
      return "TOTAL";
    case "hashtag":
      return `#${corte.hashtag}`;
    case "sin-hashtag":
      return "Sin hashtag";
  }
}

/** La clave con la que se busca la base de un corte. */
export function claveHashtag(cuentaId: string, hashtag: string | null): string {
  // Un hashtag normalizado nunca contiene "#": `normalizarHashtag` lo quita.
  // Por eso "#SIN" no puede chocar con una serie de verdad.
  return `${cuentaId}|${hashtag ?? "#SIN"}`;
}

export interface Metricas {
  alcance: number | null;
  visualizaciones: number | null;
  interacciones: number | null;
  nuevos_seguidores: number | null;
  engagement: number | null;
}

const SIN_METRICAS: Metricas = {
  alcance: null,
  visualizaciones: null,
  interacciones: null,
  nuevos_seguidores: null,
  engagement: null,
};

export interface LineaCatastro {
  cuenta: Cuenta;
  corte: Corte;
  etiqueta: string;
  publicaciones: number;
  /** Promedios por publicación del período (§9.1). */
  periodo: Metricas;
  /** La línea base propia del corte: su misma serie, o el total de la cuenta. */
  base: PromediosBase | null;
  /** El total de la cuenta en la línea base. null en la línea TOTAL. */
  baseCuenta: PromediosBase | null;
  /** Contra su propia referencia histórica. */
  vsSuBase: Metricas;
  /**
   * Contra el promedio total de la cuenta.
   *
   * En la línea TOTAL queda en null: comparar el total consigo mismo daría 0%
   * y ocuparía una columna entera para no decir nada.
   */
  vsPromedioCuenta: Metricas;
  /** La serie no aparece en la línea base: es nueva, no hay con qué comparar. */
  serieNueva: boolean;
  /** §9.6 — el engagement de YouTube no es comparable con el de otras redes. */
  engagementNoComparable: boolean;
}

/** Filas de una cuenta que caen en un corte. */
export function filasDeCorte(
  filas: readonly FilaCatastro[],
  cuentaId: string,
  corte: Corte,
): FilaCatastro[] {
  return filas.filter((f) => {
    if (f.cuentaId !== cuentaId) return false;
    switch (corte.tipo) {
      case "total":
        return true;
      case "hashtag":
        return f.hashtag === corte.hashtag;
      case "sin-hashtag":
        return f.hashtag === null;
    }
  });
}

function deltasContra(periodo: Metricas, base: PromediosBase | null): Metricas {
  if (base === null) return { ...SIN_METRICAS };
  return {
    alcance: delta(periodo.alcance, base.alcance_prom),
    visualizaciones: delta(periodo.visualizaciones, base.visualizaciones_prom),
    interacciones: delta(periodo.interacciones, base.interacciones_prom),
    nuevos_seguidores: delta(periodo.nuevos_seguidores, base.nuevos_seguidores_prom),
    engagement: delta(periodo.engagement, base.engagement_prom),
  };
}

export function construirLineaCatastro(
  filas: readonly FilaCatastro[],
  cuenta: Cuenta,
  corte: Corte,
  base: PromediosBase | null,
  baseCuenta: PromediosBase | null,
): LineaCatastro {
  const seleccion = filasDeCorte(filas, cuenta.id, corte);

  const periodo: Metricas = {
    alcance: promedioPorPublicacion(seleccion, "alcance"),
    visualizaciones: promedioPorPublicacion(seleccion, "visualizaciones"),
    interacciones: promedioPorPublicacion(seleccion, "interacciones"),
    nuevos_seguidores: promedioPorPublicacion(seleccion, "nuevos_seguidores"),
    engagement: engagement(seleccion, cuenta.red),
  };

  const esTotal = corte.tipo === "total";

  return {
    cuenta,
    corte,
    etiqueta: etiquetaDeCorte(corte),
    publicaciones: totalPublicaciones(seleccion),
    periodo,
    base,
    baseCuenta: esTotal ? null : baseCuenta,
    vsSuBase: deltasContra(periodo, base),
    vsPromedioCuenta: esTotal
      ? { ...SIN_METRICAS }
      : deltasContra(periodo, baseCuenta),
    serieNueva: !esTotal && base === null,
    engagementNoComparable: !tieneAlcanceRed(cuenta.red),
  };
}

/* ------------------------------------------------------------------ */
/* Armado del catastro completo                                        */
/* ------------------------------------------------------------------ */

export interface BloqueCatastro {
  cuenta: Cuenta;
  /** El TOTAL de la cuenta en el período (§9.2). */
  total: LineaCatastro;
  /** Una línea por serie, de más publicaciones a menos. */
  series: LineaCatastro[];
}

/**
 * Los cortes de una cuenta, ordenados como se leen: las series con más
 * publicaciones primero, y las publicaciones sin hashtag al final porque son el
 * resto y no una serie.
 */
export function cortesDe(filas: readonly FilaCatastro[], cuentaId: string): Corte[] {
  const conteo = new Map<string | null, number>();
  for (const f of filas) {
    if (f.cuentaId !== cuentaId) continue;
    conteo.set(f.hashtag, (conteo.get(f.hashtag) ?? 0) + f.publicaciones);
  }

  return [...conteo.entries()]
    .sort(
      ([ha, na], [hb, nb]) =>
        Number(ha === null) - Number(hb === null) ||
        nb - na ||
        (ha ?? "").localeCompare(hb ?? "", "es"),
    )
    .map(([hashtag]): Corte =>
      hashtag === null ? { tipo: "sin-hashtag" } : { tipo: "hashtag", hashtag },
    );
}

export type MapaPromedios = Map<string, PromediosBase>;

export interface OpcionesCatastro {
  /** Promedios por hashtag: clave `claveHashtag(cuentaId, hashtag)`. */
  porHashtag: MapaPromedios;
  /** Promedios TOTAL de cada cuenta: clave `cuentaId`. */
  porCuenta: MapaPromedios;
}

export function construirBloque(
  filas: readonly FilaCatastro[],
  cuenta: Cuenta,
  { porHashtag, porCuenta }: OpcionesCatastro,
): BloqueCatastro {
  const baseCuenta = porCuenta.get(cuenta.id) ?? null;

  return {
    cuenta,
    total: construirLineaCatastro(
      filas,
      cuenta,
      { tipo: "total" },
      baseCuenta,
      baseCuenta,
    ),
    series: cortesDe(filas, cuenta.id).map((corte) =>
      construirLineaCatastro(
        filas,
        cuenta,
        corte,
        porHashtag.get(
          claveHashtag(cuenta.id, corte.tipo === "hashtag" ? corte.hashtag : null),
        ) ?? null,
        baseCuenta,
      ),
    ),
  };
}

/* ------------------------------------------------------------------ */
/* Series que salieron en más de una cuenta                            */
/* ------------------------------------------------------------------ */

export interface SerieCruzada {
  hashtag: string;
  /** Una entrada por cuenta donde salió la serie, con su propio rendimiento. */
  cuentas: {
    cuenta: Cuenta;
    publicaciones: number;
    periodo: Metricas;
    vsSuBase: Metricas;
  }[];
  publicaciones: number;
}

/**
 * El mismo hashtag publicado en más de una cuenta.
 *
 * Es lo que pidió el equipo: si el mismo video sale en TikTok y en Instagram,
 * identificarlo pero mostrarlo por separado — "en esta cuenta pasó esto y en la
 * otra esto". No se promedian entre sí: son públicos distintos, redes distintas
 * y en YouTube el engagement ni siquiera se calcula igual (§9.6).
 */
export function seriesCruzadas(bloques: readonly BloqueCatastro[]): SerieCruzada[] {
  const porHashtag = new Map<string, SerieCruzada>();

  for (const bloque of bloques) {
    for (const linea of bloque.series) {
      if (linea.corte.tipo !== "hashtag") continue;
      const h = linea.corte.hashtag;
      const entrada = porHashtag.get(h) ?? { hashtag: h, cuentas: [], publicaciones: 0 };
      entrada.cuentas.push({
        cuenta: linea.cuenta,
        publicaciones: linea.publicaciones,
        periodo: linea.periodo,
        vsSuBase: linea.vsSuBase,
      });
      entrada.publicaciones += linea.publicaciones;
      porHashtag.set(h, entrada);
    }
  }

  return [...porHashtag.values()]
    .filter((s) => s.cuentas.length > 1)
    .sort(
      (a, b) =>
        b.cuentas.length - a.cuentas.length ||
        b.publicaciones - a.publicaciones ||
        a.hashtag.localeCompare(b.hashtag, "es"),
    );
}

/* ------------------------------------------------------------------ */
/* Lo más y lo menos destacado del período                             */
/* ------------------------------------------------------------------ */

export type MetricaTitular = "alcance" | "visualizaciones";

/**
 * La métrica de titular de una cuenta.
 *
 * Es el alcance, salvo donde no existe: §9.6, YouTube no lo entrega. Sin esta
 * distinción YouTube nunca aparecía en los destacados — publicaba 21 videos en
 * la semana y la lista lo ignoraba, porque su alcance siempre es nulo.
 */
export function metricaTitular(cuenta: Cuenta): MetricaTitular {
  return tieneAlcanceRed(cuenta.red) ? "alcance" : "visualizaciones";
}

export interface DestacadaCatastro {
  cuenta: Cuenta;
  hashtag: string;
  publicaciones: number;
  /** El delta que la hizo destacar, contra su propia base. */
  valor: number;
  /** Cuál métrica: no es la misma en todas las redes (§9.6). */
  metrica: MetricaTitular;
}

/**
 * Las series que más se movieron respecto de su propia base.
 *
 * Solo entran las que tienen base: una serie nueva no "subió", simplemente no
 * tiene con qué compararse, y presentarla como un salto sería inventar.
 */
export function destacadas(
  bloques: readonly BloqueCatastro[],
  cuantas = 3,
): { mejores: DestacadaCatastro[]; peores: DestacadaCatastro[] } {
  const todas: DestacadaCatastro[] = [];

  for (const bloque of bloques) {
    const metrica = metricaTitular(bloque.cuenta);
    for (const linea of bloque.series) {
      if (linea.corte.tipo !== "hashtag") continue;
      const valor = linea.vsSuBase[metrica];
      if (valor === null) continue;
      todas.push({
        cuenta: linea.cuenta,
        hashtag: linea.corte.hashtag,
        publicaciones: linea.publicaciones,
        valor,
        metrica,
      });
    }
  }

  const ordenadas = [...todas].sort((a, b) => b.valor - a.valor);

  return {
    mejores: ordenadas.filter((d) => d.valor > 0).slice(0, cuantas),
    peores: ordenadas
      .filter((d) => d.valor < 0)
      .slice(-cuantas)
      .reverse(),
  };
}
