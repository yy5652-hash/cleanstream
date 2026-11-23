"""Collect the "held-up objects" evaluation set from Wikimedia Commons (CC0, public domain, CC BY, CC BY-SA).

    .venv/bin/python ml/fetch_heldup.py search [1|2]      # query Commons (round 1 or 2), write/merge data/heldup/candidates.json
    .venv/bin/python ml/fetch_heldup.py download IDS.txt  # download 640-px thumbnails of the page ids listed in IDS.txt
    .venv/bin/python ml/fetch_heldup.py sheets LABELS.csv # contact sheets from labels (pageid,label,condition,note)
    .venv/bin/python ml/fetch_heldup.py build LABELS.csv  # write ml/heldup_candidates.csv (adds sha256, size, licence)

Pages already used for training (ml/commons_credits.csv, data/commons/<type>/<pageid>.jpg) are excluded.
Files go to data/heldup/<pageid>.jpg. Labels are assigned by hand after looking at the images, before any model is run.
"""
import csv, hashlib, html, json, re, sys, time, urllib.parse, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data/heldup"
UA = "CleanstreamResearch/1.0 (https://github.com/yy5652-hash/cleanstream; evaluation set)"
QUERIES = [l.strip() for l in """
holding a plastic bottle|hand holding water bottle|woman holding plastic bottle|man holding bottle of water|holding soda bottle
holding a soda can|hand holding can|man holding beer can|woman holding a can|holding aluminium can|holding a tin can
woman holding coffee cup|holding a takeaway cup|holding a paper cup|hand holding disposable cup|holding coffee to go
holding a plastic cup|holding a solo cup|holding a bubble tea|holding iced coffee plastic cup|holding a smoothie cup
holding a milk carton|holding a juice carton|holding carton box drink|hand holding tetra pak
holding a plastic bag|woman holding shopping bag plastic|holding a carrier bag|hand holding plastic wrap
holding a chocolate bar|holding a candy wrapper|holding a bag of chips|holding a crisp packet|holding a snack bar wrapper|holding a sweet wrapper
holding a pizza box|man holding pizza box|woman holding pizza box|delivery person pizza box
holding a sheet of paper|holding a newspaper|holding a magazine|holding a piece of paper|holding a flyer
holding a cardboard box|holding cardboard|hand holding a box|holding a parcel|holding a cardboard sign
holding a glass bottle|holding a beer bottle|holding a wine bottle|holding a glass jar|hand holding jar
holding a banana|holding an apple|holding an orange fruit|holding an apple core|holding a banana peel|holding vegetables|holding a sandwich|holding food scraps|holding bread
holding a battery|holding an AA battery|hand holding batteries|holding a button cell|holding a lithium battery|holding a rechargeable battery
holding a smartphone|holding a mobile phone|holding a computer mouse|holding a keyboard|holding a charger cable|holding a remote control|holding a calculator|holding a broken phone
holding aluminium foil|holding a foil tray|hand holding tin foil
holding a plastic container|holding a takeout container|holding a yogurt cup|holding a tupperware|holding a food container|holding a plastic tub
holding a styrofoam cup|holding a foam container|holding polystyrene|holding a styrofoam box
holding a paper napkin|holding a tissue|holding a paper towel|holding a used tissue|holding a paper plate
holding a face mask|holding a surgical mask|holding disposable gloves|holding a glove
holding a plastic straw|holding a plastic fork|holding plastic cutlery|holding a drinking straw|holding a plastic spoon
holding a bottle cap|holding a plastic lid|holding a jar lid|holding a coffee lid
holding a paper bag|holding a brown paper bag|holding a paper shopping bag
holding a spray can|holding an aerosol can|holding a deodorant spray|holding spray paint can
holding a wine glass|holding a coffee mug|holding a drinking glass|holding a teacup|holding a broken plate
holding a leaf|holding grass clippings|holding a branch|holding a flower stem|holding garden waste
holding a t-shirt|holding a sock|holding a piece of clothing|holding old clothes|holding a shoe|holding a sneaker|holding a boot
holding a cigarette butt|holding a cigarette|holding a used cigarette
holding a blister pack|holding pills blister|holding tablets strip
holding a rope|holding a ball of string|holding twine|holding a cord
holding a toothpaste tube|holding a tube of cream|holding a squeeze tube
holding a plastic water bottle empty|holding a crushed bottle|holding an empty can|holding a crushed can|holding trash|holding litter
""".replace("\n", "|").split("|") if l.strip()]
# Second round: phrasings aimed at the item types that stayed short after round one ("search 2" merges into candidates.json).
QUERIES_R2 = [l.strip() for l in """
drinking from a can|man drinking beer from can|woman drinking soda can|can of Coca-Cola in hand|hand with an aluminium can|crushed can in hand|can of energy drink|can of beer held
drinking from a plastic bottle|woman drinking water from bottle|man holding PET bottle|hand with a bottle of water|child holding plastic bottle|bottle of Coca-Cola hand|bottle of juice in hand
holding milk carton|drinking juice box|carton of juice held|holding a drink carton|Tetra Pak in hand
holding an AA battery between fingers|hand with batteries|AAA battery in hand|holding a 9V battery|battery in palm|hand holding a coin cell|holding a laptop battery|power bank in hand
eating potato chips from a bag|holding a crisp packet|unwrapping a chocolate bar|holding a candy bar|holding a bag of crisps|snack bag in hand|hand holding a packet of biscuits|holding a granola bar
holding aluminium foil|foil wrapped food in hand|hand holding a tin foil|holding a wrapped burrito in foil
holding a pizza slice box|man carrying pizza boxes|holding open pizza box|pizza box in hands
holding a plastic bag of groceries|woman carrying plastic bag|hand holding a transparent plastic bag|holding a bag of rubbish|child holding plastic bag
holding a styrofoam cup|holding a foam takeaway box|styrofoam box in hand|holding a polystyrene tray|holding a foam coffee cup
holding a takeaway container|hand holding a food tub|holding a plastic lunch box|woman holding plastic container|holding a yoghurt pot
holding a used tissue|holding crumpled paper|crumpled paper ball in hand|holding a napkin|holding a greasy paper bag
holding a disposable cup with lid|barista handing coffee cup|hand holding Starbucks cup|holding an iced drink|holding a cup of bubble tea|holding a cup of soda with straw
holding a cardboard box|carrying a cardboard box|holding a flattened cardboard|holding a cereal box|hand holding a paper box
holding a smartphone broken screen|holding an old mobile phone|holding a USB cable|hand holding headphones|holding a computer mouse|holding a camera
holding a jar|woman holding glass jar|holding empty glass bottle|holding a bottle of beer|hand holding a bottle of wine|child holding glass bottle
""".replace("\n", "|").split("|") if l.strip()]
OK_LIC = re.compile(r"^(cc0|public domain|pd\b|cc[- ]by(-sa)?[- ]\d)", re.I)
BAD_LIC = re.compile(r"(nc|nd|gfdl)", re.I)


