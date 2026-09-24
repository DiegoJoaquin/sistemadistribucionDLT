/**
 * Clientes y sus hashtags, contra Postgres de verdad.
 *
 * El fallo silencioso de esta herramienta es que el hashtag del cliente y el
 * del registro queden escritos distinto. Ahí el informe no encuentra ninguna
 * publicación y sale vacío, sin manera de distinguir "el cliente no publicó"
 * de "escribiste el hashtag con tilde". Por eso la mitad de estas pruebas es
 * sobre normalización.
 */
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { parsearListaHashtags } from "./esquemas";
import { normalizarHashtag } from "@/lib/dominio/hashtag";
import { baseDePrueba, PERMISOS_AUTHENTICATED } from "./base-de-prueba";

const DIEGO = "22222222-2222-4222-8222-222222222222";
const CATA = "33333333-3333-4333-8333-333333333333";

let db: PGlite;

async function comoUsuario(uid: string): Promise<void> {
  await db.exec("reset role;");
  await db.exec(`select set_config('test.uid', '${uid}', false);`);
  await db.exec("set role authenticated;");
}

const comoDueno = () => db.exec("reset role;");

async function crearCliente(nombre: string, hashtags: string[]): Promise<string> {
  const r = await db.query<{ id: string }>(
    `insert into public.clientes (nombre) values ($1) returning id`,
    [nombre],
  );
  const id = r.rows[0].id;
  for (const h of hashtags) {
    await db.query(
      `insert into public.cliente_hashtags (cliente_id, hashtag) values ($1, $2)`,
      [id, h],
    );
  }
  return id;
}

beforeAll(async () => {
  db = await baseDePrueba({
    uidDeSesion: true,
    usuario: { id: DIEGO, email: "diego@dltsports.cl", nombre: "Diego" },
  });
  // Después de las migraciones: el grant es sobre las tablas que ya existen.
  await db.exec(PERMISOS_AUTHENTICATED);
  await db.exec(
    `insert into auth.users (id, email, raw_user_meta_data)
       values ('${CATA}', 'cata@dltsports.cl', '{"nombre":"Catalina"}'::jsonb);
     update public.perfiles set autorizado = true where id = '${CATA}';`,
  );
}, 120_000);

beforeEach(async () => {
  await comoDueno();
  await db.exec(`delete from public.clientes; delete from public.registros;`);
});

afterAll(async () => {
  await db?.close();
});

describe("clientes", () => {
  it("guarda un cliente con su lista de hashtags", async () => {
    await crearCliente("Sparta", ["SPARTAXDLT", "FUERZASPARTA"]);

    const r = await db.query<{ nombre: string; hashtag: string }>(
      `select c.nombre, h.hashtag
         from public.clientes c join public.cliente_hashtags h on h.cliente_id = c.id
        order by h.hashtag`,
    );
    expect(r.rows.map((x) => x.hashtag)).toEqual(["FUERZASPARTA", "SPARTAXDLT"]);
  });

  it("el nombre es único: no puede haber dos clientes iguales", async () => {
    await crearCliente("Sparta", ["SPARTAXDLT"]);
    await expect(crearCliente("Sparta", ["OTRO"])).rejects.toThrow();
  });

  it("no acepta un nombre vacío", async () => {
    await expect(
      db.query(`insert into public.clientes (nombre) values ('   ')`),
    ).rejects.toThrow();
  });

  it("borrar un cliente se lleva sus hashtags, no los deja huérfanos", async () => {
    const id = await crearCliente("Sparta", ["SPARTAXDLT", "FUERZASPARTA"]);
    await db.query(`delete from public.clientes where id = $1`, [id]);

    const r = await db.query<{ n: string }>(
      `select count(*)::text as n from public.cliente_hashtags`,
    );
    expect(r.rows[0].n).toBe("0");
  });

  it("un hashtag puede pertenecer a dos clientes: hay contenido con dos marcas", async () => {
    await crearCliente("Sparta", ["COLABXDLT"]);
    await crearCliente("Betano", ["COLABXDLT"]);

    const r = await db.query<{ n: string }>(
      `select count(*)::text as n from public.cliente_hashtags where hashtag = 'COLABXDLT'`,
    );
    expect(r.rows[0].n).toBe("2");
  });

  it("el mismo hashtag no se repite dentro de un cliente", async () => {
    const id = await crearCliente("Sparta", ["SPARTAXDLT"]);
    await expect(
      db.query(
        `insert into public.cliente_hashtags (cliente_id, hashtag) values ($1, 'SPARTAXDLT')`,
        [id],
      ),
    ).rejects.toThrow();
  });
});

