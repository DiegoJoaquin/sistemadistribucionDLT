/**
 * Colores de los gráficos.
 *
 * NO se usan los colores de marca de cada red. Parecería lo natural, pero
 * TikTok es #0f172a y Twitter/X es #111827: dos negros azulados casi idénticos,
 * imposibles de distinguir en una línea y peores todavía para quien tiene
 * daltonismo. Sirven como acento al lado de un nombre, no para codificar datos.
 *
 * Esta paleta está verificada con el validador de la guía de visualización
 * contra el blanco de las tarjetas: pasa la banda de luminosidad, el piso de
 * croma, la separación para daltonismo (ΔE 9,1 en el peor par adyacente) y el
 * piso de visión normal (ΔE 19,6). Tres de los ocho quedan bajo 3:1 de
 * contraste, lo que obliga a etiquetas visibles y a una vista de tabla — las
 * dos cosas están.
 *
 * El orden es fijo y no se cicla: un noveno color generado sería
 * indistinguible de alguno de los ocho.
 */

/** Los ocho slots, en orden. La aplicación es solo de modo claro. */
export const SERIES = [
  "#2a78d6", // azul
  "#eb6834", // naranja
  "#1baf7a", // aguamarina
  "#eda100", // amarillo
  "#e87ba4", // magenta
  "#008300", // verde
  "#4a3aa7", // violeta
  "#e34948", // rojo
] as const;

/** Cuántas series se pueden colorear antes de tener que agrupar el resto. */
export const MAXIMO_SERIES = SERIES.length;

/** Un solo color para las barras: una barra por categoría nominal, un color. */
export const BARRA = SERIES[0];

/** Gris de los ejes y la grilla: un paso sobre la superficie, nunca punteado. */
export const GRILLA = "#e5e4e0";
export const EJE = "#d3d2cc";

/** Para la forma de énfasis: una serie en color y el resto en gris. */
export const APAGADO = "#c9c8c2";

/**
 * Asigna un color a cada cuenta, por su posición en una lista ESTABLE.
 *
 * Que sea estable es el punto. Si el color saliera del orden actual del
 * gráfico, filtrar una cuenta repintaría a las demás: quien aprendió que
 * "Instagram DLT es azul" vería otra cosa al sacar una serie. El color sigue a
 * la cuenta, no a su puesto.
 *
 * Las que se pasan del octavo slot quedan sin color: el llamador las agrupa
 * como «otras» o las deja fuera, que es mejor que inventar un noveno tono.
 */
export function coloresPorCuenta(
  cuentasOrdenadas: readonly { id: string }[],
): Map<string, string> {
  const mapa = new Map<string, string>();
  cuentasOrdenadas.forEach((c, i) => {
    if (i < SERIES.length) mapa.set(c.id, SERIES[i]);
  });
  return mapa;
}

/** El color de una cuenta, o el gris de apagado si no tiene slot. */
export function colorDe(mapa: Map<string, string>, cuentaId: string): string {
  return mapa.get(cuentaId) ?? APAGADO;
}
