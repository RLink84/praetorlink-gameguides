#!/usr/bin/env python3
"""One-time importer: turns the condensed research notes (content/dd2/research) plus our own hand-written
premises into content/dd2/{story,quests,choices}.json. After the first import those JSON files are the
source of truth and are edited directly (or through Tester mode PRs). Run: python3 scripts/research/import_quests.py

All prose below is written by PraetorLink. Facts (names, numbers, conditions) come from the sources listed
in content/dd2/research/SOURCES_AND_LEGAL.md.
"""
import json, re, os

ROOT = os.path.join(os.path.dirname(__file__), "..", "..")
RES = os.path.join(ROOT, "content", "dd2", "research")
OUT = os.path.join(ROOT, "content", "dd2")


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower().replace("'", "")).strip("-")


# ---------------------------------------------------------------- story
# level = our rough estimate of a comfortable level when starting the step.
BASE = [
    ("A Gaoled Awakening", 1, "Prologue. Learn the controls."),
    ("Tale's Beginning", 2, "First steps in the open world."),
    ("In Dragon's Wake", 4, "Borderwatch Outpost and Melve open up."),
    ("Seat of the Sovran", 8, "Reach the capital, Vernworth. Lots of side quests open."),
    ("Monster Culling", 12, "Three jobs around Vermund."),
    ("Disa's Plot", 15, "Night-time mission in Vernworth."),
    ("The Caged Magistrate", 17, ""),
    ("The Stolen Throne", 19, ""),
    ("An Unsettling Encounter", 21, ""),
    ("Feast of Deception", 23, "Some Vernworth side quests close here. Check the Missable list first."),
    ("Nation of the Lambent Flame", 25, "Cross into Battahl."),
    ("Flickering Shadows", 30, ""),
    ("Convergence", 35, ""),
    ("A New Godsway", 38, "Last safe point for most side quests. Finish what you want first."),
    ("The Guardian Gigantus", 42, "Most side quests close after this."),
    ("Legacy", 45, "Final quest. Your choices here decide the ending."),
    ("Post-game: the Unmoored World", 50, "Only reached through the true ending path."),
]
DLC = [
    ("Chilling Tidings", 40, "Start: talk to Captain Brant at the Stardrop Inn, Vernworth, at night."),
    ("Rumbles in the North", 42, ""),
    ("Seeking the Sage", 44, "Includes three riddle sub-quests."),
    ("Sealed History", 46, ""),
    ("The Castle in the Ice", 48, "A big choice happens here."),
    ("Soul Searching", 50, ""),
    ("Where There's a Will, There's a Way", 52, ""),
    ("Reunion", 55, ""),
    ("Into Rancor", 60, "Post-game of the DLC."),
]

story = []
for i, (n, lv, note) in enumerate(BASE):
    sid = f"m{i+1:02d}" if i < 16 else "pg"
    story.append({"id": sid, "name": n, "dlc": False, "track": "base", "order": i, "level": lv, **({"note": note} if note else {})})
for i, (n, lv, note) in enumerate(DLC):
    story.append({"id": f"d{i+1:02d}", "name": n, "dlc": True, "track": "dlc", "order": i, "level": lv, **({"note": note} if note else {})})
STEP = {s["name"]: s["id"] for s in story}

