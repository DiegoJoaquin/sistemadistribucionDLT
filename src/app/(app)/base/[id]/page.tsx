import Link from "next/link";
import { notFound } from "next/navigation";
import { CabeceraPlataforma, Cifra, Insignia, Nota, Pct } from "@/componentes/ui";
import { reclasificar } from "@/lib/datos/acciones";
import {
  detalleLineaBase,
  lineaBasePorId,
  publicacionesDeLineaBase,
} from "@/lib/datos/consultas";
import { fechaHoraCorta, mesLargo } from "@/lib/dominio/formato";
import {
  categoriasDe,
  esPlataforma,
  ORDEN_PLATAFORMAS,
  type Plataforma,
} from "@/lib/dominio/plataformas";

export const metadata = { title: "Detalle de línea base · KPIs DLT" };

const ES_INSTAGRAM = (p: Plataforma) =>
  p === "Instagram DLT" || p === "Instagram DBF";

export default async function PaginaDetalleBase(props: PageProps<"/base/[id]">) {
  const { id } = await props.params;
  const sp = await props.searchParams;
  const elegida = Array.isArray(sp.plataforma) ? sp.plataforma[0] : sp.plataforma;

  const linea = await lineaBasePorId(id);
  if (!linea) notFound();

  const detalle = await detalleLineaBase(id);
  const plataformaSel = esPlataforma(elegida) ? elegida : null;
  const publicaciones = plataformaSel
    ? await publicacionesDeLineaBase(id, plataformaSel)
    : [];

  const conDatos = ORDEN_PLATAFORMAS.filter((p) =>
    detalle.some((d) => d.plataforma === p),
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">
            Línea base · {mesLargo(linea.mes)}
          </h1>
          <p className="mt-0.5 text-sm text-[var(--color-tinta-suave)]">
            Promedios por publicación de cada categoría.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {linea.activa && <Insignia>referencia activa</Insignia>}
          <Link href="/base" className="boton-suave">
            Volver
          </Link>
        </div>
      </div>

      <Nota>
        El TOTAL de cada plataforma no es la suma de sus categorías. En Instagram
        una publicación cuenta a la vez como Reactivo o Normal y como Imagen, Reel
        o Carrusel, así que aparece en dos categorías; el TOTAL se calcula sobre
        todas las publicaciones, una sola vez cada una.
      </Nota>

      <div className="space-y-4">
        {conDatos.map((plataforma) => {
          const filas = detalle.filter((d) => d.plataforma === plataforma);
          const total = filas.find((f) => f.categoria === null);
          const orden = categoriasDe(plataforma);

          return (
            <section key={plataforma} className="tarjeta overflow-hidden">
              <CabeceraPlataforma
                plataforma={plataforma}
                derecha={
                  ES_INSTAGRAM(plataforma) ? (
                    <Link
                      href={`/base/${id}?plataforma=${encodeURIComponent(plataforma)}#publicaciones`}
                      className="text-[13px] text-[var(--color-tinta-suave)] underline-offset-2 hover:text-[var(--color-tinta)] hover:underline"
                    >
                      Revisar clasificación
                    </Link>
                  ) : undefined
                }
              />
              <div className="scroll-x">
                <table className="w-full border-collapse text-left">
                  <thead className="border-b border-[var(--color-filete)]">
                    <tr>
                      <th className="th">Categoría</th>
                      <th className="th text-right">Publicaciones</th>
                      <th className="th text-right">Alcance prom.</th>
                      <th className="th text-right">Visualiz. prom.</th>
                      <th className="th text-right">Interacc. prom.</th>
                      <th className="th text-right">Engagement prom.</th>
                      <th className="th text-right">Nuevos seg. prom.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[total, ...orden.map((c) => filas.find((f) => f.categoria === c))]
                      .filter((f) => f !== undefined)
                      .map((f, i) => (
                        <tr
                          key={f.categoria ?? "TOTAL"}
                          className={
                            i === 0
                              ? "border-b border-[var(--color-filete-fuerte)] bg-[var(--color-realce)]/70"
                              : "border-b border-[var(--color-filete)] last:border-0"
                          }
                        >
                          <td className={`td ${i === 0 ? "font-semibold" : ""}`}>
                            {f.categoria ?? "TOTAL"}
                          </td>
                          <td className="td text-right cifra">{f.n_publicaciones}</td>
                          <td className="td text-right">
                            <Cifra valor={f.alcance_prom} />
                          </td>
                          <td className="td text-right">
                            <Cifra valor={f.visualizaciones_prom} />
                          </td>
                          <td className="td text-right">
                            <Cifra valor={f.interacciones_prom} />
                          </td>
                          <td className="td text-right">
                            <Pct valor={f.engagement_prom} />
                          </td>
                          <td className="td text-right">
                            <Cifra valor={f.nuevos_seguidores_prom} fino />
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}
      </div>

      {/* §5.2 — la clasificación automática tiene que poder corregirse a mano. */}
      {plataformaSel && ES_INSTAGRAM(plataformaSel) && (
        <section id="publicaciones" className="tarjeta overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-filete)] px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold">
                Clasificación de {plataformaSel}
              </h2>
              <p className="mt-0.5 text-xs text-[var(--color-tinta-suave)]">
                {publicaciones.length} publicaciones. Cambiar una recalcula los
                promedios al instante.
              </p>
            </div>
            <Link href={`/base/${id}`} className="boton-suave">
              Cerrar
            </Link>
          </div>

          <div className="scroll-x">
            <table className="w-full border-collapse text-left">
              <thead className="border-b border-[var(--color-filete)] bg-[var(--color-realce)]/60">
                <tr>
                  <th className="th">Publicado</th>
                  <th className="th">Formato</th>
                  <th className="th">Serie</th>
                  <th className="th">Contenido</th>
                  <th className="th text-right">Alcance</th>
                  <th className="th">Tipo</th>
                </tr>
              </thead>
              <tbody>
                {publicaciones.map((p) => (
                  <tr
                    key={p.id}
                    className="border-b border-[var(--color-filete)] last:border-0"
                  >
                    <td className="td text-[var(--color-tinta-suave)]">
                      {p.publicado_en ? fechaHoraCorta(p.publicado_en) : "—"}
                    </td>
                    <td className="td">{p.formato ?? "—"}</td>
                    <td className="td text-[var(--color-tinta-suave)]">
                      {p.serie_hashtag ? `#${p.serie_hashtag}` : "sin hashtag"}
                    </td>
                    <td className="td max-w-[26rem] truncate" title={p.caption ?? ""}>
                      {p.caption?.split("\n")[0] ?? "—"}
                    </td>
                    <td className="td text-right">
                      <Cifra valor={p.alcance} />
                    </td>
                    <td className="td">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[13px] ${
                            p.tipo === "Reactivo"
                              ? "font-medium text-[var(--color-tinta)]"
                              : "text-[var(--color-tinta-suave)]"
                          }`}
                        >
                          {p.tipo ?? "—"}
                        </span>
                        {p.clasificado_a_mano && (
                          <span
                            title={`La clasificación automática decía ${p.tipo_auto ?? "—"}`}
                            className="text-[11px] text-[var(--color-tinta-tenue)]"
                          >
                            a mano
                          </span>
                        )}
                        <form action={reclasificar}>
                          <input type="hidden" name="id" value={p.id} />
                          <input
                            type="hidden"
                            name="tipo"
                            value={p.tipo === "Reactivo" ? "Normal" : "Reactivo"}
                          />
                          <button
                            type="submit"
                            className="text-[13px] text-[var(--color-tinta-suave)] underline-offset-2 hover:text-[var(--color-tinta)] hover:underline"
                          >
                            → {p.tipo === "Reactivo" ? "Normal" : "Reactivo"}
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
