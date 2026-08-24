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
          CUVINTE: Vln [instrument], Allegro [tempo]]
  4. DICTONARUL de terminologie muzicala (dictionar_muzica.json, langa
     script): WHITELIST NE-DISTRUCTIVA. Un cuvant recunoscut in dictionar
     (tempo, dinamica, tehnici de chitara, acorduri, instrumente, notatie,
     structura...) e sigur TEXT, nu muzica citita gresit de OCR, deci:
       - poate fi alb in deplina siguranta DOAR in copia pentru OMR
         (nu si in PNG-urile finale, care raman mereu nemodificate);
       - primeste eticheta [categorie] in marcatorul din book.md.
     Cuvintele NECUNOSCUTE nu se ating niciodata - un dictionar incomplet
     nu poate strica examinarea, cel mult nu o imbunatateste.

Folosire (din folderul parental, dupa extract_partituri.py):
    python package-book.py "carte.pdf"
    python package-book.py "carte.pdf" --audiveris "C:\\Program Files\\Audiveris\\Audiveris.exe"
    python package-book.py "carte.pdf" --imagini imagini_partituri --scores-dir partituri_xml

Oprirea, reluarea si jurnalul (utile la cartile mari):
    * OMR IN LOTURI (automat, --omr-lot 20): partiturile eligibile se
      convertesc in loturi - o SINGURA lansare Audiveris pentru mai multe
      PNG-uri (lista data prin '@fisier', suportat nativ de Audiveris),
      pentru ca fiecare lansare plateste 30-60s de pornire JVM + modele.
      Partiturile rateate la lot trec individual prin incercarile 2-4.
      --omr-lot 1 = vechiul comportament (cate o lansare pe partitura).
      NOTA: Audiveris nu foloseste GPU (vine doar cu motorul CPU) - asta
      e calea reala de accelerare.
    * OPRIRE controlata, oricand, din alt PowerShell deschis in ACELASI
      folder (folderul parental), cu comanda:
          New-Item STOP -ItemType File
      Scriptul termina partitura din curs, isi salveaza progresul si se
      opreste (fisierul STOP e consumat - nu trebuie sters de tine).
      Merge si Ctrl+C in fereastra scriptului.
    * RELUARE dupa oprire, pana de curent sau restart neasteptat al PC-ului:
      ruleaza DIN NOU aceeasi comanda - scriptul sare singur peste
      partiturile deja convertite si continua cu cele ramase. Punctul de
      control este partitura: fiecare PNG convertit (sau macar incercat)
      e consemnat in "stare_package_book.json", scris atomic.
    * DE LA CAPAT (ignora progresul salvat): adauga  --de-la-inceput
    * JURNAL: tot ce apare in terminal se scrie treptat (cu flush) si in
      "jurnal_package_book.log", in folderul parental. Fiecare rulare isi
      pune un antet cu data si ora, deci jurnalul aduna istoricul complet
      al rularilor (inclusiv unde s-a oprit si de unde a reluat).

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
from datetime import datetime

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
# OMR in loturi: o singura lansare Audiveris pentru mai multe partituri
# ---------------------------------------------------------------------------
def _xml_existenta(scores_dir, baza):
    """Calea unui MusicXML deja existent pt. `baza`, sau None."""
    for ext in (".mxl", ".xml", ".musicxml"):
        c = os.path.join(scores_dir, baza + ext)
        if os.path.isfile(c):
            return c
    return None


def conversie_omr_in_loturi(args, manifest, pnguri, terminate):
    """Conversia OMR 'in loturi': pregateste copia curata standard
    (configuratia 1) pentru mai multe partituri si le da intr- O SINGURA
    lansare Audiveris. Fiecare lansare Audiveris plateste pornirea JVM si
    incarcarea modelelor (30-60s); la sute de partituri asta inseamna ore
    intregi - de aceea loturile sunt automat, NU prin GPU (Audiveris vine
    doar cu motorul CPU).

    Lista PNG-urilor se da prin '@fisier' (o cale pe linie) - suportat
    nativ de Audiveris si ferit de limita de lungime a comenzii Windows.

    Intoarce (xml_din_lot, lot_incercate):
      xml_din_lot   = {fname: cale_xml} pt. partiturile convertite aici;
      lot_incercate = partiturile trecute prin incercarea 1 in lot, fara
                      rezultat - scara individuala va porni de la
                      incercarea 2, nu de la 1.
    """
    if not (os.path.isfile(args.audiveris) or shutil.which(args.audiveris)):
        print(f"  (loturi OMR: nu gasesc {args.audiveris} - conversia merge pe rand)")
        return {}, set()
    os.makedirs(args.scores_dir, exist_ok=True)
    eligibile = []
    for fname in pnguri:
        if fname in terminate:
            continue
        info = manifest.get(fname, {})
        if tip_din_nume(fname, info) not in ("portativ", "pereche"):
            continue
        baza = os.path.splitext(fname)[0]
        if _xml_existenta(args.scores_dir, baza):
            continue    # are deja XML (ex. dintr-o rulare anterioara)
        eligibile.append(fname)
    if not eligibile:
        return {}, set()
    n_loturi = (len(eligibile) + args.omr_lot - 1) // args.omr_lot
    print(f"OMR in loturi: {len(eligibile)} partituri, loturi de cate "
          f"{args.omr_lot} -> {n_loturi} lansari Audiveris "
          f"(in loc de {len(eligibile)}).")
    conf1 = dict(scala=args.scala_omr, margine=40, binarizeaza=False)
    xml_din_lot, incercate = {}, set()
    for idx_lot in range(n_loturi):
        verifica_oprire()
        bucata = eligibile[idx_lot * args.omr_lot:(idx_lot + 1) * args.omr_lot]
        with tempfile.TemporaryDirectory() as tmp:
            pregatite = {}   # baza -> fname
            list_file = os.path.join(tmp, "lot.txt")
            with open(list_file, "w", encoding="utf-8") as lf:
                for fname in bucata:
                    info = manifest.get(fname, {})
                    baza = os.path.splitext(fname)[0]
                    decupaj = None
                    if (tip_din_nume(fname, info) == "pereche"
                            and info.get("sub_zone")):
                        decupaj = info["sub_zone"].get("portativ")
                    # albirea cuvintelor validate: identica cu scara individuala
                    lat, inalt = 1000, 200
                    if cv2 is not None:
                        img0 = cv2.imread(os.path.join(args.imagini, fname),
                                          cv2.IMREAD_GRAYSCALE)
                        if img0 is not None:
                            inalt, lat = img0.shape
                    _, _, _, de_albit, _ = clasifica_cuvinte(
                        info.get("cuvinte", []), lat, inalt)
                    png_curat = os.path.join(tmp, baza + ".png")
                    pregateste_pentru_omr(os.path.join(args.imagini, fname),
                                          de_albit, png_curat,
                                          decupaj=decupaj, **conf1)
                    pregatite[baza] = fname
                    lf.write(png_curat + "\n")
            try:
                r = subprocess.run(
                    [args.audiveris, "-batch", "-export", "-output", tmp,
                     "--", "@" + list_file],
                    capture_output=True, text=True,
                    timeout=min(14400, 300 * len(bucata) + 600))
            except subprocess.TimeoutExpired:
                print(f"  lotul {idx_lot + 1}/{n_loturi}: timp depasit - "
                      f"partiturile lui merg pe rand, cu scara completa "
                      f"de incercari")
                continue
            # adunam produsele dupa numele de baza (preferam .mxl)
            produse = {}
            for rad, _, fisiere in os.walk(tmp):
                for fis in fisiere:
                    if fis.lower().endswith((".mxl", ".xml", ".musicxml")):
                        baza_fis = os.path.splitext(fis)[0]
                        cale_fis = os.path.join(rad, fis)
                        if (baza_fis not in produse
                                or cale_fis.lower().endswith(".mxl")):
                            produse[baza_fis] = cale_fis
            convertite = 0
            for baza, fname in pregatite.items():
                if baza in produse:
                    ext = os.path.splitext(produse[baza])[1].lower()
                    cale = os.path.join(args.scores_dir, baza + ext)
                    shutil.copyfile(produse[baza], cale)
                    xml_din_lot[fname] = cale
                    convertite += 1
                else:
                    incercate.add(fname)
            print(f"  lotul {idx_lot + 1}/{n_loturi}: {convertite}/{len(bucata)} "
                  f"convertite intr-o singura lansare"
                  + ("" if r.returncode == 0 else f" (cod de iesire {r.returncode})"))
    return xml_din_lot, incercate


