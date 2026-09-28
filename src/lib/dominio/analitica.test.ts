/**
 * Un gráfico miente más fácil que una tabla: una escala mal elegida o un cero
 * inventado no se notan a simple vista. Estas pruebas son sobre eso.
 */
import { describe, expect, it } from "vitest";
import {
  comparativaCuentas,
  comparativaFormato,
  esPorcentaje,
  evolucionSemanal,
  type FilaAnalitica,
  periodoAnterior,
  semanasDelRango,
  titulares,
  valorDe,
} from "./analitica";
import { coloresPorCuenta, MAXIMO_SERIES, SERIES } from "./paleta";
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

describe("semanasDelRango", () => {
  it("devuelve lunes consecutivos que cubren el rango", () => {
    const s = semanasDelRango("2026-09-22", "2026-10-05");
    expect(s.map((x) => x.desde)).toEqual(["2026-09-21", "2026-09-28", "2026-10-05"]);
    expect(s[0].hasta).toBe("2026-09-27");
  });

  it("un rango de un día es una sola semana", () => {
    expect(semanasDelRango("2026-09-24", "2026-09-24")).toHaveLength(1);
  });
});

describe("evolucionSemanal", () => {
  /*
   * LA regla del gráfico. Una semana sin publicaciones dibujada como cero es
   * una caída a fondo que nunca ocurrió; tiene que ser un hueco (§9.4).
   */
  it("una semana sin publicaciones es null, nunca cero", () => {
    const e = evolucionSemanal(
      [fila({ fecha: "2026-09-22" }), fila({ fecha: "2026-10-06" })],
      [IG],
      "alcance",
      { desde: "2026-09-21", hasta: "2026-10-11" },
    );

    expect(e.semanas).toHaveLength(3);
    // La del medio no tuvo publicaciones.
    expect(e.series[0].puntos).toEqual([10_000, null, 10_000]);
    expect(e.series[0].publicaciones).toEqual([1, 0, 1]);
  });

  it("§9.1 — el punto es el promedio por publicación, no la suma", () => {
    const e = evolucionSemanal(
      [
        fila({ fecha: "2026-09-22", alcance: 10_000 }),
        fila({ fecha: "2026-09-23", alcance: 30_000 }),
      ],
      [IG],
      "alcance",
      { desde: "2026-09-21", hasta: "2026-09-27" },
    );
    // 40.000 / 2, no 40.000.
    expect(e.series[0].puntos).toEqual([20_000]);
    expect(e.series[0].total).toBe(2);
  });

  it("una línea por cuenta, alineadas con las mismas semanas", () => {
    const e = evolucionSemanal(
      [
        fila({ fecha: "2026-09-22" }),
        fila({ cuentaId: TT.id, red: "TikTok", fecha: "2026-09-29", alcance: 5_000 }),
      ],
      [IG, TT],
      "alcance",
      { desde: "2026-09-21", hasta: "2026-10-04" },
    );

    expect(e.series).toHaveLength(2);
    for (const s of e.series) expect(s.puntos).toHaveLength(e.semanas.length);
    expect(e.series.find((s) => s.cuentaId === TT.id)?.puntos).toEqual([null, 5_000]);
  });

  it("§9.6 — el engagement de cada cuenta usa el denominador de SU red", () => {
    const e = evolucionSemanal(
      [
        fila({
          cuentaId: YT.id,
          red: "YouTube",
          categoria: "Short",
          tipo: null,
          fecha: "2026-09-22",
          alcance: null,
          visualizaciones: 10_000,
          interacciones: 500,
        }),
      ],
      [YT],
      "engagement",
      { desde: "2026-09-21", hasta: "2026-09-27" },
    );
    // 500 / 10.000 sobre visualizaciones, porque YouTube no entrega alcance.
    expect(e.series[0].puntos[0]).toBeCloseTo(0.05, 10);
  });
});

describe("valorDe", () => {
  it("no calcula engagement si las filas mezclan redes", () => {
    const mezcla = [
      fila(),
      fila({ cuentaId: YT.id, red: "YouTube", alcance: null, categoria: "Short", tipo: null }),
    ];
    expect(valorDe(mezcla, "engagement")).toBeNull();
    // Las otras métricas sí se pueden mezclar: el divisor es por métrica.
    expect(valorDe(mezcla, "visualizaciones")).toBe(20_000);
  });

  it("solo el engagement es porcentual", () => {
    expect(esPorcentaje("engagement")).toBe(true);
    expect(esPorcentaje("alcance")).toBe(false);
  });
});

