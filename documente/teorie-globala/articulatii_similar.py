#!/usr/bin/env python3
"""Articulații & FX la instrumente cu corzi din toată lumea, similare chitarei.

Pentru fiecare instrument:
  - cum se numesc articulațiile / sunetele FX la el;
  - care sună ASEMANĂTOR cu articulațiile/FX de la Ample Sound (semnul '≈');
  - CÂNDE și UNDE apar (progresii, melodii, bass, arpegii, ostinato);
  - o DENUMIRE SCURTĂ de sugestie (include instrumentul), pt. sugestii de
    progresii (acorduri complexe) sau un singur acord experimental.

Scriptul scrie regulile în folderul nou `crawl_similar/`:
  crawl_similar/<instrument>.json  +  crawl_similar/reguli_similar.json
  + crawl_similar/manifest_similar.json

Baza de cunoștințe e inclusă mai jos (offline); poate fi extinsă ulterior cu
Crawl4AI. Nu folosește cheia API.
"""
import json
import os
from pathlib import Path

OUT = Path(__file__).resolve().parent / "crawl_similar"

# termeni Ample de referinta
AMPLE_ART = ["Sustain", "Palm Mute", "Hammer-on", "Pull-off", "Legato Slide",
             "Slide In/Out", "Vibrato", "Bend", "Natural Harmonic", "Tapping",
             "Staccato", "Dead Note", "Rasgueado", "Alzapúa", "Golpe", "Slap", "Pop"]
AMPLE_FX = ["Fret Noise", "String Scratch", "Body Hit/Golpe", "Pick Scratch",
            "Feedback", "String Buzz", "Slide FX"]

