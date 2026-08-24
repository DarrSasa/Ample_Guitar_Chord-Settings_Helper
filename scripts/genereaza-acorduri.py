#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
genereaza-acorduri.py

GENEREAZA diagrame de acorduri si voicinguri dintr-o baza de date deschisa
(chords-db de David Rubert, licenta MIT) in loc sa le extragi prin OCR din
carti scanate. Nu ai nevoie de Audiveris, Tesseract sau PyMuPDF aici.

Iesiri:
  - PNG cu diagrama (grila, puncte, degete, bara, tasta de pornire)
  - intrare in formatul folosit de date_extrase/voicinguri.json
    (corzi / taste / offset_taste / puncte / voicing / acord)
  - notele MIDI ale fiecarui voicing (utile pt. Ample Guitar)
  - optional: o carte .md cu toate acordurile cerute

Folosire:
    py scripts\genereaza-acorduri.py Cmaj7 Am7 G13
    py scripts\genereaza-acorduri.py --lista                 (ce acorduri exista)
    py scripts\genereaza-acorduri.py --tonica C --carte c.md (toate acordurile lui C)
"""

import argparse
import json
import os
import sys

from PIL import Image, ImageDraw, ImageFont

BAZA_IMPLICITA = os.path.join("documente", "baze", "chords-db", "guitar.json")

NUME_TONICI = {"C": "C", "Csharp": "C#", "D": "D", "Eb": "Eb", "E": "E",
               "F": "F", "Fsharp": "F#", "G": "G", "Ab": "Ab", "A": "A",
               "Bb": "Bb", "B": "B"}
NUME_NOTE_MIDI = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A",
                  "Bb", "B"]
SUFIX_LIZIBIL = {"major": "", "minor": "m", "dim": "dim", "aug": "aug",
                 "dominant": "7"}
# variante de scriere acceptate la cautare -> sufixul din baza de date
ALIAZE_SUFIX = {"": "major", "M": "major", "maj": "major",
                "m": "minor", "min": "minor", "-": "minor",
                "M7": "maj7", "maj7": "maj7", "Δ7": "maj7", "∆7": "maj7",
                "min7": "m7", "-7": "m7",
                "o": "dim", "o7": "dim7", "dim7": "dim7",
                "+": "aug", "sus4": "sus4", "sus2": "sus2", "sus": "sus"}


def incarca_baza(cale):
    with open(cale, encoding="utf-8") as f:
        return json.load(f)


def nume_acord(tonica, sufix):
    """Cmaj7, Am7, G13... din tonica interna ('Csharp') + sufix din baza."""
    return NUME_TONICI.get(tonica, tonica) + SUFIX_LIZIBIL.get(sufix, sufix)


def cauta_acord(baza, nume):
    """Intoarce lista de pozitii pentru un nume de acord scris de om (Cmaj7).

    Tonicele se potrivesc de la cea mai lunga eticheta in jos, ca 'C#m7' sa
    nu fie citit ca 'C' + '#m7'. Sufixele accepta si variantele obisnuite
    (min7/-7 pentru m7, M7 pentru maj7, 'o' pentru dim)."""
    nume = nume.strip()
    for eticheta, tonica in sorted(((e, t) for t, e in NUME_TONICI.items()),
                                   key=lambda p: -len(p[0])):
        if not nume.startswith(eticheta):
            continue
        rest = ALIAZE_SUFIX.get(nume[len(eticheta):], nume[len(eticheta):])
        for intrare in baza["chords"].get(tonica, []):
            sufix = SUFIX_LIZIBIL.get(intrare["suffix"], intrare["suffix"])
            if sufix == rest or intrare["suffix"] == rest:
                return intrare["positions"]
    return None


def font(marime):
    for cale in ("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
                  "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
                  "C:/Windows/Fonts/arialbd.ttf", "C:/Windows/Fonts/arial.ttf"):
        if os.path.isfile(cale):
            return ImageFont.truetype(cale, marime)
    return ImageFont.load_default()


def deseneaza_diagrama(pozitie, titlu, cale_png, inaltime_grila=4):
    """PNG cu diagrama: grila, puncte, degete, bara, X/O deasupra, tasta."""
    corzi = len(pozitie["frets"])
    taste = max(inaltime_grila,
                max([f for f in pozitie["frets"] if f > 0] or [inaltime_grila])
                - pozitie.get("baseFret", 1) + 1)
    lat = 40 * corzi
    pas_x, pas_y = 34, 34
    margine_sus, margine_st = 56, 34
    w = margine_st + (corzi - 1) * pas_x + 60
    h = margine_sus + taste * pas_y + 30
    img = Image.new("RGB", (w, h), "white")
    d = ImageDraw.Draw(img)
    f_titlu, f_mic = font(20), font(13)

    d.text((margine_st, 10), titlu, fill="black", font=f_titlu)

    x0, y0 = margine_st, margine_sus
    x1, y1 = x0 + (corzi - 1) * pas_x, y0 + taste * pas_y

    # bara (capo): o linie groasa peste tastele acoperite
    for tasta_barre in pozitie.get("barres", []):
        pe_coarde = [i for i, f in enumerate(pozitie["frets"])
                     if f >= tasta_barre]
        if len(pe_coarde) >= 2:
            yy = y0 + (tasta_barre - 1) * pas_y + pas_y // 2
            d.rounded_rectangle(
                [x0 - 6, yy - 9, x0 + (corzi - 1) * pas_x + 6, yy + 9],
                radius=9, fill="black")

    # grila
    for i in range(corzi):
        gros = 4 if (i == 0 and pozitie.get("baseFret", 1) == 1) else 1
        x = x0 + i * pas_x
        d.line([(x, y0), (x, y1)], fill="black", width=gros)
    for j in range(taste + 1):
        y = y0 + j * pas_y
        d.line([(x0, y), (x1, y)], fill="black",
               width=4 if (j == 0 and pozitie.get("baseFret", 1) == 1) else 1)

    # punctele + numerele de deget
    for i, fret in enumerate(pozitie["frets"]):
        x = x0 + i * pas_x
        if fret < 0:
            d.text((x - 5, y0 - 30), "X", fill="black", font=f_mic)
            continue
        if fret == 0:
            r = 7
            d.ellipse([x - r, y0 - 28, x + r, y0 - 28 + 2 * r],
                      outline="black", width=2)
            continue
        yy = y0 + (fret - pozitie.get("baseFret", 1)) * pas_y + pas_y // 2
        d.ellipse([x - 12, yy - 12, x + 12, yy + 12], fill="black")
        deget = pozitie["fingers"][i]
        if deget:
            d.text((x - 4, yy - 8), str(deget), fill="white", font=f_mic)

    # tasta de pornire, cand grila nu incepe de la tasta 1
    if pozitie.get("baseFret", 1) > 1:
        d.text((x1 + 10, y0 + pas_y // 2 - 8),
               f"{pozitie['baseFret']}fr", fill="black", font=f_mic)

    img.save(cale_png)
    return cale_png


def ca_voicinguri(pozitie, nume, sursa):
    """Acelasi format ca date_extrase/voicinguri.json (produs de package-book)."""
    frets = pozitie["frets"]
    puncte = [[i + 1, f - pozitie.get("baseFret", 1) + 1]
              for i, f in enumerate(frets) if f > 0]
    taste = max(4, max([f for f in frets if f > 0] or [4])
                - pozitie.get("baseFret", 1) + 1)
    return {"corzi": len(frets), "taste": taste,
            "offset_taste": pozitie.get("baseFret", 1),
            "puncte": puncte,
            "voicing": [(f if f >= 0 else None) for f in frets],
            "midi": pozitie.get("midi", []),
            "acord": nume, "sursa": sursa}


def note_midi(midi):
    return [f"{NUME_NOTE_MIDI[m % 12]}{m // 12 - 1}" for m in midi]


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("acorduri", nargs="*", help="ex: Cmaj7 Am7 G13")
    ap.add_argument("--baza", default=BAZA_IMPLICITA, help="guitar.json (chords-db)")
    ap.add_argument("--iesire", default="diagrame", help="folderul pentru PNG-uri")
    ap.add_argument("--lista", action="store_true", help="arata acordurile disponibile")
    ap.add_argument("--tonica", default="", help="cu --carte: doar acordurile acestei tonici")
    ap.add_argument("--carte", default="", help="scrie o carte .md cu diagramele")
    args = ap.parse_args()

    if not os.path.isfile(args.baza):
        print(f"Nu gasesc baza de date: {args.baza}")
        sys.exit(1)
    baza = incarca_baza(args.baza)
    sursa = f"chords-db (MIT), {os.path.basename(args.baza)}"

    if args.lista:
        for tonica in NUME_TONICI:
            lista = [nume_acord(tonica, e["suffix"])
                     for e in baza["chords"].get(tonica, [])]
            print(f"{NUME_TONICI[tonica]}: " + ", ".join(lista))
        return

    cerute = list(args.acorduri)
    if args.tonica:
        tonica = [t for t, e in NUME_TONICI.items() if e == args.tonica]
        if not tonica:
            print(f"Tonica necunoscuta: {args.tonica}")
            sys.exit(1)
        cerute += [nume_acord(tonica[0], e["suffix"])
                   for e in baza["chords"].get(tonica[0], [])]
    if not cerute:
        print("Spune-mi ce acorduri vrei (ex: Cmaj7 Am7) sau foloseste --lista.")
        sys.exit(1)

    os.makedirs(args.iesire, exist_ok=True)
    intrari, linii_md = [], ["# Acorduri generate din chords-db (MIT)", ""]
    gasite = 0
    for nume in cerute:
        pozitii = cauta_acord(baza, nume)
        if not pozitii:
            print(f"  ! {nume}: nu-l gasesc in baza")
            continue
        gasite += 1
        for k, poz in enumerate(pozitii, 1):
            png = os.path.join(args.iesire, f"{nume}-{k}.png")
            deseneaza_diagrama(poz, f"{nume} ({k}/{len(pozitii)})", png)
            intr = ca_voicinguri(poz, nume, sursa)
            intr["fisier"] = os.path.basename(png)
            intrari.append(intr)
            linii_md += [f"## {nume} - varianta {k}", "",
                         f"![{nume}]({png.replace(os.sep, '/')})", "",
                         f"- freturi: `{poz['frets']}` (de la coarda groasa)",
                         f"- tasta de pornire: {poz.get('baseFret', 1)}",
                         f"- note MIDI: {', '.join(note_midi(poz.get('midi', [])))}",
                         ""]
        print(f"  {nume}: {len(pozitii)} pozitii")

    if args.carte:
        with open(args.carte, "w", encoding="utf-8") as f:
            f.write("\n".join(linii_md))
        print(f"  carte scrisa: {args.carte}")
    cale_json = os.path.join(args.iesire, "voicinguri.json")
    with open(cale_json, "w", encoding="utf-8") as f:
        json.dump(intrari, f, ensure_ascii=False, indent=1)
    print(f"  {len(intrari)} voicinguri -> {cale_json}  ({gasite} acorduri)")


if __name__ == "__main__":
    main()
