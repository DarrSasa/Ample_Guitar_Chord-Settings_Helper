#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
package-book.py  (ETAPA 3 - versiunea pentru extract_partituri.py)

Continua ce a facut extract_partituri.py (etapa 2), care a salvat toate
imaginile PNG cu partituri in subfolderul "imagini_partituri" din folderul
parental, impreuna cu manifest.json (paginile fiecarei partituri + CUVINTELE
descriptive incluse in imagine si pozitia lor: "Vln", "Vla", "Violin I",
"Violin Open Strings" etc.).

Ce face:
  1. CONVERSIA in MusicXML (daca se da --audiveris):
     - pentru fiecare PNG pregateste o copie CURATA pentru OMR: cuvintele
       descriptive sunt albite (Audiveris converteste mult mai bine fara
       text printre portative) si imaginea e marita 2x;
     - ruleaza Audiveris in batch si aduna .mxl/.xml in folderul de scoruri.
  2. INJECTAREA cuvintelor descriptive in XML, la locul corect:
     - cuvantul din STANGA portativului (ex. "Vln", "Violin I")
         -> <part-name> (numele instrumentului/partii);
     - legenda de DEASUPRA (ex. "Violin Open Strings")
         -> <movement-title> (titlul exemplului);
     - alte cuvinte bune ramase -> <credit><credit-words>.
     Functioneaza si pe .xml/.musicxml simplu, si pe .mxl (arhiva zip).
     Gunoaiele OCR (ex. "ae", "©):", "——") sunt filtrate automat.
  3. CARTEA NOUA (book.md): textul fiecarei pagini din PDF, iar in locul
     unde erau portativele odinioara apar marcatori:
         [SCORE: imagini_partituri/partitura-p8-B.png | XML: scores/... |
          CUVINTE: Vln]

Folosire (din folderul parental, dupa extract_partituri.py):
    python package-book.py "carte.pdf"
    python package-book.py "carte.pdf" --audiveris "C:\\Program Files\\Audiveris\\Audiveris.exe"
    python package-book.py "carte.pdf" --imagini imagini_partituri --scores-dir partituri_xml

