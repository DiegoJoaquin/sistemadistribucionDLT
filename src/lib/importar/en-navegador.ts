/**
 * Lectura del archivo en el navegador.
 *
 * El punto de entrada para los formularios de importación. Carga los lectores
 * —y con ellos el megabyte de `xlsx`— con un import dinámico, así que ese peso
 * solo lo paga quien de verdad elige un archivo.
 */

import type { ResultadoImport } from "./tipos";

export interface LecturaOk {
  ok: true;
  resultado: ResultadoImport;
  /** Tamaño del archivo, para poder mostrarlo. */
  bytes: number;
}

export interface LecturaError {
  ok: false;
  mensaje: string;
}

/**
 * Tope de tamaño del archivo.
 *
 * No es un límite de la aplicación sino del navegador: leer un archivo de
 * cientos de megas en memoria cuelga la pestaña. El export más grande que tiene
 * el equipo pesa 7 MB, así que 64 deja muchísimo aire.
 */
const MAXIMO_BYTES = 64 * 1024 * 1024;

const mb = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

export async function leerEnNavegador(archivo: File): Promise<LecturaOk | LecturaError> {
  if (archivo.size === 0) {
    return { ok: false, mensaje: "El archivo está vacío." };
  }
  if (archivo.size > MAXIMO_BYTES) {
    return {
      ok: false,
      mensaje: `El archivo pesa ${mb(archivo.size)} y el máximo son ${mb(
        MAXIMO_BYTES,
      )}. Exporta el período en dos partes.`,
    };
  }

  const nombre = archivo.name.toLowerCase();
  if (!nombre.endsWith(".csv") && !nombre.endsWith(".xlsx")) {
    return {
      ok: false,
      mensaje:
        "Solo puedo leer .csv de Meta Business Suite o .xlsx de Iconosquare, TikTok o YouTube.",
    };
  }

  try {
    // Import dinámico: `xlsx` no entra al bundle inicial de la página.
    const { leerArchivo } = await import("./parsers");
    const resultado = leerArchivo(archivo.name, await archivo.arrayBuffer());
    return { ok: true, resultado, bytes: archivo.size };
  } catch (e) {
    return {
      ok: false,
      mensaje: e instanceof Error ? e.message : "No pude leer el archivo.",
    };
  }
}

/**
 * Tope del JSON que se le manda al servidor.
 *
 * Tiene que quedar por debajo del `bodySizeLimit` de `next.config.ts`, que
 * está en 8 MB. Se deja margen para el resto del formulario y para el
 * sobrecosto de la codificación.
 */
const MAXIMO_PAYLOAD = 7 * 1024 * 1024;

export interface Payload {
  ok: true;
  datos: string;
}

/**
 * Qué se le manda al servidor: las filas, no el archivo.
 *
 * Es lo que evita subir siete megas a una acción de servidor. Medido sobre los
 * exports reales, el JSON pesa como un tercio del archivo: unos 1,1 KB por
 * publicación.
 *
 * Si aun así se pasa del tope, se dice ACÁ y con el peso a la vista. Es la
 * diferencia con lo que pasaba antes: la petición se caía sola y la página
 * quedaba en blanco sin ningún mensaje.
 */
export function aPayload(resultado: ResultadoImport): Payload | LecturaError {
  const datos = JSON.stringify(resultado);
  const bytes = new Blob([datos]).size;

  if (bytes > MAXIMO_PAYLOAD) {
    return {
      ok: false,
      mensaje: `Son ${resultado.publicaciones.length} publicaciones y los datos pesan ${mb(
        bytes,
      )}, más de los ${mb(MAXIMO_PAYLOAD)} que acepta el servidor de una vez. Exporta el período en dos partes (por ejemplo, semestre por semestre) y súbelas una tras otra: no se duplica nada.`,
    };
  }

  return { ok: true, datos };
}
