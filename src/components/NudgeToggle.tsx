/*
 * NudgeToggle
 *
 * Comutator orizontal in stil FL Studio cu doua pozitii textuale
 * ("slide" | "swap"). Cerc alb pe pista intunecata; textul optiunii
 * ACTIVE se aprinde alb, cel INACTIVE ramane gri.
 *
 * Este proiectat sa arate exact ca in FL Studio (culori de baza),
 * dar poate primi orice pereche de etichete.
 */

export type NudgeMode = "slide" | "swap";

export function NudgeToggle({
  value,
  onChange,
  leftLabel = "slide",
  rightLabel = "swap",
}: {
  value: NudgeMode;
  onChange: (v: NudgeMode) => void;
  leftLabel?: string;
  rightLabel?: string;
}) {
  const isLeft = value === "slide";
  return (
    <div
      className="inline-flex items-center gap-2 rounded-sm border border-black bg-[#FCBF8D] px-2 py-1 text-xs shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] select-none"
      title="Chord nudge mode: slide impinge vecinii, swap le inverseaza"
    >
      <span className="font-semibold text-neutral-800">Chord nudge</span>
      <button
        type="button"
        role="switch"
        aria-checked={!isLeft}
        aria-label="Chord nudge mode"
        onClick={() => onChange(isLeft ? "swap" : "slide")}
        className="relative inline-flex items-center rounded-full border border-black overflow-hidden"
        style={{
          width: 76,
          height: 20,
          background: "linear-gradient(180deg, #232323 0%, #3a3a3a 100%)",
          boxShadow:
            "inset 0 1px 2px rgba(0,0,0,0.6), inset 0 -1px 1px rgba(255,255,255,0.05)",
        }}
      >
        {/* Text stanga (slide) */}
        <span
          style={{
            position: "absolute",
            left: 8,
            top: "50%",
            transform: "translateY(-50%)",
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: 0.3,
            color: isLeft ? "#ffffff" : "#7a7a7a",
            transition: "color 120ms ease",
            pointerEvents: "none",
          }}
        >
          {leftLabel}
        </span>
        {/* Text dreapta (swap) */}
        <span
          style={{
            position: "absolute",
            right: 8,
            top: "50%",
            transform: "translateY(-50%)",
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: 0.3,
            color: !isLeft ? "#ffffff" : "#7a7a7a",
            transition: "color 120ms ease",
            pointerEvents: "none",
          }}
        >
          {rightLabel}
        </span>
        {/* Cerc alb - se muta stanga/dreapta in functie de valoare */}
        <span
          style={{
            position: "absolute",
            top: 2,
            left: isLeft ? 2 : 76 - 16 - 2,
            width: 16,
            height: 16,
            borderRadius: "50%",
            background:
              "radial-gradient(circle at 35% 30%, #ffffff 0%, #e0e0e0 60%, #c0c0c0 100%)",
            boxShadow:
              "0 1px 2px rgba(0,0,0,0.6), inset 0 -1px 1px rgba(0,0,0,0.15)",
            transition: "left 140ms ease",
            pointerEvents: "none",
          }}
        />
      </button>
    </div>
  );
}

export default NudgeToggle;
