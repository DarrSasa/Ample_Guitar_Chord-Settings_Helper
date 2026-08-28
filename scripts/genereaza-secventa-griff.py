#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
genereaza-secventa-griff.py

Construieste SECVENTA-EXEMPLU v.2 pentru descifrarea formatului .griff,
conform cerintelor din 'documente/griff/Secventa-exemplu ... v.2.md':

  1. plan clar pe masuri: nr. masuri, notele exacte, articulatia si FX-ul
     fiecarui element;
  2. pentru fiecare masura un fisier vizual Piano Roll (.png): clape
     verticale in stanga cu numele notei, notele in dreapta, iar sus
     definitia + cerinta masurii;
  3. un .txt care descrie prin cuvinte, per masura: ordinea notelor,
     articulatia, sunetul FX de pe fiecare nota si numarul masurii;
  4. acoperire completa: toate cele 25 de articulatii si 32 de sunete FX,
     cu aplicabilitatea pe fiecare din cele 9 chitari Ample.

Iesiri in documente/griff/secventa_v2/:
  catalog_articulatii_fx.json, plan_secventa.json, masura_NN.png,
  secventa_exemplu.txt, aplicabilitate_chitari.json
"""

import json
import os

from PIL import Image, ImageDraw, ImageFont

OUT = os.path.join("documente", "griff", "secventa_v2")

# ---- catalogul complet, exact ca in documentul v.2 ------------------------
ART = {
    1: "Sustain", 2: "Palm Mute", 3: "Natural Harmonic", 4: "Pinch Harmonic",
    5: "Hammer-on/Pull-off", 6: "Legato Slide", 7: "Slide In", 8: "Slide Out",
    9: "Vibrato", 10: "Staccato", 11: "Dead Note", 12: "Tapping",
    13: "Slap", 14: "Pop", 15: "Accent", 16: "Grace Note", 17: "Rasgueado",
    18: "Flamenco Tremolo", 19: "Alzapúa", 20: "Finger Roll Strum",
    21: "Heavy Palm Mute", 22: "Tremolo Picking", 23: "Country Bends",
    24: "Microtonal Fretless Slide", 25: "Low-End Heavy Slap Mute"}
FX = {
    1: "Fret Noise", 2: "Stroke Noise", 3: "Body Hit/Golpe", 4: "Body Tap High",
    5: "Body Tap Low", 6: "Silent Press", 7: "Silent Release", 8: "Finger Slide",
    9: "String Scratch", 10: "Dead Note Strum", 11: "Rel Release Noise",
    12: "Pick Scratch", 13: "Natural Feedback", 14: "String Buzz",
    15: "Toggle Switch Click", 16: "Cable Plug", 17: "Bridge Mute Hit",
    18: "Electric Slide FX", 19: "Thumb Slap Noise", 20: "Pop Noise",
    21: "Slap Dead Note", 22: "Bass Body Thump", 23: "Hand Choke",
    24: "Bass Fret Noise", 25: "Bass Slide FX", 26: "Golpe Tap fatadă",
    27: "Zgomot mecanic Rasgueado", 28: "Ukulele Body Tap scurt",
    29: "Heavy Metal Pick Scrape lung", 30: "Telecaster Snap Switch & Twang",
    31: "Fretless Glissando Noise", 32: "Sub-Bass Slap Hit"}

STD_ART = [1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 15, 16]
STD_FX_AC = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
STD_FX_EL = [1, 2, 7, 8, 9, 11, 12, 13, 14, 15, 16, 17, 18]
STD_FX_BA = [1, 2, 6, 7, 8, 11, 19, 20, 21, 22, 23, 24, 25]

CHITARI = {
    "AGM":  {"categorie": "acustica",  "fx": STD_FX_AC, "art": STD_ART},
    "AGLP": {"categorie": "electrica", "fx": [1, 2, 7, 8, 9, 11] + list(range(12, 19)),
             "art": STD_ART + [4, 12]},
    "ABJ":  {"categorie": "bas",       "fx": STD_FX_BA, "art": STD_ART + [13, 14]},
    "AGPF": {"categorie": "acustica",  "fx": STD_FX_AC + [26, 27],
             "art": STD_ART + [17, 18, 19]},
    "AGU":  {"categorie": "acustica",  "fx": [1, 2, 6, 7, 8, 10, 11, 28],
             "art": STD_ART + [20]},
    "AME":  {"categorie": "electrica", "fx": [1, 2, 7, 8, 9, 11] + list(range(12, 19)) + [29],
             "art": list(range(1, 13)) + [15, 16, 21, 22]},
    "AGTC": {"categorie": "electrica", "fx": [1, 2, 7, 8, 9, 11] + list(range(12, 19)) + [30],
             "art": list(range(1, 13)) + [15, 16, 23]},
    "ABFL": {"categorie": "bas",       "fx": STD_FX_BA + [31],
             "art": [1, 2, 3] + list(range(5, 12)) + [13, 14, 15, 16, 24]},
    "AMB":  {"categorie": "bas",       "fx": STD_FX_BA + [32],
             "art": [1, 2, 3] + list(range(5, 12)) + [13, 14, 15, 16, 25]},
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
    """32 de masuri: masura i demonstreaza FX i si, pentru i<=25, Articulatia i."""
    masuri = []
    for i in range(1, 33):
        art = i if i <= 25 else None
        # o fraza scurta de 4 note in registrul chitarii; variaza usor
        baza = 55 + (i % 5)            # G2..B2
        note = [
            {"nota": nume_midi(baza), "midi": baza, "beat": 0.0, "durata": 1.0},
            {"nota": nume_midi(baza + 2), "midi": baza + 2, "beat": 1.0, "durata": 1.0},
            {"nota": nume_midi(baza + 4), "midi": baza + 4, "beat": 2.0, "durata": 1.0},
            {"nota": nume_midi(baza + 7), "midi": baza + 7, "beat": 3.0, "durata": 1.0},
        ]
        # FX-ul se ataseaza primei note; articulatia e pe toata masura
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
        # grila din dreapta
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
    masuri = construieste_plan()

    with open(os.path.join(OUT, "catalog_articulatii_fx.json"), "w",
              encoding="utf-8") as f:
        json.dump({"articulatii": {str(k): v for k, v in ART.items()},
                   "fx": {str(k): v for k, v in FX.items()},
                   "chitari": CHITARI}, f, ensure_ascii=False, indent=1)

    with open(os.path.join(OUT, "plan_secventa.json"), "w", encoding="utf-8") as f:
        json.dump(masuri, f, ensure_ascii=False, indent=1)

    linii = ["SECVENTA-EXEMPLU .griff v.2 - descriere text (ghidare dubla)",
             f"Tempo 90 | {len(masuri)} masuri | acopera 25 articulatii + 32 FX", ""]
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

    # aplicabilitatea pe cele 9 chitari
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

    # verificare acoperire
    art_acop = {m["articulatie"]["id"] for m in masuri if m["articulatie"]}
    fx_acop = {m["fx"]["id"] for m in masuri}
    print(f"masuri: {len(masuri)} | PNG-uri: {len(masuri)}")
    print(f"articulatii acoperite: {len(art_acop)}/25 | FX acoperite: {len(fx_acop)}/32")
    assert art_acop == set(ART), "articulatii lipsa"
    assert fx_acop == set(FX), "FX lipsa"
    print("acoperire completa: 25/25 articulatii, 32/32 FX.")


if __name__ == "__main__":
    main()
