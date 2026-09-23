import Link from "next/link";
import { SelectorFecha } from "@/componentes/SelectorFecha";
import { Cifra, Nota, Pct, Vacio } from "@/componentes/ui";
import { panelDelDia } from "@/lib/datos/consultas";
import { hoyISO } from "@/lib/dominio/formato";

export const metadata = { title: "Métricas de perfil · KPIs DLT" };

function primero(v: string | string[] | undefined): string | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  return s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined;
}

export default async function PaginaPerfil(props: PageProps<"/perfil">) {
  const sp = await props.searchParams;
  const fecha = primero(sp.fecha) ?? hoyISO();
  const panel = await panelDelDia(fecha);

  const hayAlguna = panel.perfil.some((l) => !l.sinDatos);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Métricas de perfil</h1>
          <p className="mt-0.5 text-sm text-[var(--color-tinta-suave)]">
            Promedios por publicación del día seleccionado.
          </p>
        </div>
        <SelectorFecha fecha={fecha} ruta="/perfil" />
      </div>

      {/* §4.3 y §9.7 — la nota explicando por qué acá no hay variaciones. */}
      <Nota>
        Este bloque va aparte y <strong>sin columnas de variación</strong>: ninguna
        plataforma entrega estas tres métricas en su exportación, se ingresan a
        mano, y por eso todavía no existe línea base histórica contra la cual
        compararlas. Cuando se acumule un mes completo de registro manual se podrá
        generar su línea base y recién ahí activar las variaciones.
      </Nota>

      {!hayAlguna ? (
        <Vacio
          titulo="No hay métricas de perfil cargadas para este día."
          detalle="Se ingresan a mano desde el formulario de registro, en la sección Métricas de perfil."
          accion={
            <Link href={`/registro?desde=${fecha}&hasta=${fecha}`} className="boton mt-2">
              Ir a cargarlas
            </Link>
          }
        />
      ) : (
        <div className="tarjeta overflow-hidden">
          <div className="scroll-x">
            <table className="w-full border-collapse text-left">
              <thead className="border-b border-[var(--color-filete)] bg-[var(--color-realce)]/60">
                <tr>
                  <th className="th">Plataforma</th>
                  <th className="th text-right">Pub.</th>
                  <th className="th text-right">Visitas al perfil</th>
                  <th className="th text-right">Vistas de seguidores</th>
                  <th className="th text-right">Vistas de no seguidores</th>
                  <th className="th text-right">% de no seguidores</th>
                </tr>
              </thead>
              <tbody>
                {panel.perfil.map((l) => {
                  const esTotal = l.cuenta === null;
                  return (
                    <tr
                      key={l.cuenta?.id ?? "total"}
                      className={
                        esTotal
                          ? "border-t border-[var(--color-filete-fuerte)] bg-[var(--color-realce)]/70"
                          : "border-b border-[var(--color-filete)]"
                      }
                    >
                      <td className={`td ${esTotal ? "font-semibold" : "font-medium"}`}>
                        {l.etiqueta}
                      </td>
                      <td className="td text-right">
                        {l.publicaciones === 0 ? (
                          <span className="text-[var(--color-tinta-tenue)]">—</span>
                        ) : (
                          <span className="cifra">{l.publicaciones}</span>
                        )}
                      </td>
                      <td className="td text-right">
                        <Cifra valor={l.visitas_perfil} fino />
                      </td>
                      <td className="td text-right">
                        <Cifra valor={l.vistas_seguidores} fino />
                      </td>
                      <td className="td text-right">
                        <Cifra valor={l.vistas_no_seguidores} fino />
                      </td>
                      <td className="td text-right">
                        <Pct valor={l.pct_no_seguidores} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
