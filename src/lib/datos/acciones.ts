"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  desdeFormData,
  esquemaRegistro,
  esquemaReporte,
  primerError,
} from "./esquemas";
import { cruzar } from "@/lib/importar/cruzar";
import { leerArchivo } from "@/lib/importar/parsers";
import { leerRegistroExcel } from "@/lib/importar/registro-excel";
import type { PublicacionImportada } from "@/lib/importar/tipos";
import { mesDe } from "@/lib/importar/util";
import { exigirSesion, supabaseServidor } from "@/lib/supabase/servidor";
import type { PublicacionBaseRow } from "@/lib/supabase/tipos-db";

export interface Resultado {
  ok: boolean;
  mensaje?: string;
}

/* ------------------------------------------------------------------ */
/* Registro de publicaciones                                           */
/* ------------------------------------------------------------------ */

export async function crearRegistro(
  _previo: Resultado | null,
  fd: FormData,
): Promise<Resultado> {
  const { usuarioId } = await exigirSesion();
  const parseado = esquemaRegistro.safeParse(desdeFormData(fd));

  if (!parseado.success) {
    return { ok: false, mensaje: primerError(parseado.error) };
  }

  const supabase = await supabaseServidor();
  const { error } = await supabase
    .from("registros")
    .insert({ ...parseado.data, created_by: usuarioId });

  if (error) return { ok: false, mensaje: error.message };

  revalidatePath("/registro");
  revalidatePath("/panel");
  return { ok: true, mensaje: "Registro guardado." };
}

export async function actualizarRegistro(
  _previo: Resultado | null,
  fd: FormData,
): Promise<Resultado> {
  await exigirSesion();
  const id = String(fd.get("id") ?? "");
  if (!id) return { ok: false, mensaje: "Falta el identificador del registro." };

  const parseado = esquemaRegistro.safeParse(desdeFormData(fd));
  if (!parseado.success) {
    return { ok: false, mensaje: primerError(parseado.error) };
  }

  const supabase = await supabaseServidor();
  const { error } = await supabase.from("registros").update(parseado.data).eq("id", id);
  if (error) return { ok: false, mensaje: error.message };

  revalidatePath("/registro");
  revalidatePath("/panel");
  return { ok: true, mensaje: "Cambios guardados." };
}

export async function borrarRegistro(fd: FormData): Promise<void> {
  await exigirSesion();
  const id = String(fd.get("id") ?? "");
  if (!id) return;

  const supabase = await supabaseServidor();
  await supabase.from("registros").delete().eq("id", id);

  revalidatePath("/registro");
  revalidatePath("/panel");
}

/* ------------------------------------------------------------------ */
/* Importación de línea base (§5)                                      */
/* ------------------------------------------------------------------ */

export interface DetalleImport {
  plataforma: string;
  cuenta: string | null;
  mes: string;
  /**
   * canonica  — primera fuente de esta plataforma: define el conjunto del mes
   * completar — segunda fuente: solo rellena campos vacíos, no agrega filas
   * reemplazo — se volvió a subir la misma fuente
   */
  modo: "canonica" | "completar" | "reemplazo";
  insertadas: number;
  completadas: number;
  sinCalzar: number;
  otroMes: number;
  desfaseHoras: number | null;
  desfaseSegun: "captions" | "por defecto" | "ninguno" | null;
  camposCompletados: string[];
  advertencias: string[];
}

export interface ResultadoImportar extends Resultado {
  detalle?: DetalleImport;
}

function aFilaBase(p: PublicacionImportada, lineaBaseId: string) {
  return {
    linea_base_id: lineaBaseId,
    plataforma: p.plataforma,
    publicado_en: p.publicado_en,
    formato: p.formato,
    tipo: p.tipo,
    tipo_auto: p.tipo_auto,
    serie_hashtag: p.serie_hashtag,
    caption: p.caption,
    duracion_s: p.duracion_s,
    visualizaciones: p.visualizaciones,
    alcance: p.alcance,
    me_gusta: p.me_gusta,
    comentarios: p.comentarios,
    compartidos: p.compartidos,
    guardados: p.guardados,
    favoritos: p.favoritos,
    nuevos_seguidores: p.nuevos_seguidores,
    interacciones: p.interacciones,
    enlace: p.enlace,
    id_externo: p.id_externo,
    fuente: p.fuente,
  };
}

/**
 * §5.1 — Importa una exportación a la línea base de un mes.
 *
 * La primera fuente de una plataforma es la canónica: define cuántas
 * publicaciones tiene el mes. Las siguientes solo completan campos vacíos de
 * las que ya están. Sin esa regla, subir las dos fuentes de Instagram
 * duplicaría las 270 publicaciones de agosto y partiría todos los promedios
 * por la mitad.
 */
