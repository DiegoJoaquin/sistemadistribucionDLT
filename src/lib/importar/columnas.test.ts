/**
 * Encabezados en cualquier idioma.
 *
 * Meta Business Suite exporta con los encabezados en el idioma de la cuenta.
 * Los de DLT vienen en castellano y los de Living Team Chile en inglés, y el
 * lector solo conocía los castellanos: un archivo en inglés fallaba con "no
 * puedo saber de qué cuenta es" y no había forma de avanzar.
 */
import { describe, expect, it } from "vitest";
import {
  columnasDe,
  formatoDePublicacion,
  META,
  normalizarEncabezado,
} from "./columnas";
import { leerMetaCSV } from "./parsers";
import { detectarOrdenFecha } from "./util";

/** Los encabezados reales de los dos idiomas, en el mismo orden. */
const CASTELLANO = [
  "Identificador de la publicación",
  "Identificador de la cuenta",
  "Nombre de usuario de la cuenta",
  "Nombre de la cuenta",
  "Descripción",
  "Duración (segundos)",
  "Hora de publicación",
  "Enlace permanente",
  "Tipo de publicación",
  "Comentario sobre los datos",
  "Fecha",
  "Visualizaciones",
  "Alcance",
  "Me gusta",
  "Veces que se compartió",
  "Seguimientos",
  "Comentarios",
  "Veces que se guardó",
];

const INGLES = [
  "Post ID",
  "Account ID",
  "Account username",
  "Account name",
  "Description",
  "Duration (sec)",
  "Publish time",
  "Permalink",
  "Post type",
  "Data comment",
  "Date",
  "Views",
  "Reach",
  "Likes",
  "Shares",
  "Follows",
  "Comments",
  "Saves",
];

/** Una fila de datos, la misma para los dos idiomas. */
const FILA = [
  "18012345",
  "17841400000000000",
  "livingteamchile",
  "Living Team Chile",
  "🇨🇱 #TeamChile | entrenamiento de hoy",
  "45",
  "07/22/2026 19:30",
  "https://www.instagram.com/p/ABC123/",
  "Instagram reel",
  "",
  "07/22/2026",
  "20000",
  "10000",
  "300",
  "10",
  "8",
  "20",
  "5",
];

function csv(encabezados: string[], filas: string[][]): string {
  const escapar = (c: string) => `"${c.replace(/"/g, '""')}"`;
  return [encabezados, ...filas].map((f) => f.map(escapar).join(",")).join("\n");
}

describe("normalizarEncabezado", () => {
  it("ignora tildes, mayúsculas y espacios de más", () => {
    expect(normalizarEncabezado("  Descripción  ")).toBe("descripcion");
    expect(normalizarEncabezado("DESCRIPCION")).toBe("descripcion");
    expect(normalizarEncabezado("Hora  de   publicación")).toBe("hora de publicacion");
  });
});

describe("columnasDe", () => {
  it("encuentra la columna esté en el idioma que esté", () => {
    const enEspanol = columnasDe([{ "Nombre de usuario de la cuenta": "dltsports" }]);
    const enIngles = columnasDe([{ "Account username": "livingteamchile" }]);

    expect(enEspanol.clave(...META.cuenta)).toBe("Nombre de usuario de la cuenta");
    expect(enIngles.clave(...META.cuenta)).toBe("Account username");
  });

  it("devuelve null cuando no está, en vez de inventar una columna", () => {
    expect(columnasDe([{ Otra: 1 }]).clave(...META.cuenta)).toBeNull();
    expect(columnasDe([{ Otra: 1 }]).valor({ Otra: 1 }, ...META.cuenta)).toBeNull();
  });

  /*
   * Hay un export real de DLT con las dieciocho columnas en castellano y una
   * decimonovena "Views" en inglés. Gana la castellana, que es la que se
   * verificó contra el Excel de agosto.
   */
  it("con las dos columnas presentes gana la que se pide primero", () => {
    const mezclado = columnasDe([{ Visualizaciones: "100", Views: "999" }]);
    expect(mezclado.clave(...META.visualizaciones)).toBe("Visualizaciones");
    expect(mezclado.valor({ Visualizaciones: "100", Views: "999" }, ...META.visualizaciones)).toBe(
      "100",
    );
  });

  it("guarda los encabezados para poder mostrarlos en un error", () => {
    expect(columnasDe([{ Uno: 1, Dos: 2 }]).encabezados).toEqual(["Uno", "Dos"]);
    expect(columnasDe([]).encabezados).toEqual([]);
  });
});

