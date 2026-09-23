/**
 * La migración que convierte las cuentas en datos.
 *
 * Lo que hay que demostrar es que no se pierde ni se corrompe nada: las filas
 * que ya existían quedan apuntando a su cuenta, las reglas de §9 siguen
 * vigentes ahora sobre la red, y se puede agregar una cuenta de influencer sin
 * tocar el código ni el esquema.
 */
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { aplicarMigraciones, baseDePrueba, preludioSupabase } from "./base-de-prueba";
import { PGlite as PG } from "@electric-sql/pglite";

const USUARIO = "22222222-2222-2222-2222-222222222222";
const LB = "11111111-1111-1111-1111-111111111111";

let db: PGlite;

/** Nombre de la cuenta de una fila, resolviendo el id. */
async function cuentaDe(tabla: string, columna: string, valor: string) {
  const r = await db.query<{ nombre: string }>(
    `select c.nombre from public.${tabla} t
       join public.cuentas c on c.id = t.cuenta_id
      where t.${columna} = $1 limit 1`,
    [valor],
  );
  return r.rows[0]?.nombre ?? null;
}

async function idCuenta(nombre: string): Promise<string> {
  const r = await db.query<{ id: string }>(
    `select id from public.cuentas where nombre = $1`,
    [nombre],
  );
  return r.rows[0].id;
}

beforeAll(async () => {
  db = await baseDePrueba({
    uid: USUARIO,
    usuario: { id: USUARIO, email: "cata@dltsports.cl" },
  });
  await db.exec(
    `insert into public.lineas_base (id, mes, nombre, activa)
     values ('${LB}', '2026-08-01', 'agosto', true);`,
  );
}, 180_000);

afterAll(async () => {
  await db?.close();
});

describe("las cinco cuentas originales quedan sembradas", () => {
  it("existen con su red y su usuario", async () => {
    const r = await db.query<{ nombre: string; red: string; usuario: string }>(
      `select nombre, red::text as red, usuario from public.cuentas order by orden`,
    );
    expect(r.rows.map((c) => [c.nombre, c.red])).toEqual([
      ["Instagram DLT", "Instagram"],
      ["Instagram DBF", "Instagram"],
      ["TikTok", "TikTok"],
      ["YouTube", "YouTube"],
      ["Twitter/X", "Twitter/X"],
    ]);
    expect(r.rows[0].usuario).toBe("@dltsports");
  });
});

describe("las filas nuevas se pueden escribir con cualquiera de las dos columnas", () => {
  it("escribiendo plataforma se completa la cuenta (código viejo)", async () => {
    await db.exec(
      `insert into public.registros (fecha, plataforma, categoria, publicaciones, alcance, created_by)
       values ('2026-09-21', 'Instagram DLT', 'Reel', 1, 50000, '${USUARIO}');`,
    );
    expect(await cuentaDe("registros", "fecha", "2026-09-21")).toBe("Instagram DLT");
  });

  it("escribiendo la cuenta se completa plataforma (código nuevo)", async () => {
    const id = await idCuenta("TikTok");
    await db.query(
      `insert into public.registros (fecha, cuenta_id, categoria, publicaciones, alcance, created_by)
       values ('2026-09-22', $1, 'Video', 2, 80000, '${USUARIO}')`,
      [id],
    );
    const r = await db.query<{ plataforma: string }>(
      `select plataforma::text as plataforma from public.registros where fecha = '2026-09-22'`,
    );
    expect(r.rows[0].plataforma).toBe("TikTok");
  });

  it("rechaza un nombre de plataforma que no corresponde a ninguna cuenta", async () => {
    await expect(
      db.exec(
        `insert into public.registros (fecha, plataforma, publicaciones, created_by)
         values ('2026-09-21', 'Instagram', 1, '${USUARIO}');`,
      ),
    ).rejects.toThrow();
  });
});

