"use server";

/**
 * Alta y edición de las marcas del global.
 *
 * Mismo patrón que los clientes: el nombre y la lista de señales van en la
 * misma acción, porque una marca sin señales sale siempre en cero y no se nota
 * por qué.
 */

import { revalidatePath } from "next/cache";
import { desdeFormData, esquemaMarca, esquemaPiezaManual, primerError } from "./esquemas";
import { parsearSenales, type Senal } from "@/lib/dominio/marcas";
import { exigirSesion, supabaseServidor } from "@/lib/supabase/servidor";

export interface ResultadoMarca {
  ok: boolean;
  mensaje?: string;
  /** Las señales que quedaron guardadas, ya normalizadas. */
  senales?: Senal[];
}

const SIN_SENALES =
  "Escribe al menos un hashtag, una arroba o una campaña: es lo que reconoce a la marca y sin eso sale siempre en cero.";

/** El nombre es único en la base; el error crudo de Postgres no se entiende. */
function mensajeDeMarca(error: { code?: string; message: string }): string {
  if (error.code === "23505") return "Ya existe una marca con ese nombre.";
  return error.message;
}

const clave = (s: Senal) => `${s.tipo}:${s.valor}`;

export async function crearMarca(_previo: ResultadoMarca | null, fd: FormData): Promise<ResultadoMarca> {
  await exigirSesion();

  const parseado = esquemaMarca.safeParse(desdeFormData(fd));
  if (!parseado.success) return { ok: false, mensaje: primerError(parseado.error) };

  const senales = parsearSenales(String(fd.get("senales") ?? ""));
  if (senales.length === 0) return { ok: false, mensaje: SIN_SENALES };

  const supabase = await supabaseServidor();
  const { data, error } = await supabase
    .from("marcas")
    .insert({ nombre: parseado.data.nombre, notas: parseado.data.notas })
    .select("id")
    .single<{ id: string }>();

  if (error || !data) return { ok: false, mensaje: mensajeDeMarca(error ?? { message: "Sin id." }) };

  const relaciones = await supabase
    .from("marca_senales")
    .insert(senales.map((s) => ({ marca_id: data.id, tipo: s.tipo, valor: s.valor })));

  if (relaciones.error) {
    // Una marca sin señales sale en cero sin explicación: mejor no dejarla.
    await supabase.from("marcas").delete().eq("id", data.id);
    return { ok: false, mensaje: relaciones.error.message };
  }

  revalidatePath("/marcas", "layout");
  return {
    ok: true,
    mensaje: `Marca ${parseado.data.nombre} creada con ${senales.length} ${senales.length === 1 ? "señal" : "señales"}.`,
    senales,
  };
}

export async function actualizarMarca(_previo: ResultadoMarca | null, fd: FormData): Promise<ResultadoMarca> {
  await exigirSesion();

  const id = String(fd.get("id") ?? "");
  if (!id) return { ok: false, mensaje: "Falta el identificador de la marca." };

  const parseado = esquemaMarca.safeParse(desdeFormData(fd));
  if (!parseado.success) return { ok: false, mensaje: primerError(parseado.error) };

  const senales = parsearSenales(String(fd.get("senales") ?? ""));
  if (senales.length === 0) return { ok: false, mensaje: SIN_SENALES };

  const supabase = await supabaseServidor();
  const { error } = await supabase
    .from("marcas")
    .update({ nombre: parseado.data.nombre, notas: parseado.data.notas, activa: parseado.data.activa })
    .eq("id", id);
  if (error) return { ok: false, mensaje: mensajeDeMarca(error) };

  /*
   * La lista se reemplaza entera, como espera quien edita el campo de texto.
   * Se borran las que salieron y se agregan las nuevas, para que las que se
   * quedan conserven su fecha de agregado.
   */
  const { data: actuales, error: eLeer } = await supabase
    .from("marca_senales")
    .select("tipo, valor")
    .eq("marca_id", id);
  if (eLeer) return { ok: false, mensaje: eLeer.message };

  const previas = new Map(((actuales ?? []) as Senal[]).map((s) => [clave(s), s]));
  const pedidas = new Set(senales.map(clave));
  const nuevas = senales.filter((s) => !previas.has(clave(s)));
  const sobran = [...previas.values()].filter((s) => !pedidas.has(clave(s)));

  for (const s of sobran) {
    const { error: eBorrar } = await supabase
      .from("marca_senales")
      .delete()
      .eq("marca_id", id)
      .eq("tipo", s.tipo)
      .eq("valor", s.valor);
    if (eBorrar) return { ok: false, mensaje: eBorrar.message };
  }

  if (nuevas.length > 0) {
    const { error: eInsertar } = await supabase
      .from("marca_senales")
      .insert(nuevas.map((s) => ({ marca_id: id, tipo: s.tipo, valor: s.valor })));
    if (eInsertar) return { ok: false, mensaje: eInsertar.message };
  }

  revalidatePath("/marcas", "layout");

  const cambios: string[] = [];
  if (nuevas.length > 0) cambios.push(`${nuevas.length} agregadas`);
  if (sobran.length > 0) cambios.push(`${sobran.length} quitadas`);
  return {
    ok: true,
    mensaje: cambios.length > 0 ? `Cambios guardados · señales: ${cambios.join(", ")}.` : "Cambios guardados.",
    senales,
  };
}

