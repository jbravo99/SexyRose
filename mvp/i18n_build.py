#!/usr/bin/env python3
"""Genera src/i18n-dict.js desde i18n/dict.json."""
import json
D = json.load(open('i18n/dict.json'))
open('src/i18n-dict.js', 'w').write('/* Diccionario de la interfaz: "texto en español": ["English", "Português"]. {x} = texto variable, {n} = número.\n   Generado desde i18n/dict.json (python3 i18n_build.py). Para corregir una traducción, editá i18n/dict.json y volvé a generar. */\nHH.I18N = ' + json.dumps(D, ensure_ascii=False, indent=0, sort_keys=True) + ';\n')
print('ok', len(D))
