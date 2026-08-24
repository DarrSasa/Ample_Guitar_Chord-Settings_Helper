#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
analizeaza-carti.py

Examineaza cartile .md construite de package-book.py si raporteaza, pentru
fiecare, ce a iesit BINE si ce a iesit prost:

  - pagini si cantitatea de text real (in afara blocurilor ```xml)
    -> 0 caractere inseamna PDF fara strat de text (lipseste OCR-ul)
  - partituri pe tipuri: SCORE / SCORE+TAB / TAB / DIAGRAMA / IMAGINE
  - dintre SCORE si SCORE+TAB (singurele care primesc MusicXML de la
    Audiveris): cate au XML si cate nu
  - XML-uri GOALE (0 note): Audiveris a produs fisierul, dar n-a gasit
    muzica - de regula un bloc de text/desen detectat ca portativ
  - diagrame citite geometric (voicing / puncte) si diagrame necitite

Folosire:
    py scripts\\analizeaza-carti.py "documente\\carti\\01_Chord_Theory_and_Construction"
    py scripts\\analizeaza-carti.py            <- folderul implicit de mai jos
"""

import glob
import os
import re
import sys
import xml.etree.ElementTree as ET

FOLDER_IMPLICIT = os.path.join("documente", "carti",
                               "01_Chord_Theory_and_Construction")
RE_MARCAJ = re.compile(r"^\[(SCORE\+TAB|SCORE|TAB|DIAGRAMA|IMAGINE)")


def numara_note(xml_text):
    """(masuri, note) dintr-un bloc MusicXML; (0, 0) daca nu se parseaza."""
    try:
        radacina = ET.fromstring(xml_text)
    except ET.ParseError:
        return 0, 0
    note = radacina.findall(".//note") or radacina.findall(".//{*}note")
    return len(radacina.findall(".//measure")), len(note)


def examineaza(cale):
    linii = open(cale, encoding="utf-8").read().splitlines()
    in_xml = False
    buf = []
    tipuri = {}
    scoruri = {"cu_xml": 0, "fara_xml": 0}
    diagrame = {"voicing": 0, "puncte": 0, "fara_nimic": 0}
    masuri = note = 0
    xml_total = xml_goale = 0
    text_linii = text_caractere = 0
    pagini = 0

    for l in linii:
        if in_xml:
            if l.strip() == "```":
                in_xml = False
                m, n = numara_note("\n".join(buf))
                masuri += m
                note += n
                xml_total += 1
                if n == 0:
                    xml_goale += 1
                buf = []
            else:
                buf.append(l)
            continue
        if l.startswith("```xml"):
            in_xml = True
            continue
        if l.startswith("## Pagina"):
            pagini += 1
        mm = RE_MARCAJ.match(l)
        if mm:
            tip = mm.group(1)
            tipuri[tip] = tipuri.get(tip, 0) + 1
            if tip in ("SCORE", "SCORE+TAB"):
                scoruri["cu_xml" if "XML:" in l else "fara_xml"] += 1
            elif tip == "DIAGRAMA":
                if "VOICING:" in l:
                    diagrame["voicing"] += 1
                elif "PUNCTE:" in l:
                    diagrame["puncte"] += 1
                else:
                    diagrame["fara_nimic"] += 1
            continue
        s = l.strip()
        if not s or s == "---" or s.startswith("#"):
            continue
        text_linii += 1
        text_caractere += len(s)

    total_omr = scoruri["cu_xml"] + scoruri["fara_xml"]
    print("=" * 78)
    print(os.path.basename(cale))
    print(f"  marime: {os.path.getsize(cale):,} octeti | {len(linii):,} linii | "
          f"{pagini} pagini")
    print(f"  TEXT: {text_linii:,} linii / {text_caractere:,} caractere"
          + ("   <-- FARA TEXT: PDF-ul n-are strat de text (fa OCR!)"
             if not text_caractere else ""))
    print(f"  partituri: {sum(tipuri.values()):,} -> "
          + ", ".join(f"{k}={v}" for k, v in sorted(tipuri.items())))
    print(f"  OMR (SCORE/SCORE+TAB): {total_omr} | cu XML: {scoruri['cu_xml']} "
          f"| fara XML: {scoruri['fara_xml']}"
          + (f"  ({100.0 * scoruri['fara_xml'] / total_omr:.0f}%)"
             if total_omr else ""))
    print(f"  XML incorporate: {xml_total} | masuri: {masuri:,} | note: {note:,}"
          + (f" | GOALE (0 note): {xml_goale} "
             f"({100.0 * xml_goale / xml_total:.0f}%)" if xml_total else ""))
    print(f"  diagrame: voicing={diagrame['voicing']}, "
          f"puncte={diagrame['puncte']}, necitite={diagrame['fara_nimic']}")


def main():
    folder = sys.argv[1] if len(sys.argv) > 1 else FOLDER_IMPLICIT
    if not os.path.isdir(folder):
        print(f"Nu gasesc folderul: {folder}")
        sys.exit(1)
    carti = sorted(glob.glob(os.path.join(folder, "*.md")))
    if not carti:
        print(f"Nicio carte .md in {folder}")
        sys.exit(1)
    for cale in carti:
        examineaza(cale)
    print("=" * 78)


if __name__ == "__main__":
    main()
