#!/usr/bin/env python3
"""Colectare avansata a teoriei de chitara cu Crawl4AI (Open-Source, Apache-2.0).

Crawl4AI randeaza JavaScript si scoate Markdown curat + JSON structurat, deci
poate intra pe site-uri pe care un simplu curl/requests nu le poate citi
(all-guitar-chords, oolimo, chordpic, jguitar etc.), in orice limba.

Instalare (o singura data):
  pip install -r requirements-crawl4ai.txt
  playwright install chromium

Rulare:
  py colectare_crawl4ai.py
Citeste sursele din colectat/surse-accesibile.json (categoriile html_parsabil si
de_testat) si scrie rezultatele in colectat/crawl/ (<site>.md + <site>.json) si
colectat/crawl/manifest_crawl.json. Nu foloseste cheia API.
"""
import asyncio, json, os, re, urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE / "colectat" / "crawl"
SURSE = HERE / "colectat" / "surse-accesibile.json"

QUERY = "guitar chord theory intervals scales tunings techniques articulations"


def safe(name):
    return re.sub(r"[^A-Za-z0-9_-]+", "_", name).strip("_") or "site"


# --- DESCOPERIRE AUTOMATA A SITE-URILOR DIN TOATE LIMBILE -------------------
# Un singur call MediaWiki langlinks intoarce articolul respectiv in ~300 limbi.
# Astfel "gasirea site-urilor din toate limbile" e automata, nu manuala.
SEED_ARTICLES = ["Guitar", "Chord", "Music_theory", "Guitar_technique",
                 "Strum", "Palm_mute", "Harmonic", "Vibrato", "Tapping", "Rasgueado"]


def descopera_wikipedia_multilingv():
    urls = []
    for art in SEED_ARTICLES:
        api = ("https://en.wikipedia.org/w/api.php?action=query&prop=langlinks"
               f"&titles={art}&format=json&lllimit=500")
        try:
            with urllib.request.urlopen(api, timeout=30) as r:
                data = json.loads(r.read().decode("utf-8"))
            pages = data.get("query", {}).get("pages", {})
            for p in pages.values():
                for ll in p.get("langlinks", []):
                    lang = ll.get("lang"); title = ll.get("*")
                    if lang and title:
                        t = title.replace(" ", "_")
                        urls.append(f"https://{lang}.wikipedia.org/wiki/{t}")
        except Exception as e:
            print("WARN langlinks", art, str(e)[:80])
    # de-dup
    return sorted(set(urls))



async def crawl_one(crawler, url, cfg):
    try:
        r = await crawler.arun(url=url, config=cfg)
        if not r.success:
            return {"url": url, "ok": False, "err": str(getattr(r, "error_message", ""))[:200]}
        md = ""
        if r.markdown:
            md = r.markdown.fit_markdown or r.markdown.raw_markdown or ""
        meta = getattr(r, "metadata", {}) or {}
        return {"url": url, "ok": True, "title": meta.get("title", ""),
                "lang": meta.get("language", ""), "chars": len(md), "md": md}
    except Exception as e:
        return {"url": url, "ok": False, "err": str(e)[:200]}


async def main():
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--wikipedia", action="store_true",
                    help="descopera si crawleaza paginile din toate limbile prin langlinks")
    ap.add_argument("--max", type=int, default=60,
                    help="numarul maxim de pagini Wikipedia de crawluit (default 60)")
    a = ap.parse_args()

    from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig
    from crawl4ai.content_filter_strategy import BM25ContentFilter
    from crawl4ai.markdown_generation_strategy import DefaultMarkdownGenerator

    OUT.mkdir(parents=True, exist_ok=True)
    surse = json.loads(SURSE.read_text(encoding="utf-8"))
    urls = []
    for cat in ("html_parsabil", "de_testat"):
        for s in surse.get(cat, []):
            if s.get("url"):
                urls.append(s["url"])
    if a.wikipedia:
        wiki = descopera_wikipedia_multilingv()[: a.max]
        print("Descoperite", len(wiki), "pagini Wikipedia multilingve.")
        urls += wiki
    print("Voi crawl-ui", len(urls), "surse...")

    cfg = CrawlerRunConfig(
        markdown_generator=DefaultMarkdownGenerator(
            content_filter=BM25ContentFilter(user_query=QUERY, bm25_threshold=0.5)),
        magic=True, simulate_user=True, wait_until="load",
        page_timeout=45000, excluded_tags=["script", "style", "nav", "footer", "header"],
    )
    manifest = []
    async with AsyncWebCrawler(config=BrowserConfig(headless=True)) as crawler:
        for url in urls:
            rez = await crawl_one(crawler, url, cfg)
            tag = safe(url.split("//")[-1].split("/")[0])
            if rez.get("ok"):
                (OUT / (tag + ".md")).write_text(rez.get("md", ""), encoding="utf-8")
                (OUT / (tag + ".json")).write_text(json.dumps(
                    {k: v for k, v in rez.items() if k != "md"},
                    ensure_ascii=False, indent=1), encoding="utf-8")
            print(("OK " if rez.get("ok") else "FAIL"), url, rez.get("chars", rez.get("err", "")))
            manifest.append({k: v for k, v in rez.items() if k != "md"})
    (OUT / "manifest_crawl.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1),
                                            encoding="utf-8")
    print("Gata. Manifest:", OUT / "manifest_crawl.json")


if __name__ == "__main__":
    asyncio.run(main())
