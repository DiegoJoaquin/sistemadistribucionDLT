/**
 * El informe por cliente de extremo a extremo, con los archivos reales.
 *
 * Se usan hashtags de patrocinador que de verdad existen en las exportaciones
 * de agosto — #BETANOXDLT y #SANTANDERXDLT — así la prueba corre sobre datos
 * reales y no sobre un cliente inventado.
 *
 * Verifica lo que no se puede ver con pruebas puras: que el hashtag guardado
 * en `cliente_hashtags` calce con el de `registros`, y que el informe no
 * arrastre contenido que no es del cliente.
 */
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { claveHashtag, type MapaPromedios } from "@/lib/dominio/catastro";
import type { PromediosBase } from "@/lib/dominio/calculo";
import { construirInforme, type FilaInforme } from "@/lib/dominio/informe";
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
import { baseDePrueba } from "./base-de-prueba";
import { parsearListaHashtags } from "./esquemas";

const FUENTES: NombreEjemplo[] = ["dbfMeta", "dltIconosquare", "tiktok", "youtube"];
const describir = hayEjemplos(...FUENTES) ? describe : describe.skip;

const LB = "11111111-1111-4111-8111-111111111111";
const USUARIO = "22222222-2222-4222-8222-222222222222";
const PERIODO = { desde: "2026-08-01", hasta: "2026-08-31" };

/** Como la pegaría el equipo desde un correo del cliente. */
const LISTA_BETANO = "#BetanoxDLT";
const LISTA_SANTANDER = "#SantanderxDLT, #MundialistasBySantander";