# ---------------------------------------------------------------- main quests (own words)
MAIN = {
    "A Gaoled Awakening": ("Break out of a forced-labour dig site and survive the escape.", []),
    "Tale's Beginning": ("Wake beside a waterfall after the escape and find your way to safety with a soldier's help.", []),
    "In Dragon's Wake": ("Rest up at Borderwatch Outpost, then head for Melve after news of an attack.",
                         ["How fully you stick with Watchhead Gregor changes how this quest wraps up."]),
    "Seat of the Sovran": ("Travel to the capital and prove who you really are.", []),
    "Monster Culling": ("Take on three jobs for Captain Brant around Vermund.",
                        ["The jobs: goblins at Trevo Mine, saurians at Harve Village and a delivery to Vermund's eastern edge."]),
    "Disa's Plot": ("Find proof of wrongdoing inside the castle.",
                    ["Use the rear gate between midnight and dawn. Bring a lantern."]),
    "The Caged Magistrate": ("Free an imprisoned magistrate from the gaol tower.", []),
    "The Stolen Throne": ("Slip into a royal masquerade to look into a false Sovran.",
                          ["Formal clothes help you blend in at the masquerade."]),
    "An Unsettling Encounter": ("Sneak into a noble's chambers after a tip about a suspicious delivery.", []),
    "Feast of Deception": ("Attend the coronation and see what the Godsway can do.",
                           ["Several Vernworth side quests close when this starts. Check the Missable list."]),
    "Nation of the Lambent Flame": ("Cross the border into Battahl, looking for answers about the Godsway.", []),
    "Flickering Shadows": ("Investigate researchers who use blue crystals, and what they are powering.", []),
    "Convergence": ("Explore a structure that has risen from the sea near Harve.", []),
    "A New Godsway": ("Gather what you need to restore a special blade.",
                      ["Treat this as the last safe point for side quests you care about."]),
    "The Guardian Gigantus": ("Defend against a giant on the march toward Moonglint Tower.",
                              ["Earlier side quests decide who turns up to help."]),
    "Legacy": ("Face the Dragon at Moonglint Tower.",
               ["What you choose here decides the ending. Read the Endings card only if you want it spoiled."]),
}
MAIN_REWARDS = {
    "The Caged Magistrate": [{"xp": 1200, "gold": 7000, "items": ["Ferrystone"]}],
    "The Stolen Throne": [{"xp": 900, "gold": 6500, "items": ["Wakestone Shard", "Myrmecoleon Card"]}],
    "Convergence": [{"items": ["Dulled Godsbane Blade"]}],
    "A New Godsway": [{"xp": 6000, "gold": 35000, "items": ["Wakestone", "Empowered Godsbane Blade"]}],
    "The Guardian Gigantus": [{"xp": 19000}],
}

quests = []
for i, (n, lv, _) in enumerate(BASE[:16]):
    premise, tips = MAIN[n]
    q = {"id": slug(n), "name": n, "kind": "main", "spoiler": 1, "dlc": False, "stage": f"m{i+1:02d}",
         "premise": premise, "level": lv, "refs": ["fextralife", "samurai-gamers"]}
    if tips:
        q["tips"] = tips
    if n in MAIN_REWARDS:
        q["rewards"] = MAIN_REWARDS[n]
    quests.append(q)