def api(params, tries=4):
    url = "https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode({"format": "json", **params})
    for a in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=60) as r:
                return json.load(r)
        except Exception as e:
            time.sleep(4 * (a + 1))
    return {}


def training_ids():
    ids = set()
    p = ROOT / "ml/commons_credits.csv"
    if p.exists():
        for row in csv.DictReader(open(p, newline="")):
            m = re.search(r"(\d+)\.\w+$", row["file"])
            if m:
                ids.add(int(m.group(1)))
    for f in (ROOT / "data/commons").glob("*/*.jpg"):
        if f.stem.isdigit():
            ids.add(int(f.stem))
    return ids


def clean(s):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", s or ""))).strip()


def search_ids(q, pages=2):
    ids = []
    for k in range(pages):
        d = api({"action": "query", "list": "search", "srnamespace": 6, "srsearch": f"{q} filetype:bitmap", "srlimit": 50, "sroffset": 50 * k})
        hits = d.get("query", {}).get("search", [])
        ids += [h["pageid"] for h in hits]
        time.sleep(0.3)
        if len(hits) < 50:
            break
    return ids


def info(ids):
    out = {}
    for i in range(0, len(ids), 40):
        chunk = ids[i:i + 40]
        d = api({"action": "query", "pageids": "|".join(map(str, chunk)), "prop": "imageinfo", "iiprop": "url|extmetadata|size|mime", "iiurlwidth": 640,
                 "iiextmetadatafilter": "LicenseShortName|LicenseUrl|Artist|ImageDescription"})
        for p in d.get("query", {}).get("pages", {}).values():
            ii = (p.get("imageinfo") or [{}])[0]
            m = ii.get("extmetadata", {})
            lic = m.get("LicenseShortName", {}).get("value", "")
            if ii.get("mime") != "image/jpeg" or not OK_LIC.match(lic) or BAD_LIC.search(lic) or "thumburl" not in ii:
                continue
            out[p["pageid"]] = {"pageid": p["pageid"], "title": p["title"], "author": clean(m.get("Artist", {}).get("value"))[:120], "license": lic,
                                "license_url": m.get("LicenseUrl", {}).get("value", ""), "page_url": ii.get("descriptionurl", ""), "image_url": ii["thumburl"],
                                "width": ii.get("thumbwidth"), "height": ii.get("thumbheight"), "desc": clean(m.get("ImageDescription", {}).get("value"))[:200]}
        time.sleep(0.3)
    return out


