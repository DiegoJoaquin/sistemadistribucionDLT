import { describe, expect, it } from "vitest";
import {
  construirLinea,
  construirLineaPerfil,
  delta,
  engagement,
  type FilaCalculo,
  pctNoSeguidores,
  promedioPorPublicacion,
} from "./calculo";
import { esCategoriaValida } from "./plataformas";

function fila(p: Partial<FilaCalculo>): FilaCalculo {
  return {
    plataforma: "Instagram DLT",
    categoria: null,
    publicaciones: 1,
    alcance: null,
    visualizaciones: null,
    interacciones: null,
    nuevos_seguidores: null,
    visitas_perfil: null,
    vistas_seguidores: null,
    vistas_no_seguidores: null,
    ...p,
  };
}

describe("§9.1 — los valores del día son promedios por publicación, nunca sumas", () => {
  it("divide la suma de la métrica por la suma de publicaciones", () => {
    const filas = [
      fila({ publicaciones: 2, alcance: 20_000 }),
      fila({ publicaciones: 3, alcance: 30_000 }),
    ];
    // 50.000 / 5 publicaciones = 10.000, no 25.000 (promedio de filas) ni 50.000 (suma)
    expect(promedioPorPublicacion(filas, "alcance")).toBe(10_000);
  });

  it("reproduce el bug del Excel: comparar la suma del día contra el promedio del mes infla el delta", () => {
    const baseProm = 70_170.36667; // línea base agosto, Instagram DLT TOTAL
    const publicaciones = 14;
    const sumaDelDia = 672_933.8;

    const filas = [fila({ publicaciones, alcance: sumaDelDia })];
    const promDia = promedioPorPublicacion(filas, "alcance")!;

    const correcto = delta(promDia, baseProm)!;
    const bugDelExcel = delta(sumaDelDia, baseProm)!;

    expect(correcto).toBeCloseTo(-0.315, 3); // -31,5% — el valor real
    expect(bugDelExcel).toBeCloseTo(8.59, 2); // +859% — lo que mostraba el Excel
    // El factor de inflado es exactamente el número de publicaciones.
    expect((1 + bugDelExcel) / (1 + correcto)).toBeCloseTo(publicaciones, 6);
  });
});

describe("§9.4 — sin dato no es cero", () => {
  it("una métrica ausente devuelve null, no 0", () => {
    const filas = [fila({ publicaciones: 3, alcance: 9_000 })];
    expect(promedioPorPublicacion(filas, "nuevos_seguidores")).toBeNull();
  });

  it("las filas sin la métrica no diluyen el denominador", () => {
    const filas = [
      fila({ publicaciones: 2, alcance: 20_000 }),
      fila({ publicaciones: 8, alcance: null }), // no reportó alcance
    ];
    // 20.000 / 2 = 10.000. Si contáramos las 8 publicaciones sin dato: 2.000.
    expect(promedioPorPublicacion(filas, "alcance")).toBe(10_000);
  });

  it("un cero real sí cuenta como dato", () => {
    const filas = [fila({ publicaciones: 4, nuevos_seguidores: 0 })];
    expect(promedioPorPublicacion(filas, "nuevos_seguidores")).toBe(0);
  });
});

describe("§4.1 / §4.2 — deltas", () => {
  it("compara promedio del día contra promedio de la base", () => {
    expect(delta(48_066.7, 70_170.36667)).toBeCloseTo(-0.315, 3);
  });

  it("devuelve null (guion en la interfaz) cuando no hay línea base", () => {
    expect(delta(1_000, null)).toBeNull();
    expect(delta(1_000, 0)).toBeNull();
  });

  it("devuelve null cuando el día no tiene el dato", () => {
    expect(delta(null, 70_170)).toBeNull();
  });
});

describe("§9.2 — el TOTAL no se calcula sumando categorías", () => {
  const filas: FilaCalculo[] = [
    fila({ plataforma: "Instagram DLT", categoria: "Reactivo", publicaciones: 2, alcance: 200_000 }),
    fila({ plataforma: "Instagram DLT", categoria: "Normal", publicaciones: 3, alcance: 150_000 }),
    fila({ plataforma: "Instagram DLT", categoria: "Reel", publicaciones: 5, alcance: 400_000 }),
    fila({ plataforma: "TikTok", categoria: null, publicaciones: 4, alcance: 800_000 }),
  ];

  it("toma todas las filas de la plataforma sin filtrar por categoría", () => {
    const total = construirLinea(filas, "Instagram DLT", null, null);
    expect(total.publicaciones).toBe(10);
    expect(total.dia.alcance).toBe(75_000); // 750.000 / 10
  });

  it("no mezcla plataformas", () => {
    const tiktok = construirLinea(filas, "TikTok", null, null);
    expect(tiktok.publicaciones).toBe(4);
    expect(tiktok.dia.alcance).toBe(200_000);
  });

  it("sumar las categorías da un resultado distinto (y equivocado)", () => {
    const reactivo = construirLinea(filas, "Instagram DLT", "Reactivo", null);
    const normal = construirLinea(filas, "Instagram DLT", "Normal", null);
    const reel = construirLinea(filas, "Instagram DLT", "Reel", null);
    const sumaDeCategorias =
      reactivo.dia.alcance! + normal.dia.alcance! + reel.dia.alcance!;
    const total = construirLinea(filas, "Instagram DLT", null, null);
    expect(sumaDeCategorias).not.toBeCloseTo(total.dia.alcance!, 5);
  });
});

