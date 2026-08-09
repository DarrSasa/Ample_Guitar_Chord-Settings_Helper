import { useEffect, useMemo, useRef, useState } from "react";
import Soundfont from "soundfont-player";

type ChordType = "Maj" | "min" | "sus2" | "sus4" | "aug" | "5" | "oct";

type ChordRow = {
  code: number;
  id: string;
  root: string;
  type: ChordType;
  extension: string;
  alteration: string;
  bass: string;
};

type BuilderChord = {
  id: string;
  label: string;
  // Duration of this chord in BEATS at the current time signature.
  // Set at the moment the chord was added, based on the Snap dropdown
  // that was active at that time. Existing chords keep their beats
  // when the user changes Snap - only NEW chords pick up the new
  // duration. Default 4 (= 1 bar in 4/4) matches the pre-Snap default
  // 'Bar' length so old saved progressions look the same.
  beats: number;
};

type Snapshot = {
  // Row code we scrolled to when this snapshot was recorded (used for
  // Undo/Redo to restore the scroll position).
  topCode: number;
  guideCode: number | null;
  // Full display label of the chord that CAUSED this snapshot (e.g.
  // "C Maj 7 #11"). Previously the history bar reconstructed the label
  // from just `topCode`, which lost extension/alteration/bass - so a
  // "C Maj 7 #11" click showed as "C Maj". Storing the label at record
  // time keeps the bar honest about what the user actually clicked.
  label?: string;
};

type ContextMenuState = {
  x: number;
  y: number;
  insertIndex: number;
} | null;

type GuitarPreset = {
  name: string;
  sampleFile: string;
  gmName: string;
  waveform: OscillatorType;
};

type ProgressionSuggestion = {
  rowId: string;
  label: string;
};

const ROOTS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const DISPLAY_NONE = "-";
const MAX_HISTORY_ITEMS = 100;
// BLOCK_WIDTH removed - replaced by BEAT_WIDTH below. All chord widths
// are now derived from each chord's own `beats` value * BEAT_WIDTH.

// Gaps between blocks in the two horizontal bars.
// Both zero now (user wants edge-to-edge chord blocks with no whitespace
// between them, so borders visually merge into one continuous strip).
const HISTORY_GAP = 0;
const BUILDER_GAP = 0;

// Width in pixels of one BEAT of music on the Builder + Time Bar. All
// horizontal geometry (chord block widths, playhead x, grid line spacing)
// is derived from this single constant.
//   1 beat  = BEAT_WIDTH px
//   1 bar   = BEATS_PER_BAR * BEAT_WIDTH px
//   1/2 beat = BEAT_WIDTH / 2 px, etc.
// Chosen so a full 4/4 bar (=4 beats) is 118px, matching the old block
// width so existing 1-bar chords look the same size as before.
const BEAT_WIDTH = 118 / 4; // 29.5 px per beat

// Maximum number of bars a progression can hold, per the spec.
// max bars = 360, max chords = 360 * 4 = 1440.
const MAX_BARS = 360;
const MAX_CHORDS = 1440;

// Height in pixels of the Builder chord strip. User asked for 5x the
// previous ~48px = ~240px total.
const BUILDER_STRIP_HEIGHT = 240;

// Height of the Time Bar at the top of the Builder section. User asked
// for 2x the previous value -> 48px. Scrollbars themselves are also
// doubled in width in src/index.css (12px -> 24px).
const TIME_BAR_HEIGHT = 48;

const TYPE_OPTIONS: Record<ChordType, { extensions: string[]; alterations: string[] }> = {
  Maj: { extensions: ["7", "Maj7", "add9", "6"], alterations: ["add11"] },
  min: { extensions: ["7", "Maj7", "add9", "6"], alterations: ["add11"] },
  sus2: { extensions: ["7"], alterations: ["add11"] },
  sus4: { extensions: ["7"], alterations: [] },
  aug: { extensions: ["7"], alterations: [] },
  "5": { extensions: [], alterations: [] },
  oct: { extensions: [], alterations: [] },
};

// -----------------------------------------------------------------------
// Snap grid
// -----------------------------------------------------------------------
//
// The old "Length" dropdown (Beat / 2 Beats / Bar / 2 Bars) is replaced
// by a single Snap dropdown with seven fixed options. All timings assume
// a 4/4 feel internally - one bar = 4 beats. (The user briefly asked for
// separate 4/4, 3/4, 6/8 buttons but confirmed the option list is
// identical for all three, so we simplified back to a single dropdown.)
//
// A user-selected Snap value determines TWO things:
//   a) the duration (in beats) new chords get when added to the Builder
//   b) the density of the vertical grid lines drawn under the Builder,
//      plus where the Time Bar playhead snaps to when clicked.
//
// Chord duration stays with each individual chord (BuilderChord.beats),
// so changing Snap only affects NEW chords - existing ones keep the
// beats they were added with.

// One bar always equals four beats in this app (4/4-only for now).
const BEATS_PER_BAR = 4;

type SnapOption = "Bar" | "Beat" | "1/2 beat" | "1/3 beat" | "Step" | "1/2 step" | "None";

// Ordered list of Snap options rendered in the dropdown. Bar first so it
// reads as the "default / biggest" choice.
const SNAP_OPTIONS: SnapOption[] = [
  "Bar",
  "Beat",
  "1/2 beat",
  "1/3 beat",
  "Step",
  "1/2 step",
  "None",
];

// Duration in BEATS that a new chord gets when added while a given Snap
// value is active. 'None' resolves to a full bar (default) since the
// user asked for that fallback explicitly.
function snapDurationBeats(snap: SnapOption): number {
  switch (snap) {
    case "Bar":       return BEATS_PER_BAR;
    case "Beat":      return 1;
    case "1/2 beat":  return 1 / 2;
    case "1/3 beat":  return 1 / 3;
    case "Step":      return 1 / 4;
    case "1/2 step":  return 1 / 8;
    case "None":      return BEATS_PER_BAR;
  }
}

// Number of vertical sub-grid lines drawn PER BAR in the Builder / Time
// Bar area for each Snap value. Bar (and None, per the corrected spec)
// draw only the bar-boundary line; finer snaps add subdivisions in-bar.
function snapSubdivisionsPerBar(snap: SnapOption): number {
  switch (snap) {
    case "Bar":       return 0;
    case "Beat":      return 4;
    case "1/2 beat":  return 8;
    case "1/3 beat":  return 12;
    case "Step":      return 16;
    case "1/2 step":  return 32;
    case "None":      return 0;  // was 16 - user asked for 'None' to
                                 // behave like Bar (no in-bar grid).
  }
}

// Standard General MIDI guitar programs (25 - 31), rendered through
// soundfont-player against MusyngKite MP3 packs from the gleitz CDN. This
// replaces the bundled per-note WAV files that were producing low-quality
// pitched playback. See:
//   https://github.com/gleitz/midi-js-soundfonts
//   https://en.wikipedia.org/wiki/General_MIDI#Program_change_events
// waveform is kept only as a last-resort oscillator fallback if the
// soundfont fails to load (offline, blocked, etc.).
// Fixed window size presets. Native window resize is disabled in
// desktop/main.cjs; the user picks one of these three from the Settings
// panel. Heights were bumped so the chord table always shows 4 full rows
// under the taller Builder strip (240px + 48px Time Bar + 14px zoom
// slider + toolbar). Widths kept close to the previous values so the
// aspect ratio still feels natural on a typical 16:9 monitor.
const SIZE_PRESETS: Record<"Small" | "Medium" | "Large", { width: number; height: number }> = {
  Small: { width: 1180, height: 900 },
  Medium: { width: 1400, height: 950 },
  Large: { width: 1600, height: 1000 },
};

const GUITAR_PRESETS: GuitarPreset[] = [
  { name: "Acoustic Guitar Nylon", sampleFile: "", gmName: "acoustic_guitar_nylon", waveform: "sine" },
  { name: "Acoustic Guitar Steel", sampleFile: "", gmName: "acoustic_guitar_steel", waveform: "triangle" },
  { name: "Electric Guitar Jazz",  sampleFile: "", gmName: "electric_guitar_jazz",  waveform: "square" },
  { name: "Electric Guitar Clean", sampleFile: "", gmName: "electric_guitar_clean", waveform: "square" },
  { name: "Electric Guitar Muted", sampleFile: "", gmName: "electric_guitar_muted", waveform: "sawtooth" },
  { name: "Overdriven Guitar",     sampleFile: "", gmName: "overdriven_guitar",     waveform: "sawtooth" },
  { name: "Distortion Guitar",     sampleFile: "", gmName: "distortion_guitar",     waveform: "square" },
];

function buildChordRows() {
  const rows: ChordRow[] = [];
  let codeCounter = 1;

  ROOTS.forEach((root) => {
    (Object.keys(TYPE_OPTIONS) as ChordType[]).forEach((type) => {
      const bass = root;
      const { extensions, alterations } = TYPE_OPTIONS[type];

      rows.push({
        code: codeCounter++,
        id: `${root}|${type}|${DISPLAY_NONE}|${DISPLAY_NONE}|${bass}`,
        root,
        type,
        extension: DISPLAY_NONE,
        alteration: DISPLAY_NONE,
        bass,
      });

      extensions.forEach((extension) => {
        rows.push({
          code: codeCounter++,
          id: `${root}|${type}|${extension}|${DISPLAY_NONE}|${bass}`,
          root,
          type,
          extension,
          alteration: DISPLAY_NONE,
          bass,
        });
      });

      alterations.forEach((alteration) => {
        rows.push({
          code: codeCounter++,
          id: `${root}|${type}|${DISPLAY_NONE}|${alteration}|${bass}`,
          root,
          type,
          extension: DISPLAY_NONE,
          alteration,
          bass,
        });
      });

      extensions.forEach((extension) => {
        alterations.forEach((alteration) => {
          rows.push({
            code: codeCounter++,
            id: `${root}|${type}|${extension}|${alteration}|${bass}`,
            root,
            type,
            extension,
            alteration,
            bass,
          });
        });
      });
    });
  });

  return rows;
}

function chordDisplay(row: ChordRow) {
  const parts = [`${row.root} ${row.type}`];
  if (row.extension !== DISPLAY_NONE) parts.push(row.extension);
  if (row.alteration !== DISPLAY_NONE) parts.push(row.alteration);
  return parts.join(" ");
}

function progressionSpecsByType(type: ChordType) {
  const common: Array<{ interval: number; type: ChordType }> = [
    { interval: 0, type },
    { interval: 5, type: "Maj" },
    { interval: 7, type: "Maj" },
    { interval: 2, type: "min" },
    { interval: 9, type: "min" },
    { interval: 0, type: "sus2" },
    { interval: 7, type: "sus4" },
    { interval: 0, type: "5" },
    { interval: 0, type: "oct" },
    { interval: 10, type: "aug" },
    { interval: 3, type: "Maj" },
    { interval: 11, type: "min" },
  ];

  if (type === "min") {
    return [
      { interval: 0, type: "min" as ChordType },
      { interval: 5, type: "min" as ChordType },
      { interval: 7, type: "Maj" as ChordType },
      { interval: 10, type: "Maj" as ChordType },
      ...common,
    ];
  }

  if (type === "sus2" || type === "sus4") {
    return [
      { interval: 0, type },
      { interval: 0, type: "Maj" as ChordType },
      { interval: 7, type: "sus4" as ChordType },
      { interval: 5, type: "Maj" as ChordType },
      ...common,
    ];
  }

  if (type === "aug") {
    return [
      { interval: 0, type: "aug" as ChordType },
      { interval: 4, type: "Maj" as ChordType },
      { interval: 8, type: "Maj" as ChordType },
      ...common,
    ];
  }

  if (type === "5" || type === "oct") {
    return [
      { interval: 0, type },
      { interval: 0, type: "Maj" as ChordType },
      { interval: 0, type: "min" as ChordType },
      { interval: 7, type: "5" as ChordType },
      ...common,
    ];
  }

  return common;
}

// Parse a chord display label like "C Maj 7 add11" into its parts.
//   root:       "C", "C#", ..., "B"
//   type:       "Maj" | "min" | "sus2" | "sus4" | "aug" | "5" | "oct"
//   extension:  "7" | "Maj7" | "add9" | "6" | "" (optional)
//   alteration: "add11" | "" (optional)
//
// The old implementation just took the first two space-separated tokens,
// so every "C Maj 7 add11" degenerated to "C Maj" and produced the plain
// triad in MIDI - which is why the user reported that many differently-
// named chords sounded/exported identically.
function parseLabel(label: string) {
  const tokens = label.trim().split(/\s+/);
  const root = tokens[0] ?? "C";
  const type = (tokens[1] ?? "Maj") as ChordType;
  let extension = "";
  let alteration = "";
  const EXTENSIONS = new Set(["7", "Maj7", "add9", "6"]);
  const ALTERATIONS = new Set(["add11"]);
  for (let i = 2; i < tokens.length; i++) {
    const t = tokens[i];
    if (!extension && EXTENSIONS.has(t)) extension = t;
    else if (!alteration && ALTERATIONS.has(t)) alteration = t;
  }
  return { root, type, extension, alteration };
}

// Turn a chord label into the concrete MIDI note numbers that make up that
// chord. Each interval below is a semitone offset from the root note.
//
// Semitone map (from the root):
//   0=root, 2=maj 2nd, 3=min 3rd, 4=maj 3rd, 5=perfect 4th, 7=perfect 5th,
//   8=aug 5th, 9=maj 6th, 10=min 7th, 11=maj 7th, 12=octave root,
//   14=9th (=2nd +12), 17=11th (=4th +12)
//
// Extensions ADD one note on top of the base triad:
//   "7"     -> minor 7th (10 semitones). E.g. C Maj 7 = C E G Bb.
//   "Maj7"  -> major 7th (11 semitones). E.g. C Maj Maj7 = C E G B.
//   "add9"  -> 9th above root (14). E.g. C Maj add9 = C E G D5.
//   "6"     -> major 6th (9). E.g. C Maj 6 = C E G A.
// Alteration ADDS a color note:
//   "add11" -> 11th above root (17). E.g. C Maj add11 = C E G F5.
// Extensions and alterations are additive: "C Maj 7 add11" = C E G Bb F5.
function chordNotes(label: string) {
  const parsed = parseLabel(label);
  const rootIdx = ROOTS.indexOf(parsed.root);
  const midiRoot = 48 + Math.max(rootIdx, 0);

  const baseIntervals: Record<ChordType, number[]> = {
    Maj: [0, 4, 7],
    min: [0, 3, 7],
    sus2: [0, 2, 7],
    sus4: [0, 5, 7],
    aug: [0, 4, 8],
    "5": [0, 7],
    oct: [0, 12],
  };

  const intervals = [...(baseIntervals[parsed.type] ?? baseIntervals.Maj)];

  // Extension - one added note.
  switch (parsed.extension) {
    case "7":
      intervals.push(10);
      break;
    case "Maj7":
      intervals.push(11);
      break;
    case "add9":
      intervals.push(14);
      break;
    case "6":
      intervals.push(9);
      break;
    default:
      break;
  }

  // Alteration - additional color note on top of the extension.
  if (parsed.alteration === "add11") {
    intervals.push(17);
  }

  // Deduplicate identical semitones (aug's 8 stays distinct from a 6's 9,
  // but future changes might collide - be defensive).
  const seen = new Set<number>();
  const unique = intervals.filter((i) => {
    if (seen.has(i)) return false;
    seen.add(i);
    return true;
  });

  return unique.map((interval) => midiRoot + interval);
}