# ---------------------------------------------------------------- side quests
# Own-words premises. Keep each to one short, spoiler-light sentence.
PREMISE = {
    "The Provisioner's Plight": "Help the outpost's supply officer track down missing provisions.",
    "Ordeals of a New Recruit": "Look for a young recruit who went missing on a scouting run.",
    "Claw Them Into Shape": "Help a seasoned warrior train a group of raw recruits.",
    "Beren's Final Lesson": "Go with Beren on one last outing with his recruits.",
    "Spellbound": "Help a struggling student of magick find what she needs to study.",
    "Medicament Predicament": "Fetch medicine for a sick villager in Melve.",
    "Brothers Brave and Timid": "Find out what happened to a boy's brother who went off to fight.",
    "Nesting Troubles": "Deal with a monster problem threatening Melve.",
    "Readvent of Calamity": "Help Melve stand against a dragon threat.",
    "Home is Where the Hearth Is": "Help Melve's people defend their home against hostile soldiers.",
    "Oxcart Courier": "Deliver a letter by riding the oxcart to Melve.",
    "Vocation Frustration": "Fetch weapons for the Vocation Guild so new vocations open up.",
    "A Place to Call Home": "Ask about buying a house of your own in Vernworth.",
    "The Heel of History": "Lend a hand to a slum charity that feeds the poor.",
    "A Case of Sculptor's Block": "Help a sculptor finish a statue of you.",
    "The Gift of Giving": "Find out who is secretly helping the people of the slums.",
    "House of the Blue Sunbright": "Track down a missing person tied to a slum mystery.",
    "The Nameless Village": "Look into a hidden village of thieves.",
    "The Arisen's Shadow": "Find out who has been pretending to be the Arisen.",
    "A Beggar's Tale": "Help a beggar who has a secret life.",
    "Gift of the Bow": "Bring a bow to an elf archer who wants to judge your skill.",
    "A Trial of Archery": "Take part in an archery contest held by the elves.",
    "Till Death Do Us Part": "Find a missing husband before it is too late.",
    "Saint of the Slums": "Gather evidence on what is really going on at a slum clinic.",
    "The Ornate Box": "Find a fancy box that a servant needs.",
    "Masked Correspondence": "Carry a secret letter for a castle servant.",
    "Dulled Steel, Cold Forge": "Find a smith who can restore an old ceremonial sword.",
    "A Magisterial Amenity": "Check in on a freed magistrate after a few days.",
    "Every Rose Has Its Thorn": "Gather evidence for a noblewoman who wants justice.",
    "A Veil of Gossamer Clouds": "Find a letter for a castle servant.",
    "The Phantom Oxcart": "Investigate a ghostly oxcart that moves contraband.",
    "Tensions on the Highroad": "Settle a dispute between two men on the road.",
    "A Noble Exchange": "Catch a thief at a noble gathering.",
    "Crossing in Shadow": "Help a woman hide from people looking for her.",
    "Scaly Invaders": "Clear out saurians troubling Harve Village.",
    "Trouble on the Cape": "Help Harve deal with a dangerous visitor.",
    "The Sorcerer's Appraisal": "Prove yourself to an eccentric sorcerer who likes fine clothes.",
    "Hunt for the Jadeite Orb": "Two buyers want the same orb. Find it and decide who gets it.",
    "Prey for the Pack": "Rescue a missing man before wolves get to him.",
    "Mercy among Thieves": "Look into a group of thieves who prey on travellers.",
    "Tolled to Rest": "Help a man recover a key and explore an old battleground.",
    "A Game of Wits": "Answer the riddles of a mysterious sphinx.",
    "Welcome to Battahl": "Get pulled into a fight at a Bakbattahl inn.",
    "Shadowed Prayers": "Catch an assassin before they strike.",
    "A Poisonous Proposal": "Help a man who fears his wife is being poisoned.",
    "Steeled Resolve, Blazing Forge": "Bring the ceremonial sword to Bakbattahl's master smith.",
    "Out of the Forest, Into the Forge": "Help an elf deliver something to a smith in Bakbattahl.",
    "Short-Sighted Ambition": "A merchant asks for help finding a strange book.",
    "Off the Pilfered Path": "Help find out who is behind a string of thefts.",
    "'Twixt a Rock and a Hard Place": "Help someone caught between two bad options in Bakbattahl.",
    "Put a Spring in Thy Step": "Help an elder on the volcanic island and learn a new fighting style.",
    "The Sotted Sage": "Track down a drunken sage who can teach a unique vocation.",
    "A Candle in the Storm": "Protect an important figure during a risky meeting.",
    "Clash and Conclusion": "Settle things with an old rival during the giant's attack.",
    "The Ailing Arborheart": "Help the elves with their sickly sacred tree.",
    "Dreams Apart": "Help someone you know cope in the changed world.",
    "When Wills Collide": "Settle a conflict in the changed world.",
    "A Scholarly Pursuit": "Assist a scholar studying what happened to the world.",
    "Halls of the First Dawn": "Prepare for the final trials of the post-game.",
    "The Regentkin's Resolve": "Help Brant with a task in the changed world.",
    "Wandering Roots": "Help the elves save something from the Arborheart.",
    "Civil Unrest": "Lead frightened people in Bakbattahl to safety.",
    "The Importance of Aiding Ernesto": "Help a man at the volcanic island camp.",
    "Shepherd of the Pawns": "Help pawns find their way in the changed world.",
}

