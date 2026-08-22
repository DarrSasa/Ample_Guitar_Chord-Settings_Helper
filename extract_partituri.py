#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
proceseaza-pdf-partituri.py

Proceseaza un PDF (cu text selectabil) in 3 etape:

ETAPA 1 - Filtrarea textului dupa format si suprapunere
    * Analizeaza TOT documentul si calculeaza procentajul de utilizare al
      fiecarui format de litere (font + marime).
    * Identifica formatul MAJORITAR (cel mai mare procentaj).
    * Sterge literele acestui format DOAR daca fac parte din randuri
      suprapuse (cel putin doua randuri ale caror dreptunghiuri se
      intersecteaza).
    * EXCEPTIE: un rand care are spatiu alb deasupra SI dedesubt, pe toata
      lungimea lui (verificat pe pagina randata), NU se sterge.

ETAPA 2 - Filtrarea imaginilor color vs. alb-negru/gri
    * Cauta toate imaginile din document.
    * Daca o imagine contine culori -> o sterge.
    * Daca e exclusiv alb/negru/gri -> o pastreaza.

ETAPA 3 - Detectarea, etichetarea si extragerea partiturilor
    * Tine evidenta zonelor sterse la etapele 1-2 si scaneaza EXCLUSIV in
      zonele ramase.
    * Scaneaza cu o fereastra plata (inaltime suficienta pt. cel putin 2
      linii orizontale paralele) si cauta linii paralele gri/negre cu
      spatiu EGAL intre ele, umplut de la stanga la dreapta cu pixeli albi
      sau aproape albi (dar nu gri).
    * Scaneaza fiecare pagina de 20+ ori, inclinand fereastra cu cate 1
      grad (de la -10 la +10 grade), ca sa prinda si partiturile stramb
      imprimate.
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
    <pdf>-procesat.pdf                     <- PDF-ul filtrat (etapele 1-2)
    imagini_partituri/partitura-A-p22-23.png  (etc.)
    imagini_partituri/manifest.json        <- evidenta partiturilor

Dependinte (o singura data):
    pip install pymupdf opencv-python-headless numpy

Folosire:
    python extract_partituri.py "carte.pdf"
    python extract_partituri.py "carte.pdf" --out-dir imagini_partituri --dpi 200
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
# Praguri globale (reglabile din linia de comanda unde are sens)
# ---------------------------------------------------------------------------
ALB = 235          # pixel >= ALB  -> "alb sau aproape alb" (nu gri)
CERNEALA = 200     # pixel <  CERNEALA -> cerneala (negru sau gri inchis)
PRAG_COLOR = 18    # diferenta max intre canalele R/G/B ca un pixel sa fie "gri"
FRACT_COLOR = 0.02 # >2% pixeli colorati -> imaginea e "color"


# ---------------------------------------------------------------------------
# Utilitare
# ---------------------------------------------------------------------------
def render_gray(page, dpi):
    """Randeaza pagina in tonuri de gri ca matrice numpy uint8."""
    mat = fitz.Matrix(dpi / 72.0, dpi / 72.0)
    pix = page.get_pixmap(matrix=mat, colorspace=fitz.csGRAY, alpha=False)
    return np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width).copy()


def rect_px(rect, scale):
    """fitz.Rect (puncte PDF) -> (x0, y0, x1, y1) in pixeli la scala data."""
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


# ===========================================================================
# ETAPA 1 - text: format majoritar + randuri suprapuse
# ===========================================================================
def cheie_format(span):
    """Formatul unei bucati de text = font + marime (rotunjita)."""
    return f"{span.get('font', '?')}|{round(float(span.get('size', 0)), 1)}"


def statistici_fonturi(doc):
    """Numara literele fiecarui format din tot documentul si intoarce
    (contor, format_majoritar, procentaje)."""
    contor = Counter()
    for page in doc:
        d = page.get_text("dict")
        for bloc in d.get("blocks", []):
            if bloc.get("type", 0) != 0:
                continue
            for linie in bloc.get("lines", []):
                for span in linie.get("spans", []):
                    text = span.get("text", "")
                    n = len(text.strip()) or 0
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
    # La marginea paginii consideram ca exista spatiu alb.
    sus_alb = sus.size == 0 or sus.min() >= ALB
    jos_alb = jos.size == 0 or jos.min() >= ALB
    return sus_alb and jos_alb