export async function importarArchivo(
  _previo: ResultadoImportar | null,
  fd: FormData,
): Promise<ResultadoImportar> {
  const { usuarioId } = await exigirSesion();

  const archivo = fd.get("archivo");
  const mesElegido = String(fd.get("mes") ?? "").trim();

  if (!(archivo instanceof File) || archivo.size === 0) {
    return { ok: false, mensaje: "Elige un archivo para importar." };
  }
  if (!/^\d{4}-\d{2}$/.test(mesElegido)) {
    return { ok: false, mensaje: "Elige el mes de la línea base." };
  }

  let leido;
  try {
    leido = leerArchivo(archivo.name, await archivo.arrayBuffer());
  } catch (e) {
    return { ok: false, mensaje: e instanceof Error ? e.message : "No pude leer el archivo." };
  }

  const delMes = leido.publicaciones.filter(
    (p) => p.publicado_en && mesDe(p.publicado_en) === mesElegido,
  );
  if (delMes.length === 0) {
    return {
      ok: false,
      mensaje: `El archivo no tiene publicaciones de ${mesElegido}. Meses que sí trae: ${
        leido.meses.join(", ") || "ninguno"
      }.`,
    };
  }

  const supabase = await supabaseServidor();
  const primerDia = `${mesElegido}-01`;

  // Una línea base por mes; si ya existe, se reutiliza.
  const { data: existente } = await supabase
    .from("lineas_base")
    .select("id")
    .eq("mes", primerDia)
    .maybeSingle<{ id: string }>();

  let lineaBaseId = existente?.id;
  if (!lineaBaseId) {
    const { data, error } = await supabase
      .from("lineas_base")
      .insert({ mes: primerDia, nombre: mesElegido, creado_por: usuarioId })
      .select("id")
      .single<{ id: string }>();
    if (error || !data) {
      return { ok: false, mensaje: error?.message ?? "No pude crear la línea base." };
    }
    lineaBaseId = data.id;
  }

  /*
   * Si no hay ninguna referencia activa, esta pasa a serlo.
   *
   * Antes había que ir a marcarla a mano, y el resultado era desconcertante:
   * importabas 500 publicaciones, cargabas un día, y todas las variaciones
   * salían como guion sin ninguna explicación visible. Cuando hay una sola
   * línea base no hay nada que elegir.
   */
  const { data: hayActiva } = await supabase
    .from("lineas_base")
    .select("id")
    .eq("activa", true)
    .maybeSingle<{ id: string }>();

  if (!hayActiva) {
    await supabase.rpc("activar_linea_base", { p_id: lineaBaseId });
  }

  const { data: yaCargadas, error: errorLeer } = await supabase
    .from("publicaciones_base")
    .select("*")
    .eq("linea_base_id", lineaBaseId)
    .eq("plataforma", leido.plataforma);

  if (errorLeer) return { ok: false, mensaje: errorLeer.message };

  const previas = (yaCargadas ?? []) as unknown as PublicacionBaseRow[];
  const deEstaFuente = previas.filter((p) => p.fuente === leido.fuente);
  const deOtraFuente = previas.filter((p) => p.fuente !== leido.fuente);

  const advertencias = [...leido.advertencias];
  const comun: DetalleImport = {
    plataforma: leido.plataforma,
    cuenta: leido.cuenta,
    mes: mesElegido,
    modo: "canonica",
    insertadas: 0,
    completadas: 0,
    sinCalzar: 0,
    otroMes: leido.publicaciones.length - delMes.length,
    desfaseHoras: null,
    desfaseSegun: null,
    camposCompletados: [],
    advertencias,
  };

  /*
   * Ya hay publicaciones de OTRA fuente para esta plataforma: se COMPLETAN los
   * campos vacíos de las que están, sin agregar ni una fila. Es el caso de
   * Instagram, que necesita Iconosquare (alcance) y Meta (nuevos seguidores).
   */
  if (deOtraFuente.length > 0 && deEstaFuente.length === 0) {
    const cruce = cruzar(deOtraFuente, delMes);

    if (cruce.enriquecimientos.length > 0) {
      const porId = new Map(deOtraFuente.map((p) => [p.id, p]));
      const filas = cruce.enriquecimientos.map((e) => ({
        ...porId.get(e.id)!,
        ...e.campos,
      }));
      const { error } = await supabase
        .from("publicaciones_base")
        .upsert(filas, { onConflict: "id" });
      if (error) return { ok: false, mensaje: error.message };
    }

    if (cruce.sinCalzar.length > 0) {
      advertencias.push(
        `${cruce.sinCalzar.length} publicaciones de este archivo no calzaron con las que ya estaban, y no se agregaron para no duplicar el mes. Revisa que sea la misma cuenta y el mismo mes.`,
      );
    }

    revalidatePath("/base");
    revalidatePath("/panel");
    revalidatePath("/registro");

    return {
      ok: true,
      mensaje: `Se completaron ${cruce.enriquecimientos.length} publicaciones de ${leido.plataforma} con los datos de este archivo.`,
      detalle: {
        ...comun,
        modo: "completar",
        completadas: cruce.enriquecimientos.length,
        sinCalzar: cruce.sinCalzar.length,
        desfaseHoras: cruce.desfaseHoras,
        desfaseSegun: cruce.desfaseSegun,
        camposCompletados: Object.entries(cruce.camposCompletados).map(
          ([campo, n]) => `${campo}: ${n}`,
        ),
      },
    };
  }

  /*
   * Misma fuente o primera carga: este archivo define el conjunto. Reimportar
   * un archivo corregido reemplaza el anterior en vez de duplicarlo.
   */
  if (deEstaFuente.length > 0) {
    await supabase
      .from("publicaciones_base")
      .delete()
      .eq("linea_base_id", lineaBaseId)
      .eq("plataforma", leido.plataforma)
      .eq("fuente", leido.fuente);

    advertencias.push(
      "Se reemplazaron las publicaciones que ya estaban de esta misma fuente. Si habías completado campos con la otra exportación, vuelve a subirla.",
    );
  }

  const { error, count } = await supabase
    .from("publicaciones_base")
    .insert(
      delMes.map((p) => aFilaBase(p, lineaBaseId)),
      { count: "exact" },
    );

  if (error) return { ok: false, mensaje: error.message };

  revalidatePath("/base");
  revalidatePath("/panel");
  revalidatePath("/registro");

  return {
    ok: true,
    mensaje: `Se importaron ${count ?? delMes.length} publicaciones de ${leido.plataforma}.`,
    detalle: {
      ...comun,
      modo: deEstaFuente.length > 0 ? "reemplazo" : "canonica",
      insertadas: count ?? delMes.length,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Importar el histórico desde la hoja REGISTRO del Excel              */
/* ------------------------------------------------------------------ */

export interface ResultadoHistorico extends Resultado {
  detalle?: {
    insertadas: number;
    omitidas: number;
    reemplazadas: number;
    descartadas: { filaExcel: number; motivo: string; detalle: string }[];
    correcciones: { motivo: string; veces: number }[];
    desde: string;
    hasta: string;
    dias: number;
  };
}

/** Identidad de una fila por su contenido, para no importar dos veces lo mismo. */
function huella(f: {
  fecha: string;
  plataforma: string;
  categoria: string | null;
  publicaciones: number;
  alcance: number | null;
  visualizaciones: number | null;
  interacciones: number | null;
  nuevos_seguidores: number | null;
  visitas_perfil: number | null;
  vistas_seguidores: number | null;
  vistas_no_seguidores: number | null;
}): string {
  return [
    f.fecha,
    f.plataforma,
    f.categoria ?? "",
    f.publicaciones,
    f.alcance ?? "",
    f.visualizaciones ?? "",
    f.interacciones ?? "",
    f.nuevos_seguidores ?? "",
    f.visitas_perfil ?? "",
    f.vistas_seguidores ?? "",
    f.vistas_no_seguidores ?? "",
  ].join("|");
}

export async function importarRegistroHistorico(
  _previo: ResultadoHistorico | null,
  fd: FormData,
): Promise<ResultadoHistorico> {
  const { usuarioId } = await exigirSesion();

  const archivo = fd.get("archivo");
  const reemplazar = fd.get("reemplazar") === "on";

  if (!(archivo instanceof File) || archivo.size === 0) {
    return { ok: false, mensaje: "Elige el Excel de KPIs." };
  }

  let leido;
  try {
    leido = leerRegistroExcel(await archivo.arrayBuffer());
  } catch (e) {
    return {
      ok: false,
      mensaje: e instanceof Error ? e.message : "No pude leer el Excel.",
    };
  }

  if (leido.filas.length === 0) {
    return {
      ok: false,
      mensaje: "La hoja de registro no tiene ninguna fila que se pueda importar.",
    };
  }

  const desde = leido.fechas[0];
  const hasta = leido.fechas.at(-1)!;
  const supabase = await supabaseServidor();

  let reemplazadas = 0;
  let aInsertar = leido.filas;
  let omitidas = 0;

  if (reemplazar) {
    // Borra solo los días que trae el archivo, no todo el histórico.
    const { data: borradas } = await supabase
      .from("registros")
      .delete()
      .in("fecha", leido.fechas)
      .select("id");
    reemplazadas = borradas?.length ?? 0;
  } else {
    /*
     * Sin reemplazar, se omiten las filas idénticas a una que ya está. Es lo
     * que hace que importar dos veces el mismo Excel por equivocación no
     * duplique el histórico y arruine todos los promedios de esos días.
     */
    const { data: yaEstan } = await supabase
      .from("registros")
      .select(
        "fecha, plataforma, categoria, publicaciones, alcance, visualizaciones, interacciones, nuevos_seguidores, visitas_perfil, vistas_seguidores, vistas_no_seguidores",
      )
      .gte("fecha", desde)
      .lte("fecha", hasta);

    const existentes = new Set((yaEstan ?? []).map((r) => huella(r as never)));
    aInsertar = leido.filas.filter((f) => !existentes.has(huella(f)));
    omitidas = leido.filas.length - aInsertar.length;
  }

  if (aInsertar.length > 0) {
    const filas = aInsertar.map((f) => ({
      fecha: f.fecha,
      plataforma: f.plataforma,
      categoria: f.categoria,
      publicaciones: f.publicaciones,
      alcance: f.alcance,
      visualizaciones: f.visualizaciones,
      interacciones: f.interacciones,
      nuevos_seguidores: f.nuevos_seguidores,
      visitas_perfil: f.visitas_perfil,
      vistas_seguidores: f.vistas_seguidores,
      vistas_no_seguidores: f.vistas_no_seguidores,
      created_by: usuarioId,
    }));

    // En tandas, para no chocar con el límite de tamaño de la petición.
    for (let i = 0; i < filas.length; i += 200) {
      const { error } = await supabase.from("registros").insert(filas.slice(i, i + 200));
      if (error) {
        return {
          ok: false,
          mensaje: `Se cortó en la fila ${i + 1} de ${filas.length}: ${error.message}`,
        };
      }
    }
  }

  revalidatePath("/registro");
  revalidatePath("/panel");
  revalidatePath("/historico");
  revalidatePath("/perfil");

  return {
    ok: true,
    mensaje:
      aInsertar.length === 0
        ? "Todo lo que trae el Excel ya estaba cargado: no se duplicó nada."
        : `Se importaron ${aInsertar.length} filas de ${leido.fechas.length} días.`,
    detalle: {
      insertadas: aInsertar.length,
      omitidas,
      reemplazadas,
      descartadas: leido.descartadas,
      correcciones: leido.correcciones,
      desde,
      hasta,
      dias: leido.fechas.length,
    },
  };
}

export async function activarLineaBase(fd: FormData): Promise<void> {
  await exigirSesion();
  const id = String(fd.get("id") ?? "");
  if (!id) return;

  const supabase = await supabaseServidor();
  await supabase.rpc("activar_linea_base", { p_id: id });

  revalidatePath("/base");
  revalidatePath("/panel");
  revalidatePath("/registro");
}

export async function borrarLineaBase(fd: FormData): Promise<void> {
  await exigirSesion();
  const id = String(fd.get("id") ?? "");
  if (!id) return;

  const supabase = await supabaseServidor();
  await supabase.from("lineas_base").delete().eq("id", id);

  revalidatePath("/base");
  revalidatePath("/panel");
}

/** §5.2 — la clasificación automática debe poder corregirse a mano. */
export async function reclasificar(fd: FormData): Promise<void> {
  await exigirSesion();
  const id = String(fd.get("id") ?? "");
  const tipo = String(fd.get("tipo") ?? "");
  if (!id || (tipo !== "Reactivo" && tipo !== "Normal")) return;

  const supabase = await supabaseServidor();
  await supabase
    .from("publicaciones_base")
    .update({ tipo, clasificado_a_mano: true })
    .eq("id", id);

  revalidatePath("/base");
  revalidatePath("/panel");
}

/* ------------------------------------------------------------------ */
/* Reporte diario (§6)                                                 */
/* ------------------------------------------------------------------ */

export async function guardarReporte(
  _previo: Resultado | null,
  fd: FormData,
): Promise<Resultado> {
  const { usuarioId } = await exigirSesion();
  const parseado = esquemaReporte.safeParse(desdeFormData(fd));
  if (!parseado.success) return { ok: false, mensaje: primerError(parseado.error) };

  const supabase = await supabaseServidor();
  const { error } = await supabase
    .from("reportes")
    .upsert(
      { ...parseado.data, actualizado_por: usuarioId },
      { onConflict: "fecha" },
    );

  if (error) return { ok: false, mensaje: error.message };

  revalidatePath("/reporte");
  return { ok: true, mensaje: "Texto guardado." };
}

/* ------------------------------------------------------------------ */
/* Sesión                                                              */
/* ------------------------------------------------------------------ */

export async function cerrarSesion(): Promise<void> {
  const supabase = await supabaseServidor();
  await supabase.auth.signOut();
  redirect("/login");
}
