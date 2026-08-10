import { Drawing, DrawingStore, SortStore } from '../index';
import { registerDefaultSorts } from './buildDemo';

export function newSortStore(): SortStore {
    const sortStore = new SortStore();
    registerDefaultSorts(sortStore);
    return sortStore;
}

export function makeDrawing(): Drawing {
    return new Drawing(newSortStore());
}

export function makeStore(): DrawingStore {
    return new DrawingStore();
}

export function makeVertex(drawing: Drawing, label: string): ReturnType<Drawing['newArtefact']> {
    return drawing.newArtefact('Vertex', {}, { position: [0, 0], label }, 'root');
}

export function makeEdge(
    drawing: Drawing,
    label: string,
    source: ReturnType<Drawing['newArtefact']>,
    target: ReturnType<Drawing['newArtefact']>,
    layerId: string = 'root'
): ReturnType<Drawing['newArtefact']> {
    return drawing.newArtefact('Edge', { source, target }, { width: 2, bend: 0, label }, layerId);
}

export interface CompRule {
    rule: Drawing;
    edges: { re1: ReturnType<Drawing['newArtefact']>; re2: ReturnType<Drawing['newArtefact']> };
}

export function buildComposableEdgesRule(): CompRule {
    const drawing = makeDrawing();
    const v0 = makeVertex(drawing, 'rv0');
    const v1 = makeVertex(drawing, 'rv1');
    const v2 = makeVertex(drawing, 'rv2');
    const re1 = makeEdge(drawing, 're1', v0, v1);
    const re2 = makeEdge(drawing, 're2', v1, v2);
    drawing.addLayer('rule-pattern', 'Rule Pattern', 'root');
    makeEdge(drawing, 're3', v0, v2, 'rule-pattern');
    drawing.setIsRule(true);
    return { rule: drawing, edges: { re1, re2 } };
}

export function buildComposableHost(): { host: Drawing; edges: { he1: ReturnType<Drawing['newArtefact']>; he2: ReturnType<Drawing['newArtefact']> } } {
    const host = makeDrawing();
    const v0 = makeVertex(host, 'hv0');
    const v1 = makeVertex(host, 'hv1');
    const v2 = makeVertex(host, 'hv2');
    const he1 = makeEdge(host, 'he1', v0, v1);
    const he2 = makeEdge(host, 'he2', v1, v2);
    return { host, edges: { he1, he2 } };
}

export function buildFlagInChildLayerRule(): Drawing {
    const drawing = makeDrawing();
    const fv0 = makeVertex(drawing, 'fv0');
    const fv1 = makeVertex(drawing, 'fv1');
    const fv2 = makeVertex(drawing, 'fv2');
    makeEdge(drawing, 'fe1', fv0, fv1);
    drawing.addLayer('flag-conclusion', 'Flag Conclusion', 'root');
    drawing.newArtefact('Edge', { source: fv1, target: fv2, mono: { __flag: true, layerId: 'flag-conclusion' } }, { width: 2, bend: 0, label: 'fe2' }, 'root');
    drawing.newArtefact('Edge', { source: fv0, target: fv2 }, { width: 2, bend: 0, label: 'fe3' }, 'flag-conclusion');
    drawing.setIsRule(true);
    return drawing;
}

export function buildFlagInRootRule(): Drawing {
    const drawing = makeDrawing();
    const rfv0 = makeVertex(drawing, 'rfv0');
    const rfv1 = makeVertex(drawing, 'rfv1');
    const rfv2 = makeVertex(drawing, 'rfv2');
    makeEdge(drawing, 'rfe1', rfv0, rfv1);
    drawing.newArtefact('Edge', { source: rfv1, target: rfv2, mono: true }, { width: 2, bend: 0, label: 'rfe2' }, 'root');
    drawing.addLayer('flag-root-conclusion', 'Root Flag Conclusion', 'root');
    makeEdge(drawing, 'rfe3', rfv0, rfv2);
    drawing.setIsRule(true);
    return drawing;
}

export function buildChildEqRule(): Drawing {
    const drawing = makeDrawing();
    const qv0 = makeVertex(drawing, 'qv0');
    const qv1 = makeVertex(drawing, 'qv1');
    const qv2 = makeVertex(drawing, 'qv2');
    const qe1 = makeEdge(drawing, 'qe1', qv0, qv1);
    const qe2 = makeEdge(drawing, 'qe2', qv1, qv2);
    drawing.addLayer('conclusion', 'Conclusion', 'root');
    makeEdge(drawing, 'qe3', qv0, qv2, 'conclusion');
    drawing.newEqualityArtefact([qv0, qv1, qv2], 'conclusion');
    drawing.newEqualityArtefact([qe1, qe2], 'conclusion');
    drawing.setIsRule(true);
    return drawing;
}

export function buildSecondOrderRule(): Drawing {
    const drawing = makeDrawing();
    const sv0 = makeVertex(drawing, 'sv0');
    const sv1 = makeVertex(drawing, 'sv1');
    const sv2 = makeVertex(drawing, 'sv2');
    drawing.addLayer('conclusion2', 'Conclusion', 'root');
    drawing.newArtefact('Edge', { source: sv0, target: sv1, mono: { __flag: true, layerId: 'conclusion2' } }, { width: 2, bend: 0, label: 'sf' }, 'root');
    makeEdge(drawing, 'sg', sv1, sv2);
    drawing.newArtefact('Edge', { source: sv0, target: sv2 }, { width: 2, bend: 0, label: 'sh' }, 'conclusion2');
    drawing.addLayer('premise-a', 'Premise A', 'root');
    const sdv = drawing.newArtefact('Vertex', {}, { position: [150, 150], label: 'sdv' }, 'premise-a');
    drawing.addLayer('premise-b', 'Premise B', 'premise-a');
    drawing.newArtefact('Edge', { source: sdv, target: sv1 }, { width: 2, bend: 0, label: 'sb' }, 'premise-b');
    drawing.setIsRule(true);
    return drawing;
}

export function buildTrianglePairHost(
    host: Drawing,
    mode: 'shared' | 'equal' | 'distinct'
): void {
    const mkVertex = (label: string) => host.newArtefact('Vertex', {}, { position: [0, 0], label }, 'root');
    const mkEdge = (label: string, source: ReturnType<Drawing['newArtefact']>, target: ReturnType<Drawing['newArtefact']>) =>
        host.newArtefact('Edge', { source, target }, { width: 2, bend: 0, label }, 'root');

    const v0 = mkVertex('v0');
    const v1 = mkVertex('v1');
    const v2 = mkVertex('v2');
    const v3 = mkVertex('v3');

    const o = mkEdge('o', v0, v1);
    const o2 = mode === 'shared' ? o : mkEdge('o2', v0, v1);
    const a1 = mkEdge('a1', v1, v2);
    const a2 = mkEdge('a2', v2, v0);
    const b1 = mkEdge('b1', v1, v3);
    const b2 = mkEdge('b2', v3, v0);

    host.newArtefact('Triangle', { '1': a1, '2': a2, o }, {}, 'root');
    host.newArtefact('Triangle', { '1': b1, '2': b2, o: o2 }, {}, 'root');

    if (mode === 'equal') {
        host.newEqualityArtefact([o, o2], 'root');
    }
}

export function buildSharedEdgeTrianglesRule(): Drawing {
    const drawing = makeDrawing();
    buildTrianglePairHost(drawing, 'shared');
    drawing.addLayer('rule-pattern', 'Rule Pattern', 'root');
    drawing.setIsRule(true);
    return drawing;
}
