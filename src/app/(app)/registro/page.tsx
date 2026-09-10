import Link from "next/link";
import { FormularioRegistro } from "@/componentes/FormularioRegistro";
import { TablaRegistros, type FilaTabla } from "@/componentes/TablaRegistros";
import { Nota, Vacio } from "@/componentes/ui";
import {
  aFilaCalculo,
  claveBase,
  lineaBaseActiva,
  listarPerfiles,
  listarRegistros,
  promediosDeLineaBase,
  type MapaBase,
} from "@/lib/datos/consultas";
import { alcancePorPost, delta, promedioPorPublicacion } from "@/lib/dominio/calculo";
import { hoyISO, mesLargo } from "@/lib/dominio/formato";
import {
  CATEGORIAS,
  type Categoria,
  esCategoria,
  esPlataforma,
  PLATAFORMAS,
} from "@/lib/dominio/plataformas";

export const metadata = { title: "Registro · KPIs DLT" };

function primero(v: string | string[] | undefined): string | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  return s && s.trim() !== "" ? s : undefined;
}

export default async function PaginaRegistro(props: PageProps<"/registro">) {
  const sp = await props.searchParams;
  const hoy = hoyISO();

  const desde = primero(sp.desde) ?? hoy;
  const hasta = primero(sp.hasta) ?? desde;
  const plataformaFiltro = primero(sp.plataforma);
  const categoriaFiltro = primero(sp.categoria);
  const usuarioFiltro = primero(sp.usuario);

  const [registros, base, perfiles] = await Promise.all([
    listarRegistros({
      desde,
      hasta,
      plataforma: esPlataforma(plataformaFiltro) ? plataformaFiltro : undefined,
      categoria: esCategoria(categoriaFiltro) ? categoriaFiltro : undefined,
      usuario: usuarioFiltro,
    }),
    lineaBaseActiva(),
    listarPerfiles(),
  ]);

  const mapa: MapaBase = base ? await promediosDeLineaBase(base.id) : new Map();

  /*
   * Delta de cada fila: su promedio por publicación contra el promedio de la
   * línea base de esa plataforma y categoría (§4.2). Una fila con 3
   * publicaciones y 30.000 de alcance vale 10.000, no 30.000.
   */
  const filas: FilaTabla[] = registros.map((r) => {
    const calc = aFilaCalculo(r);
    const b = mapa.get(claveBase(r.plataforma, r.categoria)) ?? null;
    const uno = [calc];

    return {
      registro: r,
      alcancePorPost: alcancePorPost(calc),
      sinBase: b === null,
      deltas: {
        alcance: delta(promedioPorPublicacion(uno, "alcance"), b?.alcance_prom),
        visualizaciones: delta(
          promedioPorPublicacion(uno, "visualizaciones"),
          b?.visualizaciones_prom,
        ),
        interacciones: delta(
          promedioPorPublicacion(uno, "interacciones"),
          b?.interacciones_prom,
        ),
        nuevos_seguidores: delta(
          promedioPorPublicacion(uno, "nuevos_seguidores"),
          b?.nuevos_seguidores_prom,
        ),
      },
    };
  });

  const rango = desde === hasta ? desde : `${desde} a ${hasta}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Registro diario</h1>
          <p className="mt-0.5 text-sm text-[var(--color-tinta-suave)]">
            Las variaciones comparan el promedio por publicación de cada fila contra{" "}
            {base ? (
              <>la línea base de {mesLargo(base.mes)}</>
            ) : (
              <>la línea base activa</>
            )}
            .
          </p>
        </div>
        <Link href="/panel" className="boton-suave">
          Ver panel del día
        </Link>
      </div>

      <FormularioRegistro hoy={hoy} />

      {!base && (
        <Nota>
          No hay ninguna línea base activa, así que todas las variaciones se
          muestran como guion.{" "}
          <Link href="/base" className="underline underline-offset-2">
            Importa los archivos de un mes
          </Link>{" "}
          para empezar a comparar.
        </Nota>
      )}

      {/* Filtros: form GET, funciona sin JavaScript. */}
      <form
        method="get"
        className="tarjeta flex flex-wrap items-end gap-3 p-3"
        aria-label="Filtros"
      >
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
          <label className="etiqueta" htmlFor="plataforma">
            Plataforma
          </label>
          <select
            id="plataforma"
            name="plataforma"
            defaultValue={plataformaFiltro ?? ""}
            className="campo"
          >
            <option value="">Todas</option>
            {PLATAFORMAS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="etiqueta" htmlFor="categoria">
            Categoría
          </label>
          <select
            id="categoria"
            name="categoria"
            defaultValue={categoriaFiltro ?? ""}
            className="campo"
          >
            <option value="">Todas</option>
            {CATEGORIAS.map((c: Categoria) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="etiqueta" htmlFor="usuario">
            Cargado por
          </label>
          <select
            id="usuario"
            name="usuario"
            defaultValue={usuarioFiltro ?? ""}
            className="campo"
          >
            <option value="">Todos</option>
            {perfiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="boton-suave">
          Filtrar
        </button>
        <Link href="/registro" className="text-sm text-[var(--color-tinta-suave)] underline-offset-2 hover:underline">
          Limpiar
        </Link>
      </form>

      {filas.length === 0 ? (
        <Vacio
          titulo={`No hay registros para ${rango}.`}
          detalle="Usa el formulario de arriba para cargar la primera publicación, o cambia los filtros."
        />
      ) : (
        <>
          <p className="text-xs text-[var(--color-tinta-tenue)]">
            {filas.length} {filas.length === 1 ? "fila" : "filas"} · {rango}
          </p>
          <TablaRegistros filas={filas} />
        </>
      )}
    </div>
  );
}
