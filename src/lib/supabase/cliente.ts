"use client";

import { createBrowserClient } from "@supabase/ssr";
import { claveAnonima, urlSupabase } from "./entorno";

/** Cliente de Supabase para componentes del navegador. */
export function supabaseCliente() {
  return createBrowserClient(
    urlSupabase(),
    claveAnonima(),
  );
}
