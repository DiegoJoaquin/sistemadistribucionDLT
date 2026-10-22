import "server-only";

/**
 * Lecturas del global de marcas.
 *
 * El reconocimiento no se guarda: se calcula al leer con las señales vigentes
 * (`dominio/marcas`). Así una arroba agregada hoy cuenta también lo importado
 * en enero, y lo que se sube cada semana entra al conteo apenas se importa.
 */

import {
  type Marca,
  type PiezaManual,
  type PublicacionMarca,
  type Senal,
  senalesDe,
  type TipoSenal,
} from "@/lib/dominio/marcas";
import { supabaseServidor } from "@/lib/supabase/servidor";
import type { CuentaRow } from "@/lib/supabase/tipos-db";

export interface MarcaRow extends Marca {
  notas: string | null;
  creado_en: string;
}

/** Todas las marcas con sus señales, ordenadas por nombre. */
export async function listarMarcas(): Promise<MarcaRow[]> {
  const supabase = await supabaseServidor();

  const [marcas, senales] = await Promise.all([
    supabase.from("marcas").select("id, nombre, notas, activa, creado_en").order("nombre"),
    supabase.from("marca_senales").select("marca_id, tipo, valor"),
  ]);

  if (marcas.error) throw new Error(`No pude leer las marcas: ${marcas.error.message}`);
  if (senales.error) throw new Error(`No pude leer las señales de las marcas: ${senales.error.message}`);

  const porMarca = new Map<string, Senal[]>();
  for (const s of (senales.data ?? []) as { marca_id: string; tipo: TipoSenal; valor: string }[]) {
    const lista = porMarca.get(s.marca_id);
    const senal = { tipo: s.tipo, valor: s.valor };
    if (lista) lista.push(senal);
    else porMarca.set(s.marca_id, [senal]);
  }

  return (
    (marcas.data ?? []) as { id: string; nombre: string; notas: string | null; activa: boolean; creado_en: string }[]
  ).map((m) => ({ ...m, senales: porMarca.get(m.id) ?? [] }));
}

/** Cuántas filas se piden por vuelta al paginar. */
const TANDA = 1_000;

interface FilaMarca {
  id: string;
  fecha: string;
  cuenta_id: string;
  categoria: string | null;
  hashtag: string | null;
  titulo_contenido: string | null;
  texto: string | null;
  campanas: string | null;
  enlace: string | null;
}

/**
 * Las publicaciones del rango con sus señales ya extraídas.
 *
 * Pide solo lo que el global usa. Con el texto completo de un año de todas las
 * cuentas son unos megas, así que se pagina igual que el resto de las vistas
 * de rango largo.
 *
 * Lo importado antes de que existiera la columna `texto` solo tiene el título
 * recortado: se lee igual —es mejor que nada— y se marca, para que la vista
 * avise que puede faltar alguna marca hasta que se reimporte.
 */
export async function publicacionesConMarcas(
  desde: string,
  hasta: string,
  indice: Map<string, CuentaRow>,
): Promise<PublicacionMarca[]> {
  const supabase = await supabaseServidor();
  const salida: PublicacionMarca[] = [];

  for (let inicio = 0; ; inicio += TANDA) {
    const { data, error } = await supabase
      .from("registros")
      .select("id, fecha, cuenta_id, categoria, hashtag, titulo_contenido, texto, campanas, enlace")
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .order("fecha", { ascending: true })
      .order("id", { ascending: true })
      .range(inicio, inicio + TANDA - 1);

    if (error) throw new Error(`No pude leer los registros: ${error.message}`);

    const tanda = (data ?? []) as FilaMarca[];
    for (const r of tanda) {
      const cuenta = indice.get(r.cuenta_id);
      if (!cuenta) continue;
      salida.push({
        id: r.id,
        fecha: r.fecha,
        cuentaId: cuenta.id,
        cuenta: cuenta.nombre,
        red: cuenta.red,
        esInfluencer: cuenta.es_influencer,
        categoria: r.categoria,
        titulo: r.titulo_contenido,
        enlace: r.enlace,
        textoCompleto: r.texto !== null,
        senales: senalesDe(r.texto ?? r.titulo_contenido, r.campanas, r.hashtag),
      });
    }

    if (tanda.length < TANDA || salida.length >= 200_000) return salida;
  }
}

interface FilaManual {
  id: string;
  marca_id: string;
  fecha: string;
  cuenta_id: string | null;
  formato: string | null;
  descripcion: string;
  enlace: string | null;
  cantidad: number;
}

/** Las piezas cargadas a mano en el rango, con su cuenta resuelta. */
export async function piezasManuales(
  desde: string,
  hasta: string,
  indice: Map<string, CuentaRow>,
): Promise<PiezaManual[]> {
  const supabase = await supabaseServidor();
  const { data, error } = await supabase
    .from("marca_piezas_manuales")
    .select("id, marca_id, fecha, cuenta_id, formato, descripcion, enlace, cantidad")
    .gte("fecha", desde)
    .lte("fecha", hasta)
    .order("fecha", { ascending: true })
    .limit(5_000);

  if (error) throw new Error(`No pude leer las piezas cargadas a mano: ${error.message}`);

  return ((data ?? []) as FilaManual[]).map((r) => {
    const cuenta = r.cuenta_id ? indice.get(r.cuenta_id) : undefined;
    return {
      id: r.id,
      marcaId: r.marca_id,
      fecha: r.fecha,
      cuentaId: cuenta?.id ?? null,
      cuenta: cuenta?.nombre ?? null,
      red: cuenta?.red ?? null,
      esInfluencer: cuenta?.es_influencer ?? false,
      formato: r.formato,
      descripcion: r.descripcion,
      enlace: r.enlace,
      cantidad: r.cantidad,
    };
  });
}
