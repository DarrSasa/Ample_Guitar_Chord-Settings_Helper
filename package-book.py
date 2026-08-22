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


# Abrevieri de instrumente pe care le poate purta o eticheta de partitura
# (inclusiv variantele citite gresit de OCR: Vln->Vin, Vla->Via, Vl->VI).
# Cheia = forma cu litere mici, valoarea = forma corectata pentru XML.
ETICHETE_CUNOSCUTE = {
    "vln": "Vln", "vin": "Vln", "vl": "Vln", "vi": "Vln", "vn": "Vln",
    "vla": "Vla", "via": "Vla",
    "vlc": "Vlc", "vc": "Vlc", "cello": "Cello",
    "cb": "Cb", "db": "Db", "bass": "Bass",
    "fl": "Fl", "ob": "Ob", "cl": "Cl", "bn": "Bn", "fg": "Fg",
    "hn": "Hn", "cor": "Cor", "tpt": "Tpt", "tbn": "Tbn", "tba": "Tba",
    "timp": "Timp", "perc": "Perc", "hp": "Hp", "pno": "Pno", "org": "Org",
    "gtr": "Gtr", "git": "Git", "sop": "Sop", "alt": "Alt", "ten": "Ten",
    "bar": "Bar", "bas": "Bas",
}


def valideaza_eticheta(text):
    """Verifica daca textul chiar arata a eticheta de instrument (Vln,
    Vla, Violin I...). Intoarce forma curatata/corectata sau None.

    Regulile taie gunoiul OCR ('oe', 'owe', 'if.', 'Sk'):
      - <=4 litere: DOAR daca e o abreviere cunoscuta (cu corectie OCR);
      - >=5 litere: trebuie sa inceapa cu majuscula, sa aiba vocale si
        sa fie in mare parte litere.
    """
    t = curata_cuvant(text)
    if not t:
        return None
    primul = t.split()[0] if " " in t else None
    # 1) abrevierile cunoscute au prioritate (intai textul intreg, apoi
    #    primul cuvant: 'Vin ie' -> 'Vin' -> 'Vln')
    for cand in (t, primul):
        if not cand:
            continue
        jos = re.sub(r"[^a-z]", "", cand.lower())
        if jos in ETICHETE_CUNOSCUTE:
            return ETICHETE_CUNOSCUTE[jos]
    # 2) nume intregi de instrument/parte (ex. "Violin I", "Violoncello")
    for cand in (t, primul):
        if not cand:
            continue
        litere = sum(1 for c in cand if c.isalpha())
        if (litere >= 5 and cand[0].isupper()
                and any(c in "aeiouAEIOU" for c in cand)
                and litere / len(cand) >= 0.7):
            return cand
    return None


def clasifica_cuvinte(cuvinte, lat, inalt):
    """Imparte cuvintele dupa pozitia lor in imaginea partiturii:
       - 'stanga'  : eticheta partii (Vln, Vla, Violin I) -> part-name
       - 'sus'     : legenda/titlul de deasupra -> movement-title
       - 'altele'  : restul cuvintelor bune -> credit-words

    Intoarce si `de_albit`: bbox-urile cuvintelor VALIDATE, singurele care
    au voie sa fie albite inainte de OMR. Gunoaiele OCR ("©):", "e)",
    "<->") NU se albesc: ele sunt de fapt chei/note citite gresit -
    albirea lor ar sterge chiar muzica si Audiveris n-ar mai gasi nimic.
    """
    eticheta, titlu, altele, de_albit = None, None, [], []
    for c in cuvinte:
        brut = c["text"]
        text = curata_cuvant(brut)
        if not text:
            continue
        x0, y0, x1, y1 = c["bbox"]
        centru_y = 0.5 * (y0 + y1)
        # eticheta: incepe in stanga imaginii, la nivelul portativului
        if x0 <= 0.30 * lat and 0.15 * inalt <= centru_y <= 0.85 * inalt:
            valid = valideaza_eticheta(brut)
            if valid and (eticheta is None or len(valid) > len(eticheta)):
                eticheta = valid
                de_albit.append(c["bbox"])
                continue
        if not cuvant_bun(text):
            continue
        if y1 <= 0.35 * inalt:
            # titlu: cerem un text mai consistent, nu gunoi OCR scurt
            litere = sum(1 for ch in text if ch.isalpha())
            if (litere >= 5 and any(ch in "aeiouAEIOU" for ch in text)
                    and (titlu is None or len(text) > len(titlu))):
                titlu = text
                de_albit.append(c["bbox"])
        else:
            # pentru credit-words cerem cuvinte ceva mai lungi, ca sa nu
            # ajunga in XML gunoaie OCR de 2 litere ("ae", "oe", "es")
            if sum(1 for ch in text if ch.isalpha()) >= 4:
                altele.append(text)
    return eticheta, titlu, altele, de_albit


