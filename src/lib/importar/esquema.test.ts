/**
 * La puerta nueva del servidor.
 *
 * Desde que el archivo se lee en el navegador, lo que llega a la acción no es
 * un archivo sino un JSON armado por el cliente. Esto verifica que un payload
 * bueno pase entero y que uno malo se rechace con un mensaje, en vez de llegar
 * a la base o tumbar la acción — que es justo lo que dejaba la página en
 * blanco.
 */
import { describe, expect, it } from "vitest";
import { leerEnNavegador } from "./en-navegador";
import { leerResultadoImport, MAXIMO_PUBLICACIONES } from "./esquema";
import { bufferEjemplo, EJEMPLOS, hayEjemplos } from "./archivos-de-ejemplo";
import { leerArchivo } from "./parsers";

function publicacion(p: Record<string, unknown> = {}) {
  return {
    publicado_en: "2026-07-22T19:30:00",
    formato: "Reel",
    tipo: "Normal",
    tipo_auto: "Normal",
    serie_hashtag: "FECHA21XDLT",
    caption: "texto",
    duracion_s: 45,
    visualizaciones: 20000,
    alcance: 10000,
    me_gusta: 300,
    comentarios: 20,
    compartidos: 10,
    guardados: 5,
    favoritos: null,
    nuevos_seguidores: 8,
    interacciones: 335,
    enlace: "https://instagram.com/p/abc",
    id_externo: "abc",
    fuente: "meta",
    ...p,
  };
}

function payload(p: Record<string, unknown> = {}) {
  return {
    detectada: { usuario: "dltsports", red: "Instagram" },
    fuente: "meta",
    cuenta: "dltsports",
    publicaciones: [publicacion()],
    meses: ["2026-07"],
    advertencias: [],
    ...p,
  };
}

describe("leerResultadoImport", () => {
  it("acepta un payload bien formado y no le cambia nada", () => {
    const r = leerResultadoImport(payload());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.datos.publicaciones).toHaveLength(1);
      expect(r.datos.publicaciones[0].alcance).toBe(10000);
      expect(r.datos.detectada.red).toBe("Instagram");
    }
  });

  it("rechaza lo que no es un payload, sin lanzar", () => {
    for (const basura of [null, undefined, 42, "texto", [], {}]) {
      const r = leerResultadoImport(basura);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.mensaje).toContain("No pude leer");
    }
  });

  it("una red inventada no pasa", () => {
    const r = leerResultadoImport(
      payload({ detectada: { usuario: "x", red: "MySpace" } }),
    );
    expect(r.ok).toBe(false);
  });

  it("una categoría inventada se descarta en vez de tumbar el payload", () => {
    // `.catch(null)` — mejor una publicación sin formato que un import caído.
    const r = leerResultadoImport(
      payload({ publicaciones: [publicacion({ formato: "Historia" })] }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.datos.publicaciones[0].formato).toBeNull();
  });

  /*
   * De acá sale la fecha de cada fila. Un texto cualquiera produciría
   * publicaciones en fechas inventadas, que es peor que no importar.
   */
  it("una fecha con formato raro se rechaza", () => {
    const r = leerResultadoImport(
      payload({ publicaciones: [publicacion({ publicado_en: "22 de julio" })] }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.mensaje).toContain("publicado_en");
  });

  it("una publicación sin fecha sí se acepta: se descarta más adelante", () => {
    const r = leerResultadoImport(
      payload({ publicaciones: [publicacion({ publicado_en: null })] }),
    );
    expect(r.ok).toBe(true);
  });

  it("§9.4 — un número que no es número queda nulo, nunca en cero", () => {
    const r = leerResultadoImport(
      payload({ publicaciones: [publicacion({ alcance: "muchísimo" })] }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.datos.publicaciones[0].alcance).toBeNull();
  });

  it("redondea los decimales que pueda traer una exportación", () => {
    const r = leerResultadoImport(
      payload({ publicaciones: [publicacion({ alcance: 1234.6 })] }),
    );
    if (r.ok) expect(r.datos.publicaciones[0].alcance).toBe(1235);
  });

  it("un payload absurdamente grande se rechaza antes de armar nada", () => {
    const muchas = Array.from({ length: MAXIMO_PUBLICACIONES + 1 }, () => publicacion());
    const r = leerResultadoImport(payload({ publicaciones: muchas }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.mensaje).toContain("trimestre");
  });

  /*
   * Se recorta y no se descarta: el caption es lo que usa el cruce entre las
   * dos exportaciones de Instagram para emparejar publicaciones, así que
   * dejarlo en null rompería ese cruce sin que se note.
   */
  it("un caption enorme se recorta, no se pierde", () => {
    const r = leerResultadoImport(
      payload({ publicaciones: [publicacion({ caption: "a".repeat(20_000) })] }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.datos.publicaciones[0].caption).toHaveLength(10_000);
      expect(r.datos.publicaciones[0].caption?.startsWith("aaa")).toBe(true);
    }
  });
});

const describir = hayEjemplos("dltIconosquare") ? describe : describe.skip;

describir("ida y vuelta con un archivo real", () => {
  /**
   * LA prueba del cambio: lo que el navegador extrae de un archivo real tiene
   * que pasar la validación del servidor tal cual, sin perder ni una
   * publicación ni un campo. Si el esquema fuera más estricto que el lector,
   * el import fallaría entero y solo se notaría en producción.
   */
  it("lo que lee el navegador pasa la validación del servidor", () => {
    const leido = leerArchivo(
      EJEMPLOS.dltIconosquare,
      bufferEjemplo("dltIconosquare"),
    );

    // Tal como viaja: serializado y vuelto a parsear.
    const r = leerResultadoImport(JSON.parse(JSON.stringify(leido)));

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.datos.publicaciones).toHaveLength(leido.publicaciones.length);
    expect(r.datos.publicaciones).toEqual(leido.publicaciones);
    expect(r.datos.detectada).toEqual(leido.detectada);
    expect(r.datos.meses).toEqual(leido.meses);
  });

  it("y lo mismo con el CSV de Meta", () => {
    const leido = leerArchivo(EJEMPLOS.dbfMeta, bufferEjemplo("dbfMeta"));
    const r = leerResultadoImport(JSON.parse(JSON.stringify(leido)));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.datos.publicaciones).toEqual(leido.publicaciones);
  });
});

describe("leerEnNavegador", () => {
  it("rechaza un archivo vacío", async () => {
    const vacio = new File([], "x.csv", { type: "text/csv" });
    const r = await leerEnNavegador(vacio);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.mensaje).toContain("vacío");
  });

  it("rechaza una extensión que no sabe leer, sin intentar parsearla", async () => {
    const pdf = new File(["contenido"], "informe.pdf", { type: "application/pdf" });
    const r = await leerEnNavegador(pdf);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.mensaje).toContain(".csv");
  });

  it("un archivo que no se puede leer devuelve el motivo, no lanza", async () => {
    const roto = new File(["no soy un csv de meta"], "x.csv", { type: "text/csv" });
    const r = await leerEnNavegador(roto);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.mensaje.length).toBeGreaterThan(10);
  });
});
