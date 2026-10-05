/**
 * Armar la línea base desde el registro, contra Postgres de verdad.
 *
 * Lo que las pruebas puras no pueden ver: que la base acepte estas filas con
 * todos sus triggers puestos. Son varios y ninguno es decorativo — el que
 * completa `plataforma` desde `cuenta_id`, el que normaliza el hashtag, el que
 * valida que el formato sea de la red de la cuenta y el que impide guardar
 * alcance en YouTube. Si alguno rechaza la copia, la línea base del mes queda a
 * medias y todos los deltas del mes siguiente salen mal sin que nada avise.
 *
 * Y sobre todo: que la vista de promedios, que es de donde sale la referencia,
 * dé lo mismo calculada sobre las filas copiadas que sobre el registro
 * original.
 */
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  aPublicacionesBase,
  type FilaBaseDesdeRegistro,
  type RegistroParaBase,
} from "@/lib/dominio/base-desde-registro";
import { baseDePrueba } from "./base-de-prueba";

const USUARIO = "22222222-2222-4222-8222-222222222222";
const LINEA = "33333333-3333-4333-8333-333333333333";

let db: PGlite;
let IG: string;
let YT: string;

const COLUMNAS = [
  "linea_base_id",
  "cuenta_id",
  "publicado_en",
  "formato",
  "tipo",
  "tipo_auto",
  "serie_hashtag",
  "caption",
  "duracion_s",
  "visualizaciones",
  "alcance",
  "me_gusta",
  "comentarios",
  "compartidos",
  "guardados",
  "favoritos",
  "nuevos_seguidores",
  "interacciones",
  "enlace",
  "id_externo",
  "fuente",
] as const;

async function insertar(f: FilaBaseDesdeRegistro) {
  await db.query(
    `insert into public.publicaciones_base (${COLUMNAS.join(", ")})
     values (${COLUMNAS.map((_, i) => `$${i + 1}`).join(", ")})`,
    COLUMNAS.map((c) => f[c]),
  );
}

async function idDeCuenta(nombre: string): Promise<string> {
  const r = await db.query<{ id: string }>(
    `select id from public.cuentas where nombre = $1`,
    [nombre],
  );
  return r.rows[0].id;
}

function registro(p: Partial<RegistroParaBase> = {}): RegistroParaBase {
  return {
    id: crypto.randomUUID(),
    cuenta_id: IG,
    fecha: "2026-09-15",
    publicado_en: "2026-09-15T18:30:00",
    categoria: "Reel",
    tipo: "Normal",
    hashtag: "SPARTA",
    titulo_contenido: "Resumen de la fecha",
    enlace: "https://instagram.com/p/abc",
    id_externo: crypto.randomUUID(),
    fuente: "meta",
    publicaciones: 1,
    alcance: 9_000,
    visualizaciones: 12_000,
    interacciones: 335,
    nuevos_seguidores: 8,
    me_gusta: 300,
    comentarios: 20,
    compartidos: 10,
    guardados: 5,
    favoritos: null,
    duracion_s: 45,
    ...p,
  };
}

beforeAll(async () => {
  db = await baseDePrueba({
    uid: USUARIO,
    usuario: { id: USUARIO, email: "cata@dltsports.cl", nombre: "Catalina" },
  });
  IG = await idDeCuenta("Instagram DLT");
  YT = await idDeCuenta("YouTube");
}, 120_000);

afterAll(async () => {
  await db?.close();
});

beforeEach(async () => {
  await db.query(`delete from public.publicaciones_base`);
  await db.query(`delete from public.lineas_base`);
  await db.query(
    `insert into public.lineas_base (id, mes, nombre) values ($1, '2026-09-01', '2026-09')`,
    [LINEA],
  );
});

