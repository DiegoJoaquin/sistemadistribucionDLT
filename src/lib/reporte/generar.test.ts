/**
 * El reporte diario no tenía tests, y así fue como se quedó sin la sección de
 * métricas de perfil sin que nada avisara.
 */
import { describe, expect, it } from "vitest";
import {
  construirLinea,
  construirLineaPerfil,
  type FilaCalculo,
} from "@/lib/dominio/calculo";
import { ORDEN_PLATAFORMAS } from "@/lib/dominio/plataformas";
import type { PanelDiario } from "@/lib/datos/consultas";
import { construirReporte, htmlCorreo, textoPlano } from "./generar";

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

/** Arma el panel igual que `panelDelDia`, pero sin base de datos. */
function panel(filas: FilaCalculo[]): PanelDiario {
  return {
    fecha: "2026-09-10",
    base: null,
    bloques: ORDEN_PLATAFORMAS.map((plataforma) => ({
      plataforma,
      total: construirLinea(filas, plataforma, null, null),
      categorias: [],
      sinDatos: !filas.some((f) => f.plataforma === plataforma),
    })),
    perfil: [
      ...ORDEN_PLATAFORMAS.map((p) => construirLineaPerfil(filas, p)),
      construirLineaPerfil(filas, "TOTAL"),
    ],
    hayAlgo: filas.length > 0,
  };
}

const DIA_CON_PERFIL: FilaCalculo[] = [
  fila({
    plataforma: "Instagram DLT",
    categoria: "Reel",
    publicaciones: 2,
    alcance: 90_000,
    visitas_perfil: 400,
    vistas_seguidores: 20_000,
    vistas_no_seguidores: 60_000,
  }),
  fila({
    plataforma: "Instagram DBF",
    categoria: "Reel",
    publicaciones: 1,
    alcance: 40_000,
    vistas_seguidores: 5_000,
    vistas_no_seguidores: 5_000,
  }),
  // TikTok tuvo actividad pero nadie cargó métricas de perfil.
  fila({ plataforma: "TikTok", categoria: "Video", publicaciones: 3, alcance: 60_000 }),
];

describe("métricas de perfil en el modelo del reporte", () => {
  const r = construirReporte(panel(DIA_CON_PERFIL), [], null);

  it("incluye las plataformas con métricas de perfil cargadas", () => {
    const dlt = r.perfil.find((l) => l.plataforma === "Instagram DLT")!;
    expect(dlt.publicaciones).toBe(2);
    expect(dlt.visitas_perfil).toBe(200);
    expect(dlt.vistas_seguidores).toBe(10_000);
    expect(dlt.vistas_no_seguidores).toBe(30_000);
    expect(dlt.pct_no_seguidores).toBeCloseTo(0.75, 10);
  });

  it("deja fuera las plataformas donde no se cargaron, en vez de mostrar guiones", () => {
    expect(r.perfil.map((l) => l.plataforma)).not.toContain("TikTok");
    expect(r.perfil.map((l) => l.plataforma)).not.toContain("YouTube");
  });

  it("agrega el TOTAL cuando hay más de una plataforma", () => {
    expect(r.perfil.at(-1)?.plataforma).toBe("TOTAL");
  });

  it("el TOTAL suma solo las publicaciones de las filas que se muestran", () => {
    // Instagram DLT 2 + Instagram DBF 1. Las 3 de TikTok no tienen métricas de
    // perfil, no aparecen en la tabla, y no pueden inflar el total: en el correo
    // se vería como una suma mal hecha.
    const total = r.perfil.find((l) => l.plataforma === "TOTAL")!;
    const filasVisibles = r.perfil.filter((l) => l.plataforma !== "TOTAL");
    expect(total.publicaciones).toBe(3);
    expect(total.publicaciones).toBe(
      filasVisibles.reduce((a, l) => a + l.publicaciones, 0),
    );
  });

  it("los promedios del TOTAL no cambian al corregir el conteo", () => {
    const total = r.perfil.find((l) => l.plataforma === "TOTAL")!;
    // (20.000 + 5.000) / 3 publicaciones con esa métrica
    expect(total.vistas_seguidores).toBeCloseTo(25_000 / 3, 6);
    // (60.000 + 5.000) / 3
    expect(total.vistas_no_seguidores).toBeCloseTo(65_000 / 3, 6);
  });

  it("no repite el TOTAL cuando hay una sola plataforma", () => {
    const solo = construirReporte(panel([DIA_CON_PERFIL[0]]), [], null);
    expect(solo.perfil.map((l) => l.plataforma)).toEqual(["Instagram DLT"]);
  });

  it("queda vacío si ese día nadie cargó métricas de perfil", () => {
    const sin = construirReporte(panel([DIA_CON_PERFIL[2]]), [], null);
    expect(sin.perfil).toEqual([]);
  });
});

describe("métricas de perfil en el correo", () => {
  const html = htmlCorreo(construirReporte(panel(DIA_CON_PERFIL), [], null));

  it("trae la sección con sus columnas", () => {
    expect(html).toContain("Métricas de perfil del día");
    expect(html).toContain("Vistas seguidores");
    expect(html).toContain("Vistas no seguidores");
    expect(html).toContain("% no seguidores");
  });

  it("muestra los promedios en formato chileno", () => {
    expect(html).toContain("10.000"); // vistas de seguidores por publicación
    expect(html).toContain("30.000"); // vistas de no seguidores
    expect(html).toContain("75,0%"); // % de no seguidores de Instagram DLT
    expect(html).toContain("50,0%"); // % de no seguidores de Instagram DBF
  });

  it("explica por qué no hay variación (§9.7)", () => {
    expect(html).toMatch(/todavía no tienen línea base/);
  });

  it("va entre los KPIs y la lectura del día", () => {
    const kpis = html.indexOf("KPIs del día por plataforma");
    const perfil = html.indexOf("Métricas de perfil del día");
    expect(kpis).toBeGreaterThan(-1);
    expect(perfil).toBeGreaterThan(kpis);
  });

  it("dice explícitamente cuando no hay datos de perfil (§8)", () => {
    const sin = htmlCorreo(construirReporte(panel([DIA_CON_PERFIL[2]]), [], null));
    expect(sin).toContain("No se cargaron métricas de perfil para este día.");
  });
});

describe("métricas de perfil en el texto plano", () => {
  it("trae la sección con cada plataforma", () => {
    const t = textoPlano(construirReporte(panel(DIA_CON_PERFIL), [], null));
    expect(t).toContain("MÉTRICAS DE PERFIL DEL DÍA");
    expect(t).toContain("Instagram DLT (2 publicaciones)");
    expect(t).toContain("Vistas de seguidores: 10.000");
    expect(t).toContain("% de no seguidores: 75,0%");
  });
});
