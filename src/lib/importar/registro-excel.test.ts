/**
 * Se prueba contra la hoja REGISTRO real del Excel de KPIs, con toda su
 * suciedad: "TOTAL" como categoría, TikTok etiquetado con categorías que no
 * tiene, guiones literales y una fila de YouTube con alcance.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { bufferEjemplo, hayEjemplos } from "./archivos-de-ejemplo";
import { leerRegistroExcel, type ResultadoRegistroExcel } from "./registro-excel";

const describir = hayEjemplos("excelKpis") ? describe : describe.skip;

let r: ResultadoRegistroExcel;

beforeAll(() => {
  if (!hayEjemplos("excelKpis")) return;
  r = leerRegistroExcel(bufferEjemplo("excelKpis"));
}, 120_000);

describir("lectura de la hoja REGISTRO", () => {
  it("encuentra la hoja y los encabezados solo", () => {
    expect(r.filas.length).toBeGreaterThan(200);
  });

  it("cubre los 19 días cargados a mano, de agosto y septiembre", () => {
    expect(r.fechas).toHaveLength(19);
    expect(r.fechas[0]).toBe("2026-08-12");
    expect(r.fechas.at(-1)).toBe("2026-09-08");
  });

  it("importa 234 de las 235 filas con fecha", () => {
    // La única que queda fuera es la fila 8: Instagram DBF sin publicaciones y
    // sin ninguna métrica.
    expect(r.filas).toHaveLength(234);
    expect(r.descartadas).toHaveLength(1);
    expect(r.descartadas[0].motivo).toBe("Sin publicaciones");
    expect(r.descartadas[0].filaExcel).toBe(8);
  });

  it("reporta el número de fila real del Excel, no el de un arreglo compactado", () => {
    // La fila de Instagram que decía "TOTAL" es la 7 del Excel.
    const exTotal = r.filas
      .filter((f) => f.correcciones.some((c) => c.includes('"TOTAL"')))
      .map((f) => f.filaExcel);
    expect(exTotal).toEqual([7]);

    // Las de TikTok deducidas como Video son las filas 5, 66, 238 y 239.
    const deducidas = r.filas
      .filter((f) => f.correcciones.some((c) => c.startsWith("TikTok solo puede ser")))
      .map((f) => f.filaExcel);
    expect(deducidas).toEqual([5, 66, 238, 239]);
  });

  it("solo usa plataformas y categorías válidas", () => {
    for (const f of r.filas) {
      if (f.plataforma === "TikTok") expect(f.categoria).toBe("Video");
      if (f.plataforma === "YouTube") {
        expect(["Short", "Video", null]).toContain(f.categoria);
      }
    }
  });
});

describir("limpieza de los datos sucios", () => {
  it('deja sin categoría la fila de Instagram que decía "TOTAL"', () => {
    // En Instagram hay cinco categorías posibles: no se puede deducir cuál era.
    const total = r.correcciones.find((c) => c.motivo.includes('"TOTAL"'));
    expect(total?.veces).toBe(1);
    const sinCategoria = r.filas.filter(
      (f) => f.plataforma === "Instagram DLT" && f.categoria === null,
    );
    expect(sinCategoria).toHaveLength(1);
  });

  it("deduce Video en TikTok, porque es su única categoría posible", () => {
    // El Excel traía "TOTAL" (2), "Reactivo" (1) y "Carrusel" (1) en TikTok.
    const tiktok = r.correcciones.find((c) => c.motivo.startsWith("TikTok solo puede ser"));
    expect(tiktok?.veces).toBe(4);

    const filas = r.filas.filter((f) => f.plataforma === "TikTok");
    expect(filas).toHaveLength(35);
    expect(filas.every((f) => f.categoria === "Video")).toBe(true);
  });

  it("§9.6 — le quita el alcance a YouTube y conserva las visualizaciones", () => {
    const yt = r.filas.filter((f) => f.plataforma === "YouTube");
    expect(yt).toHaveLength(1);
    expect(yt[0].alcance).toBeNull();
    expect(yt[0].visualizaciones).toBe(9_900);
    expect(r.correcciones.some((c) => c.motivo.includes("YouTube no entrega alcance"))).toBe(true);
  });

  it("§9.4 — los guiones literales se leen como sin dato, no como cero", () => {
    // Las dos filas de TikTok del 8 de septiembre traen "-" en varias columnas.
    const conGuion = r.filas.filter(
      (f) => f.fecha === "2026-09-08" && f.plataforma === "TikTok" && f.alcance !== null,
    );
    expect(conGuion.length).toBeGreaterThan(0);
    for (const f of conGuion) {
      expect(f.visualizaciones).toBeNull();
      expect(f.interacciones).toBeNull();
      expect(f.nuevos_seguidores).toBeNull();
    }
  });

  it("rescata las 29 filas que sí traen métricas de perfil", () => {
    const conPerfil = r.filas.filter(
      (f) =>
        f.visitas_perfil !== null ||
        f.vistas_seguidores !== null ||
        f.vistas_no_seguidores !== null,
    );
    // En la hoja hay 33 filas con algo en esas columnas, pero 4 traen un guion
    // literal: eso es "sin dato", no un valor (§9.4).
    expect(conPerfil).toHaveLength(29);
  });

  it("importa las filas sin métricas, que igual aportan publicaciones", () => {
    const soloConteo = r.filas.filter((f) =>
      f.correcciones.some((c) => c.startsWith("Fila sin métricas")),
    );
    expect(soloConteo).toHaveLength(1);
    expect(soloConteo[0].publicaciones).toBeGreaterThanOrEqual(1);
  });

  it("anota cada corrección para poder mostrarlas", () => {
    const conCorrecciones = r.filas.filter((f) => f.correcciones.length > 0);
    // 4 de TikTok + 1 de "TOTAL" + 1 de YouTube + 1 sin métricas
    expect(conCorrecciones).toHaveLength(7);
    expect(r.correcciones.map((c) => c.veces)).toEqual([4, 1, 1, 1]);
  });
});

describir("una fila concreta, para verificar el mapeo de columnas", () => {
  it("lee bien la primera fila de Instagram DLT del 13 de agosto", () => {
    const f = r.filas.find(
      (x) => x.fecha === "2026-08-13" && x.plataforma === "Instagram DLT",
    )!;
    expect(f.categoria).toBe("Reactivo");
    expect(f.publicaciones).toBe(3);
    expect(f.alcance).toBe(24_000);
    expect(f.visualizaciones).toBe(25_555);
    expect(f.interacciones).toBe(160_000);
    expect(f.nuevos_seguidores).toBe(10);
  });

  it("no confunde la columna Alcance/post con Alcance", () => {
    // Alcance/post es una columna calculada del Excel: 24.000/3 = 8.000. Si la
    // hubiéramos leído como alcance, este valor sería 8.000.
    const f = r.filas.find(
      (x) => x.fecha === "2026-08-13" && x.plataforma === "Instagram DLT",
    )!;
    expect(f.alcance).not.toBe(8_000);
  });
});