describe("§9.6 — YouTube no tiene alcance", () => {
  it("calcula el engagement sobre visualizaciones", () => {
    const filas = [
      fila({
        plataforma: "YouTube",
        categoria: "Short",
        publicaciones: 1,
        alcance: null,
        visualizaciones: 75_898,
        interacciones: 1_497,
      }),
    ];
    expect(engagement(filas, "YouTube")).toBeCloseTo(1_497 / 75_898, 10);
  });

  it("marca el engagement de YouTube como no comparable", () => {
    const yt = construirLinea([], "YouTube", null, null);
    const ig = construirLinea([], "Instagram DLT", null, null);
    expect(yt.engagementNoComparable).toBe(true);
    expect(ig.engagementNoComparable).toBe(false);
  });

  it("en el resto de plataformas usa alcance", () => {
    const filas = [
      fila({ publicaciones: 1, alcance: 179_892, visualizaciones: 259_088, interacciones: 12_499 }),
    ];
    // Fila real de DBF del 01-08-2026: engagement del Excel = 0,06948057724
    expect(engagement(filas, "Instagram DLT")).toBeCloseTo(0.06948057724, 9);
  });
});

describe("engagement como razón de sumas", () => {
  it("no es el promedio de las razones por fila", () => {
    const filas = [
      fila({ publicaciones: 1, alcance: 1_000, interacciones: 100 }), // 10%
      fila({ publicaciones: 1, alcance: 9_000, interacciones: 180 }), // 2%
    ];
    expect(engagement(filas, "Instagram DLT")).toBeCloseTo(280 / 10_000, 10); // 2,8%
    // El promedio de razones daría 6% y sobrerrepresentaría a la publicación chica.
  });
});

describe("§9.3 — categorías válidas por plataforma", () => {
  it("acepta las categorías de cada plataforma", () => {
    expect(esCategoriaValida("Instagram DLT", "Carrusel")).toBe(true);
    expect(esCategoriaValida("YouTube", "Short")).toBe(true);
    expect(esCategoriaValida("Twitter/X", "Foto")).toBe(true);
    expect(esCategoriaValida("TikTok", "Video")).toBe(true); // única de TikTok
  });

  it("rechaza las que no corresponden", () => {
    expect(esCategoriaValida("YouTube", "Reel")).toBe(false);
    expect(esCategoriaValida("TikTok", "Reactivo")).toBe(false);
    expect(esCategoriaValida("TikTok", "Carrusel")).toBe(false);
    expect(esCategoriaValida("Twitter/X", "Short")).toBe(false);
  });

  it("null siempre es válido: es la fila TOTAL de cada plataforma", () => {
    expect(esCategoriaValida("TikTok", null)).toBe(true);
    expect(esCategoriaValida("Instagram DLT", null)).toBe(true);
  });
});

describe("§4.3 — métricas de perfil", () => {
  it("promedia por publicación y calcula el % de no seguidores", () => {
    const filas = [
      fila({
        plataforma: "Instagram DLT",
        publicaciones: 2,
        visitas_perfil: 400,
        vistas_seguidores: 20_000,
        vistas_no_seguidores: 60_000,
      }),
    ];
    const linea = construirLineaPerfil(filas, "Instagram DLT");
    expect(linea.visitas_perfil).toBe(200);
    expect(linea.vistas_seguidores).toBe(10_000);
    expect(linea.vistas_no_seguidores).toBe(30_000);
    expect(linea.pct_no_seguidores).toBeCloseTo(0.75, 10);
  });

  it("marca sinDatos cuando no se ingresó nada a mano", () => {
    const filas = [fila({ publicaciones: 3, alcance: 30_000 })];
    expect(construirLineaPerfil(filas, "Instagram DLT").sinDatos).toBe(true);
  });

  it("el % de no seguidores es null si falta una de las dos vistas", () => {
    expect(pctNoSeguidores(null, 100)).toBeNull();
    expect(pctNoSeguidores(100, null)).toBeNull();
    expect(pctNoSeguidores(0, 0)).toBeNull();
  });
});

describe("estados vacíos", () => {
  it("un día sin filas devuelve sinDatos y todo en null", () => {
    const linea = construirLinea([], "Instagram DBF", null, {
      n_publicaciones: 35,
      alcance_prom: 39_128,
      visualizaciones_prom: 60_359,
      interacciones_prom: 2_000,
      nuevos_seguidores_prom: 18,
      engagement_prom: 0.05,
    });
    expect(linea.sinDatos).toBe(true);
    expect(linea.publicaciones).toBe(0);
    expect(linea.dia.alcance).toBeNull();
    expect(linea.deltas.alcance).toBeNull(); // guion, no -100%
  });
});
