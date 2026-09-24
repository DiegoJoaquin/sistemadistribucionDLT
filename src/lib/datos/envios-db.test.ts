/**
 * El registro de envíos del reporte, contra Postgres de verdad.
 *
 * Lo que importa verificar acá son las reglas que impiden que el historial
 * mienta: que la semana sea siempre el lunes (si no, el mismo reporte quedaría
 * registrado en dos "semanas" distintas según el día en que se mandó), y que
 * un envío no se pueda borrar ni atribuir a otra persona.
 */
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { semanaDe } from "@/lib/dominio/formato";
import { baseDePrueba, PERMISOS_AUTHENTICATED } from "./base-de-prueba";

const DIEGO = "22222222-2222-4222-8222-222222222222";
const CATA = "33333333-3333-4333-8333-333333333333";

let db: PGlite;

/*
 * `set local` no sirve acá: solo tiene efecto dentro de una transacción, y
 * `db.exec` corre cada sentencia sola. Con `set local` las consultas seguían
 * corriendo como superusuario y las pruebas de RLS pasaban sin probar nada.
 */
async function comoUsuario(uid: string): Promise<void> {
  await db.exec("reset role;");
  await db.exec(`select set_config('test.uid', '${uid}', false);`);
  await db.exec("set role authenticated;");
}

const comoDueno = () => db.exec("reset role;");

beforeAll(async () => {
  db = await baseDePrueba({
    uidDeSesion: true,
    usuario: { id: DIEGO, email: "diego@dltsports.cl", nombre: "Diego" },
  });
  /*
   * Los permisos van DESPUÉS de las migraciones: el grant es sobre las tablas
   * que existen en ese momento, así que aplicado antes no alcanzaría a
   * `envios_reporte`. Supabase los concede de fábrica; PGlite no.
   */
  await db.exec(PERMISOS_AUTHENTICATED);
  await db.exec(
    `insert into auth.users (id, email, raw_user_meta_data)
       values ('${CATA}', 'cata@dltsports.cl', '{"nombre":"Catalina"}'::jsonb);
     update public.perfiles set autorizado = true where id = '${CATA}';`,
  );
}, 120_000);

beforeEach(async () => {
  await comoDueno();
  await db.exec(`delete from public.envios_reporte;`);
});

afterAll(async () => {
  await db?.close();
});

