/**
 * El correo de mejores reels: que diga cuántos hay, que cada título lleve a la
 * publicación y que el texto del caption no rompa el HTML.
 */
import { describe, expect, it } from "vitest";
import { mejoresReels, type Reel } from "@/lib/dominio/mejores";
import { LIMITE_GMAIL_BYTES } from "./semanal";
import { htmlMejores, textoMejores, titularDe } from "./mejores";

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
    titulo: `🛋️#ELLIVINGDELTEAMCHILE | LA REINA DE LA ESCALADA ${n} <b>`,
    enlace: `https://www.instagram.com/reel/${n}/`,
    visualizaciones: 1_000 * n,
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

describe("htmlMejores", () => {
  const reels = Array.from({ length: 30 }, () => reel());
  const m = mejoresReels(reels, LIVING, ANIO, "visualizaciones");
  const html = htmlMejores(m, { urlBase: "https://kpis.example" });

  it("muestra los 10 y dice cuántos había", () => {
    expect((html.match(/instagram\.com\/reel\//g) ?? []).length).toBe(10);
    expect(html).toContain("30 reels de Living en el período");
  });

  it("escapa el texto del caption", () => {
    expect(html).not.toContain("<b>");
    expect(html).toContain("&lt;b&gt;");
  });

  it("dice cuando una red no tiene reels", () => {
    expect(html).toContain("No hay reels de Living en TikTok");
  });

  it("queda bajo el límite de Gmail", () => {
    expect(new TextEncoder().encode(html).length).toBeLessThan(LIMITE_GMAIL_BYTES);
  });

  it("el texto plano lleva los enlaces", () => {
    expect(textoMejores(m)).toContain("https://www.instagram.com/reel/30/");
  });
});

describe("titularDe", () => {
  it("saca el prefijo de la serie y corta los largos", () => {
    expect(titularDe(reel({ titulo: "🛋️#ELLIVINGDELTEAMCHILE | AFRONTANDO LA PRESIÓN 😔" }))).toBe("AFRONTANDO LA PRESIÓN 😔");
    expect(titularDe(reel({ titulo: "x".repeat(200) })).length).toBeLessThanOrEqual(89);
    expect(titularDe(reel({ titulo: null }))).toBe("Ver publicación");
  });
});