# timed quests and failure consequences (hints_mysteries.json, in our words)
TIMED = {
    "Every Rose Has Its Thorn": "If time runs out, Wilhelmina is jailed. Finish Brant's quests first.",
    "Ordeals of a New Recruit": "If you are too slow, the recruit dies.",
    "Prey for the Pack": "If you are too slow, Rodge dies.",
    "Shadowed Prayers": "If you fail, Nadinia dies, A Candle in the Storm and Crossing in Shadow fail, and you can't buy the Bakbattahl house.",
    "Till Death Do Us Part": "If you are too slow, Gregor dies (you still get some rewards).",
    "Oxcart Courier": "No penalty for being late.",
    "Out of the Forest, Into the Forge": "Timed. The penalty is not confirmed yet.",
    "Home is Where the Hearth Is": "Time-limited. The villagers fight alone if you are late.",
    "Crossing in Shadow": "Best reward only if you are on time.",
}
STAGE = {"Readvent of Calamity": "m05", "Home is Where the Hearth Is": "m09", "Trouble on the Cape": "m05",
         "Every Rose Has Its Thorn": "m11", "The Ornate Box": "m04", "Steeled Resolve, Blazing Forge": "m11",
         "Out of the Forest, Into the Forge": "m11", "The Ailing Arborheart": "m11", "A Candle in the Storm": "m11",
         "Crossing in Shadow": "m11", "Put a Spring in Thy Step": "m12", "The Sotted Sage": "m12"}
LOCKS = {  # quest -> story step it closes at (our reading of the unlock notes)
    "Readvent of Calamity": "m10",
    "Nesting Troubles": "m05",
    "The Ornate Box": "m06",
    "The Phantom Oxcart": "m14",
    "Brothers Brave and Timid": "m15",
    "The Nameless Village": "m08",
    "The Arisen's Shadow": "m15",
    "Masked Correspondence": "m10",
    "Every Rose Has Its Thorn": "m15",
}


def stage_for(unlock):
    u = unlock.lower()
    order = [
        ("into rancor", "d09"), ("unmoored", "pg"), ("halls of the first dawn", "pg"), ("guardian gigantus", "m15"),
        ("a new godsway", "m14"), ("lambent flame", "m11"), ("crossing into battahl", "m11"), ("battahl", "m11"),
        ("feast of deception", "m10"), ("unsettling encounter", "m09"), ("caged magistrate", "m07"),
        ("monster culling", "m05"), ("readvent", "m05"), ("seat of the sovran", "m04"), ("vernworth main", "m04"),
        ("in dragon's wake", "m03"), ("checkpoint", "m04"), ("island", "m11"), ("ancient battleground", "m04"),
        ("sphinx", "m04"), ("bakbattahl", "m11"),
    ]
    for k, v in order:
        if k in u:
            return v
    return "m04"


def parse_rewards(text):
    """'saved recruit: 1600xp, Lifetaker, 4500G; failed: xp only' -> list of Reward dicts"""
    out = []
    for part in [p.strip() for p in text.split(";") if p.strip()]:
        outcome = None
        m = re.match(r"^([^:]{2,60}):\s*(.*)$", part)
        if m and not re.search(r"\d+xp|\d+G", m.group(1)):
            outcome, part = m.group(1).strip(), m.group(2)
        r = {}
        if outcome:
            r["outcome"] = outcome
        items = []
        for tok in [t.strip() for t in part.split(",") if t.strip()]:
            t = tok.replace(",", "")
            mx = re.match(r"^([\d,]+)\s*xp$", t)
            mg = re.match(r"^(-?[\d,]+)\s*G$", t)
            if mx:
                r["xp"] = int(mx.group(1).replace(",", ""))
            elif mg:
                r["gold"] = int(mg.group(1).replace(",", ""))
            elif t in ("-", "?") or t.lower() in ("xp only",):
                if t.lower() == "xp only":
                    r["note"] = "experience only"
            else:
                items.append(tok)
        if items:
            r["items"] = items
        if r:
            out.append(r)
    return out


