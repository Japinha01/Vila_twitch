"""
Vila do Chat: monta os modelos low poly de prédios e árvores no Blender.

Use depois de `vila_export.py` (ele cria as guias e exporta). No Blender, com a cena aberta:

    exec(open(r"CAMINHO/vila_export.py", encoding="utf-8").read())   # sem rodar o __main__
    register(); create_guides(bpy.context.scene)
    exec(open(r"CAMINHO/build_models.py", encoding="utf-8").read())
    build_all(bpy.context.scene)                  # monta todas as coleções
    export_models(bpy.context.scene, r"CAMINHO/modelos")   # grava os .glb e o manifest.json

Cada modelo é montado no centro da guia dele (origem = centro da base, chão em Z = 0, frente em -Y).
Cada material vira um objeto separado: o jogo precisa disso para pintar partes e achar a folhagem.
"""

import math

import bmesh
import bpy
from mathutils import Matrix, Vector

# ---------- cores (mesmas do jogo, em src/render/models.ts) ----------
COL = {
    "tronco": "#8d5a2b", "tronco_bola": "#74481f",
    "folha_pinheiro": "#2f8a46", "folha_pinheiro_escuro": "#246b37",
    "folha_carvalho": "#3a9d44", "folha_betula": "#43b04f",
    "betula": "#e9ecef", "betula_faixa": "#343a40",
    "madeira": "#b9824a", "madeira_escura": "#8a5a2b", "porta": "#6b4a2b",
    "palha": "#d9b45a", "palha_escura": "#b8923d",
    "pedra": "#adb5bd", "pedra_escura": "#868e96", "pedra_clara": "#ced4da",
    "reboco": "#f1e7d0", "parede": "#f4e6c4", "parede_sombra": "#e6d3a3",
    "telha": "#e8590c", "telhado_prefeitura": "#fcc419", "tijolo": "#b5523b",
    "tijolo_escuro": "#8a3b28", "ardosia": "#5f6b7a", "vidro": "#8fd0f5",
    "vidro_azul": "#4ab3f0", "janela_luz": "#ffd43b", "metal": "#495057",
    "branco": "#f1f3f5", "cinza_claro": "#dee2e6", "bandeira": "#e03131",
    "azul_bandeira": "#1971c2", "verde_teto": "#2f9e44", "pano": "#c9a66b",
    "pano_escuro": "#2b1d12", "terra": "#a9743d", "terra_escura": "#5c4a38",
    "cinza_chao": "#a89a85", "cinzas": "#2b211a", "plantacao": "#82c91e",
    "agua": "#52b0ff", "roda_madeira": "#8d5a2b", "roda_metal": "#868e96",
    "fogo": "#ff8a1f", "fogo_claro": "#ffd43b", "fogo_vivo": "#ff6b1a",
    "dourado": "#ffd43b", "marrom_telhado": "#7c5a3a", "armazem": "#e3d3a4",
    "feno": "#fff3bf", "rosa": "#c2255c", "laranja": "#d9480f", "amarelo": "#fcc419",
    "vermelho": "#e03131", "verde": "#82c91e", "azul_claro": "#a5d8ff",
    "bege_mercado": "#e9d8a6", "madeira_clara": "#b08968", "vidro_claro": "#9fd8f5",
    "vidro_gelo": "#dff3ff", "azul_marinho": "#1c3d6e", "petroleo": "#22b8cf",
    "tabua": "#8d6a3f", "corrimao": "#74481f", "ponte": "#b98b53", "lixo": "#495057",
}
# materiais que brilham de noite (janelas, fogo)
EMIT = {"janela_luz": ("#ffd43b", 0.35), "fogo": ("#ff8a1f", 1.6), "fogo_claro": ("#ffd43b", 2.2),
        "fogo_vivo": ("#ff6b1a", 1.8)}


def _lin(hexcol):
    h = hexcol.lstrip("#")
    out = []
    for i in (0, 2, 4):
        c = int(h[i:i + 2], 16) / 255.0
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return tuple(out)


def _principled(m):
    """Nó Principled BSDF do material; cria e liga à saída se a versão do Blender não trouxe."""
    m.use_nodes = True
    nodes = m.node_tree.nodes
    b = nodes.get("Principled BSDF") or next((n for n in nodes if n.type == "BSDF_PRINCIPLED"), None)
    if b is None:
        b = nodes.new("ShaderNodeBsdfPrincipled")
        out = nodes.get("Material Output") or next((n for n in nodes if n.type == "OUTPUT_MATERIAL"), None)
        if out is None:
            out = nodes.new("ShaderNodeOutputMaterial")
        m.node_tree.links.new(b.outputs["BSDF"], out.inputs["Surface"])
    return b