# instrument, tara, articulatii(term,≈,context), fx(term,≈,context), sugestie_scurta
INSTRUMENTE = [
 {"ins": "Chitara flamenco", "tara": "ES",
  "art": [("Rasgueado", "≈ Rasgueado", "progresii/ritm"), ("Alzapúa", "≈ Alzapúa", "progresii/ritm"),
          ("Picado", "≈ alternate picking", "melodie"), ("Golpe", "≈ Golpe/Body Hit", "ritm"),
          ("Tremolo (5 note)", "≈ Tremolo", "melodie/arp")],
  "fx": [("Zgomot cutie golpe", "≈ Body Hit", "ritm")], "sug": "flamenco"},
 {"ins": "Oud", "tara": "TR/AR",
  "art": [("Pizzicato", "≈ Sustain", "melodie"), ("Tremolo risha", "≈ Vibrato/Tremolo", "melodie"),
          ("Glissando", "≈ Slide", "melodie"), ("Ornament (mordent)", "≈ Hammer-on/Pull-off", "melodie")],
  "fx": [("Rezonanță cavitate", "≈ Body Hit", "accent")], "sug": "oud"},
 {"ins": "Sitar", "tara": "IN",
  "art": [("Meend", "≈ Bend / Legato Slide", "melodie"), ("Gamak", "≈ Vibrato", "melodie"),
          ("Krintan", "≈ Pull-off", "melodie"), ("Zamzama", "≈ tremolo", "melodie")],
  "fx": [("Javari (buzz)", "≈ String Buzz", "sustain/drone"), ("Chikari", "≈ Strum accent", "ostinato")],
  "sug": "sitar"},
 {"ins": "Banjo", "tara": "US",
  "art": [("Rolls", "≈ arpeggio/Travis", "ostinato/progresii"), ("Hammer-on", "≈ Hammer-on", "melodie"),
          ("Pull-off", "≈ Pull-off", "melodie"), ("Slide", "≈ Slide", "melodie")],
  "fx": [("Rezonanță scurtă", "≈ Staccato", "ritm")], "sug": "banjo"},
 {"ins": "Mandolin", "tara": "IT",
  "art": [("Tremolo", "≈ Vibrato/Tremolo", "melodie"), ("Pizzicato", "≈ Sustain", "melodie"),
          ("Slide", "≈ Slide", "melodie")],
  "fx": [("Attack dublu-corzi", "≈ Strum", "progresii")], "sug": "mandolin"},
 {"ins": "Bouzouki", "tara": "GR",
  "art": [("Tremolo", "≈ Vibrato/Tremolo", "melodie"), ("Slide", "≈ Slide", "melodie"),
          ("Hammer-on", "≈ Hammer-on", "melodie")],
  "fx": [("Zgomot plectru", "≈ Pick Scratch", "ritm")], "sug": "bouzouki"},
 {"ins": "Charango", "tara": "ANDE",
  "art": [("Rasgueo", "≈ Rasgueado", "ritm"), ("Tremolo", "≈ Vibrato", "melodie"),
          ("Slide", "≈ Slide", "melodie")],
  "fx": [("Brightness corzi", "≈ Strum", "progresii")], "sug": "charango"},
 {"ins": "Cavaquinho", "tara": "BR",
  "art": [("Rasgado", "≈ Rasgueado", "ritm"), ("Pizzicato", "≈ Sustain", "melodie")],
  "fx": [("Percuție cutie", "≈ Body Hit", "ritm")], "sug": "cavaquinho"},
 {"ins": "Tres cubano", "tara": "CU",
  "art": [("Arpegio octavat", "≈ arpeggio", "ostinato"), ("Slide", "≈ Slide", "melodie")],
  "fx": [("Zgomot corzi dublate", "≈ Strum", "ostinato")], "sug": "tres"},
 {"ins": "Kora", "tara": "WA",
  "art": [("Ornamente", "≈ Hammer-on/Pull-off", "melodie"), ("Arpegii rapide", "≈ arpeggio", "ostinato")],
  "fx": [("Rezonanță calabash", "≈ Body Hit", "ambient")], "sug": "kora"},
 {"ins": "Balalaika", "tara": "RU",
  "art": [("Tremolo", "≈ Vibrato/Tremolo", "melodie"), ("Pizzicato", "≈ Sustain", "melodie"),
          ("Vibrato", "≈ Vibrato", "melodie")],
  "fx": [("Bătaie cutie", "≈ Body Hit", "ritm")], "sug": "balalaika"},
 {"ins": "Saz/Baglama", "tara": "TR",
  "art": [("Tremolo", "≈ Vibrato/Tremolo", "melodie"), ("Slide", "≈ Slide", "melodie"),
          ("Mordent", "≈ Hammer-on/Pull-off", "melodie")],
  "fx": [("Zgomot plectru", "≈ Pick Scratch", "ritm")], "sug": "saz"},
 {"ins": "Erhu", "tara": "CN",
  "art": [("Vibrato", "≈ Vibrato", "melodie"), ("Slide", "≈ Slide", "melodie"),
          ("Glissando", "≈ Slide", "melodie")],
  "fx": [("Rezonanță pieleană", "≈ Body Hit", "ambient")], "sug": "erhu"},
 {"ins": "Pipa", "tara": "CN",
  "art": [("Lun (slide)", "≈ Slide", "melodie"), ("Yin (vibrato)", "≈ Vibrato", "melodie"),
          ("Sao (strum)", "≈ Strum/Rasgueado", "progresii"), ("Lun指 arpegii", "≈ arpeggio", "arp")],
  "fx": [("Zgomot corzi", "≈ String Scratch", "ritm")], "sug": "pipa"},
 {"ins": "Koto", "tara": "JP",
  "art": [("Vibrato (press)", "≈ Vibrato", "melodie"), ("Glissando", "≈ Slide", "melodie"),
          ("Tremolo", "≈ Vibrato/Tremolo", "melodie")],
  "fx": [("Slide peste punte", "≈ Slide FX", "ambient")], "sug": "koto"},
 {"ins": "Guzheng", "tara": "CN",
  "art": [("Vibrato", "≈ Vibrato", "melodie"), ("Slide", "≈ Slide", "melodie"),
          ("Tremolo", "≈ Vibrato/Tremolo", "melodie")],
  "fx": [("Glissando corzi libere", "≈ Slide FX", "ambient")], "sug": "guzheng"},
 {"ins": "Guitarra portuguesa", "tara": "PT",
  "art": [("Trinado", "≈ Vibrato/Tremolo", "melodie"), ("Glissando", "≈ Slide", "melodie"),
          ("Arpejo", "≈ arpeggio", "arp")],
  "fx": [("Rezonanță oțel", "≈ Strum", "progresii")], "sug": "portugueza"},
 {"ins": "Steel guitar (dobro)", "tara": "US",
  "art": [("Slide bar", "≈ Slide", "melodie"), ("Vibrato bar", "≈ Vibrato", "melodie"),
          ("Hammer-on", "≈ Hammer-on", "melodie")],
  "fx": [("Bar slide noise", "≈ Slide FX", "melodie")], "sug": "steel"},
 {"ins": "Chitara 12 corzi", "tara": "global",
  "art": [("Strum corzi dublate", "≈ Strum", "progresii"), ("Arpeggio", "≈ arpeggio", "arp")],
  "fx": [("Chorus natural", "≈ (cor dublat)", "progresii")], "sug": "12corzi"},
 {"ins": "Bass (electric)", "tara": "global",
  "art": [("Slap", "≈ Slap", "bass"), ("Pop", "≈ Pop", "bass"), ("Hammer-on", "≈ Hammer-on", "bass"),
          ("Slide", "≈ Slide", "bass")],
  "fx": [("Thumb slap", "≈ Slap noise", "bass"), ("Pop noise", "≈ Pop noise", "bass")],
  "sug": "bass"},
 {"ins": "Tar", "tara": "IR/AZ",
  "art": [("Vibrato (mizrab)", "≈ Vibrato", "melodie"), ("Glissando", "≈ Slide", "melodie"),
          ("Tremolo mizrab", "≈ Tremolo", "melodie")],
  "fx": [("Rezonanță dublă-cavitate", "≈ Body Hit", "ambient")], "sug": "tar"},
 {"ins": "Setar", "tara": "IR",
  "art": [("Vibrato larg", "≈ Vibrato", "melodie"), ("Slide", "≈ Slide", "melodie"),
          ("Tremolo", "≈ Tremolo", "melodie")],
  "fx": [("Zgomot degete", "≈ Fret Noise", "melodie")], "sug": "setar"},
 {"ins": "Shamisen", "tara": "JP",
  "art": [("Sukui (slide)", "≈ Slide", "melodie"), ("Vibrato", "≈ Vibrato", "melodie"),
          ("Hajiki (pull-off)", "≈ Pull-off", "melodie"), ("Uchi (strike)", "≈ Dead Note/strum", "ritm")],
  "fx": [("Bachi love", "≈ Pick Scratch", "ritm")], "sug": "shamisen"},
 {"ins": "Biwa", "tara": "JP",
  "art": [("Tremolo", "≈ Tremolo", "melodie"), ("Slide", "≈ Slide", "melodie"),
          ("Strum percutant", "≈ Strum/Dead Note", "ritm")],
  "fx": [("Lovitură plectru", "≈ Body Hit", "ritm")], "sug": "biwa"},
 {"ins": "Rubab", "tara": "AF/PK",
  "art": [("Tremolo", "≈ Tremolo", "melodie"), ("Slide", "≈ Slide", "melodie"),
          ("Hammer-on", "≈ Hammer-on", "melodie")],
  "fx": [("Rezonanță simpatică", "≈ (corzi simpatice)", "ambient")], "sug": "rubab"},
 {"ins": "Qanun", "tara": "TR/AR",
  "art": [("Tremolo 3 degete", "≈ Tremolo", "melodie"), ("Glissando", "≈ Slide", "melodie"),
          ("Mandals (microton)", "≈ Bend", "melodie")],
  "fx": [("Click mandals", "≈ (switch)", "melodie")], "sug": "qanun"},
 {"ins": "Santur", "tara": "IR/IN",
  "art": [("Tremolo ciocănele", "≈ Tremolo", "melodie"), ("Glissando", "≈ Slide", "melodie")],
  "fx": [("Rezonanță corzi multe", "≈ chorus", "ambient")], "sug": "santur"},
 {"ins": "Gayageum", "tara": "KR",
  "art": [("Nonghyeon (vibrato)", "≈ Vibrato", "melodie"), ("Chwihyeon (slide)", "≈ Slide", "melodie"),
          ("Tremolo", "≈ Tremolo", "melodie")],
  "fx": [("Rezonanță lemn", "≈ Body Hit", "ambient")], "sug": "gayageum"},
 {"ins": "Veena", "tara": "IN",
  "art": [("Gamaka", "≈ Vibrato/Bend", "melodie"), ("Slide", "≈ Slide", "melodie"),
          ("Pull-off", "≈ Pull-off", "melodie")],
  "fx": [("Rezonanță kudam", "≈ Body Hit", "ambient")], "sug": "veena"},
 {"ins": "Sarangi", "tara": "IN",
  "art": [("Vibrato glisant", "≈ Vibrato/Slide", "melodie"), ("Glissando", "≈ Slide", "melodie")],
  "fx": [("Rezonanță simpatică", "≈ (corzi simpatice)", "ambient")], "sug": "sarangi"},
 {"ins": "Cümbüş", "tara": "TR",
  "art": [("Tremolo", "≈ Tremolo", "melodie"), ("Slide", "≈ Slide", "melodie")],
  "fx": [("Rezonanță metal (banjo-like)", "≈ banjo", "progresii")], "sug": "cumbus"},
 {"ins": "Lute/Renaissance", "tara": "EU",
  "art": [("Pizzicato", "≈ Sustain", "melodie"), ("Ornamente", "≈ Hammer-on/Pull-off", "melodie"),
          ("Arpeggio", "≈ arpeggio", "arp")],
  "fx": [("Rezonanție cutie", "≈ Body Hit", "ambient")], "sug": "lute"},
 {"ins": "Vihuela", "tara": "ES/MX",
  "art": [("Rasgueado", "≈ Rasgueado", "ritm"), ("Arpegio", "≈ arpeggio", "arp"),
          ("Slide", "≈ Slide", "melodie")],
  "fx": [("Percuție cutie", "≈ Body Hit", "ritm")], "sug": "vihuela"},
 {"ins": "Timple", "tara": "Canare",
  "art": [("Rasgueado", "≈ Rasgueado", "ritm"), ("Tremolo", "≈ Vibrato", "melodie")],
  "fx": [("Brightness mic", "≈ Strum", "progresii")], "sug": "timple"},
 {"ins": "Harpă", "tara": "global",
  "art": [("Glissando", "≈ Slide FX", "arp/melodie"), ("Pizzicato", "≈ Sustain", "melodie"),
          ("Arpegii", "≈ arpeggio", "arp")],
  "fx": [("Rezonanție corzi", "≈ chorus", "ambient")], "sug": "harpa"},
 {"ins": "Mandola / octave mandolin", "tara": "EU",
  "art": [("Tremolo", "≈ Vibrato/Tremolo", "melodie"), ("Strum", "≈ Strum", "progresii")],
  "fx": [("Attack corzi duble", "≈ Strum", "progresii")], "sug": "mandola"},
]


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    manifest = []
    all_rules = []
    for e in INSTRUMENTE:
        rules = {
            "instrument": e["ins"], "tara": e["tara"], "sugestie": e["sug"],
            "referinta_ample_art": AMPLE_ART, "referinta_ample_fx": AMPLE_FX,
            "articulatii": [{"term": a[0], "similar": a[1], "context": a[2]} for a in e["art"]],
            "fx": [{"term": f[0], "similar": f[1], "context": f[2]} for f in e["fx"]],
        }
        # reguli pt. sugestii: <sugestie>_<term_scurt>
        for a in e["art"]:
            all_rules.append({"sugestie": f"{e['sug']}_{a[0].split()[0].lower()}",
                              "instrument": e["ins"], "tip": "articulatie",
                              "≈": a[1], "context": a[2]})
        for f in e["fx"]:
            all_rules.append({"sugestie": f"{e['sug']}_{f[0].split()[0].lower()}",
                              "instrument": e["ins"], "tip": "fx",
                              "≈": f[1], "context": f[2]})
        (OUT / f"{e['sug']}.json").write_text(json.dumps(rules, ensure_ascii=False, indent=1),
                                              encoding="utf-8")
        manifest.append({"instrument": e["ins"], "tara": e["tara"], "sugestie": e["sug"],
                         "nr_art": len(e["art"]), "nr_fx": len(e["fx"])})
    (OUT / "reguli_similar.json").write_text(json.dumps(all_rules, ensure_ascii=False, indent=1),
                                             encoding="utf-8")
    (OUT / "manifest_similar.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1),
                                               encoding="utf-8")
    print("Scrise", len(manifest), "instrumente si", len(all_rules), "reguli in", OUT)


if __name__ == "__main__":
    main()