Dependinte:  pip install pymupdf opencv-python-headless numpy
"""

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import zipfile
import xml.etree.ElementTree as ET

try:
    import numpy as np
    import cv2
except ImportError:
    np = cv2 = None  # doar pentru curatarea PNG-urilor la OMR

try:
    import pymupdf as fitz
except ImportError:
    try:
        import fitz
    except ImportError:
        fitz = None


# ---------------------------------------------------------------------------
# numele fisierelor: partitura-p3-A.png / partitura-p7.png / partitura-p22-23-A.png
# ---------------------------------------------------------------------------
RE_NUME = re.compile(r"^partitura-p(\d+)(?:-(\d+))?(?:-([A-Z]+))?\.png$", re.I)


def pagina_din_nume(fname):
    m = RE_NUME.match(fname)
    if not m:
        return None
    return int(m.group(1))  # partitura apare prima data pe aceasta pagina


# ---------------------------------------------------------------------------
# filtrarea cuvintelor descriptive (aruncam gunoaiele OCR)
# ---------------------------------------------------------------------------
def cuvant_bun(text):
    """True daca textul pare un cuvant/eticheta reala, nu gunoi OCR."""
    t = text.strip()
    if len(t) < 2:
        return False
    litere = sum(1 for c in t if c.isalpha())
    return litere >= 2 and litere / len(t) >= 0.6


def curata_cuvant(text):
    """Taie simbolurile parazite de la capete (ex. 'Vin =' -> 'Vin')."""
    return re.sub(r"^[^A-Za-z]+|[^A-Za-z.\d ]+$", "", text).strip()


def clasifica_cuvinte(cuvinte, lat, inalt):
    """Imparte cuvintele dupa pozitia lor in imaginea partiturii:
       - 'stanga'  : eticheta partii (Vln, Vla, Violin I) -> part-name
       - 'sus'     : legenda/titlul de deasupra -> movement-title
       - 'altele'  : restul cuvintelor bune -> credit-words
    """
    eticheta, titlu, altele = None, None, []
    for c in cuvinte:
        text = curata_cuvant(c["text"])
        if not cuvant_bun(text):
            continue
        x0, y0, x1, y1 = c["bbox"]
        centru_y = 0.5 * (y0 + y1)
        if x1 <= 0.30 * lat and 0.15 * inalt <= centru_y <= 0.85 * inalt:
            # in stanga, la nivelul portativului
            if eticheta is None or len(text) > len(eticheta):
                eticheta = text
        elif y1 <= 0.35 * inalt:
            if titlu is None or len(text) > len(titlu):
                titlu = text
        else:
            # pentru credit-words cerem cuvinte ceva mai lungi, ca sa nu
            # ajunga in XML gunoaie OCR de 2 litere ("ae", "oe", "es")
            if sum(1 for ch in text if ch.isalpha()) >= 3:
                altele.append(text)
    return eticheta, titlu, altele


# ---------------------------------------------------------------------------
# curatarea PNG-ului pentru OMR (albim cuvintele, marim imaginea)
# ---------------------------------------------------------------------------
def pregateste_pentru_omr(png_path, cuvinte, out_path, scala=2):
    if cv2 is None:
        shutil.copyfile(png_path, out_path)
        return
    img = cv2.imread(png_path, cv2.IMREAD_GRAYSCALE)
    if img is None:
        shutil.copyfile(png_path, out_path)
        return
    h, w = img.shape
    for c in cuvinte:
        x0, y0, x1, y1 = c["bbox"]
        img[max(0, y0 - 2):min(h, y1 + 2), max(0, x0 - 2):min(w, x1 + 2)] = 255
    if scala != 1:
        img = cv2.resize(img, (w * scala, h * scala), interpolation=cv2.INTER_CUBIC)
    cv2.imwrite(out_path, img)


# ---------------------------------------------------------------------------
# Audiveris -> MusicXML
# ---------------------------------------------------------------------------
def ruleaza_audiveris(audiveris, png_path, out_dir):
    """Ruleaza Audiveris in batch pe un PNG si intoarce calea .mxl/.xml
    produsa (sau None)."""
    try:
        r = subprocess.run(
            [audiveris, "-batch", "-export", "-output", out_dir, "--", png_path],
            capture_output=True, text=True, timeout=600)
    except FileNotFoundError:
        print(f"  ! Nu gasesc Audiveris la: {audiveris}")
        return None
    except subprocess.TimeoutExpired:
        print(f"  ! Audiveris a depasit timpul pe {os.path.basename(png_path)}")
        return None
    base = os.path.splitext(os.path.basename(png_path))[0]
    gasite = []
    for rad, _, fisiere in os.walk(out_dir):
        for f in fisiere:
            if f.lower().endswith((".mxl", ".xml", ".musicxml")) and base in f:
                gasite.append(os.path.join(rad, f))
    if not gasite:
        if r.returncode != 0:
            print(f"  ! Audiveris esuat pe {base} (cod {r.returncode})")
        else:
            print(f"  ! Audiveris nu a gasit muzica in {base}")
        return None
    # preferam .mxl
    gasite.sort(key=lambda p: (not p.lower().endswith(".mxl"), p))
    return gasite[0]


# ---------------------------------------------------------------------------
# injectarea cuvintelor in MusicXML
# ---------------------------------------------------------------------------
def _injecteaza_in_arbore(root, eticheta, titlu, altele):
    schimbat = False
    if eticheta is not None:
        for pn in root.iter("part-name"):
            pn.text = eticheta
            schimbat = True
            break
        else:
            sp = root.find(".//score-part")
            if sp is not None:
                pn = ET.SubElement(sp, "part-name")
                pn.text = eticheta
                schimbat = True
    if titlu is not None:
        mt = root.find("movement-title")
        if mt is None:
            # movement-title trebuie sa stea inaintea identification/part-list
            copii = list(root)
            poz = 0
            for k, c in enumerate(copii):
                if c.tag in ("identification", "defaults", "credit", "part-list"):
                    poz = k
                    break
                poz = k + 1
            mt = ET.Element("movement-title")
            root.insert(poz, mt)
        mt.text = titlu
        schimbat = True
    for text in altele:
        cr = ET.Element("credit")
        cr.set("page", "1")
        cw = ET.SubElement(cr, "credit-words")
        cw.text = text
        # credit sta inaintea part-list
        for k, c in enumerate(list(root)):
            if c.tag == "part-list":
                root.insert(k, cr)
                schimbat = True
                break
    return schimbat


def injecteaza_cuvinte_xml(cale, eticheta, titlu, altele):
    """Scrie cuvintele descriptive in fisierul MusicXML (.xml sau .mxl),
    la locul corect. Intoarce True daca s-a schimbat ceva."""
    if eticheta is None and titlu is None and not altele:
        return False
    if cale.lower().endswith(".mxl"):
        # arhiva zip: gasim fisierul radacina din META-INF/container.xml
        with zipfile.ZipFile(cale, "r") as z:
            nume = z.namelist()
            continut = {n: z.read(n) for n in nume}
        radacina = None
        if "META-INF/container.xml" in continut:
            try:
                cont = ET.fromstring(continut["META-INF/container.xml"])
                rf = cont.find(".//rootfile")
                if rf is not None:
                    radacina = rf.get("full-path")
            except ET.ParseError:
                pass
        if radacina is None:
            xmluri = [n for n in nume
                      if n.lower().endswith((".xml", ".musicxml"))
                      and not n.startswith("META-INF")]
            radacina = xmluri[0] if xmluri else None
        if radacina is None or radacina not in continut:
            return False
        root = ET.fromstring(continut[radacina])
        if not _injecteaza_in_arbore(root, eticheta, titlu, altele):
            return False
        continut[radacina] = ET.tostring(root, encoding="UTF-8",
                                         xml_declaration=True)
        with zipfile.ZipFile(cale, "w", zipfile.ZIP_DEFLATED) as z:
            for n in nume:
                z.writestr(n, continut[n])
        return True
    else:
        arbore = ET.parse(cale)
        root = arbore.getroot()
        if not _injecteaza_in_arbore(root, eticheta, titlu, altele):
            return False
        arbore.write(cale, encoding="UTF-8", xml_declaration=True)
        return True


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser(
        description="ETAPA 3: converteste PNG-urile din imagini_partituri in "
                    "MusicXML (Audiveris), injecteaza cuvintele descriptive in "
                    "XML si construieste cartea noua (book.md).")
    ap.add_argument("pdf", help="PDF-ul cartii (originalul sau cel procesat)")
    ap.add_argument("--imagini", default="imagini_partituri",
                    help="folderul cu PNG-uri + manifest.json (default: imagini_partituri)")
    ap.add_argument("--scores-dir", default="partituri_xml",
                    help="folderul pentru fisierele MusicXML (default: partituri_xml)")
    ap.add_argument("--audiveris", default="",
                    help="calea catre Audiveris (optional; fara el se folosesc "
                         "XML-urile deja existente in --scores-dir)")
    ap.add_argument("--scala-omr", type=int, default=2,
                    help="factorul de marire al PNG-ului dat lui Audiveris (default: 2)")
    ap.add_argument("--out", default=None,
                    help="fisierul cartii noi (default: <pdf>.md)")
    args = ap.parse_args()

    if fitz is None:
        print("Lipseste PyMuPDF. Ruleaza:  pip install pymupdf")
        sys.exit(1)
    if not os.path.isfile(args.pdf):
        print("Nu gasesc PDF-ul:", args.pdf)
        sys.exit(1)
    if not os.path.isdir(args.imagini):
        print(f"Nu gasesc folderul cu imagini: {args.imagini}")
        print("Ruleaza intai etapa 2:  python extract_partituri.py <pdf>")
        sys.exit(1)

    # manifestul etapei 2 (cuvintele descriptive + paginile)
    manifest = {}
    cale_manifest = os.path.join(args.imagini, "manifest.json")
    if os.path.isfile(cale_manifest):
        with open(cale_manifest, encoding="utf-8") as f:
            date = json.load(f)
        for p in date.get("partituri", []):
            manifest[p["fisier"]] = p

    pnguri = sorted(f for f in os.listdir(args.imagini) if RE_NUME.match(f))
    if not pnguri:
        print(f"Niciun PNG de partitura in {args.imagini}/")
        sys.exit(1)

    os.makedirs(args.scores_dir, exist_ok=True)
    xml_per_png = {}

    print(f"Partituri gasite: {len(pnguri)}")
    for fname in pnguri:
        info = manifest.get(fname, {})
        cuvinte = info.get("cuvinte", [])
        baza = os.path.splitext(fname)[0]

        # 1) conversia cu Audiveris (pe imaginea curatata de cuvinte)
        cale_xml = None
        if args.audiveris:
            with tempfile.TemporaryDirectory() as tmp:
                png_curat = os.path.join(tmp, baza + ".png")
                pregateste_pentru_omr(os.path.join(args.imagini, fname),
                                      cuvinte, png_curat, args.scala_omr)
                produs = ruleaza_audiveris(args.audiveris, png_curat, tmp)
                if produs:
                    ext = os.path.splitext(produs)[1].lower()
                    cale_xml = os.path.join(args.scores_dir, baza + ext)
                    shutil.copyfile(produs, cale_xml)
        else:
            for ext in (".mxl", ".xml", ".musicxml"):
                c = os.path.join(args.scores_dir, baza + ext)
                if os.path.isfile(c):
                    cale_xml = c
                    break

        # 2) injectam cuvintele descriptive in XML, la locul corect
        if cale_xml:
            img_dim = None
            if cv2 is not None:
                img = cv2.imread(os.path.join(args.imagini, fname),
                                 cv2.IMREAD_GRAYSCALE)
                if img is not None:
                    img_dim = (img.shape[1], img.shape[0])
            lat, inalt = img_dim if img_dim else (1000, 200)
            eticheta, titlu, altele = clasifica_cuvinte(cuvinte, lat, inalt)
            if injecteaza_cuvinte_xml(cale_xml, eticheta, titlu, altele):
                detalii = [x for x in (eticheta and f"part-name='{eticheta}'",
                                       titlu and f"titlu='{titlu}'") if x]
                print(f"  {baza}: XML + {', '.join(detalii) if detalii else 'fara cuvinte'}")
            else:
                print(f"  {baza}: XML (fara cuvinte de injectat)")
            xml_per_png[fname] = cale_xml
        else:
            print(f"  {baza}: doar PNG (fara XML"
                  f"{' - da --audiveris pentru conversie' if not args.audiveris else ''})")

    # 3) cartea noua: textul paginilor + partiturile EXACT LA LOCUL LOR.
    #    Folosim pozitiile din manifest (zone_pdf) ca sa:
    #      - eliminam "textul" citit gresit de OCR de pe portative
    #        (ex. "D a zw oy WD 1 HE oy") din zona fiecarei partituri;
    #      - punem marcatorul [SCORE...] in fluxul textului exact acolo
    #        unde era portativul odinioara.
    print("\nConstruim cartea noua...")
    doc = fitz.open(args.pdf)

    # zonele partiturilor, pe pagini (1-based)
    zone_pe_pagina = {}     # pagina -> [(bbox_pt, fname, e_prima_bucata)]
    for fname in pnguri:
        info = manifest.get(fname, {})
        zone = info.get("zone_pdf", [])
        if zone:
            for k, z in enumerate(zone):
                zone_pe_pagina.setdefault(z["pagina"], []).append(
                    (z["bbox_pt"], fname, k == 0))
        else:
            pg = pagina_din_nume(fname)
            if pg:
                zone_pe_pagina.setdefault(pg, []).append((None, fname, True))

    def marcaj_partitura(fname):
        info = manifest.get(fname, {})
        cuvinte = [curata_cuvant(c["text"]) for c in info.get("cuvinte", [])]
        cuvinte = [c for c in cuvinte if cuvant_bun(c)]
        xml = xml_per_png.get(fname)
        m = f"[SCORE: {args.imagini}/{fname}"
        if xml:
            m += f" | XML: {xml.replace(os.sep, '/')}"
        if cuvinte:
            m += f" | CUVINTE: {', '.join(cuvinte)}"
        return m + "]"

    def in_zona(bx0, by0, bx1, by1, zone, marja=4.0):
        """Centrul blocului de text cade in zona unei partituri?"""
        cx, cy = 0.5 * (bx0 + bx1), 0.5 * (by0 + by1)
        for (z, _, _) in zone:
            if z and (z[0] - marja <= cx <= z[2] + marja
                      and z[1] - marja <= cy <= z[3] + marja):
                return True
        return False

    out_path = args.out or (os.path.splitext(args.pdf)[0] + ".md")
    linii = ["# Cartea (text + partituri)", ""]
    for pno, page in enumerate(doc):
        pagina = pno + 1
        zone = zone_pe_pagina.get(pagina, [])
        linii.append(f"## Pagina {pagina}")
        linii.append("")

        # elementele paginii, in ordinea de sus in jos:
        #   blocurile de text din AFARA zonelor cu partituri + marcatorii
        elemente = []
        for b in page.get_text("blocks"):
            bx0, by0, bx1, by1, text = b[0], b[1], b[2], b[3], b[4]
            if len(b) > 6 and b[6] != 0:
                continue  # blocurile de imagine nu ne intereseaza
            if not text.strip():
                continue
            if in_zona(bx0, by0, bx1, by1, zone):
                continue  # gunoi OCR de pe portativ -> inlocuit de marcator
            elemente.append((by0, "text", text.strip()))
        for (z, fname, e_prima) in zone:
            if not e_prima:
                continue  # continuarea unei partituri: marcata pe prima pagina
            y = z[1] if z else 10 ** 9
            elemente.append((y, "score", marcaj_partitura(fname)))
        elemente.sort(key=lambda e: e[0])

        for _, fel, continut in elemente:
            linii.append(continut)
            linii.append("")
        linii.append("---")
        linii.append("")
    doc.close()

    with open(out_path, "w", encoding="utf-8") as f:
        f.write("\n".join(linii))

    n_xml = len(xml_per_png)
    print(f"\nGata. Cartea noua: {out_path}")
    print(f"  Partituri: {len(pnguri)} | convertite in XML: {n_xml}")
    if not args.audiveris and n_xml == 0:
        print("  (pentru conversia in MusicXML ruleaza cu "
              "--audiveris \"C:\\Program Files\\Audiveris\\Audiveris.exe\")")


if __name__ == "__main__":
    main()
