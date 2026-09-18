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
import asyncio, json, os, re
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE / "colectat" / "crawl"
SURSE = HERE / "colectat" / "surse-accesibile.json"

QUERY = "guitar chord theory intervals scales tunings techniques articulations"


def safe(name):
    return re.sub(r"[^A-Za-z0-9_-]+", "_", name).strip("_") or "site"


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
