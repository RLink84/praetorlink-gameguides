#!/usr/bin/env python3
"""One-time importer: item names, stats and where-to-get-it notes from content/dd2/research into
content/dd2/items.json. Source notes are already condensed facts; here they are expanded into plain
sentences (shop shorthands spelled out). Run: python3 scripts/research/import_items.py"""
import json, re, os

ROOT = os.path.join(os.path.dirname(__file__), "..", "..")
RES = os.environ.get("RESEARCH_DIR", "/mnt/project-files/dd2-research")
OUT = os.path.join(ROOT, "content", "dd2")


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower().replace("'", "")).strip("-")


def read(f):
    return open(os.path.join(RES, f), encoding="utf-8").read()


SHOPS = {
    "Rod": "Roderick's Smithy (Vernworth)", "Cel": "Celeste's Smithy (Checkpoint Rest Town)",
    "Awa": "Awaran's Arms (Bakbattahl)", "Brok": "Brokkr's Smithy (Bakbattahl, after Steeled Resolve, Blazing Forge)",
    "Gri": "Grisha's Armory (Sacred Arbor)", "VIA": "Volcanic Island Armory", "VIA/Brok": "Volcanic Island Armory or Brokkr's Smithy",
    "Bay": "the Dragonforged at Bay Wayside Shrine (Wyrmslife Crystals, late game)", "Nameless": "Nameless Village apothecary",
    "Runne": "Runne's Apothecary (Melve)", "Chand": "Chandler's General Store (Harve)", "Bord": "Borderwatch Outpost",
    "5 smiths": "any of the five main smiths, late game only", "PO": "pre-order bonus", "Bjorn": "Bjorn's Armory (Vernworth)",
    "Bodas": "Bodas's Armory (Bakbattahl)", "Zonna": "Zonna, Battahl Ropeway Central Station", "Zachary": "Zachary at the Excavation Site",
    "Ines": "Ines (Checkpoint Rest Town or Bakbattahl)", "Dudley": "Dudley (travelling vendor)", "Neomith": "Neomith (eyewear vendor)",
    "Bord/Runne": "Borderwatch Outpost or Runne's Apothecary (Melve)", "Angus": "Angus (vendor)",
}
VOC = {"Sword": ["Fighter"], "Mace": ["Fighter"], "Shield": ["Fighter"], "Dagger": ["Thief"], "Greatsword": ["Warrior"],
       "Hammer": ["Warrior"], "Bow": ["Archer"], "Staff": ["Mage"], "Archistaff": ["Sorcerer"], "Magick Bow": ["Magick Archer"],
       "Duospear": ["Mystic Spearhand"], "Censer": ["Trickster"], "Axe": ["Fighter"]}
WTYPE = {"SWORDS": "Sword", "MACES": "Mace", "SHIELDS": "Shield", "DAGGERS": "Dagger", "GREATSWORDS": "Greatsword",
         "HAMMERS": "Hammer", "BOWS": "Bow", "STAVES": "Staff", "ARCHSTAVES": "Archistaff", "MAGICKAL BOWS": "Magick Bow",
         "DUOSPEARS": "Duospear", "CENSERS": "Censer"}
SUFFIX = {"Bow": {"Fluted", "Superior Fluted", "Bespoke", "Lupine", "Hunter's"},
          "Shield": {"Round", "Superior Round", "Continental"},
          "Staff": {"Wooden", "Superior Wooden", "Ironclad"},
          "Archistaff": {"Helical", "Lion-Lord's"}}

items = {}


def kind_of(t):
    tl = t.lower()
    if "token" in tl:
        return "tokens"
    if "%" in tl or "drop" in tl or "defeat" in tl:
        return "drop"
    if "reward" in tl:
        return "reward"
    if "chest" in tl or "found" in tl or "in a house" in tl or "atop" in tl:
        return "chest"
    if "gift" in tl or "affinity" in tl or "favor" in tl:
        return "gift"
    if "combine" in tl or "craft" in tl:
        return "craft"
    return "other"


