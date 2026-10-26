import { describe, expect, it } from "vitest";
import {
  agruparEspejos,
  espejosDeLaSemana,
  type Habitual,
  habitualPorCuenta,
  palabrasDe,
  parecido,
  type PublicacionVideo,
  puntajeEspejo,
  titularDe,
} from "./espejos";

function v(p: Partial<PublicacionVideo> & Pick<PublicacionVideo, "id" | "red">): PublicacionVideo {
  return {
    fecha: "2026-10-19",
    publicadoEn: null,
    cuentaId: p.red === "Instagram" ? "ig" : p.red === "TikTok" ? "tt" : "yt",
    cuenta: p.red === "Instagram" ? "Instagram DLT" : p.red === "TikTok" ? "DBF" : "YouTube",
    categoria: p.red === "Instagram" ? "Reel" : p.red === "TikTok" ? "Video" : "Short",
    duracion: 58,
    texto: "¿QUÉ CHU*** PASÓ EN AZUL AZUL? 💣🔵🔴 Se destapó la olla completa en la U",
    visualizaciones: 10_000,
    enlace: `https://ejemplo/${p.id}`,
    ...p,
  };
}

const IG = v({ id: "ig1", red: "Instagram", texto: "📺 #DEBUENAFUENTE | ¿QUÉ CHU*** PASÓ EN AZUL AZUL? 💣\n\nSe destapó la olla completa en la U. La mesa de De Buena Fuente...", visualizaciones: 133_300 });
const TT = v({ id: "tt1", red: "TikTok", fecha: "2026-10-19", visualizaciones: 23_537 });
const YT = v({ id: "yt1", red: "YouTube", fecha: "2026-10-20", texto: "QUÉ PASÓ EN AZUL AZUL 💣", duracion: 59, visualizaciones: 4_100 });

describe("titularDe y palabrasDe", () => {
  it("toma la primera línea sin el «#SERIE |» ni los emojis", () => {
    expect(titularDe("📺 #DEBUENAFUENTE | ¿QUÉ PASÓ? 💣\n\nTexto")).toBe("¿QUÉ PASÓ?");
  });

  it("deja las palabras que importan, sin tildes ni palabras vacías", () => {
    expect([...palabrasDe("#DLTÁCTICO | ¿PODRÁ LA UC PARAR A ALAN MEDINA?")]).toEqual(["podra", "parar", "alan", "medina"]);
  });

  it("compara contra el titular más corto", () => {
    const largo = palabrasDe("¿QUÉ CHU*** PASÓ EN AZUL AZUL? Se destapó la olla");
    const corto = palabrasDe("QUÉ PASÓ EN AZUL AZUL");
    expect(parecido(largo, corto).indice).toBe(1);
  });
});

describe("puntajeEspejo", () => {
  it("empareja el mismo video en dos redes", () => {
    expect(puntajeEspejo(IG, TT)).not.toBeNull();
    expect(puntajeEspejo(IG, YT)).not.toBeNull();
  });

  it("no empareja dos publicaciones de la misma red", () => {
    expect(puntajeEspejo(IG, v({ id: "ig2", red: "Instagram" }))).toBeNull();
  });

  it("no empareja si las separan más de tres días", () => {
    expect(puntajeEspejo(IG, v({ id: "tt9", red: "TikTok", fecha: "2026-10-25" }))).toBeNull();
  });

  it("una duración muy distinta es otro corte, aunque el titular se parezca", () => {
    expect(puntajeEspejo(v({ id: "a", red: "Instagram", duracion: 58 }), v({ id: "b", red: "TikTok", duracion: 120 }))).toBeNull();
  });

  it("no empareja titulares de temas distintos", () => {
    expect(puntajeEspejo(IG, v({ id: "tt2", red: "TikTok", texto: "LA SELECCIÓN PIDE GOLES: ¿LLAMAMOS A ARNALDO?" }))).toBeNull();
  });
});

describe("agruparEspejos", () => {
  it("junta las tres versiones en un solo espejo", () => {
    const grupos = agruparEspejos([IG, TT, YT, v({ id: "solo", red: "TikTok", texto: "Otro tema completamente distinto aquí", fecha: "2026-10-22" })]);
    expect(grupos).toHaveLength(1);
    expect(grupos[0].map((p) => p.id).sort()).toEqual(["ig1", "tt1", "yt1"]);
  });

  it("deja afuera lo que no es video", () => {
    expect(agruparEspejos([{ ...IG, categoria: "Carrusel" }, TT])).toEqual([]);
  });
});

describe("habitualPorCuenta", () => {
  it("es la mediana de visualizaciones de los videos de cada cuenta", () => {
    const pubs = [100, 300, 200, 1_000].map((n, i) => v({ id: `h${i}`, red: "Instagram", visualizaciones: n }));
    expect(habitualPorCuenta(pubs).get("ig")).toEqual({ mediana: 250, videos: 4 });
  });
});

