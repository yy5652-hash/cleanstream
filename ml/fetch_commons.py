"""Photos of the item types with the fewest training photos, from Wikimedia Commons: CC0, public domain and CC BY only.

    .venv/bin/python ml/fetch_commons.py

Writes data/commons/<item type>/<page id>.jpg and ml/commons_credits.csv (title, author, licence, source page).
"""
import csv, html, json, re, time, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data/commons"
UA = "CleanstreamResearch/1.0 (https://github.com/yy5652-hash/cleanstream; open-source recycling classifier)"
PER_TERM = 120
TERMS = {
    "pizza_box": ["pizza box", "pizza boxes", "pizza delivery box", "empty pizza box"],
    "drinking_glass_ceramic": ["coffee mug", "ceramic mug", "drinking glass", "tumbler glass", "teacup", "broken glass shards", "ceramic plate", "wine glass"],
    "mask_gloves": ["surgical mask", "disposable face mask", "discarded face mask", "latex gloves", "nitrile gloves", "disposable gloves"],
    "paper_bag": ["paper bag", "brown paper bag", "paper shopping bag", "paper grocery bag"],
    "aluminum_foil": ["aluminium foil", "aluminum foil", "tin foil", "foil tray", "crumpled aluminium foil"],
    "squeezable_tube": ["toothpaste tube", "cosmetic tube", "squeeze tube", "tube of cream", "hand cream tube"],
    "blister_pack": ["blister pack", "pill blister", "tablets blister package", "empty blister pack"],
    "rope_string": ["rope coil", "twine", "ball of string", "garden hose"],
    "soiled_paper": ["used tissue", "paper napkin", "paper towel", "crumpled tissue", "paper plate"],
    "yard_waste": ["yard waste", "leaf pile", "garden waste", "grass clippings", "pruned branches", "fallen leaves"],
    "snack_wrapper": ["potato chips bag", "candy wrapper", "crisp packet", "chocolate bar wrapper", "snack packaging"],
    "plastic_cup": ["plastic cup", "disposable plastic cup", "clear plastic cup", "solo cup"],
    "metal_lid_scrap": ["jar lid", "metal bottle cap", "crown cork", "scrap metal", "metal lid"],
    "carton": ["milk carton", "juice carton", "tetra pak", "beverage carton"],
    "paper_cup": ["paper cup", "disposable coffee cup", "takeaway coffee cup"],
    "plastic_container": ["plastic food container", "takeout container", "yogurt tub", "plastic clamshell"],
    "plastic_bag_film": ["plastic bag", "plastic shopping bag", "plastic film wrap", "garbage bag"],
    "battery": ["AA battery", "used batteries", "lithium battery", "button cell"],
    "aerosol_can": ["aerosol can", "spray can", "hairspray can", "deodorant spray can"],
}
OK = re.compile(r"^(cc0|public domain|pd|cc by \d|cc-by-\d)", re.I)
BAD = re.compile(r"(-sa|sa-|nc|nd|gfdl|by-sa| sa )", re.I)


def api(params):
    url = "https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode({"format": "json", "action": "query", **params})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=60) as r:
                return json.load(r)
        except Exception:
            time.sleep(5 * (attempt + 1))
    return {}


def search(term):
    d = api({"generator": "search", "gsrnamespace": 6, "gsrlimit": PER_TERM, "gsrsearch": f"{term} filetype:bitmap", "prop": "imageinfo",
             "iiprop": "url|extmetadata|mime", "iiurlwidth": 640, "iiextmetadatafilter": "LicenseShortName|Artist"})
    out = []
    for p in d.get("query", {}).get("pages", {}).values():
        info = (p.get("imageinfo") or [{}])[0]
        meta = info.get("extmetadata", {})
        lic = meta.get("LicenseShortName", {}).get("value", "")
        if info.get("mime") not in ("image/jpeg", "image/png") or not OK.match(lic) or BAD.search(lic) or "thumburl" not in info:
            continue
        artist = re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", meta.get("Artist", {}).get("value", "")))).strip()
        out.append({"id": p["pageid"], "title": p["title"], "licence": lic, "author": artist[:120], "page": info.get("descriptionurl", ""), "thumb": info["thumburl"]})
    return out


def fetch(job):
    label, it = job
    f = OUT / label / f"{it['id']}.jpg"
    if f.exists():
        return True
    for attempt in range(5):
        try:
            with urllib.request.urlopen(urllib.request.Request(it["thumb"], headers={"User-Agent": UA}), timeout=60) as r:
                b = r.read()
            if b[:2] == b"\xff\xd8" or b[:4] == b"\x89PNG":
                f.write_bytes(b)
                return True
            return False
        except urllib.error.HTTPError as e:
            if e.code != 429:
                return False
            time.sleep(10 * (attempt + 1))
        except Exception:
            time.sleep(3)
    return False


def main():
    credits, jobs, seen = [], [], set()
    for label, terms in TERMS.items():
        (OUT / label).mkdir(parents=True, exist_ok=True)
        n = 0
        for term in terms:
            for it in search(term):
                if it["id"] in seen:
                    continue
                seen.add(it["id"])
                jobs.append((label, it))
                credits.append({"file": f"commons/{label}/{it['id']}.jpg", "title": it["title"], "author": it["author"], "licence": it["licence"], "page": it["page"]})
                n += 1
            time.sleep(0.5)
        print(label, n, flush=True)
    with ThreadPoolExecutor(3) as ex:
        ok = sum(ex.map(fetch, jobs))
    print("downloaded", ok, "of", len(jobs))
    with open(ROOT / "ml/commons_credits.csv", "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["file", "title", "author", "licence", "page"])
        w.writeheader()
        w.writerows(credits)


if __name__ == "__main__":
    main()