def expand_sources(text):
    """'chest in X; Rod, Cel' -> list of ItemSource"""
    out = []
    for part in [p.strip() for p in re.split(r";", text) if p.strip()]:
        toks = [t.strip() for t in part.split(",")]
        if toks and all(t in SHOPS for t in toks):
            out.append({"kind": "shop", "text": "Sold by " + ", ".join(SHOPS[t] for t in toks) + "."})
            continue
        m = re.match(r"^(Bay) (\d+)( crystals)?$", part)
        if m:
            out.append({"kind": "shop", "text": f"Sold by {SHOPS['Bay']} for {m.group(2)} Wyrmslife Crystals."})
            continue
        t = part
        for k, v in SHOPS.items():
            if t == k:
                t = "Sold by " + v
        t = t[0].upper() + t[1:]
        if not t.endswith("."):
            t += "."
        out.append({"kind": "shop" if t.startswith("Sold by") else kind_of(t), "text": t})
    return out


def add(name, category, sources, typ=None, dlc=False, stage="m01", note=None, extra_sources=None):
    name = name.strip().rstrip(".")
    if not name:
        return
    iid = slug(name)
    it = items.get(iid)
    if not it:
        it = {"id": iid, "name": name, "category": category, "spoiler": 1, "dlc": dlc, "stage": stage, "sources": [],
              "refs": extra_sources or ["fextralife"]}
        if typ:
            it["type"] = typ
            if typ in VOC:
                it["vocations"] = VOC[typ] + (["Warfarer"] if typ != "Shield" else [])
        items[iid] = it
    for s in sources:
        if s not in it["sources"]:
            it["sources"].append(s)
    if note:
        it["note"] = note


# ---- stats from equipment.md
STATS = {}
eq = read("equipment.md")
for m in re.finditer(r"([A-Z][A-Za-z' \-]+?) (\d{2,3})(?:/(\d{2,3}))?(?=[,|\n])", eq):
    nm = m.group(1).strip()
    if m.group(3):
        STATS[nm] = {"strength": int(m.group(2)), "magick": int(m.group(3))}
    else:
        STATS[nm] = {"attack": int(m.group(2))}

# ---- weapons
for line in read("item_locations_weapons.md").splitlines():
    m = re.match(r"^([A-Z ]+): (.*)$", line)
    if not m or m.group(1) not in WTYPE:
        continue
    typ = WTYPE[m.group(1)]
    for entry in m.group(2).split(" | "):
        if ":" not in entry:
            continue
        nm, src = entry.split(":", 1)
        for n in [x.strip() for x in nm.split(",")]:
            base = n
            if n in SUFFIX.get(typ, set()):
                n = f"{n} {typ}"
            st = src.strip()
            srcs = [] if st in ("unrecorded",) else expand_sources(st)
            add(n, "shield" if typ == "Shield" else "weapon", srcs, typ)
            s = STATS.get(base) or STATS.get(n)
            if s:
                if typ in ("Staff", "Archistaff", "Censer") and "attack" in s:
                    s = {"magick": s["attack"]}
                if typ == "Magick Bow" and "attack" in s:
                    s = {"magick": s["attack"]}
                if typ == "Shield" and "attack" in s:
                    s = {"defense": s["attack"]}
                items[slug(n)]["stats"] = s

# ---- full armor names for resolving shorthand
FULL = {"head": [], "body": [], "legs": [], "cloak": [], "ring": []}
for key, lab in (("head", "Head ("), ("body", "Body (")):
    m = re.search(re.escape(lab) + r"\d+\): (.*)", eq)
    if m:
        FULL[key] = [x.strip() for x in m.group(1).replace("; eyewear/masks:", ",").split(",")]
for line in read("equipment_legs_cloaks_rings.txt").splitlines():
    m = re.match(r"^(LEGS|CLOAKS|RINGS): (.*)$", line)
    if m:
        names = [x.strip().replace(' (all "Ring of X")', "") for x in m.group(2).split(",")]
        if m.group(1) == "RINGS":
            names = [n if n.startswith(("Ring of", "Eternal", "Turquoise")) else "Ring of " + n for n in names]
        FULL[{"LEGS": "legs", "CLOAKS": "cloak", "RINGS": "ring"}[m.group(1)]] = names


def resolve(abbr, cat):
    if abbr in FULL[cat]:
        return abbr
    c = [f for f in FULL[cat] if f.startswith(abbr + " ") or f.startswith(abbr)]
    return c[0] if len(c) == 1 else (abbr if not c else min(c, key=len))