describe("envios_reporte", () => {
  it("registra un envío con sus destinatarios", async () => {
    await db.query(
      `insert into public.envios_reporte
         (semana, destinatarios, asunto, id_mensaje, enviado_por)
       values ($1, $2, $3, $4, $5)`,
      [
        "2026-09-21",
        ["jefe@dltsports.cl", "jefa@dltsports.cl"],
        "Catastro semanal · 21 al 27 de septiembre de 2026",
        "<abc@dltsports.cl>",
        DIEGO,
      ],
    );

    const r = await db.query<{
      semana: string;
      destinatarios: string[];
      enviado_por: string;
    }>(`select semana::text, destinatarios, enviado_por from public.envios_reporte`);

    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].semana).toBe("2026-09-21");
    expect(r.rows[0].destinatarios).toEqual([
      "jefe@dltsports.cl",
      "jefa@dltsports.cl",
    ]);
  });

  /*
   * La semana tiene que ser el lunes. Si se guardara el día del envío, el
   * reporte de la misma semana mandado el lunes y reenviado el jueves quedaría
   * en dos semanas distintas, y el aviso de "ya se envió" no lo encontraría.
   */
  it("rechaza una semana que no empieza en lunes", async () => {
    for (const noLunes of ["2026-09-22", "2026-09-27", "2026-09-20"]) {
      await expect(
        db.query(
          `insert into public.envios_reporte (semana, destinatarios, asunto, enviado_por)
           values ($1, $2, 'x', $3)`,
          [noLunes, ["a@b.cl"], DIEGO],
        ),
      ).rejects.toThrow();
    }
  });

  it("y `semanaDe` produce siempre un lunes que la base acepta", async () => {
    // Las dos mitades de la regla, atadas: la de TypeScript y la de Postgres.
    for (const dia of ["2026-09-21", "2026-09-24", "2026-09-27", "2026-10-01"]) {
      const { desde } = semanaDe(dia);
      await db.query(
        `insert into public.envios_reporte (semana, destinatarios, asunto, enviado_por)
         values ($1, $2, 'x', $3)`,
        [desde, ["a@b.cl"], DIEGO],
      );
    }
    const r = await db.query<{ n: string }>(
      `select count(distinct semana)::text as n from public.envios_reporte`,
    );
    // 21, 24 y 27 de septiembre son la misma semana; el 1 de octubre, otra.
    expect(r.rows[0].n).toBe("2");
  });

  it("no acepta un envío sin destinatarios", async () => {
    await expect(
      db.query(
        `insert into public.envios_reporte (semana, destinatarios, asunto, enviado_por)
         values ('2026-09-21', $1, 'x', $2)`,
        [[], DIEGO],
      ),
    ).rejects.toThrow();
  });

  it("guarda los reenvíos, no los reemplaza", async () => {
    for (let i = 0; i < 3; i++) {
      await db.query(
        `insert into public.envios_reporte (semana, destinatarios, asunto, enviado_por)
         values ('2026-09-21', $1, 'x', $2)`,
        [["jefe@dltsports.cl"], DIEGO],
      );
    }
    const r = await db.query<{ n: string }>(
      `select count(*)::text as n from public.envios_reporte where semana = '2026-09-21'`,
    );
    // Reemplazar el anterior borraría justo lo que se quiere poder auditar.
    expect(r.rows[0].n).toBe("3");
  });

  describe("con RLS activo", () => {
    it("el equipo puede registrar su propio envío y verlo", async () => {
      await comoUsuario(DIEGO);
      await db.query(
        `insert into public.envios_reporte (semana, destinatarios, asunto, enviado_por)
         values ('2026-09-21', $1, 'x', $2)`,
        [["jefe@dltsports.cl"], DIEGO],
      );

      const r = await db.query<{ n: string }>(
        `select count(*)::text as n from public.envios_reporte`,
      );
      expect(r.rows[0].n).toBe("1");
    });

    it("nadie puede registrar un envío a nombre de otra persona", async () => {
      await comoUsuario(DIEGO);
      await expect(
        db.query(
          `insert into public.envios_reporte (semana, destinatarios, asunto, enviado_por)
           values ('2026-09-21', $1, 'x', $2)`,
          [["jefe@dltsports.cl"], CATA],
        ),
      ).rejects.toThrow();
    });

    /*
     * Un envío ocurrió y no se deshace. Poder borrarlo sería poder esconder
     * que el reporte salió, que es lo contrario de para qué existe la tabla.
     */
    it("un envío no se puede borrar ni editar", async () => {
      await comoDueno();
      await db.query(
        `insert into public.envios_reporte (semana, destinatarios, asunto, enviado_por)
         values ('2026-09-21', $1, 'x', $2)`,
        [["jefe@dltsports.cl"], DIEGO],
      );

      await comoUsuario(DIEGO);
      await db.query(`delete from public.envios_reporte`);
      await db.query(`update public.envios_reporte set asunto = 'otro'`);

      await comoDueno();
      const r = await db.query<{ n: string; asunto: string }>(
        `select count(*)::text as n, min(asunto) as asunto from public.envios_reporte`,
      );
      // Sin política de delete ni de update, las dos no afectan ninguna fila.
      expect(r.rows[0].n).toBe("1");
      expect(r.rows[0].asunto).toBe("x");
    });

    it("quien no está autorizado no ve los envíos", async () => {
      await comoDueno();
      await db.query(
        `insert into public.envios_reporte (semana, destinatarios, asunto, enviado_por)
         values ('2026-09-21', $1, 'x', $2)`,
        [["jefe@dltsports.cl"], DIEGO],
      );
      await db.exec(`update public.perfiles set autorizado = false where id = '${CATA}'`);

      await comoUsuario(CATA);
      const r = await db.query<{ n: string }>(
        `select count(*)::text as n from public.envios_reporte`,
      );
      expect(r.rows[0].n).toBe("0");

      await comoDueno();
      await db.exec(`update public.perfiles set autorizado = true where id = '${CATA}'`);
    });
  });
});
