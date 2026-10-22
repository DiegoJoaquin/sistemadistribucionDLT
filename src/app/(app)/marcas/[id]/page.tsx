import Link from "next/link";
import { notFound } from "next/navigation";
import { FormularioPiezaManual } from "@/componentes/FormularioPiezaManual";
import { Insignia, Nota, Vacio } from "@/componentes/ui";
import { borrarPiezaManual } from "@/lib/datos/acciones-marcas";
import { cuentasPorId, listarCuentas } from "@/lib/datos/consultas";
import { listarMarcas, piezasManuales, publicacionesConMarcas } from "@/lib/datos/marcas";
import { fechaCorta, hoyISO, numero } from "@/lib/dominio/formato";
import { type Granularidad, granularidadSugerida } from "@/lib/dominio/hashtags";
import { globalDeMarcas, rotularSenal } from "@/lib/dominio/marcas";
import { ordenarCuentas } from "@/lib/dominio/redes";

export const metadata = { title: "Marca · Global de marcas · KPIs DLT" };

function uno(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function fecha(v: string | string[] | undefined): string | undefined {
  const s = uno(v);
  return s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined;
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function rotuloPeriodo(desde: string, g: Granularidad): string {
  const [a, m, d] = desde.split("-").map(Number);
  return g === "mes" ? `${MESES[m - 1]} ${a}` : `${d} ${MESES[m - 1]}`;
}

/** Cuántas piezas se listan: más allá conviene acotar el período. */
const TOPE_PIEZAS = 500;

export default async function PaginaMarca(props: PageProps<"/marcas/[id]">) {
  const { id } = await props.params;
  const sp = await props.searchParams;
  const hoy = hoyISO();

  const desde = fecha(sp.desde) ?? `${hoy.slice(0, 4)}-01-01`;
  const hasta = fecha(sp.hasta) ?? hoy;
  const porPedido = uno(sp.por);
  const por: Granularidad = porPedido === "semana" || porPedido === "mes" ? porPedido : granularidadSugerida(desde, hasta);

  const [marcas, cuentas] = await Promise.all([listarMarcas(), listarCuentas()]);
  const marca = marcas.find((m) => m.id === id);
  if (!marca) notFound();

  const indice = cuentasPorId(cuentas);
  const [pubs, manuales] = await Promise.all([
    publicacionesConMarcas(desde, hasta, indice),
    piezasManuales(desde, hasta, indice),
  ]);

  // Se calcula con la marca aunque esté inactiva: su página tiene que poder verse.
  const g = globalDeMarcas(pubs, [{ ...marca, activa: true }], desde, hasta, por, manuales);
  const c = g.marcas[0];
  const formatos = Object.entries(c.porFormato).sort((a, b) => b[1] - a[1]);
  const piezas = [...c.piezas].reverse().slice(0, TOPE_PIEZAS);
  const volver = `/marcas?${new URLSearchParams({ desde, hasta, por }).toString()}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href={volver} className="text-[13px] text-[var(--color-tinta-suave)] underline underline-offset-2">
            ← Global de marcas
          </Link>
          <div className="mt-1 flex flex-wrap items-baseline gap-2">
            <h1 className="text-lg font-semibold tracking-tight">{marca.nombre}</h1>
            {!marca.activa && <Insignia tono="aviso">inactiva</Insignia>}
          </div>
          <p className="mt-0.5 max-w-2xl text-sm text-[var(--color-tinta-suave)]">
            Se reconoce por: {marca.senales.map(rotularSenal).join(" · ") || "ninguna señal"}
          </p>
        </div>

        <form method="get" className="flex flex-wrap items-end gap-3">
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
          <div className="space-y-1">
            <label className="etiqueta" htmlFor="por">
              Agrupar por
            </label>
            <select id="por" name="por" defaultValue={por} className="campo">
              <option value="semana">Semana</option>
              <option value="mes">Mes</option>
            </select>
          </div>
          <button type="submit" className="boton-suave">
            Ver período
          </button>
        </form>
      </div>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="tarjeta p-4">
          <p className="etiqueta">Piezas</p>
          <p className="mt-1 text-2xl font-semibold cifra">{numero(c.n)}</p>
          <p className="mt-0.5 text-xs text-[var(--color-tinta-tenue)]">
            {c.manuales > 0 ? `${numero(c.manuales)} cargadas a mano` : "todas reconocidas solas"}
          </p>
        </div>
        <div className="tarjeta p-4">
          <p className="etiqueta">En cuentas de DLT</p>
          <p className="mt-1 text-2xl font-semibold cifra">{numero(c.enCuentasDLT)}</p>
        </div>
        <div className="tarjeta p-4">
          <p className="etiqueta">En cuentas de rostros</p>
          <p className="mt-1 text-2xl font-semibold cifra">{numero(c.enRostros)}</p>
        </div>
        <div className="tarjeta p-4">
          <p className="etiqueta">Última pieza</p>
          <p className="mt-1 text-2xl font-semibold">{c.ultima ? fechaCorta(c.ultima) : "—"}</p>
          <p className="mt-0.5 text-xs text-[var(--color-tinta-tenue)]">
            {c.periodosConPiezas} de {g.periodos.length} {por === "mes" ? "meses" : "semanas"} con piezas
          </p>
        </div>
      </section>

      <FormularioPiezaManual
        marcas={[{ id: marca.id, nombre: marca.nombre }]}
        cuentas={ordenarCuentas(cuentas.filter((x) => x.activa)).map((x) => ({ id: x.id, nombre: x.nombre, red: x.red }))}
        marcaFija={marca.id}
        hoy={hoy}
      />

      {c.n === 0 ? (
        <Vacio
          titulo={`No hay piezas de ${marca.nombre} entre el ${fechaCorta(desde)} y el ${fechaCorta(hasta)}.`}
          detalle="Revisa que sus hashtags y arrobas estén bien escritos, elige otro período o súmala a mano con el botón de arriba."
        />
      ) : (
        <>
          <section className="tarjeta overflow-hidden">
            <div className="border-b border-[var(--color-filete)] px-4 py-3">
              <h2 className="text-sm font-semibold tracking-tight">Por {por === "mes" ? "mes" : "semana"}</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead className="border-b border-[var(--color-filete)] bg-[var(--color-realce)]/60">
                  <tr>
                    {g.periodos.map((p) => (
                      <th key={p.desde} className="th text-right whitespace-nowrap">
                        {rotuloPeriodo(p.desde, por)}
                      </th>
                    ))}
                    <th className="th text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    {c.porPeriodo.map((n, i) => (
                      <td key={i} className="td text-right cifra">
                        {n ? numero(n) : "—"}
                      </td>
                    ))}
                    <td className="td text-right cifra font-semibold">{numero(c.n)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section className="grid gap-3 md:grid-cols-2">
            <div className="tarjeta p-4">
              <h2 className="etiqueta mb-1.5">Por cuenta</h2>
              <table className="w-full border-collapse text-left">
                <tbody>
                  {c.porCuenta.map((x) => (
                    <tr key={x.cuentaId ?? "sin-cuenta"} className="border-b border-[var(--color-filete)] last:border-0">
                      <td className="td">
                        {x.cuenta}
                        <span className="ml-1.5 text-xs text-[var(--color-tinta-tenue)]">
                          {x.red ?? ""}
                          {x.esInfluencer ? " · rostro" : ""}
                        </span>
                      </td>
                      <td className="td text-right cifra">{numero(x.n)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="tarjeta p-4">
              <h2 className="etiqueta mb-1.5">Por formato</h2>
              <table className="w-full border-collapse text-left">
                <tbody>
                  {formatos.map(([f, n]) => (
                    <tr key={f} className="border-b border-[var(--color-filete)] last:border-0">
                      <td className="td">{f}</td>
                      <td className="td text-right cifra">{numero(n)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="tarjeta overflow-hidden">
            <div className="border-b border-[var(--color-filete)] px-4 py-3">
              <h2 className="text-sm font-semibold tracking-tight">Las piezas, de la más reciente a la más antigua</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead className="border-b border-[var(--color-filete)] bg-[var(--color-realce)]/60">
                  <tr>
                    <th className="th">Fecha</th>
                    <th className="th">Cuenta</th>
                    <th className="th">Formato</th>
                    <th className="th">Publicación</th>
                    <th className="th">Cómo se contó</th>
                  </tr>
                </thead>
                <tbody>
                  {piezas.map((p) => (
                    <tr key={p.id} className="border-b border-[var(--color-filete)] last:border-0 align-top">
                      <td className="td whitespace-nowrap">{fechaCorta(p.fecha)}</td>
                      <td className="td whitespace-nowrap">{p.cuenta ?? "—"}</td>
                      <td className="td">
                        {p.categoria ?? "—"}
                        {p.cantidad > 1 && <span className="ml-1 text-xs text-[var(--color-tinta-tenue)]">× {p.cantidad}</span>}
                      </td>
                      <td className="td min-w-64 max-w-md whitespace-normal">
                        {p.enlace ? (
                          <a
                            href={p.enlace}
                            target="_blank"
                            rel="noreferrer"
                            className="line-clamp-2 underline underline-offset-2"
                            title={p.titulo ?? undefined}
                          >
                            {p.titulo ?? "Ver publicación"}
                          </a>
                        ) : (
                          <span className="line-clamp-2">{p.titulo ?? "—"}</span>
                        )}
                      </td>
                      <td className="td">
                        {p.manualId ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <Insignia>a mano</Insignia>
                            <form action={borrarPiezaManual}>
                              <input type="hidden" name="id" value={p.manualId} />
                              <button
                                type="submit"
                                className="text-[12px] text-[var(--color-tinta-suave)] underline-offset-2 hover:text-red-700 hover:underline"
                              >
                                Borrar
                              </button>
                            </form>
                          </div>
                        ) : (
                          <span className="font-mono text-[12px] text-[var(--color-tinta-suave)]">
                            {p.por.map(rotularSenal).join(" ")}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {c.piezas.length > TOPE_PIEZAS && (
              <p className="px-4 py-2 text-[11px] text-[var(--color-tinta-tenue)]">
                Se muestran las {TOPE_PIEZAS} más recientes. Acota el período para ver las anteriores.
              </p>
            )}
          </section>

          {g.manualesRepetidas > 0 && (
            <Nota>
              {g.manualesRepetidas === 1 ? "Una pieza cargada a mano no se suma" : `${g.manualesRepetidas} piezas cargadas a mano no se suman`}{" "}
              porque su enlace ya se reconoció solo: así no se cuenta dos veces lo mismo.
            </Nota>
          )}
        </>
      )}
    </div>
  );
}
