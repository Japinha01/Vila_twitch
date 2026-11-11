"""
Vila do Chat: exporta os modelos do Blender para o jogo (.glb).

Como usar (Blender 3.6 ou mais novo):
  1. Aba "Scripting" > Abrir > este arquivo > botão ▶ (Executar script).
  2. Na vista 3D aperte N: aparece a aba "Vila do Chat".
  3. "Criar guias" monta uma coleção por modelo, com um quadro do tamanho que o prédio ocupa no jogo.
  4. Modele dentro da coleção, em cima do quadro. A seta da guia mostra a frente do prédio.
  5. Escolha a pasta `public/models` do jogo e clique em "Exportar .glb".

Regras (o resumo completo está em public/models/README.md):
  - O NOME DA COLEÇÃO é o nome do arquivo: `house_0`, `farm`, `tree_pine`...
  - 1 unidade do Blender = 1 quadradinho (tile) do mapa. Chão em Z = 0.
  - Objetos com nome começando por `guia_` nunca são exportados.
  - Coleção sem malha é pulada (o jogo continua com o modelo antigo naquele prédio).

Sem abrir a janela:
  blender -b vila.blend --python tools/blender/vila_export.py -- --out public/models
"""

bl_info = {
    "name": "Vila do Chat: exportar modelos",
    "author": "Vila do Chat",
    "version": (1, 0, 0),
    "blender": (3, 6, 0),
    "location": "Vista 3D > N > Vila do Chat",
    "description": "Exporta cada coleção com nome de modelo do jogo para um .glb e escreve o manifest.json",
    "category": "Import-Export",
}

import json
import os
import sys

import bpy
from mathutils import Matrix

GUIDE_PREFIX = "guia_"

# nome do modelo -> (largura em X, profundidade em Y) em tiles. Mantenha igual a src/render/glb.ts.
FOOTPRINTS = {}
for _name in ("fogueira", "prefeitura", "governo"):
    FOOTPRINTS["townhall_" + _name] = (3, 3)
for _i in range(7):
    FOOTPRINTS["house_%d" % _i] = (2, 2)
for _i in range(3):
    FOOTPRINTS["market_%d" % _i] = (2, 2)
for _i in range(4):
    FOOTPRINTS["waterwheel_%d" % _i] = (2, 2)
for _name in ("farm", "well", "sawmill", "quarry", "warehouse"):
    FOOTPRINTS[_name] = (2, 2)
FOOTPRINTS["dam"] = (2, 1)
FOOTPRINTS["bridge"] = (1, 1)
for _name in ("tree_pine", "tree_oak", "tree_birch"):
    FOOTPRINTS[_name] = (1, 1)

# nomes genéricos: valem para todas as etapas que não tiverem arquivo próprio
GENERIC = {"townhall": (3, 3), "house": (2, 2), "market": (2, 2), "waterwheel": (2, 2)}
VALID = dict(FOOTPRINTS, **GENERIC)

# altura de referência (só para a guia): prédio comum ~1,5; árvore ~1,5
SPACING = 5.0
PER_ROW = 7


def _is_guide(obj):
    return obj.name.lower().startswith(GUIDE_PREFIX)


def model_collections(scene):
    """Coleções da cena (em qualquer nível) cujo nome é um modelo do jogo."""
    out = []

    def walk(col):
        for child in col.children:
            if child.name.lower() in VALID:
                out.append(child)
            walk(child)

    walk(scene.collection)
    return out