rewards_md = open(os.path.join(RES, "quest_rewards.md")).read()
RW = {}
for line in rewards_md.splitlines():
    if line.count("|") >= 5 and not line.startswith("Format"):
        cols = [c.strip() for c in line.split("|")]
        name = cols[0]
        RW[name] = {"area": cols[1], "giver": cols[2], "req": cols[3], "unlocks": cols[4], "rewards": "|".join(cols[5:])}
    elif line.startswith("Post-game (Halls"):
        for part in line.split(":", 1)[1].split("|"):
            m = re.match(r"\s*(.+?) \((.+?)\) (.*)$", part.strip())
            if m:
                nm = m.group(1)
                if nm == "Aiding Ernesto":
                    nm = "The Importance of Aiding Ernesto"
                if nm == "Regentkin's Resolve":
                    nm = "The Regentkin's Resolve"
                RW[nm] = {"area": "", "giver": m.group(2), "req": "", "unlocks": "-", "rewards": m.group(3).replace(" Wyrmslife Crystal", " Wyrmslife Crystals")}
ALIAS = {"The Provisioner's Plight": "Provisioner's Plight"}

side = json.load(open(os.path.join(RES, "side_quests.json")))["quests"]
choices = []


def mkchoice(qid, qname, prompt, opts, stage, dlc=False, advice=None):
    c = {"id": f"{qid}-choice{sum(1 for x in choices if x['quest']==qid)+1}", "name": f"{qname}: {prompt}", "quest": qid,
         "prompt": prompt, "spoiler": 3, "dlc": dlc, "stage": stage, "options": opts, "refs": ["samurai-gamers"]}
    if advice:
        c["advice"] = advice
    choices.append(c)
    return c["id"]


def align(prov, idx):
    if not prov:
        return None
    p = prov.replace("(provisional)", "").strip()
    if p == "neutral":
        return "neutral"
    m = re.match(r"(good|evil|neutral) vs (good|evil|neutral)", p)
    return m.group(idx + 1) if m and idx < 2 else None


name_to_id = {}
for q in side:
    n = q["name"]
    qid = slug(n)
    name_to_id[n] = qid
for q in side:
    n = q["name"]
    qid = name_to_id[n]
    rw = RW.get(ALIAS.get(n, n)) or RW.get(n.replace("The ", "", 1)) or {}
    st = STAGE.get(n) or stage_for(q["unlock"])
    if "Unmoored" in q["area"]:
        st = "pg"
    e = {"id": qid, "name": n, "kind": "side", "spoiler": 1, "dlc": False, "stage": st,
         "area": q["area"].replace(" (postgame)", ""), "premise": PREMISE.get(n, "Details coming soon."),
         "refs": ["powerpyx", "fextralife"]}
    if rw.get("giver") and rw["giver"] not in ("-", "n/a"):
        e["giver"] = rw["giver"]
    unlock = q["unlock"].replace(";MISSABLE(reported)", "").replace("; MISSABLE (do before Feast of Deception)", "").replace("; MISSABLE", "")
    e["unlock"] = (unlock[0].upper() + unlock[1:]).strip()
    req = rw.get("req", "")
    if req and req not in ("-",) and req.lower() not in e["unlock"].lower() and not req.lower().startswith("after"):
        e["unlock"] += f". Also: {req}"
    if q.get("missable") or n in LOCKS:
        e["missable"] = True
    if n in LOCKS:
        e["locksAt"] = LOCKS[n]
    if n in TIMED:
        e["timed"] = True
        e["failure"] = TIMED[n]
    if rw.get("rewards"):
        r = parse_rewards(rw["rewards"])
        if r:
            e["rewards"] = r
    if rw.get("unlocks") and rw["unlocks"] not in ("-", "?"):
        e.setdefault("tips", []).append(f"Unlocks: {rw['unlocks']}.")
    rel = []
    for l in q.get("links") or []:
        for other in name_to_id:
            if other in l and other != n:
                rel.append(name_to_id[other])
    if rel:
        e["related"] = sorted(set(rel))
    ch = q.get("choice")
    if ch:
        opts = []
        for i, (lab, res) in enumerate(ch["options"]):
            o = {"label": lab, "result": res}
            a = align(ch.get("alignment_provisional"), i)
            if a:
                o["alignment"] = a
            opts.append(o)
        e["choices"] = [mkchoice(qid, n, "What do you do?", opts, st)]
    quests.append(e)

