import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { claveAnonima, urlSupabase } from "@/lib/supabase/entorno";

/**
 * Refresca la sesión de Supabase en cada request y saca a la calle a quien no
 * tenga sesión.
 *
 * En Next.js 16 esto se llama `proxy.ts` (antes `middleware.ts`) y corre
 * siempre en runtime Node, no en el edge.
 */
export async function proxy(request: NextRequest) {
  let respuesta = NextResponse.next({ request });

  const supabase = createServerClient(
    urlSupabase(),
    claveAnonima(),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesNuevas) {
          for (const { name, value } of cookiesNuevas) {
            request.cookies.set(name, value);
          }
          respuesta = NextResponse.next({ request });
          for (const { name, value, options } of cookiesNuevas) {
            respuesta.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // getUser() revalida el token contra el servidor de auth y, de paso, refresca
  // la cookie. No reemplazar por getSession().
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const ruta = request.nextUrl.pathname;
  const esPublica = ruta.startsWith("/login") || ruta.startsWith("/auth");

  if (!user && !esPublica) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("volver", ruta);
    return NextResponse.redirect(url);
  }

  if (user && ruta === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/registro";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return respuesta;
}

export const config = {
  matcher: [
    /*
     * Todo salvo archivos estáticos e imágenes.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
