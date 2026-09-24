import { describe, expect, it } from "vitest";
import type { Cuenta } from "@/lib/dominio/redes";
import {
  aFilaRegistro,
  aFilasRegistro,
  contarHashtags,
  fusionarConExistente,
  limpiarTexto,
  rangoDe,
  recortarPorGrafemas,
  tituloDeCaption,
} from "./a-registro";
import { resolverCuenta, usuarioComparable } from "./cuentas";
import type { PublicacionImportada } from "./tipos";

function cuenta(p: Partial<Cuenta> = {}): Cuenta {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    nombre: "Instagram DLT",
    usuario: "@dltsports",
    red: "Instagram",
    es_influencer: false,
    activa: true,
    orden: 1,
    ...p,
  };
}

function pub(p: Partial<PublicacionImportada> = {}): PublicacionImportada {
  return {
    publicado_en: "2026-09-15T18:30:00",
    formato: "Reel",
    tipo: "Normal",
    tipo_auto: "Normal",
    serie_hashtag: "FECHA21XDLT",
    caption: "#Fecha21xDLT el resumen de la jornada",
    duracion_s: 45,
    visualizaciones: 12_000,
    alcance: 9_000,
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

describe("aFilaRegistro", () => {
  it("convierte una publicación en una fila de una sola publicación (§9.5)", () => {
    const f = aFilaRegistro(pub(), cuenta())!;
    expect(f.publicaciones).toBe(1);
    expect(f.fecha).toBe("2026-09-15");
    expect(f.publicado_en).toBe("2026-09-15T18:30:00");
    expect(f.cuenta_id).toBe(cuenta().id);
    expect(f.categoria).toBe("Reel");
    expect(f.tipo).toBe("Normal");
    expect(f.hashtag).toBe("FECHA21XDLT");
  });

  it("descarta la publicación sin fecha en vez de asignarla a hoy", () => {
    expect(aFilaRegistro(pub({ publicado_en: null }), cuenta())).toBeNull();
  });

  it("§9.6 — no guarda alcance en YouTube aunque el archivo traiga un número", () => {
    const yt = cuenta({ nombre: "YouTube", red: "YouTube", usuario: "@dltsportstv" });
    const f = aFilaRegistro(pub({ formato: "Short", alcance: 5_000 }), yt)!;
    expect(f.alcance).toBeNull();
    // Lo que YouTube sí entrega no se toca.
    expect(f.visualizaciones).toBe(12_000);
  });

  it("§3.2 — Reactivo/Normal no se guarda fuera de Instagram", () => {
    const tt = cuenta({ nombre: "TikTok", red: "TikTok", usuario: "@dltsportsoficial" });
    const f = aFilaRegistro(pub({ formato: "Video", tipo: "Reactivo" }), tt)!;
    expect(f.tipo).toBeNull();
    expect(f.categoria).toBe("Video");
  });

  it("deja la categoría vacía antes que mandar un formato de otra red", () => {
    const tt = cuenta({ nombre: "TikTok", red: "TikTok" });
    // "Reel" no es una categoría de TikTok: la base rechazaría la fila entera.
    const f = aFilaRegistro(pub({ formato: "Reel" }), tt)!;
    expect(f.categoria).toBeNull();
  });

  it("§9.4 — un campo que el archivo no trae queda nulo, nunca cero", () => {
    const f = aFilaRegistro(
      pub({ nuevos_seguidores: null, interacciones: null }),
      cuenta(),
    )!;
    expect(f.nuevos_seguidores).toBeNull();
    expect(f.interacciones).toBeNull();
  });

  it("normaliza el hashtag para que no se parta la serie", () => {
    expect(aFilaRegistro(pub({ serie_hashtag: "#fecha21xdlt" }), cuenta())!.hashtag).toBe(
      "FECHA21XDLT",
    );
    expect(aFilaRegistro(pub({ serie_hashtag: "QuéCambió" }), cuenta())!.hashtag).toBe(
      "QUECAMBIO",
    );
    expect(aFilaRegistro(pub({ serie_hashtag: null }), cuenta())!.hashtag).toBeNull();
  });

  it("ignora un enlace que no es una URL", () => {
    expect(aFilaRegistro(pub({ enlace: "sin enlace" }), cuenta())!.enlace).toBeNull();
  });
});

describe("tituloDeCaption", () => {
  it("deja el caption en una línea", () => {
    expect(tituloDeCaption("dos\nlíneas   y   espacios")).toBe(
      "dos líneas y espacios",
    );
  });

  it("recorta los captions largos", () => {
    const t = tituloDeCaption("a".repeat(500))!;
    expect(t).toHaveLength(300);
    expect(t.endsWith("…")).toBe(true);
  });

  it("un caption vacío no es un título vacío, es ausencia de título", () => {
    expect(tituloDeCaption("   ")).toBeNull();
    expect(tituloDeCaption(null)).toBeNull();
  });

  /** ¿Quedó alguna mitad de pareja UTF-16 suelta? */
  const surrogatesSueltos = (s: string) =>
    (s.match(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g) ?? []).length +
    (s.match(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g) ?? []).length;

  /*
   * El error que rompió la importación de julio: recortar por unidades UTF-16
   * partía un emoji al medio y dejaba media pareja. `JSON.stringify` la emite
   * como "\ud83c" suelto y el parser de JSON de Postgres —por donde pasa todo
   * lo que escribe PostgREST— la rechaza con "invalid input syntax for type
   * json", tumbando la tanda entera de 200 filas.
   */
  it("no parte un emoji al recortar, en ninguna posición del borde", () => {
    for (const emoji of ["🇨🇱", "🤫", "⚽", "👨‍👩‍👧", "🏃🏽‍♂️"]) {
      for (let relleno = 290; relleno <= 305; relleno++) {
        const caption = "A".repeat(relleno) + emoji + " y más texto que sobra";
        const t = tituloDeCaption(caption)!;
        expect(surrogatesSueltos(t)).toBe(0);
        expect(t.length).toBeLessThanOrEqual(300);
      }
    }
  });

  it("el título recortado es JSON que Postgres puede parsear", () => {
    /*
     * La prueba de humo de todo esto: si `JSON.stringify` emite un escape de
     * surrogate suelto, el cuerpo de la petición deja de ser JSON válido para
     * Postgres. Buscarlo en el texto serializado es la forma directa de verlo.
     */
    for (let relleno = 295; relleno <= 302; relleno++) {
      const t = tituloDeCaption("A".repeat(relleno) + "🇨🇱 sobra texto")!;
      const serializado = JSON.stringify({ titulo_contenido: t });
      expect(serializado).not.toMatch(/\\ud[89ab][0-9a-f]{2}(?!\\ud[c-f])/i);
    }
  });

  it("quita los nulos y los caracteres de control", () => {
    // Postgres los rechaza con "unsupported Unicode escape sequence".
    const t = tituloDeCaption("hola\u0000mundo\u0001y\u001fchao")!;
    expect(t).toBe("holamundoychao");
  });

  it("quita un surrogate suelto que venga en el propio archivo", () => {
    const t = tituloDeCaption("roto \uD83C aquí")!;
    expect(surrogatesSueltos(t)).toBe(0);
    expect(t).toBe("roto aquí");
  });

  it("un emoji completo se conserva tal cual", () => {
    expect(tituloDeCaption("🇨🇱 #FECHA21xDLT | la jornada 🤫")).toBe(
      "🇨🇱 #FECHA21xDLT | la jornada 🤫",
    );
  });
});

describe("limpiarTexto", () => {
  it("no toca un texto normal", () => {
    expect(limpiarTexto("Hola, ¿qué tal? 🇨🇱 100%")).toBe("Hola, ¿qué tal? 🇨🇱 100%");
  });

  it("quita las dos mitades sueltas de una pareja", () => {
    expect(limpiarTexto("a\uD83Cb")).toBe("ab");
    expect(limpiarTexto("a\uDDE8b")).toBe("ab");
  });
});

describe("recortarPorGrafemas", () => {
  it("no recorta lo que ya entra", () => {
    expect(recortarPorGrafemas("corto", 100)).toBe("corto");
  });

  it("corta entre grafemas y agrega los puntos suspensivos", () => {
    const r = recortarPorGrafemas("🇨🇱🇨🇱🇨🇱🇨🇱", 6);
    expect(r.endsWith("…")).toBe(true);
    // Cada bandera son 4 unidades UTF-16: en 6 solo entra una.
    expect(r).toBe("🇨🇱…");
  });
});

describe("aFilasRegistro", () => {
  it("cuenta las que quedaron fuera en vez de perderlas en silencio", () => {
    const r = aFilasRegistro(
      [
        pub({ id_externo: "a", publicado_en: "2026-09-15T10:00:00" }),
        pub({ id_externo: "b", publicado_en: null }),
        pub({ id_externo: "c", publicado_en: "2026-08-01T10:00:00" }),
      ],
      cuenta(),
      { desde: "2026-09-14", hasta: "2026-09-20" },
    );
    expect(r.filas).toHaveLength(1);
    expect(r.sinFecha).toBe(1);
    expect(r.fueraDeRango).toBe(1);
  });

  it("no manda dos veces el mismo id_externo: el índice único haría fallar el lote", () => {
    const r = aFilasRegistro(
      [pub({ id_externo: "a" }), pub({ id_externo: "a" }), pub({ id_externo: "b" })],
      cuenta(),
    );
    expect(r.filas).toHaveLength(2);
    expect(r.repetidasEnArchivo).toBe(1);
  });

  it("sin rango importa todo lo que trae el archivo", () => {
    const r = aFilasRegistro(
      [
        pub({ id_externo: "a", publicado_en: "2026-07-01T10:00:00" }),
        pub({ id_externo: "b", publicado_en: "2026-09-30T10:00:00" }),
      ],
      cuenta(),
    );
    expect(r.filas).toHaveLength(2);
    expect(r.fueraDeRango).toBe(0);
    expect(rangoDe(r.filas)).toEqual({ desde: "2026-07-01", hasta: "2026-09-30" });
  });
});

describe("fusionarConExistente", () => {
  /*
   * El caso que motiva la regla: Iconosquare trae alcance pero no nuevos
   * seguidores, y Meta al revés. Sin esto, subir la segunda exportación encima
   * de la primera borraría la mitad de lo ya cargado.
   */
  it("no pisa un valor que existe con un vacío", () => {
    const nueva = aFilaRegistro(pub({ nuevos_seguidores: null }), cuenta())!;
    const f = fusionarConExistente({ nuevos_seguidores: 8, alcance: 1 }, nueva);
    expect(f.nuevos_seguidores).toBe(8);
    // Lo que sí trae el archivo nuevo, sí manda.
    expect(f.alcance).toBe(9_000);
  });

  it("mantiene el hashtag y el tipo puestos a mano si el archivo no los trae", () => {
    const nueva = aFilaRegistro(pub({ serie_hashtag: null, tipo: null }), cuenta())!;
    const f = fusionarConExistente({ hashtag: "ENCALIENTE", tipo: "Reactivo" }, nueva);
    expect(f.hashtag).toBe("ENCALIENTE");
    expect(f.tipo).toBe("Reactivo");
  });
});

describe("contarHashtags", () => {
  it("ordena por cantidad y deja el resto sin hashtag al final", () => {
    const filas = [
      pub({ id_externo: "1", serie_hashtag: "A" }),
      pub({ id_externo: "2", serie_hashtag: null }),
      pub({ id_externo: "3", serie_hashtag: "B" }),
      pub({ id_externo: "4", serie_hashtag: "B" }),
    ].map((p) => aFilaRegistro(p, cuenta())!);

    expect(contarHashtags(filas)).toEqual([
      { hashtag: "B", n: 2 },
      { hashtag: "A", n: 1 },
      { hashtag: null, n: 1 },
    ]);
  });
});

describe("resolverCuenta", () => {
  const cuentas = [
    cuenta(),
    cuenta({
      id: "22222222-2222-4222-8222-222222222222",
      nombre: "DiegoAT",
      usuario: "diegoat",
      es_influencer: true,
    }),
    cuenta({
      id: "33333333-3333-4333-8333-333333333333",
      nombre: "DiegoAT TikTok",
      usuario: "@DiegoAT",
      red: "TikTok",
      es_influencer: true,
    }),
  ];

  it("encuentra la cuenta de un influencer por su usuario", () => {
    const r = resolverCuenta(cuentas, { usuario: "diegoat", red: "Instagram" });
    expect(r.ok && r.cuenta.nombre).toBe("DiegoAT");
  });

  it("distingue el mismo usuario en dos redes: son dos cuentas", () => {
    const ig = resolverCuenta(cuentas, { usuario: "diegoat", red: "Instagram" });
    const tt = resolverCuenta(cuentas, { usuario: "diegoat", red: "TikTok" });
    expect(ig.ok && ig.cuenta.nombre).toBe("DiegoAT");
    expect(tt.ok && tt.cuenta.nombre).toBe("DiegoAT TikTok");
  });

  it("le da igual la arroba y las mayúsculas", () => {
    for (const usuario of ["@dltsports", "DLTSports", " dltsports "]) {
      const r = resolverCuenta(cuentas, { usuario, red: "Instagram" });
      expect(r.ok && r.cuenta.nombre).toBe("Instagram DLT");
    }
  });

  it("explica qué hacer cuando la cuenta no está cargada", () => {
    const r = resolverCuenta(cuentas, { usuario: "josemora", red: "Instagram" });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.motivo).toContain("Cuentas");
  });

  it("si el archivo no dice la cuenta y hay una sola de esa red, la usa", () => {
    const r = resolverCuenta(cuentas, { usuario: null, red: "TikTok" });
    expect(r.ok && r.cuenta.nombre).toBe("DiegoAT TikTok");
  });

  it("si el archivo no dice la cuenta y hay varias, no adivina", () => {
    const r = resolverCuenta(cuentas, { usuario: null, red: "Instagram" });
    expect(r.ok).toBe(false);
  });

  it("avisa cuando no hay ninguna cuenta de esa red", () => {
    const r = resolverCuenta(cuentas, { usuario: "dlt", red: "YouTube" });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.motivo).toContain("YouTube");
  });
});

describe("usuarioComparable", () => {
  it("es el mismo para todas las formas de escribir un @", () => {
    expect(usuarioComparable("@DLTSports")).toBe("dltsports");
    expect(usuarioComparable("dltsports")).toBe("dltsports");
    expect(usuarioComparable("  ")).toBeNull();
    expect(usuarioComparable(null)).toBeNull();
  });
});
