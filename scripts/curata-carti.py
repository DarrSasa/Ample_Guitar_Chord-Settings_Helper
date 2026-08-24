#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
curata-carti.py

Sterge din cartile .md construite de package-book.py continutul GRESIT:
marcatorii [SCORE] / [SCORE+TAB] al caror bloc ```xml incorporat nu contine
NICIO NOTA (Audiveris a produs un fisier valid dar gol, de regula pentru un
bloc de text sau un desen detectat ca portativ). Restul cartii ramane neatins.

Nu sterge marcatorii fara XML (doar referinta la PNG) si nu atinge diagramele
cu voicing/puncte - alea sunt citiri geometrice valide.

Folosire:
    py scripts\curata-carti.py            <- curata toate cartile din folder
    py scripts\curata-carti.py --folder documente\carti\01_Chord_Theory_and_Construction
    py scripts\curata-carti.py --dry-run  <- doar raporteaza, nu modifica
"""

import argparse
import glob
import os
import re
import sys

RE_SCORE = re.compile(r"^\[(SCORE\+TAB|SCORE)")


def numara_note(xml_text):
    n = xml_text.count("<note")
    return n


def curata(text):
    """Intoarce (text_curat, eliminate)."""
    linii = text.split("\n")
    out = []
    eliminate = 0
    i = 0
    n = len(linii)
    while i < n:
        linie = linii[i]
        if RE_SCORE.match(linie.strip()):
            # cauta blocul xml imediat urmator (peste linii goale)
            j = i + 1
            while j < n and not linii[j].strip():
                j += 1
            if j < n and linii[j].strip().startswith("```xml"):
                k = j + 1
                bloc = []
                while k < n and not linii[k].strip().startswith("```"):
                    bloc.append(linii[k])
                    k += 1
                # k e linia de inchidere ```
                if numara_note("\n".join(bloc)) == 0:
                    eliminate += 1
                    i = k + 1          # sarim marker + xml + inchidere
                    # sarim si liniile goale imediat urmatoare
                    while i < n and not linii[i].strip():
                        i += 1
                    continue
        out.append(linie)
        i += 1
    return "\n".join(out), eliminate


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--folder", default=os.path.join("documente", "carti"))
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    carti = sorted(glob.glob(os.path.join(args.folder, "**", "*.md"), recursive=True))
    if not carti:
        print(f"Nicio carte .md in {args.folder}")
        sys.exit(1)
    total = 0
    for cale in carti:
        text = open(cale, encoding="utf-8").read()
        curat, eliminate = curata(text)
        if not eliminate:
            continue
        total += eliminate
        print(f"  {os.path.basename(cale)}: {eliminate} partituri goale sterse"
              + (" (dry-run, nemodificat)" if args.dry_run else ""))
        if not args.dry_run:
            with open(cale, "w", encoding="utf-8") as f:
                f.write(curat)
    print(f"TOTAL: {total} partituri goale sterse"
          + (" (dry-run)" if args.dry_run else ""))


if __name__ == "__main__":
    main()
