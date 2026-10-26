import "server-only";

/**
 * Los espejos de una semana, leídos del registro.
 *
 * Se piden los videos desde ocho semanas antes del lunes hasta tres días
 * después del domingo: las ocho semanas previas son la referencia de lo
 * habitual de cada cuenta, y los días de borde permiten reconocer un espejo que
 * se subió el domingo en una red y el lunes en otra.
 */

import { cuentasPorId, listarCuentas } from "./consultas";
import { type Espejo, espejosDeLaSemana, FORMATOS_VIDEO, habitualPorCuenta, type PublicacionVideo } from "@/lib/dominio/espejos";
import { sumarDias } from "@/lib/dominio/formato";
import { supabaseServidor } from "@/lib/supabase/servidor";

/** Cuántas semanas antes del lunes forman lo habitual de cada cuenta. */
export const SEMANAS_DE_REFERENCIA = 8;

const TANDA = 1_000;

interface FilaVideo {
  id: string;
  fecha: string;
  publicado_en: string | null;
  cuenta_id: string;
  categoria: string | null;
  duracion_s: number | null;
  texto: string | null;
  titulo_contenido: string | null;
  visualizaciones: number | null;
  enlace: string | null;
}

export async function espejosDeSemana(desde: string, hasta: string): Promise<Espejo[]> {
  const inicio = sumarDias(desde, -7 * SEMANAS_DE_REFERENCIA);
  const fin = sumarDias(hasta, 3);

  const [cuentas, supabase] = await Promise.all([listarCuentas(), supabaseServidor()]);
  const indice = cuentasPorId(cuentas);
  const videos: PublicacionVideo[] = [];

  for (let desdeFila = 0; ; desdeFila += TANDA) {
    const { data, error } = await supabase
      .from("registros")
      .select("id, fecha, publicado_en, cuenta_id, categoria, duracion_s, texto, titulo_contenido, visualizaciones, enlace")
      .gte("fecha", inicio)
      .lte("fecha", fin)
      .in("categoria", [...FORMATOS_VIDEO])
      .order("fecha", { ascending: true })
      .order("id", { ascending: true })
      .range(desdeFila, desdeFila + TANDA - 1);

    if (error) throw new Error(`No pude leer los videos: ${error.message}`);
    const tanda = (data ?? []) as FilaVideo[];

    for (const r of tanda) {
      const cuenta = indice.get(r.cuenta_id);
      if (!cuenta) continue;
      videos.push({
        id: r.id,
        fecha: r.fecha,
        publicadoEn: r.publicado_en ? String(r.publicado_en).replace(" ", "T") : null,
        cuentaId: cuenta.id,
        cuenta: cuenta.nombre,
        red: cuenta.red,
        categoria: r.categoria,
        duracion: r.duracion_s,
        texto: r.texto ?? r.titulo_contenido,
        visualizaciones: r.visualizaciones,
        enlace: r.enlace,
      });
    }

    if (tanda.length < TANDA || videos.length >= 100_000) break;
  }

  const habitual = habitualPorCuenta(videos.filter((v) => v.fecha < desde));
  const cerca = videos.filter((v) => v.fecha >= sumarDias(desde, -3));
  return espejosDeLaSemana(cerca, habitual, desde, hasta);
}