describe("copiar el registro a la línea base", () => {
  it("la base acepta una publicación copiada tal cual", async () => {
    const { filas } = aPublicacionesBase([registro()], LINEA);
    await insertar(filas[0]);

    const r = await db.query<{ n: string; me_gusta: number; formato: string }>(
      `select count(*)::text as n, max(me_gusta) as me_gusta, max(formato::text) as formato
         from public.publicaciones_base where linea_base_id = $1`,
      [LINEA],
    );
    expect(r.rows[0].n).toBe("1");
    expect(r.rows[0].me_gusta).toBe(300);
    expect(r.rows[0].formato).toBe("Reel");
  });

  /*
   * `plataforma` no se escribe a propósito: la completa el trigger desde
   * `cuenta_id`. Escribirla obligaría a inventar un valor para la cuenta de un
   * influencer, que no tiene equivalente en el enum viejo.
   */
  it("el trigger completa la plataforma desde la cuenta", async () => {
    const { filas } = aPublicacionesBase([registro()], LINEA);
    await insertar(filas[0]);

    const r = await db.query<{ plataforma: string | null }>(
      `select plataforma::text as plataforma from public.publicaciones_base`,
    );
    expect(r.rows[0].plataforma).toBe("Instagram DLT");
  });

  /* §9.6 — YouTube no entrega alcance, y el trigger lo hace cumplir. */
  it("§9.6 — una publicación de YouTube entra sin alcance", async () => {
    const { filas } = aPublicacionesBase(
      [registro({ cuenta_id: YT, categoria: "Short", tipo: null, alcance: null })],
      LINEA,
    );
    await insertar(filas[0]);

    const r = await db.query<{ alcance: number | null }>(
      `select alcance from public.publicaciones_base`,
    );
    expect(r.rows[0].alcance).toBeNull();
  });

  it("§9.6 — y la base rechaza la que viniera con alcance", async () => {
    const { filas } = aPublicacionesBase(
      [registro({ cuenta_id: YT, categoria: "Short", tipo: null, alcance: 100 })],
      LINEA,
    );
    await expect(insertar(filas[0])).rejects.toThrow(/alcance/i);
  });

  /* §3.2 — el formato tiene que ser de la red de esa cuenta. */
  it("§3.2 — la base rechaza un formato que no es de la red de la cuenta", async () => {
    const { filas } = aPublicacionesBase(
      [registro({ cuenta_id: YT, categoria: "Carrusel", tipo: null, alcance: null })],
      LINEA,
    );
    await expect(insertar(filas[0])).rejects.toThrow(/formato/i);
  });

  it("el hashtag llega normalizado por el trigger de la base", async () => {
    const { filas } = aPublicacionesBase([registro({ hashtag: "SPARTA" })], LINEA);
    await insertar(filas[0]);

    const r = await db.query<{ serie_hashtag: string }>(
      `select serie_hashtag from public.publicaciones_base`,
    );
    expect(r.rows[0].serie_hashtag).toBe("SPARTA");
  });

  /*
   * El índice único es (linea_base_id, plataforma, id_externo). El registro ya
   * garantiza que no haya dos filas con el mismo id_externo por cuenta, así que
   * la copia no puede chocar; esta prueba está para que se note si alguna de
   * las dos reglas cambia.
   */
  it("dos publicaciones distintas del mismo mes conviven", async () => {
    const { filas } = aPublicacionesBase([registro(), registro()], LINEA);
    for (const f of filas) await insertar(f);

    const r = await db.query<{ n: string }>(
      `select count(*)::text as n from public.publicaciones_base`,
    );
    expect(r.rows[0].n).toBe("2");
  });

  it("una fila sin hora entra con la medianoche de su día", async () => {
    const { filas } = aPublicacionesBase(
      [registro({ publicado_en: null, fecha: "2026-09-03", id_externo: null })],
      LINEA,
    );
    await insertar(filas[0]);

    const r = await db.query<{ dia: string }>(
      `select to_char(publicado_en at time zone 'UTC', 'YYYY-MM-DD') as dia
         from public.publicaciones_base`,
    );
    expect(r.rows[0].dia).toBe("2026-09-03");
  });
});