def armor_file(text, sections):
    cat = None
    mode = None
    for line in text.splitlines():
        h = re.match(r"^## (HEAD|BODY|LEGS|CLOAKS|RINGS)(?:, (.*))?$", line)
        if h:
            cat = {"HEAD": "head", "BODY": "body", "LEGS": "legs", "CLOAKS": "cloak", "RINGS": "ring"}[h.group(1)]
            mode = "sold" if (h.group(2) or "").startswith("sold") else "found"
            continue
        if not cat or not line.strip() or line.startswith("#"):
            continue
        if mode == "sold":
            for seg in line.split(" | "):
                if ":" not in seg:
                    continue
                shop, names = seg.split(":", 1)
                shop = shop.strip()
                price = None
                pm = re.match(r"^(\w+) \((\d+) crystals\)$", shop)
                if pm:
                    shop, price = pm.group(1), pm.group(2)
                if shop == "Other":
                    for nm in re.findall(r"([^,(]+)\(([^)]+)\)", names):
                        add(resolve(nm[0].strip(), cat), cat, [{"kind": "shop", "text": f"Sold by {nm[1].strip()}."}])
                    continue
                shopname = SHOPS.get(shop, shop)
                for nm in [x.strip() for x in names.split(",")]:
                    also = re.match(r"^(.*?) \(also (.*)\)$", nm)
                    extra = []
                    if also:
                        nm = also.group(1)
                        extra = [SHOPS.get(x.strip(), x.strip()) for x in also.group(2).split(",")]
                    txt = "Sold by " + ", ".join([shopname] + extra)
                    if price:
                        txt += f" for {price} Wyrmslife Crystals"
                    add(resolve(nm, cat), cat, [{"kind": "shop", "text": txt + "."}])
        else:
            for seg in line.split(" | "):
                if ":" not in seg:
                    continue
                nm, src = seg.split(":", 1)
                names = [x.strip() for x in nm.split(",")]
                if src.strip() in ("unrecorded", "endgame, unrecorded", "shops, unrecorded", "not sold, unrecorded"):
                    srcs = []
                else:
                    srcs = expand_sources(src.strip())
                for n in names:
                    n = n.replace("Ring of Repellency", "Ring of Repellency")
                    if cat == "ring" and not n.startswith("Ring") and n in ("Thawing", "Pliancy"):
                        n = "Ring of " + n
                    add(resolve(n, cat), cat, srcs)


armor_file(read("item_locations_armor.md"), None)
armor_file(read("item_locations_legs_cloaks_rings.md"), None)
# names in the catalogue with no recorded source
for cat, names in FULL.items():
    for n in names:
        if n and slug(n) not in items:
            add(n, cat, [])

# ---- key items etc.
SECT = {"Quest items": "key", "Mysterious/collectible": "collectible", "Travel/revival": "consumable",
        "Skill tomes (Maister teachings) and specialization tomes": "tome", "Medusa/arrows (consumables)": "consumable"}
cat = None
for line in read("key_and_quest_items.md").splitlines():
    h = re.match(r"^## (.*)$", line)
    if h:
        cat = SECT.get(h.group(1).strip())
        continue
    if not cat or not line.strip():
        continue
    for seg in line.split(" | "):
        if ":" not in seg:
            continue
        nm, src = seg.split(":", 1)
        src = src.strip()
        voc = re.match(r"^(.*?) \((\w[\w ]*)\)$", nm.strip())
        note = None
        if voc and cat == "tome":
            nm = voc.group(1)
            note = f"Maister teaching for {voc.group(2)}."
        if src.startswith("quest-given"):
            for n in nm.split(","):
                add(n, cat, [{"kind": "reward", "text": "Given during its quest."}])
            continue
        names = [x.strip() for x in re.split(r",| and (?=[A-Z])", nm) if x.strip()] if ("," in nm and cat != "tome" and "(" not in nm) else [nm.strip()]
        if "/" in nm and cat == "key":
            names = [nm.strip()]
        for n in names:
            if n.startswith("Arrows") or n.startswith("Dyes") or n.startswith("Rift Incense") or n.startswith("Camping kits"):
                label = {"Arrows": "Special arrows", "Dyes": "Dyes", "Rift Incense": "Rift Incense", "Camping kits": "Camping kits"}[n.split(" (")[0]]
                add(label, "consumable", expand_sources(src), note=(("Types: " + nm.split("(", 1)[1].rstrip(")")) if "(" in nm else None))
                continue
            pm = re.match(r"^(.*?) \((.*)\)$", n)
            if pm and cat == "key":
                n, note = pm.group(1), pm.group(2)
            for nn in (n.split("/") if "/" in n and cat == "key" else [n]):
                nn = nn.strip()
                if nn in ("Dulled", "Large"):
                    nn = nn + (" Regalia Sword" if nn == "Dulled" else " Blue Crystal Shard")
                add(nn, cat, expand_sources(src), note=note)

