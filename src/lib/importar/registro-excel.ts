/**
 * Lector de la hoja REGISTRO del Excel de KPIs, para traer el histórico de días
 * ya cargados a mano.
 *
 * Esta hoja es la que más sucia viene, justamente porque era texto libre. En el
 * archivo de agosto/septiembre hay:
 *   - "TOTAL" escrito en la columna de categoría, que no es una categoría
 *   - TikTok etiquetado como "Reactivo" y como "Carrusel", categorías que
 *     TikTok no tiene
 *   - guiones literales donde no había dato
 *   - una fila de YouTube con alcance, que YouTube no entrega
 *   - filas sin publicaciones y sin ninguna métrica
 *
 * Nada de eso se importa en silencio: cada fila corregida o descartada queda
 * anotada para mostrarla al final. Es la diferencia entre limpiar los datos y
 * esconder el problema.
 */

import {
  type Categoria,
  categoriasDe,
  esCategoriaValida,
  esPlataforma,
  type Plataforma,
  tieneAlcance,
} from "@/lib/dominio/plataformas";
import * as XLSX from "xlsx";
import { fechaDe, fechaDeCelda, normalizar, num, texto } from "./util";

export interface FilaRegistroExcel {
  fecha: string;
  plataforma: Plataforma;
  categoria: Categoria | null;
  publicaciones: number;
  alcance: number | null;
  visualizaciones: number | null;
  interacciones: number | null;
  nuevos_seguidores: number | null;
  visitas_perfil: number | null;
  vistas_seguidores: number | null;
  vistas_no_seguidores: number | null;
  /** Fila del Excel, para poder ir a mirarla. */
  filaExcel: number;
  correcciones: string[];
}

export interface Descartada {
  filaExcel: number;
  motivo: string;
  detalle: string;
}

export interface ResultadoRegistroExcel {
  filas: FilaRegistroExcel[];
  descartadas: Descartada[];
  /** Cuántas veces se aplicó cada corrección. */
  correcciones: { motivo: string; veces: number }[];
  fechas: string[];
}

/** Los encabezados se buscan tolerando tildes, mayúsculas y espacios de más. */
const CLAVES: Record<string, string> = {
  FECHA: "fecha",
  PLATAFORMA: "plataforma",
  CATEGORIA: "categoria",
  PUBLICACIONES: "publicaciones",
  "ALCANCE / VISTAS": "alcance",
  "ALCANCE/VISTAS": "alcance",
  ALCANCE: "alcance",
  VISUALIZACIONES: "visualizaciones",
  INTERACCIONES: "interacciones",
  "NUEVOS SEGUIDORES": "nuevos_seguidores",
  "VISITAS AL PERFIL": "visitas_perfil",
  "VISTAS X SEGUIDORES": "vistas_seguidores",
  "VISTAS X NO SEGUIDORES": "vistas_no_seguidores",
};

function mapaDeColumnas(encabezados: unknown[]): Map<string, number> {
  const mapa = new Map<string, number>();
  encabezados.forEach((h, i) => {
    const t = texto(h);
    if (!t) return;
    const clave = CLAVES[normalizar(t).replace(/\s+/g, " ").trim()];
    // El primer encabezado que calza gana: la hoja repite "Alcance" en las
    // columnas de variación calculada, que no queremos leer.
    if (clave && !mapa.has(clave)) mapa.set(clave, i);
  });
  return mapa;
}

/** Encuentra la hoja de registro sin depender de cómo esté escrita. */
function hojaDeRegistro(libro: XLSX.WorkBook): string | null {
  const objetivo = libro.SheetNames.find((n) => normalizar(n).includes("REGISTRO"));
  return objetivo ?? null;
}

