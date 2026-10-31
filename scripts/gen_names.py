"""Generate src/data/names.json from the game's English localization (en_Game.locres).
usage: python scripts/gen_names.py <path-to-locres.py-dir> <path-to-en_Game.locres>
"""
import sys, re, json
sys.path.insert(0, sys.argv[1])
import locres
o = locres.parse(open(sys.argv[2], 'rb').read())
bad = re.compile(r'test|\(|placeholder', re.I)
adv = sorted({v for (ns, k), v in o.items() if ns == 'Adventure' and k.endswith('adventurer_name') and k != '1adventurer_name' and not bad.search(v)})
pet = sorted({v for (ns, k), v in o.items() if ns == 'Pet' and re.fullmatch(r'\d+Name', k) and not bad.search(v)})
json.dump({'Adventurer': adv, 'Buddy': pet}, open('src/data/names.json', 'w'), indent=1, ensure_ascii=False)
print(len(adv), len(pet), adv, pet)
