import { useEffect, useRef, useState } from "react";
import { EXPORT_FORMATS, type ExportFormat } from "../utils/ampleExtensions";

interface Props {
  format: ExportFormat;
  onFormatChange: (f: ExportFormat) => void;
  // formatele ACTIVE pt. instrumentul selectat; celelalte apar gri, dezactivate.
  // daca lipseste, toate sunt active.
  enabledFormats?: ExportFormat[];
  // declansat la click-stanga / drag-start; serializarea efectiva (.griff etc.)
  // se leaga aici in etapa urmatoare, dupa SPEC-griff.md
  onExport?: (f: ExportFormat) => void;
}

export default function ExportFormatButton({
  format,
  onFormatChange,
  enabledFormats,
  onExport,
}: Props) {
  const isEnabled = (f: ExportFormat) =>
    !enabledFormats || enabledFormats.includes(f);
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
          {EXPORT_FORMATS.map((f) => {
            const activ = isEnabled(f);
            return (
              <button
                key={f}
                type="button"
                disabled={!activ}
                onClick={() => {
                  if (!activ) return;
                  onFormatChange(f);
                  setOpen(false);
                }}
                className={`block w-full px-3 py-1 text-left ${
                  activ ? "hover:bg-[#FCBF8D]" : "cursor-not-allowed bg-gray-300 text-gray-500"
                } ${f === format ? "font-bold" : ""}`}
              >
                {f}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