def cmd_search(rnd="1"):
    OUT.mkdir(parents=True, exist_ok=True)
    train, seen, excluded = training_ids(), {}, set()
    prev = json.load(open(OUT / "candidates.json")) if rnd != "1" else {"excluded_training": 0, "n_found": 0, "items": []}
    have = {c["pageid"] for c in prev["items"]}
    for q in (QUERIES if rnd == "1" else QUERIES_R2):
        for i in search_ids(q):
            seen.setdefault(i, q)
    excluded = {i for i in seen if i in train}
    new = [i for i in seen if i not in train and i not in have]
    meta = info(new)
    for i, q in seen.items():
        if i in meta:
            meta[i]["query"] = q
    json.dump({"excluded_training": prev["excluded_training"] + len(excluded), "n_found": prev["n_found"] + len(seen), "items": prev["items"] + list(meta.values())},
              open(OUT / "candidates.json", "w"))
    print("round", rnd, "found", len(seen), "excluded as training", len(excluded), "new, licence/format ok", len(meta))


def cmd_download(idfile):
    meta = {c["pageid"]: c for c in json.load(open(OUT / "candidates.json"))["items"]}
    for line in open(idfile):
        if not line.strip():
            continue
        i = int(line.split()[0])
        f = OUT / f"{i}.jpg"
        if f.exists() or i not in meta:
            continue
        for a in range(5):
            try:
                with urllib.request.urlopen(urllib.request.Request(meta[i]["image_url"], headers={"User-Agent": UA}), timeout=60) as r:
                    b = r.read()
                if b[:2] == b"\xff\xd8":
                    f.write_bytes(b)
                break
            except urllib.error.HTTPError as e:
                time.sleep(10 * (a + 1) if e.code == 429 else 2)
            except Exception:
                time.sleep(3)
        time.sleep(0.15)


def read_labels(path):
    return list(csv.DictReader(open(path, newline="")))


def cmd_sheets(labels):
    from PIL import Image, ImageDraw
    rows, T = read_labels(labels), 300
    (OUT / "sheets").mkdir(exist_ok=True)
    for n in range(0, len(rows), 16):
        sheet = Image.new("RGB", (4 * T, 4 * T), "white")
        d = ImageDraw.Draw(sheet)
        for k, r in enumerate(rows[n:n + 16]):
            x, y = (k % 4) * T, (k // 4) * T
            im = Image.open(OUT / f"{r['pageid']}.jpg").convert("RGB")
            im.thumbnail((T - 4, T - 40))
            sheet.paste(im, (x + 2, y + 2))
            d.rectangle([x, y + T - 36, x + T - 1, y + T - 1], fill=(20, 20, 20))
            d.text((x + 4, y + T - 33), f"{r['pageid']}", fill="white")
            d.text((x + 4, y + T - 18), f"{r['label']} {r.get('condition', '')}", fill=(255, 220, 90))
        sheet.save(OUT / "sheets" / f"sheet_{n // 16 + 1:02d}.jpg", quality=85)


def cmd_build(labels):
    meta = {c["pageid"]: c for c in json.load(open(OUT / "candidates.json"))["items"]}
    cols = "pageid,label,condition,title,author,license,license_url,page_url,image_url,sha256,width,height,note".split(",")
    with open(ROOT / "ml/heldup_candidates.csv", "w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=cols)
        w.writeheader()
        for r in read_labels(labels):
            m, f = meta[int(r["pageid"])], OUT / f"{r['pageid']}.jpg"
            w.writerow({**{k: m.get(k, "") for k in cols}, "pageid": r["pageid"], "label": r["label"], "condition": r.get("condition", ""),
                        "sha256": hashlib.sha256(f.read_bytes()).hexdigest(), "note": r.get("note", "")})


if __name__ == "__main__":
    {"search": cmd_search, "download": cmd_download, "sheets": cmd_sheets, "build": cmd_build}[sys.argv[1]](*sys.argv[2:])
