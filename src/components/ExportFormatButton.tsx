import { useEffect, useRef, useState } from "react";
import { EXPORT_OPTIONS, type ExportOption } from "../utils/ampleExtensions";

interface Props {
  option: ExportOption;
  onOptionChange: (o: ExportOption) => void;
  // handler-ul REAL de drag (dragMidiToDaw): scrie fisierul temp si porneste
  // drag-ul nativ OS prin desktopBridge.midiDrag — altfel drop-ul in DAW nu
  // functioneaza (un simplu setData() ar cadea ca fisier .txt cu textul).
  onDragStart?: (e: React.DragEvent<HTMLButtonElement>) => void;
  onClick?: () => void;
}

// Butonul Drag & Drop de export, in stilul butonului "Auto Vel": eticheta
// "D&D" (fara ":") + badge ALBASTRU cu codul optiunii selectate, separator si
// sageata ▾ care deschide meniul numerotat (fundal #677987) cu prescurtari:
//   1 MIDI  2 MNAF  3 AFNM (gri)  4 GRIFF  5 GNAF
export default function ExportFormatButton({
  option,
  onOptionChange,
  onDragStart,
  onClick,
}: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node))
        setOpen(false);
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", key);
    };
  }, [open]);

  const selected = EXPORT_OPTIONS.find((o) => o.id === option);

  return (
    <div ref={rootRef} className="relative" onClick={(e) => e.stopPropagation()}>
      <div
        className={`flex h-8 items-stretch rounded-sm border border-black bg-[#FCBF8D] text-xs shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] ${
          open ? "shadow-[0_0_10px_#ff8827]" : ""
        }`}
      >
        {/* butonul principal: drag & drop / click */}
        <button
          type="button"
          draggable
          title="Drag & Drop: exporta in optiunea aleasa (vezi meniul ▾)."
          onDragStart={onDragStart}
          onClick={onClick}
          className="flex h-full cursor-grab items-center gap-1.5 px-2 active:cursor-grabbing"
        >
          <span>D&amp;D</span>
          {/* badge albastru cu codul optiunii selectate, ca la Auto Vel */}
          <span className="inline-flex h-[22px] min-w-[34px] items-center justify-center rounded-sm border-2 border-[#003970] bg-[#003970] px-1.5 text-xs font-extrabold uppercase leading-none text-white">
            {selected?.code ?? "?"}
          </span>
        </button>

        <div className="w-px self-stretch bg-black/35" />

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          title="Alege formatul de export"
          aria-label="Deschide meniul de export"
          className="flex h-full items-center px-1.5 text-[9px] leading-none"
        >
          &#9660;
        </button>
      </div>

      {open && (
        <div
          className="absolute left-0 top-9 z-40 w-[240px] max-w-[82vw] border border-black shadow-lg"
          style={{ backgroundColor: "#677987", color: "#fff" }}
        >
          <div className="border-b border-black/40 px-3 py-1.5 text-[10px] uppercase tracking-[0.1em] text-white/60">
            Format export
          </div>

          {EXPORT_OPTIONS.map((o, i) => {
            const isSel = o.id === option;
            const activ = o.enabledNow;
            return (
              <button
                key={o.id}
                type="button"
                disabled={!activ}
                onClick={() => {
                  if (!activ) return;
                  onOptionChange(o.id);
                  setOpen(false);
                }}
                className={`block w-full border-b border-black/20 px-2 py-1.5 text-left last:border-b-0 ${
                  activ ? "hover:brightness-125" : "cursor-not-allowed opacity-45"
                } ${isSel ? "brightness-110" : ""}`}
                style={{ backgroundColor: isSel ? "#58697a" : "#677987" }}
              >
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-sm border border-black/40 bg-black/30 text-[11px] font-bold">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-1.5">
                      <span className="font-extrabold tracking-[0.06em] text-[#ffd9ad]">
                        {o.code}
                      </span>
                      <span className="text-xs font-semibold">{o.name}</span>
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
