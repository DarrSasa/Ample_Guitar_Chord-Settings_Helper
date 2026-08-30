import { useEffect, useRef, useState } from "react";
import {
  EXPORT_OPTIONS,
  type ExportOption,
} from "../utils/ampleExtensions";

interface Props {
  option: ExportOption;
  onOptionChange: (o: ExportOption) => void;
  // handler-ul REAL de drag (cel al butonului vechi, care scrie fisierul temp
  // si porneste drag-ul nativ OS prin desktopBridge.midiDrag). Fara el, un
  // simplu setData() in dataTransfer NU produce un fisier care cade in DAW.
  onDragStart?: (e: React.DragEvent<HTMLButtonElement>) => void;
  onClick?: () => void;
}

// Butonul Drag & Drop de export. In dreapta lui o sectiune cu un triunghi cu
// varful in jos; la apasare se deschide un drop-down cu optiunile suprapuse
// (Midi / Midi (No Art&Fx) / Art&Fx (No Midi) / Griff / Griff (No Art&Fx)),
// din care utilizatorul bifeaza una inainte de drag & drop. Optiunile inca
// neimplementate (Art&Fx (No Midi)) apar gri, dezactivate.
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

  const current = EXPORT_OPTIONS.find((o) => o.id === option);

  return (
    <div ref={rootRef} className="relative flex">
      {/* butonul principal: drag & drop / click = exporta optiunea aleasa */}
      <button
        type="button"
        draggable
        title="Drag & Drop: exporta in optiunea aleasa din meniul din dreapta."
        onDragStart={onDragStart}
        onClick={onClick}
        className="h-8 rounded-l-sm border border-black bg-[#BFD7EA] px-3 text-xs font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]"
      >
        D&D: {current?.label ?? option}
      </button>

      {/* triunghiul care deschide drop-down-ul */}
      <button
        type="button"
        aria-label="Alege formatul de export"
        onClick={() => setOpen((v) => !v)}
        className="h-8 rounded-r-sm border border-l-0 border-black bg-[#9cc3e0] px-2 text-[10px] font-bold"
      >
        ▼
      </button>

      {open && (
        <div className="absolute left-0 top-9 z-50 min-w-[170px] rounded border border-black bg-white py-1 text-xs shadow-lg">
          {EXPORT_OPTIONS.map((o) => (
            <button
              key={o.id}
              type="button"
              disabled={!o.enabledNow}
              onClick={() => {
                if (!o.enabledNow) return;
                onOptionChange(o.id);
                setOpen(false);
              }}
              className={`block w-full px-3 py-1 text-left ${
                o.enabledNow
                  ? "hover:bg-[#FCBF8D]"
                  : "cursor-not-allowed bg-gray-300 text-gray-500"
              } ${o.id === option ? "font-bold" : ""}`}
            >
              {o.id === option ? "✓ " : ""}
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