// Convert a MIDI note number (0-127) into a display name like "C3" or "F#4".
// Uses the "middle C = C4 = MIDI 60" convention that FL Studio, Ableton,
// Logic and most DAWs display. (Yamaha would call it C3; we ignore that.)
function midiToNoteName(midi: number) {
  const oct = Math.floor(midi / 12) - 1;
  return ROOTS[((midi % 12) + 12) % 12] + oct;
}

// Turn a chord label into a comma-separated note-name string like
// "C3, E3, G3, F4" - handy for tooltips and diagnostics.
function chordNotesDisplay(label: string) {
  return chordNotes(label).map(midiToNoteName).join(", ");
}

// (Removed parseRootMidiFromSmplChunk / parseRootMidiFromFileName - they
// were only used by the old WAV sampler path, which was replaced by the
// soundfont-player + MusyngKite GM instruments in loadInstrument.)

function toVarLen(value: number) {
  let buffer = value & 0x7f;
  const bytes: number[] = [];

  while ((value >>= 7)) {
    buffer <<= 8;
    buffer |= (value & 0x7f) | 0x80;
  }
  while (true) {
    bytes.push(buffer & 0xff);
    if (buffer & 0x80) buffer >>= 8;
    else break;
  }

  return bytes;
}

function chunk(id: string, data: number[]) {
  const len = data.length;
  return [
    ...id.split("").map((c) => c.charCodeAt(0)),
    (len >> 24) & 0xff,
    (len >> 16) & 0xff,
    (len >> 8) & 0xff,
    len & 0xff,
    ...data,
  ];
}

// Duration in beats used when a chord has no per-chord beats value
// (defensive default, keeps old saved sessions compatible).
const DEFAULT_CHORD_BEATS = 4;

function createMidiFile(chords: BuilderChord[], bpm: number) {
  const ppq = 480;
  const beatTicks = ppq;
  const tempo = Math.floor(60000000 / Math.max(40, Math.min(240, bpm)));

  const track: number[] = [];
  track.push(0x00, 0xff, 0x51, 0x03, (tempo >> 16) & 0xff, (tempo >> 8) & 0xff, tempo & 0xff);
  track.push(0x00, 0xc0, 24);

  chords.forEach((chord) => {
    // Each chord now carries its own duration in beats. Fractional beat
    // durations (e.g. 1/3 for triplets) are rounded to the nearest MIDI
    // tick, so a 1/3-beat chord at ppq=480 becomes 160 ticks.
    const beatsForChord = chord.beats > 0 ? chord.beats : DEFAULT_CHORD_BEATS;
    const chordTicks = Math.max(1, Math.round(beatTicks * beatsForChord));

    const notes = chordNotes(chord.label);
    notes.forEach((note, i) => {
      track.push(...toVarLen(i === 0 ? 0 : 0), 0x90, note, 86);
    });

    notes.forEach((note, i) => {
      track.push(...toVarLen(i === 0 ? chordTicks : 0), 0x80, note, 0x00);
    });
  });

  track.push(0x00, 0xff, 0x2f, 0x00);

  // Standard MIDI header: format 1, one track, PPQ division.
  const header = chunk("MThd", [0x00, 0x01, 0x00, 0x01, (ppq >> 8) & 0xff, ppq & 0xff]);
  const trackChunk = chunk("MTrk", track);
  return new Uint8Array([...header, ...trackChunk]);
}

function clampBpm(value: number) {
  return Math.max(40, Math.min(240, Math.floor(value)));
}

// Time Bar rendered above the Builder chord strip. Shows bar-numbers
// spanning the entire progression length + hosts the playhead triangle.
// Clicking anywhere on the bar snaps the playhead to the nearest snap-
// grid line and puts the transport there.
function TimeBar(props: {
  totalBeats: number;
  pixelsPerBeat: number;
  snap: SnapOption;
  playheadX: number;
  onSeek: (px: number) => void;
}) {
  const { totalBeats, pixelsPerBeat, snap, playheadX, onSeek } = props;
  const barWidthPx = BEATS_PER_BAR * pixelsPerBeat;
  const totalBars = Math.max(1, Math.ceil(totalBeats / BEATS_PER_BAR));
  const rulerBars = Math.max(totalBars + 4, 32);
  const rulerWidthPx = Math.min(MAX_BARS, rulerBars) * barWidthPx;

  const subsPerBar = snapSubdivisionsPerBar(snap);
  // subsPerBar can be 0 for Bar and None - in that case snap to whole
  // bars. Otherwise snap to the sub-division width.
  const gridStepBeats = subsPerBar === 0 ? BEATS_PER_BAR : BEATS_PER_BAR / subsPerBar;
  const gridStepPx = gridStepBeats * pixelsPerBeat;

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const rawX = e.clientX - rect.left + e.currentTarget.scrollLeft;
    const snappedX = Math.max(0, Math.min(rulerWidthPx, Math.round(rawX / gridStepPx) * gridStepPx));
    onSeek(snappedX);
  };

  const barNumbers: React.ReactElement[] = [];
  const rulerCap = Math.min(MAX_BARS, rulerBars);
  for (let b = 0; b < rulerCap; b++) {
    barNumbers.push(
      <div
        key={`bar-${b}`}
        className="pointer-events-none absolute top-0 h-full border-l border-black text-center text-[10px] leading-none text-black"
        style={{ left: `${b * barWidthPx}px`, width: `${barWidthPx}px` }}
      >
        <span className="inline-block pt-[3px]">{b + 1}</span>
      </div>
    );
  }

  return (
    <div
      role="slider"
      aria-label="Time bar"
      onClick={handleClick}
      className="relative cursor-pointer overflow-x-scroll border border-black bg-[#e8e8e8] select-none"
      style={{ height: TIME_BAR_HEIGHT }}
    >
      <div className="relative h-full" style={{ width: `${rulerWidthPx}px` }}>
        {barNumbers}
        <div
          className="pointer-events-none absolute top-0 z-10 h-0 w-0 border-l-[6px] border-r-[6px] border-t-[10px] border-b-0 border-l-transparent border-r-transparent border-t-[#ff8827] drop-shadow-[0_0_8px_#ff8827]"
          style={{ left: `${Math.max(0, playheadX - 6)}px` }}
        />
      </div>
    </div>
  );
}

// Vertical grid lines drawn behind the Builder chord strip. Purely visual.
function BuilderGrid(props: {
  widthPx: number;
  heightPx: number;
  pixelsPerBeat: number;
  snap: SnapOption;
}) {
  const { widthPx, heightPx, pixelsPerBeat, snap } = props;
  const barWidthPx = BEATS_PER_BAR * pixelsPerBeat;
  const totalBars = Math.max(1, Math.ceil(widthPx / barWidthPx));
  const subsPerBar = snapSubdivisionsPerBar(snap);

  const lines: React.ReactElement[] = [];
  for (let b = 0; b <= totalBars; b++) {
    lines.push(
      <div
        key={`grid-bar-${b}`}
        className="pointer-events-none absolute top-0 h-full w-px bg-black opacity-40"
        style={{ left: `${b * barWidthPx}px` }}
      />
    );
    if (b < totalBars && subsPerBar > 0) {
      const stepPx = barWidthPx / subsPerBar;
      for (let s = 1; s < subsPerBar; s++) {
        lines.push(
          <div
            key={`grid-sub-${b}-${s}`}
            className="pointer-events-none absolute top-0 h-full w-px bg-neutral-400 opacity-30"
            style={{ left: `${b * barWidthPx + s * stepPx}px` }}
          />
        );
      }
    }
  }
  return (
    <div className="pointer-events-none absolute inset-0 z-0" style={{ height: heightPx }}>
      {lines}
    </div>
  );
}

// Zoom slider drawn between the Time Bar and the Builder chord strip.
// Visually it's a horizontal grey bar with a bright inner "thumb" and two
// small grip handles at the thumb's extremities. Dragging either handle
// resizes the thumb inward or outward:
//   - narrower thumb  = zoom IN  (chords look bigger)
//   - wider   thumb  = zoom OUT (chords look smaller)
// The cursor turns into a horizontal double-arrow (ew-resize) as soon as
// the pointer enters a small hot zone near either extremity, so users get
// feedback that the edge is grabbable even before crossing the exact
// pixel boundary.
function ZoomSlider(props: {
  zoom: number;
  onZoomChange: (z: number) => void;
  minZoom?: number;
  maxZoom?: number;
}) {
  const { zoom, onZoomChange } = props;
  const minZoom = props.minZoom ?? 0.25;
  const maxZoom = props.maxZoom ?? 8;

  // Map zoom -> thumb width fraction in [0..1]. zoom=1 -> full width
  // (100%). Larger zoom shrinks the thumb; smaller zoom widens it up to
  // a comfortable cap.
  //   thumbFrac = 1 / zoom, clamped to [1/maxZoom, 1]
  const thumbFrac = Math.min(1, Math.max(1 / maxZoom, 1 / zoom));

  const trackRef = useRef<HTMLDivElement | null>(null);
  const [dragEdge, setDragEdge] = useState<null | "left" | "right">(null);

  useEffect(() => {
    if (!dragEdge) return;
    const onMove = (e: MouseEvent) => {
      const track = trackRef.current;
      if (!track) return;
      const rect = track.getBoundingClientRect();
      const trackWidth = rect.width;
      if (trackWidth <= 0) return;

      // The thumb is centred in the track. When we drag an edge, we're
      // changing the DISTANCE from that edge to the track's centre; the
      // opposite edge mirrors symmetrically. So the thumb width becomes
      // 2 * (distance from centre to the dragged edge).
      const centre = rect.left + trackWidth / 2;
      let edgeDist: number;
      if (dragEdge === "right") {
        edgeDist = Math.max(0, e.clientX - centre);
      } else {
        edgeDist = Math.max(0, centre - e.clientX);
      }
      const newThumbWidth = Math.min(trackWidth, edgeDist * 2);
      const newFrac = Math.max(1 / props.maxZoom!, newThumbWidth / trackWidth);
      // Convert thumb fraction back to zoom: zoom = 1 / frac. Clamp.
      const newZoom = Math.min(maxZoom, Math.max(minZoom, 1 / newFrac));
      onZoomChange(newZoom);
    };
    const onUp = () => setDragEdge(null);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragEdge, minZoom, maxZoom, onZoomChange, props.maxZoom]);

  const thumbLeftPct = (100 - thumbFrac * 100) / 2;
  const thumbWidthPct = thumbFrac * 100;
  // Hot zone width (px) around each edge where the cursor becomes
  // ew-resize before actually reaching the edge - matches user's
  // "cursor changes a little before reaching the tip" requirement.
  const HOT_ZONE = 10;

  return (
    <div
      ref={trackRef}
      className="relative w-full select-none border border-black bg-[#d6d3c9]"
      style={{ height: 14 }}
      onDoubleClick={() => onZoomChange(1)}
      title="Drag the edges to zoom. Double-click to reset to 1x."
    >
      {/* Thumb (the bright inner strip that represents the current
          viewport). Its width shrinks as zoom increases. */}
      <div
        className="absolute top-0 h-full bg-[#FCBF8D] border-l border-r border-black"
        style={{ left: `${thumbLeftPct}%`, width: `${thumbWidthPct}%` }}
      />
      {/* Left handle hot zone. Wider than the visible edge so ew-resize
          shows up "a bit before" the tip, per user request. */}
      <div
        onMouseDown={(e) => { e.preventDefault(); setDragEdge("left"); }}
        className="absolute top-0 h-full cursor-ew-resize"
        style={{
          left: `calc(${thumbLeftPct}% - ${HOT_ZONE / 2}px)`,
          width: `${HOT_ZONE}px`,
          zIndex: 2,
        }}
        title="Drag to zoom in / out"
      />
      {/* Right handle hot zone. */}
      <div
        onMouseDown={(e) => { e.preventDefault(); setDragEdge("right"); }}
        className="absolute top-0 h-full cursor-ew-resize"
        style={{
          left: `calc(${thumbLeftPct + thumbWidthPct}% - ${HOT_ZONE / 2}px)`,
          width: `${HOT_ZONE}px`,
          zIndex: 2,
        }}
        title="Drag to zoom in / out"
      />
      {/* Two visible grip marks at the edges (purely decorative). */}
      <div
        className="pointer-events-none absolute top-0 h-full w-[3px] bg-black opacity-70"
        style={{ left: `calc(${thumbLeftPct}% - 1px)` }}
      />
      <div
        className="pointer-events-none absolute top-0 h-full w-[3px] bg-black opacity-70"
        style={{ left: `calc(${thumbLeftPct + thumbWidthPct}% - 2px)` }}
      />
    </div>
  );
}

