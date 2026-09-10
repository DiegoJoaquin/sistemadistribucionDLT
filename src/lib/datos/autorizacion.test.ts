/**
 * Verifica el cierre del agujero: alguien que se registró por su cuenta queda
 * `authenticated` pero NO es del equipo, y no debe poder leer ni escribir nada.
 *
 * Se prueba con RLS realmente activo: se cambia al rol `authenticated` y se
 * simula `auth.uid()` con una variable de sesión, igual que hace Supabase.
 */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const migracion = (archivo: string) =>
  readFileSync(fileURLToPath(new URL(`../../../supabase/migrations/${archivo}`, import.meta.url)), "utf8");

const DEL_EQUIPO = "22222222-2222-2222-2222-222222222222";
const INTRUSO = "99999999-9999-9999-9999-999999999999";

/**
 * `auth.uid()` lee de una variable de sesión, así se puede cambiar de usuario
 * dentro del mismo test tal como lo haría un token distinto.
 */
const PRELUDIO = `
  create schema if not exists auth;
  create table auth.users (id uuid primary key, email text not null,
    raw_user_meta_data jsonb default '{}'::jsonb);
  create or replace function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('test.uid', true), '')::uuid
  $$;
  create role authenticated;
`;

// Supabase concede estos permisos de fábrica; PGlite no.
const PERMISOS = `
  grant usage on schema public, auth to authenticated;
  grant all on all tables in schema public to authenticated;
  grant execute on all functions in schema auth to authenticated;
`;

let db: PGlite;

async function como(uid: string | null) {
  await db.exec("reset role;");
  await db.exec(`select set_config('test.uid', '${uid ?? ""}', false);`);
  if (uid) await db.exec("set role authenticated;");
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(PRELUDIO);
  await db.exec(migracion("20260909120000_esquema_inicial.sql"));

  await db.exec(
    `insert into auth.users (id, email, raw_user_meta_data) values
       ('${DEL_EQUIPO}', 'cata@dltsports.cl', '{"nombre":"Catalina"}'::jsonb);`,
  );
  await db.exec(
    `insert into public.lineas_base (mes, nombre, activa)
     values ('2026-08-01', 'agosto', true);`,
  );
  await db.exec(
    `insert into public.registros (fecha, plataforma, publicaciones, alcance, created_by)
     values ('2026-09-01', 'TikTok', 3, 90000, '${DEL_EQUIPO}');`,
  );

  // Segunda migración: la autorización explícita.
  await db.exec(migracion("20260910090000_autorizacion_por_equipo.sql"));

  // Y recién ahora alguien se registra solo por la API pública.
  await db.exec(
    `insert into auth.users (id, email) values ('${INTRUSO}', 'cualquiera@internet.com');`,
  );

  await db.exec(PERMISOS);
}, 180_000);

afterAll(async () => {
  await db?.close();
});

describe("la migración autoriza a quienes ya estaban", () => {
  it("Catalina queda autorizada sin intervención", async () => {
    const r = await db.query<{ autorizado: boolean }>(
      `select autorizado from public.perfiles where id = '${DEL_EQUIPO}'`,
    );
    expect(r.rows[0].autorizado).toBe(true);
  });

  it("quien se registra después queda sin autorizar", async () => {
    const r = await db.query<{ autorizado: boolean }>(
      `select autorizado from public.perfiles where id = '${INTRUSO}'`,
    );
    expect(r.rows[0].autorizado).toBe(false);
  });
});

describe("una persona del equipo", () => {
  beforeAll(() => como(DEL_EQUIPO));

  it("es reconocida como del equipo", async () => {
    const r = await db.query<{ ok: boolean }>(`select public.es_del_equipo() as ok`);
    expect(r.rows[0].ok).toBe(true);
  });

  it("lee los registros", async () => {
    const r = await db.query(`select id from public.registros`);
    expect(r.rows).toHaveLength(1);
  });

  it("puede crear un registro a su nombre", async () => {
    await db.exec(
      `insert into public.registros (fecha, plataforma, publicaciones, created_by)
       values ('2026-09-04', 'TikTok', 2, '${DEL_EQUIPO}');`,
    );
    const r = await db.query(`select id from public.registros`);
    expect(r.rows).toHaveLength(2);
  });

  it("lee la línea base", async () => {
    const r = await db.query(`select id from public.lineas_base`);
    expect(r.rows).toHaveLength(1);
  });
});

describe("alguien que se registró por su cuenta", () => {
  beforeAll(() => como(INTRUSO));

  it("no es del equipo", async () => {
    const r = await db.query<{ ok: boolean }>(`select public.es_del_equipo() as ok`);
    expect(r.rows[0].ok).toBe(false);
  });

  it("no ve ni un registro, aunque haya dos cargados", async () => {
    const r = await db.query(`select id from public.registros`);
    expect(r.rows).toHaveLength(0);
  });

  it("no ve las líneas base ni las publicaciones importadas", async () => {
    expect((await db.query(`select id from public.lineas_base`)).rows).toHaveLength(0);
    expect((await db.query(`select id from public.publicaciones_base`)).rows).toHaveLength(0);
  });

  it("no puede escribir un registro", async () => {
    await expect(
      db.exec(
        `insert into public.registros (fecha, plataforma, publicaciones, created_by)
         values ('2026-09-05', 'TikTok', 1, '${INTRUSO}');`,
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("no puede borrar los registros del equipo", async () => {
    await db.exec(`delete from public.registros;`);
    await como(DEL_EQUIPO);
    const r = await db.query(`select id from public.registros`);
    expect(r.rows).toHaveLength(2); // siguen ahí: el delete no alcanzó ninguna fila
  });

  it("no puede cambiar la línea base activa", async () => {
    await como(INTRUSO);
    await expect(
      db.exec(
        `select public.activar_linea_base(
           (select id from public.lineas_base limit 1));`,
      ),
    ).rejects.toThrow(/No autorizado/);
  });

  it("no puede autorizarse a sí mismo", async () => {
    await db.exec(
      `update public.perfiles set autorizado = true where id = '${INTRUSO}';`,
    );
    await como(null);
    const r = await db.query<{ autorizado: boolean }>(
      `select autorizado from public.perfiles where id = '${INTRUSO}'`,
    );
    expect(r.rows[0].autorizado).toBe(false);
  });

  it("sí puede leer su propia fila, para que la app le explique por qué no entra", async () => {
    await como(INTRUSO);
    const r = await db.query<{ email: string }>(
      `select email from public.perfiles where id = '${INTRUSO}'`,
    );
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].email).toBe("cualquiera@internet.com");
  });

  it("pero no puede leer los perfiles del equipo", async () => {
    const r = await db.query(
      `select email from public.perfiles where id = '${DEL_EQUIPO}'`,
    );
    expect(r.rows).toHaveLength(0);
  });
});
