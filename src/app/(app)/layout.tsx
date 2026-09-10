import Link from "next/link";
import { Navegacion } from "@/componentes/Navegacion";
import { cerrarSesion } from "@/lib/datos/acciones";
import { mesLargo } from "@/lib/dominio/formato";
import { lineaBaseActiva } from "@/lib/datos/consultas";
import { exigirSesion } from "@/lib/supabase/servidor";

export default async function LayoutApp({ children }: LayoutProps<"/">) {
  const { perfil } = await exigirSesion();
  const base = await lineaBaseActiva();

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-[var(--color-filete)] bg-[var(--color-superficie)]">
        <div className="mx-auto flex w-full max-w-[1400px] flex-wrap items-center justify-between gap-3 px-4 pt-3 sm:px-6">
          <div className="flex items-baseline gap-3">
            <Link href="/registro" className="text-sm font-semibold tracking-tight">
              KPIs diarios
            </Link>
            <span className="text-xs text-[var(--color-tinta-tenue)]">
              DLT Sports · Distribución
            </span>
          </div>

          <div className="flex items-center gap-3 text-xs text-[var(--color-tinta-suave)]">
            <span
              title={
                base
                  ? "Todas las variaciones se comparan contra esta línea base"
                  : "Sin línea base activa: las variaciones se muestran como guion"
              }
            >
              Línea base:{" "}
              <strong className="font-medium text-[var(--color-tinta)]">
                {base ? mesLargo(base.mes) : "ninguna"}
              </strong>
            </span>
            <span aria-hidden className="text-[var(--color-filete-fuerte)]">
              |
            </span>
            <span className="text-[var(--color-tinta)]">{perfil.nombre}</span>
            <form action={cerrarSesion}>
              <button
                type="submit"
                className="text-[var(--color-tinta-suave)] underline-offset-2 hover:underline"
              >
                Salir
              </button>
            </form>
          </div>
        </div>

        <div className="mx-auto w-full max-w-[1400px] px-4 sm:px-6">
          <Navegacion />
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6">
        {children}
      </main>
    </div>
  );
}
