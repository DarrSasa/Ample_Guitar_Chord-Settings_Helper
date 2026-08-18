// Aplicarea descriptorului optional `library.json` peste rezultatul parsat
// automat din structura de foldere. Descriptorul suprascrie DOAR ce nu poate
// fi dedus (ex. prefix vendor atipic, fade-out, hint de loop). Tot ce lipseste
// din descriptor ramane din parsare.

import type { GuitarLibraryInfo, LibraryDescriptor } from "./types";

export function applyDescriptor(
  lib: GuitarLibraryInfo,
  desc?: LibraryDescriptor | null
): GuitarLibraryInfo {
  if (!desc) return lib;

  const pitchOffset =
    typeof desc.pitchOffset === "number" && Number.isFinite(desc.pitchOffset)
      ? desc.pitchOffset
      : 0;

  return {
    ...lib,
    vendorPrefix:
      desc.vendorPrefix !== undefined && desc.vendorPrefix !== ""
        ? desc.vendorPrefix
        : lib.vendorPrefix,
    displayName:
      desc.displayName !== undefined && desc.displayName !== ""
        ? desc.displayName
        : lib.displayName,
    defaultFadeOut:
      typeof desc.defaultFadeOut === "number" && Number.isFinite(desc.defaultFadeOut)
        ? desc.defaultFadeOut
        : lib.defaultFadeOut,
    loop: desc.loop
      ? {
          enabled: desc.loop.enabled ?? lib.loop?.enabled,
          crossfade: desc.loop.crossfade ?? lib.loop?.crossfade,
        }
      : lib.loop,
    pitchOffset,
    // Aplicam offset-ul de inaltime pe notele individuale (chord-urile
    // preinregistrate sunt acorduri intregi, nu au sens de transpus).
    singleNotes:
      pitchOffset !== 0
        ? lib.singleNotes.map((g) => ({ ...g, midi: g.midi + pitchOffset }))
        : lib.singleNotes,
  };
}
