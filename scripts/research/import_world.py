#!/usr/bin/env python3
"""One-time importer: areas, tips (leveling, riddles, endings, fixes, bosses, secrets) and achievements.
Text is our own wording. Run: python3 scripts/research/import_world.py"""
import json, re, os

ROOT = os.path.join(os.path.dirname(__file__), "..", "..")
RES = os.environ.get("RESEARCH_DIR", "/mnt/project-files/dd2-research")
OUT = os.path.join(ROOT, "content", "dd2")


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower().replace("'", "")).strip("-")


quests = json.load(open(os.path.join(OUT, "quests.json")))
qbyname = {q["name"]: q for q in quests}

# ---------------------------------------------------------------- areas
areas = []
region = None
STAGE = {"Vermund": "m01", "Battahl": "m11", "Unmoored World": "pg", "Norgan": "d01"}
AREA_STAGE = {"Vernworth": "m04", "Melve": "m03", "Borderwatch Outpost": "m02", "Checkpoint Rest Town": "m04",
              "Moonglint Tower": "m15", "Seafloor Shrine": "m13", "Agamen Volcanic Island": "m11", "Excavation Site": "m11"}
for line in open(os.path.join(RES, "areas.md")).read().splitlines():
    if line.startswith("## Regions"):
        region = "regions"
        continue
    if line.startswith("## Vermund"):
        region = "Vermund"
        continue
    if line.startswith("## Battahl"):
        region = "Battahl"
        continue
    if line.startswith("## TODO"):
        break
    m = re.match(r"^([^:]+): (.+)$", line)
    if not m or not region:
        continue
    name, summary = m.group(1).strip(), m.group(2).strip()
    summary = summary[0].upper() + summary[1:]
    summary = summary.replace("; ", ". ")
    summary = re.sub(r"\. ([a-z])", lambda mm: ". " + mm.group(1).upper(), summary)
    if not summary.endswith("."):
        summary += "."
    if name.startswith("Wyrmsblood Forest,"):
        summary = "Wild areas of Battahl: " + name + "."
        name = "Battahl wilds"
    if region == "regions":
        nm = name.replace(" (DLC)", "")
        areas.append({"id": slug(nm), "name": nm, "region": nm, "summary": summary, "spoiler": 1 if nm != "Unmoored World" else 3,
                      "dlc": "(DLC)" in name, "stage": STAGE.get(nm, "m02"), "refs": ["fextralife"]})
        continue
    a = {"id": slug(name.split(",")[0]), "name": name, "region": region, "parent": slug(region), "summary": summary,
         "spoiler": 1, "dlc": False, "stage": AREA_STAGE.get(name, STAGE[region]), "refs": ["fextralife"]}
    qs = [q["id"] for q in quests if q.get("area") and (q["area"] == name or q["area"].startswith(name))]
    if qs:
        a["quests"] = qs
    areas.append(a)
areas.append({"id": "norgandian-settlement", "name": "Norgandian Settlement", "region": "Norgan", "parent": "norgan", "spoiler": 1,
              "dlc": True, "stage": "d01", "refs": ["game8"],
              "summary": "Your base in Norgan. Has a Portcrystal, the relic appraiser and, after Hammer and Tongs, Hal's workshop.",
              "quests": [q["id"] for q in quests if q.get("area") == "Norgan" and q["kind"] == "side"]})
areas.append({"id": "norgan-portcrystals", "name": "Norgan travel", "region": "Norgan", "parent": "norgan", "spoiler": 1, "dlc": True,
              "stage": "d01", "refs": ["game8"],
              "summary": "Only Norgan Portcrystals work in Norgan. Fixed ones: Norgandian Settlement, Rivercave Campground (north of the settlement) and Shrine of Wisdom (far north-west). You also get a free portable one after Chilling Tidings that can only be placed in Norgan."})

# ---------------------------------------------------------------- tips
tips = []


def tip(name, topic, body, spoiler=2, stage="m01", dlc=False, steps=None, platform=None, level=None, refs=None, tid=None):
    t = {"id": tid or slug(topic + " " + name), "name": name, "topic": topic, "body": body, "spoiler": spoiler, "dlc": dlc,
         "stage": stage, "refs": refs or ["game8"]}
    if steps:
        t["steps"] = steps
    if platform:
        t["platform"] = platform
    if level:
        t["level"] = level
    tips.append(t)