# ---------------------------------------------------------------------------
# Oprirea controlata + reluarea de unde a ramas + jurnalul din folderul parental
# ---------------------------------------------------------------------------
FISIER_STOP = "STOP"                       # comanda de oprire: creeaza fisierul STOP
FISIER_STARE = "stare_package_book.json"   # starea reluarii (pe partituri)
FISIER_JURNAL = "jurnal_package_book.log"


class OpritDeUser(Exception):
    """Ridicat cand userul cere oprirea (fisierul STOP)."""


class Jurnal:
    """Dubleaza iesirea: tot ce apare in terminal se scrie treptat si in
    fisierul de log din folderul parental (cu flush la fiecare rand, ca
    o pana de curent sa nu piarda ultimele actiuni)."""

    def __init__(self, cale):
        self._f = open(cale, "a", encoding="utf-8")
        self._consola = sys.stdout
        sys.stdout = self

    def write(self, text):
        self._consola.write(text)
        self._f.write(text)
        self._f.flush()

    def flush(self):
        self._consola.flush()
        self._f.flush()

    def inchide(self):
        sys.stdout = self._consola
        self._f.close()


def oprire_ceruta():
    """True o singura data daca exista fisierul STOP (apoi il stergem, ca
    reluarea sa nu se opreasca imediat la pornire)."""
    if not os.path.isfile(FISIER_STOP):
        return False
    try:
        os.remove(FISIER_STOP)
    except OSError:
        pass
    return True


def verifica_oprire():
    """Punct de control al opririi: chemat inainte de fiecare partitura.
    Daca oprirea e ceruta, ridica OpritDeUser - starea e deja salvata pe
    disc pentru toate partiturile terminate, deci oprirea nu pierde nimic."""
    if oprire_ceruta():
        raise OpritDeUser("gasit fisierul STOP in folder")


def amprenta(cale):
    """Identitatea unui fisier (cale + marime + data modificarilor) - daca
    PDF-ul se schimba, starea veche de reluare nu mai e valabila."""
    st = os.stat(cale)
    return {"cale": os.path.abspath(cale), "octeti": st.st_size,
            "modificat": int(st.st_mtime)}


def incarca_stare(args):
    """Starea reluarii, daca exista si inca se potriveste cu PDF-ul si cu
    folderele de intrare/iesire; altfel None (pornire de la capat)."""
    if not os.path.isfile(FISIER_STARE):
        return None
    try:
        with open(FISIER_STARE, encoding="utf-8") as f:
            stare = json.load(f)
    except Exception:
        return None
    if stare.get("versiune") != 1:
        return None
    if stare.get("pdf") != amprenta(args.pdf):
        return None
    if (stare.get("imagini") != os.path.abspath(args.imagini)
            or stare.get("scores_dir") != os.path.abspath(args.scores_dir)
            or stare.get("date_dir") != os.path.abspath(args.date_dir)):
        return None
    if stare.get("audiveris") != args.audiveris:
        print("(atentie: --audiveris difera fata de rularea anterioara - "
              "partiturile ramase se convertesc cu setarea noua)")
    return stare


def salveaza_stare(stare):
    """Scrie starea reluarii atomic (tmp + rename): o pana de curent in
    timpul scrierii nu corupe starea de la punctul de control anterior."""
    tmp = FISIER_STARE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(stare, f, ensure_ascii=False)
    os.replace(tmp, FISIER_STARE)


# ---------------------------------------------------------------------------
# dictionarul de terminologie muzicala (whitelist ne-distructiva)
# ---------------------------------------------------------------------------
FISIER_DICT_DEFAULT = "dictionar_muzica.json"

# tipare fara dictionar: recunosc SIMBOLURI, nu cuvinte (merg mereu)
RE_ACORD = re.compile(
    r"^[A-G][#b]?(?:m|maj|ma|mi|min|dim|aug|sus|add|alt|\+|o|-)?\d{0,2}"
    r"(?:[#b]\d{0,2})?(?:\([^)]*\))?(?:\s*/\s*[A-G][#b]?)?$", re.I)
RE_ROMAN = re.compile(
    r"^[#b]?(?:v?i{1,3}|iv|v|vi{1,3}|ix|x|xi)(?:[#b+°]?\d{0,2})?$", re.I)
RE_MASURA = re.compile(r"^\d{1,2}\s*/\s*\d{1,2}(?:\s*/\s*\d{1,2})?$")
RE_POZITIE = re.compile(
    r"^\d{1,2}\s*(?:fr|th|st|nd|rd|x)\s*(?:pos(?:ition)?|fret?s?)?$", re.I)

