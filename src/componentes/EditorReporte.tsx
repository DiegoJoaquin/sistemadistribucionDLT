"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { guardarReporte, type Resultado } from "@/lib/datos/acciones";
import type { TextosReporte } from "@/lib/reporte/generar";

const CAMPOS: {
  nombre: keyof TextosReporte;
  pregunta: string;
  ayuda: string;
}[] = [
  {
    nombre: "plan_publicaciones",
    pregunta: "¿Se cumplió el plan de publicaciones?",
    ayuda: "Qué quedó pendiente y por qué.",
  },
  {
    nombre: "conversacion_audiencia",
    pregunta: "¿Qué observamos en la conversación de la audiencia?",
    ayuda:
      "Cuántos comentarios se respondieron, temas que generaron debate, oportunidades de contenido.",
  },
  {
    nombre: "aprendizajes",
    pregunta: "¿Qué aprendimos hoy?",
    ayuda: "Algo bueno y algo malo.",
  },
  {
    nombre: "recomendaciones",
    pregunta: "¿Qué recomendamos hacer mañana y por qué?",
    ayuda: "",
  },
  {
    nombre: "riesgos",
    pregunta: "¿Existe algún riesgo o decisión que requiera gerencia?",
    ayuda: "",
  },
];

function Boton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="boton" disabled={pending}>
      {pending ? "Guardando…" : "Guardar textos"}
    </button>
  );
}

export function EditorReporte({
  fecha,
  textos,
}: {
  fecha: string;
  textos: TextosReporte;
}) {
  const [estado, accion] = useActionState<Resultado | null, FormData>(
    guardarReporte,
    null,
  );

  return (
    <form action={accion} className="tarjeta p-4">
      <input type="hidden" name="fecha" value={fecha} />

      <h2 className="text-sm font-semibold">Lectura del día</h2>
      <p className="mt-1 text-sm text-[var(--color-tinta-suave)]">
        Lo que los números no cuentan. Estas secciones se guardan por fecha y se
        incluyen en el correo; las que queden vacías no aparecen.
      </p>

      <div className="mt-4 space-y-4">
        {CAMPOS.map((c) => (
          <div key={c.nombre} className="space-y-1.5">
            <label className="block text-[13px] font-medium" htmlFor={c.nombre}>
              {c.pregunta}
            </label>
            {c.ayuda && (
              <p className="text-[11px] text-[var(--color-tinta-tenue)]">{c.ayuda}</p>
            )}
            <textarea
              id={c.nombre}
              name={c.nombre}
              rows={3}
              defaultValue={textos[c.nombre] ?? ""}
              className="campo resize-y"
            />
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Boton />
        {estado?.mensaje && (
          <p
            role="status"
            className={`text-sm ${estado.ok ? "text-emerald-700" : "text-red-700"}`}
          >
            {estado.mensaje}
          </p>
        )}
        <span className="text-xs text-[var(--color-tinta-tenue)]">
          La vista previa se actualiza al guardar.
        </span>
      </div>
    </form>
  );
}
