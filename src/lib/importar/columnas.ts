/**
 * Encabezados de las exportaciones, en el idioma que vengan.
 *
 * Meta Business Suite exporta con los encabezados en el idioma de la cuenta:
 * la de DLT los trae en castellano y la de Living Team Chile en inglés. El
 * lector tenía los nombres en castellano escritos a mano, así que un archivo
 * en inglés fallaba con "no puedo saber de qué cuenta es" sin más pista.
 *
 * Hay archivos que además los MEZCLAN — uno de los exports reales trae las
 * dieciocho columnas en castellano y una decimonovena "Views" en inglés — así
 * que no alcanza con detectar el idioma una vez y aplicarlo a todo: cada
 * columna se busca por su cuenta.
 */

/** Sin tildes, en minúsculas y con los espacios colapsados, para comparar. */
export function normalizarEncabezado(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export interface Columnas {
  /** Los encabezados tal como venían, para poder mostrarlos en un error. */
  encabezados: string[];
  /** La clave real de la primera alternativa que exista, o null. */
  clave(...alternativas: string[]): string | null;
  /** El valor de esa columna en una fila. */
  valor(fila: Record<string, unknown>, ...alternativas: string[]): unknown;
}

/**
 * Indexa los encabezados de un archivo ya parseado.
 *
 * Cuando hay dos columnas que significan lo mismo —"Visualizaciones" y
 * "Views" en el mismo archivo— gana la que se pida primero. Por eso las
 * listas de alternativas ponen el castellano adelante: es el que se verificó
 * contra el Excel de agosto, y esa comprobación no se toca por un archivo
 * nuevo.
 */
export function columnasDe(filas: readonly Record<string, unknown>[]): Columnas {
  const encabezados = filas.length > 0 ? Object.keys(filas[0]) : [];

  const porNombre = new Map<string, string>();
  for (const e of encabezados) {
    const n = normalizarEncabezado(e);
    // El primero gana: si un archivo repite un encabezado, se queda el de la
    // izquierda, que es el que vio la persona al abrirlo.
    if (!porNombre.has(n)) porNombre.set(n, e);
  }

  const clave = (...alternativas: string[]): string | null => {
    for (const a of alternativas) {
      const encontrada = porNombre.get(normalizarEncabezado(a));
      if (encontrada !== undefined) return encontrada;
    }
    return null;
  };

  return {
    encabezados,
    clave,
    valor(fila, ...alternativas) {
      const k = clave(...alternativas);
      return k === null ? null : fila[k];
    },
  };
}

/* ------------------------------------------------------------------ */
/* Nombres de columna por idioma                                       */
/* ------------------------------------------------------------------ */

/**
 * Meta Business Suite, castellano e inglés.
 *
 * Los nombres en inglés salen de un export real de Living Team Chile, no de
 * suponer la traducción.
 */
export const META = {
  cuenta: ["Nombre de usuario de la cuenta", "Account username"],
  publicado: ["Hora de publicación", "Publish time"],
  caption: ["Descripción", "Description"],
  tipo: ["Tipo de publicación", "Post type"],
  duracion: ["Duración (segundos)", "Duration (sec)", "Duration (seconds)"],
  visualizaciones: ["Visualizaciones", "Views"],
  alcance: ["Alcance", "Reach"],
  meGusta: ["Me gusta", "Likes"],
  comentarios: ["Comentarios", "Comments"],
  compartidos: ["Veces que se compartió", "Shares"],
  guardados: ["Veces que se guardó", "Saves"],
  seguidores: ["Seguimientos", "Follows"],
  enlace: ["Enlace permanente", "Permalink"],
  id: ["Identificador de la publicación", "Post ID"],
} as const;

/**
 * El formato se deduce por palabra clave y no por el texto completo.
 *
 * "Reel de Instagram" e "Instagram reel" son lo mismo, y mantener una tabla
 * con las dos formas por idioma se desactualiza en cuanto Meta cambie una
 * palabra. Buscar "reel" adentro aguanta los dos idiomas y los cambios de
 * redacción.
 */
export function formatoDePublicacion(tipo: unknown): "Reel" | "Imagen" | "Carrusel" | null {
  const t = normalizarEncabezado(String(tipo ?? ""));
  if (t === "") return null;
  if (t.includes("reel")) return "Reel";
  if (t.includes("carousel") || t.includes("carrusel") || t.includes("secuencia")) {
    return "Carrusel";
  }
  if (t.includes("image") || t.includes("imagen") || t.includes("photo") || t.includes("foto")) {
    return "Imagen";
  }
  return null;
}
