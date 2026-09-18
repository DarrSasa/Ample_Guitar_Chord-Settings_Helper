#!/usr/bin/env python3
"""Colectare teorie de chitara prin OpenRouter, FARA Codex.

Foloseste doar libraria standard (urllib). Citeste cheia dintr-un fisier privat,
trimite PROMPT-OpenRouter-direct.txt catre modelul deepseek/deepseek-v4.1-flash
si salveaza JSON-ul returnat in colectat/. Afiseaza progresul in consola (nu tace).

Utilizare:
  py colectare_openrouter.py ^
     --key-file  "C:\...\DeepAstra_openrouter_key.txt" ^
     --prompt-file "C:\...\PROMPT-OpenRouter-direct.txt" ^
     --out-dir "C:\...\colectat"
"""
import argparse, json, os, re, sys, urllib.request

MODEL = "deepseek/deepseek-v4.1-flash"
URL = "https://openrouter.ai/api/v1/chat/completions"


def citeste(p):
    with open(p, "r", encoding="utf-8") as f:
        return f.read().strip()


def extrage_json(text):
    # elimina fence markdown daca exista
    m = re.search(r"```(?:json)?\s*(\{.*\})\s*```", text, re.S)
    if m:
        return json.loads(m.group(1))
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1:
        raise ValueError("Raspunsul nu contine JSON")
    return json.loads(text[start:end + 1])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--key-file", required=True)
    ap.add_argument("--prompt-file", required=True)
    ap.add_argument("--out-dir", default="colectat")
    ap.add_argument("--max-tokens", type=int, default=16000)
    a = ap.parse_args()

    key = citeste(a.key_file)
    prompt = citeste(a.prompt_file)
    if not key:
        print("EROARE: fisierul de cheie e gol."); sys.exit(1)

    os.makedirs(a.out_dir, exist_ok=True)
    print("Trimit cererea catre OpenRouter (%s)..." % MODEL)
    body = json.dumps({
        "model": MODEL,
        "temperature": 0.2,
        "max_tokens": a.max_tokens,
        "messages": [{"role": "user", "content": prompt}],
    }).encode("utf-8")
    req = urllib.request.Request(URL, data=body, method="POST", headers={
        "Authorization": "Bearer " + key,
        "Content-Type": "application/json",
    })
    try:
        with urllib.request.urlopen(req, timeout=600) as r:
            resp = json.loads(r.read().decode("utf-8"))
    except Exception as e:
        print("EROARE retea/API:", e); sys.exit(2)

    msg = resp["choices"][0]["message"]["content"]
    print("Raspuns primit: %d caractere." % len(msg))
    try:
        data = extrage_json(msg)
    except Exception as e:
        print("EROARE: JSON invalid in raspuns:", e)
        open(os.path.join(a.out_dir, "raw-raspuns.txt"), "w", encoding="utf-8").write(msg)
        sys.exit(3)

    out = os.path.join(a.out_dir, "teorie_openrouter_direct.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    manifest = {
        "fisier": [os.path.basename(out)],
        "total_acorduri": len(data.get("acorduri", [])),
        "total_game": len(data.get("game", [])),
        "total_acordaje": len(data.get("acordaje", [])),
        "total_ritmuri": len(data.get("ritmuri", [])),
        "total_articulatii_fx": len(data.get("articulatii_fx", [])),
    }
    with open(os.path.join(a.out_dir, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=1)
    print("SALVAT:", out)
    print(json.dumps(manifest, ensure_ascii=False, indent=1))
    usage = resp.get("usage", {})
    print("Tokeni: in=%s out=%s" % (usage.get("prompt_tokens"), usage.get("completion_tokens")))


if __name__ == "__main__":
    main()
