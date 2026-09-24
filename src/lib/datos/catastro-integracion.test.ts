/**
 * El catastro semanal de extremo a extremo, con los archivos reales:
 *
 *   exportaciones de agosto
 *     -> línea base en Postgres (misma migración que producción)
 *     -> vista lineas_base_hashtag
 *     -> registro de una semana, una fila por publicación
 *     -> construirBloque() con las DOS comparaciones
 *
 * Es la prueba que cubre el fallo silencioso de esta etapa: que el hashtag de
 * la línea base y el del registro se escriban distinto. Si eso pasara, la
 * vista seguiría funcionando pero TODAS las variaciones saldrían como guion, y
 * nadie sabría si es que no hay base o si es que la serie es nueva.
 */
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  bufferEjemplo,
  EJEMPLOS,
  hayEjemplos,
  type NombreEjemplo,
} from "@/lib/importar/archivos-de-ejemplo";
import {
  type BloqueCatastro,
  claveHashtag,
  construirBloque,
  destacadas,
  type FilaCatastro,
  type MapaPromedios,
  seriesCruzadas,
} from "@/lib/dominio/catastro";
import type { PromediosBase } from "@/lib/dominio/calculo";
import type { Cuenta } from "@/lib/dominio/redes";
import { aFilasRegistro } from "@/lib/importar/a-registro";
import { resolverCuenta } from "@/lib/importar/cuentas";
import { leerArchivo } from "@/lib/importar/parsers";
import { mesDe } from "@/lib/importar/util";
import { baseDePrueba } from "./base-de-prueba";

const FUENTES: NombreEjemplo[] = ["dbfMeta", "dltIconosquare", "tiktok", "youtube"];
const describir = hayEjemplos(...FUENTES) ? describe : describe.skip;

const LB = "11111111-1111-4111-8111-111111111111";
const USUARIO = "22222222-2222-4222-8222-222222222222";
/** La última semana de agosto, que es un subconjunto de la línea base. */
const SEMANA = { desde: "2026-08-25", hasta: "2026-08-31" };

function aPromedios(f: Record<string, unknown>): PromediosBase {
  const n = (v: unknown) => (v === null ? null : Number(v));
  return {
    n_publicaciones: Number(f.n_publicaciones),
    alcance_prom: n(f.alcance_prom),
    visualizaciones_prom: n(f.visualizaciones_prom),
    interacciones_prom: n(f.interacciones_prom),
    nuevos_seguidores_prom: n(f.nuevos_seguidores_prom),
    engagement_prom: n(f.engagement_prom),
  };
}

