"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { iniciarSesion, type EstadoLogin } from "@/app/login/acciones";

function Boton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="boton w-full" disabled={pending}>
      {pending ? "Entrando…" : "Entrar"}
    </button>
  );
}

export function FormularioLogin({ volver }: { volver?: string }) {
  const [estado, accion] = useActionState<EstadoLogin | null, FormData>(
    iniciarSesion,
    null,
  );

  return (
    <form action={accion} className="space-y-4">
      {volver && <input type="hidden" name="volver" value={volver} />}

      <div className="space-y-1.5">
        <label className="etiqueta" htmlFor="email">
          Correo
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          className="campo"
          placeholder="nombre@dltsports.cl"
        />
      </div>

      <div className="space-y-1.5">
        <label className="etiqueta" htmlFor="password">
          Contraseña
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="campo"
        />
      </div>

      {estado?.error && (
        <p role="alert" className="text-sm text-red-700">
          {estado.error}
        </p>
      )}

      <Boton />
    </form>
  );
}
