/**
 * Normalización del hashtag, que es el corte nuevo del reporte semanal.
 *
 * Es la misma preocupación de §9.3 aplicada a un campo que sí es texto libre:
 * si una semana se escribe #FECHA17xDLT y la otra #fecha17xdlt, el corte los
 * cuenta como dos series distintas y el promedio de cada una queda mal.
 *
 * Se quitan las tildes además de pasar a mayúsculas, porque #QUÉCAMBIÓ y
 * #QUECAMBIO son la misma serie. La base tiene un trigger que hace la parte
 * barata de esto (mayúsculas, sin numeral, sin espacios alrededor) como red de
 * seguridad para lo que entre por SQL, pero no puede quitar tildes sin
 * extensiones.
 */
export function normalizarHashtag(valor: string | null | undefined): string | null {
  if (valor === null || valor === undefined) return null;

  const limpio = valor
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/#/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();

  return limpio === "" ? null : limpio;
}

/** Primer hashtag de un caption, ya normalizado. null si no tiene ninguno. */
export function primerHashtagDe(caption: string | null | undefined): string | null {
  if (!caption) return null;
  const m = caption.match(/#([\p{L}\p{N}_]+)/u);
  return m ? normalizarHashtag(m[1]) : null;
}
