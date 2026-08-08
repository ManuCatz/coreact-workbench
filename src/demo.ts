import * as d3 from 'd3';
import { Drawing, EqualityArtefact, findRuleApplications, findFirstOrderRuleApplications, findSecondOrderRuleApplications, applyFirstOrderRule, applySecondOrderRule, type Artefact } from './index';
import defaultSortsCode from '../public/default_sorts.js?raw';
import { sortStore, drawing, drawingStore, refresh } from './ui/store';
(globalThis as any).sortStore = sortStore;
new Function('sortStore', 'd3', defaultSortsCode)(sortStore, d3);

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

console.log('Creating valid artefacts with multi-layer support...');

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
console.log('Created demo edges e0, e1, e2:', e0.data.label, e1.data.label, e2.data.label);

// --- Square Graph for Pullback Demo ---
console.log('Creating square graph artefacts across layers...');

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

// 4. Demonstrate Consistency Checks (Expected Errors)
console.log('---');
console.log('Testing consistency checks (You should see caught errors below):');

try {
    drawing.newArtefact('Vertex', {}, { position: '200, 300', label: 'InvalidPos' });
} catch (e) {
    console.error('Caught expected error for invalid position:', (e as Error).message);
}

try {
    drawing.newArtefact('Edge', { source: v0, target: v1 }, { width: 4, bend: 0 });
} catch (e) {
    console.error('Caught expected error for missing dependency:', (e as Error).message);
}

try {
    drawing.newArtefact('Edge', { source: v0 }, { width: 4, bend: 0 });
} catch (e) {
    console.error('Caught expected error for wrong dependency type:', (e as Error).message);
}

try {
    drawing.newArtefact('Edge', { source: v0, target: v1, unexpectedFlag: true }, { width: 4, bend: 0 });
} catch (e) {
    console.error('Caught expected error for unexpected dependency/flag:', (e as Error).message);
}

try {
    drawing.newArtefact('Edge', { source: v0, target: v1, mono: 'yes' as any }, { width: 4, bend: 0 });
} catch (e) {
    console.error('Caught expected error for bad flag type:', (e as Error).message);
}

try {
    drawing.newArtefact('Edge', { source: v0, target: v1, mono: { __flag: true, layerId: 'root' } }, { width: 4, bend: 0 });
} catch (e) {
    console.error('Caught expected error for flag leaving from non-descendant layer:', (e as Error).message);
}

try {
    drawing.newArtefact('Edge', { source: v0, target: v1, mono: { __flag: true, layerId: 'does-not-exist' } }, { width: 4, bend: 0 });
} catch (e) {
    console.error('Caught expected error for flag leaving from nonexistent layer:', (e as Error).message);
}

// Hierarchy Check: Try creating an edge in "root" layer whose target vertex is in "layer-1"
let v_layer1: Artefact | undefined;
try {
    v_layer1 = drawing.newArtefact('Vertex', {}, { position: [100, 100], label: 'v_top' }, 'layer-1');
    drawing.newArtefact('Edge', { source: v0, target: v_layer1 }, { width: 2, bend: 0, label: 'invalid_edge' }, 'root');
} catch (e) {
    console.error('Caught expected error for invalid layer hierarchy dependency:', (e as Error).message);
    if (v_layer1) {
        drawing.removeArtefact(v_layer1);
    }
}

// --- Provability & Flag Guard Tests ---
console.log('--- Provability Tests ---');

{
    const provDrawing = new Drawing(sortStore);
    provDrawing.addLayer('prov-child', 'Prov Child', 'root');
    const pv0 = provDrawing.newArtefact('Vertex', {}, { position: [700, 300], label: 'pv0' }, 'root');
    const pv1 = provDrawing.newArtefact('Vertex', {}, { position: [900, 300], label: 'pv1' }, 'root');
    const pre = provDrawing.newArtefact('Edge', { source: pv0, target: pv1 }, { width: 2, bend: 0, label: 'pre' }, 'root');
    const pce = provDrawing.newArtefact('Edge', { source: pv0, target: pv1 }, { width: 2, bend: 0, label: 'pce' }, 'prov-child');

    provDrawing.addEqualityArtefactUnchecked([pre, pce], 'root');

    const provNoFlag = provDrawing.checkLayerProvable('prov-child');
    console.log("checkLayerProvable('prov-child') without flag (expected provable: true):", JSON.stringify(provNoFlag));

    pre.dependencies['mono'] = true;
    pre.flagLayers['mono'] = 'prov-child';

    const provWithFlag = provDrawing.checkLayerProvable('prov-child');
    console.log("checkLayerProvable('prov-child') with flag on root edge leaving from child layer (expected provable: false):", JSON.stringify(provWithFlag));
}