describe("los promedios que salen de la copia", () => {
  /*
   * LA prueba. La vista es de donde sale la referencia contra la que se compara
   * todo, así que el promedio calculado sobre las filas copiadas tiene que ser
   * el mismo que daría el registro original.
   */
  it("§9.1 — el promedio por publicación es el del registro", async () => {
    const registros = [
      registro({ alcance: 10_000, interacciones: 500 }),
      registro({ alcance: 30_000, interacciones: 1_500 }),
      registro({ alcance: 20_000, interacciones: 1_000 }),
    ];
    const { filas } = aPublicacionesBase(registros, LINEA);
    for (const f of filas) await insertar(f);

    const r = await db.query<{ n: string; alcance_prom: string; engagement_prom: string }>(
      `select n_publicaciones::text as n,
              alcance_prom::text,
              engagement_prom::text
         from public.lineas_base_detalle
        where linea_base_id = $1 and categoria is null`,
      [LINEA],
    );

    expect(r.rows[0].n).toBe("3");
    // 60.000 / 3
    expect(Number(r.rows[0].alcance_prom)).toBeCloseTo(20_000, 6);
    // §9.6 — razón de sumas: 3.000 / 60.000
    expect(Number(r.rows[0].engagement_prom)).toBeCloseTo(0.05, 10);
  });

  /*
   * §9.4 — las que no traen la métrica quedan fuera del numerador Y del
   * denominador. Si entraran al denominador, el promedio se diluiría hacia
   * abajo inventando ceros, y la vara del mes siguiente quedaría más baja de lo
   * que corresponde.
   */
  it("§9.4 — una publicación sin la métrica no diluye el promedio", async () => {
    const { filas } = aPublicacionesBase(
      [
        registro({ alcance: 10_000 }),
        registro({ alcance: 20_000 }),
        registro({ alcance: null, visualizaciones: 500 }),
      ],
      LINEA,
    );
    for (const f of filas) await insertar(f);

    const r = await db.query<{ alcance_prom: string; n: string }>(
      `select alcance_prom::text, n_publicaciones::text as n
         from public.lineas_base_detalle
        where linea_base_id = $1 and categoria is null`,
      [LINEA],
    );
    // 30.000 / 2, no 30.000 / 3.
    expect(Number(r.rows[0].alcance_prom)).toBeCloseTo(15_000, 6);
    // Pero el mes sí tiene tres publicaciones.
    expect(r.rows[0].n).toBe("3");
  });

  /*
   * §3.2 — en Instagram una publicación tiene formato Y tipo, así que aporta a
   * la línea "Reel", a la línea "Normal" y al TOTAL. El TOTAL no es la suma de
   * las dos: si lo fuera, esta publicación se contaría dos veces.
   */
  it("§3.2 y §9.2 — una publicación aporta a su formato, a su tipo y al TOTAL", async () => {
    const { filas } = aPublicacionesBase(
      [registro({ categoria: "Reel", tipo: "Reactivo", alcance: 10_000 })],
      LINEA,
    );
    await insertar(filas[0]);

    const r = await db.query<{ categoria: string | null; n: string }>(
      `select categoria::text as categoria, n_publicaciones::text as n
         from public.lineas_base_detalle
        where linea_base_id = $1
        order by categoria nulls first`,
      [LINEA],
    );

    const porCategoria = Object.fromEntries(r.rows.map((x) => [x.categoria ?? "TOTAL", x.n]));
    expect(porCategoria).toEqual({ TOTAL: "1", Reel: "1", Reactivo: "1" });
  });

  it("el corte por hashtag también sale de la copia", async () => {
    const { filas } = aPublicacionesBase(
      [
        registro({ hashtag: "SPARTA", alcance: 10_000 }),
        registro({ hashtag: "SPARTA", alcance: 20_000 }),
        registro({ hashtag: "FECHA21", alcance: 6_000 }),
      ],
      LINEA,
    );
    for (const f of filas) await insertar(f);

    const r = await db.query<{ hashtag: string | null; n: string; alcance_prom: string }>(
      `select hashtag, n_publicaciones::text as n, alcance_prom::text
         from public.lineas_base_hashtag
        where linea_base_id = $1
        order by hashtag`,
      [LINEA],
    );

    expect(r.rows.map((x) => x.hashtag)).toEqual(["FECHA21", "SPARTA"]);
    expect(Number(r.rows[1].alcance_prom)).toBeCloseTo(15_000, 6);
  });
});
