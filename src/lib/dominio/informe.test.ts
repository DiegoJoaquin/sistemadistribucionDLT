import { describe, expect, it } from "vitest";
import type { PromediosBase } from "./calculo";
import { claveHashtag, type MapaPromedios } from "./catastro";
import {
  construirInforme,
  evolucionMensual,
  type FilaInforme,
  filtrarPorHashtags,
  seriesDelCliente,
  totalDelCliente,
} from "./informe";
import type { Cuenta } from "./redes";

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

const CUENTAS = [IG, TT, YT];
const SPARTA = ["SPARTAXDLT", "FUERZASPARTA"];

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

const SIN_BASE = { porHashtag: new Map(), porCuenta: new Map() };

describe("filtrarPorHashtags", () => {
  it("deja solo los hashtags del cliente", () => {
    const filas = [
      fila({ hashtag: "SPARTAXDLT" }),
      fila({ hashtag: "FUERZASPARTA" }),
      fila({ hashtag: "OTRAMARCA" }),
    ];
    expect(filtrarPorHashtags(filas, SPARTA)).toHaveLength(2);
  });

  /*
   * Lo más importante de esta función: una publicación sin hashtag NO se puede
   * atribuir al cliente. Incluirla "por si acaso" metería contenido ajeno en
   * un informe que se le manda a un tercero.
   */
  it("nunca incluye las publicaciones sin hashtag", () => {
    const filas = [fila({ hashtag: null }), fila({ hashtag: "SPARTAXDLT" })];
    const r = filtrarPorHashtags(filas, SPARTA);
    expect(r).toHaveLength(1);
    expect(r[0].hashtag).toBe("SPARTAXDLT");
  });

  it("con una lista vacía no devuelve nada, en vez de devolver todo", () => {
    expect(filtrarPorHashtags([fila()], [])).toEqual([]);
  });
});

describe("totalDelCliente", () => {
  it("§9.1 — promedio por publicación, no suma", () => {
    const t = totalDelCliente([
      fila({ alcance: 10_000 }),
      fila({ alcance: 20_000 }),
      fila({ alcance: 30_000 }),
    ]);
    expect(t.publicaciones).toBe(3);
    expect(t.metricas.alcance).toBe(20_000);
  });

  it("cuenta series y cuentas distintas", () => {
    const t = totalDelCliente([
      fila({ hashtag: "SPARTAXDLT" }),
      fila({ hashtag: "FUERZASPARTA" }),
      fila({ cuentaId: TT.id, red: "TikTok", hashtag: "SPARTAXDLT" }),
    ]);
    expect(t.series).toBe(2);
    expect(t.cuentas).toBe(2);
  });

  /*
   * §9.6 — el engagement de YouTube va sobre visualizaciones y el del resto
   * sobre alcance. Sumarlos daría un número que parece comparable y no lo es.
   */
  it("no calcula engagement cuando hay más de una red", () => {
    const unaRed = totalDelCliente([fila(), fila()]);
    expect(unaRed.metricas.engagement).not.toBeNull();

    const dosRedes = totalDelCliente([
      fila(),
      fila({ cuentaId: YT.id, red: "YouTube", alcance: null, categoria: "Short", tipo: null }),
    ]);
    expect(dosRedes.metricas.engagement).toBeNull();
  });

  it("§9.4 — una métrica que ninguna fila trae queda nula, no en cero", () => {
    const t = totalDelCliente([fila({ nuevos_seguidores: null })]);
    expect(t.metricas.nuevos_seguidores).toBeNull();
  });
});

describe("evolucionMensual", () => {
  it("agrupa por mes y ordena cronológicamente", () => {
    const r = evolucionMensual([
      fila({ fecha: "2026-03-10", alcance: 30_000 }),
      fila({ fecha: "2026-01-05", alcance: 10_000 }),
      fila({ fecha: "2026-01-20", alcance: 20_000 }),
      fila({ fecha: "2026-02-14", alcance: 40_000 }),
    ]);

    expect(r.map((m) => m.mes)).toEqual(["2026-01", "2026-02", "2026-03"]);
    // Enero: dos publicaciones, promedio 15.000.
    expect(r[0].publicaciones).toBe(2);
    expect(r[0].alcance).toBe(15_000);
  });

  it("cruza el fin de año sin mezclar meses del mismo número", () => {
    const r = evolucionMensual([
      fila({ fecha: "2025-12-31" }),
      fila({ fecha: "2026-12-01" }),
    ]);
    expect(r.map((m) => m.mes)).toEqual(["2025-12", "2026-12"]);
  });

  it("una publicación de YouTube no diluye el promedio de alcance", () => {
    /*
     * §9.4 — YouTube no trae alcance, así que su fila no entra al numerador
     * NI al denominador. Si contara como cero, el promedio caería a la mitad.
     */
    const r = evolucionMensual([
      fila({ fecha: "2026-01-05", alcance: 10_000 }),
      fila({
        fecha: "2026-01-06",
        cuentaId: YT.id,
        red: "YouTube",
        categoria: "Short",
        tipo: null,
        alcance: null,
        visualizaciones: 50_000,
      }),
    ]);

    expect(r[0].publicaciones).toBe(2);
    expect(r[0].alcance).toBe(10_000);
    // Las visualizaciones sí las traen las dos.
    expect(r[0].visualizaciones).toBe(35_000);
  });
});