// --- Equality Artefact Tests ---
console.log('--- Equality Artefact Tests ---');

// 1. Create Equality between Vertices v0 and v1 in root layer (unnamed, uses default label 'v0 = v1')
const eqv0v1 = drawing.newEqualityArtefact([v0, v1], 'root');
console.log('Created equality artefact between v0 and v1 in root layer:', eqv0v1.children.length, 'children');

// 2. Automatic merging on same layer: add v2 to equality in root layer
const eqv1v2 = drawing.newEqualityArtefact([v1, v2], 'root');
console.log('Merged equality artefact in root layer now has children count:', eqv0v1.children.length, 'eqv1v2:', eqv1v2.children.length);

// 3. Different layer: create equality artefact between v2 and sq_v0 in layer-1 (NOT merged with root equality)
const eqv2sq = drawing.newEqualityArtefact([v2, sq_v0], 'layer-1');
console.log('Equality artefact on layer-1 created separately. Root eq children:', eqv0v1.children.length, 'layer-1 eq children:', eqv2sq.children.length);

// 4. Test expected errors for Equality artefacts:
// Error: Degenerate equality (< 2 elements)
try {
    drawing.newEqualityArtefact([v0], 'root');
} catch (e) {
    console.error('Caught expected error for degenerate equality:', (e as Error).message);
}

// Error: Different sorts
try {
    drawing.newEqualityArtefact([v0, p1 as any], 'root');
} catch (e) {
    console.error('Caught expected error for different sorts in equality:', (e as Error).message);
}

// Error: Non-equal dependencies (edges e1 and e0 have different sources/targets)
try {
    drawing.newEqualityArtefact([e1, e0], 'layer-1');
} catch (e) {
    console.error('Caught expected error for non-equal edge dependencies:', (e as Error).message);
}

// --- Artefact Merge Tests ---
console.log('--- Artefact Merge Tests ---');

const test_v0 = drawing.newArtefact('Vertex', {}, { position: [100, 100], label: 'tv0' }, 'root');
const test_v1 = drawing.newArtefact('Vertex', {}, { position: [200, 200], label: 'tv1' }, 'root');
const test_e0 = drawing.newArtefact('Edge', { source: test_v0, target: sq_v1 }, { width: 2, bend: 0, label: 'te0' }, 'layer-1');

console.log('Are dependencies equal (test_v0 & test_v1):', drawing.areDependenciesEqual(test_v0, test_v1));

const mergedVertex = drawing.mergeArtefacts(test_v0, test_v1);
console.log("Merged vertex label (expected 'tv0, tv1'):", mergedVertex.data.label);
console.log('Merged vertex position (kept 2nd: [200, 200]):', mergedVertex.data.position);
console.log('Edge source updated to merged vertex:', test_e0.dependencies.source === mergedVertex);
console.log('Old vertex removed:', !drawing.getArtefacts().includes(test_v0));

try {
    drawing.mergeArtefacts(mergedVertex, test_e0);
} catch (e) {
    console.error('Caught expected error merging different sorts/dependencies:', (e as Error).message);
}

try {
    drawing.mergeArtefacts(mergedVertex, mergedVertex);
} catch (e) {
    console.error('Caught expected error merging artefact with itself:', (e as Error).message);
}

// Clean up test edge and merged vertex for initial canvas state
drawing.removeArtefact(test_e0);
drawing.removeArtefact(mergedVertex);

// Drawing Store & Rule Validation Tests
console.log('--- Drawing Store & Rule Validation Tests ---');

// Test 1: Validation on initial demo drawing (isRule should be false because root has 0 leaf children)
const check1 = drawingStore.checkIsRule(drawing);
console.log('Rule check on initial drawing (isRule expected false):', check1.isRule, '-', check1.reason);

// Save initial demo drawing (regular drawing, not a rule)
const savedDemo = drawingStore.saveDrawing('Initial Drawing', drawing);
console.log("Saved 'Initial Drawing', isRule =", savedDemo.isRule);

// Test 2: Add a leaf child layer to root to satisfy Rule condition
drawing.addLayer('leaf-layer', 'Leaf Layer', 'root', '#f39c12', true);
const check2 = drawingStore.checkIsRule(drawing);
console.log('Rule check after adding leaf layer (isRule expected true):', check2.isRule);