describe("agregar una cuenta de influencer, sin tocar el código", () => {
  let diegoat: string;

  beforeAll(async () => {
    await db.exec(
      `insert into public.cuentas (nombre, usuario, red, es_influencer, orden)
       values ('DiegoAT', '@diegoat', 'Instagram', true, 10);`,
    );
    diegoat = await idCuenta("DiegoAT");
  });

  it("acepta registros de esa cuenta", async () => {
    await db.query(
      `insert into public.registros (fecha, cuenta_id, categoria, publicaciones, alcance, created_by)
       values ('2026-09-21', $1, 'Reel', 1, 12000, '${USUARIO}')`,
      [diegoat],
    );
    const r = await db.query<{ n: string }>(
      `select count(*)::text as n from public.registros where cuenta_id = $1`,
      [diegoat],
    );
    expect(Number(r.rows[0].n)).toBe(1);
  });

  it("deja plataforma vacía, porque no tiene equivalente en el enum viejo", async () => {
    const r = await db.query<{ plataforma: string | null }>(
      `select plataforma::text as plataforma from public.registros where cuenta_id = $1`,
      [diegoat],
    );
    expect(r.rows[0].plataforma).toBeNull();
  });
});

describe("§9 sigue vigente, ahora sobre la red de la cuenta", () => {
  /*
   * En las cinco cuentas originales la regla está cubierta dos veces mientras
   * dure la transición: el CHECK viejo sobre `plataforma` (que el trigger de
   * sincronización deja llena) y el trigger nuevo sobre la red. Cuál de los dos
   * salta primero es un detalle de Postgres; lo que importa es que la fila no
   * entra. El mensaje del trigger nuevo se verifica en las cuentas nuevas, que
   * no tienen `plataforma` y por lo tanto solo pueden pasar por él.
   */
  it("§3.2 — rechaza una categoría que no es de esa red", async () => {
    const yt = await idCuenta("YouTube");
    await expect(
      db.query(
        `insert into public.registros (fecha, cuenta_id, categoria, publicaciones, created_by)
         values ('2026-09-21', $1, 'Carrusel', 1, '${USUARIO}')`,
        [yt],
      ),
    ).rejects.toThrow();
  });

  it("§9.6 — rechaza alcance en una cuenta de YouTube", async () => {
    const yt = await idCuenta("YouTube");
    await expect(
      db.query(
        `insert into public.registros (fecha, cuenta_id, categoria, publicaciones, alcance, created_by)
         values ('2026-09-21', $1, 'Short', 1, 5000, '${USUARIO}')`,
        [yt],
      ),
    ).rejects.toThrow();
  });

  it("§3.2 — en una cuenta nueva el rechazo viene del trigger sobre la red", async () => {
    await db.exec(
      `insert into public.cuentas (nombre, usuario, red, es_influencer)
       values ('DLT Running', '@dltrunning', 'TikTok', true);`,
    );
    const id = await idCuenta("DLT Running");
    await expect(
      db.query(
        `insert into public.registros (fecha, cuenta_id, categoria, publicaciones, created_by)
         values ('2026-09-21', $1, 'Carrusel', 1, '${USUARIO}')`,
        [id],
      ),
    ).rejects.toThrow(/no es una categoría de TikTok/i);
  });

  it("§9.6 — la regla sigue valiendo para una cuenta de YouTube nueva", async () => {
    await db.exec(
      `insert into public.cuentas (nombre, usuario, red, es_influencer)
       values ('Living DLT', '@livingdlt', 'YouTube', true);`,
    );
    const id = await idCuenta("Living DLT");
    await expect(
      db.query(
        `insert into public.registros (fecha, cuenta_id, publicaciones, alcance, created_by)
         values ('2026-09-21', $1, 1, 3000, '${USUARIO}')`,
        [id],
      ),
    ).rejects.toThrow(/no entrega alcance/i);
  });

  it("§9.5 — sigue exigiendo al menos una publicación", async () => {
    const id = await idCuenta("Instagram DBF");
    await expect(
      db.query(
        `insert into public.registros (fecha, cuenta_id, publicaciones, created_by)
         values ('2026-09-21', $1, 0, '${USUARIO}')`,
        [id],
      ),
    ).rejects.toThrow(/publicaciones/);
  });
});