def material(name):
    """Material do Blender com a cor do jogo (cria uma vez; nome = chave de COL)."""
    m = bpy.data.materials.get(name)
    if m is None:
        m = bpy.data.materials.new(name)
    b = _principled(m)
    b.inputs["Base Color"].default_value = (*_lin(COL[name]), 1.0)
    b.inputs["Roughness"].default_value = 0.85
    if name in EMIT:
        hexcol, strength = EMIT[name]
        b.inputs["Emission Color"].default_value = (*_lin(hexcol), 1.0)
        b.inputs["Emission Strength"].default_value = strength
    return m


class Model:
    """Acumula as peças de um modelo: um bmesh por (grupo, material)."""

    def __init__(self, key, base):
        self.key = key
        self.base = base            # centro da guia (onde o modelo fica no Blender)
        self.parts = {}             # (grupo, material) -> bmesh
        self.offset = {}            # grupo -> deslocamento do objeto (roda d'água)

    def _add(self, mat, group, make, matrix):
        k = (group or "", mat)
        bm = self.parts.get(k)
        if bm is None:
            bm = self.parts[k] = bmesh.new()
        verts = make(bm)
        bmesh.ops.transform(bm, matrix=matrix, verts=verts)

    def box(self, mat, cx, cy, z0, w, d, h, group=None):
        M = Matrix.Translation((cx, cy, z0 + h / 2)) @ Matrix.Diagonal((w, d, h, 1.0))
        self._add(mat, group, lambda bm: bmesh.ops.create_cube(bm, size=1.0)["verts"], M)

    def beam(self, mat, cx, cy, cz, length, thick, rz, group=None):
        """Barra quadrada de comprimento `length` (em X antes de girar) centrada em (cx, cy, cz)."""
        M = Matrix.Translation((cx, cy, cz)) @ Matrix.Rotation(rz, 4, "Z") @ Matrix.Diagonal((length, thick, thick, 1.0))
        self._add(mat, group, lambda bm: bmesh.ops.create_cube(bm, size=1.0)["verts"], M)

    def cyl(self, mat, cx, cy, z0, r_bot, r_top, h, seg=8, rz=0.0, axis="z", group=None):
        """Cilindro/cone. axis 'z': base em z0. axis 'x' ou 'y': deitado, centro em z0."""
        cz = z0 + h / 2 if axis == "z" else z0
        turn = {"z": Matrix.Identity(4), "x": Matrix.Rotation(math.pi / 2, 4, "Y"),
                "y": Matrix.Rotation(math.pi / 2, 4, "X")}[axis]
        M = Matrix.Translation((cx, cy, cz)) @ Matrix.Rotation(rz, 4, "Z") @ turn
        self._add(mat, group, lambda bm: bmesh.ops.create_cone(
            bm, cap_ends=True, cap_tris=False, segments=seg, radius1=r_bot, radius2=r_top, depth=h)["verts"], M)

    def cone(self, mat, cx, cy, z0, r, h, seg=8, rz=0.0, group=None):
        self.cyl(mat, cx, cy, z0, r, 0.0, h, seg=seg, rz=rz, group=group)

    def ico(self, mat, cx, cy, zc, r, sy=1.0, sub=1, group=None):
        M = Matrix.Translation((cx, cy, zc)) @ Matrix.Diagonal((1.0, 1.0, sy, 1.0))
        self._add(mat, group, lambda bm: bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=r)["verts"], M)

    def gable(self, mat, cx, cy, z0, w, d, h, rz=0.0, group=None):
        """Telhado de duas águas: triângulos na frente e atrás (eixo Y), cumeeira no sentido de Y."""
        hw, hd = w / 2, d / 2

        def make(bm):
            vs = [bm.verts.new(p) for p in [(-hw, -hd, 0), (hw, -hd, 0), (0, -hd, h),
                                             (-hw, hd, 0), (hw, hd, 0), (0, hd, h)]]
            for f in [(0, 1, 2), (4, 3, 5), (1, 4, 5, 2), (3, 0, 2, 5)]:
                bm.faces.new([vs[i] for i in f])
            return vs

        M = Matrix.Translation((cx, cy, z0)) @ Matrix.Rotation(rz, 4, "Z")
        self._add(mat, group, make, M)

    def finish(self, col):
        for (group, mat), bm in self.parts.items():
            if not bm.faces:
                bm.free()
                continue
            bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
            me = bpy.data.meshes.new(f"{self.key}_{group}_{mat}")
            bm.to_mesh(me)
            bm.free()
            me.materials.append(material(mat))
            ob = bpy.data.objects.new(f"{group}_{mat}" if group else mat, me)
            ob.location = self.base + Vector(self.offset.get(group, (0.0, 0.0, 0.0)))
            col.objects.link(ob)