# main-quest choices
mqc = json.load(open(os.path.join(RES, "main_quest_choices.json")))["choices"]
mkchoice("seat-of-the-sovran", "Vernworth story", "A guard asks where a running urchin went",
         [{"label": "Tell the truth", "result": "The guard chases the urchin off.", "alignment": "good"},
          {"label": "Lie", "result": "The urchin gets away for now. The guard finds him later and asks you to look again.", "alignment": "evil"}], "m04")
mkchoice("the-caged-magistrate", "The Caged Magistrate", "Waldhar keeps talking while you free him",
         [{"label": "Urge him to escape", "result": "He won't go until he has his tomes. The Gracious Hand's Vault (opened by The Heel of History) has room for them.", "links": ["the-heel-of-history"]},
          {"label": "Tell him to stop talking", "result": "He keeps chatting but still follows the law."}], "m07")
mkchoice("hunt-for-the-jadeite-orb", "Hunt for the Jadeite Orb", "Who gets the orb?",
         [{"label": "Real orb to Everard", "result": "You get 2,000 gold and the Ring of Skullduggery."},
          {"label": "Real orb to Offulve", "result": "You get 3,000 gold and the Elite Camping Kit."},
          {"label": "Buy fakes from Ibrahim (12,000 gold) and satisfy both", "result": "You get 5,000 gold and both items. Costs more up front."}],
         "m04", advice="Want both rewards? Buy the forgeries from Ibrahim's Scrap Store and hand one to each buyer.")
mkchoice("steeled-resolve-blazing-forge", "Regalia Sword", "Who repairs the sword?",
         [{"label": "Trust Sara with it", "result": "Sara repairs it using 15 Glimmercoal."},
          {"label": "Refuse", "result": "It gets repaired without Sara."}], "m11")
mkchoice("legacy", "Legacy", "The Dragon offers you a way out",
         [{"label": "Flee and accept", "result": "Bad ending: a sad coronation and the credits roll."},
          {"label": "Fight and win", "result": "Good ending: coronation and banquet. Sit on the throne for an achievement."},
          {"label": "Fight, then retry with the Empowered Godsbane Blade", "result": "True ending path: talk to the Pathfinder instead of taking the throne, ride the Dragon to its heart and use the blade. Leads to the Unmoored World."}],
         "m16", advice="To keep the true ending open, you need the Empowered Godsbane Blade from A New Godsway.")

# Extra outcome-based choices from quest_rewards (own words)
EXTRA = {
    "A Case of Sculptor's Block": [("Pose and help well", "Perfect statue: bigger gold reward."), ("Poor result", "Smaller gold reward.")],
    "Welcome to Battahl": [("Win the 3-on-1 fight", "Best reward."), ("Win the duel", "Gold reward."), ("Lose the duel", "You lose 3,000 gold.")],
    "A Poisonous Proposal": [("Keep Jarle alive", "Ring of Purification and the full reward.")],
    "Every Rose Has Its Thorn": [("Help with the assassination", "Ring of Benevolence and gold."), ("Refuse", "Gold, Tiger Eye and an Allheal Elixir."), ("Tell Allard", "A small gold reward.")],
    "A Veil of Gossamer Clouds": [("Show the unfinished letter", "Smaller reward."), ("Find the delivered letter", "Bigger gold reward plus a Ferrystone.")],
    "Clash and Conclusion": [("Defeat him", "Gold and XP."), ("Let him leave", "The Exalted mace, more gold and the Moonglint Key.")],
    "Steeled Resolve, Blazing Forge": [("Return the real sword", "The full reward."), ("Return a forgery", "Less gold, and you keep the Restored Regalia Sword.")],
    "A Noble Exchange": [("Catch the thief and discard the staff", "Full reward."), ("Keep the staff", "Less gold.")],
    "Home is Where the Hearth Is": [("Help fight the soldiers", "Ring of Assurance and gold."), ("Let villagers fight alone", "Experience only.")],
}
for n, opts in EXTRA.items():
    qid = slug(n)
    q = next((x for x in quests if x["id"] == qid), None)
    if not q:
        continue
    cid = mkchoice(qid, n, "How it can end", [{"label": a, "result": b} for a, b in opts], q["stage"])
    q.setdefault("choices", []).append(cid)