hm = json.load(open(os.path.join(RES, "hints_mysteries.json")))
RIDDLE_TEXT = {
    "Eyes": "Hand over the Sealing Phial. It is in the chest above the doorway that opens nearby.",
    "Madness": "Bring the pawn or person you are closest to. Carrying your pawn onto the platform also works.",
    "Wisdom": "Bring a pawn named SphinxFather, SphinxMother or SphinxParent. Search the rift for one by name.",
    "Conviction": "Hand over any item at all.",
    "Rumination": "Hand over a Finder's Token. It appears where you picked up your first Seeker's Token.",
    "Reunion": "Go to the Frontier Shrine in Battahl.",
    "Recollection": "Bring the right number of statues.",
    "Contest": "Beat the enemy she sends at you.",
    "Futility": "Bring Maurits to the amphora, or carry the amphora to Maurits.",
    "Differentiation": "Bring a pawn named Vergil or Dante.",
}
for i, (nm, _sol, reward) in enumerate(hm["sphinx"]["riddles"]):
    tip(f"Sphinx riddle {i+1}: {nm}", "riddle", RIDDLE_TEXT[nm], spoiler=3, stage="m04",
        steps=[f"Reward: {reward}."], tid=f"riddle-{slug(nm)}")
tip("Sphinx finale", "riddle",
    "After her riddles you can fight the Sphinx. Beating her gives the Key of Sagacity, which opens a big chest holding an Eternal Wakestone. The Unmaking Arrow makes it much easier, but only an Archer or Warfarer can fire it.",
    spoiler=3, stage="m04", tid="riddle-finale")
tip("Where the Sphinx is", "riddle", "Her riddles start at the Mountain Shrine in Vermund and continue at the Frontier Shrine in Battahl.",
    spoiler=1, stage="m04", tid="riddle-where")

lv = json.load(open(os.path.join(RES, "leveling_spots.json")))
LVL = {"early": (10, 25), "early (claim)": (10, 25), "mid": (25, 40), "late": (40, 60)}
OWN = [
    ("Rock lizards near Checkpoint Rest Town", "early",
     "A campfire near Checkpoint Rest Town has lots of rock lizards (about 624 XP each). Further along are an armoured Cyclops (about 2,678), two Minotaurs (about 3,296 each) and a hidden Chimera (about 5,047).",
     ["Take the west Vernworth oxcart (about 200 gold).", "Go down the bridge and follow the stream to a cave.", "Keep right, climb out and cross the wooden bridge to the campfire."]),
    ("Go to Bakbattahl early", "early",
     "Enemies around Bakbattahl give 200 to 500 XP each, against 100 to 150 near Vernworth. The Guerco Cavern route is easier (one Stone Golem and a Chimera). The northern canyon from Checkpoint is harder.", None),
    ("Griffin near Melve", "early (claim)", "Players report the Griffin near the tower by Melve gives about 7,000 XP and respawns. Not yet confirmed by us.", None),
    ("Hobgoblins west of Bakbattahl", "mid", "Use the campfire south of Bakbattahl's western road. Hobgoblins give about 295 to 550 XP each.", None),
    ("Volcanic Island", "mid", "Strong XP and DCP (the points you spend on vocation skills) after you unlock Magick Archer or Warfarer there. Martyr's Bolt can drop a Drake in one or two hits, at a cost to your health.", None),
    ("Road to Dragonsbreath Tower", "late", "Knackers (about 417 XP), Redwolves (about 479) and Lost Mercenaries (about 556). Bring a ranged weapon for the Gore Harpies.", None),
    ("Drakes", "late", "Drakes give some of the best XP late in the game. Bring holy or ice damage.", None),
]
for nm, stg, body, steps in OWN:
    tip(nm, "leveling", body, spoiler=1, stage={"early": "m04", "early (claim)": "m03", "mid": "m11", "late": "m14"}[stg],
        steps=steps, level=LVL[stg])
GEN = [
    "Big groups add up: about ten goblins are worth one Cyclops.",
    "Resting at a campfire respawns many enemies. Cook food with a camping kit for stat boosts.",
    "Cyclops and Minotaurs come back about every 3 in-game days, Drakes about every 7.",
    "Area-damage pawns (Sorcerer, Warrior) clear groups faster.",
    "The Ring of Ambition gives a little extra XP.",
    "Warfarer splits XP across every vocation you have unlocked. To level one vocation fast, keep only that one unlocked.",
]
tip("Levelling basics", "leveling", "A few habits that speed up levelling all game long.", spoiler=1, stage="m03", steps=GEN, tid="leveling-basics")

tip("Base game endings", "ending",
    "Flee from the Dragon and agree: bad ending. Fight and defeat the Dragon: good ending. True ending: you need the Empowered Godsbane Blade. Talk to the Pathfinder instead of taking the throne, retry the fight, ride the Dragon to its chest and use the blade. This opens the Unmoored World. Not uncovering the truth unlocks New Game Plus.",
    spoiler=3, stage="m14", refs=["fextralife"], tid="ending-base")
