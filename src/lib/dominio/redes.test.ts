import { describe, expect, it } from "vitest";
import {
  categoriasDeRed,
  type Cuenta,
  esCategoriaValidaEnRed,
  esRed,
  ordenarCuentas,
  porRed,
  REDES,
  tieneAlcanceRed,
  usuarioVisible,
} from "./redes";
import {
  categoriasDe,
  esCategoriaValida,
  PLATAFORMAS,
  RED_DE_PLATAFORMA,
  tieneAlcance,
} from "./plataformas";

function cuenta(p: Partial<Cuenta>): Cuenta {
  return {
    id: crypto.randomUUID(),
    nombre: "Cuenta",
    usuario: null,
    red: "Instagram",
    es_influencer: false,
    activa: true,
    orden: 100,
    ...p,
  };
}

describe("§3.2 — categorías por red", () => {
  it("Instagram tiene tipo y formato", () => {
    expect(categoriasDeRed("Instagram")).toEqual([
      "Reactivo",
      "Normal",
      "Imagen",
      "Reel",
      "Carrusel",
    ]);
  });

  it("TikTok solo tiene Video", () => {
    expect(categoriasDeRed("TikTok")).toEqual(["Video"]);
  });

  it("rechaza categorías de otra red", () => {
    expect(esCategoriaValidaEnRed("YouTube", "Carrusel")).toBe(false);
    expect(esCategoriaValidaEnRed("TikTok", "Reel")).toBe(false);
    expect(esCategoriaValidaEnRed("Twitter/X", "Short")).toBe(false);
  });

  it("acepta las propias, y null siempre", () => {
    expect(esCategoriaValidaEnRed("YouTube", "Short")).toBe(true);
    expect(esCategoriaValidaEnRed("Instagram", "Carrusel")).toBe(true);
    expect(esCategoriaValidaEnRed("TikTok", null)).toBe(true);
  });
});

describe("§9.6 — solo YouTube queda sin alcance", () => {
  it("lo distingue por red", () => {
    expect(tieneAlcanceRed("YouTube")).toBe(false);
    for (const red of REDES.filter((r) => r !== "YouTube")) {
      expect(tieneAlcanceRed(red), red).toBe(true);
    }
  });
});

/**
 * El módulo viejo tiene que seguir respondiendo exactamente igual, porque
 * media aplicación todavía lo usa. Y sobre todo: no puede tener las reglas
 * duplicadas, tiene que delegarlas a la red.
 */
describe("las cinco cuentas originales siguen dando el mismo resultado", () => {
  it("cada plataforma delega en su red", () => {
    for (const p of PLATAFORMAS) {
      const red = RED_DE_PLATAFORMA[p];
      expect(categoriasDe(p), p).toEqual(categoriasDeRed(red));
      expect(tieneAlcance(p), p).toBe(tieneAlcanceRed(red));
    }
  });

  it("mantiene las respuestas que ya daba", () => {
    expect(esCategoriaValida("Instagram DLT", "Carrusel")).toBe(true);
    expect(esCategoriaValida("YouTube", "Reel")).toBe(false);
    expect(esCategoriaValida("TikTok", "Video")).toBe(true);
    expect(tieneAlcance("YouTube")).toBe(false);
    expect(tieneAlcance("TikTok")).toBe(true);
  });

  it("las dos cuentas de Instagram comparten red y categorías", () => {
    expect(RED_DE_PLATAFORMA["Instagram DBF"]).toBe("Instagram");
    expect(categoriasDe("Instagram DBF")).toEqual(categoriasDe("Instagram DLT"));
  });
});

describe("esRed", () => {
  it("acepta las cuatro y rechaza el resto", () => {
    expect(esRed("Instagram")).toBe(true);
    expect(esRed("Twitter/X")).toBe(true);
    // El nombre de una cuenta no es una red.
    expect(esRed("Instagram DLT")).toBe(false);
    expect(esRed("Kick")).toBe(false);
    expect(esRed(null)).toBe(false);
  });
});

describe("presentación de cuentas", () => {
  it("las propias van antes que las de influencers", () => {
    const orden = ordenarCuentas([
      cuenta({ nombre: "DiegoAT", es_influencer: true, orden: 1 }),
      cuenta({ nombre: "Instagram DLT", orden: 1 }),
      cuenta({ nombre: "DLT Running", es_influencer: true, orden: 2 }),
      cuenta({ nombre: "Instagram DBF", orden: 2 }),
    ]);
    expect(orden.map((c) => c.nombre)).toEqual([
      "Instagram DLT",
      "Instagram DBF",
      "DiegoAT",
      "DLT Running",
    ]);
  });

  it("agrupa por red y omite las redes sin cuentas", () => {
    const grupos = porRed([
      cuenta({ nombre: "DiegoAT", red: "TikTok", es_influencer: true }),
      cuenta({ nombre: "Instagram DLT", red: "Instagram" }),
    ]);
    expect(grupos.map((g) => g.red)).toEqual(["Instagram", "TikTok"]);
    expect(grupos[1].cuentas.map((c) => c.nombre)).toEqual(["DiegoAT"]);
  });

  it("le pone el arroba al handle, y deja los nombres en paz", () => {
    expect(usuarioVisible(cuenta({ usuario: "diegoat" }))).toBe("@diegoat");
    expect(usuarioVisible(cuenta({ usuario: "@dltsports" }))).toBe("@dltsports");
    expect(usuarioVisible(cuenta({ usuario: "Cuenta DLT" }))).toBe("Cuenta DLT");
    expect(usuarioVisible(cuenta({ usuario: null }))).toBeNull();
    expect(usuarioVisible(cuenta({ usuario: "  " }))).toBeNull();
  });
});