def create_guides(scene):
    """Uma coleção por modelo, lado a lado, cada uma com o quadro da área e uma seta para a frente."""
    made = 0
    for i, (key, (w, d)) in enumerate(FOOTPRINTS.items()):
        col = bpy.data.collections.get(key)
        if col is None:
            col = bpy.data.collections.new(key)
        if col.name not in {c.name for c in scene.collection.children_recursive}:
            scene.collection.children.link(col)
        if any(_is_guide(o) for o in col.objects):
            continue
        x, y = (i % PER_ROW) * SPACING, -(i // PER_ROW) * SPACING

        hw, hd = w / 2.0, d / 2.0
        mesh = bpy.data.meshes.new(GUIDE_PREFIX + key)
        mesh.from_pydata([(-hw, -hd, 0), (hw, -hd, 0), (hw, hd, 0), (-hw, hd, 0)], [(0, 1), (1, 2), (2, 3), (3, 0)], [])
        frame = bpy.data.objects.new(GUIDE_PREFIX + key, mesh)
        frame.location = (x, y, 0)
        frame.hide_render = True
        frame.hide_select = True
        col.objects.link(frame)

        arrow = bpy.data.objects.new(GUIDE_PREFIX + "frente_" + key, None)
        arrow.empty_display_type = "SINGLE_ARROW"
        arrow.empty_display_size = 0.8
        arrow.rotation_euler = (1.5708, 0, 0)  # aponta para -Y: a frente do prédio
        arrow.location = (x, y - hd, 0.02)
        arrow.hide_select = True
        col.objects.link(arrow)

        label = bpy.data.curves.new(GUIDE_PREFIX + "nome_" + key, "FONT")
        label.body = key
        label.size = 0.35
        label.align_x = "CENTER"
        text = bpy.data.objects.new(GUIDE_PREFIX + "nome_" + key, label)
        text.location = (x, y - hd - 1.3, 0)
        text.hide_render = True
        text.hide_select = True
        col.objects.link(text)
        made += 1
    return made


def _origin(col):
    """O centro do quadro da guia vira o (0, 0, 0) do modelo. Sem guia, vale a origem do mundo."""
    for obj in col.all_objects:
        if obj.name.lower() == GUIDE_PREFIX + col.name.lower() or (obj.type == "MESH" and _is_guide(obj)):
            return obj.matrix_world.translation.copy()
    return None


def _export_glb(path):
    kwargs = dict(filepath=path, export_format="GLB", use_selection=True, export_apply=True,
                  export_yup=True, export_animations=False)
    try:
        bpy.ops.export_scene.gltf(**kwargs)
    except TypeError:  # versão do Blender sem alguma dessas opções: fica só o essencial
        bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True)


def export_models(scene, out_dir, view_layer=None):
    """Exporta cada coleção de modelo para <out_dir>/<nome>.glb e reescreve o manifest.json. Devolve (feitos, pulados)."""
    view_layer = view_layer or bpy.context.view_layer
    os.makedirs(out_dir, exist_ok=True)
    done, skipped = [], []
    if bpy.context.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    previous = [o for o in view_layer.objects if o.select_get()]
    active = view_layer.objects.active

    for col in model_collections(scene):
        key = col.name.lower()
        objs = [o for o in col.all_objects if not _is_guide(o)]
        if not any(o.type == "MESH" for o in objs):
            skipped.append(key)
            continue
        for o in view_layer.objects:
            o.select_set(False)
        hidden = []
        for o in objs:
            if o.name not in view_layer.objects:
                continue  # coleção desligada na camada de visão
            if o.hide_get():
                o.hide_set(False)
                hidden.append(o)
            if o.hide_select:
                o.hide_select = False
                hidden.append((o, "select"))
            o.select_set(True)
        chosen = [o for o in objs if o.name in view_layer.objects and o.select_get()]
        if not chosen:
            skipped.append(key)
            continue

        # leva o modelo para a origem do mundo só durante a exportação
        origin = _origin(col)
        roots = [o for o in chosen if o.parent is None or o.parent not in chosen]
        saved = [(o, o.matrix_world.copy()) for o in roots]
        if origin is not None:
            shift = Matrix.Translation(-origin)
            for o, m in saved:
                o.matrix_world = shift @ m
            view_layer.update()
        try:
            _export_glb(os.path.join(out_dir, key + ".glb"))
            done.append(key)
        finally:
            for o, m in saved:
                o.matrix_world = m
            for item in hidden:
                if isinstance(item, tuple):
                    item[0].hide_select = True
                else:
                    item.hide_set(True)
            view_layer.update()

    for o in view_layer.objects:
        o.select_set(False)
    for o in previous:
        o.select_set(True)
    view_layer.objects.active = active

    write_manifest(out_dir)
    return done, skipped


