"""
Vila do Chat: exporta os modelos do Blender para o jogo (.glb).

Como usar
---------
1. Salve o seu .blend dentro da pasta `blender/` do repositório.
2. Cada modelo fica numa COLEÇÃO com o nome do modelo (ex.: `predio_house_1`, `arvore_pinheiro`).
   A lista de nomes e as medidas estão em `public/models/LEIAME.md`.
3. No Blender: aba Scripting > Abrir este arquivo > Executar (Alt+P).
   Ou pelo terminal:  blender meu_arquivo.blend --background --python blender/exportar_vila.py
4. Os arquivos saem em `public/models/` e o `manifest.json` é atualizado sozinho.

Opções pelo terminal (depois de `--`):
  --saida PASTA   pasta de saída (padrão: ../public/models ao lado do .blend)
  --gabarito      em vez de exportar, cria a coleção `gabarito` com o tamanho do chão de cada prédio

O centro do chão de cada coleção vira a origem do modelo (pode espalhar os modelos pela cena).
Se quiser escolher a origem na mão, ponha um Empty chamado `origem` dentro da coleção.
"""

import json
import os
import re
import sys

import bpy
from mathutils import Vector

# Mude para True e execute para criar o gabarito pelo editor de texto do Blender.
GABARITO = False

NOME_VALIDO = re.compile(r"^(predio|arvore)_[a-z0-9_]+$")

# Tamanho do chão em metros (1 metro = 1 quadrado do mapa) e altura sugerida.
CHAO = {
    "predio_townhall": (3, 3, 2.2),
    "predio_house": (2, 2, 1.4),
    "predio_farm": (2, 2, 0.5),
    "predio_well": (2, 2, 1.0),
    "predio_sawmill": (2, 2, 1.3),
    "predio_quarry": (2, 2, 1.0),
    "predio_warehouse": (2, 2, 1.3),
    "predio_dam": (2, 1, 0.6),
    "predio_bridge": (1, 1, 0.4),
    "predio_market": (2, 2, 1.3),
    "predio_waterwheel": (2, 2, 1.4),
    "arvore_pinheiro": (1, 1, 1.7),
    "arvore_carvalho": (1, 1, 1.4),
    "arvore_betula": (1, 1, 1.5),
}


def args():
    return sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


def pasta_saida():
    a = args()
    if "--saida" in a:
        return os.path.abspath(a[a.index("--saida") + 1])
    if not bpy.data.filepath:
        raise RuntimeError("Salve o .blend primeiro (de preferência na pasta blender/ do repositório).")
    padrao = bpy.path.abspath("//../public/models")
    return os.path.normpath(padrao if os.path.isdir(padrao) else bpy.path.abspath("//modelos_exportados"))


def chao_de(nome):
    """Medidas esperadas: `predio_house_3` usa as de `predio_house`."""
    while nome:
        if nome in CHAO:
            return CHAO[nome]
        nome = nome.rpartition("_")[0]
    return None


def caixa(objs):
    """Menor e maior canto (no mundo) das malhas, com modificadores aplicados."""
    deps = bpy.context.evaluated_depsgraph_get()
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for o in objs:
        if o.type != "MESH":
            continue
        ev = o.evaluated_get(deps)
        for canto in ev.bound_box:
            p = ev.matrix_world @ Vector(canto)
            for i in range(3):
                lo[i] = min(lo[i], p[i])
                hi[i] = max(hi[i], p[i])
    return (lo, hi) if lo.x < 1e8 else None