for c in choices:
    q = next((x for x in quests if x["id"] == c["quest"]), None)
    if q is not None and c["id"] not in q.get("choices", []):
        q.setdefault("choices", []).append(c["id"])

# ---------------------------------------------------------------- DLC quests (Dark Arisen)
DLC_PREMISE = {
    "Chilling Tidings": "Answer a call for help from the frozen north.",
    "Rumbles in the North": "Get your bearings in Norgan and meet its people.",
    "Seeking the Sage": "Find a sage who can explain what is happening in Norgan.",
    "Sealed History": "Uncover what Norgan's ruins are hiding.",
    "The Castle in the Ice": "Reach the frozen castle and face what waits inside.",
    "Soul Searching": "Search for a lost soul.",
    "Where There's a Will, There's a Way": "Push on toward the source of Norgan's trouble.",
    "Reunion": "Bring the Norgan story to its climax.",
    "Into Rancor": "Descend into the depths for the DLC's true ending.",
}
for i, (n, lv, note) in enumerate(DLC):
    q = {"id": slug(n), "name": n, "kind": "main", "spoiler": 1, "dlc": True, "stage": f"d{i+1:02d}", "area": "Norgan",
         "premise": DLC_PREMISE[n], "level": lv, "refs": ["game8"]}
    if note:
        q["tips"] = [note]
    quests.append(q)
for sub in ["Riddle of the Body", "Riddle of the Soul", "Riddle of the Will"]:
    quests.append({"id": slug("Sage's Wisdom " + sub), "name": f"Sage's Wisdom: {sub}", "kind": "side", "spoiler": 1, "dlc": True,
                   "stage": "d03", "area": "Norgan", "premise": "Solve one of the sage's three trials.", "refs": ["game8"],
                   "related": ["seeking-the-sage"]})

