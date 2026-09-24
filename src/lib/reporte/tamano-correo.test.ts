/**
 * El correo tiene que entrar en el límite de Gmail.
 *
 * Gmail recorta los correos sobre ~102 KB: muestra "[Mensaje recortado]" y
 * esconde el resto tras un clic. Con las cuatro cuentas de agosto — 121
 * publicaciones y 49 series — el correo llegó a pesar 111 KB, de los cuales
 * 83 KB eran atributos `style=` repetidos en cada una de sus 378 celdas.
 *
 * Es un límite que se cruza en silencio: nadie lo nota hasta que alguien
 * pregunta por qué el reporte le llega cortado. Y va a acercarse más a medida
 * que se sumen cuentas de influencers, así que va con prueba y con margen
 * medido, no con un "debería alcanzar".
 */
import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { baseDePrueba } from "@/lib/datos/base-de-prueba";
import type { Catastro } from "@/lib/datos/consultas";
import { construirLineaPerfil, type PromediosBase } from "@/lib/dominio/calculo";
import {
  claveHashtag,
  construirBloque,
  destacadas,
  type FilaCatastro,
  type MapaPromedios,
  seriesCruzadas,
} from "@/lib/dominio/catastro";
import type { Cuenta } from "@/lib/dominio/redes";
import {
  bufferEjemplo,
  EJEMPLOS,
  hayEjemplos,
  type NombreEjemplo,
} from "@/lib/importar/archivos-de-ejemplo";
import { aFilasRegistro } from "@/lib/importar/a-registro";
import { resolverCuenta } from "@/lib/importar/cuentas";
import { leerArchivo } from "@/lib/importar/parsers";
import { mesDe } from "@/lib/importar/util";
import {
  construirReporteSemanal,
  htmlSemanal,
  LIMITE_GMAIL_BYTES,
  textoSemanal,
} from "./semanal";

const FUENTES: NombreEjemplo[] = ["dbfMeta", "dltIconosquare", "tiktok", "youtube"];
const describir = hayEjemplos(...FUENTES) ? describe : describe.skip;

const LB = "11111111-1111-4111-8111-111111111111";
const USUARIO = "22222222-2222-4222-8222-222222222222";
/** Una semana cargada de verdad: la última de agosto. */
const SEMANA = { desde: "2026-08-25", hasta: "2026-08-31" };

const bytes = (s: string) => Buffer.byteLength(s, "utf8");