# ---- materials
for line in read("materials.md").splitlines():
    m = re.match(r"^([A-Z/ ]+): (.*)$", line)
    if not m:
        continue
    group = m.group(1).title()
    for seg in m.group(2).split(" | "):
        if ":" not in seg:
            continue
        nm, src = seg.split(":", 1)
        if "typo" in src:
            continue
        for n in [x.strip() for x in nm.split(",")]:
            add(n, "material", [] if src.strip() == "unrecorded" else expand_sources(src.strip()), typ=group)

# ---- DLC weapons and armour
dlc = read("dlc_dark_arisen.md")
DLCVOC = {"Archer bows": "Bow", "Mage staves": "Staff", "Magick Archer": "Magick Bow", "Mystic Spearhand duospears": "Duospear",
          "Sorcerer archistaves": "Archistaff", "Thief daggers": "Dagger", "Trickster censers": "Censer", "Warrior greatswords": "Greatsword"}
LR = "Lost Rites dungeon reward"
SA = "Spoils appraisal in Norgan (random stats)"
sec = None
for line in dlc.splitlines():
    if line.startswith("## "):
        sec = line
        continue
    if sec and sec.startswith("## DLC weapons"):
        m = re.match(r"^([A-Za-z ]+?): (.*)$", line)
        if not m:
            continue
        label, rest = m.group(1), m.group(2)
        if label == "Fighter":
            parts = {"Sword": re.search(r"swords (.*?); axe", rest).group(1),
                     "Axe": re.search(r"axe (.*?); shields", rest).group(1),
                     "Shield": re.search(r"shields (.*)$", rest).group(1)}
        else:
            parts = {DLCVOC.get(label, "Bow"): rest}
        for typ, txt in parts.items():
            sa = False
            for tok in [t.strip() for t in txt.split(",")]:
                if tok.startswith("SA:"):
                    sa = True
                    tok = tok[3:].strip()
                lr = re.match(r"^(.*?) \(LR(?: (.*?))?\)$", tok)
                if lr:
                    where = f" ({lr.group(2)})" if lr.group(2) else ""
                    add(lr.group(1).replace("Serpahic", "Seraphic"), "shield" if typ == "Shield" else "weapon",
                        [{"kind": "reward", "text": LR + where + "."}], typ, dlc=True, extra_sources=["game8"])
                elif tok.endswith("(SA)"):
                    add(tok[:-5], "weapon", [{"kind": "other", "text": SA + "."}], typ, dlc=True, extra_sources=["game8"])
                elif sa and tok:
                    add(tok, "shield" if typ == "Shield" else "weapon", [{"kind": "other", "text": SA + "."}], typ, dlc=True,
                        extra_sources=["game8"])
    if sec and sec.startswith("## DLC armor"):
        m = re.match(r"^(Quest/NPC|Lost Rites|Norgan SA\+Hal|Norgan SA only|Source TBD \(Game8\)): (.*)$", line)
        if not m:
            continue
        kind, rest = m.group(1), m.group(2)
        if kind == "Lost Rites":
            for seg in rest.split(" | "):
                if ":" not in seg:
                    continue
                d, names = seg.split(":", 1)
                d = d.replace("..", " Hollow").strip()
                for n in [x.strip() for x in names.split(",") if x.strip() and x.strip() != "n/a"]:
                    add(n, "body", [{"kind": "reward", "text": f"{LR} ({d})."}], "Armour", dlc=True, extra_sources=["game8"])
        elif kind == "Quest/NPC":
            for seg in re.findall(r"([^;]+?) \(([^)]+)\)", rest):
                for n in seg[0].split(","):
                    add(n.strip(), "body", [{"kind": "reward", "text": seg[1] + "."}], "Armour", dlc=True, extra_sources=["game8"])
        else:
            txt = {"Norgan SA+Hal": SA + ", or crafted at Hal's workshop after Hammer and Tongs.",
                   "Norgan SA only": SA + ".", "Source TBD (Game8)": None}[kind]
            for n in [x.strip() for x in rest.split(",") if x.strip()]:
                add(n, "body", [{"kind": "other", "text": txt}] if txt else [], "Armour", dlc=True, extra_sources=["game8"])

