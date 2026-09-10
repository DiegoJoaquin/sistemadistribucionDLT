import Image from "next/image";

/**
 * Logo de DLT Sports.
 *
 * El archivo original mide 3751×3813 con fondo transparente y el azul de marca
 * exacto (#001326). Acá se sirve una versión de 800 px de ancho, que alcanza
 * para pantallas retina en todos los tamaños en que se usa.
 *
 * La proporción va calculada, no aproximada: reservar el alto exacto evita que
 * el texto de al lado salte cuando la imagen termina de cargar.
 */
const PROPORCION = 813 / 800;

export function LogoDLT({
  ancho = 32,
  prioritario = false,
  className,
}: {
  ancho?: number;
  /** Para el logo grande del login, que es lo primero que se ve. */
  prioritario?: boolean;
  className?: string;
}) {
  return (
    <Image
      src="/logo-dlt.png"
      alt="DLT Sports"
      width={ancho}
      height={Math.round(ancho * PROPORCION)}
      priority={prioritario}
      className={className}
    />
  );
}
