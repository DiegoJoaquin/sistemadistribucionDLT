/**
 * Utilidades para levantar un Postgres de prueba (PGlite) con el esquema real.
 *
 * Aplica TODAS las migraciones, en orden, leyéndolas del directorio. Antes cada
 * test aplicaba solo la primera y probaba un esquema que ya no existía: al
 * cambiar las categorías de TikTok, los tests seguían verdes contra reglas
 * viejas y la suite de integración se cayó sin explicar por qué.
 */

import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const DIR = fileURLToPath(new URL("../../../supabase/migrations/", import.meta.url));

export function listarMigraciones(): string[] {
  return readdirSync(DIR)
    .filter((n) => n.endsWith(".sql"))
    .sort();
}

export function sqlMigracion(nombre: string): string {
  return readFileSync(DIR + nombre, "utf8");
}

export interface OpcionesPreludio {
  /** Usuario que devuelve auth.uid(). */
  uid?: string;
  /**
   * Si es true, auth.uid() lee de la variable de sesión `test.uid`, para poder
   * cambiar de usuario dentro de un mismo test.
   */
  uidDeSesion?: boolean;
}

/**
 * Supabase trae `auth.users`, `auth.uid()` y el rol `authenticated` de fábrica.
 * PGlite no, así que se replica lo mínimo para que las migraciones corran tal
 * cual, sin editarlas.
 */
export function preludioSupabase(opciones: OpcionesPreludio = {}): string {
  const cuerpo = opciones.uidDeSesion
    ? "select nullif(current_setting('test.uid', true), '')::uuid"
    : `select ${opciones.uid ? `'${opciones.uid}'::uuid` : "null::uuid"}`;

  return `
    create schema if not exists auth;
    create table auth.users (
      id uuid primary key,
      email text not null,
      raw_user_meta_data jsonb default '{}'::jsonb
    );
    create or replace function auth.uid() returns uuid language sql stable as $$
      ${cuerpo}
    $$;
    create role authenticated;
  `;
}

/** Permisos que Supabase concede de fábrica y PGlite no. */
export const PERMISOS_AUTHENTICATED = `
  grant usage on schema public, auth to authenticated;
  grant all on all tables in schema public to authenticated;
  grant execute on all functions in schema auth to authenticated;
`;

export interface RangoMigraciones {
  /** Primera migración a aplicar, inclusive. */
  desde?: string;
  /** Última migración a aplicar, inclusive. */
  hasta?: string;
}

/**
 * Aplica las migraciones cuyo nombre cae en el rango, en orden.
 *
 * Acepta un rango y no solo un tope porque hay un caso que importa probar:
 * cargar datos con el esquema viejo y aplicar recién después la migración, que
 * es lo que pasa en producción. Para eso hay que poder retomar desde donde se
 * quedó, sin reaplicar las anteriores.
 */
export async function aplicarMigraciones(
  db: PGlite,
  rango: RangoMigraciones = {},
): Promise<void> {
  for (const archivo of listarMigraciones()) {
    if (rango.desde && archivo < rango.desde) continue;
    if (rango.hasta && archivo > rango.hasta) break;
    await db.exec(sqlMigracion(archivo));
  }
}

/**
 * Base lista para usar: preludio, todas las migraciones y, si se pide, un
 * usuario del equipo ya autorizado.
 */
export async function baseDePrueba(
  opciones: OpcionesPreludio & {
    usuario?: { id: string; email: string; nombre?: string };
  } = {},
): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(preludioSupabase(opciones));
  await aplicarMigraciones(db);

  if (opciones.usuario) {
    const { id, email, nombre } = opciones.usuario;
    await db.exec(
      `insert into auth.users (id, email, raw_user_meta_data)
       values ('${id}', '${email}', ${
         nombre ? `'{"nombre":"${nombre}"}'::jsonb` : "'{}'::jsonb"
       });`,
    );
    // El trigger crea el perfil sin autorizar; para los tests se habilita.
    await db.exec(`update public.perfiles set autorizado = true where id = '${id}';`);
  }

  return db;
}