/**
 * Agrega una arroba a una marca que ya existe, desde la lista de arrobas sin
 * marca. Es el atajo para no tener que abrir la edición de la marca.
 */
export async function asignarArroba(fd: FormData): Promise<void> {
  await exigirSesion();
  const marcaId = String(fd.get("marca") ?? "");
  const arroba = String(fd.get("arroba") ?? "")
    .replace(/@/g, "")
    .trim()
    .toLowerCase();
  if (!marcaId || !arroba) return;

  const supabase = await supabaseServidor();
  await supabase
    .from("marca_senales")
    .upsert({ marca_id: marcaId, tipo: "mencion", valor: arroba }, { ignoreDuplicates: true });

  revalidatePath("/marcas", "layout");
}

/**
 * Una marca que se deja de trabajar se desactiva, no se borra: el conteo de lo
 * que ya se hizo con ella tiene que poder volver a verse.
 */
export async function alternarMarcaActiva(fd: FormData): Promise<void> {
  await exigirSesion();
  const id = String(fd.get("id") ?? "");
  const activar = fd.get("activar") === "true";
  if (!id) return;

  const supabase = await supabaseServidor();
  await supabase.from("marcas").update({ activa: activar }).eq("id", id);
  revalidatePath("/marcas", "layout");
}

/* ------------------------------------------------------------------ */
/* Piezas cargadas a mano                                              */
/* ------------------------------------------------------------------ */

export interface ResultadoPieza {
  ok: boolean;
  mensaje?: string;
}

/**
 * Suma a mano una pieza a una marca: una historia, un video sin hashtag, una
 * acción en una cuenta que no está cargada. Queda firmada por quien la cargó.
 */
export async function crearPiezaManual(_previo: ResultadoPieza | null, fd: FormData): Promise<ResultadoPieza> {
  const { usuarioId } = await exigirSesion();

  const parseado = esquemaPiezaManual.safeParse(desdeFormData(fd));
  if (!parseado.success) return { ok: false, mensaje: primerError(parseado.error) };
  const d = parseado.data;

  const supabase = await supabaseServidor();
  const { error } = await supabase.from("marca_piezas_manuales").insert({
    marca_id: d.marca_id,
    fecha: d.fecha,
    cuenta_id: d.cuenta_id,
    formato: d.formato,
    descripcion: d.descripcion,
    enlace: d.enlace,
    cantidad: d.cantidad,
    created_by: usuarioId,
  });
  if (error) return { ok: false, mensaje: error.message };

  revalidatePath("/marcas", "layout");
  return {
    ok: true,
    mensaje: `Listo: se sumó ${d.cantidad === 1 ? "1 pieza" : `${d.cantidad} piezas`} del ${d.fecha.split("-").reverse().join("-")}.`,
  };
}

/** Borra una pieza cargada a mano (las reconocidas solas no se borran: se corrige la señal). */
export async function borrarPiezaManual(fd: FormData): Promise<void> {
  await exigirSesion();
  const id = String(fd.get("id") ?? "");
  if (!id) return;
  const supabase = await supabaseServidor();
  await supabase.from("marca_piezas_manuales").delete().eq("id", id);
  revalidatePath("/marcas", "layout");
}
