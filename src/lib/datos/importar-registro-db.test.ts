/**
 * La importación al registro, contra Postgres de verdad.
 *
 * Lo que las pruebas puras no pueden ver: que la base acepte estas filas con
 * sus triggers puestos, que el índice único por (cuenta, id_externo) haga lo
 * que se espera, y que una cuenta de influencer — que no tiene equivalente en
 * el enum viejo de plataformas — se pueda cargar sin que nada se caiga.
 *
 * Es justo la parte donde un error no se nota hasta que los promedios ya están
 * mal: si reimportar duplicara las filas, el divisor de cada promedio del día
 * se iría al doble sin ningún aviso.
 */
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  aFilaRegistro,
  aFilasRegistro,
  fusionarConExistente,
  type FilaRegistroImportada,
} from "@/lib/importar/a-registro";
import type { Cuenta } from "@/lib/dominio/redes";
import type { PublicacionImportada } from "@/lib/importar/tipos";
import { baseDePrueba } from "./base-de-prueba";

const USUARIO = "22222222-2222-4222-8222-222222222222";

let db: PGlite;

/** Una cuenta de influencer: no existe en el enum viejo de plataformas. */
async function crearCuenta(
  nombre: string,
  usuario: string,
  red: string,
  esInfluencer = true,
): Promise<Cuenta> {
  const r = await db.query<{ id: string }>(
    `insert into public.cuentas (nombre, usuario, red, es_influencer)
     values ($1, $2, $3::public.red, $4) returning id`,
    [nombre, usuario, red, esInfluencer],
  );
  return {
    id: r.rows[0].id,
    nombre,
    usuario,
    red: red as Cuenta["red"],
    es_influencer: esInfluencer,
    activa: true,
    orden: 100,
  };
}

const COLUMNAS = [
  "fecha",
  "cuenta_id",
  "categoria",
  "tipo",
  "hashtag",
  "publicaciones",
  "alcance",
  "visualizaciones",
  "interacciones",
  "nuevos_seguidores",
  "titulo_contenido",
  "enlace",
  "publicado_en",
  "id_externo",
  "fuente",
] as const;

async function insertar(f: FilaRegistroImportada) {
  const valores = COLUMNAS.map((c) => f[c]);
  await db.query(
    `insert into public.registros (${COLUMNAS.join(", ")}, created_by)
     values (${COLUMNAS.map((_, i) => `$${i + 1}`).join(", ")}, $${
       COLUMNAS.length + 1
     })`,
    [...valores, USUARIO],
  );
}

async function actualizar(id: string, f: FilaRegistroImportada) {
  await db.query(
    `update public.registros set ${COLUMNAS.map((c, i) => `${c} = $${i + 1}`).join(
      ", ",
    )} where id = $${COLUMNAS.length + 1}`,
    [...COLUMNAS.map((c) => f[c]), id],
  );
}

function pub(p: Partial<PublicacionImportada> = {}): PublicacionImportada {
  return {
    publicado_en: "2026-09-15T18:30:00",
    formato: "Reel",
    tipo: "Normal",
    tipo_auto: "Normal",
    serie_hashtag: "FECHA21XDLT",
    caption: "#Fecha21xDLT resumen",
    duracion_s: 45,
    visualizaciones: 12_000,
    alcance: 9_000,
    me_gusta: 300,
    comentarios: 20,
    compartidos: 10,
    guardados: 5,
    favoritos: null,
    nuevos_seguidores: 8,
    interacciones: 335,
    enlace: "https://instagram.com/p/abc",
    id_externo: "abc",
    fuente: "meta",
    ...p,
  };
}

/*
 * Una sola base para todo el archivo. Levantar PGlite y aplicar las migraciones
 * toma varios segundos, y hacerlo por prueba agotaba el tiempo del hook cuando
 * la suite corre en paralelo. Entre pruebas basta con vaciar lo que cada una
 * escribe; las cinco cuentas que siembra la migración se dejan en pie.
 */
beforeAll(async () => {
  db = await baseDePrueba({
    uid: USUARIO,
    usuario: { id: USUARIO, email: "cata@dltsports.cl", nombre: "Catalina" },
  });
}, 120_000);

beforeEach(async () => {
  await db.exec(
    `delete from public.registros;
     delete from public.cuentas where es_influencer;`,
  );
});

afterAll(async () => {
  await db?.close();
});

