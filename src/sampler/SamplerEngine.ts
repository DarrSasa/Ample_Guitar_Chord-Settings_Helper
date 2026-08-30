// Motorul sampler pentru librariile de chitara (note individuale + acorduri
// preinregistrate), pe Web Audio.
//
// Spre deosebire de vechea cale WAV (care transpunea O SINGURA nota pe toate
// inaltimile si suna fals), acest motor foloseste un GRUP de note reale:
//   - pentru fiecare nota MIDI alege cel mai apropiat sample disponibil;
//   - transpune (playbackRate) DOAR diferenta mica ramasa, daca e cazul;
//   - alege stratul de velocity in functie de velocity-ul MIDI (0..127).
//
// Fisierele audio NU se pot citi direct din renderer prin fetch (pagina e
// incarcata prin file:// in Electron, iar Chromium blocheaza fetch-ul pe
// fisiere locale). De aceea octetii vin prin IPC: `fetchSample` e injectat
// din App.tsx si apeleaza desktopBridge.readGuitarSample(relPath).

import type { ChordGroup, SingleNoteGroup } from "./types";

export interface PlayOptions {
  when?: number;       // AudioContext time (default: acum)
  duration?: number;   // secunde (default: lungimea naturala a sample-ului)
  gain?: number;       // scalare suplimentara a volumului (default: 1)
  fadeOut?: number;    // secunde de fade-out la sfarsit (default: 0.02)
}

export interface PlayNoteSpec {
  midi: number;
  velocity: number; // 0..127
}

// Citeste octetii unui fisier audio (relativ la radacina "guitar samples")
// si ii returneaza ca ArrayBuffer (sau null daca nu poate).
export type SampleFetcher = (relPath: string) => Promise<ArrayBuffer | null>;

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export function midiToName(midi: number): string {
  const oct = Math.floor(midi / 12) - 1;
  return NOTE_NAMES[((midi % 12) + 12) % 12] + oct;
}

export class SamplerEngine {
  private ctx: AudioContext | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private pending = new Map<string, Promise<AudioBuffer>>();
  private fetchSample: SampleFetcher;

  // `ctx` optional: daca aplicatia are deja un AudioContext (ex. pentru
  // soundfonts), il refolosim in loc sa cream unul nou.
  constructor(fetchSample: SampleFetcher, ctx?: AudioContext) {
    this.fetchSample = fetchSample;
    this.ctx = ctx ?? null;
  }

