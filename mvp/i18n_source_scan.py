#!/usr/bin/env python3
"""Busca textos de interfaz en el código (fuera de admin) que no estén en i18n/dict.json → i18n/source_missing.json."""
import json, re, itertools
D = json.load(open('i18n/dict.json'))
FILES = ['core.js', 'bookings.js', 'chat.js', 'activity.js', 'geo.js', 'views-public.js', 'views-dashboard.js', 'views-client.js', 'ops.js', 'interests.js', 'highlights.js']
lit_re = re.compile(r"'((?:[^'\\\n]|\\.)*)'|\"((?:[^\"\\\n]|\\.)*)\"")
def alts(expr):
    if '?' in expr:
        ls = [a or b for a, b in lit_re.findall(expr)]
        ls = [x for x in ls if not re.search(r'[<>=#]|^\s*$', x) or x == '']
        if ls:
            if re.search(r":\s*''\s*$", expr) or re.search(r"\?\s*''", expr): ls.append('')
            return list(dict.fromkeys(ls))[:4]
    return ['{x}']
def expand(seg):
    parts = re.split(r'(\$\{(?:[^{}]|\{[^{}]*\})*\})', seg)
    opts = [[p] if not p.startswith('${') else alts(p[2:-1]) for p in parts]
    out = []
    for combo in itertools.islice(itertools.product(*opts), 16):
        t = re.sub(r'\s+', ' ', ''.join(combo)).strip()
        out.append(t)
    return out
found = set()
for f in FILES:
    s = open('src/' + f).read()
    # 1) texto entre etiquetas
    for m in re.finditer(r'>([^<>`]*[A-Za-zÁÉÍÓÚáéíóúñÑ¿¡][^<>`]*)<', s):
        seg = m.group(1)
        if seg.count('${') > 3 or re.search(r'=>|\bconst\b|function|\);', seg): continue
        for t in expand(seg): found.add(t)
    # 2) literales con aspecto de texto de interfaz
    for a, b in lit_re.findall(s):
        t = (a or b)
        if '${' in t: continue
        if re.search(r'[<>=#{}();]|^[a-z]+[A-Z]|^[a-z0-9_.-]+$|^\W', t): continue
        if not re.search(r'[A-ZÁÉÍÓÚ¿¡]', t[:2]) and not re.search(r'[áéíóúñ]', t): continue
        if len(t) < 3 or len(t.split()) < 1: continue
        found.add(t.strip())
def known(t):
    if t in D: return True
    g = re.sub(r'\d+(?:[.,]\d+)*', '{n}', t)
    if g in D: return True
    return False
todo = sorted(t for t in found if t and re.search(r'[a-záéíóúñ]{3,}', t.replace('{x}', ''), re.I) and not known(t) and len(t) < 400 and not t.startswith(('http', 'data:', 'M0', 'var(')))
json.dump(todo, open('i18n/source_missing.json', 'w'), ensure_ascii=False, indent=0)
print(len(todo))