// Save drawing as a regular (non-rule) drawing
const savedRuleDrawing = drawingStore.saveDrawing('Rule Drawing Demo', drawing);
console.log("Saved 'Rule Drawing Demo', isRule =", savedRuleDrawing.isRule);

// Test 3: Load rule drawing back into canvas
drawingStore.loadDrawing('Rule Drawing Demo', drawing);
console.log("Successfully loaded 'Rule Drawing Demo' back into canvas.");

// --- Applyable Rules Demo ---
console.log('--- Applyable Rules Demo ---');

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
console.log("Saved 'ComposableEdges' rule, isRule =", drawingStore.getDrawing('ComposableEdges')!.isRule);

const tempRuleDraw = new Drawing(sortStore);
drawingStore.loadDrawing('ComposableEdges', tempRuleDraw);
const ruleApps = findRuleApplications(tempRuleDraw, drawing);
console.log('ComposableEdges applications:', ruleApps.length);

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

// Host: same composable edges, without any mono flag
const hostNoMono = new Drawing(sortStore);
const hfv0 = hostNoMono.newArtefact('Vertex', {}, { position: [0, 0], label: 'hfv0' }, 'root');
const hfv1 = hostNoMono.newArtefact('Vertex', {}, { position: [100, 0], label: 'hfv1' }, 'root');
const hfv2 = hostNoMono.newArtefact('Vertex', {}, { position: [200, 0], label: 'hfv2' }, 'root');
hostNoMono.newArtefact('Edge', { source: hfv0, target: hfv1 }, { width: 2, bend: 0, label: 'hfe1' }, 'root');
hostNoMono.newArtefact('Edge', { source: hfv1, target: hfv2 }, { width: 2, bend: 0, label: 'hfe2' }, 'root');

const tempFlagChildRule = new Drawing(sortStore);
drawingStore.loadDrawing('FlagInChildLayer', tempFlagChildRule);
const flagChildApps = findFirstOrderRuleApplications(tempFlagChildRule, hostNoMono);
console.log('Flag-in-child-layer rule applications (expected 1, flag must not be required):', flagChildApps.length);

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

const tempFlagRootRule = new Drawing(sortStore);
drawingStore.loadDrawing('FlagInRoot', tempFlagRootRule);
const flagRootApps = findFirstOrderRuleApplications(tempFlagRootRule, hostNoMono);
console.log('Flag-in-root-layer rule applications against non-mono host (expected 0, flag must be required):', flagRootApps.length);

// Applying the flag-in-child-layer rule must add the conclusion-layer flag to the matched host root artefact
const tempFlagApplyRule = new Drawing(sortStore);
drawingStore.loadDrawing('FlagInChildLayer', tempFlagApplyRule);
const flagApplyApps = findFirstOrderRuleApplications(tempFlagApplyRule, hostNoMono);
if (flagApplyApps.length > 0) {
    const flagCreated = applyFirstOrderRule(tempFlagApplyRule, hostNoMono, flagApplyApps[0]);
    const monoEdges = hostNoMono.getArtefacts().filter(a => a.dependencies['mono'] === true);
    console.log('Applied FlagInChildLayer: created artefacts:', flagCreated.length,
        '- host mono edges (expected 1 hfe2@root):',
        monoEdges.length === 1 && monoEdges[0].getFlagLayer('mono') === 'root'
            ? `${monoEdges[0].data.label}@root`
            : `unexpected (${monoEdges.map(e => `${e.data.label}@${e.getFlagLayer('mono')}`).join(', ')})`);
}

// A conclusion-layer flag must be moved to the host root layer even if the flag already exists elsewhere
const hostWithOtherMono = new Drawing(sortStore);
const omv0 = hostWithOtherMono.newArtefact('Vertex', {}, { position: [0, 0], label: 'omv0' }, 'root');
const omv1 = hostWithOtherMono.newArtefact('Vertex', {}, { position: [100, 0], label: 'omv1' }, 'root');
const omv2 = hostWithOtherMono.newArtefact('Vertex', {}, { position: [200, 0], label: 'omv2' }, 'root');
hostWithOtherMono.newArtefact('Edge', { source: omv0, target: omv1 }, { width: 2, bend: 0, label: 'ome1' }, 'root');
hostWithOtherMono.addLayer('mono-layer', 'Mono Layer', 'root');
hostWithOtherMono.newArtefact('Edge', { source: omv1, target: omv2, mono: { __flag: true, layerId: 'mono-layer' } }, { width: 2, bend: 0, label: 'ome2' }, 'root');

