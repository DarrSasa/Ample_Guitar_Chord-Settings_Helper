#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
genereaza-secventa-griff.py

Construieste SECVENTA-EXEMPLU v.2 pentru descifrarea formatului .griff,
conform listei CORECTATE (8 instrumente, 22 articulatii, 30 FX) din mesajul
utilizatorului:

  1. plan clar pe masuri: nr. masuri, notele exacte, articulatia si FX-ul
     fiecarui element;
  2. pentru fiecare masura un fisier vizual Piano Roll (.png): clape
     verticale in stanga cu numele notei, notele in dreapta, iar sus
     definitia + cerinta masurii;
  3. un .txt care descrie prin cuvinte, per masura: ordinea notelor,
     articulatia, sunetul FX de pe fiecare nota si numarul masurii;
  4. acoperire completa: toate cele 22 de articulatii si 30 de sunete FX,
     cu aplicabilitatea pe fiecare din cele 8 chitari Ample.

Iesiri in documente/griff/secventa_v2/:
  catalog_articulatii_fx.json, plan_secventa.json, masura_NN.png,
  secventa_exemplu.txt, aplicabilitate_chitari.json
"""

import json
import os

from PIL import Image, ImageDraw, ImageFont

OUT = os.path.join("documente", "griff", "secventa_v2")

# ---- catalogul CORECTAT: 22 articulatii, 30 FX, 8 chitari -----------------
ART = {
    1: "Sustain", 2: "Palm Mute", 3: "Natural Harmonic", 4: "Pinch Harmonic",
    5: "Hammer-on/Pull-off", 6: "Legato Slide", 7: "Slide In", 8: "Slide Out",
    9: "Vibrato", 10: "Staccato", 11: "Dead Note", 12: "Tapping",
    13: "Slap", 14: "Pop", 15: "Accent", 16: "Grace Note",
    17: "Finger Roll Strum", 18: "Heavy Palm Mute", 19: "Tremolo Picking",
    20: "Country Bends", 21: "Microtonal Fretless Slide",
    22: "Low-End Heavy Slap Mute"}
FX = {
    1: "Fret Noise", 2: "Stroke Noise", 3: "Body Hit/Golpe", 4: "Body Tap High",
    5: "Body Tap Low", 6: "Silent Press", 7: "Silent Release", 8: "Finger Slide FX",
    9: "String Scratch", 10: "Dead Note Strum", 11: "Rel Release Noise",
    12: "Pick Scratch", 13: "Natural Feedback", 14: "String Buzz",
    15: "Toggle Switch Click", 16: "Cable Plug", 17: "Bridge Mute Hit",
    18: "Electric Slide FX", 19: "Thumb Slap Noise", 20: "Index/Middle Pop Noise",
    21: "Slap Dead Note", 22: "Bass Body Thump", 23: "Hand Choke",
    24: "Bass Fret Noise", 25: "Bass Slide FX", 26: "Ukulele Body Tap Scurt",
    27: "Heavy Metal Pick Scrape", 28: "Telecaster Snap Switch & Twang Noise",
    29: "Fretless Glissando Noise", 30: "Sub-Bass Slap Hit"}

BASE_ART = [1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 15, 16]
ELEC_EXTRA = [4, 12]
BASS_EXTRA = [13, 14]
AC_FX = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
EL_FX = [1, 2, 6, 7, 8, 9, 11, 12, 13, 14, 15, 16, 17, 18]
BA_FX = [2, 6, 7, 8, 11, 19, 20, 21, 22, 23, 24, 25]

CHITARI = {
    "AGM":  {"categorie": "acustica",  "fx": AC_FX, "art": BASE_ART},
    "AGLP": {"categorie": "electrica", "fx": EL_FX, "art": BASE_ART + ELEC_EXTRA},
    "ABJ":  {"categorie": "bas",       "fx": BA_FX, "art": BASE_ART + BASS_EXTRA},
    "AEU":  {"categorie": "acustica",  "fx": [1, 2, 6, 7, 8, 10, 11, 26],
             "art": BASE_ART + [17]},
    "AME":  {"categorie": "electrica", "fx": EL_FX + [27],
             "art": BASE_ART + ELEC_EXTRA + [18, 19]},
    "AGTC": {"categorie": "electrica", "fx": EL_FX + [28],
             "art": BASE_ART + ELEC_EXTRA + [20]},
    "ABJF": {"categorie": "bas",       "fx": [2, 6, 7, 8, 11, 23, 25, 29],
             "art": [1, 3, 5, 6, 7, 8, 9, 10, 11, 15, 16, 21]},
    "ABMR5":{"categorie": "bas",       "fx": BA_FX + [30],
             "art": BASE_ART + BASS_EXTRA + [4, 22]},
}

NOTE_NUME = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"]


def nume_midi(m):
    return f"{NOTE_NUME[m % 12]}{m // 12 - 1}"


def font(marime, bold=False):
    cale = ("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold
            else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf")
    return ImageFont.truetype(cale, marime) if os.path.isfile(cale) \
        else ImageFont.load_default()


def construieste_plan():
    """30 de masuri: masura i demonstreaza FX i si, pentru i<=22, Articulatia i."""
    masuri = []
    for i in range(1, len(FX) + 1):
        art = i if i <= len(ART) else None
        baza = 55 + (i % 5)
        note = [
            {"nota": nume_midi(baza), "midi": baza, "beat": 0.0, "durata": 1.0},
            {"nota": nume_midi(baza + 2), "midi": baza + 2, "beat": 1.0, "durata": 1.0},
            {"nota": nume_midi(baza + 4), "midi": baza + 4, "beat": 2.0, "durata": 1.0},
            {"nota": nume_midi(baza + 7), "midi": baza + 7, "beat": 3.0, "durata": 1.0},
        ]
        note[0]["fx"] = i
        masuri.append({
            "masura": i,
            "articulatie": {"id": art, "nume": ART.get(art)} if art else None,
            "fx": {"id": i, "nume": FX[i], "pe_nota": 1},
            "note": note,
            "cerinta": (f"Demonstreaza {ART[art]} pe toate notele; " if art else "")
                       + f"declanseaza {FX[i]} pe prima nota.",
        })
    return masuri


def piano_roll(masura, cale):
    note = masura["note"]
    midis = [n["midi"] for n in note]
    lo, hi = min(midis) - 2, max(midis) + 2
    randuri = list(range(hi, lo - 1, -1))
    lat_cheie, sus, jos = 70, 64, 10
    pas_y, pas_x = 16, 46
    w = lat_cheie + 4 * pas_x + 30
    h = sus + len(randuri) * pas_y + jos
    img = Image.new("RGB", (w, h), "white")
    d = ImageDraw.Draw(img)

    art = masura["articulatie"]
    titlu = f"Masura {masura['masura']}: {art['nume'] if art else '(fara articulatie)'}"
    sub = f"FX pe nota 1: {masura['fx']['nume']}"
    d.text((8, 8), titlu, fill="black", font=font(15, True))
    d.text((8, 30), sub + " | " + masura["cerinta"][:70], fill="#444", font=font(11))

    for r, m in enumerate(randuri):
        y = sus + r * pas_y
        negru = (m % 12) in (1, 3, 6, 8, 10)
        d.rectangle([0, y, lat_cheie, y + pas_y], fill="#ddd" if negru else "#fff",
                    outline="#bbb")
        d.text((6, y + 2), nume_midi(m), fill="black", font=font(11))
        d.line([(lat_cheie, y), (w, y)], fill="#eee")
    for b in range(5):
        x = lat_cheie + b * pas_x
        d.line([(x, sus), (x, h - jos)], fill="#ccc")

    for n in note:
        r = randuri.index(n["midi"])
        y = sus + r * pas_y + 2
        x = lat_cheie + int(n["beat"] * pas_x)
        d.rounded_rectangle([x, y, x + pas_x - 4, y + pas_y - 4], radius=3,
                            fill="#1a6fd4", outline="#0d4c98")
        if "fx" in n:
            d.text((x, y - 12), "FX", fill="#c00", font=font(10, True))
    img.save(cale)


def main():
    os.makedirs(OUT, exist_ok=True)
    # sterge PNG-urile vechi (la regenerare cu alt numar de masuri)
    for f in os.listdir(OUT):
        if f.startswith("masura_") and f.endswith(".png"):
            os.remove(os.path.join(OUT, f))

    masuri = construieste_plan()

    with open(os.path.join(OUT, "catalog_articulatii_fx.json"), "w",
              encoding="utf-8") as f:
        json.dump({"articulatii": {str(k): v for k, v in ART.items()},
                   "fx": {str(k): v for k, v in FX.items()},
                   "chitari": CHITARI}, f, ensure_ascii=False, indent=1)

    with open(os.path.join(OUT, "plan_secventa.json"), "w", encoding="utf-8") as f:
        json.dump(masuri, f, ensure_ascii=False, indent=1)

    linii = ["SECVENTA-EXEMPLU .griff v.2 - descriere text (ghidare dubla)",
             f"Tempo 90 | {len(masuri)} masuri | acopera {len(ART)} articulatii "
             f"+ {len(FX)} FX | 8 chitari", ""]
    for m in masuri:
        art = m["articulatie"]
        linii.append(f"MASURA {m['masura']}: articulatie="
                     f"{art['nume'] if art else '-'} | FX={m['fx']['nume']} "
                     f"(pe nota {m['fx']['pe_nota']}) | imagine=masura_{m['masura']:02d}.png")
        for k, n in enumerate(m["note"], 1):
            linii.append(f"   nota {k}: {n['nota']} (MIDI {n['midi']}) beat {n['beat']:.1f} "
                         f"durata {n['durata']:.1f}"
                         + (f" + FX {m['fx']['id']} {m['fx']['nume']}" if "fx" in n else "")
                         + (f" | articulatie {art['nume']}" if art else ""))
        linii.append("")
    with open(os.path.join(OUT, "secventa_exemplu.txt"), "w", encoding="utf-8") as f:
        f.write("\n".join(linii))

    for m in masuri:
        piano_roll(m, os.path.join(OUT, f"masura_{m['masura']:02d}.png"))

    aplic = {}
    for nume, info in CHITARI.items():
        masuri_aplicabile = [m["masura"] for m in masuri
                             if (m["articulatie"] and m["articulatie"]["id"] in info["art"])
                             or m["fx"]["id"] in info["fx"]]
        aplic[nume] = {"categorie": info["categorie"],
                       "nr_articulatii": len(info["art"]),
                       "nr_fx": len(info["fx"]),
                       "masuri_aplicabile": masuri_aplicabile}
    with open(os.path.join(OUT, "aplicabilitate_chitari.json"), "w",
              encoding="utf-8") as f:
        json.dump(aplic, f, ensure_ascii=False, indent=1)

    art_acop = {m["articulatie"]["id"] for m in masuri if m["articulatie"]}
    fx_acop = {m["fx"]["id"] for m in masuri}
    print(f"masuri: {len(masuri)} | PNG-uri: {len(masuri)}")
    print(f"articulatii acoperite: {len(art_acop)}/{len(ART)} | FX acoperite: {len(fx_acop)}/{len(FX)}")
    assert art_acop == set(ART), "articulatii lipsa"
    assert fx_acop == set(FX), "FX lipsa"
    # verificare acoperire pe chitari (uniunea = tot)
    un_art = set().union(*(c["art"] for c in CHITARI.values()))
    un_fx = set().union(*(c["fx"] for c in CHITARI.values()))
    assert un_art == set(ART), "chitari nu acopera toate articulatiile"
    assert un_fx == set(FX), "chitari nu acopera toate FX"
    print("acoperire completa: 22/22 articulatii, 30/30 FX, si uniunea celor 8 chitari = tot.")


if __name__ == "__main__":
    main()