def etapa1_filtrare_text(doc, dpi, zone_sterse):
    """Sterge literele formatului majoritar din randurile suprapuse.
    Umple `zone_sterse[pagina]` cu dreptunghiurile (fitz.Rect) sterse."""
    contor, majoritar, procente = statistici_fonturi(doc)
    if not majoritar:
        print("  (nu exista text selectabil in document)")
        return None, {}

    print("  Procentaje formate de litere:")
    for k, p in sorted(procente.items(), key=lambda kv: -kv[1])[:10]:
        marcaj = "  <-- MAJORITAR" if k == majoritar else ""
        print(f"    {k:<40s} {p:6.2f}%{marcaj}")

    scale = dpi / 72.0
    total_sterse = 0

    for pno, page in enumerate(doc):
        gray = render_gray(page, dpi)  # pagina ORIGINALA, inainte de stersaturi
        d = page.get_text("dict")

        # Adunam toate randurile de text ale paginii.
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
                continue  # randul nu face parte din randuri suprapuse
            # EXCEPTIA: spatiu alb deasupra SI dedesubt pe toata lungimea.
            if rand_are_spatiu_alb(gray, rect_px(r, scale)):
                continue
            for span in spans:
                if cheie_format(span) == majoritar and span.get("text", "").strip():
                    de_sters.append(fitz.Rect(span["bbox"]))

        for r in de_sters:
            page.add_redact_annot(r)
        if de_sters:
            # Stergem DOAR textul; imaginile/grafica raman neatinse.
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
    """True daca imaginea cu xref-ul dat contine culori (nu doar alb/negru/gri)."""
    try:
        pix = fitz.Pixmap(doc, xref)
        if pix.alpha:
            pix = fitz.Pixmap(pix, 0)  # aruncam canalul alfa
        if pix.n == 1:
            return False  # deja grayscale
        if pix.colorspace and pix.colorspace.n != 3:
            pix = fitz.Pixmap(fitz.csRGB, pix)
        arr = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)
        rgb = arr[:, :, :3].astype(np.int16)
        # Un pixel e "gri" daca R≈G≈B; altfel e colorat.
        dif = rgb.max(axis=2) - rgb.min(axis=2)
        fract_color = float((dif > PRAG_COLOR).mean())
        return fract_color > FRACT_COLOR
    except Exception as e:
        print(f"    (nu pot analiza imaginea xref={xref}: {e})")
        return False


def etapa2_filtrare_imagini(doc, zone_sterse):
    """Sterge imaginile color; pastreaza pe cele alb-negru/gri."""
    sterse = pastrate = 0
    for pno, page in enumerate(doc):
        for info in page.get_images(full=True):
            xref = info[0]
            rects = page.get_image_rects(xref)
            if not rects:
                continue
            if imagine_este_color(doc, xref):
                for r in rects:
                    zone_sterse[pno].append(fitz.Rect(r))
                page.delete_image(xref)
                sterse += len(rects)
            else:
                pastrate += len(rects)
    print(f"  Imagini COLOR sterse: {sterse} | imagini alb-negru/gri pastrate: {pastrate}")


