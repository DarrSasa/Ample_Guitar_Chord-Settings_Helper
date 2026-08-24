#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
genereaza-progresii.py

GENEAZA progresii de acorduri PE GENURI din date deschise, pentru viitoarea
optiune "dupa gen" a programului:

  - date_extrase/progresii_pe_genuri.json  (grade per gen, surse deschise)
  - date_extrase/stiluri.json              (swing/grid/velocity per gen, M1)
  - documente/baze/chords-db/guitar.json   (voicinguri + diagrame, MIT)

Nu foloseste nimic din cartile scanate: doar surse verificate.

Folosire:
    py scripts\genereaza-progresii.py blues --cheia E
    py scripts\genereaza-progresii.py jazz --cheia C --diagrame iesire/
    py scripts\genereaza-progresii.py --toate --cheia G
"""

import argparse
import importlib.util
import json
import os
import sys

BAZA_PROG = os.path.join("date_extrase", "progresii_pe_genuri.json")
BAZA_STIL = os.path.join("date_extrase", "stiluri.json")
BAZA_ACORD = os.path.join("documente", "baze", "chords-db", "guitar.json")

NOTE = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"]
MAJOR = [0, 2, 4, 5, 7, 9, 11]
NUMERAL = {"i": 1, "ii": 2, "iii": 3, "iv": 4, "v": 5, "vi": 6, "vii": 7}


def rezolva_grad(token, tonica):
    """'bVII7' in C -> 'Bb7'; 'ii7' in C -> 'Dm7'; 'I' in C -> 'C'."""
    acc = 0
    if token.startswith("b"):
        acc, token = -1, token[1:]
    elif token.startswith("#"):
        acc, token = +1, token[1:]
    jos = token.lower()
    for num in sorted(NUMERAL, key=len, reverse=True):
        if jos.startswith(num):
            e_minor = token[:len(num)].islower()
            rest = token[len(num):]
            grad = NUMERAL[num]
            break
    else:
        return None
    pc = (NOTE.index(tonica) + MAJOR[grad - 1] + acc) % 12
    baza_cal = "m" if e_minor else ""
    if not rest:
        sufix = baza_cal
    elif rest[0].isdigit():
        # ii7 -> m7, I7 -> 7, iv9 -> m9
        sufix = baza_cal + rest
    else:
        # maj7 / m7 / dim / aug / sus / add etc. - calitatea e scrisa explicit
        sufix = rest
    return NOTE[pc] + sufix


def incarca(cale):
    with open(cale, encoding="utf-8") as f:
        return json.load(f)


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("genuri", nargs="*", help="ex: blues jazz rock; --toate pt. toate")
    ap.add_argument("--cheia", default="C", help="tonalitatea (default C)")
    ap.add_argument("--toate", action="store_true", help="toate genurile")
    ap.add_argument("--diagrame", default="", help="folder in care scrii PNG-uri")
    args = ap.parse_args()

    for c in (BAZA_PROG, BAZA_STIL, BAZA_ACORD):
        if not os.path.isfile(c):
            print(f"Lipseste {c}")
            sys.exit(1)
    prog = incarca(BAZA_PROG)["genuri"]
    stil = incarca(BAZA_STIL)["genuri"]
    baza = incarca(BAZA_ACORD)

    gen_mod = importlib.util.spec_from_file_location(
        "ga", os.path.join("scripts", "genereaza-acorduri.py"))
    ga = importlib.util.module_from_spec(gen_mod)
    gen_mod.loader.exec_module(ga)

    chei = list(prog) if args.toate else (args.genuri or [next(iter(prog))])
    for gen in chei:
        if gen not in prog:
            print(f"  ! gen necunoscut: {gen}")
            continue
        info_stil = stil.get(gen, {})
        print("=" * 70)
        print(f"GEN: {gen}   (cheia {args.cheia})   stil: swing={info_stil.get('swing')}% "
              f"grid={info_stil.get('grid')} vel={info_stil.get('plaja_velocity')} "
              f"chitara={info_stil.get('chitara')}")
        for p in prog[gen]["progresii"]:
            acorduri = [rezolva_grad(g, args.cheia) for g in p["grade"]]
            print(f"\n  {p['nume']}:  {' - '.join(acorduri)}")
            if args.diagrame:
                os.makedirs(args.diagrame, exist_ok=True)
                gasite = 0
                for a in acorduri:
                    pozitii = ga.cauta_acord(baza, a)
                    if not pozitii:
                        print(f"      ! {a}: fara diagrama in baza")
                        continue
                    gasite += 1
                    png = os.path.join(args.diagrame, f"{gen}-{a}.png")
                    if not os.path.isfile(png):
                        ga.deseneaza_diagrama(pozitii[0], a, png)
                if gasite:
                    print(f"      diagrame: {gasite}/{len(acorduri)} acorduri")
    print("=" * 70)


if __name__ == "__main__":
    main()
