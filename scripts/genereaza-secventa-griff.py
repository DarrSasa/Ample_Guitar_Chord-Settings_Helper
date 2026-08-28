#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
genereaza-secventa-griff.py  (v.3 — date reale din Riffer)

Reface planul secventei-exemplu folosind denumirile si keyswitch-urile citite
DIRECT din Riffer de utilizator, pe 4 sectiuni per instrument:
  1. 'Articulations'                (articulatia notei, cu keyswitch)
  2. 'To the right of the Articulations' (No Legato / Legato Slide / ...)
  3. 'Articulation Sound Single'    (sunete de articulatie izolate)
  4. 'FX Sound Group'               (sunete FX, cu keyswitch)

Reguli din precizarile utilizatorului:
  - acustice + electrice -> .griff ; bas -> .briff;
  - articulatiile incadrate la *corpul chitarei* NU sunt incluse (lista de
    mai jos contine doar cele 4 sectiuni Riffer).

Iesiri in documente/griff/secventa_v2/:
  catalog_riffer.json               (structura autorizata, 8 instrumente)
  <CODE>/<CODE>.txt                 (plan pe masuri, cuvinte: sectiune, nume,
                                     keyswitch, note, nr. masura)
  <CODE>/masura_NN.png              (piano-roll per masura; keyswitch-ul e
                                     scris in antet, nu ca clapa)
