/**
 * Los importadores se prueban contra los archivos de exportación REALES que
 * están en la carpeta del proyecto, y los agregados se contrastan con los
 * números que el Excel ya calculó para agosto 2026. Si un lector se rompe, el
 * promedio deja de calzar y el test lo cacha.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  bufferEjemplo,
  EJEMPLOS,
  hayEjemplos,
  MOTIVO_SIN_EJEMPLOS,
  type NombreEjemplo,
} from "./archivos-de-ejemplo";
import { leerArchivo } from "./parsers";
import type { ResultadoImport } from "./tipos";
import { mesDe } from "./util";

const describir = hayEjemplos() ? describe : describe.skip;
if (!hayEjemplos()) console.warn(`Tests de importación salteados: ${MOTIVO_SIN_EJEMPLOS}.`);

function leer(cual: NombreEjemplo): ResultadoImport {
  return leerArchivo(EJEMPLOS[cual], bufferEjemplo(cual));
}

function soloAgosto(r: ResultadoImport) {
  return r.publicaciones.filter((p) => p.publicado_en && mesDe(p.publicado_en) === "2026-08");
}

const prom = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x !== null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

describir("Meta Business Suite CSV — Instagram DBF", () => {
  let r: ResultadoImport;
  beforeAll(() => {
    r = leer("dbfMeta");
  });

  it("detecta la cuenta y la red desde el archivo", () => {
    expect(r.cuenta).toBe("debuenafuente.dlt");
    expect(r.detectada).toEqual({ usuario: "debuenafuente.dlt", red: "Instagram" });
    expect(r.fuente).toBe("meta");
  });

  it("lee las 37 publicaciones de agosto, incluidas las 2 sin alcance", () => {
    // El Excel tiene 35 filas: quien lo armó borró las 2 publicaciones que Meta
    // exportó sin alcance, y con eso les sacó también las visualizaciones, las
    // interacciones y los seguidores a la línea base. §9.4: sin dato no es cero,
    // pero tampoco es motivo para descartar el resto de la fila.
    const ago = soloAgosto(r);
    expect(ago).toHaveLength(37);
    expect(ago.filter((p) => p.alcance !== null)).toHaveLength(35);
    expect(ago.filter((p) => p.visualizaciones !== null)).toHaveLength(37);
    expect(r.meses).toEqual(["2026-08"]);
  });

  it("interpreta la fecha de Meta como MM/DD/YYYY", () => {
    const primera = [...soloAgosto(r)].sort((a, b) =>
      a.publicado_en!.localeCompare(b.publicado_en!),
    )[0];
    // El Excel muestra esta fila como 01-08-2026 07:51
    expect(primera.publicado_en).toBe("2026-08-01T07:51:00");
    expect(primera.formato).toBe("Reel");
    expect(primera.visualizaciones).toBe(259_088);
    expect(primera.alcance).toBe(179_892);
    expect(primera.nuevos_seguidores).toBe(116);
    // §5.1: interacciones = me gusta + comentarios + compartidos + guardados
    expect(primera.interacciones).toBe(12_499);
  });

  it("coincide con el promedio de alcance de la línea base del Excel", () => {
    // RESUMEN!C15 — Instagram DBF TOTAL agosto. Calza porque las 2 filas que el
    // Excel borró son justamente las que no traían alcance.
    expect(prom(soloAgosto(r).map((p) => p.alcance))).toBeCloseTo(39_128, 0);
  });
});

describir("Iconosquare XLSX — Instagram DLT", () => {
  let r: ResultadoImport;
  beforeAll(() => {
    r = leer("dltIconosquare");
  });

  it("detecta la cuenta y la red desde las celdas B1 y B2", () => {
    expect(r.cuenta).toBe("dltsports");
    expect(r.detectada).toEqual({ usuario: "dltsports", red: "Instagram" });
    expect(r.fuente).toBe("iconosquare");
  });

  it("lee las 270 publicaciones de agosto que usó el Excel", () => {
    expect(soloAgosto(r)).toHaveLength(270);
  });

  it("mapea los formatos de Iconosquare", () => {
    const ultima = [...soloAgosto(r)].sort((a, b) =>
      b.publicado_en!.localeCompare(a.publicado_en!),
    )[0];
    expect(ultima.publicado_en).toBe("2026-08-31T23:51:38");
    expect(ultima.formato).toBe("Reel"); // "reel"
    expect(ultima.interacciones).toBe(3_274); // Post engagement
    expect(ultima.visualizaciones).toBe(98_616);
    expect(ultima.alcance).toBe(61_365);
  });

  it("§5.1 — avisa que no trae nuevos seguidores ni duración", () => {
    expect(r.advertencias.join(" ")).toMatch(/nuevos seguidores/i);
    expect(soloAgosto(r).every((p) => p.nuevos_seguidores === null)).toBe(true);
  });

  it("coincide con los promedios de la línea base del Excel", () => {
    const ago = soloAgosto(r);
    // RESUMEN!C6 y D6 — Instagram DLT TOTAL agosto
    expect(prom(ago.map((p) => p.alcance))).toBeCloseTo(70_170.36667, 4);
    expect(prom(ago.map((p) => p.visualizaciones))).toBeCloseTo(139_201.5593, 3);
    expect(prom(ago.map((p) => p.interacciones))).toBeCloseTo(5_307.396296, 4);
  });

  it("coincide con los promedios por formato del Excel", () => {
    const ago = soloAgosto(r);
    const porFormato = (f: string) =>
      prom(ago.filter((p) => p.formato === f).map((p) => p.alcance));
    expect(porFormato("Imagen")).toBeCloseTo(78_033.19091, 4); // RESUMEN!C9
    expect(porFormato("Reel")).toBeCloseTo(67_714.8427, 4); // RESUMEN!C10
    expect(porFormato("Carrusel")).toBeCloseTo(61_066.57746, 4); // RESUMEN!C11
  });
});

describir("TikTok XLSX", () => {
  let r: ResultadoImport;
  beforeAll(() => {
    r = leer("tiktok");
  });

  it("detecta la red y etiqueta todo como Video, su única categoría", () => {
    expect(r.detectada.red).toBe("TikTok");
    expect(soloAgosto(r).every((p) => p.formato === "Video")).toBe(true);
    // Reactivo/Normal es solo de Instagram.
    expect(soloAgosto(r).every((p) => p.tipo === null)).toBe(true);
  });

  it("lee las 87 publicaciones de agosto que usó el Excel", () => {
    expect(soloAgosto(r)).toHaveLength(87);
  });

  it("suma las interacciones con favoritos", () => {
    const primera = [...soloAgosto(r)].sort((a, b) =>
      a.publicado_en!.localeCompare(b.publicado_en!),
    )[0];
    expect(primera.publicado_en).toBe("2026-08-01T10:53:20");
    expect(primera.visualizaciones).toBe(246_360);
    expect(primera.alcance).toBe(234_370);
    // 12.678 me gusta + 82 comentarios + 545 favoritos + 417 compartidos
    expect(primera.interacciones).toBe(13_722);
  });
});

describir("YouTube XLSX", () => {
  let r: ResultadoImport;
  beforeAll(() => {
    r = leer("youtube");
  });

  it("interpreta la fecha de YouTube como DD/MM/YYYY", () => {
    const ultima = [...soloAgosto(r)].sort((a, b) =>
      b.publicado_en!.localeCompare(a.publicado_en!),
    )[0];
    expect(ultima.publicado_en).toBe("2026-08-31T23:59:02");
    expect(ultima.formato).toBe("Video");
  });

  it("§9.6 — nunca asigna alcance", () => {
    expect(r.publicaciones.every((p) => p.alcance === null)).toBe(true);
    expect(r.advertencias.join(" ")).toMatch(/no entrega alcance/i);
  });

  it("mapea short y video", () => {
    const formatos = new Set(soloAgosto(r).map((p) => p.formato));
    expect(formatos).toEqual(new Set(["Short", "Video"]));
  });
});
