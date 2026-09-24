/**
 * Tests del reporte semanal.
 *
 * Dos cosas que este reporte tiene que cumplir y el diario no:
 *  - Cada serie lleva LAS DOS comparaciones, contra sí misma y contra la cuenta.
 *  - No lleva ninguna pregunta de texto libre: se saca a pedido del equipo.
 */
import { describe, expect, it } from "vitest";
import type { Catastro } from "@/lib/datos/consultas";
import { construirLineaPerfil, type PromediosBase } from "@/lib/dominio/calculo";
import {
  claveHashtag,
  construirBloque,
  destacadas,
  type FilaCatastro,
  type MapaPromedios,
  seriesCruzadas,
} from "@/lib/dominio/catastro";
import type { Cuenta } from "@/lib/dominio/redes";
import { construirReporteSemanal, htmlSemanal, textoSemanal } from "./semanal";

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

const YT: Cuenta = {
  id: "33333333-3333-4333-8333-333333333333",
  nombre: "YouTube",
  usuario: "@dltsportstv",
  red: "YouTube",
  es_influencer: false,
  activa: true,
  orden: 4,
};

function fila(c: Cuenta, p: Partial<FilaCatastro> = {}): FilaCatastro {
  return {
    cuentaId: c.id,
    red: c.red,
    categoria: c.red === "Instagram" ? "Reel" : "Video",
    tipo: c.red === "Instagram" ? "Normal" : null,
    hashtag: "FECHA21XDLT",
    publicaciones: 1,
    alcance: c.red === "YouTube" ? null : 10_000,
    visualizaciones: 20_000,
    interacciones: 500,
    nuevos_seguidores: 5,
    visitas_perfil: null,
    vistas_seguidores: null,
    vistas_no_seguidores: null,
    ...p,
  };
}

function base(p: Partial<PromediosBase> = {}): PromediosBase {
  return {
    n_publicaciones: 20,
    alcance_prom: 8_000,
    visualizaciones_prom: 16_000,
    interacciones_prom: 400,
    nuevos_seguidores_prom: 4,
    engagement_prom: 0.05,
    ...p,
  };
}

/** Un catastro armado a mano, como lo entregaría la consulta. */
function catastro(
  filas: FilaCatastro[],
  cuentas: Cuenta[],
  opciones: {
    porHashtag?: MapaPromedios;
    porCuenta?: MapaPromedios;
    mesBase?: string | null;
    desde?: string;
    hasta?: string;
  } = {},
): Catastro {
  const porHashtag = opciones.porHashtag ?? new Map();
  const porCuenta = opciones.porCuenta ?? new Map();
  const conActividad = cuentas.filter((c) => filas.some((f) => f.cuentaId === c.id));
  const bloques = conActividad.map((c) =>
    construirBloque(filas, c, { porHashtag, porCuenta }),
  );
  const { mejores, peores } = destacadas(bloques);
  const mes = opciones.mesBase === undefined ? "2026-08-01" : opciones.mesBase;

  return {
    desde: opciones.desde ?? "2026-09-21",
    hasta: opciones.hasta ?? "2026-09-27",
    base: mes
      ? {
          id: "base",
          mes,
          nombre: "agosto",
          activa: true,
          creado_por: null,
          creado_en: "2026-09-01T00:00:00Z",
        }
      : null,
    bloques,
    cruzadas: seriesCruzadas(bloques),
    mejores,
    peores,
    perfil: conActividad
      .map((c) => construirLineaPerfil(filas, c))
      .filter((l) => !l.sinDatos),
    publicaciones: filas.reduce((n, f) => n + f.publicaciones, 0),
    series: new Set(filas.filter((f) => f.hashtag).map((f) => f.hashtag)).size,
    hayAlgo: filas.length > 0,
  };
}