describe("importar publicaciones al registro", () => {
  it("carga una cuenta de influencer, que no existe en el enum viejo", async () => {
    const diego = await crearCuenta("DiegoAT", "@diegoat", "Instagram");
    await insertar(aFilaRegistro(pub(), diego)!);

    const r = await db.query<{
      plataforma: string | null;
      cuenta_id: string;
      hashtag: string;
      publicaciones: number;
      fuente: string;
    }>(`select plataforma, cuenta_id, hashtag, publicaciones, fuente
          from public.registros`);

    expect(r.rows).toHaveLength(1);
    // La columna heredada queda vacía, que es lo correcto: esta cuenta no
    // tiene ningún valor que le corresponda en el enum de cinco plataformas.
    expect(r.rows[0].plataforma).toBeNull();
    expect(r.rows[0].cuenta_id).toBe(diego.id);
    expect(r.rows[0].hashtag).toBe("FECHA21XDLT");
    expect(r.rows[0].publicaciones).toBe(1);
    expect(r.rows[0].fuente).toBe("meta");
  });

  it("a las cinco cuentas originales el trigger les sigue llenando la plataforma", async () => {
    const dlt = await db.query<{ id: string }>(
      `select id from public.cuentas where nombre = 'Instagram DLT'`,
    );
    const cuenta: Cuenta = {
      id: dlt.rows[0].id,
      nombre: "Instagram DLT",
      usuario: "@dltsports",
      red: "Instagram",
      es_influencer: false,
      activa: true,
      orden: 1,
    };
    await insertar(aFilaRegistro(pub(), cuenta)!);

    const r = await db.query<{ plataforma: string | null }>(
      `select plataforma from public.registros`,
    );
    expect(r.rows[0].plataforma).toBe("Instagram DLT");
  });

  it("reimportar el mismo archivo no duplica: actualiza", async () => {
    const diego = await crearCuenta("DiegoAT", "@diegoat", "Instagram");

    // Primera carga: Iconosquare, que trae alcance pero no nuevos seguidores.
    const primera = aFilaRegistro(
      pub({ fuente: "iconosquare", nuevos_seguidores: null, alcance: 9_000 }),
      diego,
    )!;
    await insertar(primera);

    // Segunda: Meta, que trae nuevos seguidores pero cuyo alcance no llegó.
    const segunda = aFilaRegistro(
      pub({ fuente: "meta", nuevos_seguidores: 8, alcance: null }),
      diego,
    )!;

    const existente = await db.query<{ id: string }>(
      `select id from public.registros where cuenta_id = $1 and id_externo = $2`,
      [diego.id, segunda.id_externo],
    );
    expect(existente.rows).toHaveLength(1);

    await actualizar(existente.rows[0].id, fusionarConExistente(primera, segunda));

    const r = await db.query<{
      n: string;
      alcance: number | null;
      nuevos_seguidores: number | null;
    }>(`select count(*)::text as n, max(alcance) as alcance,
               max(nuevos_seguidores) as nuevos_seguidores
          from public.registros`);

    // Una sola fila, y con los datos de las DOS exportaciones.
    expect(Number(r.rows[0].n)).toBe(1);
    expect(r.rows[0].alcance).toBe(9_000);
    expect(r.rows[0].nuevos_seguidores).toBe(8);
  });

  it("el índice único impide dos filas con el mismo id_externo en la cuenta", async () => {
    const diego = await crearCuenta("DiegoAT", "@diegoat", "Instagram");
    await insertar(aFilaRegistro(pub(), diego)!);
    await expect(insertar(aFilaRegistro(pub(), diego)!)).rejects.toThrow();
  });

  it("el mismo video en dos cuentas son dos filas, cada una con sus métricas", async () => {
    /*
     * Es el caso que pidió el equipo: el mismo video se sube a TikTok y a
     * Instagram y hay que verlo por separado, "en esta cuenta pasó esto y en la
     * otra esto". Cada plataforma le da su propio identificador, así que las
     * dos filas conviven.
     */
    const ig = await crearCuenta("DiegoAT", "@diegoat", "Instagram");
    const tt = await crearCuenta("DiegoAT TikTok", "@diegoat", "TikTok");

    await insertar(
      aFilaRegistro(pub({ id_externo: "ig-1", alcance: 9_000 }), ig)!,
    );
    await insertar(
      aFilaRegistro(
        pub({ id_externo: "tt-1", formato: "Video", alcance: 40_000 }),
        tt,
      )!,
    );

    const r = await db.query<{ cuenta: string; alcance: number; hashtag: string }>(
      `select c.nombre as cuenta, r.alcance, r.hashtag
         from public.registros r join public.cuentas c on c.id = r.cuenta_id
        order by c.nombre`,
    );

    expect(r.rows).toHaveLength(2);
    expect(r.rows.map((x) => [x.cuenta, x.alcance])).toEqual([
      ["DiegoAT", 9_000],
      ["DiegoAT TikTok", 40_000],
    ]);
    // El mismo hashtag en las dos: así el catastro puede cruzarlas.
    expect(new Set(r.rows.map((x) => x.hashtag))).toEqual(new Set(["FECHA21XDLT"]));
  });

  it("§9.6 — la base acepta la fila de YouTube porque el alcance va vacío", async () => {
    const yt = await crearCuenta("DLT Running YT", "@dltrunning", "YouTube");
    const fila = aFilaRegistro(pub({ formato: "Short", alcance: 5_000 }), yt)!;
    await insertar(fila);

    const r = await db.query<{ alcance: number | null; categoria: string }>(
      `select alcance, categoria from public.registros`,
    );
    expect(r.rows[0].alcance).toBeNull();
    expect(r.rows[0].categoria).toBe("Short");
  });

  /*
   * El error que rompió la importación de julio, de punta a punta.
   *
   * PostgREST escribe haciendo un cast del cuerpo de la petición a `json`, así
   * que todo lo que va a la base pasa por el parser de JSON de Postgres. Un
   * caption con un emoji cortado al medio dejaba media pareja UTF-16, que
   * `JSON.stringify` emite como "\ud83c" suelto, y ese parser la rechaza con
   * "invalid input syntax for type json" — tumbando la tanda entera de 200
   * filas. Acá se verifica que el texto que produce el importador ya no puede
   * hacer eso.
   */
  it("un caption con emoji en el borde del recorte es JSON que Postgres acepta", async () => {
    const diego = await crearCuenta("DiegoAT", "@diegoat", "Instagram");

    for (let relleno = 292; relleno <= 304; relleno++) {
      const caption = `${"A".repeat(relleno)}🇨🇱 y más texto que sobra del recorte`;
      const fila = aFilaRegistro(
        pub({ caption, id_externo: `emoji-${relleno}` }),
        diego,
      )!;

      // Tal como viaja: serializado y parseado por Postgres.
      const cuerpo = JSON.stringify([{ t: fila.titulo_contenido }]);
      const r = await db.query<{ t: string }>(
        `select x.t from json_populate_recordset(null::record, $1::json) as x(t text)`,
        [cuerpo],
      );
      expect(r.rows[0].t).toBe(fila.titulo_contenido);

      // Y entra en la tabla de verdad.
      await insertar(fila);
    }

    const total = await db.query<{ n: string }>(
      `select count(*)::text as n from public.registros`,
    );
    expect(Number(total.rows[0].n)).toBe(13);
  });

  it("rechaza lo que Postgres rechazaría, para que la prueba anterior valga", async () => {
    // Si esto pasara, la prueba de arriba no estaría probando nada.
    await expect(
      db.query(
        `select x.t from json_populate_recordset(null::record, '[{"t":"a \\ud83c"}]'::json) as x(t text)`,
      ),
    ).rejects.toThrow(/invalid input syntax for type json/);
  });

  it("carga un lote completo y el hashtag queda normalizado en la base", async () => {
    const diego = await crearCuenta("DiegoAT", "@diegoat", "Instagram");
    const conversion = aFilasRegistro(
      [
        pub({ id_externo: "1", serie_hashtag: "#fecha21xdlt" }),
        pub({ id_externo: "2", serie_hashtag: "FECHA21XDLT" }),
        pub({ id_externo: "3", serie_hashtag: null, caption: "sin hashtag" }),
      ],
      diego,
    );

    for (const f of conversion.filas) await insertar(f);

    const r = await db.query<{ hashtag: string | null; n: string }>(
      `select hashtag, count(*)::text as n from public.registros
        group by hashtag order by n desc`,
    );
    // Las dos formas de escribirlo son UNA serie, no dos.
    expect(r.rows).toEqual([
      { hashtag: "FECHA21XDLT", n: "2" },
      { hashtag: null, n: "1" },
    ]);
  });
});
