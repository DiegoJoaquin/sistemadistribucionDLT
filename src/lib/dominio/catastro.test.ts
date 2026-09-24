import { describe, expect, it } from "vitest";
import type { PromediosBase } from "./calculo";
import {
  claveHashtag,
  construirBloque,
  construirLineaCatastro,
  cortesDe,
  destacadas,
  etiquetaDeCorte,
  type FilaCatastro,
  filasDeCorte,
  type MapaPromedios,
  seriesCruzadas,
} from "./catastro";
import { semanaAnterior, semanaDe, semanaSiguiente, rotularSemana } from "./formato";
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

function fila(p: Partial<FilaCatastro> = {}): FilaCatastro {
  return {
    cuentaId: IG.id,
    red: "Instagram",
    categoria: "Reel",
    tipo: "Normal",
    hashtag: "FECHA21XDLT",
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

describe("cortes", () => {
  it("distingue el TOTAL de las publicaciones sin hashtag", () => {
    expect(etiquetaDeCorte({ tipo: "total" })).toBe("TOTAL");
    expect(etiquetaDeCorte({ tipo: "sin-hashtag" })).toBe("Sin hashtag");
    expect(etiquetaDeCorte({ tipo: "hashtag", hashtag: "A" })).toBe("#A");
  });

  it("la clave de 'sin hashtag' no puede chocar con una serie real", () => {
    // Un hashtag normalizado nunca lleva "#".
    expect(claveHashtag(IG.id, null)).toBe(`${IG.id}|#SIN`);
    expect(claveHashtag(IG.id, "SIN")).not.toBe(claveHashtag(IG.id, null));
  });

  it("selecciona las filas de cada corte", () => {
    const filas = [
      fila({ hashtag: "A" }),
      fila({ hashtag: "B" }),
      fila({ hashtag: null }),
      fila({ cuentaId: TT.id, hashtag: "A" }),
    ];

    expect(filasDeCorte(filas, IG.id, { tipo: "total" })).toHaveLength(3);
    expect(filasDeCorte(filas, IG.id, { tipo: "hashtag", hashtag: "A" })).toHaveLength(1);
    expect(filasDeCorte(filas, IG.id, { tipo: "sin-hashtag" })).toHaveLength(1);
  });

  it("ordena las series por publicaciones y deja el resto sin hashtag al final", () => {
    const filas = [
      fila({ hashtag: "POCO" }),
      fila({ hashtag: null }),
      fila({ hashtag: null }),
      fila({ hashtag: null }),
      fila({ hashtag: "MUCHO" }),
      fila({ hashtag: "MUCHO" }),
    ];

    expect(cortesDe(filas, IG.id)).toEqual([
      { tipo: "hashtag", hashtag: "MUCHO" },
      { tipo: "hashtag", hashtag: "POCO" },
      // Tres publicaciones y aun así al final: es el resto, no una serie.
      { tipo: "sin-hashtag" },
    ]);
  });
});

describe("las dos comparaciones", () => {
  /*
   * El caso que motiva todo: una serie que viene cayendo respecto de sí misma
   * y que, aun así, es lo mejor que tiene la cuenta. Con una sola comparación
   * se lee como un fracaso o como un éxito, según cuál se mire.
   */
  it("una serie puede bajar contra sí misma y seguir sobre el promedio de la cuenta", () => {
    const porHashtag: MapaPromedios = new Map([
      [claveHashtag(IG.id, "FECHA21XDLT"), base({ alcance_prom: 12_500 })],
    ]);
    const porCuenta: MapaPromedios = new Map([[IG.id, base({ alcance_prom: 5_000 })]]);

    const bloque = construirBloque([fila({ alcance: 10_000 })], IG, {
      porHashtag,
      porCuenta,
    });
    const serie = bloque.series[0];

    // -20% contra su propio promedio histórico...
    expect(serie.vsSuBase.alcance).toBeCloseTo(-0.2, 10);
    // ...y +100% contra el promedio de la cuenta.
    expect(serie.vsPromedioCuenta.alcance).toBeCloseTo(1, 10);
  });

  it("el TOTAL no se compara consigo mismo", () => {
    const porCuenta: MapaPromedios = new Map([[IG.id, base()]]);
    const bloque = construirBloque([fila()], IG, {
      porHashtag: new Map(),
      porCuenta,
    });

    expect(bloque.total.vsSuBase.alcance).toBeCloseTo(0.25, 10);
    // Sería el mismo número: una columna de ceros que no dice nada.
    expect(bloque.total.vsPromedioCuenta.alcance).toBeNull();
    expect(bloque.total.baseCuenta).toBeNull();
  });

  it("una serie nueva no tiene con qué compararse y se marca como tal", () => {
    const porCuenta: MapaPromedios = new Map([[IG.id, base()]]);
    const bloque = construirBloque([fila({ hashtag: "ESTRENO" })], IG, {
      porHashtag: new Map(),
      porCuenta,
    });
    const serie = bloque.series[0];

    expect(serie.serieNueva).toBe(true);
    // §4.1 — sin base es guion, nunca 0%.
    expect(serie.vsSuBase.alcance).toBeNull();
    // Pero sí se puede decir cómo rinde frente a la cuenta.
    expect(serie.vsPromedioCuenta.alcance).toBeCloseTo(0.25, 10);
  });

  it("sin línea base activa, las dos comparaciones son guion", () => {
    const bloque = construirBloque([fila()], IG, {
      porHashtag: new Map(),
      porCuenta: new Map(),
    });
    expect(bloque.series[0].vsSuBase.alcance).toBeNull();
    expect(bloque.series[0].vsPromedioCuenta.alcance).toBeNull();
    expect(bloque.total.vsSuBase.alcance).toBeNull();
  });

  it("§9.1 — los valores del período son promedios por publicación, no sumas", () => {
    const linea = construirLineaCatastro(
      [
        fila({ alcance: 10_000 }),
        fila({ alcance: 20_000 }),
        fila({ alcance: 30_000 }),
      ],
      IG,
      { tipo: "hashtag", hashtag: "FECHA21XDLT" },
      base({ alcance_prom: 20_000 }),
      base(),
    );

    expect(linea.publicaciones).toBe(3);
    // 60.000 / 3 = 20.000, igual que la base: 0%. Si comparara la SUMA daría
    // +200%, que es exactamente el error que tenía el Excel.
    expect(linea.periodo.alcance).toBe(20_000);
    expect(linea.vsSuBase.alcance).toBe(0);
  });

  it("§9.4 — una métrica que no trae ninguna fila queda nula, no en cero", () => {
    const linea = construirLineaCatastro(
      [fila({ nuevos_seguidores: null })],
      IG,
      { tipo: "hashtag", hashtag: "FECHA21XDLT" },
      base(),
      base(),
    );
    expect(linea.periodo.nuevos_seguidores).toBeNull();
    expect(linea.vsSuBase.nuevos_seguidores).toBeNull();
  });

  it("§9.6 — en YouTube el engagement va sobre visualizaciones y se rotula", () => {
    const linea = construirLineaCatastro(
      [
        fila({
          cuentaId: YT.id,
          red: "YouTube",
          categoria: "Short",
          tipo: null,
          alcance: null,
          visualizaciones: 10_000,
          interacciones: 500,
        }),
      ],
      YT,
      { tipo: "hashtag", hashtag: "FECHA21XDLT" },
      null,
      null,
    );

    expect(linea.engagementNoComparable).toBe(true);
    expect(linea.periodo.engagement).toBeCloseTo(0.05, 10);
    expect(linea.periodo.alcance).toBeNull();
  });

  it("§9.2 — el TOTAL no es la suma de las series", () => {
    /*
     * Una publicación con hashtag y otra sin él: el TOTAL son 2, no 1 + 1
     * calculado aparte. Importa porque en Instagram una fila entra en dos
     * categorías y sumar cortes la contaría dos veces.
     */
    const bloque = construirBloque(
      [fila({ hashtag: "A", alcance: 10_000 }), fila({ hashtag: null, alcance: 30_000 })],
      IG,
      { porHashtag: new Map(), porCuenta: new Map() },
    );

    expect(bloque.total.publicaciones).toBe(2);
    expect(bloque.total.periodo.alcance).toBe(20_000);
    expect(bloque.series).toHaveLength(2);
  });
});

describe("seriesCruzadas", () => {
  it("encuentra el mismo hashtag en dos cuentas y las deja separadas", () => {
    const filas = [
      fila({ hashtag: "FECHA21XDLT", alcance: 10_000 }),
      fila({
        cuentaId: TT.id,
        red: "TikTok",
        categoria: "Video",
        tipo: null,
        hashtag: "FECHA21XDLT",
        alcance: 40_000,
      }),
      // Esta solo sale en Instagram: no es cruzada.
      fila({ hashtag: "SOLOIG" }),
    ];

    const opciones = { porHashtag: new Map(), porCuenta: new Map() };
    const bloques = [
      construirBloque(filas, IG, opciones),
      construirBloque(filas, TT, opciones),
    ];

    const cruzadas = seriesCruzadas(bloques);
    expect(cruzadas).toHaveLength(1);
    expect(cruzadas[0].hashtag).toBe("FECHA21XDLT");
    expect(cruzadas[0].publicaciones).toBe(2);
    // Cada cuenta con su propio número, sin promediarlas.
    expect(cruzadas[0].cuentas.map((c) => [c.cuenta.nombre, c.periodo.alcance])).toEqual([
      ["Instagram DLT", 10_000],
      ["TikTok", 40_000],
    ]);
  });

  it("las publicaciones sin hashtag no son una serie cruzada", () => {
    const filas = [
      fila({ hashtag: null }),
      fila({ cuentaId: TT.id, red: "TikTok", categoria: "Video", tipo: null, hashtag: null }),
    ];
    const opciones = { porHashtag: new Map(), porCuenta: new Map() };
    expect(
      seriesCruzadas([
        construirBloque(filas, IG, opciones),
        construirBloque(filas, TT, opciones),
      ]),
    ).toEqual([]);
  });
});

describe("destacadas", () => {
  it("§9.6 — en YouTube destaca por visualizaciones, no por alcance", () => {
    /*
     * YouTube no entrega alcance, así que con el alcance como única métrica
     * nunca aparecía: publicaba toda la semana y la lista lo ignoraba.
     */
    const porHashtag: MapaPromedios = new Map([
      [
        claveHashtag(YT.id, "SUBEYT"),
        base({ alcance_prom: null, visualizaciones_prom: 5_000 }),
      ],
    ]);
    const bloques = [
      construirBloque(
        [
          fila({
            cuentaId: YT.id,
            red: "YouTube",
            categoria: "Short",
            tipo: null,
            hashtag: "SUBEYT",
            alcance: null,
            visualizaciones: 10_000,
          }),
        ],
        YT,
        { porHashtag, porCuenta: new Map() },
      ),
    ];

    const { mejores } = destacadas(bloques);
    expect(mejores).toHaveLength(1);
    expect(mejores[0].metrica).toBe("visualizaciones");
    expect(mejores[0].valor).toBeCloseTo(1, 10);
  });

  it("solo entran las series que tienen base", () => {
    const porHashtag: MapaPromedios = new Map([
      [claveHashtag(IG.id, "SUBE"), base({ alcance_prom: 5_000 })],
      [claveHashtag(IG.id, "BAJA"), base({ alcance_prom: 40_000 })],
    ]);
    const filas = [
      fila({ hashtag: "SUBE", alcance: 10_000 }),
      fila({ hashtag: "BAJA", alcance: 10_000 }),
      // Sin base: no "subió", simplemente no hay con qué comparar.
      fila({ hashtag: "NUEVA", alcance: 999_999 }),
    ];

    const bloques = [construirBloque(filas, IG, { porHashtag, porCuenta: new Map() })];
    const { mejores, peores } = destacadas(bloques);

    expect(mejores.map((d) => d.hashtag)).toEqual(["SUBE"]);
    expect(peores.map((d) => d.hashtag)).toEqual(["BAJA"]);
  });
});

describe("semanas", () => {
  it("la semana va de lunes a domingo", () => {
    // 2026-09-24 es jueves.
    expect(semanaDe("2026-09-24")).toEqual({
      desde: "2026-09-21",
      hasta: "2026-09-27",
    });
    // El lunes es su propio inicio.
    expect(semanaDe("2026-09-21").desde).toBe("2026-09-21");
    // El domingo pertenece a la semana que empezó el lunes anterior.
    expect(semanaDe("2026-09-27").desde).toBe("2026-09-21");
  });

  it("avanza y retrocede cruzando el cambio de mes", () => {
    const s = semanaDe("2026-10-01");
    expect(s).toEqual({ desde: "2026-09-28", hasta: "2026-10-04" });
    expect(semanaAnterior(s).desde).toBe("2026-09-21");
    expect(semanaSiguiente(s).desde).toBe("2026-10-05");
  });

  it("rotula la semana, y nombra los dos meses cuando los cruza", () => {
    expect(rotularSemana({ desde: "2026-09-21", hasta: "2026-09-27" })).toBe(
      "21 al 27 de septiembre de 2026",
    );
    expect(rotularSemana({ desde: "2026-09-28", hasta: "2026-10-04" })).toBe(
      "28 de septiembre de 2026 al 4 de octubre de 2026",
    );
  });
});
