# le um .dae do SketchUp (triangulos, nos com matriz, instancias) e grava superficies por material, em metros
import sys, json, re, numpy as np, xml.etree.ElementTree as ET
src, out = sys.argv[1], sys.argv[2]
t = ET.parse(src); r = t.getroot(); ns = {'c': r.tag.split('}')[0][1:]}
unit = float(r.find('c:asset/c:unit', ns).get('meter'))
matname = {m.get('id'): m.get('name') for m in r.findall('c:library_materials/c:material', ns)}
geos = {}
for g in r.findall('c:library_geometries/c:geometry', ns):
    mesh = g.find('c:mesh', ns); srcs = {}
    for s in mesh.findall('c:source', ns):
        fa = s.find('c:float_array', ns)
        if fa is not None and fa.text: srcs[s.get('id')] = np.array(fa.text.split(), float).reshape(-1, 3) if int(s.find('c:technique_common/c:accessor', ns).get('stride')) == 3 else None
    verts = {}
    for v in mesh.findall('c:vertices', ns):
        for i in v.findall('c:input', ns):
            if i.get('semantic') == 'POSITION': verts[v.get('id')] = srcs[i.get('source')[1:]]
    prims = []
    for tr in mesh.findall('c:triangles', ns):
        ins = tr.findall('c:input', ns); stride = max(int(i.get('offset')) for i in ins) + 1
        vo = [int(i.get('offset')) for i in ins if i.get('semantic') == 'VERTEX'][0]
        vs = [i.get('source')[1:] for i in ins if i.get('semantic') == 'VERTEX'][0]
        p = np.array(tr.find('c:p', ns).text.split(), int).reshape(-1, stride)[:, vo]
        prims.append((tr.get('material'), verts[vs][p].reshape(-1, 3, 3)))
    if mesh.findall('c:polylist', ns) or mesh.findall('c:polygons', ns): print('AVISO polylist nao tratado', g.get('id'))
    geos[g.get('id')] = prims
nodeslib = {n.get('id'): n for n in r.findall('c:library_nodes/c:node', ns)}
acc = {}
def walk(n, M):
    m = n.find('c:matrix', ns)
    if m is not None: M = M @ np.array(m.text.split(), float).reshape(4, 4)
    for ig in n.findall('c:instance_geometry', ns):
        bind = {im.get('symbol'): matname.get(im.get('target')[1:], im.get('target')) for im in ig.findall('.//c:instance_material', ns)}
        for sym, tri in geos[ig.get('url')[1:]]:
            P = (np.c_[tri.reshape(-1, 3), np.ones(tri.shape[0] * 3)] @ M.T)[:, :3] * unit
            acc.setdefault(bind.get(sym, sym or 'sem material'), []).append(P.reshape(-1, 9))
    for inn in n.findall('c:instance_node', ns): walk(nodeslib[inn.get('url')[1:]], M)
    for c in n.findall('c:node', ns): walk(c, M)
for vs in r.findall('c:library_visual_scenes/c:visual_scene', ns):
    for n in vs.findall('c:node', ns): walk(n, np.eye(4))
res = []
for name, parts in acc.items():
    P = np.vstack(parts); a = P.reshape(-1, 3, 3)
    area = 0.5 * np.linalg.norm(np.cross(a[:, 1] - a[:, 0], a[:, 2] - a[:, 0]), axis=1).sum()
    print(f'{name:28s} tris {len(P):5d} area {area:8.2f} m2')
    res.append({'nome': name, 'pos': [round(float(x), 5) for x in P.ravel()]})
allp = np.vstack([np.array(s['pos']).reshape(-1, 3) for s in res]); print('caixa', allp.min(0).round(3), allp.max(0).round(3))
json.dump(res, open(out, 'w'))