# ===========================================================================
# ETAPA 3 - detectarea partiturilor cu fereastra plata + inclinare -10..+10
# ===========================================================================
def linii_orizontale(gray, masca_permisa, dpi, lat_min_fract=0.25):
    """Gaseste liniile orizontale (gri sau negre) dintr-o imagine.

    Intoarce lista de (y_centru, x_stanga, x_dreapta) pentru fiecare linie
    care se intinde pe cel putin `lat_min_fract` din latimea paginii.
    Cauta doar in zonele permise (masca_permisa == True).

    Ca sa nu confunde textul cu liniile de portativ, o "linie" trebuie:
      - sa fie SUBTIRE (liniile de portativ au cativa pixeli grosime,
        randurile de text sunt mult mai inalte);
      - sa fie CONTINUA de la stanga la dreapta (textul are goluri intre
        litere si cuvinte).
    """
    h, w = gray.shape
    grosime_max = max(4, int(round(dpi / 30.0)))  # ~7px la 200 dpi
    cerneala = (gray < CERNEALA) & masca_permisa
    rowink = cerneala.sum(axis=1).astype(np.float64)
    prag = w * lat_min_fract
    este_linie = rowink >= prag

    linii = []
    y = 0
    while y < h:
        if este_linie[y]:
            y0 = y
            while y < h and este_linie[y]:
                y += 1
            if (y - y0) > grosime_max:
                continue  # banda prea groasa -> probabil text/imagine, nu linie
            centru = (y0 + y - 1) // 2
            acoperire_col = cerneala[y0:y].any(axis=0)
            cols = np.where(acoperire_col)[0]
            xa, xb = int(cols[0]), int(cols[-1])
            # Continuitate: aproape toate coloanele dintre capete au cerneala.
            if float(acoperire_col[xa:xb + 1].mean()) < 0.85:
                continue  # intrerupta -> probabil rand de text
            linii.append((centru, xa, xb))
        else:
            y += 1
    return linii


def spatiu_dintre_linii_este_alb(gray, l1, l2, marja=2):
    """Verifica daca intre doua linii spatiul e format din pixeli albi sau
    aproape albi (dar NU gri), de la stanga la dreapta."""
    y1, xa1, xb1 = l1
    y2, xa2, xb2 = l2
    x0 = max(xa1, xa2)
    x1 = min(xb1, xb2)
    top = min(y1, y2) + marja + 1
    bot = max(y1, y2) - marja
    if x1 <= x0 or bot <= top:
        return True  # spatiu prea mic ca sa-l putem judeca
    banda = gray[top:bot, x0:x1]
    # "albi sau aproape albi (dar nu gri)": cerem ca aproape toti pixelii
    # dintre linii sa fie >= ALB.
    return float((banda >= ALB).mean()) >= 0.92


def grupeaza_in_partituri(linii, gray):
    """Grupeaza liniile paralele in partituri: cel putin 2 linii, cu spatiu
    EGAL intre ele si spatiu alb intre linii, si cu aceeasi intindere
    stanga-dreapta."""
    grupuri = []
    grup = []
    for lin in sorted(linii, key=lambda t: t[0]):
        if not grup:
            grup = [lin]
            continue
        prev = grup[-1]
        dist = lin[0] - prev[0]
        # Liniile unui portativ au intre ele o distanta rezonabila...
        ok_dist = 3 <= dist <= max(6, int(gray.shape[0] * 0.02))
        # ... EGALA cu distanta precedenta (toleranta 25%) ...
        if ok_dist and len(grup) >= 2:
            d0 = grup[-1][0] - grup[-2][0]
            ok_dist = abs(dist - d0) <= max(2, 0.25 * d0)
        # ... aceeasi intindere orizontala (toleranta 10% din latime) ...
        tol = 0.10 * gray.shape[1]
        ok_span = abs(lin[1] - prev[1]) <= tol and abs(lin[2] - prev[2]) <= tol
        # ... si spatiu ALB (nu gri) intre ele, de la stanga la dreapta.
        ok_alb = spatiu_dintre_linii_este_alb(gray, prev, lin)

        if ok_dist and ok_span and ok_alb:
            grup.append(lin)
        else:
            if len(grup) >= 2:
                grupuri.append(grup)
            grup = [lin]
    if len(grup) >= 2:
        grupuri.append(grup)
    return grupuri


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