"""

import json
import os

from PIL import Image, ImageDraw, ImageFont

OUT = os.path.join("documente", "griff", "secventa_v2")

# (nume, keyswitch) — keyswitch None daca nu e listat
CATALOG = {
    "AGM": {"nume": "Ample Guitar M", "versiune": "4.1.0", "ext": ".griff",
            "categorie": "acustica",
            "articulatii": [("Sustain", "C0"), ("Pop", "C0"), ("Natural Harmonic", "C#0"),
                            ("Palm Mute", "D0"), ("Slide In", "D#0"), ("Slide Guitar", "F0")],
            "legato": ["No Legato", "Legato Slide", "Legato HP"],
            "single": [("Slide Out", "D#0")],
            "fx": [("Scratch", "F5"), ("Slap", "F#5"), ("Muting", "G5"), ("Strum Mute", "G#5"),
                   ("Downstroke 1", "A5"), ("Upstroke 1", "A#5"), ("Downstroke 2", "B5"),
                   ("Upstroke 2", "C6"), ("Hit Top (Open)", "F6"), ("Hit Top (Mute)", "F#6"),
                   ("Hit Rim", "G6")]},
    "AGLP": {"nume": "Ample Guitar LP", "versiune": "4.1.0", "ext": ".griff",
             "categorie": "electrica",
             "articulatii": [("Sustain", "C0"), ("Pop/PH", "C0"), ("Natural Harmonic", "C#0"),
                             ("Palm Mute", "D0"), ("Slide In", "D#0"), ("Slide Guitar", "F0"),
                             ("Pinch Harmonic", "B-1")],
             "legato": ["No Legato", "Legato Slide", "Legato HP"],
             "single": [("Slide Out", "D#0")],
             "fx": [("Scratch", "F5"), ("Slap", "F#5"), ("Muting", "G5"), ("Strum Mute", "G#5"),
                    ("Downstroke 1", "A5"), ("Upstroke 1", "A#5"), ("Downstroke 2", "B5"),
                    ("Upstroke 2", "C6"), ("Raking", "E6"), ("Pick Scrape", "F6"),
                    ("FX Slide Turn", "F#6"), ("FX Slide Down", "G6")]},
    "AGTC": {"nume": "Ample Guitar TC", "versiune": "4.0.1", "ext": ".griff",
             "categorie": "electrica",
             "articulatii": [("Sustain", "C0"), ("Pop/PH", "C0"), ("Natural Harmonic", "C#0"),
                             ("Palm Mute", "D0"), ("Slide In", "D#0"), ("Pinch Harmonic", "B-1")],
             "legato": ["No Legato", "Legato Slide", "Legato HP"],
             "single": [("Slide Out", "D#0")],
             "fx": [("Scratch 1", "F5"), ("Slap", "F#5"), ("Muting", "G5"), ("Strum Mute", "G#5"),
                    ("Downstroke 1", "A5"), ("Upstroke 1", "A#5"), ("Downstroke 2", "B5"),
                    ("Upstroke 2", "C6"), ("Pick Scrape", "F6")]},
    "AME": {"nume": "Ample Metal Eclipse", "versiune": "4.0.1", "ext": ".griff",
            "categorie": "electrica",
            "articulatii": [("Sustain", "C0"), ("Mute", "C0"), ("Pop/PH", "C0"),
                            ("Natural Harmonic", "C#0"), ("Palm Mute", "D0"), ("Slide In", "D#0"),
                            ("Tap", "F#0"), ("Pinch Harmonic", "G0")],
            "legato": ["No Legato", "Legato Slide", "Legato HP"],
            "single": [("Slide Out", "D#0")],
            "fx": [("Scratch 1", "F5"), ("Slap", "F#5"), ("Muting", "G5"), ("Strum Mute", "G#5"),
                   ("Downstroke 1", "A5"), ("Upstroke 1", "A#5"), ("Downstroke 2", "B5"),
                   ("Upstroke 2", "C6"), ("Pick Scrape", "F6"), ("FX Slide Turn", "F#6"),
                   ("FX Slide Down", "G6")]},
    "AEU": {"nume": "Ample Ethno Ukulele", "versiune": "3.6.0", "ext": ".griff",
            "categorie": "acustica",
            "articulatii": [("Sustain", None), ("Natural Harmonic", None), ("Palm Mute", None),
                            ("Slide In", None), ("Strum", None)],
            "legato": ["No Legato", "Legato Slide", "HO/PO", "Slide Out"],
            "single": [("Slide Out", "D#0")],
            "fx": [("Scratch", None), ("Slap", None), ("Silent Press", None), ("Silent Stroke", None),
                   ("Downstroke Noise 1", None), ("Upstroke Noise 1", None),
                   ("Downstroke Noise 2", None), ("Upstroke Noise 2", None),
                   ("Hit Top (Open)", None), ("Hit Top (Mute)", None), ("Hit Rim", None)]},
    "ABJ": {"nume": "Ample Bass J", "versiune": "4.0.1", "ext": ".briff",
            "categorie": "bas",
            "articulatii": [("Sustain", "C0"), ("Accent", "C0"), ("Natural Harmonic", "C#0"),
                            ("Palm Mute", "D0"), ("Dead Note", "D0"), ("Slide In", "D#0"),
                            ("Slap", "G0"), ("Dead Slap", "G0"), ("Pop", "A0"), ("Dead Pop", "A0"),
                            ("Tap", "G#0"), ("Repeat Note", "F#0")],
            "legato": ["No Legato", "Legato Slide", "Legato HP"],
            "single": [("Slide Out", "D#0")],
            "fx": [("Scratch 1", "F5"), ("Scratch 2", "F#5"), ("Single String Slap", "G5"),
                   ("Left-Hand Slap", "G#5"), ("Right-Hand Slap", "A5"),
                   ("FX Slide Turn (4)", "A#5"), ("FX Slide Turn (3)", "B5"),
                   ("FX Slide Down (4)", "C6"), ("FX Slide Down (3)", "C#6")]},
    "ABJF": {"nume": "Ample Bass Jaco Fretless", "versiune": "4.0.1", "ext": ".briff",
             "categorie": "bas",
             "articulatii": [("Sustain", "C0"), ("Accent", "C0"), ("Natural Harmonic", "C#0"),
                             ("Palm Mute", "D0"), ("Dead Note", "D0"), ("Slide In", "D#0"),
                             ("Slap", "G0"), ("Dead Slap", "G0"), ("Pop", "A0"), ("Dead Pop", "A0"),
                             ("Artificial Harmonic", "G#0"), ("Repeat Note", "F#0")],
             "legato": ["No Legato", "Legato Slide", "Legato HP"],
             "single": [("Slide Out", "D#0"), ("Buzzing", "A4")],
             "fx": [("Scratch 1", "F5"), ("Scratch 2", "F#5"), ("Single String Slap", "G5"),
                    ("Left-Hand Slap", "G#5"), ("Right-Hand Slap", "A5"),
                    ("FX Slide Turn (4)", "A#5"), ("FX Slide Turn (3)", "B5"),
                    ("FX Slide Down (4)", "C6"), ("FX Slide Down (3)", "C#6")]},
    "ABMR5": {"nume": "Ample Metal Ray5", "versiune": "3.7.0", "ext": ".briff",
              "categorie": "bas",
              "articulatii": [("Sustain", None), ("Natural Harmonic", None), ("Palm Mute", None),
                              ("Slide In", None), ("Repeat", None)],
              "legato": ["No Legato", "Legato Slide", "HO/PO", "Slide Out"],
              "single": [("Slide Out", "D#0")],
              "fx": [("Slap Left", None), ("Slap Right", None), ("Downstroke Noise", None),
                     ("Upstroke Noise", None), ("Scratch 1", None), ("Scratch 2", None),
                     ("Silent Press", None), ("FX Slide 1", None), ("FX Slide 2", None),
                     ("FX Slide 3", None), ("FX Slide 4", None), ("FX Slide 5", None),
                     ("FX Slide 6", None), ("Buzz", None)]},
}

NOTE_NUME = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"]


def nume_midi(m):
    return f"{NOTE_NUME[m % 12]}{m // 12 - 1}"


def font(marime, bold=False):
    cale = ("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold
            else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf")
    return ImageFont.truetype(cale, marime) if os.path.isfile(cale) \
        else ImageFont.load_default()


def fraza(categorie):
    baza = 31 if categorie == "bas" else 55
    return [{"nota": nume_midi(baza + o), "midi": baza + o, "beat": b, "durata": 1.0}
            for o, b in ((0, 0.0), (2, 1.0), (4, 2.0), (7, 3.0))]


def plan_instrument(info):
    """Masuri in ordinea sectiunilor: articulatii, legato, single, fx."""
    masuri = []
    for sect, cheie in (("Articulations", "articulatii"), ("Legato", "legato"),
                        ("Articulation Sound Single", "single"), ("FX Sound Group", "fx")):
        for intr in info[cheie]:
            if sect == "Legato":
                nume, ks = intr, None
            else:
                nume, ks = intr
            masuri.append({"sectiune": sect, "nume": nume, "ks": ks,
                           "note": fraza(info["categorie"])})
    return masuri


def piano_roll(code, idx, masura, info, cale):
    note = masura["note"]
    midis = [n["midi"] for n in note]
    lo, hi = min(midis) - 2, max(midis) + 2
    randuri = list(range(hi, lo - 1, -1))
    lat, sus, jos = 70, 64, 10
    py, px = 16, 46
    w = lat + 4 * px + 30
    h = sus + len(randuri) * py + jos
    img = Image.new("RGB", (w, h), "white")
    d = ImageDraw.Draw(img)
    ks = f" | KS {masura['ks']}" if masura["ks"] else ""
    d.text((8, 8), f"{code} m{idx} [{masura['sectiune']}] {masura['nume']}{ks}",
           fill="black", font=font(14, True))
    d.text((8, 30), f"{info['nume']} {info['versiune']} -> {info['ext']}",
           fill="#444", font=font(11))
    for r, m in enumerate(randuri):
        y = sus + r * py
        negru = (m % 12) in (1, 3, 6, 8, 10)
        d.rectangle([0, y, lat, y + py], fill="#ddd" if negru else "#fff", outline="#bbb")
        d.text((6, y + 2), nume_midi(m), fill="black", font=font(11))
        d.line([(lat, y), (w, y)], fill="#eee")
    for b in range(5):
        x = lat + b * px
        d.line([(x, sus), (x, h - jos)], fill="#ccc")
    for n in note:
        r = randuri.index(n["midi"])
        y = sus + r * py + 2
        x = lat + int(n["beat"] * px)
        d.rounded_rectangle([x, y, x + px - 4, y + py - 4], radius=3,
                            fill="#1a6fd4", outline="#0d4c98")
    img.save(cale)


def main():
    # curata iesirile vechi (planul anterior folosea denumiri ghicite)
    import shutil
    if os.path.isdir(OUT):
        shutil.rmtree(OUT)
    os.makedirs(OUT)

    with open(os.path.join(OUT, "catalog_riffer.json"), "w", encoding="utf-8") as f:
        json.dump(CATALOG, f, ensure_ascii=False, indent=1)

    total = 0
    for code, info in CATALOG.items():
        ddir = os.path.join(OUT, code)
        os.makedirs(ddir)
        masuri = plan_instrument(info)
        total += len(masuri)
        linii = [f"{info['nume']} {info['versiune']} ({code}) -> {info['ext']} | "
                 f"{len(masuri)} masuri | tempo 90", ""]
        for i, m in enumerate(masuri, 1):
            piano_roll(code, i, m, info, os.path.join(ddir, f"masura_{i:02d}.png"))
            linii.append(f"MASURA {i}: [{m['sectiune']}] {m['nume']}"
                         + (f" | keyswitch {m['ks']}" if m["ks"] else "")
                         + f" | imagine masura_{i:02d}.png")
            linii.append("   note: " + ", ".join(
                f"{n['nota']}({n['midi']})" for n in m["note"]))
        with open(os.path.join(ddir, f"{code}.txt"), "w", encoding="utf-8") as f:
            f.write("\n".join(linii))
        n = {s: len(info[c]) for s, c in (
            ("art", "articulatii"), ("legato", "legato"),
            ("single", "single"), ("fx", "fx"))}
        print(f"{code} ({info['ext']}): {len(masuri)} masuri -> {n}")
    print(f"TOTAL masuri: {total} | instrumente: {len(CATALOG)}")


if __name__ == "__main__":
    main()