_DICTAR = None   # cache: {"seturi": {categorie: set()}, "abrevieri": {...}}


def _norm_dict(t):
    """Normalizare pt. dictionar: litere mici, fara diacritice/punctuatie
    (pastram # b - / ~ si cifrele - intra in acorduri/tablaturi)."""
    t = t.lower().replace("–", "-").replace("—", "-")
    t = re.sub(r"[^a-z0-9#\-/()~ ]", "", t)
    return re.sub(r"\s+", " ", t).strip()


def incarca_dictionar(cale=None):
    """Incarca dictionarul (explicit > langa script > in folderul curent).
    Intoarce numarul total de termeni (0 daca nu exista - atunci merg doar
    tiparele interne: acorduri, numerale romane, masuri, pozitii)."""
    global _DICTAR
    candidati = ([cale] if cale else
                 [os.path.join(os.path.dirname(os.path.abspath(__file__)),
                               FISIER_DICT_DEFAULT),
                  FISIER_DICT_DEFAULT])
    seturi, abrevieri = {}, {}
    gasit = None
    for c in candidati:
        if c and os.path.isfile(c):
            gasit = c
            break
    if gasit is not None:
        try:
            with open(gasit, encoding="utf-8") as f:
                date = json.load(f)
            for cheie, val in date.items():
                if cheie.startswith("_"):
                    continue
                if isinstance(val, list):
                    seturi[cheie] = {_norm_dict(v) for v in val
                                     if isinstance(v, str) and _norm_dict(v)}
                elif isinstance(val, dict):
                    abrevieri.update({_norm_dict(k): v
                                      for k, v in val.items()})
        except Exception as e:
            print(f"(atentie: nu pot citi dictionarul {gasit}: {e} - "
                  f"merge doar cu tiparele interne)")
    elif cale:
        print(f"(atentie: nu gasesc dictionarul {cale} - merge doar cu "
              f"tiparele interne)")
    _DICTAR = {"seturi": seturi, "abrevieri": abrevieri}
    return sum(len(s) for s in seturi.values()) + len(abrevieri)


def _levenshtein(a, b):
    """Distanta Levenshtein (DP pe 2 randuri) - tolereaza greselile OCR."""
    if a == b:
        return 0
    if len(a) < len(b):
        a, b = b, a
    precedent = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        curent = [i]
        for j, cb in enumerate(b, 1):
            curent.append(min(precedent[j] + 1, curent[j - 1] + 1,
                              precedent[j - 1] + (ca != cb)))
        precedent = curent
    return precedent[-1]


def potrivire_dictionar(text):
    """Intoarce categoria din dictionar pentru `text` (sau None).

    Ordinea: tipare simbolice (acord, numeral roman, masura, pozitie),
    apoi potrivire exacta in sete, apoi abrevierile de instrumente, apoi
    potrivire fuzzy (toleranta OCR: 1 litera la cuvinte >=5, 2 la >=9).
    Un cuvant nerecunoscut intoarce None - si NU i se intampla nimic.
    """
    if _DICTAR is None:
        incarca_dictionar()
    t = _norm_dict(text)
    if not t:
        return None
    if RE_MASURA.match(t):
        return "masura"
    if RE_ACORD.match(t):
        return "acord"
    if RE_ROMAN.match(t):
        return "grad"          # numeral roman: I, IV, V7, bVII...
    if RE_POZITIE.match(t):
        return "pozitie"       # 5fr, 7th, 12th position...
    if t in _DICTAR["abrevieri"]:
        return "instrument"
    for categorie, multime in _DICTAR["seturi"].items():
        if t in multime:
            return categorie
    # fuzzy: doar cuvinte simple, suficient de lungi (sa nu aprindem
    # potriviri absurde pe 2-3 litere)
    cuvinte = t.replace("-", " ").split()
    if len(cuvinte) == 1 and len(t) >= 5:
        prag = 2 if len(t) >= 9 else 1
        for categorie, multime in _DICTAR["seturi"].items():
            for termen in multime:
                if (abs(len(termen) - len(t)) <= prag
                        and _levenshtein(t, termen) <= prag):
                    return categorie
    return None


# ---------------------------------------------------------------------------
# numele fisierelor: partitura-p3-A.png / partitura-p7.png / partitura-p22-23-A.png
# ---------------------------------------------------------------------------
RE_NUME = re.compile(
    r"^(partitura-tab|partitura|tablatura|diagrama)-p(\d+)(?:-(\d+))?"
    r"(?:-([A-Z]+))?\.png$", re.I)


def pagina_din_nume(fname):
    m = RE_NUME.match(fname)
    if not m:
        return None
    return int(m.group(2))  # apare prima data pe aceasta pagina


