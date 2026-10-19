/**
 * Los mejores reels de un cliente. Lo que importa: que una colaboración no
 * aparezca dos veces, que un reel con el hashtag del cliente en segundo lugar
 * entre igual, y que lo que no es reel no se cuele.
 */
import { describe, expect, it } from "vitest";
import { claveEnlace, engagementDe, mejoresReels, type Reel, sinDuplicados } from "./mejores";

let n = 0;
function reel(p: Partial<Reel> = {}): Reel {
  n += 1;
  return {
    id: `r${n}`,
    fecha: "2026-05-10",
    cuentaId: "ig",
    cuenta: "Instagram DLT",
    red: "Instagram",
    categoria: "Reel",
    hashtags: ["ELLIVINGDELTEAMCHILE"],
    titulo: `Reel ${n}`,
    enlace: `https://www.instagram.com/reel/${n}/`,
    visualizaciones: 1_000,
    alcance: 800,
    interacciones: 80,
    me_gusta: 60,
    comentarios: 5,
    compartidos: 10,
    guardados: 5,
    ...p,
  };
}

const LIVING = { nombre: "Living", hashtags: ["ELLIVINGDELTEAMCHILE"] };
const ANIO = { desde: "2026-01-01", hasta: "2026-10-19" };

describe("mejoresReels", () => {
  it("ordena por la métrica elegida y corta en N, por red", () => {
    const reels = [
      reel({ visualizaciones: 500 }),
      reel({ visualizaciones: 9_000 }),
      reel({ visualizaciones: 3_000 }),
      reel({ red: "TikTok", categoria: "Video", cuentaId: "tt", visualizaciones: 7_000, enlace: "https://tiktok.com/v/1" }),
    ];
    const m = mejoresReels(reels, LIVING, ANIO, "visualizaciones", 2);
    const ig = m.redes.find((r) => r.red === "Instagram")!;
    expect(ig.mejores.map((r) => r.visualizaciones)).toEqual([9_000, 3_000]);
    expect(ig.total).toBe(3);
    expect(m.redes.find((r) => r.red === "TikTok")!.mejores).toHaveLength(1);
  });

  it("solo reels en Instagram; en TikTok, todo", () => {
    const reels = [
      reel({ categoria: "Carrusel", visualizaciones: 99_000 }),
      reel({ categoria: "Reel", visualizaciones: 1_000 }),
      reel({ red: "TikTok", categoria: "Video", enlace: "https://tiktok.com/v/2" }),
      reel({ red: "YouTube", categoria: "Short", enlace: "https://youtube.com/s/1" }),
    ];
    const m = mejoresReels(reels, LIVING, ANIO, "visualizaciones");
    expect(m.redes.map((r) => [r.red, r.total])).toEqual([
      ["Instagram", 1],
      ["TikTok", 1],
    ]);
  });

  it("entra si lleva el hashtag del cliente aunque no sea el primero", () => {
    const m = mejoresReels(
      [reel({ hashtags: ["OTRASERIE", "ELLIVINGDELTEAMCHILE"] }), reel({ hashtags: ["OTRASERIE"] })],
      LIVING,
      ANIO,
      "visualizaciones",
    );
    expect(m.redes[0].total).toBe(1);
  });

  it("una colaboración en dos cuentas cuenta una vez", () => {
    const enlace = "https://www.instagram.com/reel/ABC/";
    const m = mejoresReels(
      [
        reel({ enlace, cuentaId: "living", cuenta: "Living", visualizaciones: 40_000 }),
        reel({ enlace: enlace + "?igsh=x", cuentaId: "ig", visualizaciones: 41_000 }),
      ],
      LIVING,
      ANIO,
      "visualizaciones",
    );
    expect(m.redes[0].total).toBe(1);
    expect(m.redes[0].mejores[0].visualizaciones).toBe(41_000);
  });

  it("§9.4 — sin la métrica no entra al ranking, y se cuenta aparte", () => {
    const m = mejoresReels([reel({ compartidos: null }), reel({ compartidos: 3 })], LIVING, ANIO, "compartidos");
    expect(m.redes[0].mejores).toHaveLength(1);
    expect(m.redes[0].sinMetrica).toBe(1);
  });

  it("respeta el período", () => {
    const m = mejoresReels([reel({ fecha: "2025-12-31" }), reel({ fecha: "2026-01-01" })], LIVING, ANIO, "visualizaciones");
    expect(m.redes[0].total).toBe(1);
  });

  it("sin reels del cliente no hay datos", () => {
    expect(mejoresReels([reel({ hashtags: [] })], LIVING, ANIO, "visualizaciones").hayDatos).toBe(false);
  });
});

describe("piezas", () => {
  it("claveEnlace ignora parámetros, barra final y mayúsculas", () => {
    expect(claveEnlace("https://www.instagram.com/reel/AbC/?igsh=1")).toBe(claveEnlace("https://www.instagram.com/reel/abc"));
    expect(claveEnlace(null)).toBeNull();
  });

  it("los reels sin enlace no se fusionan entre sí", () => {
    expect(sinDuplicados([reel({ enlace: null }), reel({ enlace: null })])).toHaveLength(2);
  });

  it("engagement sobre alcance", () => {
    expect(engagementDe(reel({ interacciones: 50, alcance: 1_000 }))).toBeCloseTo(0.05);
    expect(engagementDe(reel({ alcance: null }))).toBeNull();
  });
});