tip("Dark Arisen endings", "ending",
    "Normal: spare Ser Rovall's remains in The Castle in the Ice, then finish Reunion and beat the Fallen Dragon. Bad: destroy the remains and fight Eir, which ends your game (reload). True: after Reunion, finish Into Rancor and beat Satanachia in Nifhel Depth.",
    spoiler=3, stage="d05", dlc=True, refs=["fextralife"], tid="ending-dlc")
tip("Helping Eir in the dragon fight", "secret",
    "Helping Eir against the Fallen Dragon only changes some later dialogue. Running to Rovall's soul instead saves time.",
    spoiler=3, stage="d08", dlc=True, tid="secret-eir-help")
tip("Romance", "secret", "People reported as romance options: Ulrika and Wilhelmina in the base game, and Eir in Dark Arisen (not yet confirmed).",
    spoiler=2, stage="m04", tid="secret-romance")
tip("Lost Rites for XP", "leveling", "The repeatable Lost Rites dungeons are a strong late-game XP source.", spoiler=1, stage="m14", dlc=True, level=(40, 60), tid="leveling-lost-rites")
tip("Hard Mode", "general", "A free update added Hard Mode for everyone. Enemies hit harder and take more, and you earn more XP and DCP.",
    spoiler=0, stage="m01", tid="general-hard-mode")
tip("Spoils (Norgan relics)", "general",
    "Norgan drops unappraised Spoils. Get them appraised at the settlement for random stats. Hal's workshop can make some pieces outright after Hammer and Tongs.",
    spoiler=1, stage="d02", dlc=True, tid="general-spoils")
tip("Obelisks of Benediction", "secret",
    "Nine Obelisks in Norgan teach new weapon skills (none for Warfarer). To use one fully, bring an Offering Flame from the last chest of a Lost Rites dungeon.",
    spoiler=1, stage="d02", dlc=True, tid="secret-obelisks",
    steps=["Mage: just east of the settlement. You need a Climbing Hook (one is in a house in the Abandoned Village further east).",
           "Fighter: north-east of the settlement on a hill you can climb, guarded by a Beorcan group.",
           "Archer: north-west of Valgr Ravine, high on the mountain. Approach from the north.",
           "Thief: north-east of the Beorcan Stronghold near the main road. Hostiles around.",
           "Sorcerer: south of the Beorcan Stronghold, across the lake north-west of the settlement.",
           "Warrior: inside the Mad Lord's Chapel near the Shrine of Wisdom Portcrystal. Beat the Mad Lord.",
           "Mystic Spearhand: north-east of Inner Valley Grotto. Opens after Sage's Wisdom: Riddle of the Body.",
           "Magick Archer: Norgan Snowfield near the Snowslide Pass cave. Ghouls guard it.",
           "Trickster: west of the marked spot using a Climbing Hook, or through the east exit of Gagana's Grotto. An ice dragon guards it."])
tip("Slimes in Norgan", "secret", "Blue and purple slimes can only be killed with poison.", spoiler=1, stage="d02", dlc=True, tid="secret-slimes")

# PC fixes
tip("Fatal D3D error / device hung", "error",
    "A common PC crash. Try these one at a time and test after each.", spoiler=0, platform="PC", refs=["community"],
    steps=["Verify the game files in Steam (right-click the game, Properties, Installed Files).", "Turn off overlays (Steam, Discord, GPU tools) and close background apps.",
           "Update your graphics driver, and lower graphics settings if crashes happen in busy areas.", "Advanced: raise Windows' GPU timeout (TdrDelay in the registry). Back up the registry first."],
    tid="error-d3d")
tip("Failed to retrieve server information", "error",
    "Online features (pawn rift) can't connect. Usually a server or network blip. Check your connection, restart the game and try again later.",
    spoiler=0, refs=["community"], tid="error-server")
tip("Error 0x2000000 (pawn creation)", "error", "Reported when creating a pawn. No confirmed fix yet. Try restarting the game.",
    spoiler=0, refs=["community"], tid="error-0x2000000")
tip("Crashes to desktop", "error", "Capcom's own advice: add the game to your antivirus exclusions, install Windows updates and verify the game files. Below minimum specs is not supported.",
    spoiler=0, platform="PC", refs=["capcom-steam-post"], tid="error-ctd")

