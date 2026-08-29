import { useEffect, useRef, useState } from "react";

// Formatele de export ale programului. midi = doar note; griff/briff/uriff =
// formatele Ample (acustice/electrice, bas, ukulele). Meniul va creste pe
// viitor (articulatii etc.) - deocamdata alegem formatul la click-dreapta.
export type ExportFormat = "midi" | "griff" | "briff" | "uriff";
const FORMATS: ExportFormat[] = ["midi", "griff", "briff", "uriff"];

interface Props {
  format: ExportFormat;
  onFormatChange: (f: ExportFormat) => void;
  // declansat la click-stanga / drag-start; serializarea efectiva (.griff etc.)
  // se leaga aici in etapa urmatoare, dupa SPEC-griff.md
  onExport?: (f: ExportFormat) => void;
}

export default function ExportFormatButton({
  format,
  onFormatChange,
  onExport,
}: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
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

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        draggable
        title="Drag & Drop: trage-l pentru a exporta in formatul ales. Click-dreapta: meniul de formate (midi / griff / briff / uriff)."
        onDragStart={(e) => {
          e.dataTransfer.setData("text/plain", format);
          e.dataTransfer.setData("application/x-ample-export", format);
          onExport?.(format);
        }}
        onClick={() => onExport?.(format)}
        onContextMenu={(e) => {
          e.preventDefault();
          setPos({ x: e.clientX, y: e.clientY });
          setOpen(true);
        }}
        className="h-8 rounded-sm border border-black bg-[#BFD7EA] px-3 text-xs font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]"
      >
        D&D: {format.toUpperCase()}
      </button>

      {open && (
        <div
          className="fixed z-50 min-w-[110px] rounded border border-black bg-white py-1 text-xs shadow-lg"
          style={{ left: pos.x, top: pos.y }}
        >
          {FORMATS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => {
                onFormatChange(f);
                setOpen(false);
              }}
              className={`block w-full px-3 py-1 text-left hover:bg-[#FCBF8D] ${
                f === format ? "font-bold" : ""
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
