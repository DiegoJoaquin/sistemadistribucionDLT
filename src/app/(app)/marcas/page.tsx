import Link from "next/link";
import { FormularioMarca } from "@/componentes/FormularioMarca";
import { FormularioPiezaManual } from "@/componentes/FormularioPiezaManual";
import { TablaMarcas } from "@/componentes/TablaMarcas";
import { Nota, Vacio } from "@/componentes/ui";
import { asignarArroba } from "@/lib/datos/acciones-marcas";
import { cuentasPorId, listarCuentas } from "@/lib/datos/consultas";
import { listarMarcas, piezasManuales, publicacionesConMarcas } from "@/lib/datos/marcas";
import { fechaCorta, hoyISO, numero } from "@/lib/dominio/formato";
import { type Granularidad, granularidadSugerida } from "@/lib/dominio/hashtags";
import { arrobasSinMarca, globalDeMarcas } from "@/lib/dominio/marcas";
import { ordenarCuentas, REDES } from "@/lib/dominio/redes";

export const metadata = { title: "Global de marcas · KPIs DLT" };

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

function cero(n: number | undefined): string {
  return n ? numero(n) : "—";
}

/** Cuántas arrobas sin marca se muestran: más allá son menciones sueltas. */
const TOPE_ARROBAS = 60;