def scaneaza_pagina(gray, masca_permisa, dpi):
    """Scaneaza pagina cu fereastra plata, inclinata de la -10 la +10 grade
    (pas de 1 grad), si intoarce lista de partituri detectate:
        [{'bbox': (x0,y0,x1,y1) in pixeli pe pagina NEROTITA,
          'unghi': grade, 'nr_linii': n, 'crop': imagine indreptata}]

    Detectiile din toate trecerile sunt adunate, apoi duplicatele (aceeasi
    partitura vazuta la unghiuri vecine) sunt eliminate, pastrand varianta
    cu cele mai multe linii / cele mai lungi / cel mai mic unghi.
    """
    h, w = gray.shape
    centru = (w / 2.0, h / 2.0)
    candidati = []

    for unghi in range(-10, 11):  # 21 de treceri: -10..+10, pas 1 grad
        if unghi == 0:
            rot, rot_masca, M = gray, masca_permisa, None
        else:
            M = cv2.getRotationMatrix2D(centru, unghi, 1.0)
            rot = cv2.warpAffine(gray, M, (w, h), flags=cv2.INTER_LINEAR,
                                 borderMode=cv2.BORDER_CONSTANT, borderValue=255)
            rot_masca = cv2.warpAffine(masca_permisa.astype(np.uint8), M, (w, h),
                                       flags=cv2.INTER_NEAREST,
                                       borderMode=cv2.BORDER_CONSTANT,
                                       borderValue=0).astype(bool)
        linii = linii_orizontale(rot, rot_masca, dpi)
        grupuri = grupeaza_in_partituri(linii, rot)
        M_inv = cv2.invertAffineTransform(M) if M is not None else None

        for g in grupuri:
            ys = [l[0] for l in g]
            xs0 = min(l[1] for l in g)
            xs1 = max(l[2] for l in g)
            interlinie = (ys[-1] - ys[0]) / max(1, len(g) - 1)
            # Marja generoasa in jurul liniilor (note deasupra/sub portativ).
            marja_y = int(interlinie * 2.5)
            marja_x = int(interlinie * 1.5)
            y0 = max(0, int(ys[0] - marja_y)); y1 = min(h, int(ys[-1] + marja_y))
            x0 = max(0, xs0 - marja_x);        x1 = min(w, xs1 + marja_x)

            crop = rot[y0:y1, x0:x1].copy()  # crop-ul e deja INDREPTAT

            if M_inv is None:
                bbox = (x0, y0, x1, y1)
            else:
                # Transformam colturile inapoi in coordonatele paginii nerotite.
                colturi = np.array([[x0, y0], [x1, y0], [x1, y1], [x0, y1]],
                                   dtype=np.float64)
                ones = np.ones((4, 1))
                orig = (np.hstack([colturi, ones]) @ M_inv.T)
                bbox = (max(0, int(orig[:, 0].min())), max(0, int(orig[:, 1].min())),
                        min(w, int(orig[:, 0].max())), min(h, int(orig[:, 1].max())))

            candidati.append({
                "bbox": bbox,
                "unghi": unghi,
                "nr_linii": len(g),
                "interlinie": interlinie,
                "lungime": xs1 - xs0,
                "crop": crop,
            })

    # Eliminarea duplicatelor: aceeasi partitura apare la mai multe unghiuri
    # vecine; pastram detectia cea mai buna (mai multe linii, mai lungi,
    # unghi cat mai mic).
    candidati.sort(key=lambda d: (-d["nr_linii"], -d["lungime"], abs(d["unghi"])))
    finale = []
    for c in candidati:
        if all(suprapunere_bbox(c["bbox"], f["bbox"]) < 0.3 for f in finale):
            finale.append(c)
    return finale