  ensureContext(): AudioContext {
    if (!this.ctx) {
      const Ctor = (window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)!;
      this.ctx = new Ctor();
    }
    if (this.ctx.state === "suspended") {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  get currentTime(): number {
    return this.ensureContext().currentTime;
  }

  // Mapare velocity MIDI (0..127) -> index de layer (0..layerCount-1).
  // Daca avem velocity-urile REALE ale straturilor (layerVelocities), alegem
  // stratul cu velocity-ul CEL MAI APROPIAT de cel cerut; altfel mapam uniform.
  velocityToLayerIndex(
    velocity: number,
    layerCount: number,
    layerVelocities?: number[]
  ): number {
    if (layerCount <= 0) return 0;
    const v = Math.max(0, Math.min(127, Math.round(velocity)));
    if (layerVelocities && layerVelocities.length === layerCount) {
      let best = 0;
      let bestDist = Number.POSITIVE_INFINITY;
      for (let i = 0; i < layerCount; i++) {
        const d = Math.abs(layerVelocities[i] - v);
        if (d < bestDist) {
          bestDist = d;
          best = i;
        }
      }
      return best;
    }
    return Math.min(layerCount - 1, Math.round((v / 127) * (layerCount - 1)));
  }

  // Gaseste grupul de note cel mai apropiat de `midi` (exact daca exista).
  findNoteGroup(groups: SingleNoteGroup[], midi: number): SingleNoteGroup | null {
    if (groups.length === 0) return null;
    let best = groups[0];
    let bestDist = Math.abs(groups[0].midi - midi);
    for (const g of groups) {
      const d = Math.abs(g.midi - midi);
      if (d < bestDist) {
        best = g;
        bestDist = d;
      }
    }
    return best;
  }

  // Gaseste un acord preinregistrat dupa radacina + calitate.
  findChordGroup(chords: ChordGroup[], root: string, quality: "major" | "minor"): ChordGroup | null {
    return chords.find((c) => c.root === root && c.quality === quality) ?? null;
  }

  async load(relPath: string): Promise<AudioBuffer> {
    const ctx = this.ensureContext();
    const cached = this.buffers.get(relPath);
    if (cached) return cached;
    const inFlight = this.pending.get(relPath);
    if (inFlight) return inFlight;

    const p = (async () => {
      const bytes = await this.fetchSample(relPath);
      if (!bytes || bytes.byteLength === 0) {
        throw new Error("sample indisponibil: " + relPath);
      }
      // decodeAudioData isi "ia" bufferul; ii dam o copie exacta (ArrayBuffer).
      const copy = bytes.slice(0);
      const buf = await ctx.decodeAudioData(copy);
      this.buffers.set(relPath, buf);
      return buf;
    })();

    this.pending.set(relPath, p);
    try {
      return await p;
    } finally {
      this.pending.delete(relPath);
    }
  }

  // Rezolva NOTA -> calea sample-ului (cel mai apropiat sample + layer de
  // velocity). Intoarce null daca nu exista niciun sample potrivit.
  private resolveSample(
    groups: SingleNoteGroup[],
    midi: number,
    velocity: number
  ): { relPath: string; sampleMidi: number } | null {
    const g = this.findNoteGroup(groups, midi);
    if (!g) return null;
    const layerIdx = this.velocityToLayerIndex(velocity, g.layers.length, g.layerVelocities);
    return { relPath: g.layers[layerIdx], sampleMidi: g.midi };
  }

  // Calculeaza timpul de start astfel incat mai multe note sa inceapa EXACT
  // simultan. Daca `when` e in trecut (posibil cand sample-urile au fost
  // incarcate asincron), il impingem putin in viitor ca toate notele unui
  // acord sa porneasca impreuna (evita efectul de "strum" la primul acord).
  private scheduleStart(when?: number): number {
    const now = this.ensureContext().currentTime;
    const lookahead = 0.03; // mica marja ca sa nu pornim "in trecut"
    if (when === undefined) return now + lookahead;
    return Math.max(when, now + lookahead);
  }

  // Porneste un sample DEJA INCARCAT (sincron, fara await) cu pitch-shift
  // (daca e nevoie) + velocity -> gain.
  private startSample(
    relPath: string,
    sampleMidi: number,
    targetMidi: number,
    velocity: number,
    opts: PlayOptions
  ): void {
    const ctx = this.ensureContext();
    const buf = this.buffers.get(relPath);
    if (!buf) return; // nu ar trebui sa se intample (se incarca inainte)

    const when = this.scheduleStart(opts.when);
    const gainScale = opts.gain ?? 1;

    const src = ctx.createBufferSource();
    src.buffer = buf;
    // Transpunem doar diferenta mica ramasa (daca sample-ul nu e exact nota).
    src.playbackRate.value = 2 ** ((targetMidi - sampleMidi) / 12);

    const gain = ctx.createGain();
    // Curba de volum: (v/127)^2 -> perceptia e aproximativ lineara in amplitudine.
    const amp = Math.max(0.0001, Math.pow(Math.max(0, velocity) / 127, 2) * gainScale);
    gain.gain.setValueAtTime(amp, when);
    // Fade-in foarte scurt ca sa nu existe click la start.
    gain.gain.linearRampToValueAtTime(amp, when + 0.003);

    src.connect(gain);
    gain.connect(ctx.destination);
    src.start(when);

    if (opts.duration !== undefined) {
      const stopAt = when + opts.duration;
      const fade = opts.fadeOut ?? 0.02;
      gain.gain.setValueAtTime(amp, Math.max(when, stopAt - fade));
      gain.gain.linearRampToValueAtTime(0.0001, stopAt + 0.001);
      src.stop(stopAt + 0.001);
    }
  }

  // Reda o nota individuala (alege cel mai apropiat sample + layer de velocity).
  async playNote(
    groups: SingleNoteGroup[],
    midi: number,
    velocity: number,
    opts: PlayOptions = {}
  ): Promise<void> {
    const res = this.resolveSample(groups, midi, velocity);
    if (!res) return;
    await this.load(res.relPath);
    this.startSample(res.relPath, res.sampleMidi, midi, velocity, opts);
  }

  // Reda un acord complet (note + velocity per nota). Toate notele se incarca
  // INAINTE de a porni, apoi pornesc la ACELASI timp — garantat simultan,
  // fara efect de "strum" la prima redare.
  async playChord(
    groups: SingleNoteGroup[],
    notes: PlayNoteSpec[],
    opts: PlayOptions = {}
  ): Promise<void> {
    const resolved: Array<{
      relPath: string;
      sampleMidi: number;
      midi: number;
      velocity: number;
    }> = [];
    for (const n of notes) {
      const r = this.resolveSample(groups, n.midi, n.velocity);
      if (r) resolved.push({ ...r, midi: n.midi, velocity: n.velocity });
    }

    if (resolved.length === 0) return;

    // 1) Incarca TOTI octetii (in paralel) — dupa asta totul e in memorie.
    await Promise.all(resolved.map((r) => this.load(r.relPath)));

    // 2) Un SINGUR timp de start comun pentru toate notele.
    const when = this.scheduleStart(opts.when);

    // 3) Porneste-le pe toate sincron, cu NORMALIZARE de volum: un acord cu
    //    multe voci nu trebuie sa sune disproportionat de tare fata de unul cu
    //    putine voci. Scalăm amplitudinea fiecarei note cu 1/sqrt(N) astfel
    //    incat energia totala sa ramana ~constanta => aceeasi inaltime a barei
    //    de velocity = acelasi nivel de volum, indiferent de numarul de voci
    //    (similar cu redarea in pluginul de chitara).
    const norm = 1 / Math.sqrt(Math.max(1, resolved.length));
    resolved.forEach((r) => {
      this.startSample(r.relPath, r.sampleMidi, r.midi, r.velocity, {
        ...opts,
        when,
        gain: (opts.gain ?? 1) * norm,
      });
    });
  }

  // Reda un acord PREINREGISTRAT (folder Chords), fara pitch-shift.
  async playChordSample(
    chord: ChordGroup,
    velocity: number,
    opts: PlayOptions = {}
  ): Promise<void> {
    const layerIdx = this.velocityToLayerIndex(velocity, chord.layers.length);
    const relPath = chord.layers[layerIdx];
    await this.load(relPath);
    // sampleMidi = targetMidi (nu transpunem deloc).
    this.startSample(relPath, 60, 60, velocity, opts);
  }
}
