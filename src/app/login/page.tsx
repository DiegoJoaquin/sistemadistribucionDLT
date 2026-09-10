import { FormularioLogin } from "@/componentes/FormularioLogin";

export const metadata = { title: "Entrar · KPIs DLT" };

export default async function PaginaLogin(props: PageProps<"/login">) {
  const { volver } = await props.searchParams;

  return (
    <main className="flex min-h-full flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-7">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-tinta-tenue)]">
            DLT Sports · Distribución
          </p>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight">
            KPIs diarios
          </h1>
          <p className="mt-1.5 text-sm text-[var(--color-tinta-suave)]">
            Registro, panel diario y reporte de las cinco cuentas.
          </p>
        </div>

        <div className="tarjeta p-5">
          <FormularioLogin volver={typeof volver === "string" ? volver : undefined} />
        </div>
      </div>
    </main>
  );
}
