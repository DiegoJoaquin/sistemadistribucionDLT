/**
 * Estos gráficos son donde es más fácil hacer trampa sin querer: cada
 * publicación que no se puede dibujar es una tentación de dibujarla en cero, y
 * un cero inventado arrastra cualquier lectura hacia "esto no rinde". Casi
 * todas estas pruebas son sobre eso, y sobre que los cuatro gráficos excluyan
 * exactamente por los mismos motivos.
 */
import { describe, expect, it } from "vitest";
import {
  construirCajas,
  construirDispersion,
  construirDistribucion,
  construirRanking,
  construirTelarana,
  cuantil,
  escalaDe,
  gruposDe,
  etiquetaDeGrupo,
  MAXIMO_COLORES,
  MAXIMO_POLIGONOS,
  mediana,
  MINIMO_CAJA,
  NOMBRE_GRAFICO,
  PREGUNTA_GRAFICO,
  promedio,
  promedioDeNivel,
  type PublicacionPunto,
  reelesReactivos,
  SIN_CLASIFICAR,
  tipoDePost,
  TIPOS_GRAFICO,
  usaColorPorGrupo,
  valorEnEje,
} from "./rendimiento";
import { SERIES } from "./paleta";

function punto(p: Partial<PublicacionPunto> = {}): PublicacionPunto {
  return {
    id: crypto.randomUUID(),
    fecha: "2026-09-22",
    cuentaId: "c-ig",
    cuenta: "Instagram DLT",
    red: "Instagram",
    categoria: "Reel",
    tipo: "Normal",
    hashtag: "#SPARTA",
    titulo: "Una publicación",
    enlace: "https://example.com/p/1",
    publicaciones: 1,
    alcance: 10_000,
    visualizaciones: 20_000,
    interacciones: 500,
    nuevos_seguidores: 5,
    me_gusta: 400,
    comentarios: 60,
    compartidos: 30,
    guardados: 10,
    favoritos: null,
    duracion_s: 45,
    ...p,
  };
}

const EJES_BASE = { ejeX: "me_gusta", ejeY: "comentarios", agrupacion: "tipo_post" } as const;
const UNA = { metrica: "me_gusta", agrupacion: "tipo_post" } as const;

/** Los cuatro gráficos sobre el mismo conjunto, para comparar entre sí. */
function todosLosGraficos(puntos: PublicacionPunto[]) {
  return [
    construirDispersion(puntos, { ...EJES_BASE, ejeX: "me_gusta", ejeY: "me_gusta" }),
    construirCajas(puntos, UNA),
    construirDistribucion(puntos, UNA),
    construirRanking(puntos, UNA),
  ];
}

describe("valorEnEje", () => {
  it("lee la métrica tal como está guardada", () => {
    expect(valorEnEje(punto({ compartidos: 77 }), "compartidos")).toBe(77);
  });

  it("sin dato es null, nunca cero", () => {
    expect(valorEnEje(punto({ guardados: null }), "guardados")).toBeNull();
  });

  /*
   * §9.6 — el engagement de una publicación de YouTube va sobre
   * visualizaciones, porque YouTube no entrega alcance.
   */
  it("§9.6 — el engagement usa el denominador de SU red", () => {
    const ig = punto({ interacciones: 500, alcance: 10_000, visualizaciones: 40_000 });
    expect(valorEnEje(ig, "engagement")).toBeCloseTo(0.05, 10);

    const yt = punto({
      red: "YouTube",
      categoria: "Short",
      tipo: null,
      alcance: null,
      visualizaciones: 40_000,
      interacciones: 500,
    });
    expect(valorEnEje(yt, "engagement")).toBeCloseTo(0.0125, 10);
  });

  it("no divide por cero: devuelve null", () => {
    expect(valorEnEje(punto({ alcance: 0 }), "engagement")).toBeNull();
  });
});

describe("tipoDePost", () => {
  /*
   * El área pidió reel / reactivo / editorial, pero en los datos "reactivo" es
   * un tipo y "reel" es un formato: una publicación puede ser los dos. La
   * precedencia está elegida y hay que fijarla, porque cambiarla mueve
   * publicaciones de un grupo a otro sin que nada más cambie en pantalla.
   */
  it("un reel reactivo cuenta como reactivo", () => {
    expect(tipoDePost(punto({ categoria: "Reel", tipo: "Reactivo" }))).toBe("Reactivo");
  });

  it("un reel normal es reel", () => {
    expect(tipoDePost(punto({ categoria: "Reel", tipo: "Normal" }))).toBe("Reel");
  });

  it("el video de TikTok y el short de YouTube también son reel", () => {
    expect(tipoDePost(punto({ categoria: "Video", tipo: null }))).toBe("Reel");
    expect(tipoDePost(punto({ categoria: "Short", tipo: null }))).toBe("Reel");
  });

  it("una imagen o un carrusel es editorial", () => {
    expect(tipoDePost(punto({ categoria: "Imagen", tipo: "Normal" }))).toBe("Editorial");
    expect(tipoDePost(punto({ categoria: "Carrusel", tipo: null }))).toBe("Editorial");
  });

  /*
   * Sin formato ni tipo no es editorial: es una publicación que nadie
   * clasificó. Mandarla a "editorial" inflaría ese grupo con lo que en realidad
   * es una falta de dato.
   */
  it("sin formato ni tipo no se inventa un grupo", () => {
    expect(tipoDePost(punto({ categoria: null, tipo: null }))).toBeNull();
  });

  it("cuenta el cruce para poder mostrarlo", () => {
    expect(
      reelesReactivos([
        punto({ categoria: "Reel", tipo: "Reactivo" }),
        punto({ categoria: "Imagen", tipo: "Reactivo" }),
        punto({ categoria: "Reel", tipo: "Normal" }),
      ]),
    ).toBe(1);
  });
});