describe("normalización del hashtag", () => {
  it("el trigger normaliza lo que entre por SQL a mano", async () => {
    const id = await crearCliente("Sparta", []);
    for (const crudo of ["#SpartaxDLT", " spartaxdlt ", "SPARTAXDLT "]) {
      await db.query(
        `insert into public.cliente_hashtags (cliente_id, hashtag)
         values ($1, $2) on conflict do nothing`,
        [id, crudo],
      );
    }

    const r = await db.query<{ hashtag: string; n: string }>(
      `select hashtag, count(*)::text as n from public.cliente_hashtags
        group by hashtag`,
    );
    // Las tres formas son UNA, no tres.
    expect(r.rows).toEqual([{ hashtag: "SPARTAXDLT", n: "1" }]);
  });

  /*
   * LA prueba. El hashtag del cliente y el del registro los escriben dos
   * caminos distintos; si no coincidieran, el informe saldría vacío y no habría
   * forma de saber por qué.
   */
  it("el hashtag del cliente calza con el del registro", async () => {
    const id = await crearCliente("Sparta", []);
    const cuenta = await db.query<{ id: string }>(
      `select id from public.cuentas where nombre = 'Instagram DLT'`,
    );

    // Como lo pega el equipo en el formulario del cliente.
    const [delCliente] = parsearListaHashtags("#SpartaxDLT, #FuerzaSpartá");
    await db.query(
      `insert into public.cliente_hashtags (cliente_id, hashtag) values ($1, $2)`,
      [id, delCliente],
    );

    // Como lo escribe el registro.
    await db.query(
      `insert into public.registros
         (fecha, cuenta_id, categoria, hashtag, publicaciones, alcance, created_by)
       values ('2026-03-10', $1, 'Reel', $2, 1, 10000, $3)`,
      [cuenta.rows[0].id, normalizarHashtag("#spartaxdlt"), DIEGO],
    );

    // El join que hace el informe tiene que encontrar la publicación.
    const r = await db.query<{ n: string }>(
      `select count(*)::text as n
         from public.registros r
         join public.cliente_hashtags h on h.hashtag = r.hashtag
        where h.cliente_id = $1`,
      [id],
    );
    expect(r.rows[0].n).toBe("1");
  });

  it("parsearListaHashtags aguanta la lista como la pegue cualquiera", () => {
    // Coma, punto y coma, espacios, saltos de línea, con y sin numeral.
    const r = parsearListaHashtags(
      "#SpartaxDLT, #FuerzaSparta; spartaTraining\n#SPARTAXDLT   #Entrená",
    );
    expect(r).toEqual([
      "SPARTAXDLT",
      "FUERZASPARTA",
      "SPARTATRAINING",
      // Sin tilde: #Entrená y #Entrena son la misma serie.
      "ENTRENA",
    ]);
  });

  it("una lista vacía no es un error, es una lista vacía", () => {
    for (const v of ["", "   ", "#", ", ;", undefined, null]) {
      expect(parsearListaHashtags(v)).toEqual([]);
    }
  });
});

describe("con RLS activo", () => {
  it("el equipo lee y administra los clientes", async () => {
    await comoUsuario(DIEGO);
    const id = await crearCliente("Sparta", ["SPARTAXDLT"]);

    const r = await db.query<{ n: string }>(
      `select count(*)::text as n from public.clientes where id = $1`,
      [id],
    );
    expect(r.rows[0].n).toBe("1");
  });

  it("quien no está autorizado no ve ningún cliente", async () => {
    await comoDueno();
    await crearCliente("Sparta", ["SPARTAXDLT"]);
    await db.exec(`update public.perfiles set autorizado = false where id = '${CATA}'`);

    await comoUsuario(CATA);
    const clientes = await db.query<{ n: string }>(
      `select count(*)::text as n from public.clientes`,
    );
    const hashtags = await db.query<{ n: string }>(
      `select count(*)::text as n from public.cliente_hashtags`,
    );
    expect(clientes.rows[0].n).toBe("0");
    expect(hashtags.rows[0].n).toBe("0");

    await comoDueno();
    await db.exec(`update public.perfiles set autorizado = true where id = '${CATA}'`);
  });
});
