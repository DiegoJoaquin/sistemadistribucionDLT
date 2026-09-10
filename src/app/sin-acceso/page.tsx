import { LogoDLT } from "@/componentes/LogoDLT";
import { cerrarSesion } from "@/lib/datos/acciones";
import { supabaseServidor } from "@/lib/supabase/servidor";

export const metadata = { title: "Cuenta sin habilitar · KPIs DLT" };

/**
 * Pantalla para una cuenta con sesión válida pero sin autorización.
 *
 * No usa `exigirSesion` — sería un bucle de redirecciones, porque justamente
 * esa función manda para acá.
 */
export default async function PaginaSinAcceso() {
  const supabase = await supabaseServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="flex min-h-full flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <LogoDLT ancho={52} className="mb-5" />
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-tinta-tenue)]">
          DLT Sports · Distribución
        </p>
        <h1 className="mt-1.5 text-2xl font-semibold tracking-tight">
          Tu cuenta todavía no está habilitada
        </h1>

        <div className="tarjeta mt-5 p-5 text-sm leading-relaxed text-[var(--color-tinta-suave)]">
          <p>
            Entraste correctamente
            {user?.email && (
              <>
                {" "}
                como{" "}
                <strong className="font-medium text-[var(--color-tinta)]">
                  {user.email}
                </strong>
              </>
            )}
            , pero esta cuenta no está autorizada para ver los KPIs.
          </p>
          <p className="mt-3">
            Tener sesión no alcanza: cada persona se habilita a mano. Pídele a
            quien administra la plataforma que te autorice.
          </p>

          <div className="mt-4 rounded-md border border-[var(--color-filete)] bg-[var(--color-realce)] p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-tinta-suave)]">
              Para el administrador
            </p>
            <p className="mt-1.5 text-[13px]">
              En el SQL Editor de Supabase:
            </p>
            <pre className="mt-2 overflow-x-auto rounded bg-white p-2.5 font-mono text-[12px] text-[var(--color-tinta)]">
              {`update public.perfiles
   set autorizado = true
 where email = '${user?.email ?? "correo@dltsports.cl"}';`}
            </pre>
          </div>
        </div>

        <form action={cerrarSesion} className="mt-4">
          <button type="submit" className="boton-suave">
            Salir
          </button>
        </form>
      </div>
    </main>
  );
}