# ---------- casas (7 degraus da era) ----------

def house0(m):  # cabana primitiva: troncos e teto de palha
    m.cyl("madeira_escura", 0, 0, 0, 0.7, 0.62, 0.55, seg=10)
    m.cone("palha", 0, 0, 0.5, 0.95, 0.85, seg=10)
    m.cone("palha_escura", 0, 0, 1.2, 0.5, 0.25, seg=10)
    m.box("porta", 0, -0.67, 0, 0.28, 0.06, 0.4)
    for a in (0.9, 2.4, 4.4):
        m.cyl("tronco", math.cos(a) * 0.68, math.sin(a) * 0.68, 0, 0.035, 0.035, 0.5, seg=4)


def house1(m):  # tábuas com telhado de palha
    m.box("madeira", 0, 0, 0, 1.4, 1.3, 0.7)
    m.box("madeira_escura", 0, 0, 0, 1.44, 1.34, 0.07)
    m.gable("palha", 0, 0, 0.7, 1.7, 1.5, 0.7)
    m.box("porta", -0.2, -0.67, 0, 0.3, 0.06, 0.46)
    m.box("madeira_escura", 0.35, -0.67, 0.3, 0.26, 0.04, 0.28)
    m.box("vidro", 0.35, -0.7, 0.33, 0.2, 0.03, 0.22)
    m.box("pedra_escura", 0.45, -0.3, 0.8, 0.2, 0.2, 0.55)


def house2(m):  # enxaimel, telhas e chaminé
    m.box("reboco", 0, 0, 0, 1.5, 1.4, 0.8)
    for x in (-0.7, 0, 0.7):
        m.box("madeira_escura", x, -0.71, 0, 0.07, 0.04, 0.8)
    m.box("madeira_escura", 0, 0, 0.72, 1.54, 1.44, 0.07)
    m.gable("tijolo", 0, 0, 0.8, 1.8, 1.6, 0.8)
    m.box("porta", -0.3, -0.74, 0, 0.3, 0.06, 0.5)
    for x in (0.3, 0.58):
        m.box("madeira_escura", x, -0.74, 0.38, 0.26, 0.04, 0.28)
        m.box("vidro", x, -0.77, 0.4, 0.2, 0.03, 0.22)
    m.box("pedra", 0.5, -0.35, 0.9, 0.22, 0.22, 0.7)


def house3(m):  # pedra e reboco, dois andares, ardósia
    m.box("pedra", 0, 0, 0, 1.6, 1.4, 0.5)
    m.box("reboco", 0, 0, 0.5, 1.5, 1.3, 0.75)
    m.box("madeira_escura", 0, 0, 0.5, 1.64, 1.44, 0.06)
    m.gable("ardosia", 0, 0, 1.25, 1.9, 1.6, 0.75)
    m.box("porta", 0, -0.73, 0, 0.3, 0.06, 0.42)
    for x in (-0.5, 0.5):
        for z in (0.18, 0.72):
            m.box("madeira_escura", x, -0.68, z, 0.26, 0.04, 0.28)
            m.box("vidro", x, -0.71, z + 0.02, 0.2, 0.03, 0.24)
    m.box("tijolo", 0.55, -0.35, 1.3, 0.24, 0.24, 0.8)


def house4(m):  # bloco de tijolo de três andares
    m.box("tijolo", 0, 0, 0, 1.6, 1.4, 1.5)
    for z in (0.5, 1.0):
        m.box("tijolo_escuro", 0, 0, z, 1.64, 1.44, 0.05)
    m.box("pedra_escura", 0, 0, 1.5, 1.7, 1.5, 0.08)
    m.box("porta", 0, -0.72, 0, 0.3, 0.06, 0.38)
    for x in (-0.5, 0, 0.5):
        for z in (0.25, 0.7, 1.15):
            if x == 0 and z < 0.3:
                continue
            m.box("vidro", x, -0.72, z, 0.2, 0.03, 0.26)
    for x in (-0.45, 0.4):
        m.cyl("metal", x, 0.3, 1.58, 0.1, 0.12, 0.55, seg=6)


