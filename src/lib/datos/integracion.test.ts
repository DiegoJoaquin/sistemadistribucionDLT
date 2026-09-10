/**
 * Prueba de extremo a extremo, sin atajos:
 *
 *   archivos reales de exportación
 *     -> los lectores de src/lib/importar
 *     -> insert en publicaciones_base (Postgres real, misma migración)
 *     -> vista lineas_base_detalle
 *     -> construirLinea() con registros de un día
 *     -> deltas
 *
 * Los promedios resultantes se contrastan contra los que el Excel ya había
 * calculado para agosto 2026 en su hoja RESUMEN.
 */
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  bufferEjemplo,
  EJEMPLOS,
  hayEjemplos,
  type NombreEjemplo,
} from "@/lib/importar/archivos-de-ejemplo";
import {
  construirLinea,
  type FilaCalculo,
  type PromediosBase,
} from "@/lib/dominio/calculo";
import type { Categoria, Plataforma } from "@/lib/dominio/plataformas";
import { leerArchivo } from "@/lib/importar/parsers";
import { baseDePrueba } from "./base-de-prueba";
import { mesDe } from "@/lib/importar/util";

const FUENTES: NombreEjemplo[] = ["dbfMeta", "dltIconosquare", "tiktok", "youtube"];
const describir = hayEjemplos(...FUENTES) ? describe : describe.skip;

const LB = "11111111-1111-1111-1111-111111111111";
const USUARIO = "22222222-2222-2222-2222-222222222222";


let db: PGlite;
let importadas = 0;

beforeAll(async () => {
  if (!hayEjemplos(...FUENTES)) return;
  db = await baseDePrueba({
    uid: USUARIO,
    usuario: { id: USUARIO, email: "cata@dltsports.cl", nombre: "Catalina" },
  });
  await db.exec(
    `insert into public.lineas_base (id, mes, nombre, activa)
     values ('${LB}', '2026-08-01', 'agosto', true);`,
  );

  for (const cual of FUENTES) {
    const leido = leerArchivo(EJEMPLOS[cual], bufferEjemplo(cual));

    for (const p of leido.publicaciones) {
      if (!p.publicado_en || mesDe(p.publicado_en) !== "2026-08") continue;
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
      importadas++;
    }
  }
}, 300_000);

afterAll(async () => {
  await db?.close();
});

interface FilaVista {
  plataforma: Plataforma;
  categoria: Categoria | null;
  n_publicaciones: number;
  alcance_prom: string | null;
  visualizaciones_prom: string | null;
  interacciones_prom: string | null;
  nuevos_seguidores_prom: string | null;
  engagement_prom: string | null;
}

const aNum = (v: string | null) => (v === null ? null : Number(v));

async function base(
  plataforma: Plataforma,
  categoria: Categoria | null,
): Promise<PromediosBase> {
  const r = await db.query<FilaVista>(
    `select * from public.lineas_base_detalle
     where linea_base_id = $1 and plataforma = $2
       and categoria is not distinct from $3`,
    [LB, plataforma, categoria],
  );
  const f = r.rows[0];
  expect(f, `falta la línea base de ${plataforma}/${categoria ?? "TOTAL"}`).toBeDefined();
  return {
    n_publicaciones: f.n_publicaciones,
    alcance_prom: aNum(f.alcance_prom),
    visualizaciones_prom: aNum(f.visualizaciones_prom),
    interacciones_prom: aNum(f.interacciones_prom),
    nuevos_seguidores_prom: aNum(f.nuevos_seguidores_prom),
    engagement_prom: aNum(f.engagement_prom),
  };
}

function fila(p: Partial<FilaCalculo>): FilaCalculo {
  return {
    plataforma: "Instagram DLT",
    categoria: null,
    publicaciones: 1,
    alcance: null,
    visualizaciones: null,
    interacciones: null,
    nuevos_seguidores: null,
    visitas_perfil: null,
    vistas_seguidores: null,
    vistas_no_seguidores: null,
    ...p,
  };
}