const tempFlagOverwriteRule = new Drawing(sortStore);
drawingStore.loadDrawing('FlagInChildLayer', tempFlagOverwriteRule);
const flagOverwriteApps = findFirstOrderRuleApplications(tempFlagOverwriteRule, hostWithOtherMono);
if (flagOverwriteApps.length > 0) {
    applyFirstOrderRule(tempFlagOverwriteRule, hostWithOtherMono, flagOverwriteApps[0]);
    const overwrittenMono = hostWithOtherMono.getArtefacts().filter(a => a.dependencies['mono'] === true);
    console.log('Applied FlagInChildLayer to host with pre-existing mono elsewhere (expected 1 ome2@root):',
        overwrittenMono.length === 1 && overwrittenMono[0].getFlagLayer('mono') === 'root'
            ? `${overwrittenMono[0].data.label}@root`
            : `unexpected (${overwrittenMono.map(e => `${e.data.label}@${e.getFlagLayer('mono')}`).join(', ')})`);
}

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

const tempChildEqRule = new Drawing(sortStore);
drawingStore.loadDrawing('ComposableEdgesChildEq', tempChildEqRule);
const childEqApps = findRuleApplications(tempChildEqRule, drawing);
console.log('ComposableEdgesChildEq applications (child-layer equality must be ignored):', childEqApps.length);

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

const applyHost = new Drawing(sortStore);
const hv0 = applyHost.newArtefact('Vertex', {}, { position: [0, 0], label: 'hv0' }, 'root');
const hv1 = applyHost.newArtefact('Vertex', {}, { position: [100, 0], label: 'hv1' }, 'root');
const hv2 = applyHost.newArtefact('Vertex', {}, { position: [200, 0], label: 'hv2' }, 'root');
applyHost.newArtefact('Edge', { source: hv0, target: hv1 }, { width: 2, bend: 0, label: 'he1' }, 'root');
applyHost.newArtefact('Edge', { source: hv1, target: hv2 }, { width: 2, bend: 0, label: 'he2' }, 'root');

const tempApplyRule = new Drawing(sortStore);
drawingStore.loadDrawing('ChildEqApply', tempApplyRule);
const applyApps = findFirstOrderRuleApplications(tempApplyRule, applyHost);
console.log('ChildEqApply first-order applications:', applyApps.length);
if (applyApps.length > 0) {
    const applied = applyFirstOrderRule(tempApplyRule, applyHost, applyApps[0]);
    const addedEqualities = applied.filter(a => a.sortName === 'Equality');
    console.log('Applied ChildEqApply; added artefacts:', applied.length, '- equalities added:', addedEqualities.length);
    for (const eq of addedEqualities) {
        if (eq instanceof EqualityArtefact) {
            console.log('  Added equality:', eq.children.map(c => c.data.label || c.sortName).join(' = '));
        }
    }
}

// --- Second-Order Rules Demo ---
console.log('--- Second-Order Rules Demo ---');

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
console.log('Rule structure valid:', secondOrderRule.checkRuleConditions().isRule);
drawingStore.saveDrawing('SecondOrderComp', secondOrderRule);
console.log("Saved 'SecondOrderComp', isRule =", drawingStore.getDrawing('SecondOrderComp')!.isRule, ', isFirstOrder =', drawingStore.getDrawing('SecondOrderComp')!.isFirstOrder);

// Host: two composable edges, like the first-order Comp host
const soHost = new Drawing(sortStore);
const h0 = soHost.newArtefact('Vertex', {}, { position: [0, 0], label: 'h0' }, 'root');
const h1 = soHost.newArtefact('Vertex', {}, { position: [100, 0], label: 'h1' }, 'root');
const h2 = soHost.newArtefact('Vertex', {}, { position: [200, 0], label: 'h2' }, 'root');
soHost.newArtefact('Edge', { source: h0, target: h1 }, { width: 2, bend: 0, label: 'he1' }, 'root');
soHost.newArtefact('Edge', { source: h1, target: h2 }, { width: 2, bend: 0, label: 'he2' }, 'root');