def house5(m):  # torre de vidro com teto verde e painel solar
    m.box("vidro_gelo", 0, 0, 0, 1.5, 1.5, 0.14)
    m.box("vidro_gelo", 0, 0, 0.14, 1.2, 1.2, 1.9)
    for z in (0.35, 0.75, 1.15, 1.55):
        m.box("vidro_azul", 0, 0, z, 1.24, 1.24, 0.22)
        m.box("branco", 0, 0, z + 0.22, 1.26, 1.26, 0.03)
    m.box("verde_teto", 0, 0, 2.04, 1.3, 1.3, 0.1)
    m.box("azul_marinho", -0.25, 0.2, 2.16, 0.5, 0.35, 0.04)
    m.box("azul_marinho", 0.3, -0.2, 2.16, 0.5, 0.35, 0.04)
    m.cyl("pedra", 0.5, 0.4, 2.14, 0.02, 0.02, 0.5, seg=4)
    m.box("petroleo", 0, -0.62, 0.14, 0.3, 0.04, 0.4)


def house6(m):  # condomínio: pódio com jardim e duas torres com passarela
    m.box("pedra_clara", 0, 0, 0, 1.85, 1.75, 0.3)
    m.box("verde", 0, 0, 0.3, 1.75, 1.65, 0.05)
    for x in (-0.5, 0.5):
        m.box("branco", x, -0.2, 0.35, 0.7, 0.7, 1.9)
        for f in range(6):
            m.box("vidro_azul", x, -0.2, 0.5 + f * 0.3, 0.74, 0.74, 0.14)
        m.box("verde_teto", x, -0.2, 2.25, 0.74, 0.74, 0.07)
    m.box("branco", 0, -0.2, 1.45, 0.4, 0.3, 0.14)
    m.box("vidro_azul", 0, -0.92, 0.32, 0.9, 0.04, 0.3)
    m.box("lixo", 0, -0.95, 0.62, 0.5, 0.3, 0.05)
    for x in (-0.8, 0.8):
        m.ico("folha_carvalho", x, -0.7, 0.48, 0.16, sub=1)


HOUSES = [house0, house1, house2, house3, house4, house5, house6]


# ---------- centro da cidade ----------

def townhall_fogueira(m):  # acampamento: anel de pedras, lenha em estrela, chama e duas barracas
    m.cyl("terra_escura", 0, 0, 0, 0.62, 0.62, 0.05, seg=10)
    m.cyl("cinzas", 0, 0, 0.05, 0.36, 0.36, 0.02, seg=10)
    for k in range(9):
        a = k / 9 * math.tau
        m.ico("pedra" if k % 2 else "pedra_escura", math.cos(a) * 0.52, math.sin(a) * 0.52, 0.0, 0.1, sy=0.8)
    for k in range(5):
        a = k / 5 * math.tau + 0.3
        m.beam("madeira" if k % 2 else "madeira_escura", math.cos(a) * 0.2, math.sin(a) * 0.2, 0.1, 0.42, 0.09, a)
    m.cone("fogo", 0, 0, 0.1, 0.19, 0.46, seg=6, rz=0.3)
    m.cone("fogo_claro", 0.03, 0.02, 0.1, 0.11, 0.34, seg=5)
    m.cone("fogo_vivo", -0.08, -0.04, 0.1, 0.1, 0.26, seg=5, rz=1.0)
    m.cyl("tronco", 0, 0.95, 0.09, 0.09, 0.09, 0.55, seg=6, axis="x")
    m.cyl("tronco", -0.95, 0, 0.09, 0.09, 0.09, 0.55, seg=6, axis="y")
    m.gable("pano", -1.15, -0.85, 0, 0.95, 1.05, 0.72, rz=0.7)
    m.gable("pano", 1.1, -0.7, 0, 0.95, 1.05, 0.72, rz=-0.6)


def townhall_prefeitura(m):  # prefeitura com colunas, relógio e bandeira
    m.box("pedra", 0, 0, 0, 2.7, 2.7, 0.25)
    m.box("parede", 0, 0, 0.25, 2.4, 2.3, 1.1)
    m.box("parede_sombra", 0, 0, 1.35, 2.6, 2.5, 0.12)
    m.gable("telhado_prefeitura", 0, 0, 1.47, 2.7, 2.5, 0.85)
    for x in (-0.75, 0.75):
        m.cyl("pedra", x, -1.22, 0.25, 0.1, 0.1, 1.05, seg=8)
    m.box("parede_sombra", 0, -1.22, 1.3, 1.9, 0.3, 0.1)
    m.box("porta", 0, -1.2, 0.25, 0.6, 0.06, 0.8)
    for x in (-1.0, 1.0):
        m.box("vidro", x, -1.2, 0.7, 0.25, 0.04, 0.3)
    m.box("parede", 0, 0.5, 1.47, 0.7, 0.7, 1.0)
    m.cone("telha", 0, 0.5, 2.47, 0.6, 0.6, seg=4, rz=math.pi / 4)
    m.cyl("metal", 0, 0.5, 3.0, 0.02, 0.02, 0.5, seg=4)
    m.box("bandeira", 0.2, 0.5, 3.35, 0.38, 0.03, 0.2)


