/**
 * Marcas y sus señales, contra Postgres de verdad.
 *
 * El fallo silencioso del global es que una señal quede escrita distinto que
 * en las publicaciones: "@SpartaChile" no calza con "@spartachile" del texto y
 * la marca sale en cero sin explicar por qué. Por eso la base normaliza también
 * lo que entra por SQL a mano.
 */
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
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

async function crearMarca(nombre: string, senales: [string, string][]): Promise<string> {
  const r = await db.query<{ id: string }>(`insert into public.marcas (nombre) values ($1) returning id`, [nombre]);
  const id = r.rows[0].id;
  for (const [tipo, valor] of senales) {
    await db.query(`insert into public.marca_senales (marca_id, tipo, valor) values ($1, $2, $3)`, [id, tipo, valor]);
  }
  return id;
}

beforeAll(async () => {
  db = await baseDePrueba({
    uidDeSesion: true,
    usuario: { id: DIEGO, email: "diego@dltsports.cl", nombre: "Diego" },
  });
  await db.exec(PERMISOS_AUTHENTICATED);
  await db.exec(
    `insert into auth.users (id, email, raw_user_meta_data)
       values ('${CATA}', 'cata@dltsports.cl', '{"nombre":"Catalina"}'::jsonb);
     update public.perfiles set autorizado = true where id = '${CATA}';`,
  );
}, 120_000);

beforeEach(async () => {
  await comoDueno();
  await db.exec(`delete from public.marcas;`);
});

afterAll(async () => {
  await db?.close();
});

describe("marcas", () => {
  it("normaliza cada señal según su tipo, aunque entre por SQL a mano", async () => {
    const id = await crearMarca("Sparta", [
      ["hashtag", "#SpartaXDLT"],
      ["mencion", "@SpartaChile"],
      ["campana", " sparta global "],
    ]);
    const r = await db.query<{ tipo: string; valor: string }>(
      `select tipo, valor from public.marca_senales where marca_id = $1 order by tipo`,
      [id],
    );
    expect(r.rows).toEqual([
      { tipo: "campana", valor: "SPARTA GLOBAL" },
      { tipo: "hashtag", valor: "SPARTAXDLT" },
      { tipo: "mencion", valor: "spartachile" },
    ]);
  });

  it("no acepta un tipo de señal que no existe", async () => {
    const id = await crearMarca("Betano", []);
    await expect(
      db.query(`insert into public.marca_senales (marca_id, tipo, valor) values ($1, 'patron', 'BET%')`, [id]),
    ).rejects.toThrow();
  });

  it("la misma señal no se repite dentro de una marca, aunque se escriba distinto", async () => {
    const id = await crearMarca("Crocs", [["mencion", "crocschile"]]);
    await expect(
      db.query(`insert into public.marca_senales (marca_id, tipo, valor) values ($1, 'mencion', '@CrocsChile')`, [id]),
    ).rejects.toThrow();
  });

  it("una arroba puede ser de dos marcas: hay piezas compartidas", async () => {
    await crearMarca("Red Bull", [["mencion", "redbullcl"]]);
    await crearMarca("Liga San José", [["mencion", "redbullcl"]]);
    const r = await db.query<{ n: string }>(
      `select count(*)::text as n from public.marca_senales where valor = 'redbullcl'`,
    );
    expect(r.rows[0].n).toBe("2");
  });

  it("borrar una marca se lleva sus señales", async () => {
    const id = await crearMarca("Milo", [["hashtag", "MILOXDLT"]]);
    await db.query(`delete from public.marcas where id = $1`, [id]);
    const r = await db.query<{ n: string }>(`select count(*)::text as n from public.marca_senales`);
    expect(r.rows[0].n).toBe("0");
  });

  it("el registro tiene dónde guardar el texto completo y las campañas", async () => {
    const r = await db.query<{ column_name: string }>(
      `select column_name from information_schema.columns
        where table_schema = 'public' and table_name = 'registros' and column_name in ('texto', 'campanas')
        order by column_name`,
    );
    expect(r.rows.map((x) => x.column_name)).toEqual(["campanas", "texto"]);
  });
});

describe("con RLS activo", () => {
  it("el equipo lee y administra las marcas", async () => {
    await comoUsuario(DIEGO);
    await crearMarca("Sparta", [["mencion", "spartachile"]]);
    const r = await db.query<{ n: string }>(`select count(*)::text as n from public.marca_senales`);
    expect(r.rows[0].n).toBe("1");
  });

  it("quien no está autorizado no ve ninguna marca", async () => {
    await comoDueno();
    await crearMarca("Sparta", [["mencion", "spartachile"]]);
    await db.exec(`update public.perfiles set autorizado = false where id = '${CATA}'`);

    await comoUsuario(CATA);
    const marcas = await db.query<{ n: string }>(`select count(*)::text as n from public.marcas`);
    const senales = await db.query<{ n: string }>(`select count(*)::text as n from public.marca_senales`);
    expect(marcas.rows[0].n).toBe("0");
    expect(senales.rows[0].n).toBe("0");

    await comoDueno();
    await db.exec(`update public.perfiles set autorizado = true where id = '${CATA}'`);
  });
});
