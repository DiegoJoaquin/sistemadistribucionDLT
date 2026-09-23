import { EditorReporte } from "@/componentes/EditorReporte";
import { SelectorFecha } from "@/componentes/SelectorFecha";
import { VistaPreviaReporte } from "@/componentes/VistaPreviaReporte";
import { Nota } from "@/componentes/ui";
import {
  claveBase,
  cuentasPorId,
  listarCuentas,
  panelDelDia,
  promediosDeLineaBase,
  registrosDelDia,
  reporteDe,
  aFilaCalculo,
  type MapaBase,
} from "@/lib/datos/consultas";
import { delta, promedioPorPublicacion } from "@/lib/dominio/calculo";
import { hoyISO } from "@/lib/dominio/formato";
import {
  construirReporte,
  type FilaConDeltas,
  htmlCorreo,
  textoPlano,
} from "@/lib/reporte/generar";
import { urlPublica } from "@/lib/supabase/entorno";

export const metadata = { title: "Reporte diario · KPIs DLT" };

function primero(v: string | string[] | undefined): string | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  return s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined;
}

export default async function PaginaReporte(props: PageProps<"/reporte">) {
  const sp = await props.searchParams;
  const fecha = primero(sp.fecha) ?? hoyISO();

  const [panel, registros, textos, cuentas] = await Promise.all([
    panelDelDia(fecha),
    registrosDelDia(fecha),
    reporteDe(fecha),
    listarCuentas(),
  ]);

  const indice = cuentasPorId(cuentas);

  const mapa: MapaBase = panel.base
    ? await promediosDeLineaBase(panel.base.id)
    : new Map();

  const filas: FilaConDeltas[] = registros.flatMap((r) => {
    const cuenta = indice.get(r.cuenta_id);
    if (!cuenta) return [];
    const uno = [aFilaCalculo(r, cuenta)];
    const b = mapa.get(claveBase(cuenta.id, r.categoria)) ?? null;
    return [{
      registro: r,
      cuenta: cuenta.nombre,
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
    }];
  });

  const reporte = construirReporte(panel, filas, textos);
  const html = htmlCorreo(reporte, { urlBase: urlPublica() });
  const texto = textoPlano(reporte);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Reporte diario</h1>
          <p className="mt-0.5 text-sm text-[var(--color-tinta-suave)]">
            {reporte.sobre.length} sobre +80% · {reporte.bajo.length} bajo -80% ·{" "}
            {reporte.bloques.length}{" "}
            {reporte.bloques.length === 1 ? "plataforma" : "plataformas"} con
            actividad.
          </p>
        </div>
        <SelectorFecha fecha={fecha} ruta="/reporte" />
      </div>

      <Nota>
        El envío automático por correo todavía no está conectado. Por ahora el
        reporte se previsualiza, se edita y se copia o se descarga como HTML para
        pegarlo en el correo.
      </Nota>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <EditorReporte fecha={fecha} textos={reporte.textos} />
        <VistaPreviaReporte html={html} texto={texto} fecha={fecha} />
      </div>
    </div>
  );
}