def townhall_governo(m):  # palácio: escadaria, colunata, frontão, cúpula e bandeiras
    m.box("pedra", 0, 0, 0, 3.0, 2.8, 0.2)
    m.box("cinza_claro", 0, 0, 0.2, 2.8, 2.6, 0.1)
    m.box("branco", 0, -0.1, 0.3, 2.4, 2.0, 1.2)
    m.box("cinza_claro", 0, -0.1, 1.5, 2.6, 2.2, 0.12)
    for k in range(6):
        m.cyl("branco", -1.0 + k * 0.4, -1.1, 0.3, 0.09, 0.09, 1.2, seg=8)
    m.box("cinza_claro", 0, -1.1, 1.5, 2.4, 0.1, 0.4)
    m.gable("branco", 0, -1.1, 1.6, 2.4, 0.45, 0.5)
    m.cyl("branco", 0, -0.1, 1.62, 0.65, 0.6, 0.35, seg=12)
    m.ico("dourado", 0, -0.1, 2.0, 0.55, sy=0.9, sub=2)
    m.cyl("metal", 0, -0.1, 2.45, 0.02, 0.02, 0.5, seg=4)
    m.box("bandeira", 0.2, -0.1, 2.75, 0.4, 0.03, 0.24)
    m.box("porta", 0, -1.02, 0.3, 0.5, 0.05, 0.7)
    for x in (-1.15, 1.15):
        m.cyl("metal", x, -1.0, 0.3, 0.02, 0.02, 0.9, seg=4)
        m.box("azul_marinho", x + 0.16, -1.0, 1.0, 0.3, 0.03, 0.2)


# ---------- mercado: mercado, galeria e shopping ----------

def market0(m):  # banca com toldo listrado
    m.box("bege_mercado", 0, 0, 0, 1.7, 1.7, 0.7)
    m.box("laranja", 0, 0, 0.7, 1.95, 1.95, 0.1)
    for sx in (-0.65, -0.22, 0.22, 0.65):
        m.box("branco", sx, 0, 0.8, 0.2, 1.97, 0.01)
    m.box("laranja", 0, -0.98, 0.55, 1.95, 0.04, 0.18)
    m.box("porta", 0.5, -0.86, 0, 0.4, 0.06, 0.4)
    m.box("madeira", -0.4, -1.05, 0, 0.9, 0.4, 0.22)
    for x, c in ((-0.7, "vermelho"), (-0.45, "amarelo"), (-0.2, "verde")):
        m.ico(c, x, -1.05, 0.34, 0.08, sub=1)
    m.box("madeira", 0.75, 0.9, 0, 0.26, 0.26, 0.26)


def market1(m):  # galeria: cobertura de vidro e arcadas
    m.box("reboco", 0, 0, 0, 1.75, 1.7, 0.85)
    m.box("madeira_clara", 0, 0, 0.85, 1.8, 1.75, 0.07)
    m.gable("vidro_claro", 0, 0, 0.92, 1.5, 1.5, 0.55)
    m.gable("vidro_gelo", 0, 0, 1.02, 0.9, 1.52, 0.3)
    for x in (-0.6, 0, 0.6):
        m.box("azul_marinho", x, -0.87, 0.05, 0.38, 0.05, 0.5)
    m.box("rosa", 0, -0.88, 0.62, 1.1, 0.05, 0.16)
    m.box("bege_mercado", -0.7, -1.0, 0, 0.35, 0.3, 0.22)
    m.box("vermelho", 0.7, -1.0, 0, 0.3, 0.26, 0.16)


def market2(m):  # shopping: andares de vidro, átrio com cúpula e letreiro
    m.box("cinza_chao", 0, 0, 0, 1.9, 1.85, 0.12)
    m.box("branco", 0, -0.1, 0.12, 1.75, 1.5, 1.2)
    for z in (0.4, 0.85):
        m.box("vidro_azul", 0, -0.1, z, 1.79, 1.54, 0.22)
    m.box("cinza_claro", 0, -0.1, 1.32, 1.85, 1.6, 0.08)
    m.ico("vidro_claro", 0, -0.1, 1.42, 0.5, sy=0.55, sub=2)
    m.box("vermelho", 0, -0.85, 0.9, 1.0, 0.08, 0.28)
    m.box("branco", 0, -0.85, 1.0, 0.7, 0.09, 0.08)
    m.box("lixo", 0, -0.95, 0.5, 0.9, 0.4, 0.05)
    m.box("vidro_azul", 0, -0.92, 0.12, 0.6, 0.04, 0.38)
    for x, c in ((-0.7, "vermelho"), (-0.3, "amarelo"), (0.2, "azul_marinho"), (0.7, "verde")):
        m.box(c, x, -1.0, 0.12, 0.12, 0.2, 0.08)


