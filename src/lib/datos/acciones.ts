"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  desdeFormData,
  esquemaCliente,
  esquemaCuenta,
  esquemaRegistroPara,
  esquemaReporte,
  parsearListaHashtags,
  primerError,
} from "./esquemas";
import {
  catastroDelPeriodo,
  clientePorId,
  informeDeCliente,
  listarCuentas,
} from "./consultas";
import {
  MAXIMO_DESTINATARIOS,
  parsearDestinatarios,
} from "@/lib/correo/direcciones";
import { destinatariosReporte } from "@/lib/correo/entorno";
import { enviarCorreo } from "@/lib/correo/enviar";
import { fechaCorta, semanaDe } from "@/lib/dominio/formato";
import type { Red } from "@/lib/dominio/redes";
import {
  construirReporteCliente,
  htmlCliente,
  textoCliente,
} from "@/lib/reporte/cliente";
import {
  construirReporteSemanal,
  htmlSemanal,
  textoSemanal,
} from "@/lib/reporte/semanal";
import { urlPublica } from "@/lib/supabase/entorno";
import {
  aFilasRegistro,
  contarHashtags,
  type FilaRegistroImportada,
  fusionarConExistente,
  type RangoFechas,
  rangoDe,
} from "@/lib/importar/a-registro";
import { resolverCuenta } from "@/lib/importar/cuentas";
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
  /**
   * Fecha del registro que se acaba de guardar.
   *
   * La interfaz la necesita porque el formulario permite elegir cualquier
   * fecha, y si no es la que está filtrada abajo, la fila se guarda bien pero
   * no aparece. Sin este dato parecía que a veces guardaba y a veces no.
   */
  fecha?: string;
}

/**
 * Todas las vistas que dependen de los registros.
 *
 * Va centralizado porque estaba repetido en cada acción y se había desfasado:
 * crear o editar un registro revalidaba /registro y /panel pero no /historico
 * ni /perfil, así que esas dos quedaban mostrando datos viejos.
 */
function revalidarVistasDeRegistros(): void {
  revalidatePath("/registro");
  revalidatePath("/panel");
  revalidatePath("/catastro");
  revalidatePath("/historico");
  revalidatePath("/perfil");
  revalidatePath("/reporte");
  revalidatePath("/reporte/diario");
}

/**
 * Todas las vistas que dependen de la LÍNEA BASE.
 *
 * Es casi todo, porque la línea base es el divisor de cada variación: cambiarla
 * cambia hasta el último delta de la aplicación. Estaba repetido en cinco
 * acciones como `/base` + `/panel`, así que el catastro y el reporte semanal
 * quedaban mostrando comparaciones contra una base que ya no era la activa.
 */
function revalidarVistasDeLineaBase(): void {
  revalidatePath("/base");
  revalidarVistasDeRegistros();
}

/* ------------------------------------------------------------------ */
/* Registro de publicaciones                                           */
/* ------------------------------------------------------------------ */

export async function crearRegistro(
  _previo: Resultado | null,
  fd: FormData,
): Promise<Resultado> {
  const { usuarioId } = await exigirSesion();
  /*
   * Se validan contra TODAS las cuentas, no solo las activas: editar una fila
   * vieja de una cuenta que se desactivó tiene que seguir funcionando. Que el
   * formulario ofrezca solo las activas es cosa del formulario.
   */
  const esquema = esquemaRegistroPara(await listarCuentas());
  const parseado = esquema.safeParse(desdeFormData(fd));

  if (!parseado.success) {
    return { ok: false, mensaje: primerError(parseado.error) };
  }

  const supabase = await supabaseServidor();
  const { error } = await supabase
    .from("registros")
    .insert({ ...parseado.data, created_by: usuarioId });

  if (error) return { ok: false, mensaje: error.message };

  revalidarVistasDeRegistros();
  return { ok: true, mensaje: "Registro guardado.", fecha: parseado.data.fecha };
}

export async function actualizarRegistro(
  _previo: Resultado | null,
  fd: FormData,
): Promise<Resultado> {
  await exigirSesion();
  const id = String(fd.get("id") ?? "");
  if (!id) return { ok: false, mensaje: "Falta el identificador del registro." };

  const esquema = esquemaRegistroPara(await listarCuentas());
  const parseado = esquema.safeParse(desdeFormData(fd));
  if (!parseado.success) {
    return { ok: false, mensaje: primerError(parseado.error) };
  }

  const supabase = await supabaseServidor();
  const { error } = await supabase.from("registros").update(parseado.data).eq("id", id);
  if (error) return { ok: false, mensaje: error.message };

  revalidarVistasDeRegistros();
  return { ok: true, mensaje: "Cambios guardados.", fecha: parseado.data.fecha };
}

