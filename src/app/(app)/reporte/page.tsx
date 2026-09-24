import Link from "next/link";
import { BotonEnviarReporte } from "@/componentes/BotonEnviarReporte";
import { NavegacionSemana } from "@/componentes/NavegacionSemana";
import { VistaPreviaReporte } from "@/componentes/VistaPreviaReporte";
import { Nota, Vacio } from "@/componentes/ui";
import { faltantesCorreo } from "@/lib/correo/entorno";
import { parsearDestinatarios } from "@/lib/correo/direcciones";
import { catastroDelPeriodo, enviosDeSemana } from "@/lib/datos/consultas";
import { hoyISO, rotularSemana, semanaDe } from "@/lib/dominio/formato";
import {
  construirReporteSemanal,
  htmlSemanal,
  textoSemanal,
} from "@/lib/reporte/semanal";
import { urlPublica } from "@/lib/supabase/entorno";

export const metadata = { title: "Reporte semanal · KPIs DLT" };

function primero(v: string | string[] | undefined): string | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  return s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined;
}

export default async function PaginaReporte(props: PageProps<"/reporte">) {
  const sp = await props.searchParams;
  const semana = semanaDe(primero(sp.semana) ?? hoyISO());

  const [catastro, envios] = await Promise.all([
    catastroDelPeriodo(semana.desde, semana.hasta),
    enviosDeSemana(semana.desde),
  ]);

  const reporte = construirReporteSemanal(catastro);
  const html = htmlSemanal(reporte, { urlBase: urlPublica() });
  const texto = textoSemanal(reporte);

  const faltantes = faltantesCorreo();
  const destinatarios = parsearDestinatarios(
    process.env.REPORTE_DESTINATARIOS,
  ).validos;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Reporte semanal</h1>
          <p className="mt-0.5 text-sm text-[var(--color-tinta-suave)]">
            {reporte.hayDatos ? (
              <>
                {reporte.publicaciones} publicaciones · {reporte.series} series ·{" "}
                {reporte.cuentas}{" "}
                {reporte.cuentas === 1 ? "cuenta" : "cuentas"} con actividad, del{" "}
                {reporte.periodo}.
              </>
            ) : (
              <>Semana del {reporte.periodo}.</>
            )}
          </p>
        </div>
        <NavegacionSemana semana={semana} ruta="/reporte" />
      </div>

      <Nota>
        El reporte se genera solo con los datos cargados: ya no tiene las
        preguntas de texto libre. El{" "}
        <Link href="/catastro" className="underline underline-offset-2">
          catastro
        </Link>{" "}
        muestra lo mismo con más detalle, y el{" "}
        <Link href="/reporte/diario" className="underline underline-offset-2">
          reporte diario
        </Link>{" "}
        sigue disponible para revisar un día puntual.
      </Nota>

      <BotonEnviarReporte
        semana={semana.desde}
        destinatarios={destinatarios}
        envios={envios}
        faltantes={faltantes}
        hayDatos={reporte.hayDatos}
      />

      {!reporte.hayDatos ? (
        <Vacio
          titulo={`No hay publicaciones registradas del ${reporte.periodo}.`}
          detalle="Sube las exportaciones de la semana desde el registro y las filas se crean solas. Sin datos el correo saldría vacío."
          accion={
            <Link href="/registro" className="boton-suave mt-1">
              Ir al registro
            </Link>
          }
        />
      ) : (
        <VistaPreviaReporte
          html={html}
          texto={texto}
          nombreArchivo={`catastro-semanal-${semana.desde}`}
          titulo="Vista previa del correo semanal"
        />
      )}
    </div>
  );
}