MARKETS = [market0, market1, market2]


# ---------- roda d'água ----------

def _waterwheel(tier):
    def fn(m):
        group = "wheel"
        rim = "roda_metal" if tier >= 1 else "roda_madeira"
        r = 0.45 if tier >= 2 else 0.55
        for dx in (-0.07, 0.07):
            m.cyl(rim, dx, 0, 0, r, r, 0.04, seg=14, axis="x", group=group)
        m.cyl("metal", 0, 0, 0, 0.09, 0.09, 0.2, seg=8, axis="x", group=group)
        blades = 10 if tier >= 2 else 8
        pad = "madeira" if tier == 0 else "pedra_clara" if tier >= 2 else "pedra"
        for k in range(blades):
            a = k / blades * math.tau
            # pá radial: gira em torno de X (eixo da roda) e fica na borda
            M = Matrix.Translation((0, math.sin(a) * (r - 0.1), math.cos(a) * (r - 0.1))) \
                @ Matrix.Rotation(-a, 4, "X") @ Matrix.Diagonal((0.16, 0.1, 0.34, 1.0))
            m._add(pad, group, lambda bm: bmesh.ops.create_cube(bm, size=1.0)["verts"], M)
        m.offset[group] = (0.82, 0.1, r + 0.08)  # o eixo fica aqui: a roda gira em volta dele no jogo
        m.box("pedra_escura", 0.82, 0.1, 0, 0.12, 0.12, r + 0.1)
        m.box("pedra_clara", 0, 0, 0, 1.9, 1.9, 0.06)
        if tier == 0:
            m.box("madeira", -0.35, -0.3, 0.06, 1.1, 1.1, 0.7)
            m.gable("palha", -0.35, -0.3, 0.76, 1.35, 1.3, 0.55)
            m.box("porta", -0.35, -0.86, 0.06, 0.28, 0.06, 0.42)
        elif tier == 1:
            m.box("tijolo", -0.35, -0.3, 0.06, 1.1, 1.1, 0.75)
            m.gable("ardosia", -0.35, -0.3, 0.81, 1.35, 1.3, 0.5)
            m.box("metal", -0.35, -0.86, 0.06, 0.3, 0.06, 0.4)
            m.box("telha", 0.3, -0.55, 0.06, 0.3, 0.3, 0.3)
            m.cyl("madeira_escura", -0.85, 0.6, 0.06, 0.04, 0.04, 1.2, seg=5)
            m.box("madeira_escura", -0.85, 0.6, 1.1, 0.5, 0.05, 0.05)
        elif tier == 2:
            m.box("cinza_claro", -0.35, -0.3, 0.06, 1.2, 1.1, 0.85)
            m.box("metal", -0.35, -0.3, 0.91, 1.26, 1.16, 0.08)
            m.box("vidro_azul", -0.35, -0.86, 0.5, 0.8, 0.04, 0.22)
            m.cyl("pedra_escura", 0.4, -0.6, 0.2, 0.12, 0.12, 1.0, seg=8, axis="y")
            m.box("metal", 0.6, -0.6, 0.06, 0.3, 0.3, 0.45)
            for x in (-0.85, -0.65):
                m.cyl("pedra_clara", x, 0.65, 0.06, 0.03, 0.03, 1.3, seg=4)
            m.box("pedra_clara", -0.75, 0.65, 1.3, 0.5, 0.04, 0.04)
        else:
            m.box("cinza_claro", -0.35, -0.3, 0.06, 1.3, 1.2, 0.95)
            m.box("vidro_azul", -0.35, -0.9, 0.45, 1.1, 0.05, 0.4)
            m.box("azul_marinho", -0.35, -0.3, 1.01, 1.3, 1.2, 0.1)
            m.box("petroleo", -0.35, -0.2, 1.11, 0.9, 0.5, 0.04)
            for x, y in ((-0.85, 0.7), (0.1, 0.8)):
                m.cyl("pedra_clara", x, y, 0.06, 0.025, 0.05, 1.5, seg=4)
                m.box("pedra_clara", x, y, 1.35, 0.6, 0.04, 0.04)
                m.box("amarelo", x + 0.3, y, 1.45, 0.07, 0.07, 0.07)
                m.box("amarelo", x - 0.3, y, 1.45, 0.07, 0.07, 0.07)
            m.box("lixo", 0.6, -0.62, 0.06, 0.35, 0.35, 0.5)
    return fn


# ---------- outros prédios ----------