describe("la vista de línea base, ahora por cuenta", () => {
  beforeAll(async () => {
    const dlt = await idCuenta("Instagram DLT");
    for (const [formato, tipo, alcance] of [
      ["Reel", "Reactivo", 100_000],
      ["Reel", "Normal", 60_000],
      ["Imagen", "Normal", 80_000],
    ] as const) {
      await db.query(
        `insert into public.publicaciones_base
           (linea_base_id, cuenta_id, formato, tipo, alcance, visualizaciones, interacciones, fuente)
         values ($1, $2, $3, $4, $5, $6, 5000, 'manual')`,
        [LB, dlt, formato, tipo, alcance, alcance * 2],
      );
    }
  });

  it("mantiene el alias plataforma, para no romper la versión desplegada", async () => {
    /*
     * La app que está en producción lee `plataforma` de esta vista para armar
     * los deltas. Mientras no salga el código nuevo, la columna tiene que
     * seguir respondiendo con el mismo valor de siempre.
     */
    const r = await db.query<{ plataforma: string; cuenta: string }>(
      `select plataforma, cuenta from public.lineas_base_detalle
        where cuenta = 'Instagram DLT' and categoria is null`,
    );
    expect(r.rows[0].plataforma).toBe("Instagram DLT");
    expect(r.rows[0].plataforma).toBe(r.rows[0].cuenta);
  });

  it("trae el nombre y la red sin necesitar otra consulta", async () => {
    const r = await db.query<{ cuenta: string; red: string; n_publicaciones: number }>(
      `select cuenta, red::text as red, n_publicaciones
         from public.lineas_base_detalle
        where cuenta = 'Instagram DLT' and categoria is null`,
    );
    expect(r.rows[0].cuenta).toBe("Instagram DLT");
    expect(r.rows[0].red).toBe("Instagram");
  });

  it("§9.2 — el TOTAL cuenta cada publicación una sola vez", async () => {
    const r = await db.query<{ n_publicaciones: number; alcance_prom: string }>(
      `select n_publicaciones, alcance_prom from public.lineas_base_detalle
        where cuenta = 'Instagram DLT' and categoria is null`,
    );
    expect(r.rows[0].n_publicaciones).toBe(3);
    expect(Number(r.rows[0].alcance_prom)).toBeCloseTo(240_000 / 3, 6);
  });

  it("§3.2 — cada publicación aparece en su formato y en su tipo", async () => {
    const r = await db.query<{ categoria: string; n_publicaciones: number }>(
      `select categoria::text as categoria, n_publicaciones
         from public.lineas_base_detalle
        where cuenta = 'Instagram DLT' and categoria is not null
        order by categoria`,
    );
    expect(Object.fromEntries(r.rows.map((x) => [x.categoria, x.n_publicaciones]))).toEqual(
      { Imagen: 1, Normal: 2, Reactivo: 1, Reel: 2 },
    );
  });
});

describe("las filas que ya existían antes de la migración", () => {
  /**
   * Se levanta una base aparte: se cargan datos con el esquema viejo y recién
   * ahí se aplica la migración, que es exactamente lo que pasa en producción.
   */
  it("quedan apuntando a su cuenta, sin perder ningún dato", async () => {
    const vieja = new PG();
    try {
      await vieja.exec(preludioSupabase({ uid: USUARIO }));
      await aplicarMigraciones(vieja, {
        hasta: "20260910110000_tiktok_categoria_video.sql",
      });

      await vieja.exec(
        `insert into auth.users (id, email) values ('${USUARIO}', 'cata@dltsports.cl');`,
      );
      await vieja.exec(`update public.perfiles set autorizado = true;`);
      await vieja.exec(
        `insert into public.registros (fecha, plataforma, categoria, publicaciones, alcance, created_by)
         values ('2026-09-01', 'Instagram DBF', 'Reel', 3, 90000, '${USUARIO}'),
                ('2026-09-01', 'TikTok', 'Video', 2, 40000, '${USUARIO}');`,
      );

      // Y recién ahora entra la migración de cuentas.
      await aplicarMigraciones(vieja, { desde: "20260923100000_cuentas_como_datos.sql" });

      const r = await vieja.query<{ cuenta: string; alcance: string; publicaciones: number }>(
        `select c.nombre as cuenta, t.alcance::text as alcance, t.publicaciones
           from public.registros t
           join public.cuentas c on c.id = t.cuenta_id
          order by c.nombre`,
      );

      expect(r.rows.map((x) => x.cuenta)).toEqual(["Instagram DBF", "TikTok"]);
      expect(Number(r.rows[0].alcance)).toBe(90_000);
      expect(r.rows[0].publicaciones).toBe(3);
    } finally {
      await vieja.close();
    }
  }, 180_000);
});
