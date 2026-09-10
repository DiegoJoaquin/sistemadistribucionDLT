/**
 * La migración se ejecuta de verdad contra un Postgres (PGlite, el mismo motor
 * compilado a WebAssembly) y se comprueban las reglas que están blindadas en la
 * base, no solo en la interfaz.
 *
 * Lo que más importa acá es la vista `lineas_base_detalle`: es la que desdobla
 * cada publicación de Instagram en su formato y su tipo sin contar de más el
 * TOTAL. Es exactamente el cálculo que el Excel hacía mal.
 */
import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { baseDePrueba } from "./base-de-prueba";

let db: PGlite;
const LB = "11111111-1111-1111-1111-111111111111";
const USUARIO = "22222222-2222-2222-2222-222222222222";

beforeAll(async () => {
  db = await baseDePrueba({
    uid: USUARIO,
    usuario: { id: USUARIO, email: "cata@dltsports.cl", nombre: "Catalina" },
  });
  await db.exec(
    `insert into public.lineas_base (id, mes, nombre, activa)
     values ('${LB}', '2026-08-01', 'agosto', true);`,
  );
}, 120_000);

afterAll(async () => {
  await db?.close();
});

async function filas<T = Record<string, unknown>>(sql: string): Promise<T[]> {
  const r = await db.query<T>(sql);
  return r.rows;
}

describe("alta de usuario", () => {
  it("crea el perfil solo, con el nombre del metadata", async () => {
    const r = await filas<{ nombre: string; email: string }>(
      `select nombre, email from public.perfiles where id = '${USUARIO}'`,
    );
    expect(r).toHaveLength(1);
    expect(r[0].nombre).toBe("Catalina");
  });
});

describe("§9.3 — plataforma y categoría son enums", () => {
  it("rechaza una plataforma que no existe", async () => {
    await expect(
      db.exec(
        `insert into public.registros (fecha, plataforma, publicaciones, created_by)
         values ('2026-09-01', 'Instagram', 1, '${USUARIO}');`,
      ),
    ).rejects.toThrow();
  });

  it('rechaza "Normal (informativo)", el texto libre que rompió el Excel', async () => {
    await expect(
      db.exec(
        `insert into public.registros (fecha, plataforma, categoria, publicaciones, created_by)
         values ('2026-09-01', 'Instagram DLT', 'Normal (informativo)', 1, '${USUARIO}');`,
      ),
    ).rejects.toThrow();
  });

  it("rechaza una categoría que no corresponde a la plataforma", async () => {
    await expect(
      db.exec(
        `insert into public.registros (fecha, plataforma, categoria, publicaciones, created_by)
         values ('2026-09-01', 'YouTube', 'Reel', 1, '${USUARIO}');`,
      ),
    ).rejects.toThrow(/categoria_de_la_plataforma/);
  });

  it("acepta Video en TikTok, su única categoría", async () => {
    await db.exec(
      `insert into public.registros (fecha, plataforma, categoria, publicaciones, created_by)
       values ('2026-09-01', 'TikTok', 'Video', 1, '${USUARIO}');`,
    );
    const r = await filas<{ categoria: string }>(
      `select categoria from public.registros
       where plataforma = 'TikTok' and fecha = '2026-09-01'`,
    );
    expect(r[0].categoria).toBe("Video");
  });

  it("rechaza en TikTok cualquier otra categoría", async () => {
    await expect(
      db.exec(
        `insert into public.registros (fecha, plataforma, categoria, publicaciones, created_by)
         values ('2026-09-01', 'TikTok', 'Reel', 1, '${USUARIO}');`,
      ),
    ).rejects.toThrow(/categoria_de_la_plataforma/);
  });
});