describe("construirReporteSemanal", () => {
  it("rotula el período como semana, no como día", () => {
    const r = construirReporteSemanal(catastro([fila(IG)], [IG]));
    expect(r.periodo).toBe("21 al 27 de septiembre de 2026");
    expect(r.nombreBase).toBe("Agosto de 2026");
  });

  it("cuenta publicaciones, series y cuentas con actividad", () => {
    const r = construirReporteSemanal(
      catastro(
        [
          fila(IG, { hashtag: "A" }),
          fila(IG, { hashtag: "B" }),
          fila(TT, { hashtag: "A" }),
        ],
        [IG, TT, YT],
      ),
    );
    expect(r.publicaciones).toBe(3);
    expect(r.series).toBe(2);
    // YouTube no publicó: no aparece.
    expect(r.cuentas).toBe(2);
  });

  /*
   * Si la base es del mismo mes que la semana, las publicaciones de la semana
   * están DENTRO de la referencia. Callarlo hace que un 0,0% se lea como
   * "igual que siempre" cuando en realidad es "no hay con qué comparar".
   */
  it("avisa cuando la línea base se solapa con la semana", () => {
    const solapa = construirReporteSemanal(
      catastro([fila(IG)], [IG], { mesBase: "2026-09-01" }),
    );
    expect(solapa.baseSeSolapa).toBe(true);

    const limpio = construirReporteSemanal(
      catastro([fila(IG)], [IG], { mesBase: "2026-08-01" }),
    );
    expect(limpio.baseSeSolapa).toBe(false);
  });

  it("detecta el solape también cuando la semana cruza el mes", () => {
    const r = construirReporteSemanal(
      catastro([fila(IG)], [IG], {
        desde: "2026-09-28",
        hasta: "2026-10-04",
        mesBase: "2026-10-01",
      }),
    );
    expect(r.baseSeSolapa).toBe(true);
  });

  it("sin línea base activa no hay nombre ni solape", () => {
    const r = construirReporteSemanal(catastro([fila(IG)], [IG], { mesBase: null }));
    expect(r.nombreBase).toBeNull();
    expect(r.baseSeSolapa).toBe(false);
  });
});

