#!/usr/bin/env python3
"""Colectare cu Crawl4AI a articulatiilor/FX la instrumente cu corzi din toata
lumea, in folderul `crawl_similar/`.

Descopera automat paginile in TOATE limbile prin MediaWiki langlinks (batched,
fara 429) pentru semintele din `colectat/surse_similar.json` + siteurile fixe,
apoi crawleaza cu Crawl4AI si scrie <site>.md/.json in crawl_similar/.

Instalare (o data):  pip install -r requirements-crawl4ai.txt  &&  playwright install chromium
Rulare:             py colectare_similar_crawl4ai.py [--max N] [--fara-wikipedia]
"""
import asyncio, hashlib, json, re, time, urllib.parse, urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE / "crawl_similar"
SURSE = HERE / "colectat" / "surse_similar.json"
QUERY = "string instrument articulations techniques tremolo slide vibrato rasgueado percussive"

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")


def safe(name):
    return re.sub(r"[^A-Za-z0-9_-]+", "_", name).strip("_") or "site"


def descopera_multilingv(seeds):
    urls = []
    for i in range(0, len(seeds), 40):
        batch = seeds[i:i + 40]
        titles = urllib.parse.quote("|".join(batch))
        api = ("https://en.wikipedia.org/w/api.php?action=query&prop=langlinks"
               f"&titles={titles}&format=json&lllimit=500")
        try:
            req = urllib.request.Request(api, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=60) as r:
                data = json.loads(r.read().decode("utf-8"))
            for p in data.get("query", {}).get("pages", {}).values():
                for ll in p.get("langlinks", []):
                    lang, title = ll.get("lang"), ll.get("*")
                    if lang and title:
                        t = urllib.parse.quote(title.replace(" ", "_"))
                        urls.append(f"https://{lang}.wikipedia.org/wiki/{t}")
        except Exception as e:
            print("WARN langlinks batch", i, str(e)[:80])
        time.sleep(1.5)
    return sorted(set(urls))


async def main():
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--max", type=int, default=80, help="max pagini Wikipedia (0=tot)")
    ap.add_argument("--fara-wikipedia", action="store_true")
    a = ap.parse_args()

    from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig
    from crawl4ai.content_filter_strategy import BM25ContentFilter
    from crawl4ai.markdown_generation_strategy import DefaultMarkdownGenerator

    OUT.mkdir(parents=True, exist_ok=True)
    surse = json.loads(SURSE.read_text(encoding="utf-8"))
    urls = [s["url"] for s in surse.get("siteuri_fixe", []) if s.get("url")]
    if not a.fara_wikipedia:
        seeds = surse.get("seeds_instrumente", []) + surse.get("seeds_tehnici", [])
        wiki = descopera_multilingv(seeds)
        if a.max > 0:
            wiki = wiki[: a.max]
        print("Descoperite", len(wiki), "pagini Wikipedia multilingve.")
        urls += wiki
    print("Voi crawl-ui", len(urls), "surse in crawl_similar/ ...")

    cfg = CrawlerRunConfig(
        markdown_generator=DefaultMarkdownGenerator(
            content_filter=BM25ContentFilter(user_query=QUERY, bm25_threshold=0.4)),
        magic=True, simulate_user=True, wait_until="load", page_timeout=45000,
        excluded_tags=["script", "style", "nav", "footer", "header"])

    manifest = []
    async with AsyncWebCrawler(config=BrowserConfig(headless=True)) as crawler:
        for url in urls:
            tag = safe(url.split("//")[-1])
            if len(tag) > 120:
                tag = tag[:110] + "_" + hashlib.md5(url.encode()).hexdigest()[:8]
            try:
                r = await crawler.arun(url=url, config=cfg)
                if r.success and r.markdown:
                    md = r.markdown.fit_markdown or r.markdown.raw_markdown or ""
                    (OUT / (tag + ".md")).write_text(md, encoding="utf-8")
                    (OUT / (tag + ".json")).write_text(json.dumps(
                        {"url": url, "title": (r.metadata or {}).get("title", ""),
                         "lang": (r.metadata or {}).get("language", ""), "chars": len(md)},
                        ensure_ascii=False, indent=1), encoding="utf-8")
                    print("OK ", url, len(md))
                    manifest.append({"url": url, "ok": True, "chars": len(md)})
                else:
                    print("FAIL", url, str(getattr(r, "error_message", ""))[:100])
                    manifest.append({"url": url, "ok": False})
            except Exception as e:
                print("FAIL", url, str(e)[:100])
                manifest.append({"url": url, "ok": False})
    (OUT / "manifest_similar_crawl.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
    print("Gata. Manifest:", OUT / "manifest_similar_crawl.json")


if __name__ == "__main__":
    asyncio.run(main())
