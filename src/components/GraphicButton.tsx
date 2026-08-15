import React from "react";

/*
 * GraphicButton
 *
 * Buton care afiseaza o imagine (SVG cu PNG embed) in stare Off
 * si o alta imagine in stare On. On se activeaza cand `active === true`
 * SAU cand utilizatorul apasa (mouse down / hover activ, dupa preferinta).
 *
 * Assets-urile (fisierele SVG) sunt generate din PSD prin scriptul
 *   scripts/psd-to-svg.mjs
 * si se pun in src/assets/graphics/svg/.
 *
 * Daca un asset nu exista inca (ex: PSD-ul nu a fost inca urcat), componenta
 * face fallback la butonul HTML clasic primit ca `children`, ca aplicatia sa
 * nu se strice.
 *
 * Suporta si mode "drag" (draggable + onDragStart) pentru butoane cum e D&D
 * care trebuie sa initieze un drag OS-native catre alte aplicatii.
 */

export type GraphicButtonProps = {
  /** URL-ul SVG-ului pentru starea Off (import ...svg). Poate fi undefined. */
  offSrc?: string;
  /** URL-ul SVG-ului pentru starea On (import ...svg). Poate fi undefined. */
  onSrc?: string;
  /** true = afiseaza On permanent (modul activ). */
  active?: boolean;
  /** true = afiseaza On si la hover. Default: true. */
  onHover?: boolean;
  /** Latime CSS. Default 64px. */
  width?: number | string;
  /** Inaltime CSS. Default 32px. */
  height?: number | string;
  /** Text pentru tooltip. */
  title?: string;
  /** Aria-label pentru accesibilitate. */
  ariaLabel?: string;
  /** Callback click. */
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  /** Fallback HTML afisat cand assets-urile lipsesc. */
  children?: React.ReactNode;
  /** Clase extra pentru fallback (nu se aplica pe varianta grafica). */
  className?: string;
  /** Dezactiveaza butonul. */
  disabled?: boolean;
  /** Face butonul draggable (pentru drag&drop catre alte aplicatii). */
  draggable?: boolean;
  /** Handler pentru inceputul unui drag. */
  onDragStart?: (e: React.DragEvent<HTMLButtonElement>) => void;
  /** Cursor CSS custom (default: pointer, sau grab daca draggable). */
  cursor?: string;
};

export function GraphicButton({
  offSrc,
  onSrc,
  active = false,
  onHover = false,
  width = 64,
  height = 32,
  title,
  ariaLabel,
  onClick,
  children,
  className,
  disabled,
  draggable,
  onDragStart,
  cursor,
}: GraphicButtonProps) {
  const [hover, setHover] = React.useState(false);
  const [down, setDown] = React.useState(false);

  // Daca lipsesc assets-urile, folosim fallback-ul HTML - butonul textual
  // clasic ramane functional pana cand aduci PSD-ul.
  if (!offSrc || !onSrc) {
    return (
      <button
        type="button"
        onClick={onClick}
        title={title}
        aria-label={ariaLabel}
        className={className}
        disabled={disabled}
        draggable={draggable}
        onDragStart={onDragStart}
      >
        {children}
      </button>
    );
  }

  const showOn = active || down || (onHover && hover);
  const src = showOn ? onSrc : offSrc;
  const resolvedCursor = disabled
    ? "not-allowed"
    : cursor ?? (draggable ? "grab" : "pointer");

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setDown(false); }}
      onMouseDown={() => setDown(true)}
      onMouseUp={() => setDown(false)}
      title={title}
      aria-label={ariaLabel ?? title}
      disabled={disabled}
      draggable={draggable}
      onDragStart={onDragStart}
      style={{
        width,
        height,
        padding: 0,
        border: "none",
        background: "transparent",
        cursor: resolvedCursor,
        display: "inline-block",
        lineHeight: 0,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <img
        src={src}
        alt={ariaLabel ?? title ?? ""}
        draggable={false}
        style={{ width: "100%", height: "100%", display: "block", userSelect: "none", pointerEvents: "none" }}
      />
    </button>
  );
}

export default GraphicButton;
