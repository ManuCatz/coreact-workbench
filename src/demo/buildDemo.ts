import * as d3 from 'd3';
import {
    Drawing,
    DrawingStore,
    SortStore,
    type Artefact
} from '../index';
import defaultSortsCode from '../../public/default_sorts.js?raw';

export interface DemoContext {
    sortStore: SortStore;
    drawing: Drawing;
    drawingStore: DrawingStore;
}

export function registerDefaultSorts(sortStore: SortStore): void {
    new Function('sortStore', 'd3', defaultSortsCode)(sortStore, d3);
}

export function newDemoContext(): DemoContext {
    const sortStore = new SortStore();
    registerDefaultSorts(sortStore);
    return {
        sortStore,
        drawing: new Drawing(sortStore),
        drawingStore: new DrawingStore()
    };
}

export function buildDemo(ctx: DemoContext): DemoContext {
    const { sortStore, drawing, drawingStore } = ctx;
    registerDefaultSorts(sortStore);

    // 2. Set up Layer Tree hierarchy for Demo
    // Root Layer ("root") is automatically initialized by Drawing
    const rootLayer = drawing.getLayer('root')!;
    rootLayer.name = 'Root Layer';
    rootLayer.color = '#3498db';
    rootLayer.colorEnabled = false;

    // Child Layer 1 above Root Layer
    drawing.addLayer('layer-1', 'Child Layer 1', 'root', '#e74c3c', true);

    // Child Layer 2 above Child Layer 1
    drawing.addLayer('layer-2', 'Child Layer 2', 'layer-1', '#2ecc71', true);

    // 3. Instantiate Artefacts
    // Vertices in Root Layer
    const v0 = drawing.newArtefact('Vertex', {}, { position: [200, 300], label: 'v0' }, 'root');
    const v1 = drawing.newArtefact('Vertex', {}, { position: [600, 300], label: 'v1' }, 'root');
    const v2 = drawing.newArtefact('Vertex', {}, { position: [400, 150], label: 'v2' }, 'root');

    // Move edge e0 into the Root Layer (source & target v0, v1 are in Root)
    const e0 = drawing.newArtefact('Edge', { source: v0, target: v1 }, { width: 4, bend: 0, label: 'e0' }, 'root');

    // Edges e1, e2 in Child Layer 1 (referencing Root Layer vertices v0, v1, v2)
    // e1's mono flag leaves from layer-2 (a descendant of e1's layer), so it shows as active when layer-2 is focused
    const e1 = drawing.newArtefact('Edge', { source: v1, target: v2, mono: { __flag: true, layerId: 'layer-2' } }, { width: 2, bend: 30, label: 'e1' }, 'layer-1');
    const e2 = drawing.newArtefact('Edge', { source: v2, target: v0 }, { width: 2, bend: 0, label: 'e2' }, 'layer-1');
    // --- Square Graph for Pullback Demo ---

    // Square vertices in Root Layer
    const sq_v0 = drawing.newArtefact('Vertex', {}, { position: [400, 400], label: 'A' }, 'root');
    const sq_v1 = drawing.newArtefact('Vertex', {}, { position: [600, 400], label: 'B' }, 'root');
    const sq_v2 = drawing.newArtefact('Vertex', {}, { position: [400, 550], label: 'C' }, 'root');
    const sq_v3 = drawing.newArtefact('Vertex', {}, { position: [600, 550], label: 'D' }, 'root');

    // Projections p1, p2, q1, q2 in Child Layer 1
    const p1 = drawing.newArtefact('Edge', { source: sq_v0, target: sq_v1 }, { width: 2, bend: 0, label: 'p1' }, 'layer-1');
    const p2 = drawing.newArtefact('Edge', { source: sq_v0, target: sq_v2 }, { width: 2, bend: 0, label: 'p2' }, 'layer-1');
    const q1 = drawing.newArtefact('Edge', { source: sq_v1, target: sq_v3 }, { width: 2, bend: 0, label: 'q1' }, 'layer-1');
    const q2 = drawing.newArtefact('Edge', { source: sq_v2, target: sq_v3 }, { width: 2, bend: 0, label: 'q2' }, 'layer-1');

    // The Pullback artefact itself in Child Layer 2 (referencing Layer 1 edges)
    drawing.newArtefact('Pullback', { p1, p2, q1, q2 }, {}, 'layer-2');

    // The Triangle artefact (a 2-cell) in Child Layer 2 (referencing edges e1, e2, e0)
    drawing.newArtefact('Triangle', { '1': e1, '2': e2, o: e0 }, {}, 'layer-2');

    // Two composable root-layer edges (with their own vertices) so the 'ComposableEdges' rule applies
    const cd0 = drawing.newArtefact('Vertex', {}, { position: [450, 650], label: 'cd0' }, 'root');
    const cd1 = drawing.newArtefact('Vertex', {}, { position: [550, 650], label: 'cd1' }, 'root');
    const cd2 = drawing.newArtefact('Vertex', {}, { position: [650, 650], label: 'cd2' }, 'root');
    drawing.newArtefact('Edge', { source: cd0, target: cd1 }, { width: 2, bend: 0, label: 'r1' }, 'root');
    drawing.newArtefact('Edge', { source: cd1, target: cd2 }, { width: 2, bend: 0, label: 'r2' }, 'root');

    // 4. Create Equality artefacts (demonstrates same-layer automatic merging)
    drawing.newEqualityArtefact([v0, v1], 'root');
    drawing.newEqualityArtefact([v1, v2], 'root');
    drawing.newEqualityArtefact([v2, sq_v0], 'layer-1');

    // Drawing Store & Rule Validation
    drawingStore.saveDrawing('Initial Drawing', drawing);

    // Add a leaf child layer to root to satisfy the rule condition
    drawing.addLayer('leaf-layer', 'Leaf Layer', 'root', '#f39c12', true);

    // Save drawing as a regular (non-rule) drawing, then load it back into the canvas
    drawingStore.saveDrawing('Rule Drawing Demo', drawing);
    drawingStore.loadDrawing('Rule Drawing Demo', drawing);

    // Build a small rule: two composable edges in the root layer
    const ruleDrawing = new Drawing(sortStore);
    const rv0 = ruleDrawing.newArtefact('Vertex', {}, { position: [0, 0], label: 'rv0' }, 'root');
    const rv1 = ruleDrawing.newArtefact('Vertex', {}, { position: [100, 0], label: 'rv1' }, 'root');
    const rv2 = ruleDrawing.newArtefact('Vertex', {}, { position: [200, 0], label: 'rv2' }, 'root');
    ruleDrawing.newArtefact('Edge', { source: rv0, target: rv1 }, { width: 2, bend: 0, label: 're1' }, 'root');
    ruleDrawing.newArtefact('Edge', { source: rv1, target: rv2 }, { width: 2, bend: 0, label: 're2' }, 'root');
    ruleDrawing.addLayer('rule-pattern', 'Rule Pattern', 'root');
    ruleDrawing.newArtefact('Edge', { source: rv0, target: rv2 }, { width: 2, bend: 0, label: 're3' }, 'rule-pattern');
    ruleDrawing.setIsRule(true);
    drawingStore.saveDrawing('ComposableEdges', ruleDrawing);

    // Rule flag leaving from a child layer: matching must NOT require the flag in the host
    const ruleFlagInChildLayer = new Drawing(sortStore);
    const fv0 = ruleFlagInChildLayer.newArtefact('Vertex', {}, { position: [0, 0], label: 'fv0' }, 'root');
    const fv1 = ruleFlagInChildLayer.newArtefact('Vertex', {}, { position: [100, 0], label: 'fv1' }, 'root');
    const fv2 = ruleFlagInChildLayer.newArtefact('Vertex', {}, { position: [200, 0], label: 'fv2' }, 'root');
    ruleFlagInChildLayer.newArtefact('Edge', { source: fv0, target: fv1 }, { width: 2, bend: 0, label: 'fe1' }, 'root');
    ruleFlagInChildLayer.addLayer('flag-conclusion', 'Flag Conclusion', 'root');
    ruleFlagInChildLayer.newArtefact('Edge', { source: fv1, target: fv2, mono: { __flag: true, layerId: 'flag-conclusion' } }, { width: 2, bend: 0, label: 'fe2' }, 'root');
    ruleFlagInChildLayer.newArtefact('Edge', { source: fv0, target: fv2 }, { width: 2, bend: 0, label: 'fe3' }, 'flag-conclusion');
    ruleFlagInChildLayer.setIsRule(true);
    drawingStore.saveDrawing('FlagInChildLayer', ruleFlagInChildLayer);

    // Control: rule flag leaving from the root layer IS required for matching
    const ruleFlagInRoot = new Drawing(sortStore);
    const rfv0 = ruleFlagInRoot.newArtefact('Vertex', {}, { position: [0, 0], label: 'rfv0' }, 'root');
    const rfv1 = ruleFlagInRoot.newArtefact('Vertex', {}, { position: [100, 0], label: 'rfv1' }, 'root');
    const rfv2 = ruleFlagInRoot.newArtefact('Vertex', {}, { position: [200, 0], label: 'rfv2' }, 'root');
    ruleFlagInRoot.newArtefact('Edge', { source: rfv0, target: rfv1 }, { width: 2, bend: 0, label: 'rfe1' }, 'root');
    ruleFlagInRoot.newArtefact('Edge', { source: rfv1, target: rfv2, mono: true }, { width: 2, bend: 0, label: 'rfe2' }, 'root');
    ruleFlagInRoot.addLayer('flag-root-conclusion', 'Root Flag Conclusion', 'root');
    ruleFlagInRoot.newArtefact('Edge', { source: rfv0, target: rfv2 }, { width: 2, bend: 0, label: 'rfe3' }, 'flag-root-conclusion');
    ruleFlagInRoot.setIsRule(true);
    drawingStore.saveDrawing('FlagInRoot', ruleFlagInRoot);

    // Rule whose child layer contains an equality: matching must ignore it
    const ruleWithChildEq = new Drawing(sortStore);
    const cev0 = ruleWithChildEq.newArtefact('Vertex', {}, { position: [0, 0], label: 'cev0' }, 'root');
    const cev1 = ruleWithChildEq.newArtefact('Vertex', {}, { position: [100, 0], label: 'cev1' }, 'root');
    const cev2 = ruleWithChildEq.newArtefact('Vertex', {}, { position: [200, 0], label: 'cev2' }, 'root');
    ruleWithChildEq.newArtefact('Edge', { source: cev0, target: cev1 }, { width: 2, bend: 0, label: 'ce1' }, 'root');
    ruleWithChildEq.newArtefact('Edge', { source: cev1, target: cev2 }, { width: 2, bend: 0, label: 'ce2' }, 'root');
    ruleWithChildEq.addLayer('rule-pattern-eq', 'Rule Pattern', 'root');
    ruleWithChildEq.newArtefact('Edge', { source: cev0, target: cev2 }, { width: 2, bend: 0, label: 'ce3' }, 'rule-pattern-eq');
    ruleWithChildEq.newEqualityArtefact([cev0, cev1], 'rule-pattern-eq');
    ruleWithChildEq.setIsRule(true);
    drawingStore.saveDrawing('ComposableEdgesChildEq', ruleWithChildEq);

    // Rule whose child-layer equality is not provably equal in the host: still applyable, equality is added
    const ruleChildEqApply = new Drawing(sortStore);
    const qv0 = ruleChildEqApply.newArtefact('Vertex', {}, { position: [0, 0], label: 'qv0' }, 'root');
    const qv1 = ruleChildEqApply.newArtefact('Vertex', {}, { position: [100, 0], label: 'qv1' }, 'root');
    const qv2 = ruleChildEqApply.newArtefact('Vertex', {}, { position: [200, 0], label: 'qv2' }, 'root');
    const qe1 = ruleChildEqApply.newArtefact('Edge', { source: qv0, target: qv1 }, { width: 2, bend: 0, label: 'qe1' }, 'root');
    const qe2 = ruleChildEqApply.newArtefact('Edge', { source: qv1, target: qv2 }, { width: 2, bend: 0, label: 'qe2' }, 'root');
    ruleChildEqApply.addLayer('conclusion', 'Conclusion', 'root');
    ruleChildEqApply.newArtefact('Edge', { source: qv0, target: qv2 }, { width: 2, bend: 0, label: 'qe3' }, 'conclusion');
    ruleChildEqApply.newEqualityArtefact([qv0, qv1, qv2], 'conclusion');
    ruleChildEqApply.newEqualityArtefact([qe1, qe2], 'conclusion');
    ruleChildEqApply.setIsRule(true);
    drawingStore.saveDrawing('ChildEqApply', ruleChildEqApply);

    // Build a second-order rule: the root layer holds two composable edges, the
    // conclusion layer (leaf child of root) holds the composed edge, and a premise
    // layer A (with its own child layer B) is ignored during first-order application.
    const secondOrderRule = new Drawing(sortStore);
    const sv0 = secondOrderRule.newArtefact('Vertex', {}, { position: [0, 0], label: 'sv0' }, 'root');
    const sv1 = secondOrderRule.newArtefact('Vertex', {}, { position: [100, 0], label: 'sv1' }, 'root');
    const sv2 = secondOrderRule.newArtefact('Vertex', {}, { position: [200, 0], label: 'sv2' }, 'root');

    // Conclusion layer (leaf child of root), created before sf so its flag layer exists
    secondOrderRule.addLayer('conclusion2', 'Conclusion', 'root');
    secondOrderRule.newArtefact('Edge', { source: sv0, target: sv1, mono: { __flag: true, layerId: 'conclusion2' } }, { width: 2, bend: 0, label: 'sf' }, 'root');
    secondOrderRule.newArtefact('Edge', { source: sv1, target: sv2 }, { width: 2, bend: 0, label: 'sg' }, 'root');
    secondOrderRule.newArtefact('Edge', { source: sv0, target: sv2 }, { width: 2, bend: 0, label: 'sh' }, 'conclusion2');

    // Premise layer A (child of root) with child layer B
    secondOrderRule.addLayer('premise-a', 'Premise A', 'root');
    const sdv = secondOrderRule.newArtefact('Vertex', {}, { position: [150, 150], label: 'sdv' }, 'premise-a');
    secondOrderRule.addLayer('premise-b', 'Premise B', 'premise-a');
    secondOrderRule.newArtefact('Edge', { source: sdv, target: sv1 }, { width: 2, bend: 0, label: 'sb' }, 'premise-b');

    secondOrderRule.setIsRule(true);
    drawingStore.saveDrawing('SecondOrderComp', secondOrderRule);

    // Rule matching up to host equalities: two triangles sharing one edge may match
    // host triangles whose edges are distinct but provably equal
    function buildTrianglePairHost(
        host: Drawing,
        mode: 'shared' | 'equal' | 'distinct'
    ): void {
        const mkVertex = (label: string) => host.newArtefact('Vertex', {}, { position: [0, 0], label }, 'root');
        const mkEdge = (label: string, source: Artefact, target: Artefact) =>
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

    // Rule: two triangles in the root layer sharing the same edge 'pe_o'
    const eqMatchRule = new Drawing(sortStore);
    buildTrianglePairHost(eqMatchRule, 'shared');
    eqMatchRule.addLayer('rule-pattern', 'Rule Pattern', 'root');
    eqMatchRule.setIsRule(true);
    drawingStore.saveDrawing('SharedEdgeTriangles', eqMatchRule);

    return ctx;
}