// A tiny helper that shrinks its text horizontally to fit the parent's
// width. Renders the text via SVG so it scales GLYPHS proportionally (not
// stretching them like CSS `transform: scaleX()` would). If the text
// already fits at its natural size, it renders unchanged.
//
// Props:
//   text     : the string to render
//   height   : height (in px) of the SVG viewbox; the text uses this as
//              its font size (before shrinking).
//   className: extra classes applied to the SVG wrapper.
//   fill     : text color (defaults to currentColor).
function FitText({
  text,
  height,
  className,
  fill,
}: {
  text: string;
  height: number;
  className?: string;
  fill?: string;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const textRef = useRef<SVGTextElement | null>(null);
  const [naturalWidth, setNaturalWidth] = useState<number | null>(null);

  useEffect(() => {
    // Measure the natural rendered width of the <text> element once
    // React has committed it to the DOM. The parent's ResizeObserver
    // triggered re-renders will let us decide whether to shrink.
    if (textRef.current) {
      try {
        const w = textRef.current.getComputedTextLength();
        setNaturalWidth(w);
      } catch { /* getComputedTextLength can throw pre-mount in some envs */ }
    }
  }, [text, height]);

  // Container width is discovered at layout time. `useLayoutEffect`
  // isn't necessary because SVG's own scaling via textLength/lengthAdjust
  // handles the visual fit even before we know the width.
  return (
    <svg
      ref={svgRef}
      className={className}
      viewBox={`0 0 ${Math.max(1, naturalWidth ?? 1)} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ display: "block", width: "100%", height, overflow: "hidden" }}
    >
      <text
        ref={textRef}
        x="0"
        y={height * 0.8}
        fontSize={height}
        fill={fill ?? "currentColor"}
        style={{
          fontFamily: "inherit",
          fontWeight: "inherit",
          whiteSpace: "pre",
        }}
      >
        {text}
      </text>
    </svg>
  );
}

// Inline SVG gear/cog icon used for the Settings button and the close button
// inside the Settings modal. Kept in code (not a file asset) so it inherits
// the current text color via `currentColor` and scales cleanly at any size.
function SettingsGearIcon({ size = 24 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* Standard 8-tooth gear silhouette + inner circle. */}
      <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2.06 2.06 0 1 1-2.91 2.91l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.55V21a2.06 2.06 0 1 1-4.12 0v-.08A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06a2.06 2.06 0 1 1-2.91-2.91l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1.03H3a2.06 2.06 0 1 1 0-4.12h.08A1.7 1.7 0 0 0 4.6 8.6a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2.06 2.06 0 1 1 2.91-2.91l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1.03-1.55V3a2.06 2.06 0 1 1 4.12 0v.08a1.7 1.7 0 0 0 1.03 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2.06 2.06 0 1 1 2.91 2.91l-.06.06a1.7 1.7 0 0 0-.34 1.87V9a1.7 1.7 0 0 0 1.55 1.03H21a2.06 2.06 0 1 1 0 4.12h-.08a1.7 1.7 0 0 0-1.55 1.03Z" />
    </svg>
  );
}

// Full-screen dark settings modal. Renders over the whole app. Two controls:
//   - Size radio group (applies instantly on click via desktopBridge.resizeWindow)
//   - Long-press ms (three radio presets + a fine 200..1000ms slider)
// Top-right corner has another gear icon that closes the modal.
function SettingsPanel(props: {
  windowSize: "Small" | "Medium" | "Large";
  onSizeChange: (s: "Small" | "Medium" | "Large") => void;
  longPressMs: number;
  onLongPressChange: (ms: number) => void;
  onClose: () => void;
}) {
  const { windowSize, onSizeChange, longPressMs, onLongPressChange, onClose } = props;
  const sizes: Array<"Small" | "Medium" | "Large"> = ["Small", "Medium", "Large"];
  const longPressPresets = [300, 500, 800];

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="fixed inset-0 z-50 flex flex-col bg-black text-white"
      style={{ padding: 32 }}
    >
      {/* Header: title on the left, close (gear) on the right */}
      <div className="mb-8 flex items-start justify-between">
        <h1 className="text-2xl font-semibold tracking-wide">Settings</h1>
        <button
          type="button"
          onClick={onClose}
          title="Close settings"
          aria-label="Close settings"
          className="rounded-sm border border-neutral-600 bg-neutral-800 p-2 text-white hover:bg-neutral-700"
        >
          <SettingsGearIcon size={22} />
        </button>
      </div>

      {/* Size */}
      <div className="mb-8">
        <div className="mb-2 text-sm font-semibold text-neutral-300">Size:</div>
        <div className="flex gap-3">
          {sizes.map((s) => (
            <label
              key={s}
              className={`flex cursor-pointer items-center gap-2 rounded-sm border px-3 py-2 text-sm ${
                windowSize === s
                  ? "border-orange-400 bg-neutral-800 text-orange-200"
                  : "border-neutral-600 bg-neutral-900 text-neutral-200 hover:bg-neutral-800"
              }`}
            >
              <input
                type="radio"
                name="size"
                value={s}
                checked={windowSize === s}
                onChange={() => onSizeChange(s)}
                className="accent-orange-400"
              />
              <span>{s}</span>
              <span className="text-[10px] text-neutral-400">
                {SIZE_PRESETS[s].width}x{SIZE_PRESETS[s].height}
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Long-press */}
      <div className="mb-8">
        <div className="mb-2 text-sm font-semibold text-neutral-300">Long Press:</div>
        <div className="mb-3 flex gap-3">
          {longPressPresets.map((ms) => (
            <label
              key={ms}
              className={`flex cursor-pointer items-center gap-2 rounded-sm border px-3 py-2 text-sm ${
                longPressMs === ms
                  ? "border-orange-400 bg-neutral-800 text-orange-200"
                  : "border-neutral-600 bg-neutral-900 text-neutral-200 hover:bg-neutral-800"
              }`}
            >
              <input
                type="radio"
                name="longpress"
                value={ms}
                checked={longPressMs === ms}
                onChange={() => onLongPressChange(ms)}
                className="accent-orange-400"
              />
              <span>{ms} ms</span>
              {ms === 500 && <span className="text-[10px] text-neutral-400">(default)</span>}
            </label>
          ))}
        </div>
        {/* Fine slider: any value 200..1000ms in 50ms steps. Radio + slider
            stay in sync - moving the slider off a preset value just leaves
            all three radios un-checked; clicking a radio snaps back. */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-neutral-400">200</span>
          <input
            type="range"
            min={200}
            max={1000}
            step={50}
            value={longPressMs}
            onChange={(e) => onLongPressChange(Number(e.target.value))}
            className="flex-1 accent-orange-400"
          />
          <span className="text-xs text-neutral-400">1000</span>
          <span className="ml-3 min-w-[70px] rounded-sm border border-neutral-600 bg-neutral-800 px-2 py-1 text-center text-xs">
            {longPressMs} ms
          </span>
        </div>
      </div>

      <div className="mt-auto text-xs text-neutral-500">
        Changes are saved automatically. Close this panel with the gear icon
        in the top-right corner.
      </div>
    </div>
  );
}

export default function App() {
  const rows = useMemo(() => buildChordRows(), []);
  const rowById = useMemo(() => new Map(rows.map((row) => [row.id, row])), [rows]);
  const rowByCode = useMemo(() => new Map(rows.map((row) => [row.code, row])), [rows]);
  const rowsByRootType = useMemo(() => {
    const map = new Map<string, ChordRow[]>();
    rows.forEach((row) => {
      const key = `${row.root}|${row.type}`;
      const arr = map.get(key) ?? [];
      arr.push(row);
      map.set(key, arr);
    });
    return map;
  }, [rows]);

  const tableRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLTableSectionElement>(null);
  const rowRefs = useRef<Record<number, HTMLTableRowElement | null>>({});
  const scrollTimerRef = useRef<number | null>(null);
  const playTimerRef = useRef<number | null>(null);
  const jumpTimerRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const playStartRef = useRef(0);
  const playChordMsRef = useRef(500);
  const playedIndexRef = useRef(-1);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const instrumentRef = useRef<any>(null);
  const loadingInstrumentRef = useRef(false);
  const sampleBufferRef = useRef<AudioBuffer | null>(null);
  const sampleRootMidiRef = useRef<number>(72);

  const [topCode, setTopCode] = useState<number>(rows[0]?.code ?? 1);
  const [activeRow, setActiveRow] = useState<string>(rows[0]?.id ?? "");
  const [activeBtn, setActiveBtn] = useState<string>("");

  // Selection state for the green suggestion buttons in the chord table.
  // Same gesture model as the Builder: long-press adds to selection, short
  // tap toggles (only when the selection is non-empty). Clicking outside
  // any table button clears it. Dragging any SELECTED table button drops
  // the whole selection group into the Builder at the drop position.
  //
  // Selected buttons are identified by their `btnId` = `${row.id}-${
  // nextChord.rowId}-${idx}` - same identifier we already used for the
  // pressed-highlight (activeBtn). We keep the FULL selected suggestions
  // (label + code) in state so onDrop can rebuild them without having to
  // walk the DOM.
  type SelectedTableChord = { btnId: string; label: string; code: number };
  const [selectedTableChords, setSelectedTableChords] = useState<SelectedTableChord[]>([]);
  const selectedTableChordsRef = useRef<SelectedTableChord[]>([]);
  useEffect(() => {
    selectedTableChordsRef.current = selectedTableChords;
  }, [selectedTableChords]);
  const [startActive, setStartActive] = useState(false);
  const [guideCode, setGuideCode] = useState<number | null>(null);
  const [guidePickIndex, setGuidePickIndex] = useState<number | null>(null);

  const [builderChords, setBuilderChords] = useState<BuilderChord[]>([]);
  const [selectedBuilderIds, setSelectedBuilderIds] = useState<string[]>([]);
  const [clipboardChords, setClipboardChords] = useState<BuilderChord[]>([]);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const [builderHistory, setBuilderHistory] = useState<BuilderChord[][]>([[]]);
  const [builderHistoryIndex, setBuilderHistoryIndex] = useState(0);

  // moveMode / multiSelectMode used to gate the reorder-drag and multi-
  // selection code paths; both are now always-on because selection is
  // gesture-driven. The states are removed entirely - anything that used
  // to read them was refactored away.
  const [scrollFollowMode, setScrollFollowMode] = useState(false);
  const [deleteMode, setDeleteMode] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [playheadIndex, setPlayheadIndex] = useState(0);
  // Snap persists to localStorage so the user's rhythm grid setting
  // survives across sessions - same pattern used for windowSize /
  // longPressMs. Bar is the default (biggest grid = 1 full bar).
  const [snap, setSnap] = useState<SnapOption>(() => {
    try {
      const v = localStorage.getItem("snap") as SnapOption | null;
      if (v && SNAP_OPTIONS.includes(v)) return v;
    } catch { /* ignore */ }
    return "Bar";
  });
  const [snapMenuOpen, setSnapMenuOpen] = useState(false);

  useEffect(() => {
    try { localStorage.setItem("snap", snap); } catch { /* ignore */ }
  }, [snap]);
  // One-shot cleanup: remove the old "timeSignature" localStorage key
  // written by a previous version, so it doesn't accumulate as dead data.
  useEffect(() => {
    try { localStorage.removeItem("timeSignature"); } catch { /* ignore */ }
  }, []);

  // Horizontal zoom for the Builder + Time Bar. 1 = default (BEAT_WIDTH).
  // Range: 0.25x (broad overview) .. 8x (tight zoom-in).
  // The user drives this by dragging the handles of a slider sitting
  // between the Time Bar and the Builder strip - dragging a handle INWARD
  // (compressing the visible thumb) means "focus on less of the timeline",
  // i.e. bigger chord blocks (zoom in). Dragging OUTWARD means "see more
  // of the timeline", i.e. smaller chords (zoom out). This matches the
  // reversed convention the user asked for explicitly.
  const [zoom, setZoom] = useState<number>(1);
  const effectiveBeatWidth = BEAT_WIDTH * zoom;
  // Ref mirror so the playback tick loop can read the current zoom
  // without closing over a stale value.
  const effectiveBeatWidthRef = useRef(effectiveBeatWidth);
  useEffect(() => { effectiveBeatWidthRef.current = effectiveBeatWidth; }, [effectiveBeatWidth]);
  const [bpm, setBpm] = useState(120);
  const [editingBpm, setEditingBpm] = useState(false);
  const [bpmText, setBpmText] = useState("120");
  const [guitarOpen, setGuitarOpen] = useState(false);
  const [guitarPreset, setGuitarPreset] = useState(GUITAR_PRESETS[0]);
  const [guitarLoading, setGuitarLoading] = useState(false);
  const [volume, setVolume] = useState(0.72);
  const [auditionMode, setAuditionMode] = useState(false);
  const [flashBuilderId, setFlashBuilderId] = useState<string>("");

  // Snapshots start empty so the "Scroll On History" bar shows nothing on
  // fresh launch (previously it showed an initial C5 entry that the user
  // never asked for). snapshotIndex = -1 means "no snapshot selected yet".
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [snapshotIndex, setSnapshotIndex] = useState(-1);

  const topCodeRef = useRef(topCode);
  const builderRef = useRef(builderChords);
  const guideCodeRef = useRef(guideCode);
  const snapshotsRef = useRef(snapshots);
  const snapshotIndexRef = useRef(snapshotIndex);
  const selectedRef = useRef(selectedBuilderIds);
  const builderHistoryRef = useRef(builderHistory);
  const builderHistoryIndexRef = useRef(builderHistoryIndex);
  const lastSelectedIndexRef = useRef<number | null>(null);
  const pausedElapsedRef = useRef(0);
  // dragSelectingRef / dragSelectAddRef removed with the old lasso-select
  // behaviour. isDraggingBuilderRef stays - the OS drag session for reorder
  // still uses it to swallow the trailing synthetic click.
  const isDraggingBuilderRef = useRef(false);

  // Set to true while a progression-chord button is being dragged, so the
  // synthetic onClick that some browsers fire immediately after dragend
  // does not ALSO add the chord to the Builder (which would produce two
  // or three copies of the chord from a single user gesture).
  const isDraggingProgressionRef = useRef(false);

  // Long-press tracking. mouseDownTimeRef captures the timestamp of the last
  // mousedown on ANY chord button (Builder or table). If mouseup fires after
  // longPressMs has elapsed, we treat the gesture as a "long-press" (enter
  // selection mode, or start a drag if something is already selected).
  // Otherwise it's a short tap - audition sound in Ch On/Off mode, toggle
  // selection if we're already in multi-select mode, or add to Builder from
  // the table.
  const longPressTimerRef = useRef<number | null>(null);
  const longPressFiredRef = useRef(false);
  const suppressNextClickRef = useRef(false);

  // While a scrollToCode() smooth animation is running, we want to suppress
  // the onScroll -> snapToNearestRow() logic. Without this, the smooth
  // animation's intermediate scroll events fire snapToNearestRow, which
  // then RE-writes topCode based on whatever row happens to be closest to
  // the top at that instant. Because the sticky header covers the first
  // ~40px of the viewport, the "nearest to top" row is usually one row
  // BELOW the intended target - which is exactly the "clicked B aug but
  // landed on B sus2 7 add11" symptom the user reported.
  const programmaticScrollUntilRef = useRef<number>(0);

  // Live diagnostic strip visible above the chord table. Populated by
  // scrollToCode() and by a settle-check that runs 800ms after each scroll.
  // Purpose: user can SEE the mismatch between what was requested and what
  // actually rendered without opening devtools, and paste the numbers back
  // to me so I can pinpoint the drift source (rowTop calc? snap race?
  // layout shift? sticky header?).
  // Height (in pixels) of the phantom spacer appended after the chord table.
  // We need this so rows near the end of the table can still be scrolled
  // flush to the top - without it, the browser clamps our scrollTo() to
  // scrollHeight - clientHeight, leaving the last few rows unreachable
  // as "top" rows. Recomputed whenever the scroll container resizes so
  // the spacer stays large enough for the current window size.
  const [bottomSpacerHeight, setBottomSpacerHeight] = useState<number>(800);

  // Window size presets (see SIZE_PRESETS below). Persisted to localStorage
  // together with longPressMs so preferences survive across sessions.
  const [windowSize, setWindowSize] = useState<"Small" | "Medium" | "Large">(() => {
    try {
      const v = localStorage.getItem("windowSize");
      if (v === "Small" || v === "Medium" || v === "Large") return v;
    } catch { /* localStorage might be disabled */ }
    return "Large";
  });
  // sizeMenuOpen removed - the little Small/Medium/Large dropdown is gone,
  // replaced by the Settings gear icon that opens a full-screen dark modal.

  // Long-press threshold in milliseconds. Below this, a mouse-down + mouse-up
  // is treated as a tap (audition sound if Ch On/Off is active, or toggle
  // selection if we're already in multi-select mode). At or above this, the
  // chord enters selection mode. Adjustable from the Settings panel.
  const [longPressMs, setLongPressMs] = useState<number>(() => {
    try {
      const v = Number(localStorage.getItem("longPressMs"));
      if (Number.isFinite(v) && v >= 100 && v <= 2000) return v;
    } catch { /* ignore */ }
    return 500;
  });

  // Settings modal (the dark panel with rotita zimtata).
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Persist window size + long-press whenever they change.
  useEffect(() => {
    try { localStorage.setItem("windowSize", windowSize); } catch { /* ignore */ }
  }, [windowSize]);
  useEffect(() => {
    try { localStorage.setItem("longPressMs", String(longPressMs)); } catch { /* ignore */ }
  }, [longPressMs]);

  useEffect(() => {
    topCodeRef.current = topCode;
  }, [topCode]);
  useEffect(() => {
    builderRef.current = builderChords;
  }, [builderChords]);
  useEffect(() => {
    guideCodeRef.current = guideCode;
  }, [guideCode]);
  useEffect(() => {
    snapshotsRef.current = snapshots;
  }, [snapshots]);
  useEffect(() => {
    snapshotIndexRef.current = snapshotIndex;
  }, [snapshotIndex]);
  useEffect(() => {
    selectedRef.current = selectedBuilderIds;
  }, [selectedBuilderIds]);
  useEffect(() => {
    builderHistoryRef.current = builderHistory;
  }, [builderHistory]);
  useEffect(() => {
    builderHistoryIndexRef.current = builderHistoryIndex;
  }, [builderHistoryIndex]);

  useEffect(() => {
    // Placeholder: the old lasso-select mouseup listener was removed with
    // dragSelectingRef. Left as an empty effect on purpose so the surrounding
    // effect chain (declaration order matters for hook parity across
    // renders) stays identical to before, avoiding accidental hook-order
    // regressions.
    return () => {};
  }, []);

  const canUndo = snapshotIndex > 0;
  const canRedo = snapshotIndex < snapshots.length - 1;
  const canBuilderUndo = builderHistoryIndex > 0;
  const canBuilderRedo = builderHistoryIndex < builderHistory.length - 1;

  const pushBuilderHistory = (nextBuilder: BuilderChord[]) => {
    const base = builderHistoryRef.current.slice(0, builderHistoryIndexRef.current + 1);
    const previous = base[base.length - 1] ?? [];
    const same =
      previous.length === nextBuilder.length &&
      previous.every((item, idx) => item.id === nextBuilder[idx]?.id && item.label === nextBuilder[idx]?.label);

    if (same) {
      return;
    }

    base.push(nextBuilder.map((item) => ({ ...item })));
    const clipped = base.length > MAX_HISTORY_ITEMS + 1 ? base.slice(base.length - (MAX_HISTORY_ITEMS + 1)) : base;
    const nextIndex = clipped.length - 1;
    setBuilderHistory(clipped);
    setBuilderHistoryIndex(nextIndex);
    builderHistoryRef.current = clipped;
    builderHistoryIndexRef.current = nextIndex;
  };

  const undoBuilder = () => {
    if (builderHistoryIndexRef.current <= 0) return;
    const nextIndex = builderHistoryIndexRef.current - 1;
    const nextBuilder = (builderHistoryRef.current[nextIndex] ?? []).map((item) => ({ ...item }));
    setBuilderHistoryIndex(nextIndex);
    builderHistoryIndexRef.current = nextIndex;
    setBuilderChords(nextBuilder);
    setSelectedBuilderIds([]);
  };

  const redoBuilder = () => {
    if (builderHistoryIndexRef.current >= builderHistoryRef.current.length - 1) return;
    const nextIndex = builderHistoryIndexRef.current + 1;
    const nextBuilder = (builderHistoryRef.current[nextIndex] ?? []).map((item) => ({ ...item }));
    setBuilderHistoryIndex(nextIndex);
    builderHistoryIndexRef.current = nextIndex;
    setBuilderChords(nextBuilder);
    setSelectedBuilderIds([]);
  };

  // Reduced set of "toolbar modes" after Select/Multi Select were removed
  // and replaced with gesture-driven selection. Only these buttons still
  // participate: Scroll On/Off, Delete, Ch On/Off. Selection persists
  // independently of the mode.
  const activateBuilderMode = (mode: "scroll" | "delete" | "audition" | "none") => {
    setScrollFollowMode(mode === "scroll");
    setDeleteMode(mode === "delete");
    setAuditionMode(mode === "audition");
  };

  // Applies a size preset to both the React state (so the Settings panel
  // radios stay in sync) AND the underlying Electron window. In the web
  // build the bridge is undefined and only the state changes - browsers
  // can't resize their own window.
  const applyWindowSize = (name: "Small" | "Medium" | "Large") => {
    setWindowSize(name);
    const preset = SIZE_PRESETS[name];
    const bridge = (window as any).desktopBridge;
    if (bridge && typeof bridge.resizeWindow === "function") {
      try {
        bridge.resizeWindow(preset.width, preset.height);
      } catch (err) {
        console.error("[applyWindowSize] failed:", err);
      }
    }
  };

  const toggleChordAudition = () => {
    if (auditionMode) {
      activateBuilderMode("none");
      return;
    }
    activateBuilderMode("audition");
  };

  const getProgressionSuggestions = (chord: ChordRow): ProgressionSuggestion[] => {
    const sourceIndex = ROOTS.indexOf(chord.root);
    const noteAt = (interval: number) => ROOTS[(sourceIndex + interval + 12) % 12];
    const specs = progressionSpecsByType(chord.type);
    const suggestions: ProgressionSuggestion[] = [];
    const seen = new Set<string>();

    const pickBest = (pool: ChordRow[]) => {
      const sorted = [...pool].sort((a, b) => {
        const score = (row: ChordRow) => {
          let s = 0;
          if (chord.extension !== DISPLAY_NONE && row.extension === chord.extension) s += 3;
          if (chord.alteration !== DISPLAY_NONE && row.alteration === chord.alteration) s += 3;
          if (row.extension !== DISPLAY_NONE) s += 1;
          if (row.alteration !== DISPLAY_NONE) s += 1;
          return s;
        };
        return score(b) - score(a);
      });
      return sorted;
    };

    specs.forEach((spec) => {
      const root = noteAt(spec.interval);
      const key = `${root}|${spec.type}`;
      const pool = rowsByRootType.get(key) ?? [];
      if (pool.length === 0) return;

      pickBest(pool)
        .slice(0, 2)
        .forEach((row) => {
          if (seen.has(row.id)) return;
          seen.add(row.id);
          suggestions.push({ rowId: row.id, label: chordDisplay(row) });
        });
    });

    return suggestions.slice(0, 18);
  };

  const pushSnapshot = (next: Snapshot) => {
    let base = snapshotsRef.current.slice(0, snapshotIndexRef.current + 1);
    base.push(next);
    if (base.length > MAX_HISTORY_ITEMS + 1) {
      base = base.slice(base.length - (MAX_HISTORY_ITEMS + 1));
    }
    const nextIndex = base.length - 1;
    setSnapshots(base);
    setSnapshotIndex(nextIndex);
    snapshotsRef.current = base;
    snapshotIndexRef.current = nextIndex;
  };

  const getHeaderHeight = () => headRef.current?.offsetHeight ?? 0;

  // Returns the scrollTop value that will place `row.code` flush against the
  // top of the scroll container, corrected for the sticky <thead> that would
  // otherwise cover the row.
  //
  // History of pain in this function:
  //   v1: rowEl.offsetTop - headerHeight. Wrong when offsetParent !==
  //       scroll container (which happens with border-collapse tables
  //       and nested table components); off by a row.
  //   v2: getBoundingClientRect based (rowRect.top - containerRect.top
  //       + container.scrollTop). Correct on paper, but getBounding-
  //       ClientRect during an in-flight smooth scroll returns the
  //       CURRENT rect, not the final rect. If the user clicks again
  //       (or any code path calls getRowTop) while the previous smooth
  //       scroll is still animating, the fresh calculation is based on
  //       the moving target and lands the next scroll on the wrong row.
  //   v3 (current): walk the offsetParent chain and sum offsetTops.
  //       This is a static, scroll-position-independent measurement -
  //       independent of any in-flight animation. Handles border-
  //       collapse quirks by always summing UPWARDS from the row so
  //       intermediate table sections can't drop pixels.
  const getRowTop = (code: number) => {
    const container = tableRef.current;
    const rowEl = rowRefs.current[code];
    if (!container || !rowEl) return null;
    let node: HTMLElement | null = rowEl;
    let top = 0;
    let hitContainer = false;
    // Walk up through the offsetParent chain, adding each ancestor's
    // offsetTop. Stop when we're about to leave the scroll container.
    while (node) {
      top += node.offsetTop;
      const parent = node.offsetParent as HTMLElement | null;
      if (!parent) break;
      if (parent === container) {
        hitContainer = true;
        break;
      }
      // If the parent is OUTSIDE the container, the offsetParent chain
      // has escaped (e.g. a position:fixed ancestor). Fall back to
      // getBoundingClientRect.
      if (!container.contains(parent)) break;
      node = parent;
    }
    if (!hitContainer) {
      const rowRect = rowEl.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      top = rowRect.top - containerRect.top + container.scrollTop;
    }
    return Math.max(top - getHeaderHeight(), 0);
  };

  const detectNearestCode = (scrollTop?: number) => {
    const container = tableRef.current;
    if (!container) return null;

    const top = scrollTop ?? container.scrollTop;
    let bestCode: number | null = null;
    let bestDist = Number.POSITIVE_INFINITY;

    rows.forEach((row) => {
      const rowTop = getRowTop(row.code);
      if (rowTop === null) return;
      const dist = Math.abs(rowTop - top);
      if (dist < bestDist) {
        bestDist = dist;
        bestCode = row.code;
      }
    });

    return bestCode;
  };

  const scrollToCode = (code: number, behavior: ScrollBehavior) => {
    const container = tableRef.current;
    const row = rowByCode.get(code);
    const rowTop = getRowTop(code);
    if (!container || !row || rowTop === null) return;
    // Freeze snapToNearestRow for the duration of a smooth scroll animation
    // plus a small safety margin. Smooth scrolls typically finish in
    // 200-400ms depending on distance; 700ms covers even long jumps.
    const freezeMs = behavior === "smooth" ? 700 : 200;
    programmaticScrollUntilRef.current = Date.now() + freezeMs;
    container.scrollTo({ top: rowTop, behavior });
    setTopCode(code);
    setActiveRow(row.id);
    window.setTimeout(() => setActiveRow(""), 650);
  };

  const snapToNearestRow = () => {
    // Suppress snap while a programmatic (smooth) scroll is still in flight.
    // Otherwise the animation's own scroll events would race with us and we
    // would overwrite topCode with the wrong row (see programmaticScroll-
    // UntilRef comment for the full story).
    if (Date.now() < programmaticScrollUntilRef.current) return;
    const container = tableRef.current;
    if (!container) return;
    const nearest = detectNearestCode(container.scrollTop);
    if (nearest === null) return;
    const rowTop = getRowTop(nearest);
    if (rowTop === null) return;
    if (Math.abs(container.scrollTop - rowTop) > 1) {
      container.scrollTo({ top: rowTop, behavior: "auto" });
    }
    setTopCode(nearest);
  };

  const stopPlayback = () => {
    if (playTimerRef.current !== null) {
      window.clearInterval(playTimerRef.current);
      playTimerRef.current = null;
    }
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setIsPlaying(false);
    setIsPaused(false);
    setPlayheadIndex(0);
    setPlayheadX(0);
    playedIndexRef.current = -1;
    pausedElapsedRef.current = 0;
  };

  const ensureAudio = () => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext();
    }
    return audioCtxRef.current;
  };

  const loadInstrument = async (preset: GuitarPreset) => {
    if (loadingInstrumentRef.current) return;
    try {
      loadingInstrumentRef.current = true;
      setGuitarLoading(true);
      const ctx = ensureAudio();
      if (ctx.state === "suspended") {
        await ctx.resume();
      }

      // Always disable the WAV path - it produced pitched-shifted samples
      // that sounded wrong on most notes. Instead use soundfont-player
      // against the MusyngKite pack, which gives a real multi-sample GM
      // instrument for each note.
      sampleBufferRef.current = null;
      sampleRootMidiRef.current = 72;

      // 1) Try the LOCAL soundfont bundled with the app (public/soundfonts/).
      //    Users run Download-Soundfonts.ps1 once to populate this folder.
      //    Loading locally means the app works fully offline - important for
      //    the portable EXE where the user may not have internet.
      // 2) If local is missing, fall back to the gleitz CDN.
      // 3) If both fail, fall back to a plain oscillator so the app still
      //    makes sound instead of going silent.
      const localBase = window.location.protocol === "file:" ? "./soundfonts/" : "/soundfonts/";

      try {
        instrumentRef.current = await Soundfont.instrument(ctx, preset.gmName as any, {
          nameToUrl: (name: string, _sf: string, format: string) => {
            // soundfont-player supports 'mp3' or 'ogg' - use mp3, our files.
            const ext = format === "ogg" ? "-ogg.js" : "-mp3.js";
            return `${localBase}${name}${ext}`;
          },
          format: "mp3",
        });
        console.debug("[Sampler] Loaded LOCAL soundfont", { preset: preset.name, gm: preset.gmName });
        return;
      } catch (localErr) {
        console.debug("[Sampler] Local soundfont not found, trying CDN...", localErr);
      }

      // Online fallback: gleitz CDN. Works if the user has internet.
      instrumentRef.current = await Soundfont.instrument(ctx, preset.gmName as any, {
        soundfont: "MusyngKite",
        format: "mp3",
      });
      console.debug("[Sampler] Loaded CDN soundfont", { preset: preset.name, gm: preset.gmName });
    } catch (error) {
      instrumentRef.current = null;
      sampleBufferRef.current = null;
      console.debug("[Sampler] Soundfont load failed; using oscillator fallback", error);
    } finally {
      loadingInstrumentRef.current = false;
      setGuitarLoading(false);
    }
  };

  const playChordSound = async (label: string, durationMs: number) => {
    const ctx = ensureAudio();
    if (ctx.state === "suspended") {
      await ctx.resume();
    }
    const now = ctx.currentTime;
    const notes = chordNotes(label);

    if (!instrumentRef.current) {
      await loadInstrument(guitarPreset);
    }

    if (sampleBufferRef.current) {
      notes.forEach((note) => {
        const src = ctx.createBufferSource();
        src.buffer = sampleBufferRef.current;
        src.playbackRate.value = 2 ** ((note - sampleRootMidiRef.current) / 12);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(Math.max(0.01, volume * 0.6), now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + durationMs / 1000);

        src.connect(gain);
        gain.connect(ctx.destination);
        src.start(now);
        src.stop(now + durationMs / 1000 + 0.05);
      });
      return;
    }

    if (instrumentRef.current) {
      notes.forEach((note) => {
        instrumentRef.current.play(note, now, {
          duration: durationMs / 1000,
          gain: Math.max(0.01, volume * 0.7),
        });
      });
      return;
    }

    // Avoid chip-tone fallback in production builds.
    console.debug("[Sampler] No WAV sample and no soundfont available for", guitarPreset.name);
  };

  const recordSnapshot = (nextTopCode: number, nextGuideCode: number | null, label?: string) => {
    pushSnapshot({ topCode: nextTopCode, guideCode: nextGuideCode, label });
  };

  const addChordToBuilderAndRecord = (label: string, targetCode: number, insertIndex?: number) => {
    const base = builderRef.current;
    // Reject if the progression is already at the hard limit the spec
    // sets (360 bars x 4 = 1440 chords).
    if (base.length >= MAX_CHORDS) {
      alert(`Progression is at the maximum of ${MAX_CHORDS} chords. Delete some before adding more.`);
      return;
    }
    const safeIndex = Math.max(0, Math.min(insertIndex ?? base.length, base.length));
    // New chord gets its duration from the CURRENT snap value. Existing
    // chords keep whatever beats they were added with (that's why we
    // store `beats` per chord and never rewrite it when snap changes).
    const beatsForNewChord = snapDurationBeats(snap);
    const nextBuilder = [
      ...base.slice(0, safeIndex),
      { id: crypto.randomUUID(), label, beats: beatsForNewChord },
      ...base.slice(safeIndex),
    ];
    setBuilderChords(nextBuilder);
    pushBuilderHistory(nextBuilder);
    setSelectedBuilderIds([]);

    // Scroll On History records ONLY when Scroll On/Off is active. When it's
    // off, clicking a chord in "Chords for Progressions" still adds it to
    // the Builder (and to the Builder's own Undo/Redo stack), but the
    // Scroll On History bar stays untouched - that's the "scrolling
    // history" the user is building intentionally.
    //
    // We pass the full chord `label` here (which is what the user clicked/
    // dropped, e.g. "C Maj 7 #11 /E"). The history bar previously showed
    // "C Maj" because it rebuilt the label from just the target row's
    // root+type, losing extension/alteration/bass. Now the bar shows the
    // exact chord that was added.
    if (scrollFollowMode) {
      recordSnapshot(targetCode, guideCodeRef.current, label);
    }

    if (!scrollFollowMode) {
      setActiveBtn("");
      return;
    }

    if (jumpTimerRef.current !== null) {
      window.clearTimeout(jumpTimerRef.current);
    }
    jumpTimerRef.current = window.setTimeout(() => {
      scrollToCode(targetCode, "smooth");
      setActiveBtn("");
      jumpTimerRef.current = null;
    }, 140);
  };

  // Batch version of addChordToBuilderAndRecord for multi-drop scenarios.
  // We CAN'T just call addChordToBuilderAndRecord in a forEach loop because
  // that function reads builderRef.current each call - which stays stale
  // across the synchronous forEach (React state updates queue up but the
  // ref only refreshes after the render). Result: every call inserted into
  // the same starting array, only the LAST setBuilderChords survived, and
  // the user saw only one chord land in the Builder.
  //
  // Instead, build the final array in ONE step and dispatch a single
  // setBuilderChords + pushBuilderHistory + (optional) recordSnapshot.
  const addChordsToBuilderAndRecord = (
    items: Array<{ label: string; code: number }>,
    insertIndex?: number
  ) => {
    if (items.length === 0) return;
    const base = builderRef.current;
    if (base.length + items.length > MAX_CHORDS) {
      alert(`Cannot add ${items.length} chords: progression would exceed the maximum of ${MAX_CHORDS}.`);
      return;
    }
    const safeIndex = Math.max(0, Math.min(insertIndex ?? base.length, base.length));
    // All chords in the batch get the same beats value (the current Snap).
    const beatsForNewChord = snapDurationBeats(snap);
    const newBlocks = items.map((it) => ({
      id: crypto.randomUUID(),
      label: it.label,
      beats: beatsForNewChord,
    }));
    const nextBuilder = [
      ...base.slice(0, safeIndex),
      ...newBlocks,
      ...base.slice(safeIndex),
    ];
    setBuilderChords(nextBuilder);
    pushBuilderHistory(nextBuilder);
    setSelectedBuilderIds([]);

    // Only record ONE Scroll On History entry for the whole batch (using
    // the FIRST item's code+label). Adding N entries for a multi-drop
    // would spam the history bar for no clear benefit.
    if (scrollFollowMode) {
      const first = items[0];
      const codeForSnap = Number.isFinite(first.code) ? first.code : topCodeRef.current;
      recordSnapshot(codeForSnap, guideCodeRef.current, first.label);
    }
    setActiveBtn("");
  };

  // Called for a SHORT TAP on a Builder chord (mouseup < longPressMs after
  // mousedown). Behaviour depends on current app mode:
  //   1. Delete mode ON  -> remove the chord immediately.
  //   2. Something already selected -> toggle THIS chord in/out of selection.
  //   3. Nothing selected + Ch On/Off (audition) mode -> play the chord.
  //   4. Nothing selected + audition off -> no-op (avoid accidental audition).
  // Long-press to enter selection is handled separately (see gesture code
  // on the button itself), not here.
  const selectBuilderChord = (id: string, _index: number) => {
    if (deleteMode) {
      const next = builderRef.current.filter((ch) => ch.id !== id);
      setBuilderChords(next);
      pushBuilderHistory(next);
      setFlashBuilderId(id);
      window.setTimeout(() => setFlashBuilderId(""), 220);
      recordSnapshot(topCodeRef.current, guideCodeRef.current);
      setSelectedBuilderIds((prev) => prev.filter((x) => x !== id));
      return;
    }

    const hasSelection = selectedRef.current.length > 0;
    if (hasSelection) {
      // Toggle THIS chord in/out of the current selection.
      setSelectedBuilderIds((prev) =>
        prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
      );
      return;
    }

    // No selection - fall back to audition if enabled.
    if (auditionMode) {
      void playChordSound(builderRef.current.find((c) => c.id === id)?.label ?? "", 650);
    }
    // Otherwise do nothing (short tap on a Builder chord with nothing
    // selected and audition off is a no-op).
  };

  // Enter "gesture selection" - triggered by a long-press on a Builder chord.
  // If the chord isn't already selected, ADD it to the selection (never
  // replace, so long-pressing chord-by-chord builds up a multi-selection).
  const enterGestureSelection = (id: string) => {
    setSelectedBuilderIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  };

  // beginDragSelect / continueDragSelect removed - they implemented the
  // old "click and drag across chords to lasso-select" behaviour, which is
  // replaced by discrete long-press / short-tap gestures per chord.

  // Move the currently-selected Builder chords to `insertIndex`, where
  // `insertIndex` is expressed in the FULL builder array's coordinates
  // (i.e. the raw index the user is pointing at, including selected chords
  // still counted). This function does the two things the naive version
  // used to get wrong:
  //
  //   1. It preserves the ORIGINAL ordering of the selected chords - even
  //      if they were on non-consecutive positions like 0 and 2, they end
  //      up as 0->2 (not the reverse) after the move.
  //   2. It translates insertIndex from the full array's coordinates into
  //      the `remaining` (unselected) array's coordinates. Otherwise a
  //      drop between two unselected chords would land at the wrong slot
  //      because the selected chords in between are no longer there once
  //      we remove them.
  //
  // Also, a drop AT or PAST the end of the visible builder (i.e. the user
  // dragged into the empty white space at the right) collapses to
  // `remaining.length`, so the whole selection group appends to the end.
  const reorderSelection = (insertIndex: number) => {
    const selectedIds = selectedRef.current;
    if (selectedIds.length === 0) return;

    const base = builderRef.current;
    const selectedSet = new Set(selectedIds);

    // Rule 3: keep the ORIGINAL order of selected chords (not selection
    // order). We iterate through the full builder and pull out selected
    // items in the order they appear there.
    const selectedItems: typeof base = [];
    const remaining: typeof base = [];
    base.forEach((c) => {
      if (selectedSet.has(c.id)) selectedItems.push(c);
      else remaining.push(c);
    });

    // Translate insertIndex from full-array coordinates to remaining-array
    // coordinates: count how many selected chords are STRICTLY BEFORE
    // insertIndex in the full array and subtract that many from insertIndex.
    let removedBefore = 0;
    for (let i = 0; i < Math.min(insertIndex, base.length); i++) {
      if (selectedSet.has(base[i].id)) removedBefore++;
    }
    const translated = insertIndex - removedBefore;
    const safeIndex = Math.max(0, Math.min(translated, remaining.length));

    const next = [
      ...remaining.slice(0, safeIndex),
      ...selectedItems,
      ...remaining.slice(safeIndex),
    ];

    setBuilderChords(next);
    pushBuilderHistory(next);
    recordSnapshot(topCodeRef.current, guideCodeRef.current);
  };

  const deleteSelected = () => {
    if (selectedRef.current.length === 0) return;
    const selectedSet = new Set(selectedRef.current);
    const next = builderRef.current.filter((x) => !selectedSet.has(x.id));
    setBuilderChords(next);
    pushBuilderHistory(next);
    setSelectedBuilderIds([]);
    recordSnapshot(topCodeRef.current, guideCodeRef.current);
  };

  const copySelected = () => {
    const set = new Set(selectedRef.current);
    setClipboardChords(builderRef.current.filter((x) => set.has(x.id)).map((x) => ({ ...x })));
  };

  const pasteClipboard = (insertIndex: number) => {
    if (clipboardChords.length === 0) return;
    // Paste preserves the ORIGINAL beats of each copied chord, not the
    // current snap value - matches the "existing chords keep their length"
    // rule (copy is treated like snapshot preservation).
    const clones = clipboardChords.map((x) => ({
      id: crypto.randomUUID(),
      label: x.label,
      beats: x.beats > 0 ? x.beats : DEFAULT_CHORD_BEATS,
    }));
    const base = builderRef.current;
    const safeIndex = Math.max(0, Math.min(insertIndex, base.length));
    const next = [...base.slice(0, safeIndex), ...clones, ...base.slice(safeIndex)];
    setBuilderChords(next);
    pushBuilderHistory(next);
    setSelectedBuilderIds(clones.map((x) => x.id));
    recordSnapshot(topCodeRef.current, guideCodeRef.current);
  };

  const findBuilderInsertIndex = (clientX: number) => {
    const nodes = Array.from(document.querySelectorAll<HTMLElement>("[data-builder-index]"));
    for (const node of nodes) {
      const rect = node.getBoundingClientRect();
      if (clientX >= rect.left && clientX <= rect.right) {
        const idx = Number(node.dataset.builderIndex ?? "0");
        return clientX < rect.left + rect.width / 2 ? idx : idx + 1;
      }
    }
    return builderRef.current.length;
  };

  const togglePlay = () => {
    if (isPlaying) {
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      pausedElapsedRef.current = performance.now() - playStartRef.current;
      setIsPlaying(false);
      setIsPaused(true);
      return;
    }
    if (builderRef.current.length === 0) return;

    const beatMs = 60000 / bpm;
    // Cumulative start times of each chord, in ms from t=0.
    // With variable per-chord durations we can't just multiply, we have
    // to add up as we go. offsets[i] = start ms of chord i; offsets[N]
    // = total playback ms.
    const offsets: number[] = [0];
    builderRef.current.forEach((c) => {
      const b = c.beats > 0 ? c.beats : DEFAULT_CHORD_BEATS;
      offsets.push(offsets[offsets.length - 1] + b * beatMs);
    });
    const totalMs = offsets[offsets.length - 1];

    // Cache the FIRST chord's ms as playChordMsRef so places that still
    // read it (audition timeouts) have a sane value. Real per-chord
    // playback uses offsets[] below.
    playChordMsRef.current = offsets[1] - offsets[0];

    setIsPlaying(true);
    setIsPaused(false);

    if (pausedElapsedRef.current > 0) {
      playStartRef.current = performance.now() - pausedElapsedRef.current;
    } else {
      playStartRef.current = performance.now();
      playedIndexRef.current = -1;
      setPlayheadIndex(0);
      setPlayheadX(0);
    }

    const tick = () => {
      const elapsed = performance.now() - playStartRef.current;
      // Convert elapsed ms to x-pixels using the CURRENT effective beat
      // width (via ref) so a mid-playback zoom change keeps the playhead
      // in sync with the visually re-scaled chord strip.
      const ebw = effectiveBeatWidthRef.current;
      const linearX = Math.min((elapsed / beatMs) * ebw, (totalMs / beatMs) * ebw);
      setPlayheadX(linearX);

      // Find which chord we're currently in by binary-searching offsets.
      // Linear scan is fine here (at most MAX_CHORDS=1440 iterations,
      // per RAF-tick that's still cheap).
      let idx = builderRef.current.length - 1;
      for (let i = 0; i < offsets.length - 1; i++) {
        if (elapsed < offsets[i + 1]) { idx = i; break; }
      }

      if (idx !== playedIndexRef.current) {
        playedIndexRef.current = idx;
        setPlayheadIndex(idx);
        // Play THIS chord's audio for its own duration (not the first
        // chord's duration - important once chords have mixed lengths).
        const durMs = offsets[idx + 1] - offsets[idx];
        void playChordSound(builderRef.current[idx].label, durMs * 0.94);
      }

      if (elapsed >= totalMs) {
        stopPlayback();
        return;
      }

      rafRef.current = window.requestAnimationFrame(tick);
    };

    rafRef.current = window.requestAnimationFrame(tick);
  };

  const applySnapshot = (snapshot: Snapshot, index: number) => {
    stopPlayback();
    setGuideCode(snapshot.guideCode);
    setSelectedBuilderIds([]);
    setSnapshotIndex(index);
    snapshotsRef.current = snapshotsRef.current;
    snapshotIndexRef.current = index;
    scrollToCode(snapshot.topCode, "smooth");
  };

  const handleUndo = () => {
    if (!canUndo) return;
    const nextIndex = snapshotIndexRef.current - 1;
    const snap = snapshotsRef.current[nextIndex];
    applySnapshot(snap, nextIndex);
  };

  const handleRedo = () => {
    if (!canRedo) return;
    const nextIndex = snapshotIndexRef.current + 1;
    const snap = snapshotsRef.current[nextIndex];
    applySnapshot(snap, nextIndex);
  };

  // One block per snapshot, with the exact label recorded when the user
  // clicked/dropped that chord. Previously we deduped by `topCode` alone,
  // which meant two clicks on different chords sharing the same row (e.g.
  // "C Maj" then "C Maj 7") collapsed into one block - the second click
  // silently disappeared from history. Now every snapshot gets its own
  // block, but we still collapse a genuine repeat (exact same code AND
  // label) so quickly scrolling to the same chord twice doesn't spam
  // the bar.
  const historyItems = useMemo(() => {
    const items: Array<{ code: number; label: string; snapshotIndex: number }> = [];
    snapshots.forEach((snap, i) => {
      const row = rowByCode.get(snap.topCode);
      const fallbackLabel = row ? chordDisplay(row) : `#${snap.topCode}`;
      const label = snap.label || fallbackLabel;
      const last = items[items.length - 1];
      if (!last || last.code !== snap.topCode || last.label !== label) {
        items.push({ code: snap.topCode, label, snapshotIndex: i });
      }
    });
    return items;
  }, [snapshots, rowByCode]);

  const getCurrentMidiBytes = () => {
    if (builderRef.current.length === 0) {
      return null;
    }
    return createMidiFile(builderRef.current, bpm);
  };

  // Total length of the current Builder progression, in beats. Used by
  // TimeBar (ruler length) and BuilderGrid (grid line count).
  const totalBuilderBeats = useMemo(() => {
    let sum = 0;
    for (const c of builderChords) sum += c.beats > 0 ? c.beats : DEFAULT_CHORD_BEATS;
    return sum;
  }, [builderChords]);

  // Minimum pixel width the Builder strip container needs, so all current
  // chords fit even with fractional/variable beats. Add a spare full bar
  // at the end so drops after the last chord always find a target area.
  const builderMinPxWidth = useMemo(() => {
    // No more Math.max(24, ...) clamp: at snap 1/2 beat and finer, that
    // clamp forced every short chord to a 24px minimum, making them look
    // identical in the Builder even though their beats values differed.
    // We now honour the true width exactly - short chords look short.
    // Text overflow inside the button is handled by CSS truncation.
    const chordsWidth = builderChords.reduce(
      (sum, c) => sum + (c.beats > 0 ? c.beats : DEFAULT_CHORD_BEATS) * effectiveBeatWidth,
      0
    );
    const oneExtraBar = BEATS_PER_BAR * effectiveBeatWidth;
    return chordsWidth + oneExtraBar;
  }, [builderChords, effectiveBeatWidth]);

  // Called by TimeBar onSeek. `px` is already snapped to the nearest grid
  // line by TimeBar. We update playheadX so the vertical indicator jumps
  // there. If we're currently PLAYING, we also rewind/advance the play
  // start time so playback resumes from that position.
  const handleTimeBarSeek = (px: number) => {
    setPlayheadX(px);
    if (isPlaying || isPaused) {
      const beatMs = 60000 / bpm;
      // Convert px back to ms using the CURRENT effective beat width
      // (so seeks under an active zoom land at the right musical time).
      const seekMs = (px / effectiveBeatWidth) * beatMs;
      // Rewind playStartRef so `elapsed = now - playStartRef` = seekMs.
      playStartRef.current = performance.now() - seekMs;
      pausedElapsedRef.current = seekMs;
      // Update chord index so audio auditions from the right chord next tick.
      let sum = 0;
      let idx = 0;
      const beats = seekMs / beatMs;
      for (let i = 0; i < builderRef.current.length; i++) {
        const b = builderRef.current[i].beats > 0 ? builderRef.current[i].beats : DEFAULT_CHORD_BEATS;
        if (beats < sum + b) { idx = i; break; }
        sum += b;
        idx = i + 1;
      }
      playedIndexRef.current = idx - 1; // let the next tick trigger playChordSound
      setPlayheadIndex(Math.min(idx, builderRef.current.length - 1));
    }
  };

  const saveMidi = async () => {
    const bytes = getCurrentMidiBytes();
    if (!bytes || bytes.length === 0) {
      alert("Chord Progression Builder is empty. Add chords first.");
      return;
    }

    const fileName = "ample-chord-progression.mid";
    const bridge = (window as any).desktopBridge;
    const isElectron = Boolean(bridge);

    // Electron path (preferred on desktop EXE). Uses the async IPC handler
    // exclusively. We do NOT fall back to the sync bridge on the same click
    // - if the user cancelled the dialog, they don't want a second dialog;
    // and if the async handler failed, the sync one uses the same code path
    // internally, so calling it again would just open a duplicate dialog.
    if (typeof bridge?.saveMidiFileAsync === "function") {
      try {
        const result = await bridge.saveMidiFileAsync(Array.from(bytes), fileName);
        if (result && typeof result === "object") {
          if (result.ok) return;
          if (result.canceled) return; // user hit Cancel or "dialog busy" guard
          console.error("[saveMidi] async bridge error:", result.error);
          alert("Save failed: " + (result.error || "unknown"));
          return;
        } else if (result === true) {
          return;
        }
      } catch (err: any) {
        console.error("[saveMidi] async bridge threw:", err);
        alert("Save threw: " + (err && err.message ? err.message : String(err)));
        return;
      }
    }

    // 3) Modern browser file picker (Chrome/Edge). Skip in Electron so we never
    //    silently fall back into a webview save that the user can't see.
    if (!isElectron && "showSaveFilePicker" in window) {
      try {
        const picker = await (window as any).showSaveFilePicker({
          suggestedName: fileName,
          types: [{ description: "MIDI File", accept: { "audio/midi": [".mid"] } }],
        });
        const writable = await picker.createWritable();
        await writable.write(bytes);
        await writable.close();
        return;
      } catch (err: any) {
        // AbortError => user cancelled the picker; treat as success (no fallback).
        if (err && (err.name === "AbortError" || err.code === 20)) return;
        console.warn("[saveMidi] showSaveFilePicker failed, falling back to <a download>:", err);
      }
    }

    // 4) Last-resort: classic anchor download. Works in every browser and, as a
    //    safety net, in Electron too (Electron intercepts it as a download).
    try {
      const blob = new Blob([bytes], { type: "audio/midi" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.rel = "noopener";
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.setTimeout(() => URL.revokeObjectURL(url), 1500);
    } catch (err) {
      console.error("[saveMidi] anchor download failed:", err);
      alert("Save failed. Check the developer console for details.");
    }
  };

  const dragMidiToDaw = (event: React.DragEvent<HTMLButtonElement>) => {
    const bytes = getCurrentMidiBytes();
    if (!bytes || bytes.length === 0) {
      event.preventDefault();
      alert("Chord Progression Builder is empty. Add chords first.");
      return;
    }

    const fileName = "ample-chord-progression.mid";
    const bridge = (window as any).desktopBridge;

    // Electron desktop path: hand a real temp file to the OS so it drops
    // into DAWs (FL Studio, Reaper, Cubase, Ableton) and File Explorer as
    // an actual .mid file. Use the combined 'midiDrag' handler which writes
    // the temp file AND starts the OS drag in the same IPC round-trip -
    // that's critical because startDrag must fire while the renderer is
    // still inside the dragstart event, and two separate sendSync calls
    // sometimes miss that window.
    if (bridge && typeof bridge.midiDrag === "function") {
      try {
        const result = bridge.midiDrag(Array.from(bytes), fileName);
        // In Electron the OS owns the drag now. Always preventDefault so
        // the HTML5 DownloadURL fallback (which does not work in Electron)
        // does not clobber the OS drag session.
        event.preventDefault();
        if (!result || result.ok !== true) {
          alert(
            "Drag failed to start.\n\n" +
            (result && result.error ? "Reason: " + result.error : "No details.")
          );
        }
        return;
      } catch (err: any) {
        console.error("[dragMidiToDaw] midiDrag threw:", err);
        alert("Drag threw: " + (err && err.message ? err.message : String(err)));
        event.preventDefault();
        return;
      }
    }

    // Legacy Electron path (older preload without midiDrag). Kept as a
    // safety net so older builds still work if the app is updated in place.
    if (bridge && typeof bridge.renderMidiTemp === "function" && typeof bridge.startMidiDrag === "function") {
      try {
        const tempPath = bridge.renderMidiTemp(Array.from(bytes), fileName);
        if (tempPath) {
          bridge.startMidiDrag(tempPath);
          event.preventDefault();
          return;
        }
      } catch (err) {
        console.error("[dragMidiToDaw] legacy electron drag failed:", err);
      }
    }

    // Browser fallback (no Electron bridge at all): HTML5 DownloadURL so the
    // file drops into targets that accept it (native file targets in
    // Chromium, some DAWs' browser-drop zones, etc.). Does NOT work in
    // native DAWs like FL Studio from a browser - that requires the EXE.
    try {
      const blob = new Blob([bytes], { type: "audio/midi" });
      const url = URL.createObjectURL(blob);
      event.dataTransfer.effectAllowed = "copy";
      event.dataTransfer.setData("DownloadURL", `audio/midi:${fileName}:${url}`);
      event.dataTransfer.setData("application/x-ample-midi", fileName);
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      console.error("[dragMidiToDaw] browser drag setup failed:", err);
      event.preventDefault();
    }
  };

  useEffect(() => {
    const closeMenu = (e: MouseEvent) => {
      setContextMenu(null);
      setSnapMenuOpen(false);
      // (No size dropdown to close anymore; kept the setContextMenu(null)
      // above so right-click menus still get dismissed on any click.)

      // Clear gesture selections when the click happened OUTSIDE the
      // relevant surface:
      //   - Builder selection is cleared unless the click was on a Builder
      //     chord (data-builder-index) OR on a table chord (so a tap in the
      //     table doesn't drop the Builder selection accidentally).
      //   - Table selection is cleared unless the click was on a table
      //     chord (data-table-chord) OR on a Builder chord (so dragging
      //     from table INTO Builder doesn't lose the table selection).
      const target = e.target as HTMLElement | null;
      let insideBuilderChord = false;
      let insideTableChord = false;
      let node: HTMLElement | null = target;
      while (node) {
        if (node.getAttribute) {
          if (node.getAttribute("data-builder-index") !== null) insideBuilderChord = true;
          if (node.getAttribute("data-table-chord") !== null) insideTableChord = true;
        }
        if (insideBuilderChord && insideTableChord) break;
        node = node.parentElement;
      }
      if (!insideBuilderChord && !insideTableChord && selectedRef.current.length > 0) {
        setSelectedBuilderIds([]);
      }
      if (!insideTableChord && !insideBuilderChord && selectedTableChordsRef.current.length > 0) {
        setSelectedTableChords([]);
      }
    };
    window.addEventListener("click", closeMenu);

    // Delete / Backspace key removes the currently-selected chords.
    // Skipped when the focus is in a text input (BPM editor, etc.) so
    // typing in a text field still deletes characters normally.
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      const active = document.activeElement as HTMLElement | null;
      const tag = active?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || active?.isContentEditable) return;
      if (selectedRef.current.length === 0) return;
      e.preventDefault();
      const toDelete = new Set(selectedRef.current);
      const next = builderRef.current.filter((c) => !toDelete.has(c.id));
      setBuilderChords(next);
      pushBuilderHistory(next);
      setSelectedBuilderIds([]);
      recordSnapshot(topCodeRef.current, guideCodeRef.current);
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("keydown", onKeyDown);
      if (scrollTimerRef.current !== null) window.clearTimeout(scrollTimerRef.current);
      if (jumpTimerRef.current !== null) window.clearTimeout(jumpTimerRef.current);
      if (playTimerRef.current !== null) window.clearInterval(playTimerRef.current);
      if (audioCtxRef.current) void audioCtxRef.current.close();
    };
  }, []);

  useEffect(() => {
    snapToNearestRow();
  }, []);

  // Keep the bottom spacer sized to the current scroll container height so
  // any row can be scrolled to the top even at the end of the table. See
  // the bottomSpacerHeight state declaration for the full rationale.
  useEffect(() => {
    const container = tableRef.current;
    if (!container) return;
    const updateSpacer = () => {
      // Container height minus a small offset for the sticky header and
      // one row of visible content, so the spacer isn't oversized.
      const target = Math.max(container.clientHeight - 80, 0);
      setBottomSpacerHeight(target);
    };
    updateSpacer();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateSpacer);
      return () => window.removeEventListener("resize", updateSpacer);
    }
    const ro = new ResizeObserver(updateSpacer);
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    instrumentRef.current = null;
    sampleBufferRef.current = null;
    sampleRootMidiRef.current = 72;
    void loadInstrument(guitarPreset);
  }, [guitarPreset]);

  const [playheadX, setPlayheadX] = useState(0);

  return (
    <main className="h-screen w-screen overflow-hidden bg-[#acb0ac] p-0 text-black">
      <div className="flex h-full w-full flex-col gap-2 overflow-auto border border-black bg-[#acb0ac] p-2">
      <section className="border border-black bg-white/35 p-2">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold tracking-wide">Scroll On History</h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setStartActive((prev) => !prev)}
              className={`rounded-sm border border-black px-3 py-1 text-xs shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] ${
                startActive ? "bg-green-300 shadow-[0_0_10px_#ff8827,inset_0_1px_0_rgba(255,255,255,0.9)]" : "bg-[#FCBF8D]"
              }`}
            >
              Start
            </button>
            <button
              type="button"
              onClick={handleUndo}
              disabled={!canUndo}
              className={`rounded-sm border border-black px-3 py-1 text-xs shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] ${
                canUndo ? "bg-[#FCBF8D]" : "bg-[#d2b193] text-neutral-600"
              }`}
            >
              Undo
            </button>
            <button
              type="button"
              onClick={handleRedo}
              disabled={!canRedo}
              className={`rounded-sm border border-black px-3 py-1 text-xs shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] ${
                canRedo ? "bg-[#FCBF8D]" : "bg-[#d2b193] text-neutral-600"
              }`}
            >
              Redo
            </button>

            {/* Settings gear icon. Replaces the old Small/Medium/Large
                dropdown. Clicking it opens a full-screen dark modal with:
                  - Size radio group  (Small / Medium / Large)
                  - Long-press ms     (radio group + fine slider)
                Both persist to localStorage via the useEffects up top. */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setSettingsOpen(true);
              }}
              title="Settings"
              aria-label="Settings"
              className="flex items-center justify-center rounded-sm border border-black bg-[#FCBF8D] p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] hover:bg-orange-200"
              style={{ width: 32, height: 32 }}
            >
              <SettingsGearIcon size={22} />
            </button>
          </div>
        </div>

        {/* Scroll On History bar.
            - Container height matches the chord-table row height (h-10 =
              40px inner + 1px padding + 1px border top/bottom) so the two
              feel visually consistent.
            - overflow-x-scroll (not -auto) forces the horizontal scrollbar
              to ALWAYS be visible, mirroring the vertical scrollbar of the
              chord table below. Matches the user's request to have a
              persistent horizontal 'scroll bar' under this section.
            - HISTORY_GAP is now 0, so blocks sit edge-to-edge (see const at
              top of file). The `border` on each block gives us a clean 1px
              divider between neighbours - no double lines because adjacent
              borders collapse visually. */}
        <div className="overflow-x-scroll border border-black bg-white/70 px-1 py-1">
          <div className="flex items-center" style={{ gap: HISTORY_GAP }}>
            {historyItems.map((item, pickIndex) => {
              const { code, label: blockLabel } = item;
              const selected = guidePickIndex === pickIndex;

              return (
                <button
                  key={`history-${pickIndex}-${code}`}
                  type="button"
                  // h-10 mirrors the h-10 of the chord-suggestion buttons in
                  // the chord table so both bars have exactly the same
                  // block dimensions. min-w kept so short labels don't
                  // shrink to a sliver.
                  className={`h-10 min-w-[118px] border border-black px-2 text-left text-xs ${
                    selected ? "bg-green-300 shadow-[0_0_10px_#4df72c]" : "bg-[#bae3b4]"
                  }`}
                  onClick={() => {
                    if (startActive) {
                      // Start mode: mark this history block as the "guide"
                      // chord (turns green with a glow). Also push a fresh
                      // snapshot pinned to this block's own code+label, so
                      // Undo/Redo lands the user back on the chord they
                      // guided TO, not wherever they happened to be
                      // scrolled at the moment of the click.
                      setGuideCode(code);
                      setGuidePickIndex(pickIndex);
                      pushSnapshot({ topCode: code, guideCode: code, label: blockLabel });
                    } else {
                      recordSnapshot(code, guideCodeRef.current, blockLabel);
                      scrollToCode(code, "smooth");
                    }
                  }}
                >
                  {blockLabel}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section className="border border-black bg-white/35 p-2">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h2 className="mr-2 text-sm font-semibold tracking-wide">Chord Progression Builder</h2>

          {/* Multi Select + Select buttons removed - both behaviours are now
              gesture-driven directly on the chord blocks:
                - long-press (>= longPressMs) on any chord = enter selection
                - short tap on other chords while something is selected = toggle add
                - drag any selected chord = moves the entire selection group
                - tap outside all chords = clear selection
                - Ch On/Off + short tap = audition sound
              Delete stays: click a selected chord while Delete mode is on,
              OR press the Delete/Backspace key while chords are selected. */}
          <button
            type="button"
            onClick={() => {
              if (deleteMode) activateBuilderMode("none");
              else activateBuilderMode("delete");
            }}
            title="Delete mode: click a chord to remove it. Or press Delete/Backspace to remove the current selection."
            className={`h-8 w-16 rounded-sm border border-black text-xs shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] ${
              deleteMode ? "bg-green-300 shadow-[0_0_10px_#ff8827]" : "bg-[#FCBF8D]"
            }`}
          >
            Delete
          </button>

          <button
            type="button"
            onClick={togglePlay}
            className={`h-8 w-20 rounded-sm border border-black text-xs shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] ${
              isPlaying || isPaused ? "bg-green-300 shadow-[0_0_10px_#ff8827]" : "bg-[#FCBF8D]"
            }`}
          >
            {isPlaying ? "Pause" : "Play"}
          </button>

          <button
            type="button"
            onClick={stopPlayback}
            className="h-8 w-14 rounded-sm border border-black bg-[#FCBF8D] text-xs shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]"
          >
            Stop
          </button>

          {/* Snap control:
                - Text "Snap"
                - Dropdown with a down-arrow. Clicking opens the seven
                  fixed snap options (Bar first as default). Picking one
                  changes the DURATION of chords added afterwards + the
                  density of the grid lines drawn under the Builder.
              The old time-signature radio buttons (|4/4|3/4|6/8|) were
              removed - the option list was identical for all three, so
              the extra picker added no functionality. */}
          <div className="flex items-center gap-1 rounded-sm border border-black bg-[#FCBF8D] px-2 py-1 text-xs shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]">
            <span className="mr-1 font-semibold">Snap</span>
            <div className="relative" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={() => setSnapMenuOpen((v) => !v)}
                title={`Snap grid (currently ${snap})`}
                className={`flex h-6 items-center gap-1 border border-black bg-white px-2 text-[11px] ${
                  snapMenuOpen ? "bg-green-100 shadow-[0_0_6px_#ff8827]" : ""
                }`}
              >
                <span className="min-w-[54px] text-left">{snap}</span>
                <span aria-hidden="true" className="text-[8px] leading-none">&#9660;</span>
              </button>
              {snapMenuOpen && (
                <div className="absolute right-0 top-7 z-40 w-32 border border-black bg-white shadow-lg">
                  {SNAP_OPTIONS.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => {
                        setSnap(opt);
                        setSnapMenuOpen(false);
                      }}
                      className={`block w-full border-b border-black px-2 py-1 text-left text-xs hover:bg-green-100 ${
                        snap === opt ? "bg-green-200 font-semibold" : ""
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* BPM control. Same padded pill shape as the Length dropdown next
              to it, so both controls line up flush on the toolbar. Scroll
              wheel over the pill still adjusts BPM by 1 (up=+, down=-);
              click to type a value; Enter or blur confirms. The old vertical
              arrows (v/^) were removed - the click-to-edit + scroll-wheel
              affordances already cover the same interaction. */}
          <label
            className="flex select-none items-center gap-1 rounded-sm border border-black bg-[#FCBF8D] px-2 py-1 text-xs shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]"
            onWheel={(e) => {
              e.preventDefault();
              setBpm((prev) => {
                const next = clampBpm(prev + (e.deltaY > 0 ? -1 : 1));
                setBpmText(String(next));
                return next;
              });
            }}
          >
            BPM
            {editingBpm ? (
              <input
                autoFocus
                value={bpmText}
                onChange={(e) => setBpmText(e.target.value.replace(/[^\d]/g, ""))}
                onBlur={() => {
                  const next = clampBpm(Number(bpmText || "120"));
                  setBpm(next);
                  setBpmText(String(next));
                  setEditingBpm(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const next = clampBpm(Number(bpmText || "120"));
                    setBpm(next);
                    setBpmText(String(next));
                    setEditingBpm(false);
                  }
                }}
                className="w-12 border border-black bg-white px-1 text-center"
              />
            ) : (
              <button
                type="button"
                onClick={() => {
                  setEditingBpm(true);
                  setBpmText(String(bpm));
                }}
                className="w-12 border border-black bg-white px-1 text-center"
                title="Click to type a BPM value, or scroll over this box to nudge by 1."
              >
                {bpm}
              </button>
            )}
          </label>

          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setGuitarOpen((prev) => !prev);
              }}
              className={`h-8 rounded-sm border border-black bg-[#FCBF8D] px-2 text-xs shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] ${
                guitarOpen ? "shadow-[0_0_10px_#ff8827]" : ""
              }`}
            >
              {guitarLoading ? "loading..." : guitarPreset.name}
            </button>
            {guitarOpen && (
              <div className="absolute left-0 top-9 z-40 w-52 border border-black bg-white">
                {GUITAR_PRESETS.map((preset) => (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() => {
                      setGuitarPreset(preset);
                      setGuitarOpen(false);
                      void loadInstrument(preset);
                    }}
                    className="block w-full border-b border-black px-2 py-1 text-left text-xs hover:bg-green-100"
                  >
                    {preset.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Save button: click only. Opens the native Save As dialog and
              writes the MIDI file where the user chooses. */}
          <button
            type="button"
            onClick={() => {
              void saveMidi();
            }}
            title="Save the current chord progression as a .mid file (Save As dialog)."
            className="rounded-sm border border-black bg-[#FCBF8D] px-2 py-1 text-xs shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]"
          >
            Save
          </button>

          {/* D&D button: drag only. Starts an OS-native drag session so the
              MIDI file can be dropped straight into a DAW (FL Studio, Reaper,
              Cubase, Ableton) or File Explorer. Clicking it (instead of
              dragging) shows a friendly hint rather than saving - Save has
              its own button now, and mixing the two on one control turned
              out to be fragile (drag-end synthesised clicks, sync/async
              collisions, unclear failure modes). */}
          <button
            type="button"
            draggable
            onDragStart={dragMidiToDaw}
            onClick={() => {
              if (builderRef.current.length === 0) {
                alert("Chord Progression Builder is empty. Add chords first.");
                return;
              }
              alert("Drag this button into your DAW (or File Explorer) to drop the MIDI file.");
            }}
            title="Drag this button into your DAW (FL Studio, Reaper, Cubase, Ableton, ...) or into File Explorer to drop the MIDI file directly."
            className="cursor-grab rounded-sm border border-black bg-[#FCBF8D] px-2 py-1 text-xs shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] active:cursor-grabbing"
          >
            D&amp;D
          </button>

          <div className="flex items-center gap-1 rounded-sm border border-black bg-[#FCBF8D] px-2 py-1 text-xs shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]">
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
            />
          </div>

          <button
            type="button"
            onClick={undoBuilder}
            disabled={!canBuilderUndo}
            className={`rounded-sm border border-black px-2 py-1 text-xs shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] ${
              canBuilderUndo ? "bg-[#FCBF8D]" : "bg-[#d2b193] text-neutral-600"
            }`}
          >
            Undo
          </button>

          <button
            type="button"
            onClick={redoBuilder}
            disabled={!canBuilderRedo}
            className={`rounded-sm border border-black px-2 py-1 text-xs shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] ${
              canBuilderRedo ? "bg-[#FCBF8D]" : "bg-[#d2b193] text-neutral-600"
            }`}
          >
            Redo
          </button>

          <button
            type="button"
            onClick={toggleChordAudition}
            className={`rounded-sm border border-black px-2 py-1 text-xs text-[#6f1c03] shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] ${
              auditionMode ? "bg-green-300 shadow-[0_0_8px_#ff8827]" : "bg-[#FCBF8D]"
            }`}
          >
            Ch On\Off
          </button>

          <button
            type="button"
            onClick={() => {
              if (scrollFollowMode) activateBuilderMode("none");
              else activateBuilderMode("scroll");
            }}
            className={`rounded-sm border border-black px-3 py-1 text-xs shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] ${
              scrollFollowMode ? "bg-green-300 shadow-[0_0_10px_#ff8827]" : "bg-[#FCBF8D]"
            }`}
          >
            Scroll On\Off
          </button>
        </div>

        {/* Time Bar - horizontal ruler above the Builder strip. Numbered
            1..N bars (max MAX_BARS=360). Click anywhere on it to snap the
            playhead to the nearest grid line for the current Snap.
            Height doubled per user request. */}
        <TimeBar
          totalBeats={totalBuilderBeats}
          pixelsPerBeat={effectiveBeatWidth}
          snap={snap}
          playheadX={playheadX}
          onSeek={handleTimeBarSeek}
        />

        {/* Zoom slider - drag the edges of the bright thumb to zoom in
            (narrower thumb) or out (wider thumb). Double-click to reset
            to 1x. Wired to `zoom` state which drives effectiveBeatWidth,
            so both the Time Bar above and the chord strip below re-scale
            together. */}
        <ZoomSlider zoom={zoom} onZoomChange={setZoom} />

        <div
          className="relative overflow-x-auto border border-black bg-white/80 px-0 py-0"
          onDragOver={(e) => {
            // Accept THREE kinds of drops on the Builder container:
            //   (a) single-chord drag from the chord table (MIME
            //       application/x-progression-chord)
            //   (b) multi-chord drag from the chord table (MIME
            //       application/x-progression-chords-multi)
            //   (c) internal Builder reorder drag - dragging a selected
            //       Builder block into empty space. HTML5 drag/drop hides
            //       the actual dataTransfer contents during dragover in
            //       Chromium so we can't sniff a MIME for the internal
            //       case. We fall back to isDraggingBuilderRef which the
            //       Builder button's onDragStart flips to true.
            const t = e.dataTransfer.types;
            const isTableDrag =
              t.includes("application/x-progression-chord") ||
              t.includes("application/x-progression-chords-multi");
            const isInternalReorder = isDraggingBuilderRef.current;
            if (isTableDrag || isInternalReorder) {
              e.preventDefault();
            }
          }}
          onDrop={(e) => {
            const insertIndex = findBuilderInsertIndex(e.clientX);

            // Internal Builder reorder drop (into whitespace or between
            // chords). Route to reorderSelection, which already knows how
            // to handle groups, non-consecutive selections, and end-of-list.
            if (isDraggingBuilderRef.current) {
              e.preventDefault();
              reorderSelection(insertIndex);
              return;
            }

            const multiJson = e.dataTransfer.getData("application/x-progression-chords-multi");
            const label = e.dataTransfer.getData("application/x-progression-chord");
            if (!multiJson && !label) return;
            e.preventDefault();

            if (multiJson) {
              // Multi-drop from the table. Parse the JSON payload and
              // insert ALL chords in one batched state update via
              // addChordsToBuilderAndRecord. Doing this in a forEach loop
              // with addChordToBuilderAndRecord fails: builderRef.current
              // stays stale across the synchronous loop, so only the last
              // insert survives (which was the "only one chord made it"
              // bug the user reported).
              try {
                const items: Array<{ label: string; code: number }> = JSON.parse(multiJson);
                if (Array.isArray(items) && items.length > 0) {
                  addChordsToBuilderAndRecord(items, insertIndex);
                  return;
                }
              } catch (err) {
                console.error("[builder onDrop] multi payload parse failed:", err);
                // Fall through to single-chord path below.
              }
            }

            // Single-chord drop (legacy / non-multi drag).
            const codeStr = e.dataTransfer.getData("application/x-progression-code");
            const droppedCode = codeStr ? Number(codeStr) : NaN;
            const targetCode = Number.isFinite(droppedCode) ? droppedCode : topCodeRef.current;
            addChordToBuilderAndRecord(label, targetCode, insertIndex);
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            setContextMenu({ x: e.clientX, y: e.clientY, insertIndex: builderRef.current.length });
          }}
        >
          <div
            className="relative"
            style={{
              // 5x the previous ~48px = 240px. Set on the wrapper so the
              // BuilderGrid overlay + the chord-button flex row share the
              // same tall canvas.
              height: BUILDER_STRIP_HEIGHT,
              // Ensure the container is at least as wide as the ruler above
              // (equivalent to MAX_BARS worth of bars) so the horizontal
              // scrollbars of the two stay in sync when the user scrolls.
              minWidth: `${Math.max(builderMinPxWidth, 800)}px`,
            }}
          >
            {/* Vertical grid lines underneath everything. z-index 0. */}
            <BuilderGrid
              widthPx={Math.max(builderMinPxWidth, 800)}
              heightPx={BUILDER_STRIP_HEIGHT}
              pixelsPerBeat={effectiveBeatWidth}
              snap={snap}
            />

            {(isPlaying || isPaused) && builderChords.length > 0 && (
              <>
                <div
                  className="pointer-events-none absolute bottom-0 top-0 z-20 w-[2px] bg-[#ff8827] shadow-[0_0_10px_#ff8827]"
                  style={{ left: `${playheadX}px` }}
                />
              </>
            )}

            <div className="relative z-10 flex h-full items-stretch" style={{ gap: BUILDER_GAP }}>
              {builderChords.map((chord, index) => {
                const selected = selectedBuilderIds.includes(chord.id);
                const playing = isPlaying && playheadIndex === index;
                const blinking = flashBuilderId === chord.id;

                return (
                  <button
                    key={chord.id}
                    type="button"
                    data-builder-index={index}
                    // A chord button is draggable only WHILE it's selected,
                    // so an idle chord tap can't accidentally start a drag.
                    // Dragging a selected chord moves the ENTIRE current
                    // selection group as a block (see reorderSelection).
                    draggable={selected}
                    onMouseDown={() => {
                      // Start the long-press timer. If the pointer stays
                      // pressed for longPressMs, we enter selection mode
                      // for this chord. Otherwise the mouseup handler
                      // clears the timer and treats it as a short tap.
                      longPressFiredRef.current = false;
                      if (longPressTimerRef.current !== null) {
                        window.clearTimeout(longPressTimerRef.current);
                      }
                      longPressTimerRef.current = window.setTimeout(() => {
                        longPressFiredRef.current = true;
                        enterGestureSelection(chord.id);
                        lastSelectedIndexRef.current = index;
                        // A long-press must NOT also trigger the click that
                        // fires when the user finally releases the button.
                        suppressNextClickRef.current = true;
                      }, longPressMs);
                    }}
                    onMouseUp={() => {
                      if (longPressTimerRef.current !== null) {
                        window.clearTimeout(longPressTimerRef.current);
                        longPressTimerRef.current = null;
                      }
                    }}
                    onMouseLeave={() => {
                      // Pointer left the button before the long-press fired
                      // (or user is starting to drag) - cancel the timer.
                      if (longPressTimerRef.current !== null) {
                        window.clearTimeout(longPressTimerRef.current);
                        longPressTimerRef.current = null;
                      }
                    }}
                    onDragStart={() => {
                      if (!selected) return;
                      isDraggingBuilderRef.current = true;
                      // Cancel any pending long-press timer - the user is
                      // clearly doing a drag, not a hold.
                      if (longPressTimerRef.current !== null) {
                        window.clearTimeout(longPressTimerRef.current);
                        longPressTimerRef.current = null;
                      }
                    }}
                    onDragEnd={() => {
                      window.setTimeout(() => {
                        isDraggingBuilderRef.current = false;
                      }, 0);
                    }}
                    onDragOver={(e) => {
                      if (selectedBuilderIds.length > 0) e.preventDefault();
                    }}
                    onDrop={(e) => {
                      if (selectedBuilderIds.length === 0) return;
                      e.preventDefault();
                      const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                      const before = e.clientX < rect.left + rect.width / 2;
                      const baseIndex = builderRef.current.findIndex((x) => x.id === chord.id);
                      reorderSelection(before ? baseIndex : baseIndex + 1);
                    }}
                    onClick={() => {
                      // Suppress the synthetic click after a long-press or
                      // an OS-native drag - the gesture already did its job.
                      if (suppressNextClickRef.current) {
                        suppressNextClickRef.current = false;
                        return;
                      }
                      if (isDraggingBuilderRef.current) return;
                      selectBuilderChord(chord.id, index);
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                      const before = e.clientX < rect.left + rect.width / 2;
                      const idx = builderRef.current.findIndex((x) => x.id === chord.id);
                      setContextMenu({ x: e.clientX, y: e.clientY, insertIndex: before ? idx : idx + 1 });
                    }}
                    title={`${chord.label}  ->  ${chordNotesDisplay(chord.label)}  [${chord.beats} beats]`}
                    // Width proportional to the chord's own beats value, so
                    // a 1-bar chord is 4x wider than a 1-beat chord under
                    // the same time signature. Kept a minimum so ultra-
                    // short 1/8-step chords are still clickable.
                    style={{
                      // Honour the chord's actual duration exactly (no
                      // min clamp). Overflowing text is handled by the
                      // shrink-to-fit CSS inside the button below.
                      width: `${chord.beats * effectiveBeatWidth}px`,
                      flexShrink: 0,
                    }}
                    className={`relative z-10 h-full border border-black px-1 text-left text-[11px] transition-all ${
                      selected
                        ? "bg-green-300/90 shadow-[0_0_12px_#ff8827] ring-2 ring-[#ff8827]"
                        : playing || blinking
                        ? "bg-green-300/90 shadow-[0_0_10px_#4df72c]"
                        : "bg-[#bae3b4]/90 hover:shadow-[0_0_8px_#4df72c]"
                    }`}
                  >
                    {/* The chord label + its notes list are rendered via
                        FitText (SVG-based auto-shrink). If the button is
                        wide enough for the natural text width, the text
                        renders at full size. If not, the SVG's viewBox
                        scales the glyphs DOWN horizontally to fit -
                        never stretched vertically. Text starts to shrink
                        only when there is no horizontal breathing room
                        left on either side. */}
                    <div style={{ height: 14 }} className="w-full overflow-hidden">
                      <FitText text={chord.label} height={12} />
                    </div>
                    <div style={{ height: 10 }} className="w-full overflow-hidden text-neutral-600">
                      <FitText text={chordNotesDisplay(chord.label)} height={9} />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <div
        ref={tableRef}
        onScroll={() => {
          if (scrollTimerRef.current !== null) window.clearTimeout(scrollTimerRef.current);
          scrollTimerRef.current = window.setTimeout(() => {
            snapToNearestRow();
            scrollTimerRef.current = null;
          }, 120);
        }}
        // Fixed height: header (~32px) + 4 x row (~42px each = 168px)
        // = ~200px. User asked for exactly 4 rows visible, with the last
        // row fully drawn (not clipped). Overflow-y-auto keeps the
        // vertical scrollbar. flex-1 removed so the table doesn't stretch
        // to fill leftover vertical space.
        //
        // Height math: header ~32 + 4 rows x ~80 (each row can wrap onto
        // TWO internal lines of suggestion buttons) = ~352px. Bumped from
        // 200 to 360 so 4 rows are ALWAYS visible even in the worst
        // wrap-heavy case. Users on the Small window preset may need to
        // scroll the outer app to see the very last row - but four full
        // rows will render inside this box regardless.
        style={{ height: 360 }}
        className="w-full overflow-y-auto overflow-x-auto border border-black bg-white"
      >
        <table className="min-w-full border-collapse text-sm text-black">
          <thead ref={headRef} className="sticky top-0 z-20 bg-[#e8e8e8]">
            <tr>
              {/* Row number column. Same value as row.code, shown so the user
                  can pinpoint any row unambiguously ("row #457") when
                  reporting scroll issues or comparing to the history bar. */}
              {/* Header cells: py-1 (vs body cells' py-0 + auto-stretch to
                  h-10) keeps the header slightly compact but still readable.
                  Using py-1 rather than py-2 shaves ~8px off the header
                  height so it matches the narrower body rows the user
                  asked for. */}
              <th className="border border-black px-2 py-1 text-right font-semibold text-neutral-500">#</th>
              <th className="border border-black px-2 py-1 text-left font-semibold">Root</th>
              <th className="border border-black px-2 py-1 text-left font-semibold">Type</th>
              <th className="border border-black px-2 py-1 text-left font-semibold">Extension</th>
              <th className="border border-black px-2 py-1 text-left font-semibold">Alteration</th>
              <th className="border border-black px-2 py-1 text-left font-semibold">Bass</th>
              <th className="border border-black px-2 py-1 text-left font-semibold">Chords for Progressions</th>
            </tr>
          </thead>

          <tbody>
            {rows.map((row) => {
              const baseSuggestion: ProgressionSuggestion = { rowId: row.id, label: chordDisplay(row) };
              const suggestions = [
                baseSuggestion,
                ...getProgressionSuggestions(row).filter((item) => item.rowId !== row.id),
              ];
              const rowHighlighted = activeRow === row.id || guideCode === row.code;

              return (
                <tr
                  key={row.id}
                  ref={(el) => {
                    rowRefs.current[row.code] = el;
                  }}
                  className={`${rowHighlighted ? "bg-green-100" : "bg-white"}`}
                >
                  {/* Row cells: py-0 collapses vertical padding to zero so
                      the row height is driven purely by the h-10 of the
                      suggestion buttons in the last cell. Wider labels are
                      still readable because the button padding gives
                      breathing room; the leading cells get their height
                      from the row itself (they auto-stretch).
                      align-middle keeps the metadata text vertically
                      centered against the taller suggestion strip. */}
                  <td className="border border-black px-2 py-0 text-right align-middle text-neutral-500 tabular-nums">{row.code}</td>
                  <td className="border border-black px-2 py-0 align-middle">{row.root}</td>
                  <td className="border border-black px-2 py-0 align-middle">{row.type}</td>
                  <td className="border border-black px-2 py-0 align-middle">{row.extension}</td>
                  <td className="border border-black px-2 py-0 align-middle">{row.alteration}</td>
                  <td className="border border-black px-2 py-0 align-middle">{row.bass}</td>
                  <td className="border border-black p-0 align-middle">
                    {/* Suggestion buttons: gap-0 so they touch edge-to-edge
                        (user asked for zero space between them). flex-wrap
                        stays so a long list wraps to a second visual row
                        instead of overflowing the cell. */}
                    <div className="flex flex-wrap gap-0">
                      {suggestions.map((nextChord, idx) => {
                        const btnId = `${row.id}-${nextChord.rowId}-${idx}`;
                        const pressed = activeBtn === btnId;
                        const selected = selectedTableChords.some((s) => s.btnId === btnId);
                        const targetRow = rowById.get(nextChord.rowId);
                        const nextCode = targetRow ? targetRow.code : 0;

                        return (
                          <button
                            key={btnId}
                            type="button"
                            data-table-chord={btnId}
                            // Same gesture model as Builder chords:
                            //  - long-press >= longPressMs -> add THIS button
                            //    to the table selection (multi-select builds
                            //    up as you long-press more).
                            //  - short tap (no active selection) -> audition
                            //    the chord if Ch On/Off is on, otherwise
                            //    NOTHING (user explicitly asked for this in
                            //    the plan - tap should never accidentally
                            //    add chords when audition is off).
                            //  - short tap with an active selection -> toggle
                            //    THIS button in/out of the selection.
                            //  - drag a selected button -> drops the WHOLE
                            //    selection group into the Builder at the
                            //    drop position (uses the multi-chord MIME
                            //    'application/x-progression-chords-multi').
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.effectAllowed = "copy";

                              // If the dragged button is part of a
                              // multi-selection, transfer the WHOLE selection
                              // (as JSON). If not, transfer only this one
                              // (single-chord behaviour, backwards compatible
                              // with the existing MIME the Builder onDrop
                              // handler already understands).
                              const sel = selectedTableChordsRef.current;
                              const multi = sel.length > 0 && sel.some((s) => s.btnId === btnId);
                              if (multi) {
                                e.dataTransfer.setData(
                                  "application/x-progression-chords-multi",
                                  JSON.stringify(sel.map((s) => ({ label: s.label, code: s.code })))
                                );
                                // Keep the single-chord MIME too so any code
                                // path expecting it still finds SOMETHING.
                                e.dataTransfer.setData(
                                  "application/x-progression-chord",
                                  nextChord.label
                                );
                                if (targetRow) {
                                  e.dataTransfer.setData(
                                    "application/x-progression-code",
                                    String(targetRow.code)
                                  );
                                }
                                e.dataTransfer.setData("text/plain", sel.map((s) => s.label).join(", "));
                              } else {
                                e.dataTransfer.setData("application/x-progression-chord", nextChord.label);
                                if (targetRow) {
                                  e.dataTransfer.setData(
                                    "application/x-progression-code",
                                    String(targetRow.code)
                                  );
                                }
                                e.dataTransfer.setData("text/plain", nextChord.label);
                              }

                              isDraggingProgressionRef.current = true;
                              // Cancel any pending long-press timer - the
                              // user is dragging, not holding.
                              if (longPressTimerRef.current !== null) {
                                window.clearTimeout(longPressTimerRef.current);
                                longPressTimerRef.current = null;
                              }
                            }}
                            onDragEnd={() => {
                              window.setTimeout(() => {
                                isDraggingProgressionRef.current = false;
                              }, 250);
                            }}
                            onMouseDown={() => {
                              // Start the long-press timer. Same mechanism
                              // as Builder chord buttons.
                              longPressFiredRef.current = false;
                              if (longPressTimerRef.current !== null) {
                                window.clearTimeout(longPressTimerRef.current);
                              }
                              longPressTimerRef.current = window.setTimeout(() => {
                                longPressFiredRef.current = true;
                                suppressNextClickRef.current = true;
                                // Add to table selection (dedup on btnId).
                                setSelectedTableChords((prev) =>
                                  prev.some((s) => s.btnId === btnId)
                                    ? prev
                                    : [...prev, { btnId, label: nextChord.label, code: nextCode }]
                                );
                              }, longPressMs);
                            }}
                            onMouseUp={() => {
                              if (longPressTimerRef.current !== null) {
                                window.clearTimeout(longPressTimerRef.current);
                                longPressTimerRef.current = null;
                              }
                            }}
                            onMouseLeave={() => {
                              if (longPressTimerRef.current !== null) {
                                window.clearTimeout(longPressTimerRef.current);
                                longPressTimerRef.current = null;
                              }
                            }}
                            onClick={() => {
                              // Post-drag synthetic click - swallow it so we
                              // don't accidentally re-audition after a drop.
                              if (isDraggingProgressionRef.current) return;
                              if (suppressNextClickRef.current) {
                                suppressNextClickRef.current = false;
                                return;
                              }

                              const hasTableSelection = selectedTableChordsRef.current.length > 0;
                              if (hasTableSelection) {
                                // Toggle this button in/out of the selection.
                                setSelectedTableChords((prev) =>
                                  prev.some((s) => s.btnId === btnId)
                                    ? prev.filter((s) => s.btnId !== btnId)
                                    : [...prev, { btnId, label: nextChord.label, code: nextCode }]
                                );
                                return;
                              }

                              // No selection: short tap = audition ONLY when
                              // Ch On/Off is on. Otherwise do nothing (per
                              // the user's explicit instruction).
                              setActiveBtn(btnId);
                              if (auditionMode) {
                                playChordSound(nextChord.label, 700);
                              }
                              window.setTimeout(() => setActiveBtn(""), 140);
                            }}
                            title={`${nextChord.label}  ->  ${chordNotesDisplay(nextChord.label)}`}
                            className={`h-10 border border-black px-2 text-xs transition-all ${
                              selected
                                ? "bg-green-300 shadow-[0_0_12px_#ff8827] ring-2 ring-[#ff8827]"
                                : pressed
                                ? "bg-green-300 shadow-[0_0_10px_#4df72c]"
                                : "bg-[#bae3b4] hover:shadow-[0_0_8px_#4df72c]"
                            }`}
                          >
                            {nextChord.label}
                          </button>
                        );
                      })}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {/* Bottom spacer: without this, the browser refuses to scroll a row
            past a certain point near the end of the table because there
            isn't enough content below it - so any request to bring e.g.
            'B aug' (near the last row) to the top gets clamped to the
            max scroll position, and the row lands ~250px below the top
            (visible below the sticky header, but the row directly above
            it, e.g. 'B sus2 7 add11', is what appears at the top).
            The spacer adds enough phantom height that even the last
            actual row can be scrolled flush to the top. Height is
            recomputed by a ResizeObserver on the scroll container. */}
        <div aria-hidden="true" style={{ height: bottomSpacerHeight }} />
      </div>

      {contextMenu && (
        <div
          className="fixed z-50 w-28 border border-black bg-white text-xs shadow-lg"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            type="button"
            onClick={() => {
              copySelected();
              setContextMenu(null);
            }}
            disabled={selectedBuilderIds.length === 0}
            className={`block w-full border-b border-black px-2 py-1 text-left ${
              selectedBuilderIds.length === 0 ? "text-neutral-400" : "hover:bg-green-100"
            }`}
          >
            copy
          </button>
          <button
            type="button"
            onClick={() => {
              pasteClipboard(contextMenu.insertIndex);
              setContextMenu(null);
            }}
            disabled={clipboardChords.length === 0}
            className={`block w-full border-b border-black px-2 py-1 text-left ${
              clipboardChords.length === 0 ? "text-neutral-400" : "hover:bg-green-100"
            }`}
          >
            paste
          </button>
          <button
            type="button"
            onClick={() => {
              deleteSelected();
              setContextMenu(null);
            }}
            disabled={selectedBuilderIds.length === 0}
            className={`block w-full px-2 py-1 text-left ${
              selectedBuilderIds.length === 0 ? "text-neutral-400" : "hover:bg-green-100"
            }`}
          >
            delete
          </button>
        </div>
      )}
      </div>

      {/* Dark settings modal - opens over the whole app when the gear icon
          in the Scroll On History header is clicked. Auto-applies changes
          on click; closes via the top-right gear icon inside the panel. */}
      {settingsOpen && (
        <SettingsPanel
          windowSize={windowSize}
          onSizeChange={applyWindowSize}
          longPressMs={longPressMs}
          onLongPressChange={setLongPressMs}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </main>
  );
}