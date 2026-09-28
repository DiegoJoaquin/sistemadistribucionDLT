/**
 * Agregaciones para la vista de analítica.
 *
 * Todo lo que alimenta un gráfico se calcula acá, puro y testeable. Un gráfico
 * miente más fácil que una tabla —una escala mal elegida o un cero inventado no
 * se notan a simple vista— así que las mismas reglas de §9 valen igual:
 *
 *  - §9.1 — cada valor es un promedio POR PUBLICACIÓN, no una suma. Una semana
 *    con el doble de publicaciones no dibuja el doble de alto por eso solo.
 *  - §9.4 — una semana sin el dato es un HUECO en la línea, no un cero. Un cero
 *    dibuja una caída a fondo que nunca ocurrió.
 *  - §9.6 — el engagement de YouTube va sobre visualizaciones y el del resto
 *    sobre alcance, así que comparar esa barra entre redes distintas no
 *    significa lo mismo. Se rotula donde corresponde.
 */

import {
  engagement,
  type FilaCalculo,
  promedioPorPublicacion,
  publicacionesConMetrica,
  totalPublicaciones,
} from "./calculo";
import type { Categoria } from "./categorias";
import { semanaDe, sumarDias } from "./formato";
import { type Cuenta, ordenarCuentas, tieneAlcanceRed } from "./redes";

/** Las métricas que se pueden graficar. */
export const METRICAS_GRAFICO = [
  "alcance",
  "visualizaciones",
  "interacciones",
  "nuevos_seguidores",
  "engagement",
] as const;

export type MetricaGrafico = (typeof METRICAS_GRAFICO)[number];

export const NOMBRE_METRICA: Record<MetricaGrafico, string> = {
  alcance: "Alcance",
  visualizaciones: "Visualizaciones",
  interacciones: "Interacciones",
  nuevos_seguidores: "Nuevos seguidores",
  engagement: "Engagement",
};

/** true si la métrica se muestra como porcentaje. */
export function esPorcentaje(m: MetricaGrafico): boolean {
  return m === "engagement";
}

/** Una fila con la fecha, que es lo que el corte semanal necesita. */
export interface FilaAnalitica extends FilaCalculo {
  /** "YYYY-MM-DD" */
  fecha: string;
}

/**
 * El valor de una métrica para un conjunto de filas.
 *
 * El engagement no es un promedio por publicación sino una razón de sumas, y
 * su denominador depende de la red (§9.6), así que va por su propio camino.
 */
export function valorDe(
  filas: readonly FilaAnalitica[],
  metrica: MetricaGrafico,
  red?: FilaAnalitica["red"],
): number | null {
  if (metrica !== "engagement") return promedioPorPublicacion(filas, metrica);

  /*
   * Sin una red declarada, el engagement solo tiene sentido si todas las filas
   * son de la misma. Mezclar alcance y visualizaciones en el denominador daría
   * un número que parece comparable y no lo es.
   */
  const redes = new Set(filas.map((f) => f.red));
  const suRed = red ?? (redes.size === 1 ? [...redes][0] : null);
  return suRed === null ? null : engagement(filas, suRed);
}

/* ------------------------------------------------------------------ */
/* Evolución semanal                                                   */
/* ------------------------------------------------------------------ */

export interface Semana {
  /** Lunes, "YYYY-MM-DD". */
  desde: string;
  hasta: string;
}

/** Las semanas del rango, de la más antigua a la más reciente. */
export function semanasDelRango(desde: string, hasta: string): Semana[] {
  const semanas: Semana[] = [];
  let actual = semanaDe(desde);
  const ultima = semanaDe(hasta).desde;

  // Tope de seguridad: cinco años de semanas es muchísimo más de lo razonable.
  for (let i = 0; actual.desde <= ultima && i < 300; i++) {
    semanas.push({ desde: actual.desde, hasta: actual.hasta });
    actual = semanaDe(sumarDias(actual.desde, 7));
  }
  return semanas;
}

export interface SerieCuenta {
  cuentaId: string;
  nombre: string;
  /** Alineados con las semanas. null = esa semana no tiene el dato (§9.4). */
  puntos: (number | null)[];
  /** Publicaciones por semana, para el tooltip y la tabla. */
  publicaciones: number[];
  /** Total de publicaciones de la cuenta en todo el rango. */
  total: number;
}

export interface EvolucionSemanal {
  semanas: Semana[];
  series: SerieCuenta[];
  metrica: MetricaGrafico;
}

/**
 * Una línea por cuenta, un punto por semana.
 *
 * Las semanas sin publicaciones quedan en null y no en cero: una línea que baja
 * a cero dice "esa semana rindió cero", y lo que pasó es que no se publicó.
 */
export function evolucionSemanal(
  filas: readonly FilaAnalitica[],
  cuentas: readonly Cuenta[],
  metrica: MetricaGrafico,
  rango: { desde: string; hasta: string },
): EvolucionSemanal {
  const semanas = semanasDelRango(rango.desde, rango.hasta);

  const series = ordenarCuentas(cuentas).map((cuenta) => {
    const suyas = filas.filter((f) => f.cuentaId === cuenta.id);
    const puntos: (number | null)[] = [];
    const publicaciones: number[] = [];

    for (const s of semanas) {
      const deLaSemana = suyas.filter((f) => f.fecha >= s.desde && f.fecha <= s.hasta);
      puntos.push(deLaSemana.length === 0 ? null : valorDe(deLaSemana, metrica, cuenta.red));
      publicaciones.push(totalPublicaciones(deLaSemana));
    }

    return {
      cuentaId: cuenta.id,
      nombre: cuenta.nombre,
      puntos,
      publicaciones,
      total: totalPublicaciones(suyas),
    };
  });

  return { semanas, series, metrica };
}

