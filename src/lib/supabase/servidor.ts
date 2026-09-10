import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { claveAnonima, urlSupabase } from "./entorno";
import type { PerfilRow } from "./tipos-db";

/**
 * Cliente de Supabase para Server Components, Server Actions y Route Handlers.
 * `cookies()` es asíncrono desde Next.js 16.
 */
export async function supabaseServidor() {
  const almacen = await cookies();

  return createServerClient(
    urlSupabase(),
    claveAnonima(),
    {
      cookies: {
        getAll() {
          return almacen.getAll();
        },
        setAll(cookiesNuevas) {
          try {
            for (const { name, value, options } of cookiesNuevas) {
              almacen.set(name, value, options);
            }
          } catch {
            // Los Server Components no pueden escribir cookies. El refresco de
            // sesión lo hace proxy.ts, así que se puede ignorar sin riesgo.
          }
        },
      },
    },
  );
}

export interface Sesion {
  usuarioId: string;
  perfil: PerfilRow;
}

/**
 * Exige sesión Y autorización.
 *
 * Usa `getUser()` y no `getSession()`: getUser valida el token contra el
 * servidor de auth, getSession solo lee la cookie y es falsificable.
 *
 * La autorización va aparte de la sesión porque la `anon key` es pública: si el
 * proyecto tiene los registros abiertos, alguien puede crearse una cuenta por
 * API y quedar `authenticated` sin ser del equipo. La base también lo bloquea
 * por RLS; esto es para poder explicarlo en pantalla en vez de mostrar tablas
 * vacías sin razón aparente.
 */
export async function exigirSesion(): Promise<Sesion> {
  const supabase = await supabaseServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: perfil } = await supabase
    .from("perfiles")
    .select("*")
    .eq("id", user.id)
    .single<PerfilRow>();

  if (!perfil) redirect("/login");
  if (!perfil.autorizado) redirect("/sin-acceso");

  return { usuarioId: user.id, perfil };
}
