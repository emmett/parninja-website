#!/usr/bin/env python3
"""Inline privacy/policy-body.html into privacy/index.html."""

from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
index_path = ROOT / 'privacy' / 'index.html'
body_path = ROOT / 'privacy' / 'policy-body.html'

index = index_path.read_text(encoding='utf-8')
body = body_path.read_text(encoding='utf-8')

open_tag = '<article class="legal-content" id="policy-content">'
close_tag = '</article>'
start = index.index(open_tag) + len(open_tag)
end = index.index(close_tag, start)

index = index[:start] + '\n' + body + '\n        ' + index[end:]

if "fetch('policy-body.html')" in index:
    fetch_start = index.index("      fetch('policy-body.html')")
    fetch_end = index.index('});', fetch_start) + 3
    index = index[:fetch_start] + index[fetch_end:]

index_path.write_text(index, encoding='utf-8')
print(f'Updated {index_path}')
