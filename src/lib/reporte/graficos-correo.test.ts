/**
 * Los gráficos del correo.
 *
 * Lo que se verifica acá no es que se vean lindos sino que SOBREVIVAN: Gmail
 * descarta `<svg>`, `<canvas>` y todo el JavaScript, así que un gráfico hecho
 * con cualquiera de esos llegaría como un hueco en blanco a la bandeja de la
 * gerencia. Solo quedan tablas con celdas de fondo de color.
 */
import { describe, expect, it } from "vitest";
import { evolucionSemanal, type FilaAnalitica } from "@/lib/dominio/analitica";
import type { Cuenta } from "@/lib/dominio/redes";
import { barrasHTML, comparativaHTML, evolucionHTML } from "./graficos-correo";

const IG: Cuenta = {
  id: "11111111-1111-4111-8111-111111111111",
  nombre: "Instagram DLT",
  usuario: "@dltsports",
  red: "Instagram",
  es_influencer: false,
  activa: true,
  orden: 1,
};

const TT: Cuenta = {
  id: "22222222-2222-4222-8222-222222222222",
  nombre: "TikTok",
  usuario: "@dltsportsoficial",
  red: "TikTok",
  es_influencer: false,
  activa: true,
  orden: 3,
};

function fila(p: Partial<FilaAnalitica> = {}): FilaAnalitica {
  return {
    cuentaId: IG.id,
    red: "Instagram",
    categoria: "Reel",
    tipo: "Normal",
    fecha: "2026-09-22",
    publicaciones: 1,
    alcance: 10_000,
    visualizaciones: 20_000,
    interacciones: 500,
    nuevos_seguidores: 5,
    visitas_perfil: null,
    vistas_seguidores: null,
    vistas_no_seguidores: null,
    ...p,
  };
}

/** Lo que un cliente de correo descarta y dejaría un hueco en blanco. */
const PROHIBIDO = [/<svg/i, /<canvas/i, /<script/i, /onclick/i, /position\s*:\s*absolute/i];

describe("barrasHTML", () => {
  it("no usa nada que Gmail descarte", () => {
    const html = barrasHTML([
      { etiqueta: "Instagram DLT", valor: 10_000, detalle: "5 pub." },
      { etiqueta: "TikTok", valor: 4_000, detalle: "3 pub." },
    ]);
    for (const p of PROHIBIDO) expect(html).not.toMatch(p);
    // Lo que sí funciona en todos lados: una tabla con celdas de fondo.
    expect(html).toContain("<table");
    expect(html).toContain("background:");
  });

  it("el ancho es proporcional al valor", () => {
    const html = barrasHTML([
      { etiqueta: "A", valor: 100 },
      { etiqueta: "B", valor: 50 },
    ]);
    expect(html).toContain('width="100%"');
    expect(html).toContain('width="50%"');
  });

  /*
   * Una barra invisible se lee como "no hay dato", que es otra cosa que "hay
   * un dato chico" (§9.4).
   */
  it("un valor muy chico igual dibuja algo", () => {
    const html = barrasHTML([
      { etiqueta: "Grande", valor: 100_000 },
      { etiqueta: "Chico", valor: 1 },
    ]);
    expect(html).toContain('width="2%"');
  });

  it("sin dato no hay barra, y se nota", () => {
    const html = barrasHTML([{ etiqueta: "Sin medir", valor: null }]);
    expect(html).toContain('width="0%"');
    expect(html).toContain("—");
  });

  it("escapa el texto para no romper el correo", () => {
    const html = barrasHTML([{ etiqueta: '<script>alert("x")</script>', valor: 1 }]);
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
  });

  it("una lista vacía lo dice en vez de dibujar un marco vacío", () => {
    expect(barrasHTML([])).toContain("Sin datos");
  });

  it("el engagement sale como porcentaje", () => {
    expect(barrasHTML([{ etiqueta: "A", valor: 0.076 }], true)).toContain("7,6%");
  });
});

