import Link from "next/link";
import { FormularioCliente } from "@/componentes/FormularioCliente";
import { TablaClientes } from "@/componentes/TablaClientes";
import { Nota, Vacio } from "@/componentes/ui";
import { hashtagsSinCliente, listarClientes } from "@/lib/datos/consultas";

export const metadata = { title: "Clientes · KPIs DLT" };

export default async function PaginaClientes() {
  const [clientes, sinAsignar] = await Promise.all([
    listarClientes(),
    hashtagsSinCliente(),
  ]);

  const activos = clientes.filter((c) => c.activo).length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Clientes</h1>
        <p className="mt-0.5 text-sm text-[var(--color-tinta-suave)]">
          Un cliente es una lista de hashtags. Con eso se puede emitir su
          informe aparte, con las mismas métricas del catastro pero solo de su
          contenido.
        </p>
      </div>

      <div className="tarjeta p-4">
        <h2 className="text-sm font-semibold">Agregar un cliente</h2>
        <p className="mt-1 mb-3 text-sm text-[var(--color-tinta-suave)]">
          Pega la lista de hashtags tal como te la pasaron: se ordena y se
          normaliza sola.
        </p>
        <FormularioCliente />
      </div>

      <Nota>
        La lista de hashtags es <strong>exacta</strong>, no un patrón: un
        hashtag que no esté en ella no entra al informe. Es a propósito — un
        patrón como «todo lo que contenga SPARTA» parece cómodo hasta que
        arrastra contenido ajeno a un informe que se le manda al cliente. Para
        que no se pierda nada por omisión, más abajo están los hashtags que
        aparecen en los registros y no pertenecen a ningún cliente.
      </Nota>

      {clientes.length === 0 ? (
        <Vacio
          titulo="Todavía no hay clientes."
          detalle="Usa el formulario de arriba para crear el primero con su lista de hashtags."
        />
      ) : (
        <>
          <p className="text-xs text-[var(--color-tinta-tenue)]">
            {clientes.length} {clientes.length === 1 ? "cliente" : "clientes"} ·{" "}
            {activos} {activos === 1 ? "activo" : "activos"}
          </p>
          <TablaClientes clientes={clientes} />
        </>
      )}

      <section className="tarjeta p-4">
        <h2 className="text-sm font-semibold">Hashtags sin cliente</h2>
        <p className="mt-0.5 text-[13px] text-[var(--color-tinta-suave)]">
          Aparecen en los registros y no están en la lista de ningún cliente. Si
          alguno debería estar, agrégalo arriba.
        </p>

        {sinAsignar.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--color-tinta-suave)]">
            Todos los hashtags registrados pertenecen a algún cliente.
          </p>
        ) : (
          <>
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {sinAsignar.slice(0, 120).map((h) => (
                <li
                  key={h.hashtag}
                  className="rounded border border-[var(--color-filete)] px-1.5 py-0.5 font-mono text-[12px] text-[var(--color-tinta-suave)]"
                  title={`${h.publicaciones} ${
                    h.publicaciones === 1 ? "publicación" : "publicaciones"
                  }`}
                >
                  #{h.hashtag}
                  <span className="ml-1 not-italic opacity-60">{h.publicaciones}</span>
                </li>
              ))}
            </ul>
            {sinAsignar.length > 120 && (
              <p className="mt-2 text-[11px] text-[var(--color-tinta-tenue)]">
                Y {sinAsignar.length - 120} más. El número al lado de cada uno es
                cuántas publicaciones tiene.
              </p>
            )}
          </>
        )}
      </section>

      <p className="text-[11px] text-[var(--color-tinta-tenue)]">
        Un cliente que se deja de atender se desactiva, no se borra: sus
        informes históricos tienen que seguir siendo reproducibles. Los informes
        se emiten en{" "}
        <Link href="/informe" className="underline underline-offset-2">
          Informes
        </Link>
        .
      </p>
    </div>
  );
}