describir("tamaño del correo semanal", () => {
  let cat: Catastro;

  beforeAll(async () => {
    const db: PGlite = await baseDePrueba({
      uid: USUARIO,
      usuario: { id: USUARIO, email: "cata@dltsports.cl", nombre: "Catalina" },
    });
    await db.exec(
      `insert into public.lineas_base (id, mes, nombre, activa)
       values ('${LB}', '2026-08-01', 'agosto', true);`,
    );

    const cuentas = (await db.query<Cuenta>(`select * from public.cuentas`)).rows;
    const filas: FilaCatastro[] = [];

    for (const cual of FUENTES) {
      const leido = leerArchivo(EJEMPLOS[cual], bufferEjemplo(cual));
      const res = resolverCuenta(cuentas, leido.detectada);
      if (!res.ok) throw new Error(res.motivo);
      const cuenta = res.cuenta;

      for (const p of leido.publicaciones) {
        if (!p.publicado_en || mesDe(p.publicado_en) !== "2026-08") continue;
        await db.query(
          `insert into public.publicaciones_base
             (linea_base_id, cuenta_id, publicado_en, formato, tipo, serie_hashtag,
              alcance, visualizaciones, interacciones, nuevos_seguidores, fuente)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [LB, cuenta.id, p.publicado_en, p.formato, p.tipo, p.serie_hashtag,
           p.alcance, p.visualizaciones, p.interacciones, p.nuevos_seguidores, p.fuente],
        );
      }

      for (const f of aFilasRegistro(leido.publicaciones, cuenta, SEMANA).filas) {
        filas.push({
          cuentaId: cuenta.id,
          red: cuenta.red,
          categoria: f.categoria,
          tipo: f.tipo,
          hashtag: f.hashtag,
          publicaciones: 1,
          alcance: f.alcance,
          visualizaciones: f.visualizaciones,
          interacciones: f.interacciones,
          nuevos_seguidores: f.nuevos_seguidores,
          // Las de perfil van a mano; se simulan para que el correo vaya completo.
          visitas_perfil: cuenta.red === "Instagram" ? 420 : null,
          vistas_seguidores: cuenta.red === "Instagram" ? 8_200 : null,
          vistas_no_seguidores: cuenta.red === "Instagram" ? 51_000 : null,
        });
      }
    }

    const prom = (f: Record<string, unknown>): PromediosBase => {
      const n = (v: unknown) => (v === null ? null : Number(v));
      return {
        n_publicaciones: Number(f.n_publicaciones),
        alcance_prom: n(f.alcance_prom),
        visualizaciones_prom: n(f.visualizaciones_prom),
        interacciones_prom: n(f.interacciones_prom),
        nuevos_seguidores_prom: n(f.nuevos_seguidores_prom),
        engagement_prom: n(f.engagement_prom),
      };
    };

    const vh = await db.query<Record<string, unknown>>(
      `select * from public.lineas_base_hashtag`,
    );
    const vc = await db.query<Record<string, unknown>>(
      `select * from public.lineas_base_detalle where categoria is null`,
    );

    const porHashtag: MapaPromedios = new Map(
      vh.rows.map((f) => [
        claveHashtag(String(f.cuenta_id), f.hashtag as string | null),
        prom(f),
      ]),
    );
    const porCuenta: MapaPromedios = new Map(
      vc.rows.map((f) => [String(f.cuenta_id), prom(f)]),
    );

    const conActividad = cuentas.filter((c) => filas.some((f) => f.cuentaId === c.id));
    const bloques = conActividad.map((c) =>
      construirBloque(filas, c, { porHashtag, porCuenta }),
    );
    const { mejores, peores } = destacadas(bloques);

    cat = {
      ...SEMANA,
      base: {
        id: LB,
        mes: "2026-08-01",
        nombre: "agosto",
        activa: true,
        creado_por: null,
        creado_en: "2026-09-01T00:00:00Z",
      },
      bloques,
      cruzadas: seriesCruzadas(bloques),
      mejores,
      peores,
      perfil: conActividad
        .map((c) => construirLineaPerfil(filas, c))
        .filter((l) => !l.sinDatos),
      publicaciones: filas.reduce((n, f) => n + f.publicaciones, 0),
      series: new Set(filas.filter((f) => f.hashtag).map((f) => f.hashtag)).size,
      hayAlgo: filas.length > 0,
    };
    await db.close();
  }, 300_000);

  it("la semana de prueba es de verdad grande", () => {
    // Si esto bajara, la prueba de tamaño dejaría de medir nada.
    expect(cat.publicaciones).toBeGreaterThan(100);
    expect(cat.series).toBeGreaterThan(40);
    expect(cat.bloques).toHaveLength(4);
  });

  it("entra en el límite de Gmail con margen", () => {
    const html = htmlSemanal(construirReporteSemanal(cat), {
      urlBase: "https://distribuciondlt.vercel.app",
    });
    const peso = bytes(html);

    // Con margen: el correo tiene que aguantar que se sumen cuentas.
    expect(peso).toBeLessThan(LIMITE_GMAIL_BYTES * 0.7);
  });

  it("los estilos ya no son la mayor parte del correo", () => {
    /*
     * Era el problema de fondo: 378 celdas con el mismo `style=` copiado.
     * Ahora lo repetido vive en una hoja del <head> y en línea solo queda el
     * color de cada variación, que depende de su valor.
     */
    const html = htmlSemanal(construirReporteSemanal(cat));
    const enEstilos = (html.match(/style="[^"]*"/g) ?? []).join("").length;

    expect(enEstilos / html.length).toBeLessThan(0.35);
  });

  it("el texto plano también entra, que es lo que se pega en WhatsApp", () => {
    expect(bytes(textoSemanal(construirReporteSemanal(cat)))).toBeLessThan(
      LIMITE_GMAIL_BYTES,
    );
  });
});
