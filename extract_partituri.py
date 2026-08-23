#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
extract_partituri.py

Proceseaza un PDF in 3 etape si extrage partiturile ca PNG-uri in
subfolderul "imagini_partituri". Functioneaza atat cu PDF-uri "born
digital" (text si imagini separate), cat si cu CARTI SCANATE cu strat OCR
(fiecare pagina = o imagine mare + text invizibil de cautare), cum e
"The Guide To MIDI Orchestration".

ETAPA 1 - Filtrarea textului dupa format si suprapunere
    * Analizeaza TOT documentul si calculeaza procentajul de utilizare al
      fiecarui format de litere (font + marime rotunjita).
    * Identifica formatul MAJORITAR (cel mai mare procentaj).
    * Sterge literele acestui format DOAR daca fac parte din randuri
      suprapuse (cel putin doua randuri ale caror dreptunghiuri se
      intersecteaza).
    * EXCEPTIE: un rand care are spatiu alb deasupra SI dedesubt, pe toata
      lungimea lui (verificat pe pagina randata), NU se sterge.
    * Pe paginile scanate stergerea se face si in PIXELII scanului
      (PDF_REDACT_IMAGE_PIXELS), nu doar in stratul OCR.

ETAPA 2 - Filtrarea imaginilor color vs. alb-negru/gri
    * Imaginile de sine statatoare: daca contin culori -> sterse; daca
      sunt exclusiv alb/negru/gri -> pastrate.
    * Pe paginile scanate (o singura imagine cat toata pagina) nu putem
      sterge "imaginea" (am pierde pagina) - in schimb detectam ZONELE
      COLOR din interiorul scanului (fotografii, ilustratii, sigle) si le
      stergem pe acelea (pixelii devin albi).

ETAPA 3 - Detectarea, etichetarea si extragerea partiturilor
    * Tine evidenta zonelor sterse la etapele 1-2 si scaneaza EXCLUSIV in
      zonele ramase.
    * Scanarea se face cu un DREPTUNGHI PLAT (lungime ~1/10 din latimea
      paginii): merge de la stanga la dreapta pe fiecare banda (gaseste si
      portativele consecutive, unul dupa altul), apoi coboara o treapta si
      reia, pana jos. Dupa fiecare trecere completa a paginii, unghiul se
      schimba cu cate 1 grad: intai in jos de 10 ori (-1..-10), apoi in
      sus de 10 ori (+1..+10) - asa sunt prinse si partiturile stramb
      imprimate, iar crop-urile exportate sunt deja INDREPTATE.
    * Dreptunghiul cauta linii paralele NEGRE sau GRI (dar nu gri foarte
      deschis - ala e alb inchis), cel putin 2, cu spatiu EGAL intre ele,
      umplut de la stanga la dreapta cu pixeli albi sau aproape albi.
    * Daca langa partitura (inauntru, deasupra, sub, la stanga ori la
      dreapta) scrie ceva pe UN SINGUR rand (nu doua suprapuse), cuvintele
      acelea sunt incluse in imaginea partiturii.
    * Tine evidenta paginilor pe care apare/dispare fiecare partitura;
      daca intre doua partituri exista text de cel putin DOUA randuri
      (oricat de lungi/scurte), sunt considerate partituri DIFERITE.
      Identificarea NU se scrie in PDF - ea devine NUMELE fisierului PNG,
      cu pagina inaintea literei, ca fisierele sa stea in ordinea cartii:
          partitura-p22-23-A.png   (incepe pe pagina 22, continua pe 23;
          partitura-p22-23-B.png    litera deosebeste partiturile care
                                    impart aceleasi pagini)
          partitura-p31.png        (singura partitura pe pagina 31 ->
                                    fara litera)
    * O partitura care continua pe pagina urmatoare este LIPITA intr-un
      singur PNG (bucatile, indreptate, sunt puse una sub alta).

Iesire (scriptul ruleaza in folderul parental, PNG-urile merg in
subfolderul "imagini_partituri"):
    <pdf>-procesat.pdf                        <- PDF-ul filtrat (etapele 1-2)
    imagini_partituri/partitura-A-p22-23.png  (etc.)
    imagini_partituri/manifest.json           <- evidenta partiturilor

Dependinte (o singura data):
    pip install pymupdf opencv-python-headless numpy

Folosire:
    python extract_partituri.py "carte.pdf"
    python extract_partituri.py "carte.pdf" --dpi 200
