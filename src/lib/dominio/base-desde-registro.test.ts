/**
 * La línea base es la vara contra la que se mide todo lo demás. Si sale mal,
 * no falla nada visible: simplemente todos los deltas del mes siguiente
 * apuntan en la dirección equivocada. Por eso estas pruebas.
 */
import { describe, expect, it } from "vitest";
import {
  aPublicacionesBase,
  esMesValido,
  rangoDelMes,
  type RegistroParaBase,
} from "./base-desde-registro";

function registro(p: Partial<RegistroParaBase> = {}): RegistroParaBase {
  return {
    id: crypto.randomUUID(),
    cuenta_id: "c-ig",
    fecha: "2026-09-15",
    publicado_en: "2026-09-15T18:30:00",
    categoria: "Reel",
    tipo: "Normal",
    hashtag: "SPARTA",
    titulo_contenido: "Resumen de la fecha",
    enlace: "https://instagram.com/p/abc",
    id_externo: "abc",
    fuente: "meta",
    publicaciones: 1,
    alcance: 9_000,
    visualizaciones: 12_000,
    interacciones: 335,
    nuevos_seguidores: 8,
    me_gusta: 300,
    comentarios: 20,
    compartidos: 10,
    guardados: 5,
    favoritos: null,
    duracion_s: 45,
    ...p,
  };
}

const LINEA = "11111111-1111-4111-8111-111111111111";

describe("aPublicacionesBase", () => {
  it("copia la publicación entera, con su desglose", () => {
    const { filas } = aPublicacionesBase([registro()], LINEA);
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({
      linea_base_id: LINEA,
      cuenta_id: "c-ig",
      formato: "Reel",
      tipo: "Normal",
      serie_hashtag: "SPARTA",
      alcance: 9_000,
      me_gusta: 300,
      comentarios: 20,
      compartidos: 10,
      guardados: 5,
      duracion_s: 45,
      interacciones: 335,
      id_externo: "abc",
      fuente: "meta",
    });
  });

  /*
   * §9.5 — LA regla de esta conversión. En la línea base una fila ES una
   * publicación. Copiar una que vale por tres diría que una sola publicación
   * tuvo el alcance de las tres, y eso infla el promedio del mes contra el que
   * se va a comparar todo lo que venga después.
   */
  it("§9.5 — deja fuera las filas que representan varias publicaciones", () => {
    const r = aPublicacionesBase(
      [registro(), registro({ publicaciones: 3, alcance: 27_000 })],
      LINEA,
    );
    expect(r.filas).toHaveLength(1);
    expect(r.agrupadas).toBe(1);
    expect(r.publicacionesAgrupadas).toBe(3);
  });

  it("cuenta cuántas publicaciones se pierden, no solo cuántas filas", () => {
    const r = aPublicacionesBase(
      [registro({ publicaciones: 4 }), registro({ publicaciones: 2 })],
      LINEA,
    );
    expect(r.agrupadas).toBe(2);
    expect(r.publicacionesAgrupadas).toBe(6);
  });

  /*
   * Las filas cargadas a mano no traen hora, y la línea base no tiene una
   * columna de fecha suelta. Dejarla en nulo perdía el día entero, que es lo
   * único que esa fila sí sabe.
   */
  it("una fila sin hora se fecha a la medianoche de su día, y se cuenta", () => {
    const r = aPublicacionesBase(
      [registro({ publicado_en: null, fecha: "2026-09-03" })],
      LINEA,
    );
    expect(r.filas[0].publicado_en).toBe("2026-09-03T00:00:00");
    expect(r.sinHora).toBe(1);
  });

  it("la que sí trae hora la conserva tal cual", () => {
    const r = aPublicacionesBase([registro()], LINEA);
    expect(r.filas[0].publicado_en).toBe("2026-09-15T18:30:00");
    expect(r.sinHora).toBe(0);
  });

  /*
   * §9.4 — un campo que el registro no tiene llega vacío a la línea base, no en
   * cero. Un cero ahí bajaría el promedio del mes inventando una medición.
   */
  it("§9.4 — lo que no se midió sigue vacío, nunca en cero", () => {
    const { filas } = aPublicacionesBase(
      [registro({ guardados: null, favoritos: null, nuevos_seguidores: null })],
      LINEA,
    );
    expect(filas[0].guardados).toBeNull();
    expect(filas[0].favoritos).toBeNull();
    expect(filas[0].nuevos_seguidores).toBeNull();
  });

  /* §9.6 — YouTube no entrega alcance y el registro ya lo guarda vacío. */
  it("§9.6 — el alcance vacío de YouTube pasa vacío", () => {
    const { filas } = aPublicacionesBase(
      [registro({ cuenta_id: "c-yt", categoria: "Short", tipo: null, alcance: null })],
      LINEA,
    );
    expect(filas[0].alcance).toBeNull();
    expect(filas[0].formato).toBe("Short");
  });

  /*
   * §3.2 — formato y tipo son dos clasificaciones distintas de la misma
   * publicación, y la línea base las guarda en columnas distintas igual que el
   * registro. Mezclarlas haría que el corte Reactivo/Normal del panel quedara
   * vacío para todo el mes.
   */
  it("§3.2 — el formato y el tipo van a columnas distintas", () => {
    const { filas } = aPublicacionesBase(
      [registro({ categoria: "Reel", tipo: "Reactivo" })],
      LINEA,
    );
    expect(filas[0].formato).toBe("Reel");
    expect(filas[0].tipo).toBe("Reactivo");
  });

  /*
   * `tipo_auto` guarda, en la importación, lo que clasificó el lector, para
   * poder ver después qué se corrigió a mano. Lo que viene del registro ya
   * puede estar corregido, así que los dos valores son el mismo: decir que es
   * automática sería mentir, y decir que es manual también.
   */
  it("tipo_auto queda igual que tipo, porque el registro no distingue", () => {
    const { filas } = aPublicacionesBase([registro({ tipo: "Reactivo" })], LINEA);
    expect(filas[0].tipo_auto).toBe("Reactivo");
  });

  it("sin registros no inventa filas", () => {
    const r = aPublicacionesBase([], LINEA);
    expect(r.filas).toEqual([]);
    expect(r.agrupadas).toBe(0);
  });
});

describe("rangoDelMes", () => {
  it("cubre el mes entero", () => {
    expect(rangoDelMes("2026-09")).toEqual({ desde: "2026-09-01", hasta: "2026-09-30" });
    expect(rangoDelMes("2026-10")).toEqual({ desde: "2026-10-01", hasta: "2026-10-31" });
  });

  it("acierta en febrero, bisiesto o no", () => {
    expect(rangoDelMes("2026-02").hasta).toBe("2026-02-28");
    expect(rangoDelMes("2028-02").hasta).toBe("2028-02-29");
  });
});

describe("esMesValido", () => {
  it("acepta un mes bien escrito", () => {
    expect(esMesValido("2026-09")).toBe(true);
    expect(esMesValido("2026-12")).toBe(true);
  });

  it("rechaza lo que no es un mes", () => {
    for (const v of ["2026-13", "2026-00", "2026-9", "septiembre", "", null, 202609]) {
      expect(esMesValido(v)).toBe(false);
    }
  });
});