describe("§9.5 y §9.6 — restricciones del registro", () => {
  it("exige al menos 1 publicación por fila", async () => {
    await expect(
      db.exec(
        `insert into public.registros (fecha, plataforma, publicaciones, created_by)
         values ('2026-09-01', 'TikTok', 0, '${USUARIO}');`,
      ),
    ).rejects.toThrow(/publicaciones/);
  });

  it("no deja guardar alcance en YouTube", async () => {
    await expect(
      db.exec(
        `insert into public.registros (fecha, plataforma, categoria, publicaciones, alcance, created_by)
         values ('2026-09-01', 'YouTube', 'Short', 1, 5000, '${USUARIO}');`,
      ),
    ).rejects.toThrow(/youtube_sin_alcance/);
  });

  it("§9.4 — deja todas las métricas en null: sin dato no es cero", async () => {
    await db.exec(
      `insert into public.registros (fecha, plataforma, publicaciones, created_by)
       values ('2026-09-02', 'TikTok', 3, '${USUARIO}');`,
    );
    const r = await filas<{ alcance: number | null }>(
      `select alcance from public.registros where fecha = '2026-09-02'`,
    );
    expect(r[0].alcance).toBeNull();
  });
});

describe("§2 — trazabilidad inmutable", () => {
  it("no permite reescribir created_by al editar una fila", async () => {
    await db.exec(
      `insert into auth.users (id, email) values
       ('33333333-3333-3333-3333-333333333333', 'otro@dltsports.cl');`,
    );
    await db.exec(
      `insert into public.registros (id, fecha, plataforma, publicaciones, created_by)
       values ('44444444-4444-4444-4444-444444444444', '2026-09-03', 'TikTok', 1, '${USUARIO}');`,
    );
    await db.exec(
      `update public.registros set created_by = '33333333-3333-3333-3333-333333333333', publicaciones = 5
       where id = '44444444-4444-4444-4444-444444444444';`,
    );
    const r = await filas<{ created_by: string; publicaciones: number }>(
      `select created_by, publicaciones from public.registros
       where id = '44444444-4444-4444-4444-444444444444'`,
    );
    expect(r[0].created_by).toBe(USUARIO); // el autor original se conserva
    expect(r[0].publicaciones).toBe(5); // el resto sí se edita
  });
});

describe("§3.4 — una sola línea base activa", () => {
  it("no deja dos activas a la vez", async () => {
    await expect(
      db.exec(
        `insert into public.lineas_base (mes, nombre, activa)
         values ('2026-07-01', 'julio', true);`,
      ),
    ).rejects.toThrow();
  });

  it("activar_linea_base desactiva la anterior", async () => {
    await db.exec(
      `insert into public.lineas_base (id, mes, nombre, activa)
       values ('55555555-5555-5555-5555-555555555555', '2026-07-01', 'julio', false);`,
    );
    await db.exec(
      `select public.activar_linea_base('55555555-5555-5555-5555-555555555555');`,
    );
    const r = await filas<{ nombre: string }>(
      `select nombre from public.lineas_base where activa`,
    );
    expect(r).toHaveLength(1);
    expect(r[0].nombre).toBe("julio");
    // Se deja agosto activa de nuevo para el resto de los tests.
    await db.exec(`select public.activar_linea_base('${LB}');`);
  });
});