def exportar_colecao(col, pasta):
    objs = [o for o in col.all_objects if o.visible_get()]
    malhas = [o for o in objs if o.type == "MESH"]
    if not malhas:
        if not col.all_objects:
            return False  # coleção vazia criada pelo gabarito
        print(f"  [pulado] {col.name}: sem malhas visíveis")
        return False
    lo, hi = caixa(malhas)
    origem = next((o for o in col.all_objects if o.type == "EMPTY" and o.name.lower().startswith("origem")), None)
    desloc = origem.matrix_world.translation.copy() if origem else Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z))

    esperado = chao_de(col.name)
    if esperado:
        w, d, _ = esperado
        tam = hi - lo
        if tam.x > w * 1.25 or tam.y > d * 1.25:
            print(f"  [aviso] {col.name}: chão {tam.x:.2f} x {tam.y:.2f} m, o esperado é até {w} x {d} m (vai invadir os vizinhos)")
        if tam.x < w * 0.3 and tam.y < d * 0.3:
            print(f"  [aviso] {col.name}: muito pequeno ({tam.x:.2f} x {tam.y:.2f} m); 1 metro do Blender = 1 quadrado do mapa")

    # leva o modelo para a origem só durante a exportação
    conjunto = set(objs)
    raizes = [o for o in objs if o.parent not in conjunto]
    guardado = [(o, o.matrix_world.copy()) for o in raizes]
    for o, m in guardado:
        novo = m.copy()
        novo.translation = m.translation - desloc
        o.matrix_world = novo

    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        if o.type != "EMPTY" or not o.name.lower().startswith("origem"):
            o.select_set(True)
    bpy.context.view_layer.update()
    try:
        bpy.ops.export_scene.gltf(
            filepath=os.path.join(pasta, col.name + ".glb"),
            export_format="GLB",
            use_selection=True,
            export_apply=True,  # aplica modificadores
            export_yup=True,  # Z do Blender vira o Y (para cima) do jogo
            export_cameras=False,
            export_lights=False,
            export_animations=False,
        )
    finally:
        for o, m in guardado:
            o.matrix_world = m
        bpy.context.view_layer.update()
    print(f"  [ok] {col.name}.glb")
    return True


def exportar():
    pasta = pasta_saida()
    os.makedirs(pasta, exist_ok=True)
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    print(f"\nVila do Chat: exportando para {pasta}")
    feitos = 0
    for col in bpy.data.collections:
        if col.name == "gabarito":
            continue
        if not NOME_VALIDO.match(col.name):
            if col.name.lower().startswith(("predio", "arvore")):
                print(f"  [pulado] {col.name}: nome fora do padrão (minúsculas, números e _)")
            continue
        feitos += exportar_colecao(col, pasta)

    # o manifesto lista tudo o que existe na pasta (também os modelos exportados em outro dia)
    nomes = sorted(f[:-4] for f in os.listdir(pasta) if f.endswith(".glb") and NOME_VALIDO.match(f[:-4]))
    with open(os.path.join(pasta, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump({"versao": 1, "modelos": nomes}, f, indent=2)
        f.write("\n")
    print(f"Pronto: {feitos} exportados agora, {len(nomes)} no manifest.json\n")


def gabarito():
    """Cria um retângulo de arame do tamanho do chão de cada tipo, lado a lado, para modelar em cima."""
    col = bpy.data.collections.get("gabarito") or bpy.data.collections.new("gabarito")
    if col.name not in bpy.context.scene.collection.children:
        bpy.context.scene.collection.children.link(col)
    for o in list(col.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    x = 0.0
    for nome, (w, d, h) in CHAO.items():
        cx = x + w / 2
        v = [(cx - w / 2, -d / 2, 0), (cx + w / 2, -d / 2, 0), (cx + w / 2, d / 2, 0), (cx - w / 2, d / 2, 0)]
        v += [(a, b, h) for a, b, _ in v]
        arestas = [(0, 1), (1, 2), (2, 3), (3, 0), (4, 5), (5, 6), (6, 7), (7, 4), (0, 4), (1, 5), (2, 6), (3, 7)]
        malha = bpy.data.meshes.new("gab_" + nome)
        malha.from_pydata(v, arestas, [])
        ob = bpy.data.objects.new("gab_" + nome, malha)
        ob.hide_select = True
        col.objects.link(ob)
        # seta na frente: a frente do prédio (porta) olha para -Y, a vista "Frente" do Blender (Numpad 1)
        seta = bpy.data.meshes.new("gab_frente_" + nome)
        seta.from_pydata([(cx - 0.15, -d / 2, 0), (cx + 0.15, -d / 2, 0), (cx, -d / 2 - 0.3, 0)], [(0, 1), (1, 2), (2, 0)], [])
        ob2 = bpy.data.objects.new("gab_frente_" + nome, seta)
        ob2.hide_select = True
        col.objects.link(ob2)
        texto = bpy.data.curves.new("gab_txt_" + nome, "FONT")
        texto.body = nome
        texto.size = 0.22
        ob3 = bpy.data.objects.new("gab_txt_" + nome, texto)
        ob3.location = (x, d / 2 + 0.1, 0)
        ob3.hide_select = True
        col.objects.link(ob3)
        if not bpy.data.collections.get(nome):
            bpy.context.scene.collection.children.link(bpy.data.collections.new(nome))
        x += w + 1.5
    print("Gabarito criado: modele cada peça dentro do retângulo, na coleção de mesmo nome.")


if __name__ == "__main__":
    if GABARITO or "--gabarito" in args():
        gabarito()
    else:
        exportar()