describir("catastro semanal con los archivos reales", () => {
  let db: PGlite;
  let bloques: BloqueCatastro[] = [];
  let filas: FilaCatastro[] = [];

  beforeAll(async () => {
    db = await baseDePrueba({
      uid: USUARIO,
      usuario: { id: USUARIO, email: "cata@dltsports.cl", nombre: "Catalina" },
    });
    await db.exec(
      `insert into public.lineas_base (id, mes, nombre, activa)
       values ('${LB}', '2026-08-01', 'agosto', true);`,
    );

    const cuentas = (await db.query<Cuenta>(`select * from public.cuentas`)).rows;

    for (const cual of FUENTES) {
      const leido = leerArchivo(EJEMPLOS[cual], bufferEjemplo(cual));
      const resuelta = resolverCuenta(cuentas, leido.detectada);
      if (!resuelta.ok) throw new Error(resuelta.motivo);
      const cuenta = resuelta.cuenta;

      // Línea base: todo agosto, por el camino de los lectores de archivos.
      for (const p of leido.publicaciones) {
        if (!p.publicado_en || mesDe(p.publicado_en) !== "2026-08") continue;
        await db.query(
          `insert into public.publicaciones_base
             (linea_base_id, cuenta_id, publicado_en, formato, tipo, serie_hashtag,
              alcance, visualizaciones, interacciones, nuevos_seguidores, fuente)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [
            LB, cuenta.id, p.publicado_en, p.formato, p.tipo, p.serie_hashtag,
            p.alcance, p.visualizaciones, p.interacciones, p.nuevos_seguidores,
            p.fuente,
          ],
        );
      }

      // El registro de la semana, por el camino de la importación al registro.
      for (const f of aFilasRegistro(leido.publicaciones, cuenta, SEMANA).filas) {
        await db.query(
          `insert into public.registros
             (fecha, cuenta_id, categoria, tipo, hashtag, publicaciones, alcance,
              visualizaciones, interacciones, nuevos_seguidores, id_externo,
              fuente, created_by)
           values ($1,$2,$3,$4,$5,1,$6,$7,$8,$9,$10,$11,$12)`,
          [
            f.fecha, cuenta.id, f.categoria, f.tipo, f.hashtag, f.alcance,
            f.visualizaciones, f.interacciones, f.nuevos_seguidores,
            f.id_externo, f.fuente, USUARIO,
          ],
        );
      }
    }

    /* A partir de acá se lee TODO desde la base, como lo hace la aplicación. */
    const vistaH = await db.query<Record<string, unknown>>(
      `select * from public.lineas_base_hashtag`,
    );
    const vistaC = await db.query<Record<string, unknown>>(
      `select * from public.lineas_base_detalle where categoria is null`,
    );
    const registros = await db.query<{
      cuenta_id: string;
      categoria: string | null;
      tipo: string | null;
      hashtag: string | null;
      publicaciones: number;
      alcance: number | null;
      visualizaciones: number | null;
      interacciones: number | null;
      nuevos_seguidores: number | null;
    }>(
      `select cuenta_id, categoria, tipo, hashtag, publicaciones, alcance,
              visualizaciones, interacciones, nuevos_seguidores
         from public.registros where fecha between $1 and $2`,
      [SEMANA.desde, SEMANA.hasta],
    );

    const porId = new Map(cuentas.map((c) => [c.id, c]));
    const porHashtag: MapaPromedios = new Map(
      vistaH.rows.map((f) => [
        claveHashtag(String(f.cuenta_id), f.hashtag as string | null),
        aPromedios(f),
      ]),
    );
    const porCuenta: MapaPromedios = new Map(
      vistaC.rows.map((f) => [String(f.cuenta_id), aPromedios(f)]),
    );

    filas = registros.rows.map((r) => ({
      cuentaId: r.cuenta_id,
      red: porId.get(r.cuenta_id)!.red,
      categoria: r.categoria as never,
      tipo: r.tipo as never,
      hashtag: r.hashtag,
      publicaciones: r.publicaciones,
      alcance: r.alcance,
      visualizaciones: r.visualizaciones,
      interacciones: r.interacciones,
      nuevos_seguidores: r.nuevos_seguidores,
      visitas_perfil: null,
      vistas_seguidores: null,
      vistas_no_seguidores: null,
    }));

    bloques = cuentas
      .filter((c) => filas.some((f) => f.cuentaId === c.id))
      .map((c) => construirBloque(filas, c, { porHashtag, porCuenta }));
  }, 300_000);

  afterAll(async () => {
    await db?.close();
  });

  it("las cuatro cuentas publicaron esa semana", () => {
    expect(bloques.map((b) => b.cuenta.nombre).sort()).toEqual([
      "Instagram DBF",
      "Instagram DLT",
      "TikTok",
      "YouTube",
    ]);
  });

  /*
   * LA prueba. Si el hashtag de la base y el del registro no calzaran, esto
   * daría cero y todo el catastro saldría en guiones.
   */
  it("la mayoría de las series encuentra su línea base", () => {
    const series = bloques.flatMap((b) =>
      b.series.filter((s) => s.corte.tipo === "hashtag"),
    );
    const conBase = series.filter((s) => s.base !== null);

    expect(series.length).toBeGreaterThan(20);
    // Son todas de agosto y la base es agosto: TODAS tienen que calzar.
    expect(conBase).toHaveLength(series.length);
    expect(series.every((s) => !s.serieNueva)).toBe(true);
  });

  it("las dos comparaciones dan números distintos entre sí", () => {
    /*
     * Si dieran siempre lo mismo, una de las dos sería redundante y no valdría
     * la columna que ocupa. El caso real: #MUNDIALISTASXDLT en TikTok está por
     * encima de su propia serie y muy por debajo del promedio de la cuenta.
     */
    const distintas = bloques
      .flatMap((b) => b.series)
      .filter(
        (s) =>
          s.vsSuBase.alcance !== null &&
          s.vsPromedioCuenta.alcance !== null &&
          Math.abs(s.vsSuBase.alcance - s.vsPromedioCuenta.alcance) > 0.1,
      );

    expect(distintas.length).toBeGreaterThan(5);
  });

  it("encuentra el mismo hashtag publicado en varias cuentas, separado por cuenta", () => {
    const cruzadas = seriesCruzadas(bloques);
    expect(cruzadas.length).toBeGreaterThan(3);

    // El caso que pidió el equipo: la misma serie en Instagram y en TikTok.
    const mundialistas = cruzadas.find((c) => c.hashtag === "MUNDIALISTASXDLT");
    expect(mundialistas).toBeDefined();
    expect(mundialistas!.cuentas.length).toBeGreaterThan(1);

    // Cada cuenta con su propio número: ninguna fila las promedia entre sí.
    const nombres = mundialistas!.cuentas.map((c) => c.cuenta.nombre);
    expect(new Set(nombres).size).toBe(nombres.length);
  });

  it("§9.2 — el TOTAL de una cuenta no es la suma de sus series", () => {
    const dlt = bloques.find((b) => b.cuenta.nombre === "Instagram DLT")!;
    const sumaDeSeries = dlt.series.reduce((n, s) => n + s.publicaciones, 0);

    // Acá coinciden porque cada publicación tiene un solo hashtag, pero el
    // TOTAL se calcula sobre todas las filas y no sumando cortes.
    expect(dlt.total.publicaciones).toBe(sumaDeSeries);
    expect(dlt.total.periodo.alcance).not.toBe(
      dlt.series.reduce((n, s) => n + (s.periodo.alcance ?? 0), 0),
    );
  });

  it("§9.6 — YouTube no trae alcance y destaca por visualizaciones", () => {
    const yt = bloques.find((b) => b.cuenta.nombre === "YouTube")!;
    expect(yt.total.periodo.alcance).toBeNull();
    expect(yt.total.periodo.visualizaciones).not.toBeNull();
    expect(yt.total.engagementNoComparable).toBe(true);

    const { mejores, peores } = destacadas(bloques);
    const deYT = [...mejores, ...peores].filter(
      (d) => d.cuenta.nombre === "YouTube",
    );
    // Con el alcance como única métrica, YouTube nunca podía aparecer.
    expect(deYT.every((d) => d.metrica === "visualizaciones")).toBe(true);
  });

  it("las publicaciones sin hashtag son su propio corte, no un total", () => {
    const yt = bloques.find((b) => b.cuenta.nombre === "YouTube")!;
    const sin = yt.series.find((s) => s.corte.tipo === "sin-hashtag");

    // En la semana de ejemplo, varios videos de YouTube no traen hashtag.
    expect(sin).toBeDefined();
    expect(sin!.etiqueta).toBe("Sin hashtag");
    expect(sin!.publicaciones).toBeLessThan(yt.total.publicaciones);
  });
});