def well(m):
    m.cyl("pedra", 0, 0, 0, 0.53, 0.5, 0.45, seg=10)
    m.cyl("pedra_escura", 0, 0, 0.4, 0.54, 0.54, 0.06, seg=10)
    m.cyl("agua", 0, 0, 0.42, 0.36, 0.36, 0.04, seg=10, group="water")
    for x in (-0.46, 0.46):
        m.box("madeira_escura", x, 0, 0, 0.07, 0.07, 0.95)
    m.gable("telha", 0, 0, 0.92, 1.25, 0.9, 0.4, rz=math.pi / 2)
    m.cyl("madeira", 0, 0, 0.78, 0.03, 0.03, 0.95, seg=5, axis="x")
    m.cyl("madeira_escura", 0.1, 0, 0.5, 0.07, 0.06, 0.1, seg=6)


def farm(m):
    m.box("terra", 0, 0, 0, 1.9, 1.9, 0.1)
    for r in range(4):
        y = -0.7 + r * 0.46
        m.box("plantacao", 0, y, 0.1, 1.6, 0.18, 0.16, group="rows")
        for c in range(5):
            m.cone("plantacao", -0.62 + c * 0.31, y, 0.2, 0.07, 0.2, seg=4, group="rows")
    for x in (-0.92, 0.92):
        for y in (-0.92, 0.92):
            m.box("madeira_escura", x, y, 0.05, 0.07, 0.07, 0.3)
    m.box("madeira", 0, 0.92, 0.22, 1.84, 0.04, 0.05)
    m.box("madeira", 0, -0.92, 0.22, 1.84, 0.04, 0.05)
    m.cyl("madeira_escura", 0.7, 0.1, 0.1, 0.025, 0.025, 0.55, seg=4)
    m.box("madeira_escura", 0.7, 0.1, 0.5, 0.4, 0.04, 0.04)
    m.ico("palha", 0.7, -0.2, 0.62, 0.09, sub=1)


def sawmill(m):
    m.box("madeira", 0, -0.25, 0, 1.6, 1.2, 0.8)
    m.gable("madeira_escura", 0, -0.25, 0.8, 1.9, 1.45, 0.5)
    m.box("porta", -0.45, -0.86, 0, 0.4, 0.06, 0.55)
    m.cyl("cinza_claro", 0.35, 0.4, 0.55, 0.32, 0.32, 0.04, seg=12, axis="y")
    m.box("madeira_escura", 0.3, 0.5, 0, 0.9, 0.5, 0.35)
    for i in range(3):
        for j in range(i + 1):
            m.cyl("tronco", -0.7 + i * 0.2, 0.85, 0.09 + j * 0.17, 0.09, 0.09, 0.75, seg=6, axis="y")


def quarry(m):
    m.box("cinza_chao", 0, 0, 0, 1.9, 1.9, 0.05)
    m.box("pedra_escura", 0, 0.62, 0.05, 1.8, 0.65, 0.45)
    m.box("pedra", -0.1, 0.66, 0.5, 1.4, 0.5, 0.4)
    m.box("pedra_clara", -0.2, 0.7, 0.9, 0.9, 0.4, 0.35)
    m.ico("pedra_escura", 0.55, 0.5, 0.1, 0.2, sy=0.75)
    m.ico("pedra", -0.65, 0.9, 0.1, 0.16)
    for x, y in ((-0.62, -0.3), (-0.3, -0.3), (-0.46, -0.62)):
        m.box("pedra_clara", x, y, 0.05, 0.3, 0.3, 0.26)
    m.box("pedra", -0.46, -0.3, 0.31, 0.3, 0.3, 0.26)
    for x in (0.55, 0.85):
        m.box("madeira_escura", x, 0.2, 0.05, 0.08, 0.08, 1.0)
    m.box("madeira", 0.7, 0.2, 1.05, 0.55, 0.08, 0.07)
    m.cyl("cinza_claro", 0.62, 0.2, 0.55, 0.012, 0.012, 0.5, seg=3)
    m.box("pedra", 0.62, 0.2, 0.35, 0.22, 0.22, 0.22)
    m.box("madeira_escura", 0.35, -0.7, 0.1, 0.38, 0.26, 0.12)
    m.cyl("lixo", 0.2, -0.7, 0.2, 0.1, 0.1, 0.04, seg=8, axis="x")


def warehouse(m):
    m.box("armazem", 0, 0, 0, 1.7, 1.6, 0.85)
    m.box("madeira_escura", 0, 0, 0, 1.74, 1.64, 0.06)
    m.gable("marrom_telhado", 0, 0, 0.85, 2.0, 1.8, 0.65)
    m.box("porta", 0, -0.81, 0, 0.9, 0.06, 0.65)
    m.box("feno", 0, -0.82, 1.0, 0.4, 0.04, 0.14)
    m.box("madeira", 0.65, -0.98, 0, 0.28, 0.28, 0.28)
    m.box("madeira_escura", -0.62, -0.98, 0, 0.24, 0.24, 0.24)
    m.box("madeira", -0.62, -0.98, 0.24, 0.22, 0.22, 0.22)


