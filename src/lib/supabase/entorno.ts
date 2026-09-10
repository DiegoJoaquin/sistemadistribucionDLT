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
