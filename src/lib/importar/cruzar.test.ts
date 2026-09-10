/**
 * El cruce se prueba con datos reales: se toma el CSV de Meta de DBF y se
 * fabrica a partir de él la "otra fuente" — mismas publicaciones, tres horas
 * más tarde y sin nuevos seguidores, que es exactamente lo que pasa entre
 * Iconosquare y Meta (§5.1).
 */
import { beforeAll, describe, expect, it } from "vitest";
import { bufferEjemplo, EJEMPLOS, hayEjemplos } from "./archivos-de-ejemplo";
import { claveCaption, cruzar, type PublicacionExistente } from "./cruzar";
import { leerArchivo } from "./parsers";
import type { PublicacionImportada } from "./tipos";
import { aNaive, mesDe, sumarHorasNaive } from "./util";

const describir = hayEjemplos("dbfMeta") ? describe : describe.skip;

let deMeta: PublicacionImportada[];

beforeAll(() => {
  if (!hayEjemplos("dbfMeta")) return;
  const r = leerArchivo(EJEMPLOS.dbfMeta, bufferEjemplo("dbfMeta"));
  deMeta = r.publicaciones.filter(
    (p) => p.publicado_en && mesDe(p.publicado_en) === "2026-08",
  );
});

/**
 * Convierte las publicaciones de Meta en el estado en que quedarían si la
 * fuente canónica hubiera sido Iconosquare: tres horas más tarde, sin nuevos
 * seguidores y sin duración.
 */
function comoIconosquare(
  posts: PublicacionImportada[],
  opciones: { conCaption?: boolean } = {},
): PublicacionExistente[] {
  const conCaption = opciones.conCaption ?? true;
  return posts.map((p, i) => ({
    id: `id-${i}`,
    publicado_en: sumarHorasNaive(p.publicado_en!, 3),
    caption: conCaption ? p.caption : null,
    formato: p.formato,
    nuevos_seguidores: null, // Iconosquare no lo trae
    duracion_s: null, // tampoco la duración
    alcance: p.alcance,
    visualizaciones: p.visualizaciones,
    interacciones: p.interacciones,
    me_gusta: p.me_gusta,
    comentarios: p.comentarios,
    compartidos: p.compartidos,
    guardados: p.guardados,
    favoritos: null,
  }));
}

describir("§5.1 — completar Instagram con la segunda fuente", () => {
  it("calza las 37 publicaciones por caption y no deja ninguna suelta", () => {
    const r = cruzar(comoIconosquare(deMeta), deMeta);
    expect(r.calzadasPorCaption).toBe(37);
    expect(r.sinCalzar).toHaveLength(0);
  });

  it("completa los nuevos seguidores que la fuente canónica no tenía", () => {
    const r = cruzar(comoIconosquare(deMeta), deMeta);
    const conSeguidores = deMeta.filter((p) => p.nuevos_seguidores !== null).length;
    expect(r.camposCompletados.nuevos_seguidores).toBe(conSeguidores);
    expect(r.camposCompletados.duracion_s).toBeGreaterThan(0);
  });

  it("no agrega ni una sola fila: solo completa (evita duplicar las 270 de agosto)", () => {
    const r = cruzar(comoIconosquare(deMeta), deMeta);
    expect(r.sinCalzar).toHaveLength(0);
    expect(r.enriquecimientos.length).toBeLessThanOrEqual(37);
  });

  it("nunca sobrescribe un dato que la fuente canónica ya tenía", () => {
    const existentes = comoIconosquare(deMeta);
    const r = cruzar(existentes, deMeta);
    // El alcance venía de la fuente canónica: no debe aparecer en ningún
    // enriquecimiento, aunque la segunda fuente también lo traiga.
    expect(r.camposCompletados.alcance).toBeUndefined();
    for (const e of r.enriquecimientos) {
      expect(Object.keys(e.campos)).not.toContain("alcance");
    }
  });

  it("estima el desfase de 3 horas a partir de los pares que calzaron", () => {
    const r = cruzar(comoIconosquare(deMeta), deMeta);
    expect(r.desfaseHoras).toBe(3);
    expect(r.desfaseSegun).toBe("captions");
  });
});

describir("cuando no hay captions para calzar", () => {
  it("cae al calce por hora con el desfase por defecto de 3 horas", () => {
    const r = cruzar(comoIconosquare(deMeta, { conCaption: false }), deMeta);
    expect(r.calzadasPorCaption).toBe(0);
    expect(r.desfaseSegun).toBe("por defecto");
    expect(r.calzadasPorHora).toBe(37);
    expect(r.sinCalzar).toHaveLength(0);
  });

  it("si el desfase real es otro, no calza a la fuerza", () => {
    // Una fuente desfasada 9 horas: fuera de toda tolerancia razonable.
    const existentes = comoIconosquare(deMeta, { conCaption: false }).map((e) => ({
      ...e,
      publicado_en: sumarHorasNaive(aNaive(e.publicado_en)!, 6),
    }));
    const r = cruzar(existentes, deMeta);
    expect(r.calzadasPorHora).toBe(0);
    expect(r.sinCalzar).toHaveLength(37);
  });
});

describir("calce por hora con captions parciales", () => {
  it("usa los captions que hay para estimar el desfase y calzar el resto", () => {
    // Solo las primeras 10 conservan caption; el desfase real es de 5 horas.
    const existentes = comoIconosquare(deMeta)
      .map((e) => ({ ...e, publicado_en: sumarHorasNaive(aNaive(e.publicado_en)!, 2) }))
      .map((e, i) => (i < 10 ? e : { ...e, caption: null }));

    const r = cruzar(existentes, deMeta);
    expect(r.calzadasPorCaption).toBe(10);
    expect(r.desfaseSegun).toBe("captions");
    expect(r.desfaseHoras).toBe(5); // 3 del exportador + 2 agregadas
    expect(r.calzadasPorHora).toBe(27);
    expect(r.sinCalzar).toHaveLength(0);
  });
});

describe("claveCaption", () => {
  it("ignora tildes, mayúsculas y espacios de más", () => {
    expect(claveCaption("  ¿ERA REAL el   intercambio de Neira?  ")).toBe(
      claveCaption("¿era real EL INTERCAMBIO DE NEIRA?"),
    );
  });

  it("descarta captions demasiado cortos para identificar algo", () => {
    expect(claveCaption("(sin descripción)")).toBeNull();
    expect(claveCaption("")).toBeNull();
    expect(claveCaption(null)).toBeNull();
  });
});

describir("captions repetidos", () => {
  it("no calza por caption cuando dos publicaciones comparten el texto", () => {
    const repetido = "ESTE CAPTION SE REPITE EN DOS PUBLICACIONES DISTINTAS";
    const base = comoIconosquare(deMeta.slice(0, 2)).map((e) => ({
      ...e,
      caption: repetido,
      // Fuera de la tolerancia horaria, para aislar el efecto del caption.
      publicado_en: sumarHorasNaive(aNaive(e.publicado_en)!, 20),
    }));
    const nuevas = deMeta.slice(0, 2).map((p) => ({ ...p, caption: repetido }));

    const r = cruzar(base, nuevas);
    expect(r.calzadasPorCaption).toBe(0); // ambiguo: mejor no calzar que calzar mal
  });
});
