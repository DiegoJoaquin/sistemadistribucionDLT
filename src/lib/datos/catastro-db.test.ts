/**
 * El corte por hashtag de la línea base, contra Postgres de verdad.
 *
 * Lo que las pruebas puras no pueden ver es el riesgo real de esta etapa: que
 * el hashtag de la línea base y el del registro no queden escritos igual. Si
 * uno dice "#Fecha21xDLT" y el otro "FECHA21XDLT", el catastro no encuentra
 * base para ninguna serie y TODAS las variaciones salen como guion sin
 * explicar por qué. Es un fallo que no se nota: la vista funciona, solo está
 * vacía de comparaciones.
 */
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { claveHashtag } from "@/lib/dominio/catastro";
import { normalizarHashtag } from "@/lib/dominio/hashtag";
import { primerHashtag } from "@/lib/importar/util";
import {
  aplicarMigraciones,
  baseDePrueba,
  PERMISOS_AUTHENTICATED,
  preludioSupabase,
} from "./base-de-prueba";

const LB = "11111111-1111-4111-8111-111111111111";
const USUARIO = "22222222-2222-4222-8222-222222222222";

/** La migración que agrega el corte por hashtag. */
const MIGRACION = "20260924090000_linea_base_por_hashtag.sql";

interface FilaVista {
  cuenta: string;
  hashtag: string | null;
  n_publicaciones: number;
  alcance_prom: string | null;
  engagement_prom: string | null;
}

describe("línea base por hashtag", () => {
  let db: PGlite;
  let idIG: string;
  let idYT: string;

  beforeAll(async () => {
    db = await baseDePrueba({
      uid: USUARIO,
      usuario: { id: USUARIO, email: "cata@dltsports.cl", nombre: "Catalina" },
    });

    await db.exec(
      `insert into public.lineas_base (id, mes, nombre, activa)
       values ('${LB}', '2026-08-01', 'agosto', true);`,
    );

    const cuentas = await db.query<{ id: string; nombre: string }>(
      `select id, nombre from public.cuentas
        where nombre in ('Instagram DLT', 'YouTube')`,
    );
    idIG = cuentas.rows.find((c) => c.nombre === "Instagram DLT")!.id;
    idYT = cuentas.rows.find((c) => c.nombre === "YouTube")!.id;

    const insertar = (
      cuentaId: string,
      hashtag: string | null,
      alcance: number | null,
      visualizaciones: number,
      interacciones: number,
      formato: string,
    ) =>
      db.query(
        `insert into public.publicaciones_base
           (linea_base_id, cuenta_id, serie_hashtag, alcance, visualizaciones,
            interacciones, nuevos_seguidores, formato, fuente)
         values ($1, $2, $3, $4, $5, $6, 5, $7::public.categoria, 'meta')`,
        [LB, cuentaId, hashtag, alcance, visualizaciones, interacciones, formato],
      );

    // Tres de la misma serie, escritas de tres formas distintas a propósito.
    await insertar(idIG, "#Fecha21xDLT", 10_000, 20_000, 500, "Reel");
    await insertar(idIG, "fecha21xdlt", 20_000, 40_000, 1_000, "Reel");
    await insertar(idIG, "FECHA21XDLT", 30_000, 60_000, 1_500, "Reel");
    // Otra serie, y una sin hashtag.
    await insertar(idIG, "MUNDIALISTASXDLT", 50_000, 80_000, 2_000, "Reel");
    await insertar(idIG, null, 4_000, 8_000, 100, "Imagen");
    // YouTube: sin alcance (§9.6).
    await insertar(idYT, "FECHA21XDLT", null, 10_000, 500, "Short");
  }, 120_000);

  afterAll(async () => {
    await db?.close();
  });

  it("las tres formas de escribir el hashtag son UNA serie", async () => {
    const r = await db.query<FilaVista>(
      `select cuenta, hashtag, n_publicaciones, alcance_prom::text, engagement_prom::text
         from public.lineas_base_hashtag
        where cuenta_id = $1 order by n_publicaciones desc, hashtag`,
      [idIG],
    );

    expect(r.rows.map((x) => [x.hashtag, x.n_publicaciones])).toEqual([
      ["FECHA21XDLT", 3],
      ["MUNDIALISTASXDLT", 1],
      // Las sin hashtag son su propio grupo, no un total.
      [null, 1],
    ]);
  });

  it("los promedios son por publicación, no sumas", async () => {
    const r = await db.query<FilaVista>(
      `select alcance_prom::text, engagement_prom::text
         from public.lineas_base_hashtag
        where cuenta_id = $1 and hashtag = 'FECHA21XDLT'`,
      [idIG],
    );
    // (10.000 + 20.000 + 30.000) / 3
    expect(Number(r.rows[0].alcance_prom)).toBeCloseTo(20_000, 6);
    // Razón de sumas: 3.000 / 60.000 (§9.1)
    expect(Number(r.rows[0].engagement_prom)).toBeCloseTo(0.05, 10);
  });

  it("§9.6 — sin alcance, el engagement de la serie va sobre visualizaciones", async () => {
    const r = await db.query<FilaVista>(
      `select alcance_prom::text, engagement_prom::text
         from public.lineas_base_hashtag
        where cuenta_id = $1 and hashtag = 'FECHA21XDLT'`,
      [idYT],
    );
    expect(r.rows[0].alcance_prom).toBeNull();
    expect(Number(r.rows[0].engagement_prom)).toBeCloseTo(0.05, 10);
  });

  /*
   * LA prueba que importa. El hashtag del registro y el de la línea base los
   * escriben dos caminos distintos: el formulario pasa por `normalizarHashtag`
   * y los lectores de archivos por `primerHashtag`. Si no coinciden, el
   * catastro no encuentra base y todo sale como guion.
   */
  it("el hashtag del registro y el de la línea base calzan", async () => {
    const caption = "🇨🇱 #Fecha21xDLT | el resumen de la jornada";

    await db.query(
      `insert into public.registros
         (fecha, cuenta_id, categoria, hashtag, publicaciones, alcance,
          visualizaciones, interacciones, created_by)
       values ('2026-09-24', $1, 'Reel', $2, 1, 25000, 50000, 1200, $3)`,
      [idIG, normalizarHashtag("#Fecha21xDLT"), USUARIO],
    );

    const registro = await db.query<{ hashtag: string }>(
      `select hashtag from public.registros`,
    );
    const vista = await db.query<{ hashtag: string }>(
      `select hashtag from public.lineas_base_hashtag
        where cuenta_id = $1 and hashtag is not null order by hashtag`,
      [idIG],
    );

    expect(registro.rows[0].hashtag).toBe("FECHA21XDLT");
    expect(vista.rows.map((v) => v.hashtag)).toContain("FECHA21XDLT");

    // Y los dos caminos de la aplicación producen el mismo texto.
    expect(primerHashtag(caption)).toBe(normalizarHashtag("#Fecha21xDLT"));

    // La clave con la que el catastro busca la base es la misma en ambos lados.
    expect(claveHashtag(idIG, registro.rows[0].hashtag)).toBe(
      claveHashtag(idIG, vista.rows[0].hashtag),
    );
  });
});