# DLC armour slot is not known from our notes; guess from the name so filters work, flag unverified.
SLOT = [("head", r"Hood|Helm|Crown|Circlet|Diadem|Galea|Horns|Headband|Antlers|Feathercrown|Mask|Eye|Laurel|Jaws|Coroin|Plumes|Glory"),
        ("legs", r"Boots|Sabatons|Greaves|Cuisses|Breeches|Hosen|Chausses|Gaiters|Skirt|Tread|Tramplers"),
        ("cloak", r"Cloak|Mantle|Cape|Shawl|Stole|Blanket|Pelisse|Furcloak|Wrap|Twine"),
        ("ring", r"Band|Ring|Guerdon|Talisman|Lex Talionis")]
for it in items.values():
    if it.get("type") == "Armour":
        it["category"] = "body"
        for cat, rx in SLOT:
            if re.search(rx, it["name"]):
                it["category"] = cat
                break
        it["note"] = "Dark Arisen gear. Slot guessed from the name; confirm in game."
        del it["type"]

# ---- tidy names and source text
for it in list(items.values()):
    it["name"] = re.sub(r" x\d+$", "", it["name"])
    for src in it["sources"]:
        t = src["text"]
        t = re.sub(r" ?\(see [^)]*files\)", "", t)
        t = re.sub(r"^(\d+) tokens \(also VIA\)\.?$", r"Trade in \1 Seeker's Tokens at a Vocation Guild. Also sold at the Volcanic Island Armory.", t)
        t = re.sub(r"^(\d+) (Seeker's )?[Tt]okens( at Vocation Guild)?\.?$", r"Trade in \1 Seeker's Tokens at a Vocation Guild.", t)
        t = re.sub(r"\bNW\b", "north-west of", t).replace(" of of ", " of ")
        t = re.sub(r"\bNE\b", "north-east of", t).replace(" of of ", " of ")
        t = re.sub(r"\bSW\b", "south-west of", t).replace(" of of ", " of ")
        t = re.sub(r"\bSE\b", "south-east of", t).replace(" of of ", " of ")
        t = re.sub(r"^Reward ", "Quest reward: ", t)
        src["text"] = t[0].upper() + t[1:] if t else t
    if it.get("stats") and list(it["stats"]) == ["attack"]:
        it["stats"] = {"strength": it["stats"]["attack"]}
    if it.get("note", "").startswith("Dark Arisen gear. Slot guessed"):
        it["note"] = "Dark Arisen gear. Slot not confirmed yet." if it["category"] == "body" else "Dark Arisen gear."

# ---- story stage per item, so gear from later parts of the game stays behind the spoiler gate
STAGE_RULES = [
    (r"Unmoored|endgame|late game|Dragonforged|Bay Wayside|five main smiths|Wyrmslife|Moonglint", "m15"),
    (r"Volcanic Island|Drabnir|Agamen|Seafloor|Excavation|Dragonsbreath|Forbidden Magick", "m12"),
    (r"Battahl|Bakbattahl|Awaran|Brokkr|Bodas|Zonna|Ines|Sacred Arbor|Wyrmsblood|Misty Marshes|Tomb of|Sphinx|Frontier", "m11"),
    (r"Checkpoint|Celeste|Vernworth|Roderick|Bjorn|Harve|Trevo|Nameless|Ancient Battleground|Chandler", "m04"),
]
for it in items.values():
    if it["dlc"]:
        it["stage"] = "d01" if "Norgan" in json.dumps(it["sources"]) or "Hal's" in json.dumps(it["sources"]) else "m04"
        continue
    text = " ".join(x["text"] for x in it["sources"])
    stage = "m03"
    if text:
        # earliest place it can be had wins
        found = [st for rx, st in STAGE_RULES if re.search(rx, text)]
        if found:
            order = ["m03", "m04", "m11", "m12", "m15"]
            stage = min(found, key=order.index)
    it["stage"] = stage

out = sorted(items.values(), key=lambda x: (x["category"], x.get("type", ""), x["name"]))
for it in out:
    it["sources"], it["refs"] = it["sources"], it.pop("refs")
json.dump(out, open(os.path.join(OUT, "items.json"), "w", encoding="utf-8"), indent=1, ensure_ascii=False)
from collections import Counter
print(len(out), "items", Counter(i["category"] for i in out), "no source:", sum(1 for i in out if not i["sources"]))