describe("htmlSemanal", () => {
  const porHashtag: MapaPromedios = new Map([
    [claveHashtag(IG.id, "FECHA21XDLT"), base({ alcance_prom: 12_500 })],
  ]);
  const porCuenta: MapaPromedios = new Map([[IG.id, base({ alcance_prom: 5_000 })]]);

  const r = construirReporteSemanal(
    catastro([fila(IG)], [IG], { porHashtag, porCuenta }),
  );
  const html = htmlSemanal(r);

  it("muestra las dos comparaciones de cada serie", () => {
    // -20% contra su propia serie, +100% contra el promedio de la cuenta.
    expect(html).toContain("-20,0%");
    expect(html).toContain("+100,0%");
    expect(html).toContain("vs la serie");
    expect(html).toContain("vs la cuenta");
  });

  it("NO lleva ninguna pregunta de texto libre", () => {
    for (const rastro of [
      "aprendimos",
      "recomendamos",
      "riesgo",
      "conversación de la audiencia",
      "plan de publicaciones",
      "Lectura del día",
    ]) {
      expect(html.toLowerCase()).not.toContain(rastro.toLowerCase());
    }
  });

  it("es un correo completo y con el título de la semana", () => {
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("Catastro semanal de distribución");
    expect(html).toContain("21 al 27 de septiembre de 2026");
  });

  it("escapa el contenido para no romper el correo", () => {
    const malicioso: Cuenta = { ...IG, nombre: '<script>alert("x")</script>' };
    const salida = htmlSemanal(
      construirReporteSemanal(catastro([fila(malicioso)], [malicioso])),
    );
    expect(salida).not.toContain("<script>alert");
    expect(salida).toContain("&lt;script&gt;");
  });

  it("sin datos lo dice en vez de mandar un correo vacío", () => {
    const vacio = htmlSemanal(construirReporteSemanal(catastro([], [IG])));
    expect(vacio).toContain("no tiene publicaciones cargadas");
  });

  it("incluye el aviso de solape cuando corresponde", () => {
    const solapado = htmlSemanal(
      construirReporteSemanal(catastro([fila(IG)], [IG], { mesBase: "2026-09-01" })),
    );
    expect(solapado).toContain("mismo mes que esta semana");
  });

  it("§9.6 — en YouTube rotula que la columna es de visualizaciones", () => {
    const salida = htmlSemanal(
      construirReporteSemanal(
        catastro([fila(YT, { categoria: "Short" })], [YT]),
      ),
    );
    expect(salida).toContain("Alcance: no lo entrega YouTube");
    expect(salida).toContain("Visualiz.");
    expect(salida).toContain("no es comparable");
  });

  it("las métricas de perfil van como línea, no como tabla aparte", () => {
    const conPerfil = htmlSemanal(
      construirReporteSemanal(
        catastro(
          [
            fila(IG, {
              visitas_perfil: 300,
              vistas_seguidores: 700,
              vistas_no_seguidores: 300,
            }),
          ],
          [IG],
        ),
      ),
    );
    expect(conPerfil).toContain("Visitas al perfil:");
    expect(conPerfil).toContain("% de no seguidores:");
    // §9.7 — todavía no tienen promedio histórico y se dice.
    expect(conPerfil).toContain("sin línea base");
  });

  it("dice cuando no se cargaron las métricas de perfil", () => {
    expect(html).toContain("Métricas de perfil: no se cargaron");
  });

  it("marca las series que no están en la línea base", () => {
    const nueva = htmlSemanal(
      construirReporteSemanal(catastro([fila(IG, { hashtag: "ESTRENO" })], [IG])),
    );
    expect(nueva).toContain("serie nueva");
  });

  it("muestra las series que salieron en más de una cuenta", () => {
    const filas = [fila(IG), fila(TT)];
    const salida = htmlSemanal(
      construirReporteSemanal(catastro(filas, [IG, TT])),
    );
    expect(salida).toContain("Series en más de una cuenta");
    expect(salida).toContain("en 2 cuentas");
    expect(salida).toContain("no se promedian entre sí");
  });

  it("dice explícitamente que los valores son promedios, no sumas", () => {
    expect(html).toContain("promedios por publicación, no sumas");
  });
});

describe("textoSemanal", () => {
  const porHashtag: MapaPromedios = new Map([
    [claveHashtag(IG.id, "FECHA21XDLT"), base({ alcance_prom: 12_500 })],
  ]);
  const porCuenta: MapaPromedios = new Map([[IG.id, base({ alcance_prom: 5_000 })]]);
  const r = construirReporteSemanal(
    catastro([fila(IG)], [IG], { porHashtag, porCuenta }),
  );
  const texto = textoSemanal(r);

  it("lleva las dos comparaciones en cada serie", () => {
    expect(texto).toContain("que la serie");
    expect(texto).toContain("que la cuenta");
    expect(texto).toContain("-20,0%");
    expect(texto).toContain("+100,0%");
  });

  it("NO lleva preguntas de texto libre", () => {
    for (const rastro of ["aprendimos", "recomendamos", "riesgo"]) {
      expect(texto.toLowerCase()).not.toContain(rastro);
    }
  });

  it("no lleva etiquetas HTML: es para pegar en WhatsApp", () => {
    expect(texto).not.toMatch(/<[a-z]+[\s>]/i);
  });

  it("sin datos lo dice y no inventa secciones", () => {
    const vacio = textoSemanal(construirReporteSemanal(catastro([], [IG])));
    expect(vacio).toContain("no tiene publicaciones cargadas");
    expect(vacio).not.toContain("CATASTRO POR CUENTA");
  });

  it("§9.6 — dice que YouTube no entrega alcance", () => {
    const salida = textoSemanal(
      construirReporteSemanal(catastro([fila(YT, { categoria: "Short" })], [YT])),
    );
    expect(salida).toContain("Alcance: no lo entrega YouTube");
  });
});