describe("espejosDeLaSemana", () => {
  const habitual = new Map<string, Habitual>([
    ["ig", { mediana: 80_000, videos: 30 }],
    ["tt", { mediana: 50_000, videos: 30 }],
    ["yt", { mediana: 4_000, videos: 30 }],
  ]);

  it("compara cada versión contra lo habitual de su cuenta y marca la disparidad", () => {
    const [e] = espejosDeLaSemana([IG, TT, YT], habitual, "2026-10-19", "2026-10-25");
    expect(e.versiones.map((x) => x.red)).toEqual(["Instagram", "TikTok", "YouTube"]);
    expect(e.versiones[0].indice).toBeCloseTo(1.666, 2);
    expect(e.versiones[1].indice).toBeCloseTo(0.47, 2);
    expect(e.mejor).toBe("Instagram");
    expect(e.peor).toBe("TikTok");
    expect(e.disparidad).toBeCloseTo(3.54, 1);
    expect(e.dispar).toBe(true);
    expect(e.titulo).toContain("AZUL AZUL");
  });

  it("un espejo parejo no es dispar", () => {
    const [e] = espejosDeLaSemana([IG, { ...TT, visualizaciones: 60_000 }], habitual, "2026-10-19", "2026-10-25");
    expect(e.dispar).toBe(false);
  });

  it("sin suficientes videos para saber lo habitual, no se inventa la comparación", () => {
    const poco = new Map<string, Habitual>([
      ["ig", { mediana: 80_000, videos: 2 }],
      ["tt", { mediana: 50_000, videos: 30 }],
    ]);
    const [e] = espejosDeLaSemana([IG, TT], poco, "2026-10-19", "2026-10-25");
    expect(e.versiones[0].indice).toBeNull();
    expect(e.disparidad).toBeNull();
    expect(e.dispar).toBe(false);
  });

  it("cuenta para la semana si al menos una versión salió en ella", () => {
    const antes = { ...IG, fecha: "2026-10-18" };
    expect(espejosDeLaSemana([antes, TT], habitual, "2026-10-19", "2026-10-25")).toHaveLength(1);
    expect(espejosDeLaSemana([antes, { ...TT, fecha: "2026-10-17" }], habitual, "2026-10-19", "2026-10-25")).toHaveLength(0);
  });

  it("los dispares van primero", () => {
    const otroIG = v({ id: "ig2", red: "Instagram", fecha: "2026-10-23", texto: "#DLTÁCTICO | ¿PODRÁ LA UC PARAR A ALAN MEDINA?", visualizaciones: 80_000 });
    const otroTT = v({ id: "tt2", red: "TikTok", fecha: "2026-10-23", texto: "#DLTÁCTICO | ¿PODRÁ LA UC PARAR A ALAN MEDINA?", visualizaciones: 50_000 });
    const lista = espejosDeLaSemana([otroIG, otroTT, IG, TT], habitual, "2026-10-19", "2026-10-25");
    expect(lista.map((e) => e.dispar)).toEqual([true, false]);
  });
});

describe("YouTube sin título", () => {
  const reel = v({ id: "ig", red: "Instagram", duracion: 58, publicadoEn: "2026-10-19T13:57:00" });
  const sinTitulo = (p: Partial<PublicacionVideo>) =>
    v({ id: "yt", red: "YouTube", texto: null, duracion: 58, publicadoEn: "2026-10-19T15:10:00", ...p });

  it("se empareja por la misma duración y una hora cercana", () => {
    expect(puntajeEspejo(reel, sinTitulo({}))).not.toBeNull();
  });

  it("no se empareja si la duración difiere en más de un segundo", () => {
    expect(puntajeEspejo(reel, sinTitulo({ duracion: 61 }))).toBeNull();
  });

  it("no se empareja si se subió con más de un día y medio de diferencia", () => {
    expect(puntajeEspejo(reel, sinTitulo({ fecha: "2026-10-21", publicadoEn: "2026-10-21T09:00:00" }))).toBeNull();
  });

  it("sin duración no hay con qué reconocerlo", () => {
    expect(puntajeEspejo(reel, sinTitulo({ duracion: null }))).toBeNull();
  });

  it("entre dos Shorts de la misma duración, se queda con el de la hora más cercana", () => {
    const lejos = sinTitulo({ id: "yt-lejos", publicadoEn: "2026-10-20T20:00:00", fecha: "2026-10-20" });
    const cerca = sinTitulo({ id: "yt-cerca", publicadoEn: "2026-10-19T14:05:00" });
    const [grupo] = agruparEspejos([reel, lejos, cerca]);
    expect(grupo.map((p) => p.id).sort()).toEqual(["ig", "yt-cerca"]);
  });

  it("un par con titular gana sobre uno solo por duración", () => {
    const tt = v({ id: "tt", red: "TikTok", duracion: null });
    const [grupo] = agruparEspejos([reel, tt, sinTitulo({})]);
    expect(grupo.map((p) => p.id).sort()).toEqual(["ig", "tt", "yt"]);
  });
});