const tempSoRule = new Drawing(sortStore);
drawingStore.loadDrawing('SecondOrderComp', tempSoRule);
const soApps = findSecondOrderRuleApplications(tempSoRule, soHost);
console.log('SecondOrderComp applications (expected 1):', soApps.length);
if (soApps.length > 0) {
    const soResult = applySecondOrderRule(tempSoRule, soHost, soApps[0], { hostName: 'SO Host', ruleName: 'SecondOrderComp' });
    console.log('Applied SecondOrderComp: host artefacts added:', soResult.hostArtefacts.length, '- derived drawings:', soResult.derivedRules.length);
    for (const dr of soResult.derivedRules) {
        const layerChain = dr.drawing.getAllLayers().map(l => `${l.name}${l.parentId ? ' (child)' : ' (root)'}`).join(' -> ');
        console.log(`  Derived drawing '${dr.name}': isRule=${dr.drawing.isRule}, layers: ${layerChain}, artefacts=${dr.drawing.getArtefacts().length}`);
        for (const art of dr.drawing.getArtefacts()) {
            const layerName = dr.drawing.getLayer(art.layerId)?.name || art.layerId;
            console.log(`    - ${art.data.label || art.sortName} (${art.sortName}) in layer '${layerName}'`);
        }
        const hasSh = dr.drawing.getArtefacts().some(a => a.data.label === 'sh');
        const hostHasSh = soHost.getArtefacts().some(a => a.data.label === 'sh' && a.layerId === 'root');
        console.log(`  Derived drawing contains 'sh' (expected false): ${hasSh}; host root contains 'sh' (expected true): ${hostHasSh}`);
        const hostMonoEdges = soHost.getArtefacts().filter(a => a.dependencies['mono'] === true);
        const hostMono = hostMonoEdges.length === 1 && hostMonoEdges[0].getFlagLayer('mono') === 'root'
            ? `${hostMonoEdges[0].data.label}@root`
            : `unexpected (${hostMonoEdges.map(e => `${e.data.label}@${e.getFlagLayer('mono')}`).join(', ')})`;
        console.log(`  Host edges with 'mono' after apply (expected he1@root): ${hostMono}`);
        const derivedMono = dr.drawing.getArtefacts().filter(a => a.dependencies['mono'] === true);
        console.log(`  Derived drawing edges with 'mono' (expected 0): ${derivedMono.length}`);
        drawingStore.saveDrawing(dr.name, dr.drawing);
        console.log("  Saved derived drawing to DrawingStore as '" + dr.name + "'.");
    }
}

// Verify the new rule-structure restriction: a child layer of the root with 2 children is invalid
console.log('--- Rule restriction demo: child of root with 2 children ---');
const badRule = new Drawing(sortStore);
badRule.newArtefact('Vertex', {}, { position: [0, 0], label: 'bv0' }, 'root');
badRule.addLayer('bad-conclusion', 'Bad Conclusion', 'root');
badRule.addLayer('bad-a', 'Bad A', 'root');
badRule.addLayer('bad-b1', 'Bad B1', 'bad-a');
badRule.addLayer('bad-b2', 'Bad B2', 'bad-a');
const badCheck = badRule.checkRuleConditions();
console.log('Bad rule (child with 2 children) isRule expected false:', badCheck.isRule, '-', badCheck.reason);
try {
    badRule.setIsRule(true);
    console.log('Bad rule was wrongly accepted as a rule!');
} catch (e) {
    console.log('Caught expected error rejecting bad rule:', (e as Error).message);
}

// Rule matching up to host equalities: two triangles sharing one edge may match
// host triangles whose edges are distinct but provably equal
console.log('--- Matching Up To Equality Demo ---');

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

// Host A: two triangles whose shared edge is a single artefact
const hostShared = new Drawing(sortStore);
buildTrianglePairHost(hostShared, 'shared');

// Host B: two triangles on DISTINCT edges made provably equal
const hostEqualEdges = new Drawing(sortStore);
buildTrianglePairHost(hostEqualEdges, 'equal');

// Host C: two triangles on distinct edges that are NOT provably equal
const hostDistinctEdges = new Drawing(sortStore);
buildTrianglePairHost(hostDistinctEdges, 'distinct');

const tempEqMatchRule = new Drawing(sortStore);
drawingStore.loadDrawing('SharedEdgeTriangles', tempEqMatchRule);
const eqMatchShared = findRuleApplications(tempEqMatchRule, hostShared);
const eqMatchEqual = findRuleApplications(tempEqMatchRule, hostEqualEdges);
const eqMatchDistinct = findRuleApplications(tempEqMatchRule, hostDistinctEdges);
console.log('SharedEdgeTriangles on host with truly shared edge (expected 2):', eqMatchShared.length);
console.log('SharedEdgeTriangles on host with provably equal edges (expected 2):', eqMatchEqual.length);
console.log('SharedEdgeTriangles on host with distinct edges (expected 0):', eqMatchDistinct.length);

// Notify reactive UI that the demo has finished populating state.
refresh();
