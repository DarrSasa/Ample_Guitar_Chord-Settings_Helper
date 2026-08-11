// (React nu e importat - folosim doar JSX + tipuri.)

/*
 * RubberBandOverlay
 *
 * Overlay full-viewport care afiseaza dreptunghiul de selectie tip
 * "rubber band" (marching-ants dashed border) c\u00e2nd utilizatorul face
 * long-press + drag pe fundal (Builder sau Chord Table).
 *
 * Coordonatele sunt \u00een pixeli viewport (clientX/clientY), NU relative
 * la vreun container - la fel ca `getBoundingClientRect()` returnat
 * de elementele testate contra dreptunghiului.
 *
 * `pointerEvents: none` la nivelul overlay-ului asigura ca dreptunghiul
 * nu blocheaza mouse events care trebuie sa ajunga la elementele de
 * dedesubt (butoane, acorduri) - important pentru feedback real-time.
 */

export type RubberBandRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export function RubberBandOverlay({ rect }: { rect: RubberBandRect | null }) {
  if (!rect) return null;
  return (
    <div
      style={{
        position: "fixed",
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        border: "1.5px dashed #ff8827",
        background: "rgba(255, 136, 39, 0.15)",
        pointerEvents: "none",
        zIndex: 9999,
        boxSizing: "border-box",
      }}
      aria-hidden
    />
  );
}

export default RubberBandOverlay;