"""

import argparse
import json
import os
import sys
from collections import Counter

import numpy as np
import cv2

try:
    import pymupdf as fitz
except ImportError:
    try:
        import fitz  # PyMuPDF (varianta veche)
    except ImportError:
        print("Lipseste PyMuPDF. Ruleaza:  pip install pymupdf")
        sys.exit(1)


# ---------------------------------------------------------------------------
# Praguri globale (calibrate pe "The Guide To MIDI Orchestration")
# ---------------------------------------------------------------------------
ALB = 235           # pixel >= ALB  -> "alb sau aproape alb" (nu gri)
GRI_INCHIS = 140    # pixel <  GRI_INCHIS -> cerneala (negru / gri inchis)
CERNEALA = 208      # pixel <  CERNEALA -> poate fi linie: negru SAU gri,
                    # dar nu gri foarte deschis (ala e "alb inchis")
FRACT_LATIME = 0.10 # lungimea minima a liniilor cautate ~ 1/10 din latimea paginii
PRAG_COLOR = 22     # diferenta max intre canalele R/G/B ca un pixel sa fie "gri"
FRACT_COLOR = 0.02  # >2% pixeli colorati -> imaginea e "color"
ACOPERIRE_SCAN = 0.8  # o imagine care acopera >=80% din pagina = scanul paginii


# ---------------------------------------------------------------------------
# Utilitare
# ---------------------------------------------------------------------------
def render_gray(page, dpi):
    mat = fitz.Matrix(dpi / 72.0, dpi / 72.0)
    pix = page.get_pixmap(matrix=mat, colorspace=fitz.csGRAY, alpha=False)
    return np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width).copy()


def render_rgb(page, dpi):
    mat = fitz.Matrix(dpi / 72.0, dpi / 72.0)
    pix = page.get_pixmap(matrix=mat, colorspace=fitz.csRGB, alpha=False)
    return np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, 3).copy()


def rect_px(rect, scale):
    return (int(rect.x0 * scale), int(rect.y0 * scale),
            int(round(rect.x1 * scale)), int(round(rect.y1 * scale)))


def litera_partitura(idx):
    """0 -> A, 1 -> B, ... 25 -> Z, 26 -> AA, ..."""
    s = ""
    idx += 1
    while idx > 0:
        idx, r = divmod(idx - 1, 26)
        s = chr(ord("A") + r) + s
    return s


def pagina_e_scan(page):
    """True daca pagina e un scan: o imagine care acopera aproape toata pagina."""
    aria_pag = page.rect.width * page.rect.height
    if aria_pag <= 0:
        return False
    for info in page.get_images(full=True):
        for r in page.get_image_rects(info[0]):
            if (r.width * r.height) / aria_pag >= ACOPERIRE_SCAN:
                return True
    return False


def suprapunere_bbox(a, b):
    """Fractiunea de suprapunere (intersectie / aria mai mica) intre 2 bbox-uri."""
    ix0, iy0 = max(a[0], b[0]), max(a[1], b[1])
    ix1, iy1 = min(a[2], b[2]), min(a[3], b[3])
    if ix1 <= ix0 or iy1 <= iy0:
        return 0.0
    inter = (ix1 - ix0) * (iy1 - iy0)
    aria_a = (a[2] - a[0]) * (a[3] - a[1])
    aria_b = (b[2] - b[0]) * (b[3] - b[1])
    return inter / max(1, min(aria_a, aria_b))


# ===========================================================================
# ETAPA 1 - text: format majoritar + randuri suprapuse
# ===========================================================================
def cheie_format(span):
    """Formatul unei bucati de text = font + marime.

    Marimea se rotunjeste la INTREG: la cartile scanate cu OCR marimea
    estimata variaza usor de la rand la rand (7.3, 7.6, 7.8...), desi e
    acelasi format de litere.
    """
    return f"{span.get('font', '?')}|{int(round(float(span.get('size', 0))))}"


def statistici_fonturi(doc):
    contor = Counter()
    for page in doc:
        d = page.get_text("dict")
        for bloc in d.get("blocks", []):
            if bloc.get("type", 0) != 0:
                continue
            for linie in bloc.get("lines", []):
                for span in linie.get("spans", []):
                    n = len(span.get("text", "").strip())
                    if n:
                        contor[cheie_format(span)] += n
    total = sum(contor.values())
    procente = {k: 100.0 * v / total for k, v in contor.items()} if total else {}
    majoritar = max(contor, key=contor.get) if contor else None
    return contor, majoritar, procente


def rand_are_spatiu_alb(gray, bbox_px, banda=4):
    """True daca randul are spatiu alb DEASUPRA si DEDESUBT pe toata
    lungimea lui (indiferent cat de lung/scurt e randul)."""
    h, w = gray.shape
    x0, y0, x1, y1 = bbox_px
    x0 = max(0, x0); x1 = min(w, x1)
    if x1 <= x0:
        return True
    sus = gray[max(0, y0 - banda):max(0, y0), x0:x1]
    jos = gray[min(h, y1):min(h, y1 + banda), x0:x1]
    sus_alb = sus.size == 0 or sus.min() >= ALB
    jos_alb = jos.size == 0 or jos.min() >= ALB
    return sus_alb and jos_alb


def etapa1_filtrare_text(doc, dpi, zone_sterse):
    contor, majoritar, procente = statistici_fonturi(doc)
    if not majoritar:
        print("  (nu exista text selectabil in document)")
        return None, {}

    print("  Procentaje formate de litere:")
    for k, p in sorted(procente.items(), key=lambda kv: -kv[1])[:8]:
        marcaj = "  <-- MAJORITAR" if k == majoritar else ""
        print(f"    {k:<40s} {p:6.2f}%{marcaj}")

    scale = dpi / 72.0
    total_sterse = 0

    for pno, page in enumerate(doc):
        gray = render_gray(page, dpi)  # pagina ORIGINALA, inainte de stersaturi
        d = page.get_text("dict")

        randuri = []  # (fitz.Rect, [spans])
        for bloc in d.get("blocks", []):
            if bloc.get("type", 0) != 0:
                continue
            for linie in bloc.get("lines", []):
                r = fitz.Rect(linie["bbox"])
                if not r.is_empty:
                    randuri.append((r, linie.get("spans", [])))

        # Randuri SUPRAPUSE = dreptunghiul randului se intersecteaza cu al
        # altui rand (trebuie sa existe cel putin DOUA randuri suprapuse).
        suprapus = [False] * len(randuri)
        for i in range(len(randuri)):
            for j in range(i + 1, len(randuri)):
                ri, rj = randuri[i][0], randuri[j][0]
                inter = fitz.Rect(ri)
                inter.intersect(rj)
                if not inter.is_empty and inter.width > 1 and inter.height > 1:
                    suprapus[i] = suprapus[j] = True

        de_sters = []
        for idx, (r, spans) in enumerate(randuri):
            if not suprapus[idx]:
                continue
            # EXCEPTIA: spatiu alb deasupra SI dedesubt pe toata lungimea.
            if rand_are_spatiu_alb(gray, rect_px(r, scale)):
                continue
            for span in spans:
                if cheie_format(span) == majoritar and span.get("text", "").strip():
                    de_sters.append(fitz.Rect(span["bbox"]))

        for r in de_sters:
            page.add_redact_annot(r)
        if de_sters:
            # Stergem DOAR literele (stratul de text); pixelii imaginilor
            # raman neatinsi - pe cartile scanate OCR-ul citeste uneori
            # NOTELE ca litere, iar stergerea pixelilor ar lasa
            # dreptunghiuri albe peste muzica.
            img_none = getattr(fitz, "PDF_REDACT_IMAGE_NONE", 0)
            try:
                page.apply_redactions(
                    images=img_none,
                    graphics=getattr(fitz, "PDF_REDACT_LINE_ART_NONE", 0))
            except TypeError:  # versiuni mai vechi de PyMuPDF
                page.apply_redactions(images=img_none)
            zone_sterse[pno].extend(de_sters)
            total_sterse += len(de_sters)

    print(f"  Bucati de text sterse (format majoritar, randuri suprapuse): {total_sterse}")
    return majoritar, procente


# ===========================================================================
# ETAPA 2 - imagini: color -> sters, alb/negru/gri -> pastrat
# ===========================================================================
def imagine_este_color(doc, xref):
    try:
        pix = fitz.Pixmap(doc, xref)
        if pix.alpha:
            pix = fitz.Pixmap(pix, 0)
        if pix.n == 1:
            return False  # deja grayscale
        if pix.colorspace and pix.colorspace.n != 3:
            pix = fitz.Pixmap(fitz.csRGB, pix)
        arr = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)
        rgb = arr[:, :, :3].astype(np.int16)
        dif = rgb.max(axis=2) - rgb.min(axis=2)
        return float((dif > PRAG_COLOR).mean()) > FRACT_COLOR
    except Exception as e:
        print(f"    (nu pot analiza imaginea xref={xref}: {e})")
        return False


def zone_color_din_scan(page, dpi_color=100):
    """Gaseste dreptunghiurile ZONELOR COLOR din interiorul unei pagini
    scanate (fotografii, ilustratii, sigle). Intoarce fitz.Rect-uri."""
    rgb = render_rgb(page, dpi_color).astype(np.int16)
    dif = rgb.max(axis=2) - rgb.min(axis=2)
    m = (dif > PRAG_COLOR).astype(np.uint8)
    # inchidem gaurile ca sa unim pixelii aceleiasi ilustratii, apoi
    # curatam zgomotul marunt de scanare
    k = max(3, int(dpi_color * 0.09))
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((k, k), np.uint8))
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    n, _, stats, _ = cv2.connectedComponentsWithStats(m, 8)
    zone = []
    scale = 72.0 / dpi_color
    arie_min = (0.10 * dpi_color) ** 2   # ignoram petele mai mici de ~2.5 mm
    for i in range(1, n):
        x, y, w2, h2, arie = stats[i]
        if arie >= arie_min:
            zone.append(fitz.Rect(x * scale, y * scale,
                                  (x + w2) * scale, (y + h2) * scale))
    return zone


def etapa2_filtrare_imagini(doc, zone_sterse):
    sterse = pastrate = zone_scan = 0
    for pno, page in enumerate(doc):
        aria_pag = page.rect.width * page.rect.height
        e_scan = False
        for info in page.get_images(full=True):
            xref = info[0]
            rects = page.get_image_rects(xref)
            if not rects:
                continue
            acopera = max((r.width * r.height) / aria_pag for r in rects)
            if acopera >= ACOPERIRE_SCAN:
                e_scan = True   # scanul paginii - il tratam mai jos, pe zone
                continue
            if imagine_este_color(doc, xref):
                for r in rects:
                    zone_sterse[pno].append(fitz.Rect(r))
                page.delete_image(xref)
                sterse += len(rects)
            else:
                pastrate += len(rects)

        if e_scan:
            # Pagina scanata: stergem doar ZONELE COLOR din interiorul ei.
            zone = zone_color_din_scan(page)
            for r in zone:
                page.add_redact_annot(r)
                zone_sterse[pno].append(fitz.Rect(r))
            if zone:
                try:
                    page.apply_redactions(
                        images=getattr(fitz, "PDF_REDACT_IMAGE_PIXELS", 2),
                        graphics=getattr(fitz, "PDF_REDACT_LINE_ART_NONE", 0))
                except TypeError:
                    page.apply_redactions(
                        images=getattr(fitz, "PDF_REDACT_IMAGE_PIXELS", 2))
                zone_scan += len(zone)

    print(f"  Imagini COLOR sterse: {sterse} | pastrate (alb-negru/gri): {pastrate}"
          f" | zone color sterse din pagini scanate: {zone_scan}")


# ===========================================================================
# ETAPA 3 - detectarea partiturilor (segmente de linie + grupare)
# ===========================================================================
def segmente_orizontale(gray, masca_permisa, dpi):
    """Scanarea cu dreptunghiul plat (fereastra 1 x L, L = ~1/10 din
    latimea paginii): fereastra este plimbata DE LA STANGA LA DREAPTA pe
    fiecare banda de pixeli, apoi coboara cu o treapta si o ia de la
    capat, pana la finalul paginii. Pasul folosit este cel mai mic posibil
    (1 pixel), deci acopera inclusiv toate cele 10 pozitii ale scanarii
    "in 10 pasi" - asa sunt gasite si portativele consecutive, asezate
    unul dupa altul pe acelasi rand.

    Raman doar seriile orizontale continue de cel putin L pixeli
    intunecati: linii NEGRE sau GRI (pixel < CERNEALA), dar nu gri foarte
    deschis (ala e alb inchis).

    Intoarce lista de (y_centru, x_stanga, x_dreapta) in ordinea de sus in
    jos, doar linii SUBTIRI (liniile de portativ au 1-3 pixeli; textul si
    pozele sunt mai inalte).
    """
    L = max(20, int(round(gray.shape[1] * FRACT_LATIME)))  # ~1/10 din latime
    grosime_max = max(4, int(round(dpi / 30.0)))           # ~7 px la 200 dpi
    binar = ((gray < CERNEALA) & masca_permisa).astype(np.uint8)
    deschis = cv2.morphologyEx(binar, cv2.MORPH_OPEN, np.ones((1, L), np.uint8))
    n, _, stats, cent = cv2.connectedComponentsWithStats(deschis, 8)
    segs = []
    for i in range(1, n):
        x, y, w2, h2, _ = stats[i]
        if h2 <= grosime_max and w2 >= L:
            segs.append((int(round(cent[i][1])), int(x), int(x + w2)))
    segs.sort()
    return segs


def spatiu_dintre_linii_este_alb(gray, l1, l2, marja=2):
    """Spatiul dintre doua linii trebuie sa fie format din pixeli albi sau
    aproape albi (NU gri), de la stanga la dreapta. Notele (cerneala
    neagra) sunt permise; fundalul GRI (casete, capturi de ecran) nu."""
    y1, xa1, xb1 = l1
    y2, xa2, xb2 = l2
    x0 = max(xa1, xa2)
    x1 = min(xb1, xb2)
    top = min(y1, y2) + marja + 1
    bot = max(y1, y2) - marja
    if x1 <= x0 or bot <= top:
        return True
    banda = gray[top:bot, x0:x1]
    alb = float((banda >= ALB).mean())
    gri = float(((banda >= GRI_INCHIS) & (banda < ALB)).mean())
    return alb >= 0.50 and gri <= 0.25


def grupeaza_segmente(segs, gray, dpi):
    """Grupeaza segmentele in partituri: >=2 linii paralele, aceeasi
    intindere stanga-dreapta, spatiu EGAL si alb intre ele. Functioneaza
    si cu mai multe portative asezate unul langa altul (grupare pe x)."""
    dist_min = 4
    dist_max = max(12, int(dpi * 0.15))   # interlinie plauzibila
    grupuri = []                          # fiecare: {'linii': [...]}

    for seg in segs:                      # segs e sortat dupa y
        y, xa, xb = seg
        cel_mai_bun = None
        scor_best = 0.0
        for g in grupuri:
            uy, uxa, uxb = g["linii"][-1]
            dist = y - uy
            if not (dist_min <= dist <= dist_max):
                continue
            # aceeasi intindere orizontala (suprapunerea capetelor)
            ov = min(xb, uxb) - max(xa, uxa)
            if ov <= 0:
                continue
            ov_fract = ov / max(1, min(xb - xa, uxb - uxa))
            if ov_fract < 0.55:
                continue
            # spatiu EGAL: distanta ~ egala cu interlinia grupului
            if len(g["linii"]) >= 2:
                d0 = (g["linii"][-1][0] - g["linii"][0][0]) / (len(g["linii"]) - 1)
                if abs(dist - d0) > max(2.5, 0.30 * d0):
                    continue
            # spatiu ALB (nu gri) intre linii, de la stanga la dreapta
            if not spatiu_dintre_linii_este_alb(gray, g["linii"][-1], seg):
                continue
            if ov_fract > scor_best:
                scor_best = ov_fract
                cel_mai_bun = g
        if cel_mai_bun is not None:
            cel_mai_bun["linii"].append(seg)
        else:
            grupuri.append({"linii": [seg]})

    return [g["linii"] for g in grupuri if len(g["linii"]) >= 2]


def rafineaza_chenar(rot, x0, y0, x1, y1, interlinie, si_vertical=True, miez=None):
    """Extinde chenarul unei partituri (in imaginea deja indreptata) pana
    intalneste spatiu alb in toate directiile, cu o toleranta de ~1.5
    interlinii (ca sa prinda notele, codiletele, legato-urile si liniile
    de portativ ratate de detectie), apoi adauga o margine alba mica.

    Extinderea ORIZONTALA se uita doar in banda miezului (liniile
    portativului +/- 2 interlinii), ca sa nu "mearga" pe randurile de
    text/legendele portativului vecin, aflate mai sus sau mai jos."""
    h, w = rot.shape
    look = max(6, int(interlinie * 1.5))
    look_x = max(5, int(interlinie))   # orizontal mai strans: nu lipim
    lim_y = int(interlinie * 10)       # portativele vecine (gap ~1 interlinie)
    lim_x = int(interlinie * 12)

    # sus
    limita = max(0, y0 - lim_y)
    while si_vertical and y0 > limita:
        banda = rot[max(0, y0 - look):y0, x0:x1]
        rnd = np.where((banda < CERNEALA).any(axis=1))[0]
        if rnd.size == 0:
            break
        y0 = max(0, y0 - look) + int(rnd[0])
    # jos
    limita = min(h, y1 + lim_y)
    while si_vertical and y1 < limita:
        banda = rot[y1:min(h, y1 + look), x0:x1]
        rnd = np.where((banda < CERNEALA).any(axis=1))[0]
        if rnd.size == 0:
            break
        y1 = y1 + int(rnd[-1]) + 1
    # stanga / dreapta: doar in banda miezului (liniile +/- 2 interlinii)
    if miez is not None:
        hy0 = max(y0, int(miez[0] - 2 * interlinie))
        hy1 = min(y1, int(miez[1] + 2 * interlinie))
    else:
        hy0, hy1 = y0, y1

    def _bara_la_margine(xa, xb):
        """Exista o bara de masura (linie verticala pe toata inaltimea
        miezului) intre coloanele xa..xb? Un portativ terminat cu bara,
        urmat de gol, NU se mai extinde peste gol (acolo incepe
        portativul vecin)."""
        if miez is None:
            return False
        my0 = max(0, int(miez[0] - 2)); my1 = min(h, int(miez[1] + 3))
        banda = rot[my0:my1, max(0, xa):min(w, xb)]
        if banda.size == 0:
            return False
        col_ink = (banda < CERNEALA).mean(axis=0)
        return bool((col_ink >= 0.85).any())

    limita = max(0, x0 - lim_x)
    while x0 > limita:
        banda = rot[hy0:hy1, max(0, x0 - look_x):x0]
        col = np.where((banda < CERNEALA).any(axis=0))[0]
        if col.size == 0:
            break
        gol = banda.shape[1] - 1 - int(col[-1])
        if gol >= 3 and _bara_la_margine(x0, x0 + int(2 * interlinie)):
            break  # portativul incepe cu bara, golul e al vecinului
        x0 = max(0, x0 - look_x) + int(col[0])
    # dreapta
    limita = min(w, x1 + lim_x)
    while x1 < limita:
        banda = rot[hy0:hy1, x1:min(w, x1 + look_x)]
        col = np.where((banda < CERNEALA).any(axis=0))[0]
        if col.size == 0:
            break
        if int(col[0]) >= 3 and _bara_la_margine(x1 - int(2 * interlinie), x1):
            break  # portativ terminat cu bara + gol -> nu sarim golul
        x1 = x1 + int(col[-1]) + 1

    # margine alba mica de jur imprejur (orizontal mai putin, ca sa nu
    # atingem portativul vecin de pe acelasi rand)
    pad = max(4, int(interlinie))
    pad_x = max(2, int(interlinie) // 3)
    return (max(0, x0 - pad_x), max(0, y0 - pad),
            min(w, x1 + pad_x), min(h, y1 + pad))


def numara_linii_in_chenar(rot, x0, y0, x1, y1):
    """Numara liniile orizontale complete din chenar (proiectie pe randuri).
    Folosit ca sa preferam, la deduplicare, varianta cu portativul intreg."""
    roi = rot[y0:y1, x0:x1]
    if roi.size == 0:
        return 0
    ink = (roi < CERNEALA).sum(axis=1)
    prag = 0.5 * (x1 - x0)
    este = ink >= prag
    n = 0
    y = 0
    hh = len(este)
    while y < hh:
        if este[y]:
            n += 1
            while y < hh and este[y]:
                y += 1
        else:
            y += 1
    return n


def crop_arata_a_partitura(crop):
    """O partitura reala sta pe hartie ALBA: crop-ul trebuie sa fie
    majoritar alb si sa nu fie plin de GRI (umbre de scanare, fotografii)."""
    if crop.size == 0:
        return False
    alb = float((crop >= ALB).mean())
    gri = float(((crop >= GRI_INCHIS) & (crop < ALB)).mean())
    return alb >= 0.45 and gri <= 0.30


def analizeaza_text_pagina(page, majoritar, dpi, shape):
    """Analizeaza stratul de text al paginii si intoarce:

    1. masca_paragrafe (True = text de corp): randurile care fac parte din
       PARAGRAFE (au un alt rand de text imediat deasupra sau dedesubt).
       Ele devin "albe" in imaginea de DECIZIE, ca detectia si extinderea
       chenarelor sa nu muste din paragrafe.
    2. randuri_izolate: dreptunghiuri (in pixeli) + textul randurilor
       SINGURE (un singur rand, nu doua suprapuse/stivuite). Acestea sunt
       titluri, legende sau etichete (ex. "Vln", "Violin Open Strings") si
       se INCLUD in imaginea partiturii daca sunt in interiorul ei ori
       imediat deasupra, sub, la stanga sau la dreapta ei; textul lor este
       salvat in manifest.json (pentru conversia in MusicXML la etapa 3).
    """
    masca = np.zeros(shape, dtype=bool)
    izolate = []
    toate = []   # toate randurile de text (px), pt. regula "2 randuri intre partituri"
    scale = dpi / 72.0
    h, w = shape

    randuri = []  # (rect, text, fract_majoritar, e_eticheta)
    marime_maj = None
    if majoritar and "|" in str(majoritar):
        try:
            marime_maj = float(str(majoritar).split("|")[1])
        except ValueError:
            marime_maj = None
    for bloc in page.get_text("dict").get("blocks", []):
        if bloc.get("type", 0) != 0:
            continue
        for linie in bloc.get("lines", []):
            spans = linie.get("spans", [])
            text = "".join(s.get("text", "") for s in spans).strip()
            if len(text) < 2:
                continue  # "randuri" fantoma de 1 caracter: de obicei note
                          # sau simboluri muzicale citite gresit de OCR
            n_tot = sum(len(s.get("text", "").strip()) for s in spans) or 1
            n_maj = sum(len(s.get("text", "").strip()) for s in spans
                        if cheie_format(s) == majoritar)
            # ETICHETA de partitura (ex. "Vln", "Vla", "Violin I"): text
            # scurt cu FORMAT MAI MARE decat al textului majoritar al
            # PDF-ului. Se pastreaza mereu si se ataseaza partiturii.
            e_eticheta = False
            if marime_maj is not None and len(text) <= 24:
                for s in spans:
                    st = s.get("text", "").strip()
                    if (len(st) >= 2
                            and float(s.get("size", 0)) >= marime_maj + 1.5):
                        e_eticheta = True
                        break
            randuri.append((fitz.Rect(linie["bbox"]), text, n_maj / n_tot,
                            e_eticheta))

    # Un rand are "vecin" daca alt rand de text e imediat deasupra sau
    # dedesubt (gol vertical mic) -> paragraf. Nu cerem suprapunere
    # orizontala: OCR-ul rupe uneori randurile in bucati mici, cu goluri
    # mari unde nu a recunoscut cuvintele; e suficient ca bucatile sa fie
    # in aceeasi coloana de text (distanta orizontala rezonabila).
    lat_pag = float(page.rect.width)
    # vecinii se determina doar intre randurile obisnuite
    are_vecin = [False] * len(randuri)
    for i in range(len(randuri)):
        if randuri[i][3]:
            continue  # etichetele nu intra in logica de paragraf
        ri = randuri[i][0]
        for j in range(i + 1, len(randuri)):
            if randuri[j][3]:
                continue
            rj = randuri[j][0]
            gol_h = max(0.0, max(ri.x0 - rj.x1, rj.x0 - ri.x1))
            if gol_h > 0.25 * lat_pag:
                continue
            gol_v = max(ri.y0 - rj.y1, rj.y0 - ri.y1)
            # bucatile din ACELASI rand vizual nu se considera vecine
            # (ex. mai multe titluri scurte, unul lânga altul)
            ov_v = -gol_v
            if ov_v >= 0.5 * min(ri.height, rj.height):
                continue
            if gol_v < 0.9 * max(ri.height, rj.height):
                are_vecin[i] = are_vecin[j] = True

    for (r, text, fract_maj, e_eticheta), vecin in zip(randuri, are_vecin):
        x0, y0, x1, y1 = rect_px(r, scale)
        toate.append((x0, y0, x1, y1))
        if e_eticheta:
            # eticheta de partitura: mereu candidata la includere,
            # indiferent de "vecinii" fantoma din jur
            izolate.append((max(0, x0 - 2), max(0, y0 - 2),
                            min(w, x1 + 2), min(h, y1 + 2), text))
        elif vecin:
            # rand de paragraf -> albit in imaginea de decizie (indiferent
            # de format: albirea e doar pentru detectie, nu sterge nimic)
            if len(text) >= 8:
                masca[max(0, y0 - 2):min(h, y1 + 2),
                      max(0, x0 - 2):min(w, x1 + 2)] = True
        else:
            izolate.append((max(0, x0 - 2), max(0, y0 - 2),
                            min(w, x1 + 2), min(h, y1 + 2), text))
    return masca, izolate, toate


def numara_randuri_vizuale(rects):
    """Numara RANDURILE VIZUALE de text: bucatile OCR aflate in aceeasi
    banda pe verticala (se suprapun vertical) se numara ca UN rand,
    indiferent cate bucati sunt si cat de lungi/scurte."""
    benzi = []  # (y0, y1)
    for (_, ry0, _, ry1) in sorted(rects, key=lambda t: t[1]):
        for k, (by0, by1) in enumerate(benzi):
            ov = min(by1, ry1) - max(by0, ry0)
            if ov >= 0.5 * min(by1 - by0, ry1 - ry0):
                benzi[k] = (min(by0, ry0), max(by1, ry1))
                break
        else:
            benzi.append((ry0, ry1))
    return len(benzi)


def rects_in_cadru(rects, M):
    """Transforma dreptunghiurile (px, pagina nerotita) in cadrul rotit.
    Fiecare element: (x0, y0, x1, y1, text)."""
    if M is None:
        return list(rects)
    out = []
    for (x0, y0, x1, y1, text) in rects:
        pts = np.array([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], dtype=np.float64)
        tr = np.hstack([pts, np.ones((4, 1))]) @ M.T
        out.append((float(tr[:, 0].min()), float(tr[:, 1].min()),
                    float(tr[:, 0].max()), float(tr[:, 1].max()), text))
    return out


def include_randuri_izolate(box, randuri, interlinie, w, h, miez=None):
    """Extinde chenarul partiturii ca sa cuprinda randurile de text SINGURE
    aflate in interior, deasupra, sub, la stanga sau la dreapta ei.

    O singura trecere, fata de chenarul ORIGINAL (fara inlantuire: un rand
    inclus nu trage dupa el alte randuri mai indepartate). Regula pentru
    stanga/dreapta cere ca randul (ex. eticheta "Vln") sa fie la nivelul
    liniilor portativului (miez = (y_prima_linie, y_ultima_linie)).

    Intoarce (chenar_nou, cuvinte_incluse); fiecare cuvant inclus e
    (x0, y0, x1, y1, text) in coordonatele cadrului curent."""
    x0, y0, x1, y1 = box
    nx0, ny0, nx1, ny1 = x0, y0, x1, y1
    miez_y0, miez_y1 = miez if miez else (y0, y1)
    incluse = []
    for (rx0, ry0, rx1, ry1, text) in randuri:
        ov_h = min(x1, rx1) - max(x0, rx0)
        ov_v = min(y1, ry1) - max(y0, ry0)
        gol_v = max(0.0, max(y0 - ry1, ry0 - y1))
        gol_h = max(0.0, max(x0 - rx1, rx0 - x1))
        centru_r = 0.5 * (ry0 + ry1)
        in_interior = ov_h > 0 and ov_v > 0
        deasupra_sub = (ov_h >= 0.2 * (rx1 - rx0) and gol_v <= 3 * interlinie
                        and gol_h == 0.0)
        stanga_dreapta = (gol_h <= 4 * interlinie and gol_v == 0.0
                          and miez_y0 - interlinie <= centru_r <= miez_y1 + interlinie)
        if in_interior or deasupra_sub or stanga_dreapta:
            nx0 = min(nx0, int(rx0)); ny0 = min(ny0, int(ry0))
            nx1 = max(nx1, int(rx1)); ny1 = max(ny1, int(ry1))
            incluse.append((rx0, ry0, rx1, ry1, text))
    return (max(0, nx0), max(0, ny0), min(w, nx1), min(h, ny1)), incluse


def scaneaza_pagina(gray, gray_dec, masca_permisa, dpi, randuri_izolate=()):
    """Scaneaza pagina cu fereastra plata, deplasand-o de sus in jos.
    Ordinea trecerilor: intai drept (0 grade), apoi treptat cate 1 grad in
    JOS de 10 ori (-1..-10), apoi cate 1 grad in SUS de 10 ori (+1..+10) -
    unghiul se tot schimba pana sunt gasite partiturile cu cel putin 2
    linii paralele. Detectiile din toate trecerile sunt adunate, apoi
    duplicatele (aceeasi partitura vazuta la unghiuri vecine) sunt
    eliminate, pastrand varianta cu cele mai multe linii / cele mai lungi /
    cel mai mic unghi. Crop-urile intoarse sunt deja INDREPTATE, iar
    randurile de text SINGURE din jurul partiturii sunt incluse in ele."""
    h, w = gray.shape
    centru = (w / 2.0, h / 2.0)
    candidati = []

    # 0 grade, apoi 10 treceri cu grade in jos, apoi 10 cu grade in sus
    unghiuri = [0] + [-a for a in range(1, 11)] + [a for a in range(1, 11)]
    for unghi in unghiuri:
        if unghi == 0:
            rot, rot_dec, rot_masca, M = gray, gray_dec, masca_permisa, None
        else:
            M = cv2.getRotationMatrix2D(centru, unghi, 1.0)
            rot = cv2.warpAffine(gray, M, (w, h), flags=cv2.INTER_LINEAR,
                                 borderMode=cv2.BORDER_CONSTANT, borderValue=255)
            rot_dec = cv2.warpAffine(gray_dec, M, (w, h), flags=cv2.INTER_LINEAR,
                                     borderMode=cv2.BORDER_CONSTANT, borderValue=255)
            rot_masca = cv2.warpAffine(masca_permisa.astype(np.uint8), M, (w, h),
                                       flags=cv2.INTER_NEAREST,
                                       borderMode=cv2.BORDER_CONSTANT,
                                       borderValue=0).astype(bool)
        segs = segmente_orizontale(rot_dec, rot_masca, dpi)
        grupuri = grupeaza_segmente(segs, rot_dec, dpi)
        M_inv = cv2.invertAffineTransform(M) if M is not None else None
        randuri_rot = rects_in_cadru(randuri_izolate, M)

        for g in grupuri:
            ys = [l[0] for l in g]
            xs0 = min(l[1] for l in g)
            xs1 = max(l[2] for l in g)
            interlinie = (ys[-1] - ys[0]) / max(1, len(g) - 1)
            # Rafinare: extindem chenarul pana la spatiu alb in toate
            # directiile (prinde notele, legato-urile si liniile ratate).
            # Decizia se ia pe imaginea FARA text de corp (rot_dec).
            x0, y0, x1, y1 = rafineaza_chenar(rot_dec, xs0, ys[0], xs1, ys[-1] + 1,
                                              interlinie, miez=(ys[0], ys[-1]))
            # Includem randurile de text SINGURE din jurul partiturii.
            (x0, y0, x1, y1), cuvinte = include_randuri_izolate(
                (x0, y0, x1, y1), randuri_rot, interlinie, w, h,
                miez=(ys[0], ys[-1]))
            crop = rot[y0:y1, x0:x1].copy()  # crop-ul e deja INDREPTAT
            nr_linii = max(len(g), numara_linii_in_chenar(rot_dec, x0, y0, x1, y1))
            cuvinte_rel = [(int(cx0 - x0), int(cy0 - y0), int(cx1 - x0),
                            int(cy1 - y0), text)
                           for (cx0, cy0, cx1, cy1, text) in cuvinte]

            if M_inv is None:
                bbox = (x0, y0, x1, y1)
            else:
                colturi = np.array([[x0, y0], [x1, y0], [x1, y1], [x0, y1]],
                                   dtype=np.float64)
                ones = np.ones((4, 1))
                orig = (np.hstack([colturi, ones]) @ M_inv.T)
                bbox = (max(0, int(orig[:, 0].min())), max(0, int(orig[:, 1].min())),
                        min(w, int(orig[:, 0].max())), min(h, int(orig[:, 1].max())))

            candidati.append({
                "bbox": bbox,
                "unghi": unghi,
                "nr_linii": nr_linii,
                "interlinie": interlinie,
                "lungime": x1 - x0,
                "crop": crop,
                "cuvinte": cuvinte_rel,
            })

    candidati.sort(key=lambda d: (-d["nr_linii"], -d["lungime"], abs(d["unghi"])))
    finale = []
    for c in candidati:
        if not crop_arata_a_partitura(c["crop"]):
            continue  # umbra de scanare / fotografie, nu partitura
        if all(suprapunere_bbox(c["bbox"], f["bbox"]) < 0.3 for f in finale):
            finale.append(c)

    # Unirea FRAGMENTELOR aceluiasi portativ: cand scanul e usor curbat,
    # jumatatea stanga si cea dreapta pot fi detectate la unghiuri diferite.
    # Unim doua detectii daca se suprapun pe verticala si fie se suprapun
    # pe orizontala, fie liniile TRAVERSEAZA golul dintre ele (cerneala in
    # fasia dintre chenare). Portativele vecine despartite de spatiu alb
    # raman separate.
    def _se_ating(a, b):
        ay0, ay1 = a["bbox"][1], a["bbox"][3]
        by0, by1 = b["bbox"][1], b["bbox"][3]
        sup_v = min(ay1, by1) - max(ay0, by0)
        if sup_v < 0.5 * min(ay1 - ay0, by1 - by0):
            return False
        gol0 = max(a["bbox"][0], b["bbox"][0])
        gol1 = min(a["bbox"][2], b["bbox"][2])
        if gol1 - gol0 > 0:
            return True  # se suprapun pe orizontala
        stanga, dreapta = (a, b) if a["bbox"][2] <= b["bbox"][0] else (b, a)
        gol = dreapta["bbox"][0] - stanga["bbox"][2]
        interlinie = max(a["interlinie"], b["interlinie"])
        if gol > 3 * interlinie:
            return False
        # liniile continua prin gol doar daca exista RANDURI de pixeli
        # intunecati care traverseaza fasia dintre chenare aproape complet
        # (cel putin 2 linii paralele care merg mai departe)
        fy0 = max(0, max(ay0, by0)); fy1 = min(h, min(ay1, by1))
        fx0 = max(0, stanga["bbox"][2]); fx1 = min(w, dreapta["bbox"][0])
        fasie = gray[fy0:fy1, fx0:fx1]
        if fasie.size == 0:
            return False
        randuri_pline = ((fasie < CERNEALA).mean(axis=1) >= 0.6)
        return int(randuri_pline.sum()) >= 2

    unite = True
    while unite:
        unite = False
        for i in range(len(finale)):
            for j in range(i + 1, len(finale)):
                a, b = finale[i], finale[j]
                if not _se_ating(a, b):
                    continue
                bb = (min(a["bbox"][0], b["bbox"][0]), min(a["bbox"][1], b["bbox"][1]),
                      max(a["bbox"][2], b["bbox"][2]), max(a["bbox"][3], b["bbox"][3]))
                castigator = a if (a["nr_linii"], a["lungime"]) >= (b["nr_linii"], b["lungime"]) else b
                unghi = castigator["unghi"]
                interlinie = max(a["interlinie"], b["interlinie"])
                # decupam din nou chenarul unit, la unghiul castigatorului
                if unghi == 0:
                    rot2, rot2_dec = gray, gray_dec
                    cx0, cy0, cx1, cy1 = bb
                else:
                    M2 = cv2.getRotationMatrix2D(centru, unghi, 1.0)
                    rot2 = cv2.warpAffine(gray, M2, (w, h), flags=cv2.INTER_LINEAR,
                                          borderMode=cv2.BORDER_CONSTANT, borderValue=255)
                    rot2_dec = cv2.warpAffine(gray_dec, M2, (w, h), flags=cv2.INTER_LINEAR,
                                              borderMode=cv2.BORDER_CONSTANT, borderValue=255)
                    colt = np.array([[bb[0], bb[1]], [bb[2], bb[1]],
                                     [bb[2], bb[3]], [bb[0], bb[3]]], dtype=np.float64)
                    tr = (np.hstack([colt, np.ones((4, 1))]) @ M2.T)
                    cx0 = max(0, int(tr[:, 0].min())); cy0 = max(0, int(tr[:, 1].min()))
                    cx1 = min(w, int(tr[:, 0].max())); cy1 = min(h, int(tr[:, 1].max()))
                # decupam din nou chenarul unit, la unghiul castigatorului;
                # pe verticala pastram intinderea deja rafinata a
                # fragmentelor (extindem doar orizontal)
                cx0, cy0, cx1, cy1 = rafineaza_chenar(rot2_dec, cx0, cy0, cx1, cy1,
                                                      interlinie, si_vertical=False)
                (cx0, cy0, cx1, cy1), cuv2 = include_randuri_izolate(
                    (cx0, cy0, cx1, cy1),
                    rects_in_cadru(randuri_izolate, M2 if unghi != 0 else None),
                    interlinie, w, h)
                cuv2_rel = [(int(a0 - cx0), int(a1 - cy0), int(a2 - cx0),
                             int(a3 - cy0), text)
                            for (a0, a1, a2, a3, text) in cuv2]
                nou = {
                    "bbox": bb,
                    "unghi": unghi,
                    "nr_linii": max(a["nr_linii"], b["nr_linii"]),
                    "interlinie": interlinie,
                    "lungime": bb[2] - bb[0],
                    "crop": rot2[cy0:cy1, cx0:cx1].copy(),
                    "cuvinte": cuv2_rel,
                }
                finale = [f for k, f in enumerate(finale) if k not in (i, j)] + [nou]
                unite = True
                break
            if unite:
                break

    # CLASIFICARE: 6 linii paralele = TABLATURA (corzile chitarei),
    # 5 (sau alt numar) = PORTATIV; 10-12 linii = portativ + TAB lipite
    # (stil "grand staff" de chitara) -> PERECHE, cu sub-zonele despartite.
    for f in finale:
        if f["nr_linii"] == 6:
            f["tip"] = "tablatura"
        elif 10 <= f["nr_linii"] <= 12:
            f["tip"] = "pereche"
            f["sub_zone"] = desparte_pereche(f["crop"])
        else:
            f["tip"] = "portativ"

    # PERECHI portativ + tablatura: in cartile moderne acelasi pasaj e
    # scris pe portativ si dedesubt pe TAB. Le unim intr-o singura
    # detectie ("pereche"), pastrand sub-zonele fiecareia (etapa 3 da
    # portativul la Audiveris si citeste digitatia din TAB).
    finale.sort(key=lambda d: d["bbox"][1])
    unite = True
    while unite:
        unite = False
        for i in range(len(finale)):
            for j in range(len(finale)):
                if i == j:
                    continue
                a, b = finale[i], finale[j]
                tipuri = {a["tip"], b["tip"]}
                if tipuri != {"portativ", "tablatura"}:
                    continue
                sus, jos = (a, b) if a["bbox"][1] <= b["bbox"][1] else (b, a)
                gol_v = jos["bbox"][1] - sus["bbox"][3]
                il = max(a["interlinie"], b["interlinie"])
                ov_h = (min(a["bbox"][2], b["bbox"][2])
                        - max(a["bbox"][0], b["bbox"][0]))
                if not (-il * 2 <= gol_v <= il * 8
                        and ov_h >= 0.6 * min(a["bbox"][2] - a["bbox"][0],
                                              b["bbox"][2] - b["bbox"][0])):
                    continue
                bb = (min(a["bbox"][0], b["bbox"][0]), min(a["bbox"][1], b["bbox"][1]),
                      max(a["bbox"][2], b["bbox"][2]), max(a["bbox"][3], b["bbox"][3]))
                port = a if a["tip"] == "portativ" else b
                unghi = port["unghi"]
                if unghi == 0:
                    rot2 = gray
                    cx0, cy0, cx1, cy1 = bb
                else:
                    M2 = cv2.getRotationMatrix2D(centru, unghi, 1.0)
                    rot2 = cv2.warpAffine(gray, M2, (w, h), flags=cv2.INTER_LINEAR,
                                          borderMode=cv2.BORDER_CONSTANT, borderValue=255)
                    colt = np.array([[bb[0], bb[1]], [bb[2], bb[1]],
                                     [bb[2], bb[3]], [bb[0], bb[3]]], dtype=np.float64)
                    tr = (np.hstack([colt, np.ones((4, 1))]) @ M2.T)
                    cx0 = max(0, int(tr[:, 0].min())); cy0 = max(0, int(tr[:, 1].min()))
                    cx1 = min(w, int(tr[:, 0].max())); cy1 = min(h, int(tr[:, 1].max()))
                pad = max(4, int(il))
                cx0 = max(0, cx0 - 2); cy0 = max(0, cy0 - pad)
                cx1 = min(w, cx1 + 2); cy1 = min(h, cy1 + pad)

                def _rel(d):
                    return [max(0, d["bbox"][0] - bb[0] + 2),
                            max(0, d["bbox"][1] - bb[1] + pad),
                            d["bbox"][2] - bb[0] + 2,
                            d["bbox"][3] - bb[1] + pad]

                nou = {
                    "bbox": bb,
                    "unghi": unghi,
                    "nr_linii": max(a["nr_linii"], b["nr_linii"]),
                    "interlinie": il,
                    "lungime": bb[2] - bb[0],
                    "crop": rot2[cy0:cy1, cx0:cx1].copy(),
                    "cuvinte": a.get("cuvinte", []) + b.get("cuvinte", []),
                    "tip": "pereche",
                    "sub_zone": {"portativ": _rel(port),
                                 "tab": _rel(a if port is b else b)},
                }
                finale = [f for k, f in enumerate(finale)
                          if k not in (i, j)] + [nou]
                finale.sort(key=lambda d: d["bbox"][1])
                unite = True
                break
            if unite:
                break

    return finale


def numar_benzi(bool_vec):
    """Cate serii continue de True are vectorul (= cate linii distincte)."""
    n = 0
    activ = False
    for v in bool_vec:
        if v and not activ:
            n += 1
        activ = bool(v)
    return n


def desparte_pereche(crop):
    """Pentru un grup portativ+TAB lipite (10-12 linii): gaseste liniile
    prin proiectia pe randuri si desparte la golul cel mai mare dintre
    linii consecutive. Intoarce sub-zonele relative la crop:
    {'portativ': [x0,y0,x1,y1], 'tab': [...]} (notatia sta de obicei sus)."""
    h, w = crop.shape
    ink = (crop < CERNEALA).sum(axis=1)
    este = ink >= 0.5 * w
    centre = []
    y = 0
    while y < h:
        if este[y]:
            y0 = y
            while y < h and este[y]:
                y += 1
            centre.append((y0 + y - 1) // 2)
        else:
            y += 1
    if len(centre) < 4:
        mij = h // 2
        return {"portativ": [0, 0, w, mij], "tab": [0, mij, w, h]}
    d = np.diff(centre)
    k = int(np.argmax(d))          # golul cel mai mare = granita
    mij = (centre[k] + centre[k + 1]) // 2
    return {"portativ": [0, 0, w, mij], "tab": [0, mij, w, h]}


def detecteaza_diagrame(gray, masca_permisa, dpi, ocupate):
    """Gaseste DIAGRAMELE de acorduri: grile mici formate din linii
    verticale (corzile) si orizontale (tastele), cu puncte pe intersectii.
    Sunt prea mici pentru detectorul de portative (liniile lor sunt mult
    sub 1/10 din latimea paginii), asa ca au propriul detector.

    `ocupate` = bbox-urile deja detectate (portative/TAB) - le ocolim.
    Intoarce detectii cu tip='diagrama'."""
    h, w = gray.shape
    binar = ((gray < CERNEALA) & masca_permisa).astype(np.uint8)
    n, lab, stats, _ = cv2.connectedComponentsWithStats(binar, 8)
    lim_min = max(20, int(dpi * 0.10))   # grila de macar ~2.5 mm
    lim_max = int(dpi * 4.0)             # pana la ~5 cm (pattern-uri lungi)
    dim_min = max(40, int(dpi * 0.25))   # latura mica >= ~6 mm: cuvintele
                                         # razlete nu devin "diagrame"
    dets = []
    for i in range(1, n):
        x, y, w2, h2, aria = stats[i]
        if not (lim_min <= w2 <= lim_max and lim_min <= h2 <= lim_max):
            continue
        if min(w2, h2) < dim_min:
            continue
        if aria < 0.04 * w2 * h2:
            continue  # prea putina cerneala ca sa fie o grila
        sub = (lab[y:y + h2, x:x + w2] == i)
        col = sub.sum(axis=0) / float(h2)
        rnd = sub.sum(axis=1) / float(w2)
        nv = numar_benzi(col >= 0.5)    # linii verticale ~ complete (corzi)
        nh = numar_benzi(rnd >= 0.5)    # linii orizontale ~ complete (taste)
        # 4-9 corzi (chitara/bas), 3-16 taste (unele carti arata grile
        # lungi, cu 10+ taste); sub 4 linii verticale = probabil bare de
        # masura dintr-un sistem portativ+TAB, nu o grila
        if not (4 <= nv <= 9 and 3 <= nh <= 16):
            continue
        # tastele unei grile sunt UNIFORM distantate; un gol mare intre
        # linii tradeaza un sistem portativ+TAB scurt, nu o diagrama
        # (prag mai bland la linii, ca scanurile slabe sa nu piarda taste)
        centre_l = []
        activ = False
        for yy, v in enumerate(rnd >= 0.5):
            if v and not activ:
                y_start = yy
            if not v and activ:
                centre_l.append((y_start + yy - 1) / 2.0)
            activ = bool(v)
        if activ:
            centre_l.append((y_start + len(rnd) - 1) / 2.0)
        if len(centre_l) >= 3:
            dif = np.diff(centre_l)
            if float(dif.max()) > 2.6 * float(np.median(dif)):
                continue
        bbox = (x, y, x + w2, y + h2)
        if any(suprapunere_bbox(bbox, oc) >= 0.2 for oc in ocupate):
            continue  # face parte dintr-un portativ/TAB deja detectat
        pas = h2 / max(1, nh - 1)   # distanta dintre taste
        dets.append({
            "bbox": bbox,
            "unghi": 0,
            "nr_linii": nh,
            "interlinie": pas,
            "lungime": w2,
            "crop": None,   # completat mai jos, dupa unirea grilelor lipite
            "tip": "diagrama",
            "corzi": nv,
        })

    # unele grile au si un chenar dublu sau puncte care ating grila vecina;
    # unim detectiile care se ating/suprapun
    schimbat = True
    while schimbat:
        schimbat = False
        for i in range(len(dets)):
            for j in range(i + 1, len(dets)):
                if suprapunere_bbox(dets[i]["bbox"], dets[j]["bbox"]) >= 0.5:
                    a, b = dets[i], dets[j]
                    bb = (min(a["bbox"][0], b["bbox"][0]), min(a["bbox"][1], b["bbox"][1]),
                          max(a["bbox"][2], b["bbox"][2]), max(a["bbox"][3], b["bbox"][3]))
                    a["bbox"] = bb
                    a["corzi"] = max(a["corzi"], b["corzi"])
                    a["nr_linii"] = max(a["nr_linii"], b["nr_linii"])
                    dets.pop(j)
                    schimbat = True
                    break
            if schimbat:
                break

    for d in dets:
        x0, y0, x1, y1 = d["bbox"]
        pad = max(4, int(d["interlinie"] * 0.8))
        cx0 = max(0, x0 - pad); cy0 = max(0, y0 - pad)
        cx1 = min(w, x1 + pad); cy1 = min(h, y1 + pad)
        d["crop"] = gray[cy0:cy1, cx0:cx1].copy()
        d["bbox"] = (cx0, cy0, cx1, cy1)
    dets.sort(key=lambda t: (t["bbox"][1], t["bbox"][0]))
    return dets


def etapa3_partituri(doc, dpi, zone_sterse, out_dir, majoritar=None):
    """Detecteaza partiturile si le exporta ca PNG in `out_dir`.

    Identificarea NU se scrie in PDF: ea devine numele fisierului PNG.
    Litera (A, B, ...) se adauga DOAR cand mai multe partituri impart
    aceleasi pagini si trebuie deosebite intre ele:
        partitura-A-p22-23.png, partitura-B-p22-23.png, partitura-p31.png
    """
    scale = dpi / 72.0
    os.makedirs(out_dir, exist_ok=True)

    # 1) Detectie pe fiecare pagina, doar in zonele ramase (nesterse).
    detectii = []
    randuri_text = []   # toate randurile de text ale fiecarei pagini (px)
    for pno, page in enumerate(doc):
        gray = render_gray(page, dpi)
        h, w = gray.shape
        masca = np.ones((h, w), dtype=bool)
        for r in zone_sterse[pno]:
            x0, y0, x1, y1 = rect_px(r, scale)
            masca[max(0, y0):min(h, y1), max(0, x0):min(w, x1)] = False
        # imaginea de DECIZIE: paragrafele (randuri de text stivuite) devin
        # albe, ca sa nu fie confundate cu partiturile si sa nu fie incluse
        # in chenare; randurile SINGURE raman si se ataseaza partiturilor
        masca_par, randuri_izolate, toate_rd = analizeaza_text_pagina(
            page, majoritar, dpi, gray.shape)
        randuri_text.append(toate_rd)
        gray_dec = gray.copy()
        gray_dec[masca_par] = 255
        # diagramele de acorduri (grile mici) se detecteaza INTAI, iar
        # zonele lor sunt ALBITE in imaginea de decizie la scanarea de
        # portative - altfel liniile grilelor asezate in coloana ar parea
        # "portative", iar chenarele portativelor reale s-ar intinde peste
        # grilele vecine
        diagrame = detecteaza_diagrame(gray_dec, masca, dpi, [])
        gray_dec_fara = gray_dec
        masca_fara_diagrame = masca
        if diagrame:
            gray_dec_fara = gray_dec.copy()
            masca_fara_diagrame = masca.copy()
            for d in diagrame:
                x0, y0, x1, y1 = d["bbox"]
                gray_dec_fara[max(0, y0):min(h, y1), max(0, x0):min(w, x1)] = 255
                masca_fara_diagrame[max(0, y0):min(h, y1),
                                    max(0, x0):min(w, x1)] = False
        gasite = scaneaza_pagina(gray, gray_dec_fara, masca_fara_diagrame, dpi,
                                 randuri_izolate)
        # aruncam diagramele care s-au suprapus totusi cu un portativ/TAB
        diagrame = [d for d in diagrame
                    if all(suprapunere_bbox(d["bbox"], g2["bbox"]) < 0.2
                           for g2 in gasite)]
        for d in diagrame:
            # atasam numele acordului (rand de text singur, ex. "Gma7")
            (x0, y0, x1, y1), cuv = include_randuri_izolate(
                d["bbox"], randuri_izolate, d["interlinie"], w, h,
                miez=(d["bbox"][1], d["bbox"][3]))
            if (x0, y0, x1, y1) != d["bbox"]:
                d["bbox"] = (x0, y0, x1, y1)
                d["crop"] = gray[y0:y1, x0:x1].copy()
            d["cuvinte"] = [(int(a0 - x0), int(a1 - y0), int(a2 - x0),
                             int(a3 - y0), text)
                            for (a0, a1, a2, a3, text) in cuv]
        gasite = gasite + diagrame
        gasite.sort(key=lambda p: (p["bbox"][1], p["bbox"][0]))
        detectii.append(gasite)
        if gasite:
            tipuri = {}
            for p in gasite:
                tipuri[p["tip"]] = tipuri.get(p["tip"], 0) + 1
            print(f"  pagina {pno + 1}: " + ", ".join(
                f"{v} {k}" for k, v in sorted(tipuri.items())))

    # 2) Evidenta: pe ce pagini apare si dispare fiecare partitura.
    #    O partitura care se termina la finalul unei pagini si alta care
    #    incepe imediat la inceputul paginii urmatoare = ACEEASI partitura.
    #    DAR: daca intre ele exista text de cel putin DOUA randuri (oricat
    #    de lungi sau scurte), sunt doua partituri DIFERITE.
    partituri = []
    for pno, gasite in enumerate(detectii):
        for i, det in enumerate(gasite):
            este_continuare = False
            if i == 0 and pno > 0 and partituri:
                ultima = partituri[-1]
                pg_ant, det_ant = ultima["bucati"][-1]
                acelasi_tip = (det_ant.get("tip") == det.get("tip")
                               and det.get("tip") != "diagrama")
                if pg_ant == pno - 1 and acelasi_tip:
                    h_ant = int(doc[pno - 1].rect.height * scale)
                    prag = det_ant["interlinie"] * 6
                    aproape_de_jos = (h_ant - det_ant["bbox"][3]) < prag
                    aproape_de_sus = det["bbox"][1] < det["interlinie"] * 6
                    if aproape_de_jos and aproape_de_sus:
                        # cate RANDURI de text sunt intre cele doua bucati?
                        # (sub partitura de pe pagina veche + deasupra celei
                        # de pe pagina noua)
                        sub = [r for r in randuri_text[pno - 1]
                               if r[1] >= det_ant["bbox"][3]]
                        deasupra = [r for r in randuri_text[pno]
                                    if r[3] <= det["bbox"][1]]
                        n_randuri = (numara_randuri_vizuale(sub)
                                     + numara_randuri_vizuale(deasupra))
                        if n_randuri < 2:
                            este_continuare = True
            if este_continuare:
                partituri[-1]["bucati"].append((pno, det))
            else:
                partituri.append({"bucati": [(pno, det)]})

    # 3) Numele fisierelor: litera doar cand mai multe partituri impart
    #    aceleasi pagini (grupuri de pagini suprapuse).
    for p in partituri:
        p["pagini"] = sorted({pg + 1 for pg, _ in p["bucati"]})
    for p in partituri:
        p["are_litera"] = any(q is not p and set(q["pagini"]) & set(p["pagini"])
                              for q in partituri)
    litere_folosite = 0
    grup_anterior = None
    for p in partituri:
        if not p["are_litera"]:
            p["litera"] = None
            continue
        grup_curent = tuple(p["pagini"])
        if grup_anterior is not None and not (set(grup_curent) & set(grup_anterior)):
            litere_folosite = 0  # alt grup de pagini -> alfabetul o ia de la A
        p["litera"] = litera_partitura(litere_folosite)
        litere_folosite += 1
        grup_anterior = grup_curent

    # 4) Export PNG: bucatile de pe pagini consecutive se lipesc vertical
    #    intr-un singur fisier.
    manifest = {"partituri": [], "zone_sterse": {}}
    for p in partituri:
        pagini = p["pagini"]
        pg_txt = f"p{pagini[0]}" if len(pagini) == 1 else f"p{pagini[0]}-{pagini[-1]}"
        # prefixul numelui dupa tipul detectiei
        tip = p["bucati"][0][1].get("tip", "portativ")
        prefix = {"portativ": "partitura", "tablatura": "tablatura",
                  "pereche": "partitura-tab", "diagrama": "diagrama"}[tip]
        # pagina inaintea literei, ca fisierele sa stea in ordinea cartii:
        #   partitura-p3-A.png, partitura-p3-B.png, ... partitura-p7.png
        nume = (f"{prefix}-{pg_txt}-{p['litera']}.png" if p["litera"]
                else f"{prefix}-{pg_txt}.png")

        cropuri = [det["crop"] for _, det in p["bucati"]]
        cuvinte_manifest = []
        if len(cropuri) == 1:
            imagine = cropuri[0]
            for (a0, a1, a2, a3, text) in p["bucati"][0][1].get("cuvinte", []):
                cuvinte_manifest.append({"text": text, "bbox": [a0, a1, a2, a3]})
        else:
            lat = max(c.shape[1] for c in cropuri)
            bucati = []
            gol = np.full((12, lat), 255, dtype=np.uint8)
            decalaj = 0
            for k, c in enumerate(cropuri):
                for (a0, a1, a2, a3, text) in p["bucati"][k][1].get("cuvinte", []):
                    cuvinte_manifest.append(
                        {"text": text, "bbox": [a0, a1 + decalaj, a2, a3 + decalaj]})
                decalaj += c.shape[0] + 12
                if c.shape[1] < lat:
                    pad = np.full((c.shape[0], lat - c.shape[1]), 255, dtype=np.uint8)
                    c = np.hstack([c, pad])
                bucati.append(c)
                if k < len(cropuri) - 1:
                    bucati.append(gol)
            imagine = np.vstack(bucati)

        cv2.imwrite(os.path.join(out_dir, nume), imagine)

        manifest["partituri"].append({
            "fisier": nume,
            "tip": tip,
            "pagini": pagini,
            "unghi_grade": p["bucati"][0][1]["unghi"],
            "nr_linii": [det["nr_linii"] for _, det in p["bucati"]],
            # pentru perechi portativ+TAB: sub-zonele fiecarei parti,
            # relative la PNG (etapa 3 da portativul la Audiveris)
            "sub_zone": p["bucati"][0][1].get("sub_zone"),
            # pozitia fiecarei bucati pe pagina, in puncte PDF - folosita
            # de etapa 3 (package-book.py) ca sa aseze partitura la locul
            # ei in cartea noua si sa scoata gunoiul OCR din acea zona
            "zone_pdf": [{"pagina": pg + 1,
                          "bbox_pt": [round(v / scale, 1) for v in det["bbox"]]}
                         for pg, det in p["bucati"]],
            "cuvinte": cuvinte_manifest,
        })
        print(f"  {nume}  (pagini: {pagini}, linii: "
              f"{[d['nr_linii'] for _, d in p['bucati']]})")

    manifest["zone_sterse"] = {
        str(pno + 1): [list(map(float, (r.x0, r.y0, r.x1, r.y1))) for r in zone]
        for pno, zone in enumerate(zone_sterse) if zone
    }
    with open(os.path.join(out_dir, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)

    return len(partituri)


# ===========================================================================
# main
# ===========================================================================
def main():
    ap = argparse.ArgumentParser(
        description="Filtreaza textul majoritar suprapus si imaginile/zonele "
                    "color dintr-un PDF, apoi detecteaza si exporta partiturile.")
    ap.add_argument("pdf", help="calea catre fisierul PDF de procesat")
    ap.add_argument("--out-dir", default="imagini_partituri",
                    help="subfolderul pentru PNG-uri si manifest "
                         "(default: imagini_partituri, langa script)")
    ap.add_argument("--out-pdf", default=None,
                    help="calea PDF-ului procesat (default: <pdf>-procesat.pdf)")
    ap.add_argument("--dpi", type=int, default=200,
                    help="rezolutia de scanare/export (default: 200)")
    args = ap.parse_args()

    if not os.path.isfile(args.pdf):
        print(f"Nu gasesc fisierul: {args.pdf}")
        sys.exit(1)

    out_pdf = args.out_pdf or (os.path.splitext(args.pdf)[0] + "-procesat.pdf")
    doc = fitz.open(args.pdf)
    zone_sterse = [[] for _ in range(len(doc))]

    print(f"PDF: {args.pdf} ({len(doc)} pagini)")
    print("\n=== ETAPA 1: filtrare text (format majoritar, randuri suprapuse) ===")
    majoritar, _ = etapa1_filtrare_text(doc, args.dpi, zone_sterse)

    print("\n=== ETAPA 2: filtrare imagini/zone color (alb-negru/gri se pastreaza) ===")
    etapa2_filtrare_imagini(doc, zone_sterse)

    print("\n=== ETAPA 3: detectare + evidenta + export partituri ===")
    nr = etapa3_partituri(doc, args.dpi, zone_sterse, args.out_dir, majoritar)

    doc.save(out_pdf, garbage=3, deflate=True)
    doc.close()
    print(f"\nGata. {nr} partitura/i detectate.")
    print(f"  PDF procesat : {out_pdf}")
    print(f"  PNG-uri      : {args.out_dir}/")
    print(f"  Manifest     : {os.path.join(args.out_dir, 'manifest.json')}")


if __name__ == "__main__":
    main()
