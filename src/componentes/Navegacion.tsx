"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ENLACES = [
  { href: "/registro", texto: "Registro" },
  { href: "/panel", texto: "Panel diario" },
  { href: "/historico", texto: "Histórico" },
  { href: "/perfil", texto: "Métricas de perfil" },
  { href: "/base", texto: "Línea base" },
  { href: "/reporte", texto: "Reporte" },
  { href: "/cuentas", texto: "Cuentas" },
] as const;

export function Navegacion() {
  const ruta = usePathname();

  return (
    <nav className="scroll-x -mb-px flex gap-1" aria-label="Secciones">
      {ENLACES.map((e) => {
        const activo = ruta === e.href || ruta.startsWith(`${e.href}/`);
        return (
          <Link
            key={e.href}
            href={e.href}
            aria-current={activo ? "page" : undefined}
            className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-sm transition ${
              activo
                ? "border-[var(--color-tinta)] font-medium text-[var(--color-tinta)]"
                : "border-transparent text-[var(--color-tinta-suave)] hover:text-[var(--color-tinta)]"
            }`}
          >
            {e.texto}
          </Link>
        );
      })}
    </nav>
  );
}