describe("gruposDe", () => {
  it("ordena de más publicaciones a menos y colorea las primeras", () => {
    const g = gruposDe(
      [
        punto({ categoria: "Imagen", tipo: "Normal" }),
        punto({ categoria: "Imagen", tipo: "Normal" }),
        punto({ categoria: "Reel", tipo: "Normal" }),
      ],
      "tipo_post",
    );
    expect(g.map((x) => x.etiqueta)).toEqual(["Editorial", "Reel"]);
    expect(g[0].n).toBe(2);
    expect(g[0].color).toBe(SERIES[0]);
    expect(g[1].color).toBe(SERIES[1]);
  });

  /*
   * En una nube de marcas superpuestas, cuatro colores ya no se distinguen. Del
   * cuarto grupo en adelante va gris, y la leyenda lo dice.
   */
  it("no colorea más de tres grupos", () => {
    const puntos = (["Reel", "Imagen", "Carrusel", "Video", "Foto"] as const).flatMap(
      (categoria, i) =>
        // Cantidades decrecientes para que el orden sea determinista.
        Array.from({ length: 10 - i }, () => punto({ categoria, tipo: null })),
    );
    const g = gruposDe(puntos, "formato");
    expect(g).toHaveLength(5);
    expect(g.filter((x) => x.color !== null)).toHaveLength(MAXIMO_COLORES);
    expect(g.slice(MAXIMO_COLORES).every((x) => x.color === null)).toBe(true);
  });

  it("las sin clasificar van al final, en gris y con su nombre", () => {
    const g = gruposDe(
      [punto({ categoria: null, tipo: null }), punto({ categoria: "Reel", tipo: "Normal" })],
      "tipo_post",
    );
    const ultimo = g[g.length - 1];
    expect(ultimo.clave).toBe(SIN_CLASIFICAR);
    expect(ultimo.etiqueta).toBe("Sin clasificar");
    expect(ultimo.color).toBeNull();
  });

  it("agrupa por cuenta y por red cuando se le pide", () => {
    const puntos = [
      punto(),
      punto({ cuentaId: "c-tt", cuenta: "TikTok", red: "TikTok", categoria: "Video" }),
    ];
    expect(gruposDe(puntos, "red").map((g) => g.etiqueta).sort()).toEqual([
      "Instagram",
      "TikTok",
    ]);
    expect(gruposDe(puntos, "cuenta").map((g) => g.etiqueta).sort()).toEqual([
      "Instagram DLT",
      "TikTok",
    ]);
  });
});

/* ------------------------------------------------------------------ */
/* Lo que comparten los cuatro                                         */
/* ------------------------------------------------------------------ */