def tip_din_nume(fname, manifest_info=None):
    """Tipul detectiei: din manifest daca exista, altfel din prefixul
    numelui: partitura / tablatura / pereche (partitura-tab) / diagrama."""
    if manifest_info and manifest_info.get("tip"):
        return manifest_info["tip"]
    m = RE_NUME.match(fname)
    pref = (m.group(1).lower() if m else "partitura")
    return {"partitura": "portativ", "tablatura": "tablatura",
            "partitura-tab": "pereche", "diagrama": "diagrama"}[pref]


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

    Intoarce si `recunoscute`: [(text, categorie)] pt. cuvintele recunoscute
    in DICTONARUL de terminologie - un cuvant din dictionar e sigur TEXT
    (nu notatie citita gresit), deci bbox-ul lui intra si el in `de_albit`
    (albit doar in copia pt. OMR, niciodata in PNG-ul final).
    """
    eticheta, titlu, altele, de_albit = None, None, [], []
    recunoscute = []
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
        # DICTONARUL de terminologie: recunoscut -> sigur text (tempo,
        # tehnica, acord, dinamica...) -> albim copia pt. OMR si etichetam;
        # merge si pe gunoiul OCR care ascunde un termen (ex. "A!legro")
        categorie = potrivire_dictionar(brut)
        if categorie:
            recunoscute.append((text, categorie))
            if c["bbox"] not in de_albit:
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
    return eticheta, titlu, altele, de_albit, recunoscute


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
                          binarizeaza=False, canvas=False, extinde=False,
                          decupaj=None):
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
    if decupaj:
        # perechi portativ+TAB: la Audiveris merge DOAR partea de portativ;
        # si bbox-urile cuvintelor de albitt trebuie mutate in coordonatele
        # decupajului (pana acum se aplicau cu offset gresit)
        dx0, dy0, dx1, dy1 = [int(v) for v in decupaj]
        img = img[max(0, dy0):min(img.shape[0], dy1),
                  max(0, dx0):min(img.shape[1], dx1)].copy()
        de_albit = [(x0 - dx0, y0 - dy0, x1 - dx0, y1 - dy0)
                    for (x0, y0, x1, y1) in de_albit]
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
        # nu duplicam creditele daca injectarea ruleaza a doua oara
        existente = {cw.text for cw in root.iter("credit-words")}
        if text in existente:
            continue
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
        try:
            with zipfile.ZipFile(cale, "r") as z:
                nume = z.namelist()
                continut = {n: z.read(n) for n in nume}
        except Exception as e:
            # .mxl corupt (ex. scris pe jumatate la o pana de curent) -
            # nu oprim cartea din cauza lui; XML-ul ramane neinjectat
            print(f"  (nu pot deschide arhiva {os.path.basename(cale)}: {e} - "
                  f"cuvintele nu se injecteaza in el)")
            return False
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
# convertorul de DIAGRAME de acorduri (geometric, merge si pe scanuri)
# ---------------------------------------------------------------------------
def _benzi_centre(bool_vec):
    """Centrele seriilor continue de True (pozitiile liniilor)."""
    centre = []
    activ = False
    start = 0
    for k, v in enumerate(bool_vec):
        if v and not activ:
            start = k
        if not v and activ:
            centre.append((start + k - 1) / 2.0)
        activ = bool(v)
    if activ:
        centre.append((start + len(bool_vec) - 1) / 2.0)
    return centre


def analizeaza_diagrama(png_path, cuvinte=None):
    """Citeste GEOMETRIC o diagrama de acorduri: corzile (linii verticale),
    tastele (linii orizontale) si punctele negre din grila.

    Intoarce dict: corzi, taste, offset_taste (din texte gen '5fr'/'7th'),
    puncte = [[coarda, tasta], ...] (coarda 1 = cea din stanga grilei),
    voicing = lista per coarda (tasta sau null) daca e diagrama de acord
    (cel mult un punct pe coarda). Merge si pe scanuri - nu cere OCR."""
    if cv2 is None:
        return None
    img = cv2.imread(png_path, cv2.IMREAD_GRAYSCALE)
    if img is None:
        return None
    binar = (img < 208).astype(np.uint8)
    n, lab, stats, _ = cv2.connectedComponentsWithStats(binar, 8)
    best = None
    for i in range(1, n):
        x, y, w2, h2, aria = stats[i]
        if w2 < 25 or h2 < 25:
            continue
        sub = (lab[y:y + h2, x:x + w2] == i)
        col = sub.sum(axis=0) / float(h2)
        rnd = sub.sum(axis=1) / float(w2)
        cx = _benzi_centre(col >= 0.5)
        cy = _benzi_centre(rnd >= 0.5)
        if len(cx) >= 4 and len(cy) >= 3 and (best is None or aria > best[0]):
            best = (aria, x, y, cx, cy)
    if best is None:
        return None
    _, gx, gy, corzi_x, taste_y = best
    corzi_x = [gx + v for v in corzi_x]
    taste_y = [gy + v for v in taste_y]

    def _serie_uniforma(vals):
        """Pastreaza cea mai lunga serie de linii cu distante uniforme
        (daca doua grile vecine au ajuns in acelasi crop, le despartim)."""
        if len(vals) < 3:
            return vals
        d = np.diff(vals)
        med = float(np.median(d))
        start = cel_start = 0
        cel_lung = 1
        for k, dv in enumerate(d):
            if dv > 1.8 * med:
                if k + 1 - start > cel_lung:
                    cel_start, cel_lung = start, k + 1 - start
                start = k + 1
        if len(vals) - start > cel_lung:
            cel_start, cel_lung = start, len(vals) - start
        return vals[cel_start:cel_start + cel_lung]

    corzi_x = _serie_uniforma(corzi_x)
    taste_y = _serie_uniforma(taste_y)
    if len(corzi_x) < 4 or len(taste_y) < 3:
        return None
    dx = float(np.median(np.diff(corzi_x)))
    dy = float(np.median(np.diff(taste_y)))

    # punctele: (1) deschidere cu disc -> punctele PLINE raman, liniile
    # dispar; (2) inchidere + deschidere -> si INELELE numerotate (1,2,3)
    # devin discuri pline si sunt prinse
    r = max(2, int(0.22 * min(dx, dy)))
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r + 1, 2 * r + 1))
    pline = cv2.morphologyEx(binar, cv2.MORPH_OPEN, kernel)
    inchis = cv2.morphologyEx(binar, cv2.MORPH_CLOSE, kernel)
    inele = cv2.morphologyEx(inchis, cv2.MORPH_OPEN, kernel)
    doar_puncte = cv2.bitwise_or(pline, inele)
    nd, _, statd, centd = cv2.connectedComponentsWithStats(doar_puncte, 8)
    puncte = set()
    for j in range(1, nd):
        aria_d = statd[j][4]
        pcx, pcy = centd[j]
        if aria_d < 2.0 * r * r:
            continue
        if statd[j][2] > 1.6 * dx or statd[j][3] > 1.6 * dy:
            continue  # blob prea mare - probabil text/junctiuni, nu punct
        if not (corzi_x[0] - dx * 0.35 <= pcx <= corzi_x[-1] + dx * 0.35):
            continue  # in afara corzilor (cifrele de taste din margine)
        if pcy < taste_y[0] - 0.3 * dy or pcy > taste_y[-1] + 0.3 * dy:
            continue  # marcaje deasupra/sub grila, nu puncte de tasta
        coarda = int(np.argmin([abs(pcx - v) for v in corzi_x])) + 1
        k = int(np.searchsorted(taste_y, pcy))
        tasta = max(1, min(len(taste_y) - 1, k))
        puncte.add((coarda, tasta))
    puncte = sorted(puncte)

    # offset-ul tastelor, din textele atasate ("5fr", "7th", "12")
    offset = 1
    for c in (cuvinte or []):
        t = c["text"].strip().lower().rstrip(".")
        mm = re.match(r"^(\d{1,2})\s*(?:fr|th|st|nd|rd)?$", t)
        if mm and 1 <= int(mm.group(1)) <= 24:
            offset = int(mm.group(1))
            break

    rezultat = {
        "corzi": len(corzi_x),
        "taste": len(taste_y) - 1,
        "offset_taste": offset,
        "puncte": [list(p) for p in puncte],
    }
    # voicing de ACORD doar daca fiecare coarda are cel mult un punct
    pe_coarda = {}
    for (c, t) in puncte:
        pe_coarda.setdefault(c, []).append(t)
    if puncte and all(len(v) == 1 for v in pe_coarda.values()):
        rezultat["voicing"] = [
            (pe_coarda[c][0] + offset - 1) if c in pe_coarda else None
            for c in range(1, len(corzi_x) + 1)]
    return rezultat


# ---------------------------------------------------------------------------
# convertorul de TABLATURI -> MusicXML (coarda + tasta -> nota)
# ---------------------------------------------------------------------------
ACORDAJ_STANDARD = [64, 59, 55, 50, 45, 40]   # MIDI: E4 B3 G3 D3 A2 E2
NOTE_NUME = [("C", 0), ("C", 1), ("D", 0), ("D", 1), ("E", 0), ("F", 0),
             ("F", 1), ("G", 0), ("G", 1), ("A", 0), ("A", 1), ("B", 0)]


def linii_tab_din_crop(img):
    """Centrele celor 6 linii ale tablaturii (pixeli), din proiectia pe
    randuri a crop-ului, plus intinderea orizontala [x0, x1] a TABULUI
    CENTRAL: daca la marginile crop-ului au intrat bucati TRUNCHIATE din
    tablaturile vecine, pastram doar segmentul continuu de linii care
    trece prin centrul imaginii - cifrele vecinilor nu devin note false."""
    h, w = img.shape
    ink2d = img < 208
    ink = ink2d.sum(axis=1)
    este = ink >= 0.5 * w
    centre = []
    y = 0
    while y < h:
        if este[y]:
            y0 = y
            while y < h and este[y]:
                y += 1
            centre.append((y0 + y - 1) / 2.0)
        else:
            y += 1
    if not centre:
        return centre, (0, w)

    # intinderea orizontala: coloanele in care randurile-linie au cerneala
    randuri_linie = np.zeros(h, bool)
    for c in centre:
        randuri_linie[max(0, int(c) - 1):min(h, int(c) + 2)] = True
    col_are_linie = ink2d[randuri_linie].any(axis=0)
    # segmentul continuu (cu goluri mici <= 8px ignorate) ce contine centrul
    mijloc = w // 2
    x0 = mijloc
    gol = 0
    while x0 > 0:
        if col_are_linie[x0 - 1]:
            gol = 0
        else:
            gol += 1
            if gol > 8:
                x0 += gol - 1
                break
        x0 -= 1
    x1 = mijloc
    gol = 0
    while x1 < w - 1:
        if col_are_linie[x1 + 1]:
            gol = 0
        else:
            gol += 1
            if gol > 8:
                x1 -= gol - 1
                break
        x1 += 1
    return centre, (max(0, x0), min(w, x1 + 1))


def cifre_cu_tesseract(img, tesseract_cmd=None):
    """Citeste cifrele din imaginea TAB cu pytesseract (optional).
    Intoarce [(text, cx, cy)] sau None daca OCR-ul nu e disponibil."""
    try:
        import pytesseract
        if tesseract_cmd:
            pytesseract.pytesseract.tesseract_cmd = tesseract_cmd
        mare = cv2.resize(img, (img.shape[1] * 2, img.shape[0] * 2),
                          interpolation=cv2.INTER_CUBIC)
        date = pytesseract.image_to_data(
            mare, config="--psm 6 -c tessedit_char_whitelist=0123456789",
            output_type=pytesseract.Output.DICT)
    except Exception:
        return None
    rezultat = []
    for k, txt in enumerate(date["text"]):
        t = txt.strip()
        if t.isdigit() and 0 <= int(t) <= 24 and int(date["conf"][k]) > 40:
            cx = (date["left"][k] + date["width"][k] / 2.0) / 2.0
            cy = (date["top"][k] + date["height"][k] / 2.0) / 2.0
            rezultat.append((t, cx, cy))
    return rezultat


def converteste_tablatura(doc, info, png_path, tesseract_cmd=None):
    """TAB -> lista de note {coarda, tasta, pitch_midi, x}. Cifrele vin din
    stratul text al PDF-ului (cartile digitale) sau, daca lipseste, din
    pytesseract (daca e instalat). Intoarce (note, sursa) sau (None, motiv)."""
    if cv2 is None:
        return None, "lipseste opencv"
    img = cv2.imread(png_path, cv2.IMREAD_GRAYSCALE)
    if img is None:
        return None, "nu pot citi PNG-ul"
    sub = info.get("sub_zone")
    if sub and sub.get("tab"):
        x0, y0, x1, y1 = [int(v) for v in sub["tab"]]
        img = img[max(0, y0):min(img.shape[0], y1),
                  max(0, x0):min(img.shape[1], x1)]
        decalaj_y = y0
    else:
        decalaj_y = 0
    linii, (tab_x0, tab_x1) = linii_tab_din_crop(img)
    if len(linii) < 4:
        return None, "nu gasesc liniile tablaturii"

    cifre = []
    zona = (info.get("zone_pdf") or [{}])[0]
    bbox_pt = zona.get("bbox_pt")
    if bbox_pt and doc is not None:
        # cartile digitale au cifrele in stratul de text al PDF-ului
        pag = doc[zona["pagina"] - 1]
        px_per_pt_x = img.shape[1] / max(1.0, (bbox_pt[2] - bbox_pt[0]))
        px_per_pt_y = (img.shape[0] + decalaj_y) / max(1.0, (bbox_pt[3] - bbox_pt[1]))
        for wd in pag.get_text("words"):
            t = wd[4].strip()
            if not (t.isdigit() and 0 <= int(t) <= 24):
                continue
            cx = ((wd[0] + wd[2]) / 2.0 - bbox_pt[0]) * px_per_pt_x
            cy = ((wd[1] + wd[3]) / 2.0 - bbox_pt[1]) * px_per_pt_y - decalaj_y
            if 0 <= cy <= img.shape[0]:
                cifre.append((t, cx, cy))
    if not cifre:
        cifre = cifre_cu_tesseract(img, tesseract_cmd)
        if cifre is None:
            return None, ("cifrele nu sunt in stratul text; instaleaza "
                          "Tesseract + pytesseract pentru OCR")
    if not cifre:
        return None, "nicio cifra gasita in zona TAB"

    interl = float(np.median(np.diff(linii))) if len(linii) > 1 else 10.0
    note = []
    for (t, cx, cy) in cifre:
        if not (tab_x0 - interl <= cx <= tab_x1 + interl):
            continue  # cifra unui TAB vecin, trunchiat la marginea imaginii
        idx = int(np.argmin([abs(cy - ly) for ly in linii]))
        if abs(cy - linii[idx]) > 0.75 * interl:
            continue  # cifra prea departe de orice coarda (alt text)
        coarda = idx + 1                      # linia de sus = coarda 1 (mi acut)
        tasta = int(t)
        if coarda <= len(ACORDAJ_STANDARD):
            note.append({"coarda": coarda, "tasta": tasta,
                         "pitch_midi": ACORDAJ_STANDARD[coarda - 1] + tasta,
                         "x": round(float(cx), 1)})
    note.sort(key=lambda nn: (nn["x"], nn["coarda"]))
    return (note, "text-pdf" if bbox_pt else "ocr") if note else (None, "fara note")


def tab_spre_musicxml(note, eticheta=None, titlu=None):
    """Construieste MusicXML din notele de tablatura. Cifrele aflate la
    aceeasi pozitie X devin ACORD (canta impreuna). Duratele sunt egale
    (ritmul exact ramane in sarcina portativului-pereche, daca exista)."""
    grupuri = []
    for nn in note:
        if grupuri and abs(nn["x"] - grupuri[-1][0]["x"]) < 12:
            grupuri[-1].append(nn)
        else:
            grupuri.append([nn])
    linii_xml = ['<?xml version="1.0" encoding="UTF-8"?>',
                 '<score-partwise version="3.1">']
    if titlu:
        linii_xml.append(f"  <movement-title>{titlu}</movement-title>")
    linii_xml += ['  <identification><encoding><software>'
                  'extract_partituri/package-book TAB reader</software>'
                  '</encoding></identification>',
                  '  <credit page="1"><credit-words>Ritmul este aproximativ: '
                  'duratele reale se iau din portativul-pereche daca exista.'
                  '</credit-words></credit>',
                  '  <part-list><score-part id="P1">'
                  f"<part-name>{eticheta or 'Guitar (TAB)'}</part-name>"
                  '</score-part></part-list>',
                  '  <part id="P1"><measure number="1">',
                  '    <attributes><divisions>1</divisions>'
                  '<clef><sign>TAB</sign><line>5</line></clef>'
                  '<staff-details><staff-lines>6</staff-lines></staff-details>'
                  '</attributes>']
    for grup in grupuri:
        for k, nn in enumerate(grup):
            midi = nn["pitch_midi"]
            step, alter = NOTE_NUME[midi % 12]
            octava = midi // 12 - 1
            linii_xml.append("    <note>" + ("<chord/>" if k else ""))
            linii_xml.append(f"      <pitch><step>{step}</step>"
                             + (f"<alter>{alter}</alter>" if alter else "")
                             + f"<octave>{octava}</octave></pitch>")
            linii_xml.append("      <duration>1</duration><type>quarter</type>")
            linii_xml.append("      <notations><technical>"
                             f"<string>{nn['coarda']}</string>"
                             f"<fret>{nn['tasta']}</fret>"
                             "</technical></notations>")
            linii_xml.append("    </note>")
    linii_xml += ["  </measure></part>", "</score-partwise>"]
    return "\n".join(linii_xml)


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


# ===========================================================================
# main
# ===========================================================================
def ruleaza(args):
    """O rulare completa (sau continuata, daca exista starea reluarii)."""
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

    # dictionarul de terminologie: whitelist ne-distructiva (cuvintele
    # recunoscute se albesc doar in copia pt. OMR si primesc [categorie];
    # cele necunoscute raman neatrase - un dictionar incomplet nu strica)
    n_termeni = incarca_dictionar(args.dictionar)
    if n_termeni:
        print(f"Dictionar de terminologie muzicala: {n_termeni} termeni "
              f"(potrivirile se albesc sigur in copia pt. OMR si se "
              f"eticheteaza in carte; necunoscutul ramane neatins).")
    else:
        print("Dictionarul de terminologie lipseste - active doar tiparele "
              "interne (acorduri, numerale, masuri, pozitii).")

    if args.de_la_inceput and os.path.isfile(FISIER_STARE):
        os.remove(FISIER_STARE)
        print(f"Starea de reluare a fost stearsa ({FISIER_STARE}) - pornim de la capat.")
    # un STOP ramas de la o rulare anterioara nu trebuie sa ne opreasca acum
    if os.path.isfile(FISIER_STOP):
        oprire_ceruta()

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

    # starea reluarii: partiturile deja procesate nu se mai ating
    stare = incarca_stare(args)
    if stare is None:
        stare = {"versiune": 1, "pdf": amprenta(args.pdf),
                 "imagini": os.path.abspath(args.imagini),
                 "scores_dir": os.path.abspath(args.scores_dir),
                 "date_dir": os.path.abspath(args.date_dir),
                 "audiveris": args.audiveris,
                 "scala_omr": args.scala_omr,
                 "terminate": {}}
    terminate = stare["terminate"]
    if terminate:
        print(f"RELUARE din {FISIER_STARE}: {len(terminate)} din {len(pnguri)} "
              f"partituri sunt deja procesate - se sar.")

    # OMR in loturi: o singura lansare Audiveris pt. mai multe partituri
    # (--omr-lot 1 = vechiul comportament, cate o lansare pe partitura)
    xml_din_lot, lot_incercate = {}, set()
    if args.audiveris and args.omr_lot > 1:
        xml_din_lot, lot_incercate = conversie_omr_in_loturi(
            args, manifest, pnguri, terminate)

    os.makedirs(args.scores_dir, exist_ok=True)
    xml_per_png = {}
    fara_muzica = set()   # PNG-uri in care Audiveris NU a gasit muzica
                          # (probabil poze/desene, nu partituri)
    voicing_per_png = {}  # diagramele de acorduri citite geometric
    doc = fitz.open(args.pdf)

    def marcheaza_gata(fname):
        """Punct de control: partitura e terminata (cu XML sau fara); starea
        se salveaza atomic pe disc inainte de partitura urmatoare."""
        terminate[fname] = {"xml": xml_per_png.get(fname),
                            "fara_muzica": fname in fara_muzica,
                            "voicing": voicing_per_png.get(fname)}
        salveaza_stare(stare)

    def salveaza_voicinguri():
        """voicinguri.json se rescrie incremental, la fiecare diagrama citita
        (nu doar la final) - o pana de curent nu pierde ce s-a citit."""
        if not voicing_per_png:
            return
        os.makedirs(args.date_dir, exist_ok=True)
        cale_v = os.path.join(args.date_dir, "voicinguri.json")
        vechi = []
        if os.path.isfile(cale_v):
            try:
                with open(cale_v, encoding="utf-8") as f:
                    vechi = json.load(f)
                vechi = [v for v in vechi
                         if v.get("fisier") not in voicing_per_png]
            except Exception:
                vechi = []
        nou = [voicing_per_png[f] for f in pnguri if f in voicing_per_png]
        with open(cale_v, "w", encoding="utf-8") as f:
            json.dump(vechi + nou, f, ensure_ascii=False, indent=1)

    print(f"Partituri gasite: {len(pnguri)}")
    for fname in pnguri:
        verifica_oprire()   # fisier STOP -> oprire controlata, fara pierderi
        if fname in terminate:
            intr = terminate[fname]
            if intr.get("xml"):
                xml_per_png[fname] = intr["xml"]
            if intr.get("fara_muzica"):
                fara_muzica.add(fname)
            if intr.get("voicing"):
                voicing_per_png[fname] = intr["voicing"]
            print(f"  {os.path.splitext(fname)[0]}: sarit (deja procesat "
                  f"in rularea anterioara)")
            continue
        info = manifest.get(fname, {})
        cuvinte = info.get("cuvinte", [])
        baza = os.path.splitext(fname)[0]
        tip = tip_din_nume(fname, info)
        # Audiveris citeste doar notatia clasica: portative si perechi
        # (la perechi ii dam DOAR partea de portativ). Tablaturile simple
        # si diagramele isi vor primi convertoarele proprii.
        cu_omr = tip in ("portativ", "pereche")
        decupaj = None
        if tip == "pereche" and info.get("sub_zone"):
            decupaj = info["sub_zone"].get("portativ")

        # clasificam cuvintele INAINTE de OMR: doar cele validate
        # (etichete/titluri reale) au voie sa fie albite in imagine
        lat, inalt = 1000, 200
        if cv2 is not None:
            img0 = cv2.imread(os.path.join(args.imagini, fname),
                              cv2.IMREAD_GRAYSCALE)
            if img0 is not None:
                inalt, lat = img0.shape
        eticheta, titlu, altele, de_albit, recunoscute = clasifica_cuvinte(
            cuvinte, lat, inalt)
        if recunoscute:
            arat = ", ".join(f"'{tx}' [{cat}]" for tx, cat in recunoscute[:8])
            if len(recunoscute) > 8:
                arat += f", +{len(recunoscute) - 8}"
            print(f"  {baza}: dictionar: {arat}")

        # DIAGRAMELE: citire geometrica -> voicinguri.json (fara OMR)
        if tip == "diagrama":
            rez = analizeaza_diagrama(os.path.join(args.imagini, fname), cuvinte)
            if rez is not None:
                nume_acord = eticheta or titlu
                rez["acord"] = nume_acord
                rez["fisier"] = fname
                rez["sursa"] = os.path.basename(args.pdf) + \
                    f" pag.{pagina_din_nume(fname)}"
                voicing_per_png[fname] = rez
                salveaza_voicinguri()
                det = (f"acord='{nume_acord}', " if nume_acord else "")
                print(f"  {baza}: diagrama citita ({det}"
                      f"{len(rez['puncte'])} puncte"
                      f"{', voicing' if rez.get('voicing') else ''})")
            else:
                print(f"  {baza}: diagrama necitibila geometric")
            marcheaza_gata(fname)
            continue

        # TABLATURILE simple: cifrele -> note -> MusicXML (fara OMR)
        if tip == "tablatura":
            note, sursa = converteste_tablatura(doc, info,
                                                os.path.join(args.imagini, fname),
                                                args.tesseract or None)
            if note:
                cale_xml = os.path.join(args.scores_dir, baza + ".xml")
                with open(cale_xml, "w", encoding="utf-8") as f:
                    f.write(tab_spre_musicxml(note, eticheta, titlu))
                xml_per_png[fname] = cale_xml
                print(f"  {baza}: TAB -> XML ({len(note)} note, sursa: {sursa})")
            else:
                print(f"  {baza}: TAB neconvertit ({sursa})")
            marcheaza_gata(fname)
            continue

        # 1) conversia cu Audiveris. Daca esueaza, reincercam cu imagine
        #    tot mai mare, margine alba generoasa, binarizare si, la final,
        #    crop-ul asezat pe o pagina A4 sintetica.
        cale_xml = None
        xml_existent = None
        for ext in (".mxl", ".xml", ".musicxml"):
            c = os.path.join(args.scores_dir, baza + ext)
            if os.path.isfile(c):
                xml_existent = c
                break
        portativ_prelungit = False

        if fname in xml_din_lot:
            # convertit deja in pre-trecerea cu loturi (o singura lansare
            # Audiveris pt. mai multe partituri)
            cale_xml = xml_din_lot[fname]
            print(f"  {baza}: XML din lotul OMR (lansare comuna Audiveris)")
        elif xml_existent and args.omr_lot > 1:
            # in modul loturi, un XML existent (ex. din lotul unei rulari
            # intrerupte) nu se mai reconverteste individual
            cale_xml = xml_existent
            print(f"  {baza}: XML existent - sar conversia individuala")
        elif args.audiveris and cu_omr and not (args.doar_lipsa and xml_existent):
            with tempfile.TemporaryDirectory() as tmp:
                incercari = [
                    dict(scala=args.scala_omr, margine=40, binarizeaza=False),
                    dict(scala=args.scala_omr, margine=100, binarizeaza=False,
                         extinde=True),
                    dict(scala=args.scala_omr * 2, margine=150, binarizeaza=False),
                    dict(scala=args.scala_omr, margine=0, binarizeaza=True,
                         canvas=True, extinde=True),
                ]
                # daca partitura a trecut deja prin incercarea 1 in LOT si nu
                # a produs nimic, scara individuala porneste de la a 2-a
                de_la = 1 if fname in lot_incercate else 0
                # atentie: NU numi aceasta variabila "stare" - ar suprascrie
                # starea de reluare din folderul parental!
                produs, stare_omr = None, "esec"
                for k, conf in enumerate(incercari[de_la:], start=de_la):
                    png_curat = os.path.join(tmp, baza + ".png")
                    pregateste_pentru_omr(os.path.join(args.imagini, fname),
                                          de_albit, png_curat,
                                          decupaj=decupaj, **conf)
                    produs, stare_omr = ruleaza_audiveris(
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
                    portativ_prelungit = bool(conf.get("extinde"))
                elif stare_omr == "fara_muzica":
                    # Audiveris a rulat OK dar nu a gasit muzica -> probabil
                    # NU e partitura (poza/desen detectat gresit).
                    fara_muzica.add(fname)
                # daca a crapat ('esec'), ramane partitura cu PNG, fara XML
        else:
            cale_xml = xml_existent

        # 2) injectam cuvintele descriptive in XML, la locul corect
        if cale_xml:
            if tip == "pereche":
                # pastram si digitatia din TAB, pentru unirea de mai tarziu
                note_tab, sursa_tab = converteste_tablatura(
                    doc, info, os.path.join(args.imagini, fname),
                    args.tesseract or None)
                if note_tab:
                    os.makedirs(os.path.join(args.date_dir, "digitatie"),
                                exist_ok=True)
                    with open(os.path.join(args.date_dir, "digitatie",
                                           baza + ".json"), "w",
                              encoding="utf-8") as f:
                        json.dump({"fisier": fname, "note": note_tab,
                                   "sursa_cifre": sursa_tab}, f,
                                  ensure_ascii=False, indent=1)
            if portativ_prelungit:
                # cinstit fata de cititor: ultima masura nu e din carte
                altele = altele + ["Nota: ultima masura (goala) a fost "
                                   "adaugata artificial la conversie - "
                                   "portativul original era prea scurt "
                                   "pentru OMR"]
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
        marcheaza_gata(fname)

    # 3) cartea noua: textul paginilor + partiturile EXACT LA LOCUL LOR.
    #    Folosim pozitiile din manifest (zone_pdf) ca sa:
    #      - eliminam "textul" citit gresit de OCR de pe portative
    #        (ex. "D a zw oy WD 1 HE oy") din zona fiecarei partituri;
    #      - punem marcatorul [SCORE...] in fluxul textului exact acolo
    #        unde era portativul odinioara.
    print("\nConstruim cartea noua...")

    # salvam voicingurile citite din diagrame
    if voicing_per_png:
        salveaza_voicinguri()
        print(f"  voicinguri salvate: {len(voicing_per_png)} -> "
              f"{os.path.join(args.date_dir, 'voicinguri.json')}")

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
        cuvinte = []
        for c in info.get("cuvinte", []):
            cc = curata_cuvant(c["text"])
            if cuvant_bun(cc):
                categorie = potrivire_dictionar(c["text"])
                cuvinte.append(f"{cc} [{categorie}]" if categorie else cc)
        xml = xml_per_png.get(fname)
        tip = tip_din_nume(fname, info)
        if fname in fara_muzica:
            eticheta = "IMAGINE (Audiveris nu a gasit muzica - probabil nu e partitura)"
        else:
            eticheta = {"portativ": "SCORE", "pereche": "SCORE+TAB",
                        "tablatura": "TAB", "diagrama": "DIAGRAMA"}[tip]
        m = f"[{eticheta}: {args.imagini}/{fname}"
        if xml:
            m += f" | XML: {xml.replace(os.sep, '/')}"
        if cuvinte:
            m += f" | CUVINTE: {', '.join(cuvinte)}"
        vc = voicing_per_png.get(fname)
        if vc:
            if vc.get("voicing"):
                m += " | VOICING: " + "-".join(
                    "x" if v is None else str(v) for v in vc["voicing"])
            elif vc.get("puncte"):
                m += " | PUNCTE: " + " ".join(
                    f"{c}/{t}" for c, t in vc["puncte"])
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
    print(f"  Jurnal       : {args.log}")
    if os.path.isfile(FISIER_STARE):
        os.remove(FISIER_STARE)
        print(f"  (starea de reluare {FISIER_STARE} a fost stearsa - totul e complet)")


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
    ap.add_argument("--omr-lot", type=int, default=20,
                    help="cate partituri intr-o singura lansare Audiveris "
                         "(default: 20; 1 = cate o lansare pe partitura, "
                         "vechiul comportament)")
    ap.add_argument("--doar-lipsa", action="store_true",
                    help="nu reconverteste partiturile care au deja XML in "
                         "--scores-dir (util la reluarea cartilor mari)")
    ap.add_argument("--tesseract", default="",
                    help="calea catre tesseract.exe (optional; citirea "
                         "cifrelor TAB din cartile scanate)")
    ap.add_argument("--date-dir", default="date_extrase",
                    help="folderul pentru datele extrase: voicinguri.json, "
                         "digitatie (default: date_extrase)")
    ap.add_argument("--out", default=None,
                    help="fisierul cartii noi (default: <pdf>.md)")
    ap.add_argument("--log", default=FISIER_JURNAL,
                    help=f"fisierul de jurnal din folderul parental "
                         f"(default: {FISIER_JURNAL})")
    ap.add_argument("--dictionar", default=None,
                    help="dictionarul de terminologie muzicala (default: "
                         "dictionar_muzica.json, cautat langa script)")
    ap.add_argument("--de-la-inceput", action="store_true",
                    help="sterge starea de reluare si porneste de la capat")
    args = ap.parse_args()

    jurnal = Jurnal(args.log)
    print(f"\n===== {datetime.now():%Y-%m-%d %H:%M:%S} | package-book.py | {args.pdf} =====")
    print("Oprire controlata: in alt PowerShell, in acest folder ->  New-Item STOP -ItemType File")
    print("Reluare (dupa oprire / pana de curent / restart): ruleaza DIN NOU aceeasi comanda.")

    try:
        ruleaza(args)
    except OpritDeUser:
        print("\n*** OPRIRE CERUTA (fisierul STOP). ***")
        print(f"Progresul pana aici e salvat in {FISIER_STARE}.")
        print("Ca sa continui de unde a ramas, ruleaza din nou ACEEASI comanda")
        print("(fara --de-la-inceput). Partiturile deja convertite se sar.")
    except KeyboardInterrupt:
        print("\n*** Intrerupt (Ctrl+C). ***")
        print(f"Progresul pana la ultimul punct de control e salvat in {FISIER_STARE}")
        print("(partitura in curs va fi refacuta la urmatoarea rulare a")
        print("aceleiasi comande).")
    finally:
        print(f"===== {datetime.now():%Y-%m-%d %H:%M:%S} | sfarsitul rularii =====\n")
        jurnal.inchide()


if __name__ == "__main__":
    main()
