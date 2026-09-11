/**
 * Tests del reporte diario.
 *
 * Las métricas de perfil van dentro del bloque de KPIs de cada plataforma, con
 * el mismo formato de línea que Alcance, Visualizaciones e Interacciones. No en
 * una tabla aparte.
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

const DIA: FilaCalculo[] = [
  // Instagram DLT con las tres métricas de perfil cargadas.
  fila({
    plataforma: "Instagram DLT",
    categoria: "Reel",
    publicaciones: 2,
    alcance: 90_000,
    visitas_perfil: 400,
    vistas_seguidores: 20_000,
    vistas_no_seguidores: 60_000,
  }),
  // Instagram DBF con vistas, pero sin visitas al perfil: igual que en el Excel.
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

/** Recorta el bloque de una plataforma dentro del correo. */
function bloque(html: string, desde: string, hasta?: string): string {
  const i = html.indexOf(desde);
  expect(i, `no está el bloque de ${desde}`).toBeGreaterThan(-1);
  const j = hasta ? html.indexOf(hasta, i) : html.indexOf("</div>", i);
  return html.slice(i, j);
}

describe("métricas de perfil en el modelo del reporte", () => {
  const r = construirReporte(panel(DIA), [], null);

  it("trae el promedio por publicación de cada plataforma con datos", () => {
    const dlt = r.perfil.find((l) => l.plataforma === "Instagram DLT")!;
    expect(dlt.visitas_perfil).toBe(200);
    expect(dlt.vistas_seguidores).toBe(10_000);
    expect(dlt.vistas_no_seguidores).toBe(30_000);
    expect(dlt.pct_no_seguidores).toBeCloseTo(0.75, 10);
  });

  it("no incluye plataformas sin métricas de perfil ni una fila TOTAL", () => {
    expect(r.perfil.map((l) => l.plataforma)).toEqual(["Instagram DLT", "Instagram DBF"]);
  });
});

describe("métricas de perfil en el correo", () => {
  const html = htmlCorreo(construirReporte(panel(DIA), [], null));
  const dlt = bloque(html, "Instagram DLT", "Instagram DBF");
  const dbf = bloque(html, "Instagram DBF", "TikTok");
  const tiktok = bloque(html, "TikTok");

  it("no es una tabla aparte", () => {
    expect(html).not.toContain("Métricas de perfil del día");
    expect(html).not.toMatch(/<th[^>]*>Vistas seguidores/);
  });

  it("van dentro del bloque de la plataforma, después de los KPIs", () => {
    expect(dlt).toContain("Visitas al perfil:");
    expect(dlt.indexOf("Visitas al perfil:")).toBeGreaterThan(
      dlt.indexOf("Seguidores nuevos:"),
    );
  });

  it("usan el mismo formato de línea que los KPIs", () => {
    expect(dlt).toMatch(/Visitas al perfil:<\/span>\s*<strong[^>]*>200<\/strong>/);
    expect(dlt).toMatch(/Vistas de seguidores:<\/span>\s*<strong[^>]*>10\.000<\/strong>/);
    expect(dlt).toMatch(/Vistas de no seguidores:<\/span>\s*<strong[^>]*>30\.000<\/strong>/);
    expect(dlt).toMatch(/% de no seguidores:<\/span>\s*<strong[^>]*>75,0%<\/strong>/);
  });

  it("dicen que no tienen línea base, sin inventar una variación (§9.7)", () => {
    expect(dlt).toContain("(sin línea base)");
    expect(dlt).not.toMatch(/que promedio diario/);
  });

  it("muestran guion cuando falta la métrica, no cero (§9.4)", () => {
    expect(dbf).toMatch(/Visitas al perfil:<\/span>\s*<strong[^>]*>—<\/strong>/);
    expect(dbf).toMatch(/Vistas de seguidores:<\/span>\s*<strong[^>]*>5\.000<\/strong>/);
  });

  it("avisan cuando en una plataforma no se cargaron (§8)", () => {
    expect(tiktok).toContain("Métricas de perfil: no se cargaron");
    expect(tiktok).not.toContain("Visitas al perfil:");
  });
});

describe("métricas de perfil en el texto plano", () => {
  const t = textoPlano(construirReporte(panel(DIA), [], null));

  it("van dentro del bloque de cada plataforma, con el mismo formato", () => {
    expect(t).not.toContain("MÉTRICAS DE PERFIL DEL DÍA");
    expect(t).toContain("    Visitas al perfil: 200 (sin línea base)");
    expect(t).toContain("    Vistas de seguidores: 10.000 (sin línea base)");
    expect(t).toContain("    % de no seguidores: 75,0% (sin línea base)");
  });

  it("muestra guion sin nota cuando falta el dato", () => {
    const lineas = t.split("\n");
    expect(lineas).toContain("    Visitas al perfil: —");
  });

  it("avisa cuando en una plataforma no se cargaron", () => {
    const i = t.indexOf("  TikTok");
    expect(t.slice(i)).toContain("    Métricas de perfil: no se cargaron");
  });
});
