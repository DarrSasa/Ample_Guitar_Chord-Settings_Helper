# Folder pentru PDF-uri de test

Incarca aici PDF-ul real de test (< 10 pagini, cu text selectabil).

IMPORTANT: incarca-l pe branch-ul `arena/01a02a61-ample-guitar-chord-settings-he`
(nu pe `main`), ca sa-l vad in sesiunea de lucru.

Cum se incarca pe GitHub (din browser):
1. Deschide repo-ul si selecteaza branch-ul `arena/01a02a61-ample-guitar-chord-settings-he`
   din lista de branch-uri (stanga sus).
2. Intra in folderul `test_pdf/`.
3. `Add file` -> `Upload files` -> trage PDF-ul -> `Commit changes`
   (direct pe acelasi branch).

Scriptul `extract_partituri.py` (din radacina repo-ului) se ruleaza asa:

    python extract_partituri.py "test_pdf/numele-fisierului.pdf"

PNG-urile cu partiturile detectate ajung in `imagini_partituri/`.
