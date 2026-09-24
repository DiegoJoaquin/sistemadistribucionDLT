/**
 * Tests del informe por cliente como correo.
 *
 * Lo que este informe tiene que cumplir y el semanal no, porque va a un
 * tercero: decir sobre cuántas publicaciones se calculó cada promedio, y decir
 * qué hashtags del cliente no tuvieron publicaciones.
 */
import { describe, expect, it } from "vitest";
import type { PromediosBase } from "@/lib/dominio/calculo";
import { claveHashtag, type MapaPromedios } from "@/lib/dominio/catastro";
import { construirInforme, type FilaInforme } from "@/lib/dominio/informe";
import type { Cuenta } from "@/lib/dominio/redes";
import { LIMITE_GMAIL_BYTES } from "./semanal";
import { construirReporteCliente, htmlCliente, textoCliente } from "./cliente";

const IG: Cuenta = {
  id: "11111111-1111-4111-8111-111111111111",
  nombre: "Instagram DLT",
  usuario: "@dltsports",
  red: "Instagram",
  es_influencer: false,
  activa: true,
  orden: 1,
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

const CUENTAS = [IG, YT];
const SPARTA = ["SPARTAXDLT", "FUERZASPARTA"];
const PERIODO = { desde: "2026-01-01", hasta: "2026-09-30" };

function fila(p: Partial<FilaInforme> = {}): FilaInforme {
  return {
    cuentaId: IG.id,
    red: "Instagram",
    categoria: "Reel",
    tipo: "Normal",
    hashtag: "SPARTAXDLT",
    fecha: "2026-03-10",
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

function reporte(
  filas: FilaInforme[],
  opciones: {
    hashtags?: string[];
    porHashtag?: MapaPromedios;
    porCuenta?: MapaPromedios;
    mesBase?: string | null;
  } = {},
) {
  const informe = construirInforme(
    "Sparta",
    opciones.hashtags ?? SPARTA,
    filas,
    CUENTAS,
    PERIODO,
    {
      porHashtag: opciones.porHashtag ?? new Map(),
      porCuenta: opciones.porCuenta ?? new Map(),
    },
  );
  return construirReporteCliente(
    informe,
    opciones.mesBase === undefined ? "2026-08-01" : opciones.mesBase,
  );
}

describe("construirReporteCliente", () => {
  it("rotula el mes de la línea base en castellano, no como fecha", () => {
    // Antes salía "la línea base de 2026-08-01" en el correo del cliente.
    expect(reporte([fila()]).nombreBase).toBe("Agosto de 2026");
    expect(htmlCliente(reporte([fila()]))).toContain("línea base de Agosto de 2026");
  });

  it("detecta que la línea base cae dentro del período", () => {
    // Agosto está entre enero y septiembre.
    expect(reporte([fila()]).baseSeSolapa).toBe(true);
    // Diciembre del año anterior, no.
    expect(reporte([fila()], { mesBase: "2025-12-01" }).baseSeSolapa).toBe(false);
    expect(reporte([fila()], { mesBase: null }).baseSeSolapa).toBe(false);
  });
});

describe("htmlCliente", () => {
  it("es un correo completo con el nombre del cliente", () => {
    const html = htmlCliente(reporte([fila()]));
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("Informe de distribución · Sparta");
    expect(html).toContain("01-01-2026 al 30-09-2026");
  });

  /*
   * §9.4 — el promedio de alcance se calcula sobre las publicaciones que lo
   * traen. Con siete de YouTube dentro de diecinueve, "19 publicaciones ·
   * alcance 41.431" se lee como un promedio sobre 19 y no lo es. En un
   * documento que va a un cliente, esa es una cifra mal entendida.
   */
  it("dice sobre cuántas publicaciones se calculó el alcance", () => {
    const html = htmlCliente(
      reporte([
        fila({ hashtag: "SPARTAXDLT" }),
        fila({
          hashtag: "SPARTAXDLT",
          cuentaId: YT.id,
          red: "YouTube",
          categoria: "Short",
          tipo: null,
          alcance: null,
        }),
      ]),
    );
    expect(html).toContain("sobre 1 de 2 publicaciones");
  });

  it("no pone el divisor cuando todas aportaron la métrica", () => {
    const html = htmlCliente(reporte([fila(), fila()]));
    expect(html).not.toContain("sobre 2 de 2");
  });

  it("avisa de los hashtags del cliente que no salieron", () => {
    const html = htmlCliente(reporte([fila({ hashtag: "SPARTAXDLT" })]));
    expect(html).toContain("no tuvo");
    expect(html).toContain("#FUERZASPARTA");
  });

  it("§9.6 — no inventa un engagement mezclando redes", () => {
    const html = htmlCliente(
      reporte([
        fila(),
        fila({
          cuentaId: YT.id,
          red: "YouTube",
          categoria: "Short",
          tipo: null,
          alcance: null,
        }),
      ]),
    );
    expect(html).toContain("no se puede sumar entre redes");
    expect(html).toContain("Alcance: no lo entrega YouTube");
  });

  it("el total de cada cuenta se rotula como del cliente, no de la cuenta", () => {
    const html = htmlCliente(reporte([fila()]));
    expect(html).toContain("Total de Sparta en esta cuenta");
    expect(html).toContain("que el promedio general de la cuenta");
  });

  it("lleva las dos comparaciones de cada serie", () => {
    const porHashtag: MapaPromedios = new Map([
      [claveHashtag(IG.id, "SPARTAXDLT"), base({ alcance_prom: 12_500 })],
    ]);
    const porCuenta: MapaPromedios = new Map([[IG.id, base({ alcance_prom: 5_000 })]]);
    const html = htmlCliente(reporte([fila()], { porHashtag, porCuenta }));

    expect(html).toContain("vs la serie");
    expect(html).toContain("vs la cuenta");
    expect(html).toContain("-20,0%");
    expect(html).toContain("+100,0%");
  });

  it("incluye el mes a mes cuando el período abarca varios meses", () => {
    const html = htmlCliente(
      reporte([
        fila({ fecha: "2026-01-10" }),
        fila({ fecha: "2026-02-10" }),
        fila({ fecha: "2026-03-10" }),
      ]),
    );
    expect(html).toContain("Mes a mes");
    expect(html).toContain("enero 2026");
    expect(html).toContain("marzo 2026");
  });

  it("un solo mes no trae la tabla de evolución: no hay nada que comparar", () => {
    const html = htmlCliente(reporte([fila({ fecha: "2026-03-10" })]));
    expect(html).not.toContain("Mes a mes");
  });

  it("escapa el contenido para no romper el correo", () => {
    const html = htmlCliente(
      reporte([fila()], { hashtags: ['<script>alert("x")</script>', "SPARTAXDLT"] }),
    );
    expect(html).not.toContain("<script>alert");
  });

  it("sin datos lo dice en vez de mandar un correo vacío", () => {
    const html = htmlCliente(reporte([fila({ hashtag: "OTRAMARCA" })]));
    expect(html).toContain("No hay publicaciones de Sparta en este período");
  });

  it("incluye el aviso de solape cuando corresponde", () => {
    expect(htmlCliente(reporte([fila()]))).toContain("cae dentro del período");
  });

  it("aclara que las publicaciones sin hashtag no entran", () => {
    const html = htmlCliente(reporte([fila()]));
    expect(html).toContain("Las publicaciones sin hashtag no entran");
    expect(html).toContain("promedios por publicación, no sumas");
  });

  /*
   * Gmail recorta sobre ~102 KB. Un informe de nueve meses de un cliente con
   * muchas series puede acercarse, así que se mide con margen igual que el
   * semanal.
   */
  it("entra en el límite de Gmail con un informe grande", () => {
    const hashtags = Array.from({ length: 40 }, (_, i) => `SPARTASERIE${i}`);
    const filas = hashtags.flatMap((h, i) =>
      Array.from({ length: 5 }, (_, j) =>
        fila({
          hashtag: h,
          fecha: `2026-0${(i % 9) + 1}-1${j}`,
          alcance: 10_000 + i * 100 + j,
        }),
      ),
    );

    const html = htmlCliente(reporte(filas, { hashtags }), {
      urlBase: "https://distribuciondlt.vercel.app",
    });

    expect(filas).toHaveLength(200);
    expect(Buffer.byteLength(html, "utf8")).toBeLessThan(LIMITE_GMAIL_BYTES * 0.7);
  });
});

describe("textoCliente", () => {
  it("lleva el resumen, las series y el detalle por cuenta", () => {
    const texto = textoCliente(reporte([fila(), fila({ fecha: "2026-04-10" })]));
    expect(texto).toContain("INFORME DE DISTRIBUCIÓN — SPARTA");
    expect(texto).toContain("SERIES DEL CLIENTE");
    expect(texto).toContain("DETALLE POR CUENTA");
  });

  it("no lleva etiquetas HTML: es para pegar en WhatsApp", () => {
    const texto = textoCliente(reporte([fila()]));
    expect(texto).not.toMatch(/<[a-z]+[\s>]/i);
  });

  it("también dice el divisor cuando no es el total", () => {
    const texto = textoCliente(
      reporte([
        fila(),
        fila({
          cuentaId: YT.id,
          red: "YouTube",
          categoria: "Short",
          tipo: null,
          alcance: null,
        }),
      ]),
    );
    expect(texto).toContain("sobre 1 de 2 publicaciones");
  });

  it("sin datos lo dice y no inventa secciones", () => {
    const texto = textoCliente(reporte([fila({ hashtag: "OTRAMARCA" })]));
    expect(texto).toContain("No hay publicaciones de Sparta");
    expect(texto).not.toContain("DETALLE POR CUENTA");
  });
});
