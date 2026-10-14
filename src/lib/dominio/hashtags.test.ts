/**
 * Seguimiento de hashtags. Lo que importa: que una etiqueta se encuentre aunque
 * no sea la primera del caption, que un mes sin publicar sea un hueco y no un
 * cero, y que la comparación contra la cuenta no se compare consigo misma.
 */
import { describe, expect, it } from "vitest";
import {
  buscarEnCatalogo,
  catalogo,
  contraElResto,
  elegidosDeLaUrl,
  evolucionHashtags,
  granularidadSugerida,
  hashtagsDe,
  MAXIMO_HASHTAGS,
  mesesDelRango,
  type PublicacionHashtag,
  resumenHashtag,
} from "./hashtags";

let n = 0;
function pub(p: Partial<PublicacionHashtag> = {}): PublicacionHashtag {
  n += 1;
  return {
    id: `p${n}`,
    cuentaId: "ig",
    cuenta: "Instagram DLT",
    red: "Instagram",
    categoria: "Reel",
    tipo: "Normal",
    fecha: "2026-09-10",
    publicaciones: 1,
    alcance: 1_000,
    visualizaciones: 2_000,
    interacciones: 100,
    nuevos_seguidores: null,
    visitas_perfil: null,
    vistas_seguidores: null,
    vistas_no_seguidores: null,
    hashtags: [],
    titulo: null,
    enlace: null,
    ...p,
  };
}

describe("hashtagsDe", () => {
  it("encuentra el hashtag aunque no sea el primero del caption", () => {
    expect(hashtagsDe("FECHA17XDLT", "Se viene el finde 🔥 #Fecha17xDLT #AgendaDLT")).toEqual([
      "FECHA17XDLT",
      "AGENDADLT",
    ]);
  });

  it("normaliza tildes y mayúsculas, y no repite", () => {
    expect(hashtagsDe(null, "#QuéCambió #QUECAMBIO #quecambio")).toEqual(["QUECAMBIO"]);
  });

  it("sin serie ni texto, no hay hashtags", () => {
    expect(hashtagsDe(null, null)).toEqual([]);
    expect(hashtagsDe(null, "Sin etiquetas")).toEqual([]);
  });
});

describe("catálogo y búsqueda", () => {
  const pubs = [
    pub({ hashtags: ["AGENDADLT"], fecha: "2026-09-01" }),
    pub({ hashtags: ["AGENDADLT"], cuentaId: "tt", fecha: "2026-09-20" }),
    pub({ hashtags: ["LAAGENDADELFINDE", "AGENDADLT"] }),
    pub({ hashtags: ["LAAGENDADELFINDE"] }),
    pub({ hashtags: ["LAAGENDADELFINDE"] }),
    pub({ hashtags: ["LAAGENDADELFINDE"] }),
  ];
  const cat = catalogo(pubs);

  it("cuenta publicaciones y cuentas, y guarda la última fecha", () => {
    const agenda = cat.find((e) => e.hashtag === "AGENDADLT")!;
    expect(agenda).toEqual({ hashtag: "AGENDADLT", publicaciones: 3, cuentas: 2, ultima: "2026-09-20" });
    expect(cat[0].hashtag).toBe("LAAGENDADELFINDE");
  });

  it("lo que empieza con la búsqueda va antes, aunque se use menos", () => {
    expect(buscarEnCatalogo(cat, "#agenda").map((e) => e.hashtag)).toEqual([
      "AGENDADLT",
      "LAAGENDADELFINDE",
    ]);
  });

  it("sin búsqueda, devuelve los más usados", () => {
    expect(buscarEnCatalogo(cat, "  ", 1).map((e) => e.hashtag)).toEqual(["LAAGENDADELFINDE"]);
  });
});

describe("períodos", () => {
  it("los meses cubren el rango entero, cruzando el año", () => {
    expect(mesesDelRango("2025-11-15", "2026-02-03")).toEqual([
      { desde: "2025-11-01", hasta: "2025-11-30" },
      { desde: "2025-12-01", hasta: "2025-12-31" },
      { desde: "2026-01-01", hasta: "2026-01-31" },
      { desde: "2026-02-01", hasta: "2026-02-28" },
    ]);
  });

  it("un rango largo se ve por mes y uno corto por semana", () => {
    expect(granularidadSugerida("2025-10-01", "2026-10-14")).toBe("mes");
    expect(granularidadSugerida("2026-08-01", "2026-10-14")).toBe("semana");
  });
});

