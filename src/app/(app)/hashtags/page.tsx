import Link from "next/link";
import { BuscadorHashtags } from "@/componentes/BuscadorHashtags";
import { type FilaPublicacion, PanelHashtags } from "@/componentes/PanelHashtags";
import { Nota, Vacio } from "@/componentes/ui";
import { cuentasPorId, listarCuentas, publicacionesConHashtags } from "@/lib/datos/consultas";
import { fechaCorta, hoyISO } from "@/lib/dominio/formato";
import {
  catalogo,
  elegidosDeLaUrl,
  esMetricaHashtag,
  evolucionHashtags,
  type Granularidad,
  granularidadSugerida,
  MAXIMO_HASHTAGS,
  type ParametrosHashtags,
  periodosDelRango,
  resumenHashtag,
} from "@/lib/dominio/hashtags";
import { SERIES } from "@/lib/dominio/paleta";
import { ordenarCuentas } from "@/lib/dominio/redes";

export const metadata = { title: "Hashtags · KPIs DLT" };

function uno(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function fecha(v: string | string[] | undefined): string | undefined {
  const s = uno(v);
  return s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined;
}

/**
 * Cuántos hashtags viajan al buscador. Las sugerencias salen de esta lista, y
 * más allá de este puesto son etiquetas usadas una o dos veces: igual se
 * pueden buscar escribiéndolas enteras.
 */
const TOPE_CATALOGO = 3_000;

export default async function PaginaHashtags(props: PageProps<"/hashtags">) {
  const sp = await props.searchParams;
  const hoy = hoyISO();

  /*
   * Por defecto, los últimos doce meses completos más el actual. La pregunta de
   * esta vista es "¿cómo viene este hashtag?", y eso se ve en meses, no en las
   * doce semanas de analítica.
   */
  const [a, m] = hoy.split("-").map(Number);
  const haceUnAnio = `${m === 12 ? a : a - 1}-${String((m % 12) + 1).padStart(2, "0")}-01`;
  const desde = fecha(sp.desde) ?? haceUnAnio;
  const hasta = fecha(sp.hasta) ?? hoy;

  const porPedido = uno(sp.por);
  const por: Granularidad =
    porPedido === "semana" || porPedido === "mes" ? porPedido : granularidadSugerida(desde, hasta);
  const metricaPedida = uno(sp.metrica);
  const metrica = esMetricaHashtag(metricaPedida) ? metricaPedida : "publicaciones";
  const elegidos = elegidosDeLaUrl(sp.h);

  const cuentas = await listarCuentas();
  const todas = await publicacionesConHashtags(desde, hasta, cuentasPorId(cuentas));

  const conActividad = ordenarCuentas(cuentas.filter((c) => todas.some((p) => p.cuentaId === c.id)));
  const cuentaPedida = uno(sp.cuenta);
  const cuenta = conActividad.some((c) => c.id === cuentaPedida) ? cuentaPedida! : null;
  const pubs = cuenta ? todas.filter((p) => p.cuentaId === cuenta) : todas;

  const parametros: ParametrosHashtags = { h: elegidos, desde, hasta, cuenta, metrica, por };

  // El color sigue al hashtag por su lugar en la comparación: el primero, azul.
  const colores = Object.fromEntries(elegidos.map((h, i) => [h, SERIES[i]]));

  const cat = catalogo(pubs).slice(0, TOPE_CATALOGO);
  const periodos = periodosDelRango(desde, hasta, por);
  const evolucion = evolucionHashtags(pubs, elegidos, metrica, periodos);
  const resumenes = elegidos.map((h) => resumenHashtag(pubs, h, metrica));

  const publicaciones: FilaPublicacion[] = pubs
    .filter((p) => elegidos.some((h) => p.hashtags.includes(h)))
    .sort((x, y) => y.fecha.localeCompare(x.fecha))
    .map((p) => ({
      id: p.id,
      fecha: p.fecha,
      cuenta: p.cuenta,
      hashtags: elegidos.filter((h) => p.hashtags.includes(h)),
      titulo: p.titulo,
      enlace: p.enlace,
      alcance: p.alcance,
      visualizaciones: p.visualizaciones,
      interacciones: p.interacciones,
    }));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Hashtags</h1>
          <p className="mt-0.5 max-w-2xl text-sm text-[var(--color-tinta-suave)]">
            Busca un hashtag y mira cómo evoluciona: cuánto se usa, en qué cuentas
            y cómo rinde frente al resto de lo que publican.
          </p>
        </div>

        {/* El rango va en la URL, con lo demás: el enlace reproduce la vista. */}
        <form method="get" className="flex flex-wrap items-end gap-3">
          {elegidos.map((h) => (
            <input key={h} type="hidden" name="h" value={h} />
          ))}
          {cuenta && <input type="hidden" name="cuenta" value={cuenta} />}
          <input type="hidden" name="metrica" value={metrica} />
          <input type="hidden" name="por" value={por} />
          <div className="space-y-1">
            <label className="etiqueta" htmlFor="desde">
              Desde
            </label>
            <input id="desde" name="desde" type="date" defaultValue={desde} className="campo" />
          </div>
          <div className="space-y-1">
            <label className="etiqueta" htmlFor="hasta">
              Hasta
            </label>
            <input id="hasta" name="hasta" type="date" defaultValue={hasta} className="campo" />
          </div>
          <button type="submit" className="boton-suave">
            Ver período
          </button>
        </form>
      </div>

      {todas.length === 0 ? (
        <Vacio
          titulo={`No hay publicaciones registradas entre el ${fechaCorta(desde)} y el ${fechaCorta(hasta)}.`}
          detalle="Sube las exportaciones desde el registro y las filas se crean solas, o elige otro período."
          accion={
            <Link href="/registro" className="boton-suave mt-1">
              Ir al registro
            </Link>
          }
        />
      ) : (
        <>
          <BuscadorHashtags catalogo={cat} parametros={parametros} colores={colores} />

          {elegidos.length === 0 ? (
            <Vacio
              titulo="Elige un hashtag para ver su evolución."
              detalle={`Escríbelo en el buscador o aprieta uno de los más usados. Se pueden comparar hasta ${MAXIMO_HASHTAGS} a la vez.`}
            />
          ) : (
            <PanelHashtags
              parametros={parametros}
              cuentas={conActividad.map((c) => ({ id: c.id, nombre: c.nombre }))}
              evolucion={evolucion}
              resumenes={resumenes}
              publicaciones={publicaciones}
              colores={colores}
            />
          )}

          <Nota>
            Los hashtags salen de la serie de cada publicación y del texto que
            guarda el registro (los primeros 300 caracteres del caption). Un
            hashtag escrito más allá de ese largo no se ve, y lo que se cargó a
            mano sin texto solo cuenta con su serie. El{" "}
            <Link href="/catastro" className="underline underline-offset-2">
              catastro semanal
            </Link>{" "}
            muestra la semana de cada serie contra su línea base.
          </Nota>
        </>
      )}
    </div>
  );
}
