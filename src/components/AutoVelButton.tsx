// Butonul "Auto Vel" — split: eticheta (toggle ON/OFF) + sageata (meniu de
// strategii). Design aprobat in docs/sampler/auto-vel-menu-mockup.html.
//
// - Click pe "Auto Vel" -> activeaza/dezactiveaza (badge: "off" <-> cod).
// - Click pe sageata ▾ -> deschide meniul cu strategiile 1..8.
// - Meniul: randuri pe 2 linii (numar + cod + nume / descriere), panou mai
//   lat decat Snap, fundal albastru #677987, check pe strategia selectata.

import {
  AUTO_VEL_STRATEGIES,
  type AutoVelStrategyId,
} from "../sampler/velocity";

export interface AutoVelButtonProps {
  active: boolean;
  strategy: AutoVelStrategyId;
  open: boolean;
  onToggle: () => void;
  onOpenChange: (open: boolean) => void;
  onSelect: (id: AutoVelStrategyId) => void;
}

export default function AutoVelButton({
  active,
  strategy,
  open,
  onToggle,
  onOpenChange,
  onSelect,
}: AutoVelButtonProps) {
  const selected = AUTO_VEL_STRATEGIES.find((s) => s.id === strategy);

  return (
    <div
      className="relative"
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className={`flex h-8 items-stretch rounded-sm border border-black bg-[#FCBF8D] text-xs shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] ${
          active || open ? "shadow-[0_0_10px_#ff8827]" : ""
        }`}
      >
        <button
          type="button"
          onClick={onToggle}
          title={
            active
              ? `Auto Vel activ (${selected?.name}). Click pentru a dezactiva.`
              : "Auto Vel inactiv. Click pentru a activa."
          }
          className="flex h-full items-center gap-1.5 px-2"
        >
          <span>Auto Vel</span>
          {/* BADGE: chenar albastru inchis la AMBELE stari (off + cod), mai
              mare, text la aceeasi inaltime (text-xs) cu eticheta 'Auto Vel'.
              Diferenta dintre stari = doar fundalul (plin la activ / gol la
              inactiv). */}
          <span
            className={`inline-flex min-w-[34px] items-center justify-center rounded-sm border-2 border-[#003970] px-1.5 text-xs font-extrabold uppercase leading-none ${
              active ? "h-[22px] bg-[#003970]" : "h-[22px] bg-transparent"
            }`}
          >
            {active ? (selected?.code ?? "?") : "off"}
          </span>
        </button>

        <div className="w-px self-stretch bg-black/35" />

        <button
          type="button"
          onClick={() => onOpenChange(!open)}
          title="Alege strategia de velocity"
          aria-label="Deschide meniul Auto Vel"
          className="flex h-full items-center px-1.5 text-[9px] leading-none"
        >
          &#9660;
        </button>
      </div>

      {open && (
        <div
          className="absolute left-0 top-9 z-40 w-[320px] max-w-[82vw] border border-black shadow-lg"
          style={{ backgroundColor: "#677987", color: "#fff" }}
        >
          <div className="border-b border-black/40 px-3 py-1.5 text-[10px] uppercase tracking-[0.1em] text-white/60">
            Strategii velocity
          </div>

          {AUTO_VEL_STRATEGIES.map((s, i) => {
            const isSel = s.id === strategy;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  onSelect(s.id);
                  onOpenChange(false);
                }}
                className={`block w-full border-b border-black/20 px-2 py-1.5 text-left last:border-b-0 hover:brightness-125 ${
                  isSel ? "brightness-110" : ""
                }`}
                style={{ backgroundColor: isSel ? "#58697a" : "#677987" }}
              >
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-sm border border-black/40 bg-black/30 text-[11px] font-bold">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-1.5">
                      <span className="font-extrabold tracking-[0.06em] text-[#ffd9ad]">
                        {s.code}
                      </span>
                      <span className="text-xs font-semibold">{s.name}</span>
                    </div>
                    <div className="text-[11px] leading-snug text-white/60">
                      {s.desc}
                    </div>
                  </div>
                  {isSel && (
                    <span className="flex-none text-[13px] font-extrabold text-[#ffd9ad]">
                      ✓
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
