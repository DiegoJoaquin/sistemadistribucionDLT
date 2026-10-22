/**
 * Exportaciones de Iconosquare descargadas en castellano.
 *
 * Iconosquare exporta en el idioma de quien descarga: "Leyenda" en vez de
 * "Caption", "Fecha y hora" en vez de "Date and time". El lector solo conocía
 * los encabezados en inglés y un archivo en castellano se leía sin ninguna
 * publicación. Además de eso, estas pruebas cubren las campañas, que son una
 * señal del global de marcas.
 */
import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import { leerArchivo } from "./parsers";

function libro(perfil: string, red: string, encabezados: string[], filas: unknown[][]): ArrayBuffer {
  const hoja = XLSX.utils.aoa_to_sheet([
    ["Perfil", perfil],
    ["Red social", red],
    ["Ordenar por", "Publicaciones más recientes"],
    encabezados,
    ...filas,
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, hoja, "Worksheet");
  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

describe("TikTok de Iconosquare en castellano", () => {
  const buffer = libro(
    "dltsportsoficial",
    "TikTok",
    [
      "Fecha y hora",
      "Campañas",
      "Etiquetas",
      "Leyenda",
      "Visualizaciones de video",
      "Me gusta",
      "Comentarios",
      "Favoritos",
      "Compartidos",
      "Alcance",
      "URL del video de TikTok",
    ],
    [
      [
        "2026-10-16 15:32:08",
        "el living, SPARTA GLOBAL",
        null,
        "#ELLIVINGDELTEAMCHILE | LO BUENO Y LO MALO\n\n#SPARTAxDLT",
        14_000,
        900,
        12,
        30,
        8,
        12_500,
        "https://www.tiktok.com/@dltsportsoficial/video/1",
      ],
    ],
  );

  const r = leerArchivo("tiktok.xlsx", buffer);
  const p = r.publicaciones[0];

  it("lee la publicación con sus métricas", () => {
    expect(r.publicaciones).toHaveLength(1);
    expect(p.publicado_en).toBe("2026-10-16T15:32:08");
    expect(p.visualizaciones).toBe(14_000);
    expect(p.alcance).toBe(12_500);
    expect(p.interacciones).toBe(900 + 12 + 30 + 8);
    expect(p.id_externo).toBe("https://www.tiktok.com/@dltsportsoficial/video/1");
  });

  it("guarda el caption entero y las campañas", () => {
    expect(p.caption).toContain("#SPARTAxDLT");
    expect(p.campanas).toBe("el living, SPARTA GLOBAL");
  });
});

describe("Instagram de Iconosquare en castellano", () => {
  const buffer = libro(
    "liga_sanjose",
    "Instagram",
    [
      "Medios publicados",
      "Fecha",
      "Tipo",
      "Campañas",
      "Etiquetas",
      "Leyenda",
      "Interacción de la publicación",
      "Me gusta",
      "Comentarios",
      "Guardados",
      "Compartidos",
      "Visualizaciones / impresiones totales",
      "Alcance",
      "URL de Instagram",
    ],
    [
      [null, "2026-10-07 11:41:49", "Foto", null, "xi ideal", "#ELXIIDEALxREDBULL | LA PIZARRA @redbullcl", 120, 100, 10, 5, 5, 3_000, 2_400, "https://www.instagram.com/p/DeMtHIxRXv1/"],
      [null, "2026-10-05 14:21:40", "Carrusel", null, null, "#LAFIGURAPOWERADExLSJ | FREI AL RESCATE", null, 50, 4, 2, 1, 1_500, 1_200, "https://www.instagram.com/p/DeH110JlLAS/"],
    ],
  );

  const r = leerArchivo("lsj.xlsx", buffer);

  it("detecta la cuenta y lee las dos publicaciones", () => {
    expect(r.detectada).toEqual({ usuario: "liga_sanjose", red: "Instagram" });
    expect(r.publicaciones).toHaveLength(2);
  });

  it("mapea los formatos en castellano", () => {
    expect(r.publicaciones.map((p) => p.formato)).toEqual(["Imagen", "Carrusel"]);
  });

  it("usa la interacción que declara la fuente y, si no viene, la suma", () => {
    expect(r.publicaciones[0].interacciones).toBe(120);
    expect(r.publicaciones[1].interacciones).toBe(50 + 4 + 2 + 1);
  });

  it("junta campañas y etiquetas, y deja null si no hay ninguna", () => {
    expect(r.publicaciones[0].campanas).toBe("xi ideal");
    expect(r.publicaciones[1].campanas).toBeNull();
  });
});
