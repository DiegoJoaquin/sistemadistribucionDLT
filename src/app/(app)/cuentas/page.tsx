import { FormularioCuenta } from "@/componentes/FormularioCuenta";
import { TablaCuentas } from "@/componentes/TablaCuentas";
import { Nota, Vacio } from "@/componentes/ui";
import { listarCuentas, usoDeCuentas } from "@/lib/datos/consultas";

export const metadata = { title: "Cuentas · KPIs DLT" };

export default async function PaginaCuentas() {
  const [cuentas, uso] = await Promise.all([listarCuentas(), usoDeCuentas()]);

  const propias = cuentas.filter((c) => !c.es_influencer).length;
  const influencers = cuentas.filter((c) => c.es_influencer).length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Cuentas</h1>
        <p className="mt-0.5 text-sm text-[var(--color-tinta-suave)]">
          Dónde publica DLT: las cuentas propias y las de los influencers. Se
          agregan acá, sin esperar a un despliegue.
        </p>
      </div>

      <div className="tarjeta p-4">
        <h2 className="text-sm font-semibold">Agregar una cuenta</h2>
        <p className="mt-1 mb-3 text-sm text-[var(--color-tinta-suave)]">
          La red es lo único que no se puede inventar: de ella dependen las
          categorías que se van a poder elegir y si la cuenta entrega alcance.
        </p>
        <FormularioCuenta />
      </div>

      <Nota>
        La <strong>red</strong> decide las reglas: en Instagram las categorías
        son Reactivo, Normal, Imagen, Reel y Carrusel; en TikTok solo Video; en
        YouTube Short y Video; en Twitter/X Video y Foto. YouTube además no
        entrega alcance, así que su engagement se calcula sobre visualizaciones
        y no es comparable con el de las otras.
        <br />
        La clasificación automática <strong>Reactivo/Normal</strong> está hecha
        con los hashtags de DLT y las palabras clave de DBF, así que no aplica a
        las cuentas de influencers: esas quedan con formato y hashtag.
      </Nota>

      {cuentas.length === 0 ? (
        <Vacio
          titulo="Todavía no hay cuentas."
          detalle="Usa el formulario de arriba para agregar la primera."
        />
      ) : (
        <>
          <p className="text-xs text-[var(--color-tinta-tenue)]">
            {cuentas.length} {cuentas.length === 1 ? "cuenta" : "cuentas"} ·{" "}
            {propias} {propias === 1 ? "propia" : "propias"} · {influencers}{" "}
            {influencers === 1 ? "de influencer" : "de influencers"}
          </p>
          <TablaCuentas cuentas={cuentas} uso={Object.fromEntries(uso)} />
        </>
      )}
    </div>
  );
}