describe("formatoDePublicacion", () => {
  it("reconoce el formato en los dos idiomas", () => {
    expect(formatoDePublicacion("Reel de Instagram")).toBe("Reel");
    expect(formatoDePublicacion("Instagram reel")).toBe("Reel");
    expect(formatoDePublicacion("Imagen de Instagram")).toBe("Imagen");
    expect(formatoDePublicacion("Instagram image")).toBe("Imagen");
    expect(formatoDePublicacion("Instagram photo")).toBe("Imagen");
    expect(formatoDePublicacion("Secuencia de Instagram")).toBe("Carrusel");
    expect(formatoDePublicacion("Instagram carousel")).toBe("Carrusel");
  });

  it("lo que no reconoce queda sin formato, no adivina", () => {
    expect(formatoDePublicacion("Instagram story")).toBeNull();
    expect(formatoDePublicacion("")).toBeNull();
    expect(formatoDePublicacion(null)).toBeNull();
  });
});

describe("detectarOrdenFecha", () => {
  /*
   * Es la diferencia entre el 3 de julio y el 7 de marzo, y se equivoca en
   * silencio. Estaba escrito a mano como MM/DD porque así venían los archivos
   * en castellano; con archivos en otro idioma eso deja de ser una certeza.
   */
  it("un día mayor que 12 en la primera posición prueba que es día/mes", () => {
    const r = detectarOrdenFecha(["22/07/2026 19:30", "03/07/2026"], "MDY");
    expect(r).toEqual({ orden: "DMY", seguro: true });
  });

  it("un mes mayor que 12 en la segunda prueba que es mes/día", () => {
    const r = detectarOrdenFecha(["07/22/2026 19:30", "07/03/2026"], "DMY");
    expect(r).toEqual({ orden: "MDY", seguro: true });
  });

  it("sin ninguna prueba usa el valor por defecto y lo dice", () => {
    const r = detectarOrdenFecha(["07/03/2026", "01/02/2026"], "MDY");
    expect(r).toEqual({ orden: "MDY", seguro: false });
  });

  it("un archivo contradictorio no se fuerza a ninguno de los dos", () => {
    const r = detectarOrdenFecha(["22/07/2026", "07/22/2026"], "MDY");
    expect(r.seguro).toBe(false);
  });

  it("ignora lo que no sea una fecha", () => {
    expect(detectarOrdenFecha([null, 42, "", "sin fecha"], "MDY").seguro).toBe(false);
  });
});

describe("leerMetaCSV con los dos idiomas", () => {
  /**
   * LA prueba: el mismo archivo en castellano y en inglés tiene que producir
   * exactamente las mismas publicaciones. Si algún alias estuviera mal, esa
   * métrica saldría nula en un idioma y con valor en el otro.
   */
  it("produce lo mismo en castellano que en inglés", () => {
    const es = leerMetaCSV(csv(CASTELLANO, [FILA]));
    const en = leerMetaCSV(csv(INGLES, [FILA]));

    expect(en.publicaciones).toEqual(es.publicaciones);
    expect(en.detectada).toEqual(es.detectada);
    expect(en.cuenta).toBe("livingteamchile");
  });

  it("lee todos los campos del archivo en inglés", () => {
    const r = leerMetaCSV(csv(INGLES, [FILA]));
    const p = r.publicaciones[0];

    expect(p.publicado_en).toBe("2026-07-22T19:30:00");
    expect(p.formato).toBe("Reel");
    expect(p.visualizaciones).toBe(20_000);
    expect(p.alcance).toBe(10_000);
    expect(p.me_gusta).toBe(300);
    expect(p.compartidos).toBe(10);
    expect(p.nuevos_seguidores).toBe(8);
    expect(p.comentarios).toBe(20);
    expect(p.guardados).toBe(5);
    expect(p.duracion_s).toBe(45);
    expect(p.enlace).toBe("https://www.instagram.com/p/ABC123/");
    expect(p.id_externo).toBe("18012345");
    // 300 + 20 + 10 + 5
    expect(p.interacciones).toBe(335);
    expect(p.serie_hashtag).toBe("TEAMCHILE");
  });

  /*
   * El error tiene que ser diagnosticable. Antes decía solo que faltaba la
   * columna en castellano, y con un archivo en otro idioma no había manera de
   * saber qué buscar sin abrir el CSV a mano.
   */
  it("si no encuentra la cuenta, dice qué encabezados sí venían", () => {
    const raro = csv(["Fecha", "Algo", "Otra cosa"], [["01/01/2026", "x", "y"]]);
    expect(() => leerMetaCSV(raro)).toThrow(/Fecha, Algo, Otra cosa/);
    expect(() => leerMetaCSV(raro)).toThrow(/Account username/);
  });

  it("avisa cuando el formato de fecha quedó ambiguo", () => {
    // Todos los días menores que 13: no hay forma de saberlo desde los datos.
    const ambiguo = csv(INGLES, [FILA.map((c, i) => (i === 6 ? "07/03/2026 10:00" : c))]);
    const r = leerMetaCSV(ambiguo);
    expect(r.advertencias.some((a) => a.includes("día/mes"))).toBe(true);
  });

  it("sin ambigüedad no molesta con la advertencia", () => {
    expect(leerMetaCSV(csv(INGLES, [FILA])).advertencias).toEqual([]);
  });
});