def dam(m):
    m.box("pedra", 0, 0, 0, 2, 1, 0.9)
    m.box("pedra_escura", 0, 0, 0.9, 2.05, 1.05, 0.08)
    for x in (-0.6, 0, 0.6):
        m.box("pedra_escura", x, 0, 0, 0.04, 1.02, 0.9)


def bridge(m):
    m.box("ponte", 0, 0, 0.2, 1, 1, 0.1)
    for x in (-0.3, 0, 0.3):
        m.box("tabua", x, 0, 0.3, 0.08, 0.9, 0.02)
    for y in (-0.46, 0.46):
        m.box("corrimao", 0, y, 0.32, 1, 0.06, 0.06)
        m.box("corrimao", 0, y, 0.18, 1, 0.05, 0.05)
        for x in (-0.45, 0.45):
            m.box("madeira_escura", x, y, 0.1, 0.07, 0.07, 0.3)


# ---------- árvores ----------

def tree_pine(m):
    m.cyl("tronco", 0, 0, 0, 0.1, 0.06, 0.45, seg=6)
    m.cone("folha_pinheiro_escuro", 0, 0, 0.3, 0.46, 0.55, seg=7)
    m.cone("folha_pinheiro", 0, 0, 0.62, 0.36, 0.55, seg=7)
    m.cone("folha_pinheiro_escuro", 0, 0, 0.95, 0.26, 0.5, seg=7)
    m.cone("folha_pinheiro", 0, 0, 1.25, 0.15, 0.4, seg=7)


def tree_oak(m):
    m.cyl("tronco", 0, 0, 0, 0.14, 0.09, 0.6, seg=6)
    m.ico("folha_carvalho", 0, 0, 0.88, 0.42, sy=0.85, sub=2)
    m.ico("folha_carvalho", 0.26, 0.1, 0.74, 0.3, sub=2)
    m.ico("folha_carvalho", -0.24, -0.12, 0.8, 0.28, sub=2)
    m.ico("folha_carvalho", 0.02, 0.05, 1.15, 0.24, sub=2)


def tree_birch(m):
    m.cyl("betula", 0, 0, 0, 0.075, 0.05, 0.9, seg=5)
    m.box("betula_faixa", 0, 0, 0.3, 0.11, 0.11, 0.03)
    m.box("betula_faixa", 0, 0, 0.55, 0.1, 0.1, 0.03)
    m.ico("folha_betula", 0, 0, 1.05, 0.3, sy=1.15, sub=2)
    m.ico("folha_betula", 0.15, 0.08, 0.82, 0.2, sub=2)
    m.ico("folha_betula", -0.14, -0.08, 0.92, 0.18, sub=2)


# ---------- lista e montagem ----------

BUILDERS = {
    "house_0": house0, "house_1": house1, "house_2": house2, "house_3": house3,
    "house_4": house4, "house_5": house5, "house_6": house6,
    "townhall_fogueira": townhall_fogueira, "townhall_prefeitura": townhall_prefeitura,
    "townhall_governo": townhall_governo,
    "market_0": market0, "market_1": market1, "market_2": market2,
    "waterwheel_0": _waterwheel(0), "waterwheel_1": _waterwheel(1),
    "waterwheel_2": _waterwheel(2), "waterwheel_3": _waterwheel(3),
    "well": well, "farm": farm, "sawmill": sawmill, "quarry": quarry, "warehouse": warehouse,
    "dam": dam, "bridge": bridge,
    "tree_pine": tree_pine, "tree_oak": tree_oak, "tree_birch": tree_birch,
}


def build_model(key):
    col = bpy.data.collections.get(key)
    if col is None:
        raise RuntimeError(f"coleção '{key}' não existe: rode create_guides antes")
    for o in list(col.objects):
        if not o.name.lower().startswith("guia_"):
            bpy.data.objects.remove(o, do_unlink=True)
    guide = bpy.data.objects.get("guia_" + key)
    base = guide.location.copy() if guide else Vector((0.0, 0.0, 0.0))
    m = Model(key, base)
    BUILDERS[key](m)
    m.finish(col)
    return key


def build_all(scene=None):
    """Monta todos os modelos nas coleções (cria as guias se faltarem). Devolve a lista montada."""
    if scene is None:
        scene = bpy.context.scene
    if bpy.data.objects.get("guia_" + "farm") is None:
        create_guides(scene)
    return [build_model(k) for k in BUILDERS]
