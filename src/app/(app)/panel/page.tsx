import Link from "next/link";
import { BloquePanel } from "@/componentes/BloquePanel";
import { SelectorFecha } from "@/componentes/SelectorFecha";
import { Nota, Vacio } from "@/componentes/ui";
import { panelDelDia } from "@/lib/datos/consultas";
import { hoyISO, mesLargo } from "@/lib/dominio/formato";

export const metadata = { title: "Panel diario · KPIs DLT" };

function primero(v: string | string[] | undefined): string | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  return s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined;
}

export default async function PaginaPanel(props: PageProps<"/panel">) {
  const sp = await props.searchParams;
  const fecha = primero(sp.fecha) ?? hoyISO();
  const panel = await panelDelDia(fecha);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Panel diario</h1>
          <p className="mt-0.5 text-sm text-[var(--color-tinta-suave)]">
            Promedios por publicación del día, comparados contra{" "}
            {panel.base ? (
              <strong className="font-medium text-[var(--color-tinta)]">
                la línea base de {mesLargo(panel.base.mes)}
              </strong>
            ) : (
              "la línea base activa"
            )}
            .
          </p>
        </div>
        <SelectorFecha fecha={fecha} ruta="/panel" />
      </div>

      <Nota>
        Todos los valores de las columnas son <strong>promedios por publicación</strong>
        , no sumas: la métrica del día dividida por las publicaciones del día. El
        TOTAL de cada plataforma se calcula sobre todas sus filas, sin sumar las
        categorías entre sí — en Instagram una misma publicación es a la vez
        Reactivo/Normal e Imagen/Reel/Carrusel.
      </Nota>

      {!panel.base && (
        <Nota>
          No hay línea base activa: todas las variaciones aparecen como guion.{" "}
          <Link href="/base" className="underline underline-offset-2">
            Importa los archivos de un mes.
          </Link>
        </Nota>
      )}

      {!panel.hayAlgo ? (
        <Vacio
          titulo="Este día no tiene datos cargados."
          detalle="No hay ningún registro para esta fecha en ninguna plataforma."
          accion={
            <Link href={`/registro?desde=${fecha}&hasta=${fecha}`} className="boton mt-2">
              Ir a cargar el día
            </Link>
          }
        />
      ) : (
        <div className="space-y-4">
          {panel.bloques.map((b) => (
            <BloquePanel key={b.plataforma} bloque={b} />
          ))}
        </div>
      )}

      <p className="text-xs text-[var(--color-tinta-tenue)]">
        Las métricas de perfil (visitas, vistas de seguidores y de no seguidores)
        van aparte, en{" "}
        <Link href={`/perfil?fecha=${fecha}`} className="underline underline-offset-2">
          Métricas de perfil
        </Link>
        , porque todavía no tienen línea base.
      </p>
    </div>
  );
}