describe("evolucionHashtags", () => {
  const meses = mesesDelRango("2026-07-01", "2026-09-30");
  const pubs = [
    pub({ hashtags: ["AGENDADLT"], fecha: "2026-07-05", alcance: 1_000 }),
    pub({ hashtags: ["AGENDADLT"], fecha: "2026-07-20", alcance: 3_000 }),
    pub({ hashtags: ["AGENDADLT"], fecha: "2026-09-02", alcance: 5_000 }),
    pub({ hashtags: ["OTRO"], fecha: "2026-08-02" }),
  ];

  it("§9.1 — es el promedio por publicación, y §9.4 — un mes sin usarlo es un hueco", () => {
    const e = evolucionHashtags(pubs, ["AGENDADLT"], "alcance", meses);
    expect(e.series[0].puntos).toEqual([2_000, null, 5_000]);
    expect(e.series[0].publicaciones).toEqual([2, 0, 1]);
    expect(e.series[0].nombre).toBe("#AGENDADLT");
  });

  it("contando publicaciones, el mes sin usarlo sí es cero", () => {
    const e = evolucionHashtags(pubs, ["AGENDADLT"], "publicaciones", meses);
    expect(e.series[0].puntos).toEqual([2, 0, 1]);
  });

  it("§9.6 — el engagement entre redes distintas no se inventa", () => {
    const mezcla = [
      pub({ hashtags: ["X"], fecha: "2026-07-05" }),
      pub({ hashtags: ["X"], fecha: "2026-07-06", cuentaId: "yt", red: "YouTube", alcance: null }),
    ];
    const e = evolucionHashtags(mezcla, ["X"], "engagement", meses);
    expect(e.series[0].puntos[0]).toBeNull();
  });
});

describe("contraElResto", () => {
  it("compara cada cuenta contra su propio resto, no contra el total", () => {
    const pubs = [
      // Instagram: con el hashtag rinde el doble que su resto.
      pub({ hashtags: ["AGENDADLT"], alcance: 2_000 }),
      pub({ alcance: 1_000 }),
      pub({ alcance: 1_000 }),
      // TikTok: cuenta mucho más grande, el hashtag rinde igual que su resto.
      pub({ cuentaId: "tt", red: "TikTok", hashtags: ["AGENDADLT"], alcance: 50_000 }),
      pub({ cuentaId: "tt", red: "TikTok", alcance: 50_000 }),
    ];
    const con = pubs.filter((p) => p.hashtags.includes("AGENDADLT"));
    // Esperado: 1 × 1.000 + 1 × 50.000 = 51.000; real: 52.000.
    expect(contraElResto(con, pubs, "alcance")).toBeCloseTo(52_000 / 51_000 - 1);
  });

  it("sin resto en la cuenta no hay contra qué comparar", () => {
    const pubs = [pub({ hashtags: ["A"] }), pub({ hashtags: ["A"] })];
    expect(contraElResto(pubs, pubs, "alcance")).toBeNull();
  });

  it("el engagement se mide contra el de la misma cuenta", () => {
    const pubs = [
      pub({ hashtags: ["A"], alcance: 1_000, interacciones: 100 }), // 10 %
      pub({ alcance: 1_000, interacciones: 50 }), // 5 %
    ];
    expect(contraElResto([pubs[0]], pubs, "engagement")).toBeCloseTo(1);
  });

  it("contar publicaciones no tiene comparación", () => {
    expect(contraElResto([pub()], [pub(), pub()], "publicaciones")).toBeNull();
  });
});

describe("resumenHashtag", () => {
  it("junta fechas, total y el detalle por cuenta de la que más lo usó a la que menos", () => {
    const pubs = [
      pub({ hashtags: ["A"], fecha: "2026-08-03", cuentaId: "tt", cuenta: "TikTok", red: "TikTok" }),
      pub({ hashtags: ["A"], fecha: "2026-09-01" }),
      pub({ hashtags: ["A"], fecha: "2026-07-01" }),
      pub({ hashtags: ["B"] }),
    ];
    const r = resumenHashtag(pubs, "A", "publicaciones");
    expect(r.publicaciones).toBe(3);
    expect(r.primera).toBe("2026-07-01");
    expect(r.ultima).toBe("2026-09-01");
    expect(r.cuentas.map((c) => [c.nombre, c.publicaciones])).toEqual([
      ["Instagram DLT", 2],
      ["TikTok", 1],
    ]);
  });
});

describe("elegidosDeLaUrl", () => {
  it("normaliza, no repite y respeta el tope", () => {
    expect(elegidosDeLaUrl(["#agendaDLT", "AGENDADLT", "otro"])).toEqual(["AGENDADLT", "OTRO"]);
    expect(elegidosDeLaUrl("a,b,c,d,e,f")).toHaveLength(MAXIMO_HASHTAGS);
    expect(elegidosDeLaUrl(undefined)).toEqual([]);
  });
});
