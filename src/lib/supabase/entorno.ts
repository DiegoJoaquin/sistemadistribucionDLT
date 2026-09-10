/**
 * Lectura de las variables de entorno de Supabase.
 *
 * Sin esto, una variable ausente en Vercel se manifiesta como un "Invalid URL"
 * o un 500 sin contexto en la primera visita. El mensaje dice qué falta y dónde
 * se configura.
 */

function exigir(nombre: string, valor: string | undefined): string {
  if (!valor || valor.trim() === "") {
    throw new Error(
      `Falta la variable de entorno ${nombre}. En local va en .env.local; ` +
        `en Vercel, en Project Settings → Environment Variables. Los valores ` +
        `están en Supabase, en Project Settings → API.`,
    );
  }
  return valor;
}

export function urlSupabase(): string {
  return exigir("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
}

export function claveAnonima(): string {
  return exigir(
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

/**
 * URL pública de la aplicación, con protocolo y sin barra final.
 *
 * Sirve para las imágenes del correo: un cliente de correo no puede resolver
 * rutas relativas, necesita la dirección completa. En Vercel sale sola de
 * `VERCEL_PROJECT_PRODUCTION_URL`, sin configurar nada; `NEXT_PUBLIC_SITE_URL`
 * está para forzarla (dominio propio, o pruebas en local).
 *
 * Devuelve null si no hay ninguna: el reporte se genera igual, solo sin logo.
 */
export function urlPublica(): string | null {
  const explicita = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicita) return explicita.replace(/\/+$/, "");

  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercel) return `https://${vercel.replace(/\/+$/, "")}`;

  return null;
}
