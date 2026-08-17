# Adaugare / stergere librarii de chitara

Librariile se gestioneaza **doar prin foldere** — fara modificat cod. Motorul
sampler le scaneaza automat la pornire.

## Locatia librariilor

- **In repo / local:** `public/guitar samples/` (aici le tii tu pe PC).
- **In EXE-ul portabil / instalat:** `...\resources\app\dist\guitar samples\`
  (Build-Installer.ps1 le copiaza automat din `public/guitar samples/`).

## Adaugare librarie

1. Copiaza folderul dezarhivat al librariei in `public/guitar samples/`, ex.:

```
public/guitar samples/
└── RS - Acoustic Guitar 1/          <- folderul librariei
      ├── Chords/...
      ├── Single Notes/...
      └── library.json               <- optional (vezi DESCRIPTOR-FORMAT.md)
```

2. (Optional) Verifica daca e detectata corect:

```powershell
node --experimental-strip-types scripts/list-libraries.mjs "public/guitar samples"
```

3. Rebuild EXE: `.\Build-Installer.ps1 -Mode Portable -SkipInstall`

## Stergere librarie

1. Sterge folderul ei din `public/guitar samples/`.
2. Rebuild EXE.

Atat. Nu se modifica nimic in cod.

## Verificare rapida (fara build)

Ca sa vezi cum "vede" samplerul librariile, ruleaza:

```powershell
node --experimental-strip-types scripts/list-libraries.mjs
```

Afiseaza: librariile, prefixul vendor, notele MIDI gasite, acordurile si
variantele din meniu. Daca o librarie NU apare acolo, nu va aparea nici in
aplicatie (verifica structura de foldere: `Chords/` si `Single Notes/` direct
sub folderul librariei).

## Atentie

- Librariile **NU se comiteaza in git** (sunt mari). `.gitignore`-ul ignora
  continutul lui `public/guitar samples/`, pastrand doar `README.md`.
- Folderul librariei trebuie sa contina `Single Notes/` (cu subfoldere
  `N - Nota/`) si/sau `Chords/` (cu subfoldere `Root Major|Minor/`) ca sa fie
  detectata.
