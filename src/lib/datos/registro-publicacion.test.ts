/**
 * La migración que convierte el registro en una fila por publicación.
 *
 * Lo que importa demostrar: que el hashtag queda normalizado (si no, el corte
 * del reporte semanal cuenta la misma serie dos veces), que reimportar no
 * duplica, y que el mismo contenido en dos cuentas sí puede convivir.
 */
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { baseDePrueba } from "./base-de-prueba";

const USUARIO = "22222222-2222-2222-2222-222222222222";

let db: PGlite;

async function idCuenta(nombre: string): Promise<string> {
  const r = await db.query<{ id: string }>(
    `select id from public.cuentas where nombre = $1`,
    [nombre],
  );
  return r.rows[0].id;
}

/** Inserta una publicación y devuelve su hashtag tal como quedó guardado. */
async function insertar(
  cuenta: string,
  datos: { hashtag?: string | null; id_externo?: string; fecha?: string; categoria?: string },
) {
  const id = await idCuenta(cuenta);
  await db.query(
    `insert into public.registros
       (fecha, cuenta_id, categoria, publicaciones, alcance, hashtag, id_externo,
        publicado_en, fuente, created_by)
     values ($1, $2, $3, 1, 50000, $4, $5, '2026-09-21T14:30:00', 'iconosquare', $6)`,
    [
      datos.fecha ?? "2026-09-21",
      id,
      datos.categoria ?? "Reel",
      datos.hashtag ?? null,
      datos.id_externo ?? null,
      USUARIO,
    ],
  );
}

beforeAll(async () => {
  db = await baseDePrueba({
    uid: USUARIO,
    usuario: { id: USUARIO, email: "cata@dltsports.cl" },
  });
}, 180_000);

afterAll(async () => {
  await db?.close();
});

describe("normalización del hashtag", () => {
  it("guarda en mayúsculas y sin el numeral", async () => {
    await insertar("Instagram DLT", { hashtag: "#Fecha17xDLT", id_externo: "a1" });
    const r = await db.query<{ hashtag: string }>(
      `select hashtag from public.registros where id_externo = 'a1'`,
    );
    expect(r.rows[0].hashtag).toBe("FECHA17XDLT");
  });

  it("dos formas de escribir la misma serie quedan iguales", async () => {
    await insertar("Instagram DLT", { hashtag: "fecha17xdlt", id_externo: "a2" });
    await insertar("Instagram DLT", { hashtag: "  #FECHA17XDLT  ", id_externo: "a3" });
    const r = await db.query<{ hashtag: string; n: string }>(
      `select hashtag, count(*)::text as n from public.registros
        where id_externo in ('a1','a2','a3') group by hashtag`,
    );
    // Si no se normalizara, el reporte contaría tres series distintas.
    expect(r.rows).toHaveLength(1);
    expect(Number(r.rows[0].n)).toBe(3);
  });

  it("un hashtag vacío queda en null, no en cadena vacía (§9.4)", async () => {
    await insertar("Instagram DLT", { hashtag: "   ", id_externo: "a4" });
    const r = await db.query<{ hashtag: string | null }>(
      `select hashtag from public.registros where id_externo = 'a4'`,
    );
    expect(r.rows[0].hashtag).toBeNull();
  });
});

describe("reimportar no duplica", () => {
  it("rechaza la misma publicación dos veces en la misma cuenta", async () => {
    await insertar("Instagram DBF", { hashtag: "DEBUENAFUENTE", id_externo: "url-1" });
    await expect(
      insertar("Instagram DBF", { hashtag: "DEBUENAFUENTE", id_externo: "url-1" }),
    ).rejects.toThrow();
  });

  it("deja convivir varias filas cargadas a mano, sin identificador", async () => {
    await insertar("Instagram DBF", { hashtag: "A MANO", id_externo: undefined });
    await insertar("Instagram DBF", { hashtag: "A MANO", id_externo: undefined });
    const r = await db.query<{ n: string }>(
      `select count(*)::text as n from public.registros where hashtag = 'A MANO'`,
    );
    expect(Number(r.rows[0].n)).toBe(2);
  });
});

describe("el mismo video en dos cuentas", () => {
  it("convive, porque cada cuenta lo mide por separado", async () => {
    await insertar("Instagram DLT", { hashtag: "VOZINHAENCHILE", id_externo: "mismo-video" });
    await insertar("TikTok", {
      hashtag: "VOZINHAENCHILE",
      id_externo: "mismo-video",
      categoria: "Video",
    });

    const r = await db.query<{ cuenta: string }>(
      `select c.nombre as cuenta from public.registros r
         join public.cuentas c on c.id = r.cuenta_id
        where r.id_externo = 'mismo-video' order by c.nombre`,
    );
    expect(r.rows.map((x) => x.cuenta)).toEqual(["Instagram DLT", "TikTok"]);
  });
});

describe("lo que ya existía sigue siendo válido", () => {
  it("una fila agrupada, sin hashtag ni publicación individual, se acepta", async () => {
    const id = await idCuenta("Instagram DLT");
    await db.query(
      `insert into public.registros (fecha, cuenta_id, categoria, publicaciones, alcance, created_by)
       values ('2026-08-20', $1, 'Reel', 4, 200000, $2)`,
      [id, USUARIO],
    );
    const r = await db.query<{ publicaciones: number; hashtag: string | null; fuente: string }>(
      `select publicaciones, hashtag, fuente::text as fuente
         from public.registros where fecha = '2026-08-20'`,
    );
    expect(r.rows[0].publicaciones).toBe(4);
    expect(r.rows[0].hashtag).toBeNull();
    // Sin indicar fuente, queda como carga a mano.
    expect(r.rows[0].fuente).toBe("manual");
  });
});