describir("informe por cliente con los archivos reales", () => {
  let db: PGlite;
  let cuentas: Cuenta[];
  let filas: FilaInforme[] = [];
  let porHashtag: MapaPromedios = new Map();
  let porCuenta: MapaPromedios = new Map();

  beforeAll(async () => {
    db = await baseDePrueba({
      uid: USUARIO,
      usuario: { id: USUARIO, email: "cata@dltsports.cl", nombre: "Catalina" },
    });
    await db.exec(
      `insert into public.lineas_base (id, mes, nombre, activa)
       values ('${LB}', '2026-08-01', 'agosto', true);`,
    );

    cuentas = (await db.query<Cuenta>(`select * from public.cuentas`)).rows;

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

      for (const f of aFilasRegistro(leido.publicaciones, cuenta, PERIODO).filas) {
        await db.query(
          `insert into public.registros
             (fecha, cuenta_id, categoria, tipo, hashtag, publicaciones, alcance,
              visualizaciones, interacciones, nuevos_seguidores, id_externo,
              fuente, created_by)
           values ($1,$2,$3,$4,$5,1,$6,$7,$8,$9,$10,$11,$12)`,
          [f.fecha, cuenta.id, f.categoria, f.tipo, f.hashtag, f.alcance,
           f.visualizaciones, f.interacciones, f.nuevos_seguidores, f.id_externo,
           f.fuente, USUARIO],
        );
      }
    }

    /* Todo lo demás se lee de la base, como lo hace la aplicación. */
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
    porHashtag = new Map(
      vh.rows.map((f) => [
        claveHashtag(String(f.cuenta_id), f.hashtag as string | null),
        prom(f),
      ]),
    );
    porCuenta = new Map(vc.rows.map((f) => [String(f.cuenta_id), prom(f)]));

    const registros = await db.query<{
      fecha: string;
      cuenta_id: string;
      categoria: string | null;
      tipo: string | null;
      hashtag: string | null;
      publicaciones: number;
      alcance: number | null;
      visualizaciones: number | null;
      interacciones: number | null;
      nuevos_seguidores: number | null;
    }>(
      `select fecha::text, cuenta_id, categoria, tipo, hashtag, publicaciones,
              alcance, visualizaciones, interacciones, nuevos_seguidores
         from public.registros`,
    );

    const porId = new Map(cuentas.map((c) => [c.id, c]));
    filas = registros.rows.map((r) => ({
      fecha: r.fecha,
      cuentaId: r.cuenta_id,
      red: porId.get(r.cuenta_id)!.red,
      categoria: r.categoria as never,
      tipo: r.tipo as never,
      hashtag: r.hashtag,
      publicaciones: r.publicaciones,
      alcance: r.alcance,
      visualizaciones: r.visualizaciones,
      interacciones: r.interacciones,
      nuevos_seguidores: r.nuevos_seguidores,
      visitas_perfil: null,
      vistas_seguidores: null,
      vistas_no_seguidores: null,
    }));
  }, 300_000);

  afterAll(async () => {
    await db?.close();
  });

  /** Guarda la lista en la base y la lee de vuelta, como hace la aplicación. */
  async function hashtagsDesdeLaBase(nombre: string, lista: string): Promise<string[]> {
    const c = await db.query<{ id: string }>(
      `insert into public.clientes (nombre) values ($1) returning id`,
      [nombre],
    );
    for (const h of parsearListaHashtags(lista)) {
      await db.query(
        `insert into public.cliente_hashtags (cliente_id, hashtag) values ($1, $2)`,
        [c.rows[0].id, h],
      );
    }
    const r = await db.query<{ hashtag: string }>(
      `select hashtag from public.cliente_hashtags where cliente_id = $1`,
      [c.rows[0].id],
    );
    return r.rows.map((x) => x.hashtag);
  }

  /*
   * El caso que motivó mostrar el denominador: #BETANOXDLT sale en las cuatro
   * cuentas, y siete de sus diecinueve publicaciones son de YouTube, que no
   * entrega alcance. El promedio de alcance está calculado sobre doce, no
   * sobre diecinueve, y en un informe que va a un cliente hay que decirlo.
   */
  it("dice sobre cuántas publicaciones se calculó cada promedio", async () => {
    const hashtags = await hashtagsDesdeLaBase("BetanoDen", LISTA_BETANO);
    const informe = construirInforme("Betano", hashtags, filas, cuentas, PERIODO, {
      porHashtag,
      porCuenta,
    });

    expect(informe.total.publicaciones).toBe(19);
    // §9.4 — las de YouTube no entran al promedio de alcance ni a su divisor.
    expect(informe.total.denominadores.alcance).toBeLessThan(
      informe.total.publicaciones,
    );
    // Visualizaciones sí las traen todas las redes.
    expect(informe.total.denominadores.visualizaciones).toBe(
      informe.total.publicaciones,
    );
  });

  it("encuentra el contenido de un patrocinador en varias cuentas", async () => {
    const hashtags = await hashtagsDesdeLaBase("Betano", LISTA_BETANO);
    // El camino del formulario y el del registro producen el mismo texto.
    expect(hashtags).toEqual(["BETANOXDLT"]);

    const informe = construirInforme(
      "Betano",
      hashtags,
      filas,
      cuentas,
      PERIODO,
      { porHashtag, porCuenta },
    );

    expect(informe.hayDatos).toBe(true);
    expect(informe.total.publicaciones).toBeGreaterThan(0);
    // #BETANOXDLT sale en Instagram DLT, Instagram DBF y TikTok.
    expect(informe.total.cuentas).toBeGreaterThan(1);
    expect(informe.hashtagsSinDatos).toEqual([]);
  });

  it("el informe NO arrastra contenido que no es del cliente", async () => {
    const hashtags = await hashtagsDesdeLaBase("Betano2", LISTA_BETANO);
    const informe = construirInforme(
      "Betano",
      hashtags,
      filas,
      cuentas,
      PERIODO,
      { porHashtag, porCuenta },
    );

    // Todas las series del informe son del cliente, y ninguna otra.
    for (const bloque of informe.bloques) {
      for (const linea of bloque.series) {
        expect(linea.corte.tipo).toBe("hashtag");
        if (linea.corte.tipo === "hashtag") {
          expect(hashtags).toContain(linea.corte.hashtag);
        }
      }
    }

    // Y es una fracción del total del mes, no el mes entero.
    const totalDelMes = filas.reduce((n, f) => n + f.publicaciones, 0);
    expect(informe.total.publicaciones).toBeLessThan(totalDelMes / 4);
  });

  it("avisa de los hashtags del cliente que no tuvieron publicaciones", async () => {
    const hashtags = await hashtagsDesdeLaBase(
      "Santander",
      `${LISTA_SANTANDER}, #SantanderNoExiste`,
    );

    const informe = construirInforme(
      "Santander",
      hashtags,
      filas,
      cuentas,
      PERIODO,
      { porHashtag, porCuenta },
    );

    expect(informe.hashtagsConDatos.length).toBeGreaterThan(0);
    expect(informe.hashtagsSinDatos).toContain("SANTANDERNOEXISTE");
  });

  it("el total del bloque es el del cliente, no el de la cuenta", async () => {
    const hashtags = await hashtagsDesdeLaBase("Betano3", LISTA_BETANO);
    const informe = construirInforme(
      "Betano",
      hashtags,
      filas,
      cuentas,
      PERIODO,
      { porHashtag, porCuenta },
    );

    for (const bloque of informe.bloques) {
      const deLaCuenta = filas.filter((f) => f.cuentaId === bloque.cuenta.id);
      const totalCuenta = deLaCuenta.reduce((n, f) => n + f.publicaciones, 0);
      // Si el filtro se aplicara después de armar los bloques, serían iguales.
      expect(bloque.total.publicaciones).toBeLessThan(totalCuenta);
      expect(bloque.total.publicaciones).toBeGreaterThan(0);
    }
  });

  it("un cliente sin coincidencias da un informe vacío, no un error", async () => {
    const hashtags = await hashtagsDesdeLaBase("Inexistente", "#NadaDeEsto, #Tampoco");
    const informe = construirInforme(
      "Inexistente",
      hashtags,
      filas,
      cuentas,
      PERIODO,
      { porHashtag, porCuenta },
    );

    expect(informe.hayDatos).toBe(false);
    expect(informe.bloques).toEqual([]);
    expect(informe.hashtagsSinDatos).toHaveLength(2);
  });
});