export default async function PaginaMarcas(props: PageProps<"/marcas">) {
  const sp = await props.searchParams;
  const hoy = hoyISO();

  // Por defecto, desde el 1 de enero: la pregunta es «cuánto va en el año».
  const desde = fecha(sp.desde) ?? `${hoy.slice(0, 4)}-01-01`;
  const hasta = fecha(sp.hasta) ?? hoy;
  const porPedido = uno(sp.por);
  const por: Granularidad = porPedido === "semana" || porPedido === "mes" ? porPedido : granularidadSugerida(desde, hasta);

  const [marcas, cuentas] = await Promise.all([listarMarcas(), listarCuentas()]);
  const indice = cuentasPorId(cuentas);
  const [pubs, manuales] = await Promise.all([
    publicacionesConMarcas(desde, hasta, indice),
    piezasManuales(desde, hasta, indice),
  ]);

  const g = globalDeMarcas(pubs, marcas, desde, hasta, por, manuales);
  const sinMarca = arrobasSinMarca(
    pubs,
    marcas,
    cuentas.map((c) => c.usuario ?? "").filter(Boolean),
  ).slice(0, TOPE_ARROBAS);
  const conPiezas = g.marcas.filter((m) => m.n > 0);
  const redesConPiezas = REDES.filter((r) => g.marcas.some((m) => (m.porRed[r] ?? 0) > 0));

  // El detalle de cada marca es su propia página, con el mismo período.
  const rango = new URLSearchParams({ desde, hasta, por }).toString();
  const cuentasActivas = ordenarCuentas(cuentas.filter((c) => c.activa)).map((c) => ({
    id: c.id,
    nombre: c.nombre,
    red: c.red,
  }));

  const rotuloRango = `${fechaCorta(desde)} al ${fechaCorta(hasta)}`;
  const unidad = por === "mes" ? "meses" : "semanas";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Global de marcas</h1>
          <p className="mt-0.5 max-w-2xl text-sm text-[var(--color-tinta-suave)]">
            Cuánto contenido se ha subido de cada marca comercial, en qué cuentas
            y cuándo. Se cuenta solo: cada publicación que se importa entra al
            conteo de las marcas cuyos hashtags, arrobas o campañas lleve.
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

      {marcas.length === 0 ? (
        <Vacio
          titulo="Todavía no hay marcas."
          detalle="Agrega la primera más abajo, con los hashtags, arrobas o campañas con que se reconoce. El conteo se calcula al tiro sobre todo lo importado."
        />
      ) : (
        <>
          <FormularioPiezaManual
            marcas={marcas.filter((m) => m.activa).map((m) => ({ id: m.id, nombre: m.nombre }))}
            cuentas={cuentasActivas}
            hoy={hoy}
          />

          {/* Resumen */}
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="tarjeta p-4">
              <p className="etiqueta">Piezas de marca</p>
              <p className="mt-1 text-2xl font-semibold cifra">{numero(g.conMarca)}</p>
              <p className="mt-0.5 text-xs text-[var(--color-tinta-tenue)]">
                de {numero(g.publicaciones)} publicaciones
                {g.manuales > 0 ? ` · ${numero(g.manuales)} a mano` : ""}
              </p>
            </div>
            <div className="tarjeta p-4">
              <p className="etiqueta">Marcas con piezas</p>
              <p className="mt-1 text-2xl font-semibold cifra">{numero(conPiezas.length)}</p>
              <p className="mt-0.5 text-xs text-[var(--color-tinta-tenue)]">
                de {numero(g.marcas.length)} activas
              </p>
            </div>
            <div className="tarjeta p-4">
              <p className="etiqueta">En cuentas de DLT</p>
              <p className="mt-1 text-2xl font-semibold cifra">{numero(g.conMarca - g.conMarcaEnRostros)}</p>
            </div>
            <div className="tarjeta p-4">
              <p className="etiqueta">En cuentas de rostros</p>
              <p className="mt-1 text-2xl font-semibold cifra">{numero(g.conMarcaEnRostros)}</p>
            </div>
          </section>

          {g.sinTextoCompleto > 0 && (
            <Nota>
              {numero(g.sinTextoCompleto)} de las {numero(g.publicaciones)} publicaciones del período
              se importaron antes de que se guardara el texto completo: de ellas solo se leen los
              primeros 300 caracteres, y una marca escrita al final del texto puede no contarse.
              Vuelve a subir sus archivos desde el{" "}
              <Link href="/registro" className="underline underline-offset-2">
                registro
              </Link>
              : no duplica nada y completa el texto.
            </Nota>
          )}

          {/* Global por marca */}
          <section className="tarjeta overflow-hidden">
            <div className="border-b border-[var(--color-filete)] px-4 py-3">
              <h2 className="text-sm font-semibold tracking-tight">Cuánto va de cada marca</h2>
              <p className="mt-0.5 text-xs text-[var(--color-tinta-suave)]">
                Del {rotuloRango}. Una pieza con dos marcas cuenta en las dos
                {g.conVariasMarcas > 0 ? ` (${numero(g.conVariasMarcas)} en este período)` : ""}.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead className="border-b border-[var(--color-filete)] bg-[var(--color-realce)]/60">
                  <tr>
                    <th className="th">Marca</th>
                    <th className="th text-right">Piezas</th>
                    <th className="th text-right">A mano</th>
                    {redesConPiezas.map((r) => (
                      <th key={r} className="th text-right">
                        {r}
                      </th>
                    ))}
                    <th className="th text-right">Cuentas DLT</th>
                    <th className="th text-right">Rostros</th>
                    <th className="th text-right">{unidad === "meses" ? "Meses" : "Semanas"} con piezas</th>
                    <th className="th">Última</th>
                    <th className="th" />
                  </tr>
                </thead>
                <tbody>
                  {g.marcas.map((m) => (
                    <tr key={m.marca.id} className="border-b border-[var(--color-filete)] last:border-0">
                      <td className="td font-medium">
                        <Link href={`/marcas/${m.marca.id}?${rango}`} className="hover:underline underline-offset-2">
                          {m.marca.nombre}
                        </Link>
                      </td>
                      <td className="td text-right cifra">{cero(m.n)}</td>
                      <td className="td text-right cifra">{cero(m.manuales)}</td>
                      {redesConPiezas.map((r) => (
                        <td key={r} className="td text-right cifra">
                          {cero(m.porRed[r])}
                        </td>
                      ))}
                      <td className="td text-right cifra">{cero(m.enCuentasDLT)}</td>
                      <td className="td text-right cifra">{cero(m.enRostros)}</td>
                      <td className="td text-right cifra">
                        {m.periodosConPiezas} de {g.periodos.length}
                      </td>
                      <td className="td">{m.ultima ? fechaCorta(m.ultima) : "—"}</td>
                      <td className="td text-right">
                        <Link href={`/marcas/${m.marca.id}?${rango}`} className="text-[13px] underline underline-offset-2">
                          Ver detalle
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Por período */}
          {conPiezas.length > 0 && (
            <section className="tarjeta overflow-hidden">
              <div className="border-b border-[var(--color-filete)] px-4 py-3">
                <h2 className="text-sm font-semibold tracking-tight">
                  Piezas de cada marca por {por === "mes" ? "mes" : "semana"}
                </h2>
                <p className="mt-0.5 text-xs text-[var(--color-tinta-suave)]">
                  {por === "mes" ? "Meses calendario." : "Semanas de lunes a domingo; cada columna parte el día indicado."}
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left">
                  <thead className="border-b border-[var(--color-filete)] bg-[var(--color-realce)]/60">
                    <tr>
                      <th className="th">Marca</th>
                      {g.periodos.map((p) => (
                        <th key={p.desde} className="th text-right whitespace-nowrap">
                          {rotuloPeriodo(p.desde, por)}
                        </th>
                      ))}
                      <th className="th text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {conPiezas.map((m) => (
                      <tr key={m.marca.id} className="border-b border-[var(--color-filete)] last:border-0">
                        <td className="td font-medium whitespace-nowrap">
                          <Link href={`/marcas/${m.marca.id}?${rango}`} className="hover:underline underline-offset-2">
                            {m.marca.nombre}
                          </Link>
                        </td>
                        {m.porPeriodo.map((n, i) => (
                          <td key={i} className="td text-right cifra">
                            {cero(n)}
                          </td>
                        ))}
                        <td className="td text-right cifra font-semibold">{numero(m.n)}</td>
                      </tr>
                    ))}
                    <tr className="bg-[var(--color-realce)]/60">
                      <td className="td font-semibold">Piezas con marca</td>
                      {g.porPeriodo.map((n, i) => (
                        <td key={i} className="td text-right cifra font-semibold">
                          {cero(n)}
                        </td>
                      ))}
                      <td className="td text-right cifra font-semibold">{numero(g.conMarca)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Arrobas sin marca */}
          <section className="tarjeta p-4">
            <h2 className="text-sm font-semibold">Arrobas sin marca</h2>
            <p className="mt-0.5 text-[13px] text-[var(--color-tinta-suave)]">
              Aparecen en las publicaciones del período y no son de ninguna marca ni
              de una cuenta propia. Muchas son personas, pero una marca nueva aparece
              primero acá: si alguna es de una marca, asígnala y entra al conteo.
            </p>
            {sinMarca.length === 0 ? (
              <p className="mt-3 text-sm text-[var(--color-tinta-suave)]">No hay arrobas sin asignar en el período.</p>
            ) : (
              <ul className="mt-3 divide-y divide-[var(--color-filete)]">
                {sinMarca.map((a) => (
                  <li key={a.arroba} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                    <span className="font-mono text-[13px]">
                      @{a.arroba}
                      <span className="ml-2 font-sans text-xs text-[var(--color-tinta-tenue)]">
                        {a.publicaciones} {a.publicaciones === 1 ? "publicación" : "publicaciones"} · última{" "}
                        {fechaCorta(a.ultima)}
                      </span>
                    </span>
                    <form action={asignarArroba} className="flex items-center gap-2">
                      <input type="hidden" name="arroba" value={a.arroba} />
                      <select name="marca" defaultValue="" className="campo py-1 text-[13px]" aria-label={`Marca para @${a.arroba}`} required>
                        <option value="" disabled>
                          Asignar a…
                        </option>
                        {marcas.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.nombre}
                          </option>
                        ))}
                      </select>
                      <button type="submit" className="boton-suave py-1 text-[13px]">
                        Asignar
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {/* Administración */}
      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold">Marcas y cómo se reconocen</h2>
          <p className="mt-0.5 text-[13px] text-[var(--color-tinta-suave)]">
            Al agregar o cambiar una señal, el conteo se recalcula sobre todo lo
            importado desde enero: no hay que volver a subir nada.
          </p>
        </div>
        <div className="tarjeta p-4">
          <h3 className="mb-3 text-sm font-semibold">Agregar una marca</h3>
          <FormularioMarca />
        </div>
        {marcas.length > 0 && <TablaMarcas marcas={marcas} />}
      </section>
    </div>
  );
}