export function leerRegistroExcel(buffer: ArrayBuffer): ResultadoRegistroExcel {
  const libro = XLSX.read(buffer, { type: "array", cellDates: true });
  const nombre = hojaDeRegistro(libro);
  if (!nombre) {
    throw new Error(
      `Este Excel no tiene una hoja de registro. Hojas encontradas: ${libro.SheetNames.join(", ")}.`,
    );
  }

  const hoja = libro.Sheets[nombre];
  /*
   * `blankrows: true` a propósito: si se omiten las filas vacías, el arreglo se
   * compacta y el índice deja de corresponder a la fila del Excel. Los números
   * de fila se le muestran al usuario para que vaya a mirarlas, así que tienen
   * que ser los de verdad.
   */
  const crudo = XLSX.utils.sheet_to_json<unknown[]>(hoja, {
    header: 1,
    blankrows: true,
    defval: null,
  });

  // El encabezado real está en la fila 4, pero se busca por contenido para no
  // romperse si alguien agrega o saca una línea de título arriba.
  let filaEncabezado = -1;
  let columnas = new Map<string, number>();
  for (let i = 0; i < Math.min(crudo.length, 15); i++) {
    const posible = mapaDeColumnas(crudo[i] ?? []);
    if (posible.has("fecha") && posible.has("plataforma") && posible.has("publicaciones")) {
      filaEncabezado = i;
      columnas = posible;
      break;
    }
  }

  if (filaEncabezado === -1) {
    throw new Error(
      `No encontré los encabezados en la hoja "${nombre}". Se esperaban al menos Fecha, Plataforma y Publicaciones.`,
    );
  }

  const filas: FilaRegistroExcel[] = [];
  const descartadas: Descartada[] = [];
  const conteo = new Map<string, number>();

  const anotar = (correcciones: string[], motivo: string) => {
    correcciones.push(motivo);
    conteo.set(motivo, (conteo.get(motivo) ?? 0) + 1);
  };

  const leer = (fila: unknown[], clave: string) => {
    const i = columnas.get(clave);
    return i === undefined ? null : fila[i];
  };

  let vaciasSeguidas = 0;

  for (let i = filaEncabezado + 1; i < crudo.length; i++) {
    const fila = crudo[i] ?? [];
    const filaExcel = i + 1;

    const crudaFecha = leer(fila, "fecha");
    if (crudaFecha === null || crudaFecha === undefined || crudaFecha === "") {
      // Varias filas vacías seguidas: se terminó la tabla.
      if (++vaciasSeguidas > 20) break;
      continue;
    }
    vaciasSeguidas = 0;

    const naiveFecha = fechaDeCelda(crudaFecha, "DMY");
    if (!naiveFecha) {
      descartadas.push({
        filaExcel,
        motivo: "Fecha ilegible",
        detalle: String(crudaFecha),
      });
      continue;
    }
    const fecha = fechaDe(naiveFecha);

    const crudaPlataforma = texto(leer(fila, "plataforma"));
    if (!esPlataforma(crudaPlataforma)) {
      descartadas.push({
        filaExcel,
        motivo: "Plataforma desconocida",
        detalle: crudaPlataforma ?? "(vacía)",
      });
      continue;
    }
    const plataforma: Plataforma = crudaPlataforma;

    // §9.5: sin publicaciones la fila no sirve, porque es el divisor de todos
    // los promedios del día.
    const publicaciones = num(leer(fila, "publicaciones"));
    if (publicaciones === null || publicaciones < 1) {
      descartadas.push({
        filaExcel,
        motivo: "Sin publicaciones",
        detalle: `${plataforma} · ${fecha}`,
      });
      continue;
    }

    const correcciones: string[] = [];

    /* ---- Categoría ---- */
    const suyas = categoriasDe(plataforma);

    /*
     * Con una sola categoría posible no hay nada que deducir: si el Excel trae
     * cualquier otra cosa, la respuesta correcta es esa única categoría, no
     * dejar la fila sin clasificar. TikTok solo tiene Video, así que sus filas
     * marcadas como "TOTAL", "Reactivo" o "Carrusel" son videos igual.
     */
    const unicaPosible = suyas.length === 1 ? suyas[0] : null;

    let categoria: Categoria | null = unicaPosible;
    const crudaCategoria = texto(leer(fila, "categoria"));

    if (crudaCategoria) {
      const normalizada = normalizar(crudaCategoria);
      const calce = suyas.find((c) => normalizar(c) === normalizada);

      if (calce && esCategoriaValida(plataforma, calce)) {
        categoria = calce;
      } else if (suyas.length === 0) {
        anotar(
          correcciones,
          `${plataforma} no tiene categorías: se descartó la que traía el Excel`,
        );
      } else if (unicaPosible) {
        anotar(
          correcciones,
          `${plataforma} solo puede ser ${unicaPosible}: las filas que decían otra cosa quedaron como ${unicaPosible}`,
        );
      } else if (normalizada === "TOTAL") {
        anotar(
          correcciones,
          'La categoría "TOTAL" no es una categoría: esas filas quedan sin categoría y suman al total de su plataforma',
        );
      } else {
        anotar(
          correcciones,
          `"${crudaCategoria}" no es una categoría de ${plataforma}: esas filas quedan sin categoría`,
        );
      }
    }

    /* ---- Métricas ---- */
    let alcance = num(leer(fila, "alcance"));
    let visualizaciones = num(leer(fila, "visualizaciones"));

    // §9.6: YouTube no entrega alcance. Lo que el Excel puso en esa columna no
    // es alcance, así que no se guarda como tal.
    if (!tieneAlcance(plataforma) && alcance !== null) {
      if (visualizaciones === null) {
        visualizaciones = alcance;
        anotar(
          correcciones,
          "YouTube no entrega alcance: ese valor se guardó como visualizaciones",
        );
      } else {
        anotar(
          correcciones,
          "YouTube no entrega alcance: se descartó ese valor y se mantuvieron las visualizaciones",
        );
      }
      alcance = null;
    }

    const interacciones = num(leer(fila, "interacciones"));
    const nuevos_seguidores = num(leer(fila, "nuevos_seguidores"));
    const visitas_perfil = num(leer(fila, "visitas_perfil"));
    const vistas_seguidores = num(leer(fila, "vistas_seguidores"));
    const vistas_no_seguidores = num(leer(fila, "vistas_no_seguidores"));

    /*
     * Una fila con publicaciones pero sin métricas SÍ se importa: registra que
     * ese día se publicó, que es información real. Como cada promedio ignora
     * sus propios nulos, no distorsiona nada; solo suma al conteo de
     * publicaciones, que es justamente lo que aporta.
     */
    const sinNingunaMetrica =
      alcance === null &&
      visualizaciones === null &&
      interacciones === null &&
      nuevos_seguidores === null &&
      visitas_perfil === null &&
      vistas_seguidores === null &&
      vistas_no_seguidores === null;

    if (sinNingunaMetrica) {
      anotar(
        correcciones,
        "Fila sin métricas: se importó igual, aporta solo el conteo de publicaciones",
      );
    }

    filas.push({
      fecha,
      plataforma,
      categoria,
      publicaciones: Math.round(publicaciones),
      alcance,
      visualizaciones,
      interacciones,
      nuevos_seguidores,
      visitas_perfil,
      vistas_seguidores,
      vistas_no_seguidores,
      filaExcel,
      correcciones,
    });
  }

  return {
    filas,
    descartadas,
    correcciones: [...conteo.entries()]
      .map(([motivo, veces]) => ({ motivo, veces }))
      .sort((a, b) => b.veces - a.veces),
    fechas: [...new Set(filas.map((f) => f.fecha))].sort(),
  };
}
