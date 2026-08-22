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
    * Detecteaza SEGMENTE de linie orizontala (gri sau negre, subtiri si
      continue - morfologie cu fereastra plata 1 x L), apoi le grupeaza in
      partituri: cel putin 2 linii paralele, cu spatiu EGAL intre ele,
      aceeasi intindere stanga-dreapta, iar spatiul dintre linii format
      din pixeli albi sau aproape albi (NU gri). Astfel functioneaza si
      cu mai multe portative mici asezate unul langa altul pe acelasi rand.
    * Scaneaza fiecare pagina de 20+ ori, inclinand fereastra cu cate 1
      grad (de la -10 la +10 grade), ca sa prinda si partiturile stramb
      imprimate; crop-urile exportate sunt deja INDREPTATE.
    * Tine evidenta paginilor pe care apare/dispare fiecare partitura.
      Identificarea NU se scrie in PDF - ea devine NUMELE fisierului PNG:
          partitura-A-p22-23.png   (incepe pe pagina 22, continua pe 23;
          partitura-B-p22-23.png    litera deosebeste partiturile care
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
CERNEALA = 200      # pixel <  CERNEALA -> poate fi linie (negru sau gri)
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
            # Pe paginile scanate stergem si pixelii scanului; altfel doar
            # textul (imaginile raman neatinse).
            if pagina_e_scan(page):
                mod_img = getattr(fitz, "PDF_REDACT_IMAGE_PIXELS", 2)
            else:
                mod_img = getattr(fitz, "PDF_REDACT_IMAGE_NONE", 0)
            try:
                page.apply_redactions(
                    images=mod_img,
                    graphics=getattr(fitz, "PDF_REDACT_LINE_ART_NONE", 0))
            except TypeError:  # versiuni mai vechi de PyMuPDF
                page.apply_redactions(images=mod_img)
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
    """Gaseste SEGMENTELE de linie orizontala (gri sau negre) din imagine,
    folosind o fereastra plata 1 x L (deschidere morfologica): raman doar
    pixelii care fac parte din serii orizontale continue de cel putin L.

    Intoarce lista de (y_centru, x_stanga, x_dreapta), doar linii SUBTIRI
    (liniile de portativ au 1-3 pixeli; textul si pozele sunt mai inalte).
    """
    L = max(40, int(dpi * 0.30))                 # ~0.8 cm la 200 dpi
    grosime_max = max(4, int(round(dpi / 30.0))) # ~7 px la 200 dpi
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


def rafineaza_chenar(rot, x0, y0, x1, y1, interlinie, si_vertical=True):
    """Extinde chenarul unei partituri (in imaginea deja indreptata) pana
    intalneste spatiu alb in toate directiile, cu o toleranta de ~1.5
    interlinii (ca sa prinda notele, codiletele, legato-urile si liniile
    de portativ ratate de detectie), apoi adauga o margine alba mica."""
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
    # stanga
    limita = max(0, x0 - lim_x)
    while x0 > limita:
        banda = rot[y0:y1, max(0, x0 - look_x):x0]
        col = np.where((banda < CERNEALA).any(axis=0))[0]
        if col.size == 0:
            break
        x0 = max(0, x0 - look_x) + int(col[0])
    # dreapta
    limita = min(w, x1 + lim_x)
    while x1 < limita:
        banda = rot[y0:y1, x1:min(w, x1 + look_x)]
        col = np.where((banda < CERNEALA).any(axis=0))[0]
        if col.size == 0:
            break
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


def masca_text_pagina(page, majoritar, dpi, shape):
    """Masca (True = text de corp) construita din stratul de text al
    paginii: randurile LUNGI scrise majoritar cu formatul majoritar.
    Randurile scurte (ex. "Vln", "Vla" - etichetele partiturilor) raman
    neatinse. Folosita ca IMAGINE DE DECIZIE: detectia si extinderea
    chenarelor trateaza aceste zone ca alb, ca sa nu muste din paragrafe;
    crop-ul exportat se taie insa din imaginea reala."""
    m = np.zeros(shape, dtype=bool)
    if not majoritar:
        return m
    scale = dpi / 72.0
    h, w = shape
    for bloc in page.get_text("dict").get("blocks", []):
        if bloc.get("type", 0) != 0:
            continue
        for linie in bloc.get("lines", []):
            spans = linie.get("spans", [])
            text = "".join(s.get("text", "") for s in spans).strip()
            if len(text) < 12:
                continue  # randurile scurte pot fi etichete muzicale
            n_tot = sum(len(s.get("text", "").strip()) for s in spans) or 1
            n_maj = sum(len(s.get("text", "").strip()) for s in spans
                        if cheie_format(s) == majoritar)
            if n_maj / n_tot < 0.5:
                continue
            x0, y0, x1, y1 = rect_px(fitz.Rect(linie["bbox"]), scale)
            m[max(0, y0 - 2):min(h, y1 + 2), max(0, x0 - 2):min(w, x1 + 2)] = True
    return m


def scaneaza_pagina(gray, gray_dec, masca_permisa, dpi):
    """Scaneaza pagina cu fereastra plata, inclinata de la -10 la +10 grade
    (pas de 1 grad). Detectiile din toate trecerile sunt adunate, apoi
    duplicatele (aceeasi partitura vazuta la unghiuri vecine) sunt
    eliminate, pastrand varianta cu cele mai multe linii / cele mai lungi /
    cel mai mic unghi. Crop-urile intoarse sunt deja INDREPTATE."""
    h, w = gray.shape
    centru = (w / 2.0, h / 2.0)
    candidati = []

    for unghi in range(-10, 11):  # 21 de treceri: -10..+10, pas 1 grad
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

        for g in grupuri:
            ys = [l[0] for l in g]
            xs0 = min(l[1] for l in g)
            xs1 = max(l[2] for l in g)
            interlinie = (ys[-1] - ys[0]) / max(1, len(g) - 1)
            # Rafinare: extindem chenarul pana la spatiu alb in toate
            # directiile (prinde notele, legato-urile si liniile ratate).
            # Decizia se ia pe imaginea FARA text de corp (rot_dec).
            x0, y0, x1, y1 = rafineaza_chenar(rot_dec, xs0, ys[0], xs1, ys[-1] + 1,
                                              interlinie)
            crop = rot[y0:y1, x0:x1].copy()  # crop-ul e deja INDREPTAT
            nr_linii = max(len(g), numara_linii_in_chenar(rot_dec, x0, y0, x1, y1))

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
        # exista cerneala in fasia dintre chenare? (liniile continua)
        fy0 = max(0, max(ay0, by0)); fy1 = min(h, min(ay1, by1))
        fx0 = max(0, stanga["bbox"][2]); fx1 = min(w, dreapta["bbox"][0])
        fasie = gray[fy0:fy1, fx0:fx1]
        return fasie.size > 0 and float((fasie < GRI_INCHIS).mean()) > 0.01

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
                nou = {
                    "bbox": bb,
                    "unghi": unghi,
                    "nr_linii": max(a["nr_linii"], b["nr_linii"]),
                    "interlinie": interlinie,
                    "lungime": bb[2] - bb[0],
                    "crop": rot2[cy0:cy1, cx0:cx1].copy(),
                }
                finale = [f for k, f in enumerate(finale) if k not in (i, j)] + [nou]
                unite = True
                break
            if unite:
                break

    return finale


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
    for pno, page in enumerate(doc):
        gray = render_gray(page, dpi)
        h, w = gray.shape
        masca = np.ones((h, w), dtype=bool)
        for r in zone_sterse[pno]:
            x0, y0, x1, y1 = rect_px(r, scale)
            masca[max(0, y0):min(h, y1), max(0, x0):min(w, x1)] = False
        # imaginea de DECIZIE: textul de corp (format majoritar, randuri
        # lungi) devine alb, ca sa nu fie confundat cu partiturile si sa
        # nu fie inclus in chenare
        gray_dec = gray.copy()
        gray_dec[masca_text_pagina(page, majoritar, dpi, gray.shape)] = 255
        gasite = scaneaza_pagina(gray, gray_dec, masca, dpi)
        gasite.sort(key=lambda p: (p["bbox"][1], p["bbox"][0]))
        detectii.append(gasite)
        if gasite:
            unghiuri = sorted({p["unghi"] for p in gasite})
            print(f"  pagina {pno + 1}: {len(gasite)} partitura/i (unghi {unghiuri})")

    # 2) Evidenta: pe ce pagini apare si dispare fiecare partitura.
    #    O partitura care se termina la finalul unei pagini si alta care
    #    incepe imediat la inceputul paginii urmatoare = ACEEASI partitura.
    partituri = []
    for pno, gasite in enumerate(detectii):
        for i, det in enumerate(gasite):
            este_continuare = False
            if i == 0 and pno > 0 and partituri:
                ultima = partituri[-1]
                pg_ant, det_ant = ultima["bucati"][-1]
                if pg_ant == pno - 1:
                    h_ant = int(doc[pno - 1].rect.height * scale)
                    prag = det_ant["interlinie"] * 6
                    aproape_de_jos = (h_ant - det_ant["bbox"][3]) < prag
                    aproape_de_sus = det["bbox"][1] < det["interlinie"] * 6
                    if aproape_de_jos and aproape_de_sus:
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
        nume = (f"partitura-{p['litera']}-{pg_txt}.png" if p["litera"]
                else f"partitura-{pg_txt}.png")

        cropuri = [det["crop"] for _, det in p["bucati"]]
        if len(cropuri) == 1:
            imagine = cropuri[0]
        else:
            lat = max(c.shape[1] for c in cropuri)
            bucati = []
            gol = np.full((12, lat), 255, dtype=np.uint8)
            for k, c in enumerate(cropuri):
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
            "pagini": pagini,
            "unghi_grade": p["bucati"][0][1]["unghi"],
            "nr_linii": [det["nr_linii"] for _, det in p["bucati"]],
        })
        print(f"  {nume}  (pagini: {pagini}, linii: "
              f"{[d['nr_linii'] for _, d in p['bucati']]}, "
              f"unghi: {p['bucati'][0][1]['unghi']} grade)")

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
