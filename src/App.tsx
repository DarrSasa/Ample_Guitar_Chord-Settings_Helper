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
};

type Snapshot = {
  topCode: number;
  guideCode: number | null;
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
const BLOCK_WIDTH = 118;
const HISTORY_GAP = 30;
const BUILDER_GAP = 0;

const TYPE_OPTIONS: Record<ChordType, { extensions: string[]; alterations: string[] }> = {
  Maj: { extensions: ["7", "Maj7", "add9", "6"], alterations: ["add11"] },
  min: { extensions: ["7", "Maj7", "add9", "6"], alterations: ["add11"] },
  sus2: { extensions: ["7"], alterations: ["add11"] },
  sus4: { extensions: ["7"], alterations: [] },
  aug: { extensions: ["7"], alterations: [] },
  "5": { extensions: [], alterations: [] },
  oct: { extensions: [], alterations: [] },
};

const LENGTH_OPTIONS = ["Beat", "2 Beats", "Bar", "2 Bars"] as const;
type LengthOption = (typeof LENGTH_OPTIONS)[number];

const LENGTH_BEATS: Record<LengthOption, number> = {
  Beat: 1,
  "2 Beats": 2,
  Bar: 4,
  "2 Bars": 8,
};

const GUITAR_PRESETS: GuitarPreset[] = [
  {
    name: "Acoustic Guitar",
    sampleFile: "Acoustic Guitar_C5.wav",
    gmName: "acoustic_guitar_steel",
    waveform: "triangle",
  },
  { name: "Nylon Guitar", sampleFile: "Nylon Guitar_C5.wav", gmName: "acoustic_guitar_nylon", waveform: "sine" },
  { name: "Steel Guitar", sampleFile: "Steel Guitar_C5.wav", gmName: "acoustic_guitar_steel", waveform: "triangle" },
  { name: "Jazz Guitar", sampleFile: "Jazz Guitar_C5.wav", gmName: "electric_guitar_jazz", waveform: "square" },
  { name: "Muted Guitar", sampleFile: "Muted Guitar_C5.wav", gmName: "electric_guitar_muted", waveform: "sawtooth" },
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

function parseLabel(label: string) {
  const [root, type] = label.split(" ");
  return { root, type: type as ChordType };
}

function chordNotes(label: string) {
  const parsed = parseLabel(label);
  const rootIdx = ROOTS.indexOf(parsed.root);
  const midiRoot = 48 + Math.max(rootIdx, 0);

  const intervals: Record<ChordType, number[]> = {
    Maj: [0, 4, 7],
    min: [0, 3, 7],
    sus2: [0, 2, 7],
    sus4: [0, 5, 7],
    aug: [0, 4, 8],
    "5": [0, 7],
    oct: [0, 12],
  };

  return intervals[parsed.type].map((interval) => midiRoot + interval);
}

function parseRootMidiFromSmplChunk(buffer: ArrayBuffer) {
  const view = new DataView(buffer);

  if (view.byteLength < 44) {
    return null;
  }

  // WAV RIFF chunks start at byte 12: [id(4), size(4), data(size)]
  let offset = 12;
  while (offset + 8 <= view.byteLength) {
    const id = String.fromCharCode(
      view.getUint8(offset),
      view.getUint8(offset + 1),
      view.getUint8(offset + 2),
      view.getUint8(offset + 3)
    );
    const size = view.getUint32(offset + 4, true);
    const dataStart = offset + 8;

    if (id === "smpl" && dataStart + size <= view.byteLength && size >= 20) {
      // smpl chunk: midiUnityNote is 4th uint32 field at byte +12.
      const midiUnityNote = view.getUint32(dataStart + 12, true);
      if (Number.isFinite(midiUnityNote) && midiUnityNote >= 0 && midiUnityNote <= 127) {
        return midiUnityNote;
      }
    }

    offset = dataStart + size + (size % 2);
  }

  return null;
}

function parseRootMidiFromFileName(fileName: string) {
  const match = fileName.match(/_([A-G])(#|b)?(\d)/i);
  if (!match) {
    return null;
  }

  const note = match[1].toUpperCase();
  const accidental = match[2] ?? "";
  const octave = Number(match[3]);
  const noteMap: Record<string, number> = {
    C: 0,
    D: 2,
    E: 4,
    F: 5,
    G: 7,
    A: 9,
    B: 11,
  };

  let semitone = noteMap[note] ?? 0;
  if (accidental === "#") semitone += 1;
  if (accidental.toLowerCase() === "b") semitone -= 1;

  return (octave + 1) * 12 + semitone;
}

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

function createMidiFile(chords: BuilderChord[], bpm: number, lengthMode: LengthOption) {
  const ppq = 480;
  const beatTicks = ppq;
  const chordTicks = beatTicks * LENGTH_BEATS[lengthMode];
  const tempo = Math.floor(60000000 / Math.max(40, Math.min(240, bpm)));

  const track: number[] = [];
  track.push(0x00, 0xff, 0x51, 0x03, (tempo >> 16) & 0xff, (tempo >> 8) & 0xff, tempo & 0xff);
  track.push(0x00, 0xc0, 24);

  chords.forEach((chord) => {
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
  const [startActive, setStartActive] = useState(false);
  const [guideCode, setGuideCode] = useState<number | null>(null);
  const [guidePickIndex, setGuidePickIndex] = useState<number | null>(null);

  const [builderChords, setBuilderChords] = useState<BuilderChord[]>([]);
  const [selectedBuilderIds, setSelectedBuilderIds] = useState<string[]>([]);
  const [clipboardChords, setClipboardChords] = useState<BuilderChord[]>([]);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const [builderHistory, setBuilderHistory] = useState<BuilderChord[][]>([[]]);
  const [builderHistoryIndex, setBuilderHistoryIndex] = useState(0);

  const [moveMode, setMoveMode] = useState(false);
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [scrollFollowMode, setScrollFollowMode] = useState(false);
  const [deleteMode, setDeleteMode] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [playheadIndex, setPlayheadIndex] = useState(0);
  const [lengthMode, setLengthMode] = useState<LengthOption>("Bar");
  const [bpm, setBpm] = useState(120);
  const [editingBpm, setEditingBpm] = useState(false);
  const [bpmText, setBpmText] = useState("120");
  const [guitarOpen, setGuitarOpen] = useState(false);
  const [guitarPreset, setGuitarPreset] = useState(GUITAR_PRESETS[0]);
  const [guitarLoading, setGuitarLoading] = useState(false);
  const [volume, setVolume] = useState(0.72);
  const [auditionMode, setAuditionMode] = useState(false);
  const [flashBuilderId, setFlashBuilderId] = useState<string>("");

  const [snapshots, setSnapshots] = useState<Snapshot[]>([{ topCode: rows[0]?.code ?? 1, guideCode: null }]);
  const [snapshotIndex, setSnapshotIndex] = useState(0);

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
  const dragSelectingRef = useRef(false);
  const dragSelectAddRef = useRef(true);
  const isDraggingBuilderRef = useRef(false);
  const justDraggedRef = useRef(false);

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
    const stopDragSelect = () => {
      dragSelectingRef.current = false;
    };
    window.addEventListener("mouseup", stopDragSelect);
    return () => {
      window.removeEventListener("mouseup", stopDragSelect);
    };
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

  const activateBuilderMode = (mode: "scroll" | "multi" | "select" | "delete" | "audition" | "none") => {
    setScrollFollowMode(mode === "scroll");
    setMultiSelectMode(mode === "multi");
    setMoveMode(mode === "select");
    setDeleteMode(mode === "delete");
    setAuditionMode(mode === "audition");
    if (mode !== "select" && mode !== "multi") {
      setSelectedBuilderIds([]);
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

  const getRowTop = (code: number) => {
    const rowEl = rowRefs.current[code];
    if (!rowEl) return null;
    return Math.max(rowEl.offsetTop - getHeaderHeight(), 0);
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
    container.scrollTo({ top: rowTop, behavior });
    setTopCode(code);
    setActiveRow(row.id);
    window.setTimeout(() => setActiveRow(""), 650);
  };

  const snapToNearestRow = () => {
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

      // Internal sampler first: load WAV from /public/guitar samples and read root note from smpl chunk.
      const base = window.location.protocol === "file:" ? "./guitar samples/" : "/guitar samples/";
      const sampleUrl = encodeURI(`${base}${preset.sampleFile}`);
      const response = await fetch(sampleUrl);
      if (response.ok) {
        const wavBuffer = await response.arrayBuffer();
        const smplRoot = parseRootMidiFromSmplChunk(wavBuffer);
        const nameRoot = parseRootMidiFromFileName(preset.sampleFile);
        sampleRootMidiRef.current = smplRoot ?? nameRoot ?? 72;

        const audioBuffer = await ctx.decodeAudioData(wavBuffer.slice(0));
        sampleBufferRef.current = audioBuffer;
        instrumentRef.current = null;

        console.debug("[Sampler] Loaded WAV sample", {
          preset: preset.name,
          file: preset.sampleFile,
          rootMidi: sampleRootMidiRef.current,
          fromSmpl: smplRoot !== null,
        });
        return;
      }

      sampleBufferRef.current = null;
      sampleRootMidiRef.current = 72;

      // Fallback when sample file is missing.
      instrumentRef.current = await Soundfont.instrument(ctx, preset.gmName as any, {
        soundfont: "MusyngKite",
      });
      console.debug("[Sampler] Using soundfont fallback", { preset: preset.name });
    } catch (error) {
      instrumentRef.current = null;
      sampleBufferRef.current = null;
      console.debug("[Sampler] Load failed; using oscillator fallback", error);
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

  const recordSnapshot = (nextTopCode: number, nextGuideCode: number | null) => {
    pushSnapshot({ topCode: nextTopCode, guideCode: nextGuideCode });
  };

  const addChordToBuilderAndRecord = (label: string, targetCode: number, insertIndex?: number) => {
    const base = builderRef.current;
    const safeIndex = Math.max(0, Math.min(insertIndex ?? base.length, base.length));
    const nextBuilder = [
      ...base.slice(0, safeIndex),
      { id: crypto.randomUUID(), label },
      ...base.slice(safeIndex),
    ];
    setBuilderChords(nextBuilder);
    pushBuilderHistory(nextBuilder);
    setSelectedBuilderIds([]);
    recordSnapshot(targetCode, guideCodeRef.current);

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

  const selectBuilderChord = (id: string, index: number) => {
    if (!moveMode && !deleteMode) return;
    if (deleteMode) {
      const next = builderRef.current.filter((ch) => ch.id !== id);
      setBuilderChords(next);
      pushBuilderHistory(next);
      setFlashBuilderId(id);
      window.setTimeout(() => setFlashBuilderId(""), 220);
      recordSnapshot(topCodeRef.current, guideCodeRef.current);
      return;
    }

    if (multiSelectMode && lastSelectedIndexRef.current !== null) {
      const start = Math.min(lastSelectedIndexRef.current, index);
      const end = Math.max(lastSelectedIndexRef.current, index);
      const ids = builderRef.current.slice(start, end + 1).map((ch) => ch.id);
      setSelectedBuilderIds((prev) => Array.from(new Set([...prev, ...ids])));
      return;
    }

    if (!multiSelectMode) {
      setSelectedBuilderIds([id]);
      lastSelectedIndexRef.current = index;
      return;
    }

    setSelectedBuilderIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((x) => x !== id);
      }
      return [...prev, id];
    });
    lastSelectedIndexRef.current = index;
  };

  const beginDragSelect = (id: string, index: number) => {
    if (!multiSelectMode) return;

    dragSelectingRef.current = true;
    const isSelected = selectedRef.current.includes(id);
    dragSelectAddRef.current = !isSelected;

    setSelectedBuilderIds((prev) => {
      if (dragSelectAddRef.current) {
        return prev.includes(id) ? prev : [...prev, id];
      }
      return prev.filter((x) => x !== id);
    });

    lastSelectedIndexRef.current = index;
  };

  const continueDragSelect = (id: string, index: number) => {
    if (!multiSelectMode || !dragSelectingRef.current) return;

    setSelectedBuilderIds((prev) => {
      if (dragSelectAddRef.current) {
        return prev.includes(id) ? prev : [...prev, id];
      }
      return prev.filter((x) => x !== id);
    });

    lastSelectedIndexRef.current = index;
  };

  const reorderSelection = (insertIndex: number) => {
    const selectedIds = selectedRef.current;
    if (selectedIds.length === 0) return;

    const selectedSet = new Set(selectedIds);
    const selectedItems = builderRef.current.filter((x) => selectedSet.has(x.id));
    const remaining = builderRef.current.filter((x) => !selectedSet.has(x.id));
    const safeIndex = Math.max(0, Math.min(insertIndex, remaining.length));
    const next = [...remaining.slice(0, safeIndex), ...selectedItems, ...remaining.slice(safeIndex)];

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
    const clones = clipboardChords.map((x) => ({ id: crypto.randomUUID(), label: x.label }));
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
    const chordMs = beatMs * LENGTH_BEATS[lengthMode];
    const totalMs = chordMs * builderRef.current.length;
    playChordMsRef.current = chordMs;

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
      const linearX = Math.min((elapsed / chordMs) * BLOCK_WIDTH, builderRef.current.length * BLOCK_WIDTH);
      setPlayheadX(linearX);

      const idx = Math.min(Math.floor(elapsed / chordMs), builderRef.current.length - 1);
      if (idx !== playedIndexRef.current) {
        playedIndexRef.current = idx;
        setPlayheadIndex(idx);
        void playChordSound(builderRef.current[idx].label, chordMs * 0.94);
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

  const historyCodes = useMemo(() => {
    const codes: number[] = [];
    snapshots.forEach((snap) => {
      if (codes[codes.length - 1] !== snap.topCode) codes.push(snap.topCode);
    });
    return codes;
  }, [snapshots]);

  const getCurrentMidiBytes = () => {
    if (builderRef.current.length === 0) {
      return null;
    }
    return createMidiFile(builderRef.current, bpm, lengthMode);
  };

  const saveMidi = async () => {
    console.log("[saveMidi] called; builder length =", builderRef.current.length);
    const bytes = getCurrentMidiBytes();
    console.log("[saveMidi] bytes:", bytes ? `${bytes.length} bytes` : "null");
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
    console.log("[dragMidiToDaw] dragstart; builder length =", builderRef.current.length);
    const bytes = getCurrentMidiBytes();
    console.log("[dragMidiToDaw] bytes:", bytes ? `${bytes.length} bytes` : "null");
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
        console.log("[dragMidiToDaw] midiDrag ->", result);
        // In Electron the OS owns the drag now. Always preventDefault so
        // the HTML5 DownloadURL fallback (which does not work in Electron)
        // does not clobber the OS drag session.
        event.preventDefault();
        if (!result || result.ok !== true) {
          alert(
            "Drag failed to start.\n\n" +
            (result && result.error ? "Reason: " + result.error : "No details.") +
            "\n\nOpen Diag to check the bridge."
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
          const started = bridge.startMidiDrag(tempPath);
          console.log("[dragMidiToDaw] legacy startMidiDrag ->", started);
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
    const closeMenu = () => setContextMenu(null);
    window.addEventListener("click", closeMenu);
    return () => {
      window.removeEventListener("click", closeMenu);
      if (scrollTimerRef.current !== null) window.clearTimeout(scrollTimerRef.current);
      if (jumpTimerRef.current !== null) window.clearTimeout(jumpTimerRef.current);
      if (playTimerRef.current !== null) window.clearInterval(playTimerRef.current);
      if (audioCtxRef.current) void audioCtxRef.current.close();
    };
  }, []);

  useEffect(() => {
    snapToNearestRow();
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
          <h2 className="text-sm font-semibold tracking-wide">Undo Redo History</h2>
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
          </div>
        </div>

        <div className="overflow-x-auto border border-black bg-white/70 px-2 py-2">
          <div className="flex min-h-12 items-center" style={{ gap: HISTORY_GAP }}>
            {historyCodes.map((code, pickIndex) => {
              const row = rowByCode.get(code);
              if (!row) return null;
              const blockLabel = `${row.root} ${row.type}`;
              const selected = guidePickIndex === pickIndex;

              return (
                <button
                  key={`history-${code}`}
                  type="button"
                  className={`h-9 min-w-[118px] border border-black px-2 text-left text-xs ${
                    selected ? "bg-green-300 shadow-[0_0_10px_#4df72c]" : "bg-[#bae3b4]"
                  }`}
                  onClick={() => {
                    if (startActive) {
                      setGuideCode(code);
                      setGuidePickIndex(pickIndex);
                      pushSnapshot({ topCode: topCodeRef.current, guideCode: code });
                    } else {
                      recordSnapshot(code, guideCodeRef.current);
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

          <button
            type="button"
            onClick={() => {
              if (multiSelectMode) activateBuilderMode("none");
              else activateBuilderMode("multi");
            }}
            className={`rounded-sm border border-black px-3 py-1 text-xs shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] ${
              multiSelectMode ? "bg-green-300 shadow-[0_0_10px_#ff8827]" : "bg-[#FCBF8D]"
            }`}
          >
            Multi Select
          </button>

          <button
            type="button"
            onClick={() => {
              if (moveMode) activateBuilderMode("none");
              else activateBuilderMode("select");
            }}
            className={`rounded-sm border border-black px-3 py-1 text-xs shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] ${
              moveMode ? "bg-green-300 shadow-[0_0_10px_#ff8827]" : "bg-[#FCBF8D]"
            }`}
          >
            Select
          </button>

          <button
            type="button"
            onClick={() => {
              if (deleteMode) activateBuilderMode("none");
              else activateBuilderMode("delete");
            }}
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

          <label className="flex items-center gap-1 rounded-sm border border-black bg-[#FCBF8D] px-2 py-1 text-xs shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]">
            Length
            <select
              value={lengthMode}
              onChange={(e) => setLengthMode(e.target.value as LengthOption)}
              className="border border-black bg-white px-1 py-0.5"
            >
              {LENGTH_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </label>

          <div
            className="select-none rounded-sm border border-black bg-[#FCBF8D] px-2 py-0.5 text-center text-xs shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]"
            onWheel={(e) => {
              e.preventDefault();
              setBpm((prev) => {
                const next = clampBpm(prev + (e.deltaY > 0 ? -1 : 1));
                setBpmText(String(next));
                return next;
              });
            }}
            onClick={() => {
              setEditingBpm(true);
              setBpmText(String(bpm));
            }}
          >
            <div className="text-[10px] leading-none text-[#6f1c03]">v</div>
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
                className="w-16 border border-black bg-white px-1 text-center"
              />
            ) : (
              <div>BPM:{bpm}</div>
            )}
            <div className="text-[10px] leading-none text-[#6f1c03]">^</div>
          </div>

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

          {/* Two-in-one: click = Save (opens Save As), drag = D&D (drop MIDI into a DAW). */}
          <button
            type="button"
            draggable
            onDragStart={(e) => {
              justDraggedRef.current = true;
              dragMidiToDaw(e);
            }}
            onDragEnd={() => {
              // Keep the click-suppression flag alive a bit past dragend so the
              // synthetic click that follows a drop does not trigger Save.
              window.setTimeout(() => {
                justDraggedRef.current = false;
              }, 250);
            }}
            onClick={() => {
              if (justDraggedRef.current) return;
              void saveMidi();
            }}
            title="Click to Save the MIDI file. Drag this button into your DAW (FL Studio, Reaper, Cubase, Ableton, …) to drop the MIDI file directly."
            className="cursor-grab rounded-sm border border-black bg-[#FCBF8D] px-2 py-1 text-xs shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] active:cursor-grabbing"
          >
            Save / D&amp;D
          </button>

          {/* Diagnostic button. Reports whether window.desktopBridge (the Electron
              IPC bridge that powers Save + D&D) is attached, and shows a small
              details block so users can copy/paste the state when something goes
              wrong. Cheap to keep in the UI - single button, no extra deps. */}
          <button
            type="button"
            onClick={() => {
              const w = window as any;
              const bridge = w.desktopBridge;
              const loaded = w.__desktopBridgeLoaded === true;
              const isElectron = Boolean(bridge) || loaded ||
                (typeof navigator !== "undefined" && navigator.userAgent.includes("Electron"));

              const lines: string[] = [];
              lines.push(`Environment: ${isElectron ? "Electron desktop" : "Web browser"}`);
              lines.push(`Preload loaded flag: ${loaded ? "YES" : "NO"}`);
              lines.push(`window.desktopBridge: ${bridge ? "attached" : "MISSING"}`);
              if (bridge) {
                const methods = ["saveMidiFileAsync", "saveMidiFile", "renderMidiTemp", "startMidiDrag", "ping"];
                methods.forEach((m) => {
                  lines.push(`  .${m}: ${typeof bridge[m] === "function" ? "OK" : "MISSING"}`);
                });
                if (typeof bridge.ping === "function") {
                  try {
                    const pong = bridge.ping();
                    lines.push(`  ping round-trip: OK`);
                    lines.push(`  Electron: ${pong.electron}, Node: ${pong.node}, Chrome: ${pong.chrome}`);
                  } catch (err: any) {
                    lines.push(`  ping FAILED: ${err && err.message ? err.message : String(err)}`);
                  }
                }

                // Live test of the actual Save pipeline. Reports each step
                // so we can see EXACTLY where the flow breaks when Save
                // "does nothing".
                lines.push("");
                lines.push(`Builder chords in memory: ${builderRef.current.length}`);
                if (builderRef.current.length === 0) {
                  lines.push("  Add chords to the builder before testing Save/D&D.");
                } else {
                  try {
                    const testBytes = getCurrentMidiBytes();
                    lines.push(`  getCurrentMidiBytes() -> ${testBytes ? `${testBytes.length} bytes` : "NULL"}`);
                    if (testBytes && testBytes.length > 0) {
                      lines.push(`  First 4 bytes: ${Array.from(testBytes.slice(0, 4)).map((b) => b.toString(16)).join(" ")} (should be 4d 54 68 64 = 'MThd')`);
                      lines.push("");
                      lines.push("Now trying saveMidiFileAsync directly...");
                      try {
                        // Fire and forget - result comes as a follow-up alert
                        // so this diagnostic alert closes first.
                        bridge.saveMidiFileAsync(Array.from(testBytes), "diag-test.mid").then(
                          (r: any) => alert(`saveMidiFileAsync returned:\n${JSON.stringify(r, null, 2)}`),
                          (e: any) => alert(`saveMidiFileAsync REJECTED:\n${e && e.message ? e.message : String(e)}`)
                        );
                        lines.push("  (Watch for a follow-up alert with the result.)");
                      } catch (err: any) {
                        lines.push(`  saveMidiFileAsync THREW: ${err && err.message ? err.message : String(err)}`);
                      }
                    }
                  } catch (err: any) {
                    lines.push(`  getCurrentMidiBytes THREW: ${err && err.message ? err.message : String(err)}`);
                  }
                }
              } else if (isElectron) {
                lines.push("");
                lines.push("Preload did NOT run. Likely causes:");
                lines.push("  - preload.cjs missing from packaged app");
                lines.push("  - sandbox:true blocking ipcRenderer");
                lines.push("  - preload threw during startup (check app.log next to the EXE)");
              } else {
                lines.push("");
                lines.push("Running in a browser - Save uses browser download, D&D uses HTML5 DownloadURL.");
                lines.push("Drag-to-native-DAW only works in the Electron EXE build.");
              }
              alert(lines.join("\n"));
            }}
            title="Diagnostics: check if the Electron bridge (Save + D&D) is connected."
            className="rounded-sm border border-black bg-[#FCBF8D] px-2 py-1 text-xs shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]"
          >
            Diag
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

        <div
          className="relative overflow-x-auto border border-black bg-white/80 px-0 py-0"
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes("application/x-progression-chord")) {
              e.preventDefault();
            }
          }}
          onDrop={(e) => {
            const label = e.dataTransfer.getData("application/x-progression-chord");
            if (!label) return;
            e.preventDefault();
            const insertIndex = findBuilderInsertIndex(e.clientX);
            addChordToBuilderAndRecord(label, topCodeRef.current, insertIndex);
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            setContextMenu({ x: e.clientX, y: e.clientY, insertIndex: builderRef.current.length });
          }}
        >
          <div className="relative h-12">
            {(isPlaying || isPaused) && builderChords.length > 0 && (
              <>
                <div
                  className="pointer-events-none absolute top-0 z-10 h-0 w-0 border-l-[6px] border-r-[6px] border-t-[10px] border-b-0 border-l-transparent border-r-transparent border-t-[#ff8827] drop-shadow-[0_0_8px_#ff8827]"
                  style={{ left: `${Math.max(0, playheadX - 6)}px` }}
                />
                <div
                  className="pointer-events-none absolute bottom-0 top-[10px] z-10 w-[2px] bg-[#ff8827] shadow-[0_0_10px_#ff8827]"
                  style={{ left: `${playheadX}px` }}
                />
              </>
            )}

            <div className="flex h-full items-stretch" style={{ gap: BUILDER_GAP }}>
              {builderChords.map((chord, index) => {
                const selected = selectedBuilderIds.includes(chord.id);
                const playing = isPlaying && playheadIndex === index;
                const blinking = flashBuilderId === chord.id;
                const canReorder = moveMode || multiSelectMode;

                return (
                  <button
                    key={chord.id}
                    type="button"
                    data-builder-index={index}
                    draggable={canReorder && selected}
                    onMouseDown={() => {
                      if (multiSelectMode) {
                        // If the clicked chord is already selected, allow drag-reorder on second action.
                        if (selected) {
                          return;
                        }
                        beginDragSelect(chord.id, index);
                        return;
                      }

                      if (moveMode && !selected) {
                        setSelectedBuilderIds([chord.id]);
                        lastSelectedIndexRef.current = index;
                      }
                    }}
                    onMouseEnter={() => {
                      continueDragSelect(chord.id, index);
                    }}
                    onDragStart={() => {
                      if (!canReorder || !selected) return;
                      isDraggingBuilderRef.current = true;
                    }}
                    onDragEnd={() => {
                      window.setTimeout(() => {
                        isDraggingBuilderRef.current = false;
                      }, 0);
                    }}
                    onDragOver={(e) => {
                      if (canReorder) e.preventDefault();
                    }}
                    onDrop={(e) => {
                      if (!canReorder) return;
                      e.preventDefault();
                      const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                      const before = e.clientX < rect.left + rect.width / 2;
                      const baseIndex = builderRef.current.findIndex((x) => x.id === chord.id);
                      reorderSelection(before ? baseIndex : baseIndex + 1);
                    }}
                    onClick={() => {
                      if (isDraggingBuilderRef.current) {
                        return;
                      }
                      if (auditionMode) {
                        void playChordSound(chord.label, 650);
                        return;
                      }
                      selectBuilderChord(chord.id, index);
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                      const before = e.clientX < rect.left + rect.width / 2;
                      const idx = builderRef.current.findIndex((x) => x.id === chord.id);
                      setContextMenu({ x: e.clientX, y: e.clientY, insertIndex: before ? idx : idx + 1 });
                    }}
                    className={`h-full min-w-[118px] border border-black px-2 text-left text-xs transition-all ${
                      selected || playing || blinking
                        ? "bg-green-300 shadow-[0_0_10px_#4df72c]"
                        : "bg-[#bae3b4] hover:shadow-[0_0_8px_#4df72c]"
                    }`}
                  >
                    {chord.label}
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
        className="flex-1 w-full overflow-auto border border-black bg-white"
      >
        <table className="min-w-full border-collapse text-sm text-black">
          <thead ref={headRef} className="sticky top-0 z-20 bg-[#e8e8e8]">
            <tr>
              <th className="border border-black px-2 py-2 text-left font-semibold">Root</th>
              <th className="border border-black px-2 py-2 text-left font-semibold">Type</th>
              <th className="border border-black px-2 py-2 text-left font-semibold">Extension</th>
              <th className="border border-black px-2 py-2 text-left font-semibold">Alteration</th>
              <th className="border border-black px-2 py-2 text-left font-semibold">Bass</th>
              <th className="border border-black px-2 py-2 text-left font-semibold">Chords for Progressions</th>
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
                  <td className="border border-black px-2 py-1.5">{row.root}</td>
                  <td className="border border-black px-2 py-1.5">{row.type}</td>
                  <td className="border border-black px-2 py-1.5">{row.extension}</td>
                  <td className="border border-black px-2 py-1.5">{row.alteration}</td>
                  <td className="border border-black px-2 py-1.5">{row.bass}</td>
                  <td className="border border-black px-2 py-1.5">
                    <div className="flex flex-wrap gap-1.5">
                      {suggestions.map((nextChord, idx) => {
                        const btnId = `${row.id}-${nextChord.rowId}-${idx}`;
                        const pressed = activeBtn === btnId;

                        return (
                          <button
                            key={btnId}
                            type="button"
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.effectAllowed = "copy";
                              e.dataTransfer.setData("application/x-progression-chord", nextChord.label);
                              e.dataTransfer.setData("text/plain", nextChord.label);
                            }}
                            onClick={() => {
                              setActiveBtn(btnId);

                              if (auditionMode) {
                                playChordSound(nextChord.label, 700);
                                window.setTimeout(() => setActiveBtn(""), 140);
                                return;
                              }

                              const target = rowById.get(nextChord.rowId);
                              if (!target) {
                                setActiveBtn("");
                                return;
                              }

                              // Normal mode: add selected progression chord to builder and register undo/redo history.
                              addChordToBuilderAndRecord(nextChord.label, target.code);
                            }}
                            className={`h-10 border border-black px-2 text-xs transition-all ${
                              pressed
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
    </main>
  );
}