/**
 * La migración corriendo sobre datos que ya existen, que es lo que pasa en
 * producción: la línea base de agosto ya está cargada con los hashtags como
 * los dejaron los lectores, y la migración tiene que normalizarlos sin que
 * nadie vuelva a importar nada.
 */
describe("la migración sobre datos ya cargados", () => {
  let db: PGlite;

  beforeAll(async () => {
    db = new PGlite();
    await db.exec(preludioSupabase({ uid: USUARIO }));
    // Todo el esquema MENOS la migración nueva.
    await aplicarMigraciones(db, { hasta: "20260923170000_registro_tipo_contenido.sql" });
    await db.exec(PERMISOS_AUTHENTICATED);

    await db.exec(
      `insert into auth.users (id, email) values ('${USUARIO}', 'cata@dltsports.cl');
       update public.perfiles set autorizado = true where id = '${USUARIO}';
       insert into public.lineas_base (id, mes, nombre, activa)
         values ('${LB}', '2026-08-01', 'agosto', true);`,
    );

    const c = await db.query<{ id: string }>(
      `select id from public.cuentas where nombre = 'Instagram DLT'`,
    );

    // Hashtags sin normalizar, como los dejaría una carga vieja.
    for (const h of ["#Fecha21xDLT", " fecha21xdlt ", "FECHA21XDLT", ""]) {
      await db.query(
        `insert into public.publicaciones_base
           (linea_base_id, cuenta_id, serie_hashtag, alcance, visualizaciones,
            interacciones, formato, fuente)
         values ($1, $2, $3, 10000, 20000, 500, 'Reel', 'meta')`,
        [LB, c.rows[0].id, h],
      );
    }

    // Recién ahora se aplica la migración.
    await aplicarMigraciones(db, { desde: MIGRACION });
  }, 120_000);

  afterAll(async () => {
    await db?.close();
  });

  it("normaliza lo que ya estaba cargado, sin reimportar nada", async () => {
    const r = await db.query<{ hashtag: string | null; n: string }>(
      `select serie_hashtag as hashtag, count(*)::text as n
         from public.publicaciones_base group by serie_hashtag order by n desc`,
    );

    expect(r.rows).toEqual([
      { hashtag: "FECHA21XDLT", n: "3" },
      // La cadena vacía pasa a null: "" no es una serie.
      { hashtag: null, n: "1" },
    ]);
  });

  it("y desde ahí el corte por hashtag agrupa bien", async () => {
    const r = await db.query<{ hashtag: string | null; n_publicaciones: number }>(
      `select hashtag, n_publicaciones from public.lineas_base_hashtag
        order by n_publicaciones desc`,
    );
    expect(r.rows).toEqual([
      { hashtag: "FECHA21XDLT", n_publicaciones: 3 },
      { hashtag: null, n_publicaciones: 1 },
    ]);
  });
});