describir("importación completa de agosto 2026", () => {
  it("carga las publicaciones de las cuatro fuentes", async () => {
    // 270 Instagram DLT + 37 Instagram DBF + 87 TikTok + 112 YouTube
    expect(importadas).toBe(506);

    const r = await db.query<{ plataforma: string; n: string }>(
      `select plataforma, count(*)::text as n from public.publicaciones_base
       group by plataforma order by plataforma`,
    );
    expect(Object.fromEntries(r.rows.map((x) => [x.plataforma, Number(x.n)]))).toEqual({
      "Instagram DBF": 37,
      "Instagram DLT": 270,
      TikTok: 87,
      YouTube: 112,
    });
  });

  it("reproduce los promedios de Instagram DLT del Excel (RESUMEN filas 6 a 11)", async () => {
    const total = await base("Instagram DLT", null);
    expect(total.n_publicaciones).toBe(270);
    expect(total.alcance_prom!).toBeCloseTo(70_170.36667, 4);
    expect(total.visualizaciones_prom!).toBeCloseTo(139_201.5593, 3);
    expect(total.interacciones_prom!).toBeCloseTo(5_307.396296, 4);

    expect((await base("Instagram DLT", "Imagen")).alcance_prom!).toBeCloseTo(78_033.19091, 4);
    expect((await base("Instagram DLT", "Reel")).alcance_prom!).toBeCloseTo(67_714.8427, 4);
    expect((await base("Instagram DLT", "Carrusel")).alcance_prom!).toBeCloseTo(61_066.57746, 4);
  });

  it("reproduce el promedio de alcance de Instagram DBF del Excel (RESUMEN fila 15)", async () => {
    const total = await base("Instagram DBF", null);
    // 37 publicaciones cargadas, pero solo 35 traen alcance: el promedio de
    // alcance calza con el Excel porque las 2 que faltan son justamente esas.
    expect(total.n_publicaciones).toBe(37);
    expect(total.alcance_prom!).toBeCloseTo(39_128, 0);
  });

  it("§9.6 — YouTube queda sin alcance y con engagement sobre visualizaciones", async () => {
    const yt = await base("YouTube", null);
    expect(yt.alcance_prom).toBeNull();
    expect(yt.engagement_prom).not.toBeNull();
    expect(yt.engagement_prom!).toBeGreaterThan(0);
  });

  it("TikTok tiene una sola categoría, Video, con las mismas 87 que el TOTAL", async () => {
    const r = await db.query<{ categoria: string }>(
      `select distinct categoria from public.lineas_base_detalle
       where plataforma = 'TikTok' and categoria is not null`,
    );
    expect(r.rows.map((x) => x.categoria)).toEqual(["Video"]);

    // Al haber una sola categoría, TOTAL y Video coinciden: todo es video.
    const total = await base("TikTok", null);
    const video = await base("TikTok", "Video");
    expect(total.n_publicaciones).toBe(87);
    expect(video.n_publicaciones).toBe(87);
    expect(video.alcance_prom).toBe(total.alcance_prom);
  });

  it("§9.2 — el TOTAL de Instagram no es la suma de sus categorías", async () => {
    const total = await base("Instagram DLT", null);
    const cats: Categoria[] = ["Reactivo", "Normal", "Imagen", "Reel", "Carrusel"];
    let suma = 0;
    for (const c of cats) suma += (await base("Instagram DLT", c)).n_publicaciones;
    expect(suma).toBe(540); // cada publicación cuenta dos veces: formato y tipo
    expect(total.n_publicaciones).toBe(270);
  });

  it("la clasificación automática reparte las 270 entre Reactivo y Normal", async () => {
    const reactivo = await base("Instagram DLT", "Reactivo");
    const normal = await base("Instagram DLT", "Normal");
    expect(reactivo.n_publicaciones + normal.n_publicaciones).toBe(270);
    // El Excel marcaba 62/208; la diferencia son 4 publicaciones con el hashtag
    // #QUECAMBIO, que no figura en la lista de reactivos de la especificación.
    expect(reactivo.n_publicaciones).toBe(58);
    expect(normal.n_publicaciones).toBe(212);
  });
});

describir("un día de registro comparado contra esta línea base", () => {
  it("calcula promedios por publicación y sus deltas", async () => {
    const b = await base("Instagram DLT", null);

    // Un día flojo: 14 publicaciones que juntas alcanzaron 672.934 personas.
    const registros = [
      fila({
        plataforma: "Instagram DLT",
        categoria: "Reel",
        publicaciones: 8,
        alcance: 400_000,
        visualizaciones: 800_000,
        interacciones: 30_000,
        nuevos_seguidores: 60,
      }),
      fila({
        plataforma: "Instagram DLT",
        categoria: "Imagen",
        publicaciones: 6,
        alcance: 272_934,
        visualizaciones: 500_000,
        interacciones: 20_000,
        nuevos_seguidores: 40,
      }),
    ];

    const total = construirLinea(registros, "Instagram DLT", null, b);

    expect(total.publicaciones).toBe(14);
    expect(total.dia.alcance!).toBeCloseTo(672_934 / 14, 6); // 48.066,7 por publicación
    expect(total.deltas.alcance!).toBeCloseTo(-0.315, 3); // -31,5%, no +859%

    // El engagement es razón de sumas: 50.000 / 672.934
    expect(total.dia.engagement!).toBeCloseTo(50_000 / 672_934, 10);
  });

  it("una plataforma sin registros ese día no muestra 0%, muestra guion", async () => {
    const b = await base("TikTok", null);
    const linea = construirLinea([], "TikTok", null, b);
    expect(linea.sinDatos).toBe(true);
    expect(linea.dia.alcance).toBeNull();
    expect(linea.deltas.alcance).toBeNull();
  });

  it("una categoría sin línea base tampoco muestra 0%", async () => {
    // Twitter/X no se importó: no hay línea base para esa plataforma.
    const linea = construirLinea(
      [fila({ plataforma: "Twitter/X", categoria: "Video", publicaciones: 2, alcance: 5_000 })],
      "Twitter/X",
      "Video",
      null,
    );
    expect(linea.dia.alcance).toBe(2_500);
    expect(linea.deltas.alcance).toBeNull();
  });
});
