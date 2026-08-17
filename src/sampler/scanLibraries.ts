// Legatura intre IPC-ul Electron (listarea folderului "guitar samples") si
// parserul de librarii. In browser (fara Electron) desktopBridge lipseste si
// functia returneaza o lista goala — samplerul nu e disponibil, dar restul
// aplicatiei (soundfonts) ramane intact.

import type { DirEntry, GuitarLibraryInfo } from "./types";
import { scanLibraries as scanAll } from "./parseLibrary";
import type { SampleFetcher } from "./SamplerEngine";

export interface GuitarSamplesListing {
  root: string;
  exists: boolean;
  entries: DirEntry[];
}

export interface SampleReadResult {
  ok: boolean;
  bytes?: Uint8Array | null;
  error?: string;
}

// Conturul minim al puntii expuse de desktop/preload.cjs (adaugat in Etapa 2).
export interface GuitarSamplesBridge {
  listGuitarSamples?: () => Promise<GuitarSamplesListing>;
  readGuitarSample?: (relPath: string) => Promise<SampleReadResult>;
}

export function getBridge(): GuitarSamplesBridge | null {
  const w = window as unknown as { desktopBridge?: GuitarSamplesBridge };
  return w.desktopBridge ?? null;
}

export function bridgeAvailable(): boolean {
  const b = getBridge();
  return !!(b && typeof b.listGuitarSamples === "function" && typeof b.readGuitarSample === "function");
}

// Intoarce librariile gasite in "guitar samples" (prin IPC). Returneaza o
// lista goala daca puntea lipseste sau folderul nu exista.
export async function discoverLibraries(): Promise<GuitarLibraryInfo[]> {
  const bridge = getBridge();
  if (!bridge || typeof bridge.listGuitarSamples !== "function") return [];
  const listing = await bridge.listGuitarSamples();
  if (!listing || !listing.exists) return [];
  return scanAll(listing.entries);
}

// Fetcher de sample-uri pentru SamplerEngine, construit peste IPC.
export function makeSampleFetcher(): SampleFetcher | null {
  const bridge = getBridge();
  if (!bridge || typeof bridge.readGuitarSample !== "function") return null;
  return async (relPath: string): Promise<ArrayBuffer | null> => {
    const res = await bridge.readGuitarSample!(relPath);
    if (!res || !res.ok || !res.bytes) return null;
    // .slice() -> copie cu ArrayBuffer propriu (evitam SharedArrayBuffer si
    // byteOffset-urile complicate); decodeAudioData accepta ArrayBuffer.
    return res.bytes.slice().buffer;
  };
}

export { scanAll as scanLibrariesFromListing };