# Boss cheat cards (general strategy in our own words)
BOSSES = [
    ("Cyclops", "m02", "Big, slow giant with one eye.", ["Aim for the eye, it is the weak spot.", "Climb up and hit the head, or break its armour first.", "Knock it down by hitting its legs, then go for the eye."]),
    ("Griffin", "m03", "Flying beast that swoops in and out.", ["Use fire or ranged attacks to bring it down.", "Grab its back and hit the wings to ground it.", "Hang on when it flies, then drop and attack when it lands."]),
    ("Ogre", "m03", "Strong brute that charges and grabs.", ["Its weak spot is the head.", "Dodge the charges and attack its back.", "It likes to grab women, so watch your female pawns."]),
    ("Minotaur", "m04", "Bull-headed charger.", ["Dodge the charge sideways.", "Break its horns.", "Fire works well."]),
    ("Golem", "m04", "Stone construct powered by glowing discs.", ["Destroy the glowing discs on its body.", "Normal hits barely work until the discs are gone.", "Climb it to reach the high ones."]),
    ("Drake", "m11", "A lesser dragon, a real test.", ["Find its heart (a glowing spot on its chest) and hit it hard.", "Holy and ice magic help. Fire usually doesn't.", "Stay out of its breath attack."]),
    ("Medusa", "m11", "Snake-woman whose gaze turns you to stone.", ["Don't look at her: stay behind her or crouch out of the gaze.", "Cutting off her head gives you a Medusa Head that can petrify other enemies.", "Carry potions that cure petrification."]),
    ("Lich", "m11", "Undead spellcaster.", ["Holy magic does big damage.", "Hit it during its casting animation.", "Kill the undead it summons."]),
    ("Dullahan", "m11", "Headless horseman that appears at night.", ["Holy damage works well.", "Attack its glowing body pieces.", "Bring a lantern and light sources."]),
    ("Chimera", "m04", "Three heads in one: lion, goat and snake.", ["Cut off the snake tail first, it poisons you.", "Then kill the goat head, which casts spells.", "Finish the lion."]),
    ("Talos (the Gigantus)", "m15", "The giant from The Guardian Gigantus.", ["Climb it and break its weak points one by one.", "Breaking them all quickly earns an achievement."]),
]
for nm, stg, body, steps in BOSSES:
    tip(nm, "boss", body, spoiler=1, stage=stg, steps=steps, refs=["praetorlink"], tid=f"boss-{slug(nm)}")

# ---------------------------------------------------------------- achievements (Steam names; how, in our words)
def q(name):
    return qbyname[name]["id"] if name in qbyname else None


