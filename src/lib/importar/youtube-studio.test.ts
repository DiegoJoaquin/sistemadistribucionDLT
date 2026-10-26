import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import type { Cuenta } from "@/lib/dominio/redes";
import { aFilaRegistro, completarTexto, fusionarConExistente } from "./a-registro";
import { leerArchivo } from "./parsers";
import { fechaStudio, idYouTube, variantesYouTube } from "./youtube-studio";

const ENCABEZADO = [
  "Contenido",
  "Título del vídeo",
  "Hora de publicación del vídeo",
  "Duración",
  "Usuarios nuevos",
  "Suscriptores ganados",
  "Me gusta",
  "Compartido",
  "Visualizaciones",
];

function libroStudio(filas: unknown[][]): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([ENCABEZADO, ...filas]), "Datos de la tabla");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Fecha", "Usuarios nuevos"]]), "Totales");
  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

const YOUTUBE: Cuenta = {
  id: "yt",
  nombre: "YouTube",
  usuario: "@dltsportstv",
  red: "YouTube",
  es_influencer: false,
  activa: true,
  orden: 4,
};

describe("export de YouTube Studio", () => {
  const r = leerArchivo(
    "Contenido.xlsx",
    libroStudio([
      ["Total", "", "", "", 98530, 587, 19094, 758, 1762098],
      ["SwtRhyFCVJg", "¿QUÉ CHU*** PASÓ EN AZUL AZUL? 💣", "Oct 19, 2026", 58, 41555, 12, 3993, 255, 29361],
      ["Z59cingnmo8", "DE BUENA FUENTE #241 | CASZELY", "Oct 14, 2026", 3366, 100, 3, 50, 2, 7776],
    ]),
  );

  it("se reconoce aunque no tenga la cabecera de Iconosquare", () => {
    expect(r.detectada).toEqual({ usuario: null, red: "YouTube" });
    expect(r.soloCompletaTexto).toBe(true);
  });

  it("salta la fila del total y lee cada video con su título", () => {
    expect(r.publicaciones).toHaveLength(2);
    const [corto, largo] = r.publicaciones;
    expect(corto.caption).toBe("¿QUÉ CHU*** PASÓ EN AZUL AZUL? 💣");
    expect(corto.publicado_en).toBe("2026-10-19T00:00:00");
    expect(corto.visualizaciones).toBe(29361);
    expect(corto.nuevos_seguidores).toBe(12);
    expect(corto.alcance).toBeNull();
    expect(largo.serie_hashtag).toBe("241");
  });

  it("deduce Short o Video por la duración y arma el enlace como Iconosquare", () => {
    expect(r.publicaciones[0]).toMatchObject({ formato: "Short", id_externo: "https://www.youtube.com/shorts/SwtRhyFCVJg" });
    expect(r.publicaciones[1]).toMatchObject({ formato: "Video", id_externo: "https://www.youtube.com/watch?v=Z59cingnmo8" });
  });
});

describe("fechaStudio", () => {
  it("lee la fecha en inglés y en castellano", () => {
    expect(fechaStudio("Jun 9, 2026")).toBe("2026-06-09T00:00:00");
    expect(fechaStudio("9 jun 2026")).toBe("2026-06-09T00:00:00");
    expect(fechaStudio("19 de oct. de 2026")).toBe("2026-10-19T00:00:00");
    expect(fechaStudio("algo")).toBeNull();
  });
});

describe("el mismo video con dos enlaces", () => {
  it("saca el ID de un Short, de un watch y de youtu.be", () => {
    expect(idYouTube("https://www.youtube.com/shorts/SwtRhyFCVJg")).toBe("SwtRhyFCVJg");
    expect(idYouTube("https://www.youtube.com/watch?v=SwtRhyFCVJg&t=3")).toBe("SwtRhyFCVJg");
    expect(idYouTube("https://youtu.be/SwtRhyFCVJg")).toBe("SwtRhyFCVJg");
  });

  it("busca las dos formas en que puede estar guardado", () => {
    expect(variantesYouTube("https://www.youtube.com/shorts/abc123")).toEqual([
      "https://www.youtube.com/shorts/abc123",
      "https://www.youtube.com/watch?v=abc123",
    ]);
  });
});

describe("completar solo el texto", () => {
  const nueva = aFilaRegistro(
    {
      publicado_en: "2026-10-19T00:00:00",
      formato: "Short",
      tipo: null,
      tipo_auto: null,
      serie_hashtag: null,
      caption: "¿QUÉ CHU*** PASÓ EN AZUL AZUL?",
      duracion_s: 58,
      visualizaciones: 100,
      alcance: null,
      me_gusta: 1,
      comentarios: null,
      compartidos: null,
      guardados: null,
      favoritos: null,
      nuevos_seguidores: null,
      interacciones: null,
      enlace: "https://www.youtube.com/shorts/x",
      id_externo: "https://www.youtube.com/shorts/x",
      fuente: "youtube",
    },
    YOUTUBE,
  )!;

  it("pone el título que faltaba y no toca las métricas", () => {
    const datos = completarTexto({ texto: null, titulo_contenido: null, duracion_s: 58, visualizaciones: 29361 }, nueva);
    expect(datos).toEqual({
      texto: "¿QUÉ CHU*** PASÓ EN AZUL AZUL?",
      titulo_contenido: "¿QUÉ CHU*** PASÓ EN AZUL AZUL?",
    });
  });

  it("no cambia nada si el texto que había es igual o más largo", () => {
    const largo = "¿QUÉ CHU*** PASÓ EN AZUL AZUL? Se destapó la olla completa en la U";
    expect(completarTexto({ texto: largo, titulo_contenido: largo, duracion_s: 58, hashtag: "X" }, nueva)).toEqual({});
  });

  it("al fusionar, una fecha sin hora no le borra la hora a la que ya estaba", () => {
    const f = fusionarConExistente({ publicado_en: "2026-10-19T14:28:56" }, nueva);
    expect(f.publicado_en).toBe("2026-10-19T14:28:56");
  });
});