describe("§3.2 y §9.2 — la vista de línea base desdobla sin contar de más", () => {
  beforeAll(async () => {
    const ins = (
      plataforma: string,
      formato: string | null,
      tipo: string | null,
      alcance: number | null,
      visualizaciones: number,
      interacciones: number,
    ) =>
      `insert into public.publicaciones_base
         (linea_base_id, plataforma, formato, tipo, alcance, visualizaciones, interacciones, fuente)
       values ('${LB}', '${plataforma}',
         ${formato ? `'${formato}'` : "null"}, ${tipo ? `'${tipo}'` : "null"},
         ${alcance ?? "null"}, ${visualizaciones}, ${interacciones}, 'manual');`;

    // Instagram DLT: 3 publicaciones, cada una con formato Y tipo.
    await db.exec(ins("Instagram DLT", "Reel", "Reactivo", 100_000, 200_000, 5_000));
    await db.exec(ins("Instagram DLT", "Reel", "Normal", 60_000, 120_000, 3_000));
    await db.exec(ins("Instagram DLT", "Imagen", "Normal", 80_000, 160_000, 4_000));

    // TikTok: 2 publicaciones sin formato ni tipo.
    await db.exec(ins("TikTok", null, null, 200_000, 220_000, 10_000));
    await db.exec(ins("TikTok", null, null, 100_000, 110_000, 4_000));

    // YouTube: sin alcance (§9.6).
    await db.exec(ins("YouTube", "Short", null, null, 50_000, 1_000));
  });

  it("el TOTAL cuenta cada publicación una sola vez", async () => {
    const r = await filas<{ n_publicaciones: number; alcance_prom: string }>(
      `select n_publicaciones, alcance_prom from public.lineas_base_detalle
       where plataforma = 'Instagram DLT' and categoria is null`,
    );
    expect(r[0].n_publicaciones).toBe(3); // no 6, aunque cada una aporta a 2 categorías
    expect(Number(r[0].alcance_prom)).toBeCloseTo(240_000 / 3, 6);
  });

  it("TikTok, sin formato ni tipo, no se triplica en el TOTAL", async () => {
    const r = await filas<{ n_publicaciones: number }>(
      `select n_publicaciones from public.lineas_base_detalle
       where plataforma = 'TikTok' and categoria is null`,
    );
    expect(r[0].n_publicaciones).toBe(2); // el select distinct evita las 3 filas por publicación
  });

  it("TikTok no genera ninguna línea de categoría", async () => {
    const r = await filas(
      `select categoria from public.lineas_base_detalle
       where plataforma = 'TikTok' and categoria is not null`,
    );
    expect(r).toHaveLength(0);
  });

  it("una publicación aparece tanto en su formato como en su tipo", async () => {
    const r = await filas<{ categoria: string; n_publicaciones: number }>(
      `select categoria, n_publicaciones from public.lineas_base_detalle
       where plataforma = 'Instagram DLT' and categoria is not null
       order by categoria`,
    );
    const m = Object.fromEntries(r.map((x) => [x.categoria, x.n_publicaciones]));
    expect(m).toEqual({ Imagen: 1, Normal: 2, Reactivo: 1, Reel: 2 });
    // Sumar las categorías da 6 sobre 3 publicaciones reales: por eso el TOTAL
    // nunca se calcula sumando categorías (§9.2).
    expect(Object.values(m).reduce((a, b) => a + b, 0)).toBe(6);
  });

  it("§9.6 — el engagement de YouTube sale sobre visualizaciones", async () => {
    const r = await filas<{ engagement_prom: string; alcance_prom: string | null }>(
      `select engagement_prom, alcance_prom from public.lineas_base_detalle
       where plataforma = 'YouTube' and categoria is null`,
    );
    expect(r[0].alcance_prom).toBeNull();
    expect(Number(r[0].engagement_prom)).toBeCloseTo(1_000 / 50_000, 10);
  });

  it("el engagement es razón de sumas, no promedio de razones", async () => {
    const r = await filas<{ engagement_prom: string }>(
      `select engagement_prom from public.lineas_base_detalle
       where plataforma = 'TikTok' and categoria is null`,
    );
    // (10.000 + 4.000) / (200.000 + 100.000)
    expect(Number(r[0].engagement_prom)).toBeCloseTo(14_000 / 300_000, 10);
  });

  it("reclasificar a mano cambia los promedios al instante", async () => {
    await db.exec(
      `update public.publicaciones_base set tipo = 'Reactivo', clasificado_a_mano = true
       where plataforma = 'Instagram DLT' and formato = 'Imagen';`,
    );
    const r = await filas<{ categoria: string; n_publicaciones: number }>(
      `select categoria, n_publicaciones from public.lineas_base_detalle
       where plataforma = 'Instagram DLT' and categoria in ('Reactivo','Normal')
       order by categoria`,
    );
    const m = Object.fromEntries(r.map((x) => [x.categoria, x.n_publicaciones]));
    expect(m).toEqual({ Normal: 1, Reactivo: 2 });
  });
});