export async function borrarRegistro(fd: FormData): Promise<void> {
  await exigirSesion();
  const id = String(fd.get("id") ?? "");
  if (!id) return;

  const supabase = await supabaseServidor();
  await supabase.from("registros").delete().eq("id", id);

  revalidarVistasDeRegistros();
}

/* ------------------------------------------------------------------ */
/* Importación de línea base (§5)                                      */
/* ------------------------------------------------------------------ */

export interface DetalleImport {
  /** Nombre de la cuenta a la que se resolvió el archivo. */
  cuenta: string;
  red: Red;
  /** El perfil tal como venía rotulado en el archivo. */
  usuarioArchivo: string | null;
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

/*
 * `plataforma` no se escribe: la llena el trigger de sincronización a partir de
 * `cuenta_id`, y solo cuando la cuenta es una de las cinco originales. Ponerla
 * acá obligaría a inventar un valor para la cuenta de un influencer.
 */
function aFilaBase(p: PublicacionImportada, lineaBaseId: string, cuentaId: string) {
  return {
    linea_base_id: lineaBaseId,
    cuenta_id: cuentaId,
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

  // A qué cuenta corresponde el archivo. Antes salía de un enum de cinco
  // valores; ahora se busca por el @usuario, así que funciona con cualquiera.
  const resuelta = resolverCuenta(await listarCuentas(), leido.detectada);
  if (!resuelta.ok) {
    return { ok: false, mensaje: resuelta.motivo };
  }
  const cuenta = resuelta.cuenta;

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
    .eq("cuenta_id", cuenta.id);

  if (errorLeer) return { ok: false, mensaje: errorLeer.message };

  const previas = (yaCargadas ?? []) as unknown as PublicacionBaseRow[];
  const deEstaFuente = previas.filter((p) => p.fuente === leido.fuente);
  const deOtraFuente = previas.filter((p) => p.fuente !== leido.fuente);

  const advertencias = [...leido.advertencias];
  const comun: DetalleImport = {
    cuenta: cuenta.nombre,
    red: cuenta.red,
    usuarioArchivo: leido.cuenta,
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

    revalidarVistasDeLineaBase();

    return {
      ok: true,
      mensaje: `Se completaron ${cruce.enriquecimientos.length} publicaciones de ${cuenta.nombre} con los datos de este archivo.`,
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
      .eq("cuenta_id", cuenta.id)
      .eq("fuente", leido.fuente);

    advertencias.push(
      "Se reemplazaron las publicaciones que ya estaban de esta misma fuente. Si habías completado campos con la otra exportación, vuelve a subirla.",
    );
  }

  const { error, count } = await supabase
    .from("publicaciones_base")
    .insert(
      delMes.map((p) => aFilaBase(p, lineaBaseId, cuenta.id)),
      { count: "exact" },
    );

  if (error) return { ok: false, mensaje: error.message };

  revalidarVistasDeLineaBase();

  return {
    ok: true,
    mensaje: `Se importaron ${count ?? delMes.length} publicaciones de ${cuenta.nombre}.`,
    detalle: {
      ...comun,
      modo: deEstaFuente.length > 0 ? "reemplazo" : "canonica",
      insertadas: count ?? delMes.length,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Importar publicaciones directo al registro                          */
/* ------------------------------------------------------------------ */

export interface DetalleImportRegistro {
  cuenta: string;
  red: Red;
  usuarioArchivo: string | null;
  fuente: string;
  insertadas: number;
  actualizadas: number;
  sinFecha: number;
  fueraDeRango: number;
  repetidasEnArchivo: number;
  desde: string;
  hasta: string;
  hashtags: { hashtag: string | null; n: number }[];
  advertencias: string[];
}

export interface ResultadoImportRegistro extends Resultado {
  detalle?: DetalleImportRegistro;
}

/** Cuántas filas van por petición al insertar: el límite es el tamaño del cuerpo. */
const TANDA_ESCRITURA = 200;

/**
 * Cuántas actualizaciones se piden a la vez.
 *
 * PostgREST no puede actualizar muchas filas con valores distintos en una sola
 * petición, así que va una por fila. En serie, doscientas actualizaciones
 * tardarían más de lo que una función de Vercel puede esperar; de a veinte en
 * paralelo el lote entero se resuelve en un par de segundos.
 */
const ACTUALIZACIONES_EN_PARALELO = 20;

type SupabaseServidor = Awaited<ReturnType<typeof supabaseServidor>>;

interface ResultadoEscritura {
  escritas: number;
  fallidas: { titulo: string; motivo: string }[];
}

/** Con qué nombre se reporta una fila que no se pudo escribir. */
function rotularFila(fila: Record<string, unknown>): string {
  const titulo = fila.titulo_contenido;
  if (typeof titulo === "string" && titulo) return titulo.slice(0, 60);
  return String(fila.id_externo ?? fila.fecha ?? "sin título");
}

/**
 * Inserta en tandas y, si una tanda falla, reintenta fila por fila.
 *
 * El reintento no es un lujo. Antes, un solo caracter inválido en un caption
 * tumbaba la tanda entera: de 398 publicaciones entraban 200 y se perdían 198,
 * con un mensaje —"se cortó en la fila 201"— que no dejaba claro que las
 * primeras 200 sí habían quedado. Ahora falla solo la fila que está mal y se
 * dice cuál.
 */
async function insertarEnTandas(
  supabase: SupabaseServidor,
  filas: readonly Record<string, unknown>[],
): Promise<ResultadoEscritura> {
  let escritas = 0;
  const fallidas: ResultadoEscritura["fallidas"] = [];

  for (let i = 0; i < filas.length; i += TANDA_ESCRITURA) {
    const lote = filas.slice(i, i + TANDA_ESCRITURA);
    const { error } = await supabase.from("registros").insert(lote);

    if (!error) {
      escritas += lote.length;
      continue;
    }

    // La tanda falló: se reintenta una por una para aislar la culpable.
    for (const fila of lote) {
      const { error: suyo } = await supabase.from("registros").insert([fila]);
      if (suyo) fallidas.push({ titulo: rotularFila(fila), motivo: suyo.message });
      else escritas += 1;
    }
  }

  return { escritas, fallidas };
}

/**
 * Actualiza las publicaciones que ya estaban cargadas.
 *
 * Va con UPDATE y no con `upsert`, y eso es la corrección de un error que
 * rompió la reimportación de julio. Un `upsert` en Postgres es
 * `INSERT ... ON CONFLICT`, y TODO insert tiene que cumplir la política de
 * escritura de `registros`, que exige `created_by = auth.uid()`. Estas filas no
 * llevan `created_by` —su autor es quien las cargó la primera vez— así que las
 * doscientas se rechazaban con "new row violates row-level security policy".
 *
 * Con UPDATE, además, el autor original queda intacto: la trazabilidad de §2
 * dice quién cargó cada publicación, no quién la reimportó.
 */
async function actualizarEnParalelo(
  supabase: SupabaseServidor,
  filas: readonly { id: string; datos: Record<string, unknown> }[],
): Promise<ResultadoEscritura> {
  let escritas = 0;
  const fallidas: ResultadoEscritura["fallidas"] = [];

  for (let i = 0; i < filas.length; i += ACTUALIZACIONES_EN_PARALELO) {
    const lote = filas.slice(i, i + ACTUALIZACIONES_EN_PARALELO);

    const resultados = await Promise.all(
      lote.map(async ({ id, datos }) => {
        const { error } = await supabase.from("registros").update(datos).eq("id", id);
        return { datos, error };
      }),
    );

    for (const { datos, error } of resultados) {
      if (error) fallidas.push({ titulo: rotularFila(datos), motivo: error.message });
      else escritas += 1;
    }
  }

  return { escritas, fallidas };
}

/**
 * §5.1 + catastro semanal — sube la exportación y el registro se llena solo.
 *
 * Una fila por publicación, con su hashtag y su formato ya deducidos. Es lo que
 * antes se copiaba a mano publicación por publicación desde Meta o Iconosquare.
 *
 * Es idempotente: la identidad de una publicación es (cuenta, id_externo), así
 * que subir dos veces el mismo archivo actualiza en vez de duplicar. Eso
 * importa más de lo que parece — una exportación duplicada partiría en dos
 * todos los promedios del día, que es exactamente el tipo de error silencioso
 * que tenía el Excel.
 */
export async function importarPublicaciones(
  _previo: ResultadoImportRegistro | null,
  fd: FormData,
): Promise<ResultadoImportRegistro> {
  const { usuarioId } = await exigirSesion();

  const archivo = fd.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) {
    return { ok: false, mensaje: "Elige un archivo para importar." };
  }

  const rango: RangoFechas = {};
  const desdePedido = String(fd.get("desde") ?? "").trim();
  const hastaPedido = String(fd.get("hasta") ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(desdePedido)) rango.desde = desdePedido;
  if (/^\d{4}-\d{2}-\d{2}$/.test(hastaPedido)) rango.hasta = hastaPedido;
  if (rango.desde && rango.hasta && rango.desde > rango.hasta) {
    return { ok: false, mensaje: "El desde es posterior al hasta." };
  }

  let leido;
  try {
    leido = leerArchivo(archivo.name, await archivo.arrayBuffer());
  } catch (e) {
    return {
      ok: false,
      mensaje: e instanceof Error ? e.message : "No pude leer el archivo.",
    };
  }

  const resuelta = resolverCuenta(await listarCuentas(), leido.detectada);
  if (!resuelta.ok) return { ok: false, mensaje: resuelta.motivo };
  const cuenta = resuelta.cuenta;

  if (!cuenta.activa) {
    return {
      ok: false,
      mensaje: `La cuenta ${cuenta.nombre} está desactivada. Reactívala en Cuentas si quieres volver a cargarle publicaciones.`,
    };
  }

  const conversion = aFilasRegistro(leido.publicaciones, cuenta, rango);
  if (conversion.filas.length === 0) {
    const motivo =
      conversion.fueraDeRango > 0
        ? "Todas sus publicaciones quedaron fuera del rango de fechas que pediste."
        : "No trae ninguna publicación con fecha.";
    return {
      ok: false,
      mensaje: `${motivo} Meses que trae el archivo: ${leido.meses.join(", ") || "ninguno"}.`,
    };
  }

  const supabase = await supabaseServidor();

  /*
   * Qué publicaciones de este archivo YA están cargadas. La identidad es el
   * id_externo dentro de la cuenta: el mismo video subido a TikTok y a
   * Instagram tiene dos identificadores distintos y son dos filas, que es
   * justamente lo que el catastro tiene que mostrar por separado.
   */
  const ids = conversion.filas
    .map((f) => f.id_externo)
    .filter((v): v is string => v !== null);

  const yaEstan = new Map<string, { id: string } & Partial<FilaRegistroImportada>>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabase
      .from("registros")
      .select(
        "id, id_externo, categoria, tipo, hashtag, alcance, visualizaciones, interacciones, nuevos_seguidores, titulo_contenido, enlace",
      )
      .eq("cuenta_id", cuenta.id)
      .in("id_externo", ids.slice(i, i + 200));

    if (error) return { ok: false, mensaje: error.message };
    for (const fila of data ?? []) {
      const r = fila as { id: string; id_externo: string | null };
      if (r.id_externo) yaEstan.set(r.id_externo, r as never);
    }
  }

  const nuevas: Record<string, unknown>[] = [];
  const existentes: { id: string; datos: Record<string, unknown> }[] = [];

  for (const fila of conversion.filas) {
    const previa = fila.id_externo ? yaEstan.get(fila.id_externo) : undefined;
    if (previa) {
      /*
       * `created_by` no va: la fila ya tiene autor y es quien la cargó la
       * primera vez. Mandarlo reasignaría la autoría del registro.
       */
      existentes.push({
        id: previa.id,
        datos: { ...fusionarConExistente(previa, fila) },
      });
    } else {
      nuevas.push({ ...fila, created_by: usuarioId });
    }
  }

  const puestas = await insertarEnTandas(supabase, nuevas);
  const refrescadas = await actualizarEnParalelo(supabase, existentes);
  const fallidas = [...puestas.fallidas, ...refrescadas.fallidas];

  revalidarVistasDeRegistros();

  const extremos = rangoDe(conversion.filas)!;
  const hashtags = contarHashtags(conversion.filas);
  const series = hashtags.filter((h) => h.hashtag !== null).length;

  /*
   * El aviso va en el mensaje principal y no entre las advertencias: si algo no
   * se pudo cargar, la persona tiene que enterarse antes de dar el archivo por
   * subido. Antes decía "se cortó en la fila 201" y no quedaba claro que las
   * 200 anteriores sí habían entrado.
   */
  const base =
    refrescadas.escritas === 0
      ? `Se cargaron ${puestas.escritas} publicaciones de ${cuenta.nombre}.`
      : `Se cargaron ${puestas.escritas} publicaciones nuevas de ${cuenta.nombre} y se actualizaron ${refrescadas.escritas} que ya estaban.`;

  return {
    ok: true,
    mensaje:
      fallidas.length === 0
        ? base
        : `${base} ${fallidas.length} ${
            fallidas.length === 1 ? "no se pudo cargar" : "no se pudieron cargar"
          }: ${fallidas[0].motivo}. Vuelve a subir el archivo — no duplica nada y completa lo que falte.`,
    fecha: extremos.hasta,
    detalle: {
      cuenta: cuenta.nombre,
      red: cuenta.red,
      usuarioArchivo: leido.cuenta,
      fuente: leido.fuente,
      insertadas: puestas.escritas,
      actualizadas: refrescadas.escritas,
      sinFecha: conversion.sinFecha,
      fueraDeRango: conversion.fueraDeRango,
      repetidasEnArchivo: conversion.repetidasEnArchivo,
      desde: extremos.desde,
      hasta: extremos.hasta,
      hashtags,
      advertencias: [
        ...leido.advertencias,
        ...fallidas.map(
          (f) => `No se pudo cargar "${f.titulo}": ${f.motivo}`,
        ),
        ...(series === 0
          ? [
              "Ninguna de estas publicaciones trae hashtag en su texto, así que el catastro semanal las agrupará todas juntas. Puedes ponérselo a mano desde la tabla.",
            ]
          : []),
      ],
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

    const puestas = await insertarEnTandas(supabase, filas);
    if (puestas.fallidas.length > 0) {
      revalidarVistasDeRegistros();
      return {
        ok: false,
        mensaje: `Se cargaron ${puestas.escritas} de ${filas.length} filas. Las otras ${puestas.fallidas.length} no: ${puestas.fallidas[0].motivo}`,
      };
    }
  }

  revalidarVistasDeRegistros();

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

/* ------------------------------------------------------------------ */
/* Envío del reporte semanal por correo                                */
/* ------------------------------------------------------------------ */

export interface ResultadoEnvioReporte extends Resultado {
  /** Direcciones a las que se mandó, para confirmarlo en pantalla. */
  destinatarios?: string[];
}

/**
 * Manda el reporte semanal por correo.
 *
 * El HTML se vuelve a generar acá, en el servidor, a partir de la semana. NO se
 * acepta el HTML del formulario, aunque la página ya lo tenga armado: si se
 * aceptara, cualquiera con sesión podría mandar el contenido que quisiera desde
 * la dirección de correo de la empresa. Lo único que viaja del navegador es qué
 * semana enviar.
 */
export async function enviarReporteSemanal(
  _previo: ResultadoEnvioReporte | null,
  fd: FormData,
): Promise<ResultadoEnvioReporte> {
  const { usuarioId } = await exigirSesion();

  const pedida = String(fd.get("semana") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(pedida)) {
    return { ok: false, mensaje: "No reconocí la semana que hay que enviar." };
  }
  // Se normaliza al lunes: es la clave con la que se registra el envío.
  const semana = semanaDe(pedida);

  let para: string[];
  try {
    para = destinatariosReporte();
  } catch (e) {
    return { ok: false, mensaje: e instanceof Error ? e.message : "Sin destinatarios." };
  }

  const catastro = await catastroDelPeriodo(semana.desde, semana.hasta);
  const reporte = construirReporteSemanal(catastro);

  /*
   * Un correo vacío es peor que no mandar nada: el jefe abre un reporte que
   * dice que no se publicó nada y hay que explicarle que en realidad faltaba
   * cargar los datos.
   */
  if (!reporte.hayDatos) {
    return {
      ok: false,
      mensaje:
        "Esta semana no tiene publicaciones cargadas, así que el correo saldría vacío. Carga las exportaciones antes de enviarlo.",
    };
  }

  const asunto = `Catastro semanal de distribución · ${reporte.periodo}`;

  const envio = await enviarCorreo({
    para,
    asunto,
    html: htmlSemanal(reporte, { urlBase: urlPublica() }),
    texto: textoSemanal(reporte),
  });

  if (!envio.ok) return { ok: false, mensaje: envio.mensaje };

  /*
   * El correo ya salió. Si el registro falla, el envío NO se deshace: se avisa
   * y se sigue. Devolver un error acá haría que alguien lo mande de nuevo
   * pensando que no salió, y los jefes recibirían el reporte dos veces.
   */
  const supabase = await supabaseServidor();
  const { error } = await supabase.from("envios_reporte").insert({
    semana: semana.desde,
    destinatarios: para,
    asunto,
    id_mensaje: envio.id ?? null,
    enviado_por: usuarioId,
  });

  revalidatePath("/reporte");

  if (error) {
    console.error("El correo salió pero no pude registrarlo:", error.message);
    return {
      ok: true,
      destinatarios: para,
      mensaje: `${envio.mensaje} No pude dejar constancia del envío en la base, así que no va a aparecer en el historial.`,
    };
  }

  return { ok: true, mensaje: envio.mensaje, destinatarios: para };
}

export async function activarLineaBase(fd: FormData): Promise<void> {
  await exigirSesion();
  const id = String(fd.get("id") ?? "");
  if (!id) return;

  const supabase = await supabaseServidor();
  await supabase.rpc("activar_linea_base", { p_id: id });

  revalidarVistasDeLineaBase();
}

export async function borrarLineaBase(fd: FormData): Promise<void> {
  await exigirSesion();
  const id = String(fd.get("id") ?? "");
  if (!id) return;

  const supabase = await supabaseServidor();
  await supabase.from("lineas_base").delete().eq("id", id);

  revalidarVistasDeLineaBase();
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

  revalidarVistasDeLineaBase();
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

  // Los textos libres solo viven en el reporte diario; el semanal no los usa.
  revalidatePath("/reporte/diario");
  return { ok: true, mensaje: "Texto guardado." };
}

/* ------------------------------------------------------------------ */
/* Sesión                                                              */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* Cuentas                                                             */
/* ------------------------------------------------------------------ */

/** Las cuentas aparecen en todas las vistas, así que se revalidan todas. */
function revalidarVistasDeCuentas(): void {
  revalidatePath("/cuentas");
  revalidarVistasDeLineaBase();
}

/** El nombre es único en la base; el error crudo de Postgres no se entiende. */
function mensajeDeCuenta(error: { code?: string; message: string }): string {
  if (error.code === "23505") {
    return "Ya existe una cuenta con ese nombre. Usa uno distinto para poder distinguirlas en los reportes.";
  }
  return error.message;
}

export async function crearCuenta(
  _previo: Resultado | null,
  fd: FormData,
): Promise<Resultado> {
  await exigirSesion();
  const parseado = esquemaCuenta.safeParse(desdeFormData(fd));
  if (!parseado.success) return { ok: false, mensaje: primerError(parseado.error) };

  const supabase = await supabaseServidor();
  const { error } = await supabase.from("cuentas").insert(parseado.data);
  if (error) return { ok: false, mensaje: mensajeDeCuenta(error) };

  revalidarVistasDeCuentas();
  return { ok: true, mensaje: `Cuenta ${parseado.data.nombre} creada.` };
}

export async function actualizarCuenta(
  _previo: Resultado | null,
  fd: FormData,
): Promise<Resultado> {
  await exigirSesion();
  const id = String(fd.get("id") ?? "");
  if (!id) return { ok: false, mensaje: "Falta el identificador de la cuenta." };

  const parseado = esquemaCuenta.safeParse(desdeFormData(fd));
  if (!parseado.success) return { ok: false, mensaje: primerError(parseado.error) };

  const supabase = await supabaseServidor();
  const { error } = await supabase.from("cuentas").update(parseado.data).eq("id", id);
  if (error) return { ok: false, mensaje: mensajeDeCuenta(error) };

  revalidarVistasDeCuentas();
  return { ok: true, mensaje: "Cambios guardados." };
}

/**
 * Una cuenta que se deja de usar se desactiva, no se borra: sus registros
 * históricos tienen que seguir existiendo y hay que poder rotularlos. Por eso
 * no hay acción de borrado.
 */
export async function alternarCuentaActiva(fd: FormData): Promise<void> {
  await exigirSesion();
  const id = String(fd.get("id") ?? "");
  const activar = fd.get("activar") === "true";
  if (!id) return;

  const supabase = await supabaseServidor();
  await supabase.from("cuentas").update({ activa: activar }).eq("id", id);

  revalidarVistasDeCuentas();
}

/* ------------------------------------------------------------------ */
/* Envío del informe de un cliente por correo                          */
/* ------------------------------------------------------------------ */

/**
 * Manda el informe de un cliente por correo, a quien se escriba en el campo.
 *
 * El destinatario va abierto y no fijo como en el reporte semanal: el informe
 * se le manda a alguien del equipo para que lo reenvíe a quien corresponda, y
 * eso cambia según el cliente y la ocasión. `REPORTE_DESTINATARIOS` queda como
 * el valor que viene propuesto en el campo.
 *
 * Las direcciones se vuelven a validar acá aunque el formulario ya lo haya
 * hecho: el navegador puede mandar cualquier cosa, y detrás de este botón está
 * la dirección de correo de la empresa.
 *
 * El informe también se vuelve a generar acá a partir del cliente y el período.
 * No se acepta el HTML del formulario: si se aceptara, cualquiera con sesión
 * podría mandar el contenido que quisiera desde el correo de DLT.
 */
export async function enviarInformeCliente(
  _previo: ResultadoEnvioReporte | null,
  fd: FormData,
): Promise<ResultadoEnvioReporte> {
  await exigirSesion();

  const clienteId = String(fd.get("cliente") ?? "").trim();
  const desde = String(fd.get("desde") ?? "").trim();
  const hasta = String(fd.get("hasta") ?? "").trim();

  if (!clienteId) return { ok: false, mensaje: "Falta el cliente." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta)) {
    return { ok: false, mensaje: "No reconocí el período del informe." };
  }

  const escrito = String(fd.get("para") ?? "").trim();
  let para: string[];

  if (escrito === "") {
    // Campo vacío: se cae en los destinatarios configurados, si los hay.
    try {
      para = destinatariosReporte();
    } catch {
      return {
        ok: false,
        mensaje: "Escribe a quién mandárselo: el campo de destinatarios está vacío.",
      };
    }
  } else {
    const { validos, invalidos } = parsearDestinatarios(escrito);
    if (invalidos.length > 0) {
      return {
        ok: false,
        mensaje: `Esto no parece una dirección de correo: ${invalidos.join(", ")}.`,
      };
    }
    if (validos.length === 0) {
      return { ok: false, mensaje: "Escribe al menos una dirección de correo." };
    }
    if (validos.length > MAXIMO_DESTINATARIOS) {
      return {
        ok: false,
        mensaje: `Son ${validos.length} destinatarios y el máximo es ${MAXIMO_DESTINATARIOS}. Mándaselo a una persona del equipo y que ella lo reenvíe.`,
      };
    }
    para = validos;
  }

  const cliente = await clientePorId(clienteId);
  if (!cliente) return { ok: false, mensaje: "Ese cliente ya no existe." };

  const { informe, base } = await informeDeCliente(cliente, desde, hasta);

  /*
   * Un informe vacío es peor que no mandar nada: el que lo recibe lee que el
   * cliente no publicó y hay que explicarle que faltaba cargar los datos.
   */
  if (!informe.hayDatos) {
    return {
      ok: false,
      mensaje: `No hay publicaciones de ${cliente.nombre} en ese período, así que el correo saldría vacío.`,
    };
  }

  const reporte = construirReporteCliente(informe, base?.mes ?? null);
  const periodo = `${fechaCorta(desde)} al ${fechaCorta(hasta)}`;

  const envio = await enviarCorreo({
    para,
    asunto: `Informe de distribución · ${cliente.nombre} · ${periodo}`,
    html: htmlCliente(reporte, { urlBase: urlPublica() }),
    texto: textoCliente(reporte),
  });

  if (!envio.ok) return { ok: false, mensaje: envio.mensaje };

  revalidatePath("/informe");
  return { ok: true, mensaje: envio.mensaje, destinatarios: para };
}

/* ------------------------------------------------------------------ */
/* Clientes                                                            */
/* ------------------------------------------------------------------ */

function revalidarVistasDeClientes(): void {
  revalidatePath("/clientes");
  revalidatePath("/informe");
}

export interface ResultadoCliente extends Resultado {
  /** Los hashtags que quedaron guardados, ya normalizados. */
  hashtags?: string[];
}

/**
 * Crea un cliente con su lista de hashtags.
 *
 * Las dos cosas van en la misma acción porque un cliente sin hashtags no sirve
 * para nada: su informe saldría vacío. Guardarlos en dos pasos dejaría clientes
 * a medio configurar sin que se note.
 */
export async function crearCliente(
  _previo: ResultadoCliente | null,
  fd: FormData,
): Promise<ResultadoCliente> {
  await exigirSesion();

  const parseado = esquemaCliente.safeParse(desdeFormData(fd));
  if (!parseado.success) return { ok: false, mensaje: primerError(parseado.error) };

  const hashtags = parsearListaHashtags(String(fd.get("hashtags") ?? ""));
  if (hashtags.length === 0) {
    return {
      ok: false,
      mensaje:
        "Escribe al menos un hashtag: es lo que define al cliente y sin eso su informe sale vacío.",
    };
  }

  const supabase = await supabaseServidor();
  const { data, error } = await supabase
    .from("clientes")
    .insert({ nombre: parseado.data.nombre, notas: parseado.data.notas })
    .select("id")
    .single<{ id: string }>();

  if (error || !data) {
    return { ok: false, mensaje: mensajeDeCliente(error ?? { message: "Sin id." }) };
  }

  const relaciones = await supabase
    .from("cliente_hashtags")
    .insert(hashtags.map((hashtag) => ({ cliente_id: data.id, hashtag })));

  if (relaciones.error) {
    /*
     * El cliente quedó creado pero sin hashtags. Se borra para no dejar un
     * cliente a medias que produzca un informe vacío sin explicación.
     */
    await supabase.from("clientes").delete().eq("id", data.id);
    return { ok: false, mensaje: relaciones.error.message };
  }

  revalidarVistasDeClientes();
  return {
    ok: true,
    mensaje: `Cliente ${parseado.data.nombre} creado con ${hashtags.length} ${
      hashtags.length === 1 ? "hashtag" : "hashtags"
    }.`,
    hashtags,
  };
}

/** El nombre es único en la base; el error crudo de Postgres no se entiende. */
function mensajeDeCliente(error: { code?: string; message: string }): string {
  if (error.code === "23505") {
    return "Ya existe un cliente con ese nombre.";
  }
  return error.message;
}

export async function actualizarCliente(
  _previo: ResultadoCliente | null,
  fd: FormData,
): Promise<ResultadoCliente> {
  await exigirSesion();

  const id = String(fd.get("id") ?? "");
  if (!id) return { ok: false, mensaje: "Falta el identificador del cliente." };

  const parseado = esquemaCliente.safeParse(desdeFormData(fd));
  if (!parseado.success) return { ok: false, mensaje: primerError(parseado.error) };

  const hashtags = parsearListaHashtags(String(fd.get("hashtags") ?? ""));
  if (hashtags.length === 0) {
    return {
      ok: false,
      mensaje: "Escribe al menos un hashtag: sin eso el informe del cliente sale vacío.",
    };
  }

  const supabase = await supabaseServidor();
  const { error } = await supabase
    .from("clientes")
    .update({
      nombre: parseado.data.nombre,
      notas: parseado.data.notas,
      activo: parseado.data.activo,
    })
    .eq("id", id);

  if (error) return { ok: false, mensaje: mensajeDeCliente(error) };

  /*
   * La lista se reemplaza entera: es lo que espera quien edita un campo de
   * texto con todos los hashtags. Se borran los que salieron y se agregan los
   * nuevos, en vez de borrar todo e insertar, para que quitar un hashtag de la
   * lista no pierda su fecha de agregado.
   */
  const { data: actuales } = await supabase
    .from("cliente_hashtags")
    .select("hashtag")
    .eq("cliente_id", id);

  const previos = new Set(
    ((actuales ?? []) as { hashtag: string }[]).map((r) => r.hashtag),
  );
  const nuevos = hashtags.filter((h) => !previos.has(h));
  const sobran = [...previos].filter((h) => !hashtags.includes(h));

  if (sobran.length > 0) {
    const { error: eBorrar } = await supabase
      .from("cliente_hashtags")
      .delete()
      .eq("cliente_id", id)
      .in("hashtag", sobran);
    if (eBorrar) return { ok: false, mensaje: eBorrar.message };
  }

  if (nuevos.length > 0) {
    const { error: eInsertar } = await supabase
      .from("cliente_hashtags")
      .insert(nuevos.map((hashtag) => ({ cliente_id: id, hashtag })));
    if (eInsertar) return { ok: false, mensaje: eInsertar.message };
  }

  revalidarVistasDeClientes();

  const cambios: string[] = [];
  if (nuevos.length > 0) cambios.push(`${nuevos.length} agregados`);
  if (sobran.length > 0) cambios.push(`${sobran.length} quitados`);

  return {
    ok: true,
    mensaje:
      cambios.length > 0
        ? `Cambios guardados · hashtags: ${cambios.join(", ")}.`
        : "Cambios guardados.",
    hashtags,
  };
}

/**
 * Un cliente que se deja de atender se desactiva, no se borra: sus informes
 * históricos tienen que seguir siendo reproducibles.
 */
export async function alternarClienteActivo(fd: FormData): Promise<void> {
  await exigirSesion();
  const id = String(fd.get("id") ?? "");
  const activar = fd.get("activar") === "true";
  if (!id) return;

  const supabase = await supabaseServidor();
  await supabase.from("clientes").update({ activo: activar }).eq("id", id);

  revalidarVistasDeClientes();
}

/* ------------------------------------------------------------------ */
/* Sesión                                                              */
/* ------------------------------------------------------------------ */

export async function cerrarSesion(): Promise<void> {
  const supabase = await supabaseServidor();
  await supabase.auth.signOut();
  redirect("/login");
}