# ---------------------------------------------------------------------------
# curatarea PNG-ului pentru OMR (albim cuvintele, marim imaginea)
# ---------------------------------------------------------------------------
def prelungeste_portativ(img):
    """Prelungeste liniile portativului spre dreapta cu o 'masura goala'
    desenata + bara finala. Audiveris refuza portativele foarte SCURTE
    (sub ~20 de interlinii lungime) cu 'No system found' - exemplele
    mici de 1-2 masuri din carti au nevoie de alungirea asta."""
    h, w = img.shape
    ink = img < 200
    rowink = ink.sum(axis=1)
    prag = 0.35 * w
    este = rowink >= prag
    centre = []
    grosimi = []
    y = 0
    while y < h:
        if este[y]:
            y0 = y
            while y < h and este[y]:
                y += 1
            centre.append((y0 + y - 1) // 2)
            grosimi.append(max(1, y - y0))
        else:
            y += 1
    if len(centre) < 2:
        return img  # nu gasim liniile - lasam imaginea neschimbata
    gros = max(1, int(np.median(grosimi)))
    # capatul din dreapta al portativului existent
    randuri_linii = np.zeros(h, bool)
    for c in centre:
        randuri_linii[max(0, c - gros):min(h, c + gros + 1)] = True
    cols = np.where(ink[randuri_linii].any(axis=0))[0]
    dreapta = int(cols[-1]) if cols.size else w - 1
    # prelungim cu de ~2 ori latimea actuala (plafonat)
    ext = int(min(2.0 * w, 1600))
    nou = np.full((h, w + ext), 255, dtype=np.uint8)
    nou[:, :w] = img
    for c in centre:
        nou[max(0, c - gros // 2):min(h, c - gros // 2 + gros),
            max(0, dreapta - 2):w + ext - 12] = 0
    # bara finala, de la prima la ultima linie
    nou[centre[0]:centre[-1] + 1, w + ext - 12:w + ext - 8] = 0
    return nou


def pregateste_pentru_omr(png_path, de_albit, out_path, scala=2, margine=40,
                          binarizeaza=False, canvas=False, extinde=False):
    """Pregateste PNG-ul pentru Audiveris: albeste DOAR cuvintele validate
    (etichete/titluri reale), mareste imaginea, adauga margine alba
    (OMR-ul are nevoie de spatiu in jurul portativului) si, optional,
    binarizeaza sau aseaza crop-ul pe o pagina A4 sintetica."""
    if cv2 is None:
        shutil.copyfile(png_path, out_path)
        return
    img = cv2.imread(png_path, cv2.IMREAD_GRAYSCALE)
    if img is None:
        shutil.copyfile(png_path, out_path)
        return
    h, w = img.shape
    for (x0, y0, x1, y1) in de_albit:
        img[max(0, y0 - 2):min(h, y1 + 2), max(0, x0 - 2):min(w, x1 + 2)] = 255
    if extinde:
        img = prelungeste_portativ(img)
        h, w = img.shape
    if scala != 1:
        img = cv2.resize(img, (w * scala, h * scala), interpolation=cv2.INTER_CUBIC)
    if binarizeaza:
        _, img = cv2.threshold(img, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    if canvas:
        # pagina A4 sintetica la ~300 dpi, cu crop-ul asezat sus
        H, W = 3508, 2480
        ih, iw = img.shape
        if ih <= H - 600 and iw <= W - 600:
            pagina = np.full((H, W), 255, dtype=np.uint8)
            ox = max(300, (W - iw) // 2)
            pagina[300:300 + ih, ox:ox + iw] = img
            img = pagina
        else:
            img = cv2.copyMakeBorder(img, 300, 300, 300, 300,
                                     cv2.BORDER_CONSTANT, value=255)
    elif margine > 0:
        img = cv2.copyMakeBorder(img, margine, margine, margine, margine,
                                 cv2.BORDER_CONSTANT, value=255)
    cv2.imwrite(out_path, img)


# ---------------------------------------------------------------------------
# Audiveris -> MusicXML
# ---------------------------------------------------------------------------
def ruleaza_audiveris(audiveris, png_path, out_dir, arata_eroarea=False):
    """Ruleaza Audiveris in batch pe un PNG.

    Intoarce (cale_fisier_sau_None, stare), unde starea e:
      'ok'          - a produs .mxl/.xml
      'fara_muzica' - a rulat cu succes dar nu a gasit muzica
      'esec'        - a crapat (imagine problematica, nu inseamna ca nu
                      e partitura)
    """
    try:
        r = subprocess.run(
            [audiveris, "-batch", "-export", "-output", out_dir, "--", png_path],
            capture_output=True, text=True, timeout=600)
    except FileNotFoundError:
        print(f"  ! Nu gasesc Audiveris la: {audiveris}")
        return None, "esec"
    except subprocess.TimeoutExpired:
        print(f"  ! Audiveris a depasit timpul pe {os.path.basename(png_path)}")
        return None, "esec"
    base = os.path.splitext(os.path.basename(png_path))[0]
    gasite = []
    for rad, _, fisiere in os.walk(out_dir):
        for f in fisiere:
            if f.lower().endswith((".mxl", ".xml", ".musicxml")) and base in f:
                gasite.append(os.path.join(rad, f))
    if not gasite:
        stare = "esec" if r.returncode != 0 else "fara_muzica"
        if arata_eroarea:
            if stare == "esec":
                print(f"  ! Audiveris esuat pe {base} (cod {r.returncode})")
            else:
                print(f"  ! Audiveris nu a gasit muzica in {base}")
            # afisam mesajele UTILE, nu coada de stack trace ("at org...")
            mesaje = ((r.stderr or "") + "\n" + (r.stdout or "")).splitlines()
            utile = [m.strip() for m in mesaje
                     if m.strip() and not m.strip().startswith("at ")
                     and any(k in m for k in ("ERROR", "Exception", "Could not",
                                              "Cannot", "Too ", "No ", "WARN",
                                              "SEVERE", "Invalid", "Failed"))]
            for m in utile[-8:]:
                print(f"      {m[:160]}")
        return None, stare
    # preferam .mxl
    gasite.sort(key=lambda p: (not p.lower().endswith(".mxl"), p))
    return gasite[0], "ok"


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


def citeste_xml_text(cale):
    """Intoarce textul MusicXML dintr-un .xml sau .mxl (dezarhivat)."""
    try:
        if cale.lower().endswith(".mxl"):
            with zipfile.ZipFile(cale, "r") as z:
                nume = z.namelist()
                radacina = None
                if "META-INF/container.xml" in nume:
                    try:
                        cont = ET.fromstring(z.read("META-INF/container.xml"))
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
                if radacina is None:
                    return None
                return z.read(radacina).decode("utf-8", "replace")
        with open(cale, encoding="utf-8", errors="replace") as f:
            return f.read()
    except Exception as e:
        print(f"  (nu pot citi XML-ul {cale}: {e})")
        return None


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
    fara_muzica = set()   # PNG-uri in care Audiveris NU a gasit muzica
                          # (probabil poze/desene, nu partituri)

    print(f"Partituri gasite: {len(pnguri)}")
    for fname in pnguri:
        info = manifest.get(fname, {})
        cuvinte = info.get("cuvinte", [])
        baza = os.path.splitext(fname)[0]

        # clasificam cuvintele INAINTE de OMR: doar cele validate
        # (etichete/titluri reale) au voie sa fie albite in imagine
        lat, inalt = 1000, 200
        if cv2 is not None:
            img0 = cv2.imread(os.path.join(args.imagini, fname),
                              cv2.IMREAD_GRAYSCALE)
            if img0 is not None:
                inalt, lat = img0.shape
        eticheta, titlu, altele, de_albit = clasifica_cuvinte(cuvinte, lat, inalt)

        # 1) conversia cu Audiveris. Daca esueaza, reincercam cu imagine
        #    tot mai mare, margine alba generoasa, binarizare si, la final,
        #    crop-ul asezat pe o pagina A4 sintetica.
        cale_xml = None
        if args.audiveris:
            with tempfile.TemporaryDirectory() as tmp:
                incercari = [
                    dict(scala=args.scala_omr, margine=40, binarizeaza=False),
                    dict(scala=args.scala_omr, margine=100, binarizeaza=False,
                         extinde=True),
                    dict(scala=args.scala_omr * 2, margine=150, binarizeaza=False),
                    dict(scala=args.scala_omr, margine=0, binarizeaza=True,
                         canvas=True, extinde=True),
                ]
                produs, stare = None, "esec"
                for k, conf in enumerate(incercari):
                    png_curat = os.path.join(tmp, baza + ".png")
                    pregateste_pentru_omr(os.path.join(args.imagini, fname),
                                          de_albit, png_curat, **conf)
                    produs, stare = ruleaza_audiveris(
                        args.audiveris, png_curat, tmp,
                        arata_eroarea=(k == len(incercari) - 1))
                    if produs:
                        if k > 0:
                            extra = []
                            if conf.get("extinde"):
                                extra.append("portativ prelungit")
                            if conf.get("canvas"):
                                extra.append("pagina A4")
                            if conf.get("binarizeaza"):
                                extra.append("binarizat")
                            print(f"  {baza}: a mers la incercarea {k + 1} "
                                  f"(scara {conf['scala']}x"
                                  f"{', ' + ', '.join(extra) if extra else ''})")
                        break
                if produs:
                    ext = os.path.splitext(produs)[1].lower()
                    cale_xml = os.path.join(args.scores_dir, baza + ext)
                    shutil.copyfile(produs, cale_xml)
                elif stare == "fara_muzica":
                    # Audiveris a rulat OK dar nu a gasit muzica -> probabil
                    # NU e partitura (poza/desen detectat gresit).
                    fara_muzica.add(fname)
                # daca a crapat ('esec'), ramane partitura cu PNG, fara XML
        else:
            for ext in (".mxl", ".xml", ".musicxml"):
                c = os.path.join(args.scores_dir, baza + ext)
                if os.path.isfile(c):
                    cale_xml = c
                    break

        # 2) injectam cuvintele descriptive in XML, la locul corect
        if cale_xml:
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
        eticheta = "IMAGINE (Audiveris nu a gasit muzica - probabil nu e partitura)" \
            if fname in fara_muzica else "SCORE"
        m = f"[{eticheta}: {args.imagini}/{fname}"
        if xml:
            m += f" | XML: {xml.replace(os.sep, '/')}"
        if cuvinte:
            m += f" | CUVINTE: {', '.join(cuvinte)}"
        m += "]"
        # XML-ul e incorporat direct in carte, ca sa poata fi citit dintr-un
        # singur fisier (text + muzica masina-lizibila, fara fisiere externe)
        if xml:
            continut = citeste_xml_text(xml)
            if continut:
                m += "\n\n```xml\n" + continut.strip() + "\n```"
        return m

    def in_zona(bx0, by0, bx1, by1, zone, marja=4.0):
        """Centrul blocului de text cade in zona unei partituri REALE?
        (zonele imaginilor fara muzica nu inghit textul din jur)"""
        cx, cy = 0.5 * (bx0 + bx1), 0.5 * (by0 + by1)
        for (z, fname, _) in zone:
            if fname in fara_muzica:
                continue
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