describe("la base común", () => {
  /*
   * Si cada gráfico decidiera por su cuenta a quién deja fuera, cambiar de
   * gráfico movería el total sin que nada más cambiara, y no habría forma de
   * saber cuál de los dos números creer.
   */
  it("los cuatro gráficos excluyen exactamente lo mismo", () => {
    const puntos = [
      punto(),
      punto({ publicaciones: 3 }),
      punto({ me_gusta: null }),
      punto({ me_gusta: null }),
    ];

    const excluidas = todosLosGraficos(puntos).map((g) => g.excluidas);
    for (const e of excluidas) expect(e).toEqual(excluidas[0]);
    expect(excluidas[0]).toEqual({ agrupadas: 1, sinX: 2, sinY: 0, noPositivas: 0 });
  });

  it("en los cuatro, lo excluido más lo usado da el total", () => {
    const puntos = [punto(), punto({ publicaciones: 2 }), punto({ me_gusta: null })];
    for (const g of todosLosGraficos(puntos)) {
      const { agrupadas, sinX, sinY, noPositivas } = g.excluidas;
      expect(agrupadas + sinX + sinY + noPositivas + g.puntos.length).toBe(g.total);
    }
  });

  /*
   * LA regla. Una publicación sin el dato dibujada en el origen dice "tuvo
   * cero", y lo que pasa es que la fuente no lo entrega.
   */
  it("§9.4 — a la que le falta el dato no se le dibuja un cero", () => {
    const d = construirDispersion(
      [
        punto({ me_gusta: 400, comentarios: 60 }),
        punto({ me_gusta: null, comentarios: 60 }),
        punto({ me_gusta: 400, comentarios: null }),
      ],
      EJES_BASE,
    );
    expect(d.puntos).toHaveLength(1);
    expect(d.excluidas.sinX).toBe(1);
    expect(d.excluidas.sinY).toBe(1);
  });

  /*
   * §9.5 — una marca es UNA publicación. Una fila que representa tres tiene los
   * likes de las tres juntos: dibujarla la mostraría como la publicación más
   * exitosa del período.
   */
  it("§9.5 — una fila que representa varias publicaciones queda fuera", () => {
    const d = construirDispersion(
      [punto(), punto({ publicaciones: 3, me_gusta: 1_200 })],
      EJES_BASE,
    );
    expect(d.puntos).toHaveLength(1);
    expect(d.excluidas.agrupadas).toBe(1);
  });

  it("apagar un grupo saca marcas pero no las cuenta como datos faltantes", () => {
    const puntos = [
      punto({ categoria: "Reel", tipo: "Normal" }),
      punto({ categoria: "Imagen", tipo: "Normal" }),
    ];
    const d = construirDispersion(puntos, { ...EJES_BASE, ocultos: new Set(["Reel"]) });
    expect(d.puntos).toHaveLength(1);
    expect(d.puntos[0].grupo).toBe("Editorial");
    expect(d.excluidas).toEqual({ agrupadas: 0, sinX: 0, sinY: 0, noPositivas: 0 });
    // Y la leyenda sigue mostrando el grupo apagado, con su cuenta.
    expect(d.grupos.map((g) => g.etiqueta)).toContain("Reel");
  });

  /*
   * El color no puede depender de lo que esté prendido: si saliera de ahí,
   * apagar un grupo repintaría a los demás y quien aprendió que "reactivo es
   * naranja" vería otra cosa.
   */
  it("el color de un grupo no cambia al apagar otro", () => {
    const puntos = [
      punto({ categoria: "Imagen", tipo: "Normal" }),
      punto({ categoria: "Imagen", tipo: "Normal" }),
      punto({ categoria: "Reel", tipo: "Normal" }),
    ];
    const todos = construirDispersion(puntos, EJES_BASE);
    const filtrado = construirDispersion(puntos, {
      ...EJES_BASE,
      ocultos: new Set(["Editorial"]),
    });

    const color = (d: typeof todos, etiqueta: string) =>
      d.grupos.find((g) => g.etiqueta === etiqueta)?.color;
    expect(color(filtrado, "Reel")).toBe(color(todos, "Reel"));
  });

  /*
   * §9.6 — si la métrica es engagement y hay una red que lo calcula sobre
   * visualizaciones junto a otras que lo calculan sobre alcance, esa métrica no
   * mide lo mismo en todas las publicaciones.
   */
  it("§9.6 — avisa cuando el engagement mezcla denominadores", () => {
    const yt = punto({
      red: "YouTube",
      categoria: "Short",
      tipo: null,
      alcance: null,
      visualizaciones: 10_000,
    });

    expect(
      construirDispersion([punto(), yt], { ...EJES_BASE, ejeY: "engagement" })
        .mezclaDenominadores,
    ).toBe(true);
    expect(
      construirCajas([punto(), yt], { ...UNA, metrica: "engagement" }).mezclaDenominadores,
    ).toBe(true);
    expect(
      construirDispersion([punto()], { ...EJES_BASE, ejeY: "engagement" })
        .mezclaDenominadores,
    ).toBe(false);
    // Sin engagement en ninguna métrica, mezclar redes no tiene nada de malo.
    expect(construirDispersion([punto(), yt], EJES_BASE).mezclaDenominadores).toBe(false);
  });

  it("el cruce reel/reactivo solo se cuenta cuando ese corte está a la vista", () => {
    const puntos = [punto({ categoria: "Reel", tipo: "Reactivo" })];
    expect(construirDispersion(puntos, EJES_BASE).cruceReelReactivo).toBe(1);
    expect(
      construirDispersion(puntos, { ...EJES_BASE, agrupacion: "formato" }).cruceReelReactivo,
    ).toBe(0);
  });

  it("ninguno se cae sin publicaciones", () => {
    for (const g of todosLosGraficos([])) {
      expect(g.puntos).toEqual([]);
      expect(g.total).toBe(0);
    }
  });
});

/* ------------------------------------------------------------------ */
/* Dispersión                                                          */
/* ------------------------------------------------------------------ */