describe("comparativaCuentas", () => {
  it("ordena de mayor a menor y deja fuera a quien no publicó", () => {
    const r = comparativaCuentas(
      [
        fila({ alcance: 10_000 }),
        fila({ cuentaId: TT.id, red: "TikTok", alcance: 50_000 }),
      ],
      [IG, TT, YT],
      "alcance",
    );
    expect(r.map((b) => b.nombre)).toEqual(["TikTok", "Instagram DLT"]);
    // YouTube no publicó: una barra en cero diría otra cosa.
    expect(r.some((b) => b.nombre === "YouTube")).toBe(false);
  });

  it("§9.4 — dice sobre cuántas publicaciones se calculó", () => {
    const r = comparativaCuentas(
      [fila({ alcance: 10_000 }), fila({ alcance: null })],
      [IG],
      "alcance",
    );
    expect(r[0].publicaciones).toBe(2);
    expect(r[0].denominador).toBe(1);
  });

  it("§9.6 — marca la barra de YouTube como no comparable en engagement", () => {
    const r = comparativaCuentas(
      [
        fila({
          cuentaId: YT.id,
          red: "YouTube",
          categoria: "Short",
          tipo: null,
          alcance: null,
        }),
      ],
      [YT],
      "engagement",
    );
    expect(r[0].noComparable).toBe(true);

    const enIG = comparativaCuentas([fila()], [IG], "engagement");
    expect(enIG[0].noComparable).toBe(false);
  });
});

describe("comparativaFormato", () => {
  /*
   * §3.2 — una publicación de Instagram tiene formato Y tipo. Si Reactivo y
   * Normal entraran al mismo gráfico que Reel e Imagen, cada publicación
   * aparecería dos veces y el gráfico sumaría más que el total.
   */
  it("solo cuenta los formatos que se le piden", () => {
    const r = comparativaFormato(
      [fila({ categoria: "Reel" }), fila({ categoria: "Imagen", alcance: 2_000 })],
      "alcance",
      ["Reel", "Imagen", "Carrusel"],
    );
    expect(r.map((b) => b.formato)).toEqual(["Reel", "Imagen"]);
    // Carrusel no tuvo publicaciones: no aparece.
    expect(r).toHaveLength(2);
  });
});

describe("titulares", () => {
  it("compara contra el período anterior", () => {
    const t = titulares([fila({ alcance: 15_000 })], [fila({ alcance: 10_000 })]);
    const alcance = t.metricas.find((m) => m.metrica === "alcance");
    expect(alcance?.valor).toBe(15_000);
    expect(alcance?.variacion).toBeCloseTo(0.5, 10);
  });

  it("sin período anterior la variación es guion, nunca 0%", () => {
    const t = titulares([fila()], []);
    expect(t.metricas.find((m) => m.metrica === "alcance")?.variacion).toBeNull();
  });

  it("no inventa un engagement cuando hay varias redes", () => {
    const t = titulares(
      [
        fila(),
        fila({ cuentaId: YT.id, red: "YouTube", alcance: null, categoria: "Short", tipo: null }),
      ],
      [],
    );
    expect(t.metricas.find((m) => m.metrica === "engagement")?.valor).toBeNull();
  });
});

describe("periodoAnterior", () => {
  it("es del mismo largo y termina justo antes", () => {
    // 7 días: 21 al 27 -> 14 al 20.
    expect(periodoAnterior("2026-09-21", "2026-09-27")).toEqual({
      desde: "2026-09-14",
      hasta: "2026-09-20",
    });
  });

  it("funciona con un rango de un solo día", () => {
    expect(periodoAnterior("2026-09-21", "2026-09-21")).toEqual({
      desde: "2026-09-20",
      hasta: "2026-09-20",
    });
  });
});

describe("paleta", () => {
  /*
   * El color sigue a la cuenta, no a su puesto. Si saliera del orden actual del
   * gráfico, filtrar una serie repintaría a las demás y quien aprendió que
   * "Instagram DLT es azul" vería otra cosa.
   */
  it("una cuenta conserva su color aunque cambie el ranking", () => {
    const orden = [IG, TT, YT];
    const colores = coloresPorCuenta(orden);

    expect(colores.get(IG.id)).toBe(SERIES[0]);
    expect(colores.get(TT.id)).toBe(SERIES[1]);

    // El mismo orden estable: los colores no dependen de quién va ganando.
    expect(coloresPorCuenta(orden).get(IG.id)).toBe(colores.get(IG.id));
  });

  it("no inventa un noveno color", () => {
    const muchas = Array.from({ length: 12 }, (_, i) => ({ id: `c${i}` }));
    const colores = coloresPorCuenta(muchas);
    expect(colores.size).toBe(MAXIMO_SERIES);
    expect(colores.has("c8")).toBe(false);
  });

  it("los ocho colores son distintos entre sí", () => {
    expect(new Set(SERIES).size).toBe(SERIES.length);
  });
});