describe("evolucionHTML", () => {
  const datos = evolucionSemanal(
    [
      fila({ fecha: "2026-09-22", alcance: 10_000 }),
      fila({ fecha: "2026-10-06", alcance: 30_000 }),
      fila({ cuentaId: TT.id, red: "TikTok", fecha: "2026-09-22", alcance: 5_000 }),
    ],
    [IG, TT],
    "alcance",
    { desde: "2026-09-21", hasta: "2026-10-11" },
  );

  it("un bloque por cuenta, sin mezclar escalas", () => {
    const html = evolucionHTML(datos);
    expect(html).toContain("Instagram DLT");
    expect(html).toContain("TikTok");
    expect(html).toContain("semana a semana");
  });

  it("no usa nada que Gmail descarte", () => {
    const html = evolucionHTML(datos);
    for (const p of PROHIBIDO) expect(html).not.toMatch(p);
  });

  /*
   * El hueco tiene que verse como hueco. Una semana sin publicar dibujada con
   * barra sería un dato que no existe.
   */
  it("una semana sin publicar se rotula y no dibuja barra", () => {
    const html = evolucionHTML(datos);
    expect(html).toContain("sin publicar");
    expect(html).toContain("es un hueco, no un cero");
  });

  it("recorta a las últimas semanas pedidas", () => {
    const corto = evolucionHTML(datos, 1);
    // Solo la última semana: la del 22 de septiembre ya no aparece.
    expect(corto).not.toContain("22 sep");
    expect(corto).toContain("5 oct");
  });

  /*
   * YouTube no entrega alcance (§9.6). Dejarlo en el gráfico dibujaba seis
   * filas de guiones, que además se leen como "tuvo cero" — lo contrario de lo
   * que pasa.
   */
  it("una cuenta que no entrega la métrica se saca y se explica", () => {
    const YT: Cuenta = { ...TT, id: "yt", nombre: "YouTube", red: "YouTube" };
    const conYT = evolucionSemanal(
      [
        fila({ fecha: "2026-09-22", alcance: 10_000 }),
        fila({
          cuentaId: YT.id,
          red: "YouTube",
          categoria: "Short",
          tipo: null,
          fecha: "2026-09-22",
          alcance: null,
        }),
      ],
      [IG, YT],
      "alcance",
      { desde: "2026-09-21", hasta: "2026-09-27" },
    );

    const html = evolucionHTML(conYT);
    expect(html).toContain("Instagram DLT");
    expect(html).toContain("no aparece en este gráfico");
    expect(html).toContain("no es que haya dado cero");
    // No quedan filas de guiones de YouTube.
    expect(html.split("YouTube").length - 1).toBe(1);
  });

  it("sin cuentas con publicaciones no dibuja nada", () => {
    const vacio = evolucionSemanal([], [IG], "alcance", {
      desde: "2026-09-21",
      hasta: "2026-09-27",
    });
    expect(evolucionHTML(vacio)).toBe("");
  });
});

describe("comparativaHTML", () => {
  it("dibuja las cuentas y avisa de lo que no es comparable", () => {
    const html = comparativaHTML(
      [
        { nombre: "Instagram DLT", valor: 0.07, publicaciones: 10, noComparable: false },
        { nombre: "YouTube", valor: 0.02, publicaciones: 7, noComparable: true },
      ],
      "engagement",
    );
    expect(html).toContain("Engagement por cuenta");
    expect(html).toContain("no es comparable");
    for (const p of PROHIBIDO) expect(html).not.toMatch(p);
  });

  it("sin el caso raro, no mete la advertencia", () => {
    const html = comparativaHTML(
      [{ nombre: "Instagram DLT", valor: 10_000, publicaciones: 10, noComparable: false }],
      "alcance",
    );
    expect(html).not.toContain("no es comparable");
  });

  it("sin cuentas no dibuja nada", () => {
    expect(comparativaHTML([], "alcance")).toBe("");
  });

  it("una cuenta sin valor se nombra aparte en vez de dibujar una barra vacía", () => {
    const html = comparativaHTML(
      [
        { nombre: "Instagram DLT", valor: 10_000, publicaciones: 10, noComparable: false },
        { nombre: "YouTube", valor: null, publicaciones: 7, noComparable: false },
      ],
      "alcance",
    );
    expect(html).toContain("Instagram DLT");
    expect(html).toContain("YouTube no aparece");
    // YouTube aparece SOLO en la nota, no como fila del gráfico.
    expect(html.split("YouTube").length - 1).toBe(1);
    expect(html).not.toContain("7 pub.");
  });

  it("si ninguna cuenta tiene el dato, no dibuja un gráfico vacío", () => {
    const html = comparativaHTML(
      [{ nombre: "YouTube", valor: null, publicaciones: 7, noComparable: false }],
      "alcance",
    );
    expect(html).toBe("");
  });
});
