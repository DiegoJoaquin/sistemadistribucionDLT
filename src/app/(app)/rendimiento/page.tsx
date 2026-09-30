import Link from "next/link";
import { PanelRendimiento } from "@/componentes/PanelRendimiento";
import { Nota, Vacio } from "@/componentes/ui";
import { cuentasPorId, listarCuentas, listarRegistrosDelRango } from "@/lib/datos/consultas";
import type { PublicacionPunto } from "@/lib/dominio/rendimiento";
import { fechaCorta, hoyISO, semanaDe, sumarDias } from "@/lib/dominio/formato";
import type { CuentaRow, RegistroConAutor } from "@/lib/supabase/tipos-db";

export const metadata = { title: "Rendimiento · KPIs DLT" };

function fecha(v: string | string[] | undefined): string | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  return s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined;
}

/**
 * De registros a publicaciones.
 *
 * Es la única vista que baja al nivel de la publicación: el resto pasa por
 * `aFilaCalculo`, que se queda con lo que necesitan los promedios de §9.1 y
 * descarta el título, el enlace y el desglose de interacciones. Acá hace falta
 * todo eso, porque cada marca es una publicación concreta que alguien va a
 * querer abrir.
 */
function aPuntos(
  registros: RegistroConAutor[],
  indice: Map<string, CuentaRow>,
): PublicacionPunto[] {
  return registros.flatMap((r) => {
    const cuenta = indice.get(r.cuenta_id);
    if (!cuenta) return [];
    return [
      {
        id: r.id,
        fecha: r.fecha,
        cuentaId: cuenta.id,
        cuenta: cuenta.nombre,
        // Las reglas dependen de la red de la cuenta, no del nombre de la fila.
        red: cuenta.red,
        categoria: r.categoria,
        tipo: r.tipo,
        hashtag: r.hashtag,
        titulo: r.titulo_contenido,
        enlace: r.enlace,
        publicaciones: r.publicaciones,
        alcance: r.alcance,
        visualizaciones: r.visualizaciones,
        interacciones: r.interacciones,
        nuevos_seguidores: r.nuevos_seguidores,
        me_gusta: r.me_gusta,
        comentarios: r.comentarios,
        compartidos: r.compartidos,
        guardados: r.guardados,
        favoritos: r.favoritos,
        duracion_s: r.duracion_s,
      },
    ];
  });
}

export default async function PaginaRendimiento(props: PageProps<"/rendimiento">) {
  const sp = await props.searchParams;
  const hoy = hoyISO();

  /*
   * Ocho semanas por defecto, menos que en analítica.
   *
   * Acá cada publicación es una marca y no un promedio semanal, así que un
   * trimestre de todas las cuentas ya son más de mil marcas superpuestas. Dos
   * meses alcanzan para ver la forma de la nube, y el rango se puede estirar.
   */
  const semanaActual = semanaDe(hoy);
  const desde = fecha(sp.desde) ?? sumarDias(semanaActual.desde, -7 * 7);
  const hasta = fecha(sp.hasta) ?? semanaActual.hasta;

  const [registros, cuentas] = await Promise.all([
    listarRegistrosDelRango(desde, hasta),
    listarCuentas(),
  ]);

  const puntos = aPuntos(registros, cuentasPorId(cuentas));

  /*
   * Si NINGUNA publicación del período trae el desglose, lo más probable es que
   * las exportaciones se hayan subido antes de que el registro guardara estas
   * columnas. Decirlo evita el diagnóstico equivocado de que la herramienta no
   * funciona.
   */
  const conDesglose = puntos.filter(
    (p) => p.me_gusta !== null || p.comentarios !== null || p.compartidos !== null,
  ).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Rendimiento</h1>
          <p className="mt-0.5 max-w-2xl text-sm text-[var(--color-tinta-suave)]">
            Publicación por publicación: qué rindió, qué tienen en común las que
            rinden y cuánto rinde una publicación normal.
          </p>
        </div>

        {/* El rango va en la URL: se puede compartir el enlace de una vista. */}
        <form method="get" className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label className="etiqueta" htmlFor="desde">
              Desde
            </label>
            <input
              id="desde"
              name="desde"
              type="date"
              defaultValue={desde}
              className="campo"
            />
          </div>
          <div className="space-y-1">
            <label className="etiqueta" htmlFor="hasta">
              Hasta
            </label>
            <input
              id="hasta"
              name="hasta"
              type="date"
              defaultValue={hasta}
              className="campo"
            />
          </div>
          <button type="submit" className="boton-suave">
            Ver período
          </button>
        </form>
      </div>

      {puntos.length === 0 ? (
        <Vacio
          titulo={`No hay publicaciones registradas entre el ${fechaCorta(desde)} y el ${fechaCorta(hasta)}.`}
          detalle="Sube las exportaciones desde el registro y las filas se crean solas, o elige otro período."
          accion={
            <Link href="/registro" className="boton-suave mt-1">
              Ir al registro
            </Link>
          }
        />
      ) : (
        <>
          {conDesglose === 0 && (
            <Nota>
              Ninguna de las {puntos.length} publicaciones de este período tiene
              me gusta, comentarios ni compartidos por separado. El registro
              empezó a guardar ese desglose después de que se cargaran estos
              datos: vuelve a subir las mismas exportaciones desde el{" "}
              <Link href="/registro" className="underline underline-offset-2">
                registro
              </Link>{" "}
              y las columnas se completan solas, sin duplicar nada. Mientras
              tanto las métricas de alcance, visualizaciones, interacciones y
              engagement sí funcionan.
            </Nota>
          )}

          <PanelRendimiento puntos={puntos} rango={{ desde, hasta }} />

          <Nota>
            Acá una marca es una publicación, así que no hay promedios por
            publicación: es la única vista que no los usa. Para ver cómo
            evolucionan los KPIs de cada cuenta semana a semana está la{" "}
            <Link href="/analitica" className="underline underline-offset-2">
              analítica
            </Link>
            .
          </Nota>
        </>
      )}
    </div>
  );
}
