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
};

export function GraphicButton({
  offSrc,
  onSrc,
  active = false,
  onHover = true,
  width = 64,
  height = 32,
  title,
  ariaLabel,
  onClick,
  children,
  className,
  disabled,
}: GraphicButtonProps) {
  const [hover, setHover] = React.useState(false);
  const [down, setDown] = React.useState(false);

  // Daca lipsesc assets-urile, folosim fallback-ul HTML.
  if (!offSrc || !onSrc) {
    return (
      <button
        type="button"
        onClick={onClick}
        title={title}
        aria-label={ariaLabel}
        className={className}
        disabled={disabled}
      >
        {children}
      </button>
    );
  }

  const showOn = active || down || (onHover && hover);
  const src = showOn ? onSrc : offSrc;

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
      style={{
        width,
        height,
        padding: 0,
        border: "none",
        background: "transparent",
        cursor: disabled ? "not-allowed" : "pointer",
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
