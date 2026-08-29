// Extensiile de fisier folosite de instrumentele Ample Sound si filtrarea lor
// dupa instrumentul selectat, pentru functia Drag & Drop.
//
// Surse:
//  - fisierele reale urcate de utilizator in documente/griff/exporturi/
//    (AGM/AGLP/AGTC/AME -> .griff, ABJ/ABJF/ABMR5 -> .briff, AEU -> .uriff);
//  - Ample Sound / KVR: chitarile exporta .griff, basii .briff (forum KVR
//    "How to use/import *.briff-Files?"), ukulele/ethno .uriff;
//  - joanroig/state-to-griff: .griff se citeste in Riffer.
//
// Lista e extensibila: adauga aici orice alta extensie Ample aparuta pe
// viitor (chiar si pentru instrumente care nu sunt chitari).

export type ExportFormat = "midi" | "griff" | "briff" | "uriff";

// Toate formatele cunoscute (midi = doar note, celelalte = fisiere Riffer).
export const EXPORT_FORMATS: ExportFormat[] = ["midi", "griff", "briff", "uriff"];

export type AmpleFamily = "chitara" | "bas" | "ukulele";

// Extensia Riffer a fiecarei familii.
export const FAMILY_EXT: Record<AmpleFamily, ExportFormat> = {
  chitara: "griff",
  bas: "briff",
  ukulele: "uriff",
};

// Recunoaste familia din numele instrumentului / librariei selectate.
export function familyFromName(name?: string | null): AmpleFamily {
  const n = (name ?? "").toLowerCase();
  if (/bass|bas\b|ray ?5|jaco|dingwall|fretless|\babj|\babfl|\babmr/.test(n))
    return "bas";
  if (/ukulele|ethno|\baeu/.test(n)) return "ukulele";
  return "chitara";
}

// Formatele active pentru instrumentul selectat: midi e mereu activ, plus
// extensia Riffer a familiei. Restul apar dezactivate in meniu.
export function allowedFormats(name?: string | null): ExportFormat[] {
  return ["midi", FAMILY_EXT[familyFromName(name)]];
}

// Formatul implicit (extensia Riffer a familiei) cand se schimba instrumentul.
export function defaultFormatFor(name?: string | null): ExportFormat {
  return FAMILY_EXT[familyFromName(name)];
}