def write_manifest(out_dir):
    """Lista todos os .glb válidos da pasta (inclusive os exportados antes)."""
    files = sorted(f for f in os.listdir(out_dir) if f.lower().endswith(".glb") and f[:-4].lower() in VALID)
    with open(os.path.join(out_dir, "manifest.json"), "w", encoding="utf-8") as fh:
        json.dump({"models": files}, fh, indent=2)
        fh.write("\n")
    return files


# ---------- interface ----------

class VILA_OT_guides(bpy.types.Operator):
    bl_idname = "vila.create_guides"
    bl_label = "Criar guias"
    bl_description = "Cria uma coleção por modelo do jogo, com o quadro do tamanho certo"
    bl_options = {"REGISTER", "UNDO"}

    def execute(self, context):
        n = create_guides(context.scene)
        self.report({"INFO"}, "%d guias criadas" % n)
        return {"FINISHED"}


class VILA_OT_export(bpy.types.Operator):
    bl_idname = "vila.export_models"
    bl_label = "Exportar .glb"
    bl_description = "Exporta cada coleção com nome de modelo e atualiza o manifest.json"

    def execute(self, context):
        out = bpy.path.abspath(context.scene.vila_out_dir)
        if not out:
            self.report({"ERROR"}, "Escolha a pasta public/models do jogo")
            return {"CANCELLED"}
        done, skipped = export_models(context.scene, out, context.view_layer)
        if not done:
            self.report({"WARNING"}, "Nada exportado: nenhuma coleção de modelo tem malha")
            return {"CANCELLED"}
        self.report({"INFO"}, "%d modelos exportados para %s (%d coleções vazias puladas)" % (len(done), out, len(skipped)))
        return {"FINISHED"}


class VILA_PT_panel(bpy.types.Panel):
    bl_label = "Vila do Chat"
    bl_idname = "VILA_PT_panel"
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = "Vila do Chat"

    def draw(self, context):
        layout = self.layout
        layout.operator("vila.create_guides", icon="MESH_GRID")
        layout.prop(context.scene, "vila_out_dir", text="Pasta")
        layout.operator("vila.export_models", icon="EXPORT")
        ready = [c.name for c in model_collections(context.scene) if any(o.type == "MESH" and not _is_guide(o) for o in c.all_objects)]
        layout.label(text="Prontos para exportar: %d" % len(ready))


CLASSES = (VILA_OT_guides, VILA_OT_export, VILA_PT_panel)


def register():
    for cls in CLASSES:
        bpy.utils.register_class(cls)
    bpy.types.Scene.vila_out_dir = bpy.props.StringProperty(
        name="Pasta dos modelos", description="A pasta public/models do jogo", subtype="DIR_PATH", default="//models/")


def unregister():
    for cls in reversed(CLASSES):
        bpy.utils.unregister_class(cls)
    del bpy.types.Scene.vila_out_dir


def _cli():
    args = sys.argv[sys.argv.index("--") + 1:]
    out = args[args.index("--out") + 1] if "--out" in args else "public/models"
    done, skipped = export_models(bpy.context.scene, os.path.abspath(out))
    print("Vila do Chat: %d modelos exportados para %s: %s" % (len(done), out, ", ".join(done) or "-"))


if __name__ == "__main__":
    try:
        unregister()  # rodar o script de novo no editor de texto
    except Exception:
        pass
    register()
    if "--" in sys.argv and bpy.app.background:
        _cli()
