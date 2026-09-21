"""construir.py — Genera buscador-bibliografico.html (un solo archivo) desde la versión modular.
Uso: python3 construir.py"""
import re, pathlib
raiz = pathlib.Path(__file__).parent
html = (raiz / 'index.html').read_text(encoding='utf-8')
css = (raiz / 'css/styles.css').read_text(encoding='utf-8')
html = html.replace('<link rel="stylesheet" href="css/styles.css">', f'<style>\n{css}</style>')
def incrustar(m):
    ruta = m.group(1)
    codigo = (raiz / ruta).read_text(encoding='utf-8')
    return f'<script>\n/* ==================== {ruta} ==================== */\n{codigo}</script>'
html = re.sub(r'<script src="(js/[^"]+)"></script>', incrustar, html)
(raiz / 'buscador-bibliografico.html').write_text(html, encoding='utf-8')
print('Generado buscador-bibliografico.html:', len(html)//1024, 'KB')
