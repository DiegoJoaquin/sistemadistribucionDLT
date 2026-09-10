/**
 * El caso que rompía la línea base: subir las DOS exportaciones de Instagram.
 *
 * Se reproduce contra Postgres, con las 270 publicaciones reales de agosto de
 * @dltsports: primero entra Iconosquare (que no trae nuevos seguidores) y
 * después una exportación estilo Meta (que sí los trae, y con las horas 3 horas
 * atrás). El mes tiene que seguir teniendo 270 publicaciones, no 540, y los
 * seguidores tienen que aparecer.
 */
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bufferEjemplo, EJEMPLOS, hayEjemplos } from "@/lib/importar/archivos-de-ejemplo";
import { cruzar, type PublicacionExistente } from "@/lib/importar/cruzar";
import { leerArchivo } from "@/lib/importar/parsers";
import type { PublicacionImportada } from "@/lib/importar/tipos";
import { mesDe, sumarHorasNaive } from "@/lib/importar/util";
import { baseDePrueba } from "./base-de-prueba";

const describir = hayEjemplos("dltIconosquare") ? describe : describe.skip;

const LB = "11111111-1111-1111-1111-111111111111";
const USUARIO = "22222222-2222-2222-2222-222222222222";


let db: PGlite;
let deIconosquare: PublicacionImportada[];

/** Exportación estilo Meta: mismas publicaciones, 3 h antes y con seguidores. */
function comoMeta(posts: PublicacionImportada[]): PublicacionImportada[] {
  return posts.map((p, i) => ({
    ...p,
    publicado_en: sumarHorasNaive(p.publicado_en!, -3),
    nuevos_seguidores: (i % 40) + 1,
    duracion_s: p.formato === "Reel" ? 60 + (i % 30) : 0,
    fuente: "meta" as const,
    id_externo: `meta-${i}`,
  }));
}

async function insertar(p: PublicacionImportada) {
  await db.query(
    `insert into public.publicaciones_base
      (linea_base_id, plataforma, publicado_en, formato, tipo, tipo_auto,
       serie_hashtag, caption, duracion_s, visualizaciones, alcance,
       me_gusta, comentarios, compartidos, guardados, favoritos,
       nuevos_seguidores, interacciones, enlace, id_externo, fuente)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`,
    [
      LB, p.plataforma, p.publicado_en, p.formato, p.tipo, p.tipo_auto,
      p.serie_hashtag, p.caption, p.duracion_s, p.visualizaciones, p.alcance,
      p.me_gusta, p.comentarios, p.compartidos, p.guardados, p.favoritos,
      p.nuevos_seguidores, p.interacciones, p.enlace, p.id_externo, p.fuente,
    ],
  );
}

beforeAll(async () => {
  if (!hayEjemplos("dltIconosquare")) return;
  db = await baseDePrueba({
    uid: USUARIO,
    usuario: { id: USUARIO, email: "cata@dltsports.cl" },
  });
  await db.exec(
    `insert into public.lineas_base (id, mes, nombre, activa)
     values ('${LB}', '2026-08-01', 'agosto', true);`,
  );

  const leido = leerArchivo(EJEMPLOS.dltIconosquare, bufferEjemplo("dltIconosquare"));
  deIconosquare = leido.publicaciones.filter(
    (p) => p.publicado_en && mesDe(p.publicado_en) === "2026-08",
  );

  // Primera importación: Iconosquare queda como fuente canónica del mes.
  for (const p of deIconosquare) await insertar(p);
}, 300_000);

afterAll(async () => {
  await db?.close();
});

async function cuenta(): Promise<number> {
  const r = await db.query<{ n: string }>(
    `select count(*)::text as n from public.publicaciones_base
     where plataforma = 'Instagram DLT'`,
  );
  return Number(r.rows[0].n);
}

async function totalVista() {
  const r = await db.query<{
    n_publicaciones: number;
    alcance_prom: string | null;
    nuevos_seguidores_prom: string | null;
  }>(
    `select n_publicaciones, alcance_prom, nuevos_seguidores_prom
     from public.lineas_base_detalle
     where plataforma = 'Instagram DLT' and categoria is null`,
  );
  return r.rows[0];
}

describir("primera fuente: Iconosquare", () => {
  it("carga las 270 publicaciones y calza con el Excel", async () => {
    expect(await cuenta()).toBe(270);
    const t = await totalVista();
    expect(t.n_publicaciones).toBe(270);
    expect(Number(t.alcance_prom)).toBeCloseTo(70_170.36667, 4);
  });

  it("todavía no tiene nuevos seguidores: Iconosquare no los entrega", async () => {
    const t = await totalVista();
    expect(t.nuevos_seguidores_prom).toBeNull();
  });
});

describir("segunda fuente: la exportación de Meta", () => {
  let resultado: ReturnType<typeof cruzar>;

  beforeAll(async () => {
    const previas = await db.query<PublicacionExistente>(
      `select id, publicado_en, caption, formato, nuevos_seguidores, duracion_s,
              alcance, visualizaciones, interacciones, me_gusta, comentarios,
              compartidos, guardados, favoritos
       from public.publicaciones_base
       where plataforma = 'Instagram DLT' and fuente = 'iconosquare'`,
    );

    resultado = cruzar(previas.rows, comoMeta(deIconosquare));

    // Se aplica igual que en la acción de importación: update, nunca insert.
    for (const e of resultado.enriquecimientos) {
      const sets = Object.keys(e.campos)
        .map((c, i) => `${c} = $${i + 2}`)
        .join(", ");
      await db.query(
        `update public.publicaciones_base set ${sets} where id = $1`,
        [e.id, ...Object.values(e.campos)],
      );
    }
  }, 300_000);

  it("calza las 270 y no deja ninguna sin calzar", () => {
    expect(resultado.calzadasPorCaption + resultado.calzadasPorHora).toBe(270);
    expect(resultado.sinCalzar).toHaveLength(0);
  });

  it("detecta solo el desfase de -3 horas de Meta", () => {
    expect(resultado.desfaseHoras).toBe(3);
    expect(resultado.desfaseSegun).toBe("captions");
  });

  it("EL BUG: el mes sigue teniendo 270 publicaciones, no 540", async () => {
    expect(await cuenta()).toBe(270);
    const t = await totalVista();
    expect(t.n_publicaciones).toBe(270);
  });

  it("el promedio de alcance no se movió ni un decimal", async () => {
    const t = await totalVista();
    expect(Number(t.alcance_prom)).toBeCloseTo(70_170.36667, 4);
  });

  it("ahora sí hay nuevos seguidores, que era el punto de subir Meta", async () => {
    const t = await totalVista();
    expect(t.nuevos_seguidores_prom).not.toBeNull();
    const esperado =
      deIconosquare.reduce((a, _, i) => a + ((i % 40) + 1), 0) / 270;
    expect(Number(t.nuevos_seguidores_prom)).toBeCloseTo(esperado, 6);
  });

  it("no sobrescribió el alcance que ya venía de Iconosquare", async () => {
    expect(resultado.camposCompletados.alcance).toBeUndefined();
  });
});