describe("seriesDelCliente", () => {
  it("ordena por volumen y dice en cuántas cuentas salió cada serie", () => {
    const r = seriesDelCliente([
      fila({ hashtag: "FUERZASPARTA" }),
      fila({ hashtag: "SPARTAXDLT" }),
      fila({ hashtag: "SPARTAXDLT" }),
      fila({ cuentaId: TT.id, red: "TikTok", hashtag: "SPARTAXDLT" }),
    ]);

    expect(r.map((s) => [s.hashtag, s.publicaciones, s.cuentas])).toEqual([
      ["SPARTAXDLT", 3, 2],
      ["FUERZASPARTA", 1, 1],
    ]);
  });
});

describe("construirInforme", () => {
  it("el TOTAL de cada bloque es el total DEL CLIENTE en esa cuenta", () => {
    /*
     * Es la diferencia de fondo con el catastro. Si el filtro se aplicara
     * después de armar los bloques, el TOTAL seguiría siendo el de la cuenta
     * completa y el informe le atribuiría al cliente contenido ajeno.
     */
    const filas = [
      fila({ hashtag: "SPARTAXDLT", alcance: 10_000 }),
      fila({ hashtag: "OTRAMARCA", alcance: 1_000_000 }),
    ];

    const r = construirInforme(
      "Sparta",
      SPARTA,
      filas,
      CUENTAS,
      { desde: "2026-01-01", hasta: "2026-12-31" },
      SIN_BASE,
    );

    expect(r.bloques).toHaveLength(1);
    expect(r.bloques[0].total.publicaciones).toBe(1);
    expect(r.bloques[0].total.periodo.alcance).toBe(10_000);
    expect(r.total.publicaciones).toBe(1);
  });

  it("solo aparecen las cuentas donde el cliente publicó", () => {
    const r = construirInforme(
      "Sparta",
      SPARTA,
      [fila({ cuentaId: TT.id, red: "TikTok", categoria: "Video", tipo: null })],
      CUENTAS,
      { desde: "2026-01-01", hasta: "2026-12-31" },
      SIN_BASE,
    );
    expect(r.bloques.map((b) => b.cuenta.nombre)).toEqual(["TikTok"]);
  });

  /*
   * Decir qué series NO salieron importa tanto como las que sí: si el cliente
   * esperaba dos y salió una, el informe tiene que mostrarlo en vez de dejar
   * que se note por la ausencia de una fila.
   */
  it("separa los hashtags configurados que no tuvieron publicaciones", () => {
    const r = construirInforme(
      "Sparta",
      SPARTA,
      [fila({ hashtag: "SPARTAXDLT" })],
      CUENTAS,
      { desde: "2026-01-01", hasta: "2026-12-31" },
      SIN_BASE,
    );

    expect(r.hashtagsConDatos).toEqual(["SPARTAXDLT"]);
    expect(r.hashtagsSinDatos).toEqual(["FUERZASPARTA"]);
    expect(r.hashtags).toEqual(["FUERZASPARTA", "SPARTAXDLT"]);
  });

  it("sin publicaciones del cliente lo dice y no inventa bloques", () => {
    const r = construirInforme(
      "Sparta",
      SPARTA,
      [fila({ hashtag: "OTRAMARCA" })],
      CUENTAS,
      { desde: "2026-01-01", hasta: "2026-12-31" },
      SIN_BASE,
    );
    expect(r.hayDatos).toBe(false);
    expect(r.bloques).toEqual([]);
    expect(r.hashtagsSinDatos).toEqual(["FUERZASPARTA", "SPARTAXDLT"]);
  });

  it("las dos comparaciones siguen siendo las del catastro", () => {
    const porHashtag: MapaPromedios = new Map([
      [claveHashtag(IG.id, "SPARTAXDLT"), base({ alcance_prom: 12_500 })],
    ]);
    const porCuenta: MapaPromedios = new Map([[IG.id, base({ alcance_prom: 5_000 })]]);

    const r = construirInforme(
      "Sparta",
      SPARTA,
      [fila({ alcance: 10_000 })],
      CUENTAS,
      { desde: "2026-01-01", hasta: "2026-12-31" },
      { porHashtag, porCuenta },
    );

    const serie = r.bloques[0].series[0];
    // -20% contra su propia serie, +100% contra el promedio de la cuenta.
    expect(serie.vsSuBase.alcance).toBeCloseTo(-0.2, 10);
    expect(serie.vsPromedioCuenta.alcance).toBeCloseTo(1, 10);
  });

  it("arma la evolución mensual de un período largo", () => {
    const filas = ["01", "02", "03", "04"].map((mes, i) =>
      fila({ fecha: `2026-${mes}-15`, alcance: (i + 1) * 10_000 }),
    );

    const r = construirInforme(
      "Sparta",
      SPARTA,
      filas,
      CUENTAS,
      { desde: "2026-01-01", hasta: "2026-09-30" },
      SIN_BASE,
    );

    expect(r.porMes).toHaveLength(4);
    expect(r.porMes.map((m) => m.alcance)).toEqual([10_000, 20_000, 30_000, 40_000]);
  });
});