describe("construirDispersion", () => {
  it("una marca por publicación, con su grupo y su color", () => {
    const d = construirDispersion([punto({ me_gusta: 400, comentarios: 60 })], EJES_BASE);
    expect(d.puntos).toHaveLength(1);
    expect(d.puntos[0].x).toBe(400);
    expect(d.puntos[0].y).toBe(60);
    expect(d.puntos[0].grupo).toBe("Reel");
    expect(d.puntos[0].color).toBe(SERIES[0]);
  });

  it("en escala logarítmica el cero no cabe: queda fuera y se cuenta", () => {
    const puntos = [punto({ me_gusta: 400 }), punto({ me_gusta: 0 })];
    expect(construirDispersion(puntos, EJES_BASE).puntos).toHaveLength(2);
    const log = construirDispersion(puntos, { ...EJES_BASE, logX: true });
    expect(log.puntos).toHaveLength(1);
    expect(log.excluidas.noPositivas).toBe(1);
  });

  it("las medianas salen de lo dibujado, para las líneas de referencia", () => {
    const d = construirDispersion(
      [
        punto({ me_gusta: 100, comentarios: 10 }),
        punto({ me_gusta: 300, comentarios: 20 }),
        punto({ me_gusta: 500, comentarios: 90 }),
      ],
      EJES_BASE,
    );
    expect(d.medianaX).toBe(300);
    expect(d.medianaY).toBe(20);
  });

  it("sin puntos no inventa una mediana ni una escala rota", () => {
    const d = construirDispersion([], EJES_BASE);
    expect(d.medianaX).toBeNull();
    expect(d.escalaX.max).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------------ */
/* Caja                                                                */
/* ------------------------------------------------------------------ */

describe("construirCajas", () => {
  /** Nueve valores de un grupo, para tener cuartiles de verdad. */
  const grupoDe9 = (categoria: "Reel" | "Imagen", valores: number[]) =>
    valores.map((v) =>
      punto({ categoria, tipo: categoria === "Reel" ? "Normal" : "Normal", me_gusta: v }),
    );

  it("calcula cuartiles y mediana del grupo", () => {
    const c = construirCajas(grupoDe9("Reel", [1, 2, 3, 4, 5, 6, 7, 8, 9]), UNA);
    expect(c.cajas).toHaveLength(1);
    expect(c.cajas[0].mediana).toBe(5);
    expect(c.cajas[0].q1).toBe(3);
    expect(c.cajas[0].q3).toBe(7);
    expect(c.cajas[0].n).toBe(9);
  });

  /*
   * El bigote llega hasta el dato REAL más lejano dentro del límite. Terminarlo
   * en el límite calculado dibujaría un valor que ninguna publicación tuvo.
   */
  it("el bigote termina en un dato que existe, y las virales quedan sueltas", () => {
    const c = construirCajas(
      grupoDe9("Reel", [1, 2, 3, 4, 5, 6, 7, 8, 500]),
      UNA,
    );
    const caja = c.cajas[0];
    expect(caja.bigoteAlto).toBe(8);
    expect(caja.atipicos).toHaveLength(1);
    expect(caja.atipicos[0].x).toBe(500);
  });

  /*
   * Es la razón de ser del gráfico: una viral mueve el promedio del grupo pero
   * casi no mueve su mediana, así que comparar medianas compara lo que de
   * verdad rinde.
   */
  it("una viral mueve el promedio del grupo pero no su mediana", () => {
    const sinViral = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    const conViral = [1, 2, 3, 4, 5, 6, 7, 8, 5_000];

    expect(mediana(sinViral)).toBe(mediana(conViral));
    expect(promedio(conViral)!).toBeGreaterThan(promedio(sinViral)! * 10);
  });

  it("ordena los grupos por mediana, de mayor a menor", () => {
    const c = construirCajas(
      [
        ...grupoDe9("Reel", [1, 1, 1, 1, 1, 1]),
        ...grupoDe9("Imagen", [9, 9, 9, 9, 9, 9]),
      ],
      UNA,
    );
    expect(c.cajas.map((x) => x.etiqueta)).toEqual(["Editorial", "Reel"]);
  });

  /*
   * Con cuatro publicaciones los cuartiles no describen nada: cada una mueve la
   * caja entera. Ese grupo se marca para dibujarlo como puntos sueltos.
   */
  it("marca los grupos con muy pocas publicaciones en vez de fingir una caja", () => {
    const c = construirCajas(grupoDe9("Reel", [1, 2, 3]), UNA);
    expect(c.cajas[0].pocas).toBe(true);
    expect(c.cajas[0].valores).toEqual([1, 2, 3]);

    const suficientes = construirCajas(
      grupoDe9("Reel", Array.from({ length: MINIMO_CAJA }, (_, i) => i + 1)),
      UNA,
    );
    expect(suficientes.cajas[0].pocas).toBe(false);
  });

  /*
   * Un grupo que existe pero al que ninguna publicación le entrega la métrica
   * no es una caja de ancho cero pegada al origen: no va.
   */
  it("un grupo sin ninguna publicación con el dato no aparece", () => {
    const c = construirCajas(
      [
        punto({ categoria: "Reel", tipo: "Normal", me_gusta: 10 }),
        punto({ categoria: "Imagen", tipo: "Normal", me_gusta: null }),
      ],
      UNA,
    );
    expect(c.cajas.map((x) => x.etiqueta)).toEqual(["Reel"]);
    // Pero la leyenda sí lo sigue nombrando, con su cuenta.
    expect(c.grupos.map((g) => g.etiqueta)).toContain("Editorial");
  });
});

/* ------------------------------------------------------------------ */
/* Distribución                                                        */
/* ------------------------------------------------------------------ */

describe("construirDistribucion", () => {
  it("cada publicación cae en exactamente una columna", () => {
    const valores = [1, 5, 9, 14, 22, 30, 41, 55, 60, 77, 88, 99, 100];
    const d = construirDistribucion(
      valores.map((v) => punto({ me_gusta: v })),
      UNA,
    );
    expect(d.barras.reduce((a, b) => a + b.n, 0)).toBe(valores.length);
    expect(d.n).toBe(valores.length);
  });

  /*
   * El valor máximo tiene que caber en el histograma que lo contiene: sin
   * incluir el borde derecho de la última columna, la publicación más grande
   * del período desaparecía del gráfico.
   */
  it("el valor más alto entra en la última columna", () => {
    const d = construirDistribucion(
      [1, 2, 3, 100].map((v) => punto({ me_gusta: v })),
      UNA,
    );
    expect(d.barras.reduce((a, b) => a + b.n, 0)).toBe(4);
    expect(d.barras[d.barras.length - 1].n).toBeGreaterThan(0);
  });

  /*
   * Mostrar los dos juntos es el punto del gráfico: cuando se separan, el
   * promedio del panel no describe a la publicación típica.
   */
  it("da mediana y promedio, que con estos datos no coinciden", () => {
    const d = construirDistribucion(
      [1, 2, 3, 4, 5_000].map((v) => punto({ me_gusta: v })),
      UNA,
    );
    expect(d.mediana).toBe(3);
    expect(d.promedio).toBeCloseTo(1002, 6);
  });

  /*
   * En logarítmico las columnas son iguales en logaritmos, no en unidades: si
   * no, la primera se comería casi todo y las demás saldrían vacías — el mismo
   * problema que la escala logarítmica viene a resolver.
   */
  it("en logarítmico las columnas reparten en vez de amontonar", () => {
    const valores = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1_000, 5_000];
    const puntos = valores.map((v) => punto({ me_gusta: v }));

    const lineal = construirDistribucion(puntos, UNA);
    const log = construirDistribucion(puntos, { ...UNA, log: true });

    // En lineal casi todo cae en la primera columna; en logarítmico, no.
    expect(lineal.barras[0].n).toBeGreaterThanOrEqual(valores.length - 2);
    expect(log.barras[0].n).toBeLessThan(lineal.barras[0].n);
    expect(log.barras.filter((b) => b.n > 0).length).toBeGreaterThan(
      lineal.barras.filter((b) => b.n > 0).length,
    );
    expect(log.barras.reduce((a, b) => a + b.n, 0)).toBe(valores.length);
  });

  it("sin publicaciones no dibuja columnas ni inventa un pico", () => {
    const d = construirDistribucion([], UNA);
    expect(d.barras).toEqual([]);
    expect(d.pico).toBe(0);
    expect(d.mediana).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* Ranking                                                             */
/* ------------------------------------------------------------------ */

describe("construirRanking", () => {
  it("ordena de mayor a menor y recorta", () => {
    const r = construirRanking(
      [10, 90, 50].map((v) => punto({ me_gusta: v })),
      { ...UNA, cuantas: 2 },
    );
    expect(r.mejores.map((d) => d.x)).toEqual([90, 50]);
  });

  /*
   * Si la escala saliera del máximo de las mostradas, la última barra ocuparía
   * media pantalla y parecería que rindió bien.
   */
  it("la escala sale de todas las publicaciones, no solo de las mostradas", () => {
    const puntos = [1_000, 10, 9, 8].map((v) => punto({ me_gusta: v }));
    const r = construirRanking(puntos, { ...UNA, cuantas: 3 });
    // La viral no está entre las tres mostradas... sí lo está, es la primera.
    expect(r.escala.max).toBeGreaterThanOrEqual(1_000);

    const sinLaViral = construirRanking(puntos, { ...UNA, cuantas: 3, ocultos: new Set() });
    expect(sinLaViral.escala.max).toBe(r.escala.max);
  });

  it("la mediana es la de todo el período, no la de las mostradas", () => {
    const r = construirRanking(
      [1, 2, 3, 4, 5, 6, 7, 8, 9].map((v) => punto({ me_gusta: v })),
      { ...UNA, cuantas: 3 },
    );
    expect(r.mejores).toHaveLength(3);
    expect(r.mediana).toBe(5);
  });
});

/* ------------------------------------------------------------------ */
/* Escalas y estadística                                               */
/* ------------------------------------------------------------------ */

describe("escalaDe", () => {
  /*
   * La lineal arranca en cero: son cantidades. Cortarla más arriba pondría a
   * dos publicaciones parecidas en extremos opuestos del panel.
   */
  it("la lineal arranca en cero", () => {
    const e = escalaDe([120, 870], false);
    expect(e.min).toBe(0);
    expect(e.marcas[0]).toBe(0);
    expect(e.max).toBeGreaterThanOrEqual(870);
  });

  /*
   * El paso se elige antes que el tope. Partiendo el máximo en cuatro, un eje
   * que llegaba a 2.500 salía rotulado 625 · 1.250 · 1.875: tres números que
   * nadie compara de memoria.
   */
  it("las marcas son múltiplos de un paso redondo", () => {
    const redondo = (v: number) => {
      const m = v / 10 ** Math.floor(Math.log10(v));
      return [1, 2, 5].some((x) => Math.abs(m - x) < 1e-6);
    };

    for (const tope of [7, 90, 870, 2_050, 32_000, 1_200_000]) {
      const e = escalaDe([tope], false);
      const paso = e.marcas[1] - e.marcas[0];

      // El paso es redondo, que es lo que hace legibles a sus múltiplos: 200.000
      // da 400.000 y 600.000, todos comparables de memoria. Un paso de 625 no.
      expect(redondo(paso)).toBe(true);
      // Y las marcas son exactamente sus múltiplos, sin acumular error.
      e.marcas.forEach((v, i) => expect(v).toBeCloseTo(i * paso, 6));

      expect(e.marcas.length).toBeGreaterThanOrEqual(4);
      expect(e.marcas.length).toBeLessThanOrEqual(12);
    }
  });

  /*
   * El tope se pega al dato. Redondear a la potencia de diez de arriba dejaba
   * un eje que llegaba a 100.000 para un máximo de 32.000: dos tercios del
   * panel en blanco.
   */
  it("el tope no deja media escala vacía", () => {
    const e = escalaDe([32_000], false);
    expect(e.max).toBeGreaterThanOrEqual(32_000);
    expect(e.max).toBeLessThanOrEqual(32_000 * 1.35);
  });

  it("la logarítmica marca los números redondos del recorrido", () => {
    const e = escalaDe([40, 9_000], true);
    expect(e.min).toBe(20);
    expect(e.max).toBe(10_000);
    expect(e.marcas).toEqual([20, 50, 100, 200, 500, 1_000, 2_000, 5_000, 10_000]);
    // Media escala en logaritmos es la raíz del producto de los extremos.
    expect(e.posicion(Math.sqrt(20 * 10_000))).toBeCloseTo(0.5, 10);
  });

  it("la logarítmica tampoco deja una década entera vacía", () => {
    const e = escalaDe([1_200, 32_000], true);
    expect(e.min).toBe(1_000);
    expect(e.max).toBe(50_000);
  });

  it("todos los valores iguales no dejan una escala de ancho cero", () => {
    const e = escalaDe([50, 50, 50], true);
    expect(e.max).toBeGreaterThan(e.min);
    expect(Number.isFinite(e.posicion(50))).toBe(true);
    expect(e.marcas.length).toBeGreaterThan(1);
  });

  it("un eje de porcentajes chicos no se degenera", () => {
    const e = escalaDe([0.012, 0.118], false);
    expect(e.max).toBeGreaterThanOrEqual(0.118);
    expect(e.marcas.length).toBeGreaterThanOrEqual(4);
  });

  it("la posición nunca se sale del panel", () => {
    const e = escalaDe([100], false);
    expect(e.posicion(1e9)).toBe(1);
    expect(escalaDe([100], true).posicion(0)).toBe(0);
  });

  it("sin valores, o todos en cero, no se cae", () => {
    for (const e of [escalaDe([], false), escalaDe([0, 0], false)]) {
      expect(e.max).toBeGreaterThan(0);
      expect(Number.isFinite(e.posicion(0))).toBe(true);
    }
  });
});

describe("cuantil y mediana", () => {
  /*
   * El método es el de las planillas de cálculo a propósito: el primer día que
   * alguien compruebe un cuartil en Excel, tiene que darle lo mismo.
   */
  it("interpola como lo hace una planilla de cálculo", () => {
    const v = [1, 2, 3, 4];
    expect(cuantil(v, 0.25)).toBeCloseTo(1.75, 10);
    expect(cuantil(v, 0.5)).toBeCloseTo(2.5, 10);
    expect(cuantil(v, 0.75)).toBeCloseTo(3.25, 10);
  });

  it("con un solo valor devuelve ese valor", () => {
    expect(cuantil([7], 0.25)).toBe(7);
  });

  it("con cantidad impar la mediana es el del medio", () => {
    expect(mediana([3, 1, 2])).toBe(2);
    expect(mediana([1, 2, 3, 4])).toBe(2.5);
  });

  it("sin valores es null, no cero", () => {
    expect(mediana([])).toBeNull();
    expect(promedio([])).toBeNull();
  });
});

describe("usaColorPorGrupo", () => {
  /*
   * En la caja los grupos ya están separados en el eje: pintarlos de colores
   * distintos codificaría dos veces el mismo dato. En la dispersión y en el
   * ranking el grupo no se ve por ningún otro lado.
   */
  it("solo donde el color aporta algo", () => {
    expect(usaColorPorGrupo("dispersion")).toBe(true);
    expect(usaColorPorGrupo("ranking")).toBe(true);
    expect(usaColorPorGrupo("caja")).toBe(false);
    expect(usaColorPorGrupo("distribucion")).toBe(false);
  });

  it("todos los gráficos tienen nombre y pregunta", () => {
    for (const t of TIPOS_GRAFICO) {
      expect(NOMBRE_GRAFICO[t]).toBeTruthy();
      expect(PREGUNTA_GRAFICO[t]).toBeTruthy();
    }
  });
});

/* ------------------------------------------------------------------ */
/* Telaraña                                                            */
/* ------------------------------------------------------------------ */

describe("promedioDeNivel", () => {
  it("§9.1 — promedia por publicación y deja fuera a las que no traen el dato", () => {
    const p = [punto({ me_gusta: 100 }), punto({ me_gusta: 300 }), punto({ me_gusta: null })];
    // 400 / 2, no 400 / 3: la que no trae el dato no diluye el promedio (§9.4).
    expect(promedioDeNivel(p, "me_gusta")).toBe(200);
  });

  it("sin ninguna que traiga el dato devuelve null, no cero", () => {
    expect(promedioDeNivel([punto({ guardados: null })], "guardados")).toBeNull();
    expect(promedioDeNivel([], "me_gusta")).toBeNull();
  });

  /*
   * §9.6 — el engagement es una razón de sumas, y su denominador depende de la
   * red. Un conjunto que mezcla YouTube con el resto no tiene UN engagement.
   */
  it("§9.6 — el engagement de un conjunto que mezcla redes es null", () => {
    const ig = punto({ interacciones: 500, alcance: 10_000 });
    const yt = punto({
      red: "YouTube",
      categoria: "Short",
      tipo: null,
      alcance: null,
      visualizaciones: 10_000,
      interacciones: 100,
    });
    expect(promedioDeNivel([ig, yt], "engagement")).toBeNull();
    // Una sola red sí: 1.000 interacciones sobre 20.000 de alcance.
    expect(
      promedioDeNivel([ig, punto({ interacciones: 500, alcance: 10_000 })], "engagement"),
    ).toBeCloseTo(0.05, 10);
  });
});

describe("construirTelarana", () => {
  /** Tres publicaciones de la misma serie, más una de otra. */
  const serie = [
    punto({ id: "a", hashtag: "#SPARTA", me_gusta: 300, comentarios: 30 }),
    punto({ id: "b", hashtag: "#SPARTA", me_gusta: 100, comentarios: 10 }),
    punto({ id: "c", hashtag: "#OTRA", me_gusta: 900, comentarios: 90 }),
  ];
  const RADIOS = { ejes: ["me_gusta", "comentarios", "visualizaciones"] as const };

  /*
   * El número que pidió el área: cuánto se despegó la publicación de su línea.
   * 300 contra un promedio de 200 (300 y 100) es 150%.
   */
  it("el radio es la razón contra el promedio de su serie", () => {
    const t = construirTelarana(serie, {
      elegidas: [serie[0]],
      nivel: "serie",
      ...RADIOS,
    });
    const meGusta = t.poligonos[0].radios.find((r) => r.eje === "me_gusta")!;
    expect(meGusta.valor).toBe(300);
    expect(meGusta.base).toBe(200);
    expect(meGusta.razon).toBeCloseTo(1.5, 10);
  });

  /*
   * La misma publicación contra otra línea da otra figura, y las dos son
   * ciertas. Es lo que convierte al nivel en parte del gráfico y no en un
   * filtro más.
   */
  it("la misma publicación da otra figura contra la cuenta que contra la serie", () => {
    const contraSerie = construirTelarana(serie, {
      elegidas: [serie[0]],
      nivel: "serie",
      ...RADIOS,
    });
    const contraCuenta = construirTelarana(serie, {
      elegidas: [serie[0]],
      nivel: "cuenta",
      ...RADIOS,
    });

    // La serie son a y b (promedio 200); la cuenta son las tres (promedio 433).
    expect(contraSerie.poligonos[0].radios[0].base).toBe(200);
    expect(contraCuenta.poligonos[0].radios[0].base).toBeCloseTo(1_300 / 3, 8);
    expect(contraCuenta.poligonos[0].radios[0].razon).toBeLessThan(1);
  });

  it("nombra la línea contra la que comparó, y sobre cuántas se calculó", () => {
    const t = construirTelarana(serie, { elegidas: [serie[0]], nivel: "serie", ...RADIOS });
    expect(t.poligonos[0].referencia.etiqueta).toBe("#SPARTA");
    expect(t.poligonos[0].referencia.n).toBe(2);

    const global = construirTelarana(serie, {
      elegidas: [serie[0]],
      nivel: "global",
      ...RADIOS,
    });
    expect(global.poligonos[0].referencia.n).toBe(3);
  });

  /*
   * La línea NO puede depender de lo que esté filtrado en pantalla: si apagar
   * un grupo la moviera, el mismo post daría 120% o 90% según lo prendido y el
   * número dejaría de significar algo. Se calcula sobre todo el período.
   */
  it("la línea sale de todo el período, no de lo que esté visible", () => {
    const t = construirTelarana(serie, { elegidas: [serie[0]], nivel: "global", ...RADIOS });
    expect(t.poligonos[0].radios[0].base).toBeCloseTo(1_300 / 3, 8);
  });

  /*
   * §9.5 — una fila que representa tres publicaciones tiene los números de las
   * tres juntos: metida en el promedio lo dispararía.
   */
  it("§9.5 — las filas que representan varias publicaciones no entran en la línea", () => {
    const conAgrupada = [...serie, punto({ hashtag: "#SPARTA", publicaciones: 3, me_gusta: 3_000 })];
    const t = construirTelarana(conAgrupada, {
      elegidas: [serie[0]],
      nivel: "serie",
      ...RADIOS,
    });
    expect(t.poligonos[0].radios[0].base).toBe(200);
  });

  /*
   * Un radio sin dato no se dibuja en cero —diría "rindió cero"— ni en 100%
   * —diría "le fue como al promedio"—. Se cae y se dice por qué.
   */
  it("§9.4 — un radio sin dato se cae y se explica, no se dibuja", () => {
    const sinGuardados = [punto({ id: "x", guardados: null }), punto({ guardados: null })];
    const t = construirTelarana(sinGuardados, {
      elegidas: [sinGuardados[0]],
      nivel: "global",
      ejes: ["me_gusta", "guardados", "comentarios"],
    });
    expect(t.ejes).toEqual(["me_gusta", "comentarios"]);
    expect(t.descartados.map((d) => d.eje)).toEqual(["guardados"]);
    expect(t.descartados[0].motivo).toContain("no trae esta métrica");
  });

  it("también se cae el radio cuya línea no tiene el dato", () => {
    // La publicación sí trae favoritos, pero es la única: su línea de serie...
    // en realidad la línea la forma ella misma, así que sí hay base. El caso
    // real es una base en cero, que haría una división sin sentido.
    const p = [punto({ id: "z", nuevos_seguidores: 5 }), punto({ nuevos_seguidores: 0 })];
    const base0 = [punto({ id: "z", nuevos_seguidores: 5 }), punto({ nuevos_seguidores: -5 })];
    expect(
      construirTelarana(p, {
        elegidas: [p[0]],
        nivel: "global",
        ejes: ["me_gusta", "comentarios", "nuevos_seguidores"],
      }).ejes,
    ).toContain("nuevos_seguidores");

    // Promedio 0: dividir por eso daría infinito.
    const t = construirTelarana(base0, {
      elegidas: [base0[0]],
      nivel: "global",
      ejes: ["me_gusta", "comentarios", "nuevos_seguidores"],
    });
    expect(t.ejes).not.toContain("nuevos_seguidores");
  });

  /*
   * Los radios tienen que ser los MISMOS para todas las figuras: un polígono de
   * cinco vértices y otro de seis, superpuestos, no se pueden comparar.
   */
  it("con varias publicaciones, un radio que le falta a una se cae para todas", () => {
    const ig = punto({ id: "ig", guardados: 10 });
    const yt = punto({
      id: "yt",
      red: "YouTube",
      categoria: "Short",
      tipo: null,
      alcance: null,
      guardados: null,
    });
    const t = construirTelarana([ig, yt], {
      elegidas: [ig, yt],
      nivel: "global",
      ejes: ["me_gusta", "comentarios", "guardados", "alcance"],
    });
    expect(t.ejes).toEqual(["me_gusta", "comentarios"]);
    expect(t.poligonos).toHaveLength(2);
    // Las dos figuras tienen la misma cantidad de vértices.
    expect(t.poligonos[0].radios).toHaveLength(t.poligonos[1].radios.length);
  });

  /*
   * Una línea hecha con una sola publicación es la publicación misma: da 100%
   * en todo por definición. Una telaraña pegada al anillo parece un resultado,
   * así que hay que avisarlo.
   */
  it("avisa cuando la línea está hecha con una sola publicación", () => {
    const sola = [punto({ id: "u", hashtag: "#UNICA" }), punto({ hashtag: "#OTRA" })];
    const t = construirTelarana(sola, { elegidas: [sola[0]], nivel: "serie", ...RADIOS });
    expect(t.lineasDeUna).toHaveLength(1);
    // Y efectivamente da 100% en todos los radios.
    expect(t.poligonos[0].radios.every((r) => Math.abs(r.razon - 1) < 1e-9)).toBe(true);
  });

  it("avisa cuando una publicación sin hashtag se compara contra su serie", () => {
    const sinHashtag = punto({ id: "s", hashtag: null });
    const t = construirTelarana([sinHashtag, punto()], {
      elegidas: [sinHashtag],
      nivel: "serie",
      ...RADIOS,
    });
    expect(t.sinSerie).toHaveLength(1);
    // Sin serie no hay línea, así que no queda ningún radio que dibujar.
    expect(t.ejes).toEqual([]);
  });

  /*
   * El anillo del 100% tiene que caber siempre: si la publicación rindió por
   * debajo en todo, ese anillo es justamente lo que deja ver CUÁNTO por debajo.
   */
  /*
   * Que la escala llegue justo hasta 1 no alcanza: el anillo del 100% quedaba
   * pegado al borde del dibujo y se leía como el marco del gráfico en vez de
   * como la referencia.
   */
  it("la escala pasa de largo el anillo de la línea, aunque todo rinda por debajo", () => {
    const flojo = punto({ id: "f", me_gusta: 1, comentarios: 1, visualizaciones: 1 });
    const t = construirTelarana([flojo, punto({ me_gusta: 1_000 })], {
      elegidas: [flojo],
      nivel: "global",
      ...RADIOS,
    });
    expect(t.tope).toBeGreaterThan(1);
    expect(t.poligonos[0].radios.every((r) => r.razon < 1)).toBe(true);
  });

  it("nunca dibuja más figuras que colores tiene", () => {
    const muchas = Array.from({ length: 6 }, (_, i) => punto({ id: `m${i}` }));
    const t = construirTelarana(muchas, {
      elegidas: muchas,
      nivel: "global",
      ...RADIOS,
    });
    expect(t.poligonos).toHaveLength(MAXIMO_POLIGONOS);
    expect(new Set(t.poligonos.map((p) => p.color)).size).toBe(MAXIMO_POLIGONOS);
  });

  it("sin publicaciones elegidas no dibuja nada y no se cae", () => {
    const t = construirTelarana(serie, { elegidas: [], nivel: "serie", ...RADIOS });
    expect(t.poligonos).toEqual([]);
    expect(t.tope).toBeGreaterThanOrEqual(1);
  });

  /*
   * §9.6 — una serie NO vive en una sola red: el mismo hashtag sale en
   * Instagram, en TikTok y en YouTube, y YouTube calcula el engagement sobre
   * visualizaciones porque no entrega alcance. Si la línea se promediara entre
   * las tres, ese radio se caería casi siempre — justo el que más se mira.
   */
  it("§9.6 — la línea del engagement se acota a la red de la publicación", () => {
    const ig1 = punto({ id: "ig1", hashtag: "#S", interacciones: 500, alcance: 10_000 });
    const ig2 = punto({ id: "ig2", hashtag: "#S", interacciones: 200, alcance: 10_000 });
    const yt = punto({
      id: "yt",
      hashtag: "#S",
      red: "YouTube",
      categoria: "Short",
      tipo: null,
      alcance: null,
      visualizaciones: 10_000,
      interacciones: 5_000,
    });

    const t = construirTelarana([ig1, ig2, yt], {
      elegidas: [ig1],
      nivel: "serie",
      ejes: ["me_gusta", "comentarios", "engagement"],
    });

    // El radio sobrevive, en vez de caerse por mezclar denominadores.
    expect(t.ejes).toContain("engagement");

    // Y la línea son SOLO las dos de Instagram: 700 interacciones sobre 20.000
    // de alcance. Si hubiera entrado YouTube, daría otra cosa.
    const eng = t.poligonos[0].radios.find((r) => r.eje === "engagement")!;
    expect(eng.base).toBeCloseTo(700 / 20_000, 10);
    expect(eng.razon).toBeCloseTo(0.05 / 0.035, 8);

    // Se avisa, porque el radio se lee como "contra su serie" a secas.
    expect(t.engagementAcotado).toBe(true);
    expect(t.poligonos[0].referencia.nEngagement).toBe(2);
    // Los demás radios sí van contra la serie entera.
    expect(t.poligonos[0].referencia.n).toBe(3);
  });

  it("si la serie es de una sola red, no hay nada que acotar ni que avisar", () => {
    const t = construirTelarana(serie, {
      elegidas: [serie[0]],
      nivel: "serie",
      ejes: ["me_gusta", "comentarios", "engagement"],
    });
    expect(t.engagementAcotado).toBe(false);
  });
});

describe("la serie como corte", () => {
  it("agrupa por hashtag", () => {
    const g = gruposDe(
      [
        punto({ hashtag: "#SPARTA" }),
        punto({ hashtag: "#SPARTA" }),
        punto({ hashtag: "#FECHA21" }),
      ],
      "serie",
    );
    expect(g.map((x) => x.etiqueta)).toEqual(["#SPARTA", "#FECHA21"]);
    expect(g[0].n).toBe(2);
  });

  /*
   * "Sin clasificar" servía para reel/reactivo/editorial, pero una publicación
   * sin hashtag no está sin clasificar: no pertenece a ninguna serie.
   */
  it("las que no tienen hashtag se llaman «sin hashtag», no «sin clasificar»", () => {
    const g = gruposDe([punto({ hashtag: null }), punto({ hashtag: "#SPARTA" })], "serie");
    expect(g[g.length - 1].etiqueta).toBe("Sin hashtag");
    expect(etiquetaDeGrupo(SIN_CLASIFICAR, "serie")).toBe("Sin hashtag");
    expect(etiquetaDeGrupo(SIN_CLASIFICAR, "tipo_post")).toBe("Sin clasificar");
  });

  it("los cuatro gráficos de conjunto saben con qué corte se armaron", () => {
    for (const g of todosLosGraficos([punto()])) expect(g.agrupacion).toBe("tipo_post");
  });
});
