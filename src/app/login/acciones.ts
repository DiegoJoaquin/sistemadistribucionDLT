"use server";

import { redirect } from "next/navigation";
import { supabaseServidor } from "@/lib/supabase/servidor";

export interface EstadoLogin {
  error?: string;
}

export async function iniciarSesion(
  _previo: EstadoLogin | null,
  fd: FormData,
): Promise<EstadoLogin> {
  const email = String(fd.get("email") ?? "").trim();
  const password = String(fd.get("password") ?? "");
  const volver = String(fd.get("volver") ?? "") || "/registro";

  if (!email || !password) {
    return { error: "Escribe tu correo y tu contraseña." };
  }

  const supabase = await supabaseServidor();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // El código real queda en el log del servidor: sin esto, un problema de
    // configuración (una cuenta sin confirmar, por ejemplo) se ve idéntico a
    // una contraseña mal escrita y no hay por dónde empezar a buscar.
    console.error(
      `[login] falló para ${email}: code=${error.code ?? "?"} status=${error.status ?? "?"} · ${error.message}`,
    );
    return { error: mensajeDeError(error.code, error.status) };
  }

  redirect(volver);
}

/**
 * Traduce el error de Supabase a algo que se pueda accionar.
 *
 * Para credenciales no se distingue "correo inexistente" de "contraseña
 * incorrecta": eso permitiría averiguar qué correos tienen cuenta. El resto de
 * los casos sí se explican, porque son problemas de configuración y callarlos
 * solo hace perder tiempo.
 */
function mensajeDeError(code: string | undefined, status: number | undefined): string {
  switch (code) {
    case "email_not_confirmed":
      return "Esta cuenta todavía no está confirmada. Confírmala desde el panel de Supabase (Authentication → Users) o desactiva la confirmación por correo.";
    case "invalid_credentials":
      return "Correo o contraseña incorrectos.";
    case "user_banned":
      return "Esta cuenta está bloqueada en Supabase.";
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return "Demasiados intentos seguidos. Espera un minuto y vuelve a probar.";
    case "email_provider_disabled":
      return "El acceso con correo y contraseña está desactivado en Supabase (Authentication → Sign In / Providers).";
    default:
      if (status === 429) {
        return "Demasiados intentos seguidos. Espera un minuto y vuelve a probar.";
      }
      return "No pude iniciar sesión. Revisa el detalle en el log del servidor.";
  }
}