def etapa3_partituri(doc, dpi, zone_sterse, out_dir):
    """Detecteaza partiturile si le exporta ca PNG in `out_dir`.

    Identificarea NU se scrie in PDF: ea devine numele fisierului PNG.
    Litera (A, B, ...) se adauga DOAR cand mai multe partituri impart
    aceleasi pagini si trebuie deosebite intre ele:
        partitura-A-p22-23.png, partitura-B-p22-23.png, partitura-p31.png
    """
    scale = dpi / 72.0
    os.makedirs(out_dir, exist_ok=True)

    # 1) Detectie pe fiecare pagina, doar in zonele ramase (nesterse).
    detectii = []  # lista per pagina
    for pno, page in enumerate(doc):
        gray = render_gray(page, dpi)
        h, w = gray.shape
        masca = np.ones((h, w), dtype=bool)
        for r in zone_sterse[pno]:
            x0, y0, x1, y1 = rect_px(r, scale)
            masca[max(0, y0):min(h, y1), max(0, x0):min(w, x1)] = False
        gasite = scaneaza_pagina(gray, masca, dpi)
        gasite.sort(key=lambda p: p["bbox"][1])
        detectii.append(gasite)
        if gasite:
            unghiuri = sorted({p["unghi"] for p in gasite})
            print(f"  pagina {pno + 1}: {len(gasite)} partitura/i (unghi {unghiuri})")

    # 2) Evidenta: pe ce pagini apare si dispare fiecare partitura.
    #    O partitura care se termina la finalul unei pagini si alta care
    #    incepe imediat la inceputul paginii urmatoare = ACEEASI partitura.
    partituri = []  # {'bucati': [(pagina, det), ...]}
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
        vecini = [q for q in partituri
                  if q is not p and set(q["pagini"]) & set(p["pagini"])]
        p["are_litera"] = bool(vecini)
    # Literele se dau in ordine, per grup de pagini care se suprapun.
    litere_folosite = 0
    grup_anterior = None
    for p in partituri:
        if not p["are_litera"]:
            p["litera"] = None
            continue
        grup_curent = tuple(p["pagini"])
        # resetam alfabetul cand trecem la alt grup de pagini
        if grup_anterior is not None and not (set(grup_curent) & set(grup_anterior)):
            litere_folosite = 0
        p["litera"] = litera_partitura(litere_folosite)
        litere_folosite += 1
        grup_anterior = grup_curent

    # 4) Export PNG: bucatile de pe pagini consecutive se lipesc vertical
    #    intr-un singur fisier.
    manifest = {"partituri": [], "zone_sterse": {}}
    for p in partituri:
        pagini = p["pagini"]
        pg_txt = f"p{pagini[0]}" if len(pagini) == 1 else f"p{pagini[0]}-{pagini[-1]}"
        if p["litera"]:
            nume = f"partitura-{p['litera']}-{pg_txt}.png"
        else:
            nume = f"partitura-{pg_txt}.png"

        cropuri = [det["crop"] for _, det in p["bucati"]]
        if len(cropuri) == 1:
            imagine = cropuri[0]
        else:
            # Lipim bucatile una sub alta, aliniate la stanga, cu un mic
            # spatiu alb intre ele.
            lat = max(c.shape[1] for c in cropuri)
            bucati_egale = []
            gol = np.full((12, lat), 255, dtype=np.uint8)
            for k, c in enumerate(cropuri):
                if c.shape[1] < lat:
                    pad = np.full((c.shape[0], lat - c.shape[1]), 255, dtype=np.uint8)
                    c = np.hstack([c, pad])
                bucati_egale.append(c)
                if k < len(cropuri) - 1:
                    bucati_egale.append(gol)
            imagine = np.vstack(bucati_egale)

        cale = os.path.join(out_dir, nume)
        cv2.imwrite(cale, imagine)

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
        description="Filtreaza textul majoritar suprapus si imaginile color "
                    "dintr-un PDF, apoi detecteaza/eticheteaza/exporta partiturile.")
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
    zone_sterse = [[] for _ in range(len(doc))]  # evidenta zonelor sterse

    print(f"PDF: {args.pdf} ({len(doc)} pagini)")
    print("\n=== ETAPA 1: filtrare text (format majoritar, randuri suprapuse) ===")
    etapa1_filtrare_text(doc, args.dpi, zone_sterse)

    print("\n=== ETAPA 2: filtrare imagini (color -> sters, alb/negru/gri -> pastrat) ===")
    etapa2_filtrare_imagini(doc, zone_sterse)

    print("\n=== ETAPA 3: detectare + etichetare + export partituri ===")
    nr = etapa3_partituri(doc, args.dpi, zone_sterse, args.out_dir)

    doc.save(out_pdf, garbage=3, deflate=True)
    doc.close()
    print(f"\nGata. {nr} partitura/i detectate.")
    print(f"  PDF procesat : {out_pdf}")
    print(f"  PNG-uri      : {args.out_dir}/")
    print(f"  Manifest     : {os.path.join(args.out_dir, 'manifest.json')}")


if __name__ == "__main__":
    main()