/* ------------------------------------------------------------------ */
/* Comparación entre cuentas                                           */
/* ------------------------------------------------------------------ */

export interface BarraCuenta {
  cuentaId: string;
  nombre: string;
  red: Cuenta["red"];
  valor: number | null;
  publicaciones: number;
  /** Sobre cuántas publicaciones se calculó (§9.4). */
  denominador: number;
  /** §9.6 — su engagement no es comparable con el de las otras redes. */
  noComparable: boolean;
}

/**
 * Una barra por cuenta, ordenada de mayor a menor.
 *
 * Las cuentas sin publicaciones en el período no aparecen: una barra en cero
 * ocupa lugar y dice algo distinto de "no publicó".
 */
export function comparativaCuentas(
  filas: readonly FilaAnalitica[],
  cuentas: readonly Cuenta[],
  metrica: MetricaGrafico,
): BarraCuenta[] {
  return cuentas
    .map((cuenta) => {
      const suyas = filas.filter((f) => f.cuentaId === cuenta.id);
      return {
        cuentaId: cuenta.id,
        nombre: cuenta.nombre,
        red: cuenta.red,
        valor: valorDe(suyas, metrica, cuenta.red),
        publicaciones: totalPublicaciones(suyas),
        denominador:
          metrica === "engagement"
            ? totalPublicaciones(suyas)
            : publicacionesConMetrica(suyas, metrica),
        noComparable: metrica === "engagement" && !tieneAlcanceRed(cuenta.red),
      };
    })
    .filter((b) => b.publicaciones > 0)
    .sort((a, b) => (b.valor ?? -Infinity) - (a.valor ?? -Infinity));
}

/* ------------------------------------------------------------------ */
/* Comparación por formato                                             */
/* ------------------------------------------------------------------ */

export interface BarraFormato {
  formato: Categoria;
  valor: number | null;
  publicaciones: number;
}

/**
 * Qué formato rinde mejor.
 *
 * §3.2 — una publicación de Instagram tiene formato Y tipo, así que acá van
 * solo los FORMATOS que se le pidieron al lector; Reactivo y Normal se cuentan
 * aparte porque sumarlos con los formatos contaría cada publicación dos veces.
 */
export function comparativaFormato(
  filas: readonly FilaAnalitica[],
  metrica: MetricaGrafico,
  formatos: readonly Categoria[],
): BarraFormato[] {
  return formatos
    .map((formato) => {
      const suyas = filas.filter((f) => f.categoria === formato);
      return {
        formato,
        valor: valorDe(suyas, metrica),
        publicaciones: totalPublicaciones(suyas),
      };
    })
    .filter((b) => b.publicaciones > 0)
    .sort((a, b) => (b.valor ?? -Infinity) - (a.valor ?? -Infinity));
}

/* ------------------------------------------------------------------ */
/* Totales del período, con su variación                               */
/* ------------------------------------------------------------------ */

export interface Titular {
  metrica: MetricaGrafico;
  valor: number | null;
  /** Variación contra el período anterior de la misma duración. */
  variacion: number | null;
  denominador: number;
}

export interface Titulares {
  publicaciones: number;
  publicacionesAntes: number;
  cuentas: number;
  metricas: Titular[];
}

/**
 * Los números de arriba, con la variación contra el período ANTERIOR.
 *
 * La comparación es contra el período inmediatamente anterior de la misma
 * duración, no contra la línea base mensual: la pregunta de un gráfico de
 * evolución es "¿vamos mejor que antes?", no "¿cómo estamos contra agosto?".
 * Va dicho en la vista para que no se confundan las dos cosas.
 */
export function titulares(
  filas: readonly FilaAnalitica[],
  antes: readonly FilaAnalitica[],
): Titulares {
  const unaSolaRed = new Set(filas.map((f) => f.red)).size === 1;

  return {
    publicaciones: totalPublicaciones(filas),
    publicacionesAntes: totalPublicaciones(antes),
    cuentas: new Set(filas.map((f) => f.cuentaId)).size,
    metricas: METRICAS_GRAFICO.map((metrica) => {
      // El engagement mezclado entre redes no significa nada (§9.6).
      if (metrica === "engagement" && !unaSolaRed) {
        return { metrica, valor: null, variacion: null, denominador: 0 };
      }

      const ahora = valorDe(filas, metrica);
      const previo = valorDe(antes, metrica);
      return {
        metrica,
        valor: ahora,
        variacion:
          ahora === null || previo === null || previo === 0
            ? null
            : (ahora - previo) / previo,
        denominador:
          metrica === "engagement"
            ? totalPublicaciones(filas)
            : publicacionesConMetrica(filas, metrica),
      };
    }),
  };
}

/** El período de la misma duración justo antes del que se está mirando. */
export function periodoAnterior(desde: string, hasta: string): {
  desde: string;
  hasta: string;
} {
  const dias =
    (Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000;
  return {
    desde: sumarDias(desde, -(dias + 1)),
    hasta: sumarDias(desde, -1),
  };
}