DLC_SIDE_PREMISE = {
    "Relics of the Past": ("Learn how to appraise the relics (Spoils) found in Norgan.", "d02"),
    "Hammer and Tongs": ("Help get the settlement's workshop running so you can craft.", "d02"),
    "In for a Hare, in for a Hound": ("Help a hunter and earn a hound that sniffs out Spoils.", "d02"),
    "Oh, to be in Vermund": ("Bring a homesick settler a taste of home.", "d02"),
    "Sticks and Stones": ("Gather materials for new recipes.", "d03"),
    "A Direwolf Delicacy": ("Hunt down a special meal.", "d03"),
    "Reaching the Far Shore": ("Help a settler reach a distant shore. Unlocks layered armour (transmog).", "d04"),
    "Flight in the Night": ("Help a trader escape at night and open a new shop.", "d04"),
    "Bout of Passage": ("Prove yourself in a fight against Dwayne.", "d04"),
    "When the Culling Gets Tough": ("Thin out monsters threatening the settlement.", "d04"),
    "A Howl in the Dark": ("Hunt the beast that howls at night.", "d05"),
    "Quilt Me Down With a Feather": ("Gather feathers for a warm quilt.", "d05"),
    "The Truant Soldier": ("Find a soldier who left his post.", "d05"),
    "The Snatching-Beast": ("Recover items stolen by a snow beast.", "d05"),
    "Hal's Treasure Hunt": ("Follow Hal's clues to hidden treasure.", "d06"),
    "A Keepsake, for Your Sake": ("Return a treasured keepsake.", "d06"),
    "Back to the Temple": ("Return to the old temple for one last job.", "d08"),
    "Beyond Ruin-Night": ("Face what is left after the ruin.", "d09"),
    "A Hound and His Bone": ("Help your hound with a quest of its own.", "d06"),
    "No Spoils Get Left Behind": ("Collect the last of the relics.", "d08"),
}
dlc_md = open(os.path.join(RES, "dlc_dark_arisen.md")).read()
side_line = next(l for l in dlc_md.splitlines() if l.startswith("Relics of the Past:"))
for part in side_line.split(" | "):
    nm, rest = part.split(":", 1)
    nm = nm.strip()
    prem, st = DLC_SIDE_PREMISE.get(nm, ("Details coming soon.", "d02"))
    rewards_txt = rest.strip()
    rw = []
    if nm == "Bout of Passage":
        rw = [{"outcome": "defeat Dwayne", "xp": 75000}, {"outcome": "let him win", "xp": 50000},
              {"items": ["Fungal Cure-All", "Regeneration Elixir", "Enigma Chain", "Girdle of Sagacity"]}]
    else:
        r = {}
        items = []
        for tok in [t.strip() for t in re.split(r",(?![\d])", rewards_txt)]:
            mx = re.match(r"^([\d,]+)xp$", tok)
            mg = re.match(r"^([\d,]+)G$", tok)
            if mx:
                r["xp"] = int(mx.group(1).replace(",", ""))
            elif mg:
                r["gold"] = int(mg.group(1).replace(",", ""))
            elif tok.startswith("unlocks "):
                r.setdefault("unlocks", []).append(tok[8:])
            elif tok:
                items.append(tok)
        if items:
            r["items"] = items
        rw = [r]
    quests.append({"id": slug(nm), "name": nm, "kind": "side", "spoiler": 1, "dlc": True, "stage": st, "area": "Norgan",
                   "premise": prem, "rewards": rw, "refs": ["game8"]})

LOST_RITES = {
    "Vermund": ["Devilkin Hollow", "Daemon's Corral", "Sunken Spire", "Interminable Corridor"],
    "Battahl": ["Mired Conduit", "Embersand Mine", "Shrouded Warren", "Precipitous Catacombs", "Wyrmsblood Arena"],
    "Unmoored World": ["Molten Gauntlet", "Seafloor Sepulcher", "Final Proving Ground"],
}
quests.append({"id": "lost-rites", "name": "Lost Rites dungeons", "kind": "side", "spoiler": 1, "dlc": True, "stage": "m04",
               "area": "Vermund, Battahl and the Unmoored World", "level": 20,
               "premise": "Twelve repeatable dungeons added to the original map, each with gear for every vocation.",
               "unlock": "Talk to Captain Brant at the Stardrop Inn, Vernworth, at night and ask about the uncovered ruins.",
               "tips": ["Recommended level is about 20.", "Final chests give Offering Flames, needed for Norgan's Obelisks.",
                        "Final Proving Ground opens after you clear two other Unmoored World Lost Rites."]
               + [f"{k}: {', '.join(v)}." for k, v in LOST_RITES.items()],
               "refs": ["game8"]})

json.dump(story, open(os.path.join(OUT, "story.json"), "w"), indent=1, ensure_ascii=False)
json.dump(quests, open(os.path.join(OUT, "quests.json"), "w"), indent=1, ensure_ascii=False)
json.dump(choices, open(os.path.join(OUT, "choices.json"), "w"), indent=1, ensure_ascii=False)
print(len(story), "story steps,", len(quests), "quests,", len(choices), "choices")
missing = [q["name"] for q in quests if q["premise"] == "Details coming soon."]
print("missing premise:", missing)