ACH = [
    ("First Taste of Freedom", "Finish the prologue escape.", ["a-gaoled-awakening", "m02"], 0),
    ("Arisen", "Story: get your memories back.", ["m04"], 1),
    ("Seat of the Proxy", "Story: reach Vernworth.", ["m04"], 1),
    ("Across the Border", "Story: pass through the border gate.", ["m11"], 1),
    ("Back Where It All Began", "Story: return to the volcanic island.", ["m15"], 2),
    ("Peace", "Become Sovran. Sit on the throne after the good ending.", ["legacy", "m16"], 3),
    ("Dragon's Dogma 2", "See the Unmoored World (true ending path).", ["legacy", "pg"], 3),
    ("The Hero", "Finish the Unmoored World trials (within 4 days).", ["pg"], 3),
    ("The Guardian", "Lead people to safety in the Unmoored World.", ["civil-unrest"], 3),
    ("I, Talos", "Help the giant walk again in the Unmoored World.", [], 3),
    ("Closure", "See the end of the cycle.", [], 3),
    ("Master of the Maisters", "Learn all 10 maister teachings.", [], 1),
    ("Full Marks", "Solve every Sphinx riddle.", ["a-game-of-wits"], 1),
    ("Versatile", "Change vocation once.", [], 0),
    ("Duo Destinies", "Become a Mystic Spearhand.", [], 1),
    ("Trickster of the Trade", "Become a Trickster.", [], 1),
    ("Arrows and Incantations", "Become a Magick Archer.", ["put-a-spring-in-thy-step"], 1),
    ("Jack of All Trades, Master of…All Trades", "Become a Warfarer.", ["the-sotted-sage"], 1),
    ("An In-Tents Adventure", "Camp at a campsite with a camping kit.", [], 0),
    ("A House? In This Economy?", "Buy a house.", [], 0),
    ("One Speed Only", "Ride an oxcart.", [], 0),
    ("The Savior", "Revive a dead person with a Wakestone.", [], 0),
    ("Just a Stone's Throw Away", "Use a Ferrystone.", [], 0),
    ("A Badge of Honor", "Your pawn earns a badge for beating many large monsters.", [], 0),
    ("Gigantus, I Hardly Knew Ye", "Break all of the giant's weak spots quickly.", [], 2),
    ("Off with Its Head!", "Cut off a Medusa's head.", [], 1),
    ("Getting a Head", "Get a preserved Medusa head.", [], 1),
    ("An Eye for an Eye", "Turn a Medusa to stone.", [], 1),
    ("The Specialist", "Reach the top rank (9) in a vocation.", [], 0),
    ("A Pawn of Many Talents", "Teach your pawn a specialization.", [], 0),
    ("Wish upon the Rift", "Set a pawn quest at a Riftstone.", [], 0),
    ("Myrmecoleon Delights", "Get inside the Rose Chateau.", [], 1),
    ("The Collector", "Collect 80 Seeker's Tokens.", [], 0),
    ("The Philanthropist", "Win the affection of 50 people.", [], 0),
    ("Affinity and Beyond", "Max out one person's affinity.", [], 0),
    ("Dragon Forged", "Strengthen a weapon in wyrmfire.", [], 1),
    ("This'll Cure What Ails Ye", "Soak in the hot spring on the volcanic island.", [], 1),
    ("Cyclops Abridged", "Get a Cyclops to cross a broken bridge.", [], 0),
    ("Harpy Joyride", "Summon a harpy with a Harpysnare Smoke Beacon and fly on it.", [], 0),
    ("Quit Playing Dead", "Revive two pawns at once.", [], 0),
    ("Dragon's Dogma", "Get the sword of the same name from the Dragonforged.", [], 2),
    ("The Barbecue-Maister", "Grill every kind of meat, by day and by night.", [], 0),
    ("Nobles' Night Out", "Attend a palace masquerade in formal clothes.", ["m08"], 1),
    ("Thought I'd Lost You", "Revive someone at a morgue or charnel house.", [], 0),
    ("Before Dawn Breaks", "Defeat the headless horseman (night only).", [], 1),
    ("The Tourist", "Discover 50 locations (caves count).", [], 0),
    ("Are We There Yet?", "Board the phantom oxcart.", [], 1),
    ("The Regriffining", "Fly on a griffin a second time.", [], 0),
    ("Plenty Arisen to Go Round", "Two admirers start a fight in your house.", [], 1),
    ("Roost of the Dragon", "Reach Dragonsbreath Tower.", [], 1),
    ("Hope You Brought a Lantern", "Reach Drabnir's Grotto.", [], 1),
    ("To the Victor Go the Spoils", "Get your stolen items back from a scavenger.", [], 0),
    ("I'm In", "Sneak through the border gate.", [], 1),
    ("Reaper's Scorn", "Revive several people at once with the Eternal Wakestone.", [], 2),
    ("The True Arisen", "Get every other achievement.", [], 0),
    # Dark Arisen
    ("The Forgotten North", "Arrive in Norgan.", ["d01"], 1, True),
    ("Dogma Defied", "Finish the Final Proving Ground without recovering your loss gauge.", [], 2, True),
    ("Dogma Defended", "Do what Norgan's guardian asks after the Fallen Dragon.", ["reunion"], 3, True),
    ("Strike", "Break five vile eye barriers at once.", [], 1, True),
    ("Abominable Snowstash", "Get back everything stolen in The Snatching-Beast.", ["the-snatching-beast"], 1, True),
    ("Reunited", "Grant Eir's wish.", ["d05"], 3, True),
]
achievements = []
for row in ACH:
    nm, how, marks, sp = row[:4]
    dlc = len(row) > 4 and row[4]
    story_ids = {"m%02d" % i for i in range(1, 17)} | {"pg"} | {"d%02d" % i for i in range(1, 10)}
    marks = [m for m in marks if m in story_ids or any(x["id"] == m for x in quests)]
    achievements.append({"id": slug(nm), "name": nm, "how": how, "dlc": bool(dlc), "spoiler": sp, "marks": marks})

json.dump(areas, open(os.path.join(OUT, "areas.json"), "w"), indent=1, ensure_ascii=False)
json.dump(tips, open(os.path.join(OUT, "tips.json"), "w"), indent=1, ensure_ascii=False)
json.dump(achievements, open(os.path.join(OUT, "achievements.json"), "w"), indent=1, ensure_ascii=False)
for qq in quests:  # link achievements back to quests
    a = next((a for a in achievements if qq["id"] in a["marks"]), None)
    if a:
        qq["achievement"] = a["name"]
json.dump(quests, open(os.path.join(OUT, "quests.json"), "w"), indent=1, ensure_ascii=False)
print(len(areas), "areas,", len(tips), "tips,", len(achievements), "achievements")
