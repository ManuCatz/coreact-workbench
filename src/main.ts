import * as d3 from 'd3';
import { SortStore, Drawing, Artefact, EqualityArtefact, Layer, DrawingStore, findRuleApplications, findFirstOrderRuleApplications, findSecondOrderRuleApplications, applyFirstOrderRule, applySecondOrderRule, type SortDefinition } from './index';
import defaultSortsCode from '../public/default_sorts.js?raw';

// 1. Initialize the Sort Store
const sortStore = new SortStore();
(globalThis as any).sortStore = sortStore;

// 2. Load default sorts via executor
new Function('sortStore', 'd3', defaultSortsCode)(sortStore, d3);

// 3. Create DrawingStore and Drawing instances
const drawingStore = new DrawingStore();
const drawing = new Drawing(sortStore);

// Set up Layer Tree hierarchy for Demo
// Root Layer ("root") is automatically initialized by Drawing
const rootLayer = drawing.getLayer("root")!;
rootLayer.name = "Root Layer";
rootLayer.color = "#3498db";
rootLayer.colorEnabled = false;

// Child Layer 1 above Root Layer
drawing.addLayer("layer-1", "Child Layer 1", "root", "#e74c3c", true);

// Child Layer 2 above Child Layer 1
drawing.addLayer("layer-2", "Child Layer 2", "layer-1", "#2ecc71", true);

console.log("Creating valid artefacts with multi-layer support...");

// 4. Instantiate Artefacts
// Vertices in Root Layer
const v0 = drawing.newArtefact("Vertex", {}, { position: [200, 300], label: "v0" }, "root");
const v1 = drawing.newArtefact("Vertex", {}, { position: [600, 300], label: "v1" }, "root");
const v2 = drawing.newArtefact("Vertex", {}, { position: [400, 150], label: "v2" }, "root");

// Move edge e0 into the Root Layer (source & target v0, v1 are in Root)
const e0 = drawing.newArtefact("Edge", { source: v0, target: v1 }, { width: 4, bend: 0, label: "e0" }, "root");

// Edges e1, e2 in Child Layer 1 (referencing Root Layer vertices v0, v1, v2)
// e1's mono flag leaves from layer-2 (a descendant of e1's layer), so it shows as active when layer-2 is focused
const e1 = drawing.newArtefact("Edge", { source: v1, target: v2, mono: { __flag: true, layerId: "layer-2" } }, { width: 2, bend: 30, label: "e1" }, "layer-1");
const e2 = drawing.newArtefact("Edge", { source: v2, target: v0 }, { width: 2, bend: 0, label: "e2" }, "layer-1");
console.log("Created demo edges e0, e1, e2:", e0.data.label, e1.data.label, e2.data.label);

// --- Square Graph for Pullback Demo ---
console.log("Creating square graph artefacts across layers...");

// Square vertices in Root Layer
const sq_v0 = drawing.newArtefact("Vertex", {}, { position: [400, 400], label: "A" }, "root");
const sq_v1 = drawing.newArtefact("Vertex", {}, { position: [600, 400], label: "B" }, "root");
const sq_v2 = drawing.newArtefact("Vertex", {}, { position: [400, 550], label: "C" }, "root");
const sq_v3 = drawing.newArtefact("Vertex", {}, { position: [600, 550], label: "D" }, "root");

// Projections p1, p2, q1, q2 in Child Layer 1
const p1 = drawing.newArtefact("Edge", { source: sq_v0, target: sq_v1 }, { width: 2, bend: 0, label: "p1" }, "layer-1");
const p2 = drawing.newArtefact("Edge", { source: sq_v0, target: sq_v2 }, { width: 2, bend: 0, label: "p2" }, "layer-1");
const q1 = drawing.newArtefact("Edge", { source: sq_v1, target: sq_v3 }, { width: 2, bend: 0, label: "q1" }, "layer-1");
const q2 = drawing.newArtefact("Edge", { source: sq_v2, target: sq_v3 }, { width: 2, bend: 0, label: "q2" }, "layer-1");

// The Pullback artefact itself in Child Layer 2 (referencing Layer 1 edges)
drawing.newArtefact("Pullback", { p1, p2, q1, q2 }, {}, "layer-2");

// The Triangle artefact (a 2-cell) in Child Layer 2 (referencing edges e1, e2, e0)
drawing.newArtefact("Triangle", { "1": e1, "2": e2, o: e0 }, {}, "layer-2");

// Two composable root-layer edges (with their own vertices) so the 'ComposableEdges' rule applies
const cd0 = drawing.newArtefact("Vertex", {}, { position: [450, 650], label: "cd0" }, "root");
const cd1 = drawing.newArtefact("Vertex", {}, { position: [550, 650], label: "cd1" }, "root");
const cd2 = drawing.newArtefact("Vertex", {}, { position: [650, 650], label: "cd2" }, "root");
drawing.newArtefact("Edge", { source: cd0, target: cd1 }, { width: 2, bend: 0, label: "r1" }, "root");
drawing.newArtefact("Edge", { source: cd1, target: cd2 }, { width: 2, bend: 0, label: "r2" }, "root");

// 5. Canvas and interaction setup
const svgContext = d3.select("#canvas");

// Global Position Picker state
let activePositionPicker: {
    artefact: Artefact;
    attrName: string;
    inputX: HTMLInputElement | null;
    inputY: HTMLInputElement | null;
    pickBtn: HTMLButtonElement | null;
} | null = null;

function getSinglePositionAttr(sortDef: SortDefinition): string | null {
    const positionAttrs = Object.entries(sortDef.attributes)
        .filter(([_, type]) => type === "position")
        .map(([name]) => name);
    return positionAttrs.length === 1 ? positionAttrs[0] : null;
}

function appendFlagLayerSelect(container: HTMLElement, flagKey: string, artefactLayerId: string, currentFlagLayerId: string, onLayerChange: (layerId: string) => void): HTMLSelectElement {
    const select = document.createElement("select");
    select.className = "flag-layer-select";
    select.title = `Layer from which flag '${flagKey}' leaves`;
    const candidates = new Set([artefactLayerId, ...drawing.getDescendants(artefactLayerId)]);
    for (const l of drawing.getAllLayers()) {
        if (candidates.has(l.id)) {
            const opt = document.createElement("option");
            opt.value = l.id;
            opt.textContent = l.name;
            if (l.id === currentFlagLayerId) opt.selected = true;
            select.appendChild(opt);
        }
    }
    select.addEventListener("change", (e) => {
        onLayerChange((e.target as HTMLSelectElement).value);
    });
    container.appendChild(select);
    return select;
}

function clearActivePickerButton(): void {
    const pickBtn = activePositionPicker?.pickBtn;
    if (pickBtn) {
        pickBtn.style.backgroundColor = "";
    }
}

function stopPositionPicker(): void {
    clearActivePickerButton();
    activePositionPicker = null;
    d3.select("body").style("cursor", "default");
}

svgContext.on("click", (event: MouseEvent) => {
    if (activePositionPicker) {
        event.stopPropagation();
        const coords = d3.pointer(event, svgContext.node());
        const x = Math.round(coords[0]);
        const y = Math.round(coords[1]);

        activePositionPicker.artefact.data[activePositionPicker.attrName] = [x, y];
        if (activePositionPicker.inputX) activePositionPicker.inputX.value = x.toString();
        if (activePositionPicker.inputY) activePositionPicker.inputY.value = y.toString();

        stopPositionPicker();

        updateCanvas();
        renderMenu();
        renderInspector();
    }
});

svgContext.selectAll("*").remove();
console.log("Drawing artefacts...");
drawing.draw(svgContext);
console.log("Drawing complete!");

// 6. Demonstrate Consistency Checks (Expected Errors)
console.log("---");
console.log("Testing consistency checks (You should see caught errors below):");

try {
    drawing.newArtefact("Vertex", {}, { position: "200, 300", label: "InvalidPos" });
} catch (e) {
    console.error("Caught expected error for invalid position:", (e as Error).message);
}

try {
    drawing.newArtefact("Edge", { source: v0, target: v1 }, { width: 4, bend: 0 });
} catch (e) {
    console.error("Caught expected error for missing dependency:", (e as Error).message);
}

try {
    drawing.newArtefact("Edge", { source: v0 }, { width: 4, bend: 0 });
} catch (e) {
    console.error("Caught expected error for wrong dependency type:", (e as Error).message);
}

try {
    drawing.newArtefact("Edge", { source: v0, target: v1, unexpectedFlag: true }, { width: 4, bend: 0 });
} catch (e) {
    console.error("Caught expected error for unexpected dependency/flag:", (e as Error).message);
}

try {
    drawing.newArtefact("Edge", { source: v0, target: v1, mono: "yes" as any }, { width: 4, bend: 0 });
} catch (e) {
    console.error("Caught expected error for bad flag type:", (e as Error).message);
}

try {
    drawing.newArtefact("Edge", { source: v0, target: v1, mono: { __flag: true, layerId: "root" } }, { width: 4, bend: 0 });
} catch (e) {
    console.error("Caught expected error for flag leaving from non-descendant layer:", (e as Error).message);
}

try {
    drawing.newArtefact("Edge", { source: v0, target: v1, mono: { __flag: true, layerId: "does-not-exist" } }, { width: 4, bend: 0 });
} catch (e) {
    console.error("Caught expected error for flag leaving from nonexistent layer:", (e as Error).message);
}

// Hierarchy Check: Try creating an edge in "root" layer whose target vertex is in "layer-1"
let v_layer1: Artefact | undefined;
try {
    v_layer1 = drawing.newArtefact("Vertex", {}, { position: [100, 100], label: "v_top" }, "layer-1");
    drawing.newArtefact("Edge", { source: v0, target: v_layer1 }, { width: 2, bend: 0, label: "invalid_edge" }, "root");
} catch (e) {
    console.error("Caught expected error for invalid layer hierarchy dependency:", (e as Error).message);
    if (v_layer1) {
        drawing.removeArtefact(v_layer1);
    }
}

// --- Equality Artefact Tests ---
console.log("--- Equality Artefact Tests ---");

// 1. Create Equality between Vertices v0 and v1 in root layer (unnamed, uses default label 'v0 = v1')
const eqv0v1 = drawing.newEqualityArtefact([v0, v1], "root");
console.log("Created equality artefact between v0 and v1 in root layer:", eqv0v1.children.length, "children");

// 2. Automatic merging on same layer: add v2 to equality in root layer
const eqv1v2 = drawing.newEqualityArtefact([v1, v2], "root");
console.log("Merged equality artefact in root layer now has children count:", eqv0v1.children.length, "eqv1v2:", eqv1v2.children.length);

// 3. Different layer: create equality artefact between v2 and sq_v0 in layer-1 (NOT merged with root equality)
const eqv2sq = drawing.newEqualityArtefact([v2, sq_v0], "layer-1");
console.log("Equality artefact on layer-1 created separately. Root eq children:", eqv0v1.children.length, "layer-1 eq children:", eqv2sq.children.length);

// 4. Test expected errors for Equality artefacts:
// Error: Degenerate equality (< 2 elements)
try {
    drawing.newEqualityArtefact([v0], "root");
} catch (e) {
    console.error("Caught expected error for degenerate equality:", (e as Error).message);
}

// Error: Different sorts
try {
    drawing.newEqualityArtefact([v0, p1 as any], "root");
} catch (e) {
    console.error("Caught expected error for different sorts in equality:", (e as Error).message);
}

// Error: Non-equal dependencies (edges e1 and e0 have different sources/targets)
try {
    drawing.newEqualityArtefact([e1, e0], "layer-1");
} catch (e) {
    console.error("Caught expected error for non-equal edge dependencies:", (e as Error).message);
}

// --- Artefact Merge Tests ---
console.log("--- Artefact Merge Tests ---");

const test_v0 = drawing.newArtefact("Vertex", {}, { position: [100, 100], label: "tv0" }, "root");
const test_v1 = drawing.newArtefact("Vertex", {}, { position: [200, 200], label: "tv1" }, "root");
const test_e0 = drawing.newArtefact("Edge", { source: test_v0, target: sq_v1 }, { width: 2, bend: 0, label: "te0" }, "layer-1");

console.log("Are dependencies equal (test_v0 & test_v1):", drawing.areDependenciesEqual(test_v0, test_v1));

const mergedVertex = drawing.mergeArtefacts(test_v0, test_v1);
console.log("Merged vertex label (expected 'tv0, tv1'):", mergedVertex.data.label);
console.log("Merged vertex position (kept 2nd: [200, 200]):", mergedVertex.data.position);
console.log("Edge source updated to merged vertex:", test_e0.dependencies.source === mergedVertex);
console.log("Old vertex removed:", !drawing.getArtefacts().includes(test_v0));

try {
    drawing.mergeArtefacts(mergedVertex, test_e0);
} catch (e) {
    console.error("Caught expected error merging different sorts/dependencies:", (e as Error).message);
}

try {
    drawing.mergeArtefacts(mergedVertex, mergedVertex);
} catch (e) {
    console.error("Caught expected error merging artefact with itself:", (e as Error).message);
}

// Clean up test edge and merged vertex for initial canvas state
drawing.removeArtefact(test_e0);
drawing.removeArtefact(mergedVertex);

// Drawing Store & Rule Validation Tests
console.log("--- Drawing Store & Rule Validation Tests ---");

// Test 1: Validation on initial demo drawing (isRule should be false because root has 0 leaf children)
const check1 = drawingStore.checkIsRule(drawing);
console.log("Rule check on initial drawing (isRule expected false):", check1.isRule, "-", check1.reason);

// Save initial demo drawing (regular drawing, not a rule)
const savedDemo = drawingStore.saveDrawing("Initial Drawing", drawing);
console.log("Saved 'Initial Drawing', isRule =", savedDemo.isRule);

// Test 2: Add a leaf child layer to root to satisfy Rule condition
drawing.addLayer("leaf-layer", "Leaf Layer", "root", "#f39c12", true);
const check2 = drawingStore.checkIsRule(drawing);
console.log("Rule check after adding leaf layer (isRule expected true):", check2.isRule);

// Save drawing as a regular (non-rule) drawing
const savedRuleDrawing = drawingStore.saveDrawing("Rule Drawing Demo", drawing);
console.log("Saved 'Rule Drawing Demo', isRule =", savedRuleDrawing.isRule);

// Test 3: Load rule drawing back into canvas
drawingStore.loadDrawing("Rule Drawing Demo", drawing);
console.log("Successfully loaded 'Rule Drawing Demo' back into canvas.");

// --- Applyable Rules Demo ---
console.log("--- Applyable Rules Demo ---");

// Build a small rule: two composable edges in the root layer
const ruleDrawing = new Drawing(sortStore);
const rv0 = ruleDrawing.newArtefact("Vertex", {}, { position: [0, 0], label: "rv0" }, "root");
const rv1 = ruleDrawing.newArtefact("Vertex", {}, { position: [100, 0], label: "rv1" }, "root");
const rv2 = ruleDrawing.newArtefact("Vertex", {}, { position: [200, 0], label: "rv2" }, "root");
ruleDrawing.newArtefact("Edge", { source: rv0, target: rv1 }, { width: 2, bend: 0, label: "re1" }, "root");
ruleDrawing.newArtefact("Edge", { source: rv1, target: rv2 }, { width: 2, bend: 0, label: "re2" }, "root");
ruleDrawing.addLayer("rule-pattern", "Rule Pattern", "root");
ruleDrawing.newArtefact("Edge", { source: rv0, target: rv2 }, { width: 2, bend: 0, label: "re3" }, "rule-pattern");
ruleDrawing.setIsRule(true);
drawingStore.saveDrawing("ComposableEdges", ruleDrawing);
console.log("Saved 'ComposableEdges' rule, isRule =", drawingStore.getDrawing("ComposableEdges")!.isRule);

const tempRuleDraw = new Drawing(sortStore);
drawingStore.loadDrawing("ComposableEdges", tempRuleDraw);
const ruleApps = findRuleApplications(tempRuleDraw, drawing);
console.log("ComposableEdges applications:", ruleApps.length);

// Rule flag leaving from a child layer: matching must NOT require the flag in the host
const ruleFlagInChildLayer = new Drawing(sortStore);
const fv0 = ruleFlagInChildLayer.newArtefact("Vertex", {}, { position: [0, 0], label: "fv0" }, "root");
const fv1 = ruleFlagInChildLayer.newArtefact("Vertex", {}, { position: [100, 0], label: "fv1" }, "root");
const fv2 = ruleFlagInChildLayer.newArtefact("Vertex", {}, { position: [200, 0], label: "fv2" }, "root");
ruleFlagInChildLayer.newArtefact("Edge", { source: fv0, target: fv1 }, { width: 2, bend: 0, label: "fe1" }, "root");
ruleFlagInChildLayer.addLayer("flag-conclusion", "Flag Conclusion", "root");
ruleFlagInChildLayer.newArtefact("Edge", { source: fv1, target: fv2, mono: { __flag: true, layerId: "flag-conclusion" } }, { width: 2, bend: 0, label: "fe2" }, "root");
ruleFlagInChildLayer.newArtefact("Edge", { source: fv0, target: fv2 }, { width: 2, bend: 0, label: "fe3" }, "flag-conclusion");
ruleFlagInChildLayer.setIsRule(true);
drawingStore.saveDrawing("FlagInChildLayer", ruleFlagInChildLayer);

// Host: same composable edges, without any mono flag
const hostNoMono = new Drawing(sortStore);
const hfv0 = hostNoMono.newArtefact("Vertex", {}, { position: [0, 0], label: "hfv0" }, "root");
const hfv1 = hostNoMono.newArtefact("Vertex", {}, { position: [100, 0], label: "hfv1" }, "root");
const hfv2 = hostNoMono.newArtefact("Vertex", {}, { position: [200, 0], label: "hfv2" }, "root");
hostNoMono.newArtefact("Edge", { source: hfv0, target: hfv1 }, { width: 2, bend: 0, label: "hfe1" }, "root");
hostNoMono.newArtefact("Edge", { source: hfv1, target: hfv2 }, { width: 2, bend: 0, label: "hfe2" }, "root");

const tempFlagChildRule = new Drawing(sortStore);
drawingStore.loadDrawing("FlagInChildLayer", tempFlagChildRule);
const flagChildApps = findFirstOrderRuleApplications(tempFlagChildRule, hostNoMono);
console.log("Flag-in-child-layer rule applications (expected 1, flag must not be required):", flagChildApps.length);

// Control: rule flag leaving from the root layer IS required for matching
const ruleFlagInRoot = new Drawing(sortStore);
const rfv0 = ruleFlagInRoot.newArtefact("Vertex", {}, { position: [0, 0], label: "rfv0" }, "root");
const rfv1 = ruleFlagInRoot.newArtefact("Vertex", {}, { position: [100, 0], label: "rfv1" }, "root");
const rfv2 = ruleFlagInRoot.newArtefact("Vertex", {}, { position: [200, 0], label: "rfv2" }, "root");
ruleFlagInRoot.newArtefact("Edge", { source: rfv0, target: rfv1 }, { width: 2, bend: 0, label: "rfe1" }, "root");
ruleFlagInRoot.newArtefact("Edge", { source: rfv1, target: rfv2, mono: true }, { width: 2, bend: 0, label: "rfe2" }, "root");
ruleFlagInRoot.addLayer("flag-root-conclusion", "Root Flag Conclusion", "root");
ruleFlagInRoot.newArtefact("Edge", { source: rfv0, target: rfv2 }, { width: 2, bend: 0, label: "rfe3" }, "flag-root-conclusion");
ruleFlagInRoot.setIsRule(true);
drawingStore.saveDrawing("FlagInRoot", ruleFlagInRoot);

const tempFlagRootRule = new Drawing(sortStore);
drawingStore.loadDrawing("FlagInRoot", tempFlagRootRule);
const flagRootApps = findFirstOrderRuleApplications(tempFlagRootRule, hostNoMono);
console.log("Flag-in-root-layer rule applications against non-mono host (expected 0, flag must be required):", flagRootApps.length);

// Applying the flag-in-child-layer rule must add the conclusion-layer flag to the matched host root artefact
const tempFlagApplyRule = new Drawing(sortStore);
drawingStore.loadDrawing("FlagInChildLayer", tempFlagApplyRule);
const flagApplyApps = findFirstOrderRuleApplications(tempFlagApplyRule, hostNoMono);
if (flagApplyApps.length > 0) {
    const flagCreated = applyFirstOrderRule(tempFlagApplyRule, hostNoMono, flagApplyApps[0]);
    const monoEdges = hostNoMono.getArtefacts().filter(a => a.dependencies["mono"] === true);
    console.log("Applied FlagInChildLayer: created artefacts:", flagCreated.length,
        "- host mono edges (expected 1 hfe2@root):",
        monoEdges.length === 1 && monoEdges[0].getFlagLayer("mono") === "root"
            ? `${monoEdges[0].data.label}@root`
            : `unexpected (${monoEdges.map(e => `${e.data.label}@${e.getFlagLayer("mono")}`).join(", ")})`);
}

// Rule whose child layer contains an equality: matching must ignore it
const ruleWithChildEq = new Drawing(sortStore);
const cev0 = ruleWithChildEq.newArtefact("Vertex", {}, { position: [0, 0], label: "cev0" }, "root");
const cev1 = ruleWithChildEq.newArtefact("Vertex", {}, { position: [100, 0], label: "cev1" }, "root");
const cev2 = ruleWithChildEq.newArtefact("Vertex", {}, { position: [200, 0], label: "cev2" }, "root");
ruleWithChildEq.newArtefact("Edge", { source: cev0, target: cev1 }, { width: 2, bend: 0, label: "ce1" }, "root");
ruleWithChildEq.newArtefact("Edge", { source: cev1, target: cev2 }, { width: 2, bend: 0, label: "ce2" }, "root");
ruleWithChildEq.addLayer("rule-pattern-eq", "Rule Pattern", "root");
ruleWithChildEq.newArtefact("Edge", { source: cev0, target: cev2 }, { width: 2, bend: 0, label: "ce3" }, "rule-pattern-eq");
ruleWithChildEq.newEqualityArtefact([cev0, cev1], "rule-pattern-eq");
ruleWithChildEq.setIsRule(true);
drawingStore.saveDrawing("ComposableEdgesChildEq", ruleWithChildEq);

const tempChildEqRule = new Drawing(sortStore);
drawingStore.loadDrawing("ComposableEdgesChildEq", tempChildEqRule);
const childEqApps = findRuleApplications(tempChildEqRule, drawing);
console.log("ComposableEdgesChildEq applications (child-layer equality must be ignored):", childEqApps.length);

// Rule whose child-layer equality is not provably equal in the host: still applyable, equality is added
const ruleChildEqApply = new Drawing(sortStore);
const qv0 = ruleChildEqApply.newArtefact("Vertex", {}, { position: [0, 0], label: "qv0" }, "root");
const qv1 = ruleChildEqApply.newArtefact("Vertex", {}, { position: [100, 0], label: "qv1" }, "root");
const qv2 = ruleChildEqApply.newArtefact("Vertex", {}, { position: [200, 0], label: "qv2" }, "root");
const qe1 = ruleChildEqApply.newArtefact("Edge", { source: qv0, target: qv1 }, { width: 2, bend: 0, label: "qe1" }, "root");
const qe2 = ruleChildEqApply.newArtefact("Edge", { source: qv1, target: qv2 }, { width: 2, bend: 0, label: "qe2" }, "root");
ruleChildEqApply.addLayer("conclusion", "Conclusion", "root");
ruleChildEqApply.newArtefact("Edge", { source: qv0, target: qv2 }, { width: 2, bend: 0, label: "qe3" }, "conclusion");
ruleChildEqApply.newEqualityArtefact([qv0, qv1, qv2], "conclusion");
ruleChildEqApply.newEqualityArtefact([qe1, qe2], "conclusion");
ruleChildEqApply.setIsRule(true);
drawingStore.saveDrawing("ChildEqApply", ruleChildEqApply);

const applyHost = new Drawing(sortStore);
const hv0 = applyHost.newArtefact("Vertex", {}, { position: [0, 0], label: "hv0" }, "root");
const hv1 = applyHost.newArtefact("Vertex", {}, { position: [100, 0], label: "hv1" }, "root");
const hv2 = applyHost.newArtefact("Vertex", {}, { position: [200, 0], label: "hv2" }, "root");
applyHost.newArtefact("Edge", { source: hv0, target: hv1 }, { width: 2, bend: 0, label: "he1" }, "root");
applyHost.newArtefact("Edge", { source: hv1, target: hv2 }, { width: 2, bend: 0, label: "he2" }, "root");

const tempApplyRule = new Drawing(sortStore);
drawingStore.loadDrawing("ChildEqApply", tempApplyRule);
const applyApps = findFirstOrderRuleApplications(tempApplyRule, applyHost);
console.log("ChildEqApply first-order applications:", applyApps.length);
if (applyApps.length > 0) {
    const applied = applyFirstOrderRule(tempApplyRule, applyHost, applyApps[0]);
    const addedEqualities = applied.filter(a => a.sortName === "Equality");
    console.log("Applied ChildEqApply; added artefacts:", applied.length, "- equalities added:", addedEqualities.length);
    for (const eq of addedEqualities) {
        if (eq instanceof EqualityArtefact) {
            console.log("  Added equality:", eq.children.map(c => c.data.label || c.sortName).join(" = "));
        }
    }
}

// --- Second-Order Rules Demo ---
console.log("--- Second-Order Rules Demo ---");

// Build a second-order rule: the root layer holds two composable edges, the
// conclusion layer (leaf child of root) holds the composed edge, and a premise
// layer A (with its own child layer B) is ignored during first-order application.
const secondOrderRule = new Drawing(sortStore);
const sv0 = secondOrderRule.newArtefact("Vertex", {}, { position: [0, 0], label: "sv0" }, "root");
const sv1 = secondOrderRule.newArtefact("Vertex", {}, { position: [100, 0], label: "sv1" }, "root");
const sv2 = secondOrderRule.newArtefact("Vertex", {}, { position: [200, 0], label: "sv2" }, "root");

// Conclusion layer (leaf child of root), created before sf so its flag layer exists
secondOrderRule.addLayer("conclusion2", "Conclusion", "root");
secondOrderRule.newArtefact("Edge", { source: sv0, target: sv1, mono: { __flag: true, layerId: "conclusion2" } }, { width: 2, bend: 0, label: "sf" }, "root");
secondOrderRule.newArtefact("Edge", { source: sv1, target: sv2 }, { width: 2, bend: 0, label: "sg" }, "root");
secondOrderRule.newArtefact("Edge", { source: sv0, target: sv2 }, { width: 2, bend: 0, label: "sh" }, "conclusion2");

// Premise layer A (child of root) with child layer B
secondOrderRule.addLayer("premise-a", "Premise A", "root");
const sdv = secondOrderRule.newArtefact("Vertex", {}, { position: [150, 150], label: "sdv" }, "premise-a");
secondOrderRule.addLayer("premise-b", "Premise B", "premise-a");
secondOrderRule.newArtefact("Edge", { source: sdv, target: sv1 }, { width: 2, bend: 0, label: "sb" }, "premise-b");

secondOrderRule.setIsRule(true);
console.log("Rule structure valid:", secondOrderRule.checkRuleConditions().isRule);
drawingStore.saveDrawing("SecondOrderComp", secondOrderRule);
console.log("Saved 'SecondOrderComp', isRule =", drawingStore.getDrawing("SecondOrderComp")!.isRule, ", isFirstOrder =", drawingStore.getDrawing("SecondOrderComp")!.isFirstOrder);

// Host: two composable edges, like the first-order Comp host
const soHost = new Drawing(sortStore);
const h0 = soHost.newArtefact("Vertex", {}, { position: [0, 0], label: "h0" }, "root");
const h1 = soHost.newArtefact("Vertex", {}, { position: [100, 0], label: "h1" }, "root");
const h2 = soHost.newArtefact("Vertex", {}, { position: [200, 0], label: "h2" }, "root");
soHost.newArtefact("Edge", { source: h0, target: h1 }, { width: 2, bend: 0, label: "he1" }, "root");
soHost.newArtefact("Edge", { source: h1, target: h2 }, { width: 2, bend: 0, label: "he2" }, "root");

const tempSoRule = new Drawing(sortStore);
drawingStore.loadDrawing("SecondOrderComp", tempSoRule);
const soApps = findSecondOrderRuleApplications(tempSoRule, soHost);
console.log("SecondOrderComp applications (expected 1):", soApps.length);
if (soApps.length > 0) {
    const soResult = applySecondOrderRule(tempSoRule, soHost, soApps[0], { hostName: "SO Host", ruleName: "SecondOrderComp" });
    console.log("Applied SecondOrderComp: host artefacts added:", soResult.hostArtefacts.length, "- derived drawings:", soResult.derivedRules.length);
    for (const dr of soResult.derivedRules) {
        const layerChain = dr.drawing.getAllLayers().map(l => `${l.name}${l.parentId ? " (child)" : " (root)"}`).join(" -> ");
        console.log(`  Derived drawing '${dr.name}': isRule=${dr.drawing.isRule}, layers: ${layerChain}, artefacts=${dr.drawing.getArtefacts().length}`);
        for (const art of dr.drawing.getArtefacts()) {
            const layerName = dr.drawing.getLayer(art.layerId)?.name || art.layerId;
            console.log(`    - ${art.data.label || art.sortName} (${art.sortName}) in layer '${layerName}'`);
        }
        const hasSh = dr.drawing.getArtefacts().some(a => a.data.label === "sh");
        const hostHasSh = soHost.getArtefacts().some(a => a.data.label === "sh" && a.layerId === "root");
        console.log(`  Derived drawing contains 'sh' (expected false): ${hasSh}; host root contains 'sh' (expected true): ${hostHasSh}`);
        const hostMonoEdges = soHost.getArtefacts().filter(a => a.dependencies["mono"] === true);
        const hostMono = hostMonoEdges.length === 1 && hostMonoEdges[0].getFlagLayer("mono") === "root"
            ? `${hostMonoEdges[0].data.label}@root`
            : `unexpected (${hostMonoEdges.map(e => `${e.data.label}@${e.getFlagLayer("mono")}`).join(", ")})`;
        console.log(`  Host edges with 'mono' after apply (expected he1@root): ${hostMono}`);
        const derivedMono = dr.drawing.getArtefacts().filter(a => a.dependencies["mono"] === true);
        console.log(`  Derived drawing edges with 'mono' (expected 0): ${derivedMono.length}`);
        drawingStore.saveDrawing(dr.name, dr.drawing);
        console.log("  Saved derived drawing to DrawingStore as '" + dr.name + "'.");
    }
}

// Verify the new rule-structure restriction: a child layer of the root with 2 children is invalid
console.log("--- Rule restriction demo: child of root with 2 children ---");
const badRule = new Drawing(sortStore);
badRule.newArtefact("Vertex", {}, { position: [0, 0], label: "bv0" }, "root");
badRule.addLayer("bad-conclusion", "Bad Conclusion", "root");
badRule.addLayer("bad-a", "Bad A", "root");
badRule.addLayer("bad-b1", "Bad B1", "bad-a");
badRule.addLayer("bad-b2", "Bad B2", "bad-a");
const badCheck = badRule.checkRuleConditions();
console.log("Bad rule (child with 2 children) isRule expected false:", badCheck.isRule, "-", badCheck.reason);
try {
    badRule.setIsRule(true);
    console.log("Bad rule was wrongly accepted as a rule!");
} catch (e) {
    console.log("Caught expected error rejecting bad rule:", (e as Error).message);
}

// Rule matching up to host equalities: two triangles sharing one edge may match
// host triangles whose edges are distinct but provably equal
console.log("--- Matching Up To Equality Demo ---");

function buildTrianglePairHost(
    host: Drawing,
    mode: "shared" | "equal" | "distinct"
): void {
    const mkVertex = (label: string) => host.newArtefact("Vertex", {}, { position: [0, 0], label }, "root");
    const mkEdge = (label: string, source: Artefact, target: Artefact) =>
        host.newArtefact("Edge", { source, target }, { width: 2, bend: 0, label }, "root");

    const v0 = mkVertex("v0");
    const v1 = mkVertex("v1");
    const v2 = mkVertex("v2");
    const v3 = mkVertex("v3");

    const o = mkEdge("o", v0, v1);
    const o2 = mode === "shared" ? o : mkEdge("o2", v0, v1);
    const a1 = mkEdge("a1", v1, v2);
    const a2 = mkEdge("a2", v2, v0);
    const b1 = mkEdge("b1", v1, v3);
    const b2 = mkEdge("b2", v3, v0);

    host.newArtefact("Triangle", { "1": a1, "2": a2, o }, {}, "root");
    host.newArtefact("Triangle", { "1": b1, "2": b2, o: o2 }, {}, "root");

    if (mode === "equal") {
        host.newEqualityArtefact([o, o2], "root");
    }
}

// Rule: two triangles in the root layer sharing the same edge 'pe_o'
const eqMatchRule = new Drawing(sortStore);
buildTrianglePairHost(eqMatchRule, "shared");
eqMatchRule.addLayer("rule-pattern", "Rule Pattern", "root");
eqMatchRule.setIsRule(true);
drawingStore.saveDrawing("SharedEdgeTriangles", eqMatchRule);

// Host A: two triangles whose shared edge is a single artefact
const hostShared = new Drawing(sortStore);
buildTrianglePairHost(hostShared, "shared");

// Host B: two triangles on DISTINCT edges made provably equal
const hostEqualEdges = new Drawing(sortStore);
buildTrianglePairHost(hostEqualEdges, "equal");

// Host C: two triangles on distinct edges that are NOT provably equal
const hostDistinctEdges = new Drawing(sortStore);
buildTrianglePairHost(hostDistinctEdges, "distinct");

const tempEqMatchRule = new Drawing(sortStore);
drawingStore.loadDrawing("SharedEdgeTriangles", tempEqMatchRule);
const eqMatchShared = findRuleApplications(tempEqMatchRule, hostShared);
const eqMatchEqual = findRuleApplications(tempEqMatchRule, hostEqualEdges);
const eqMatchDistinct = findRuleApplications(tempEqMatchRule, hostDistinctEdges);
console.log("SharedEdgeTriangles on host with truly shared edge (expected 2):", eqMatchShared.length);
console.log("SharedEdgeTriangles on host with provably equal edges (expected 2):", eqMatchEqual.length);
console.log("SharedEdgeTriangles on host with distinct edges (expected 0):", eqMatchDistinct.length);

// 7. Render UI Menu & Interaction
let activeDrawingName: string | null = "Rule Drawing Demo";
let inspectedArtefact: Artefact | null = null;

let draftArtefact: {
    sortName: string;
    dependencies: Record<string, Artefact | boolean>;
    data: Record<string, any>;
    layerId: string;
    flagLayers: Record<string, string>;
} | null = null;

let dependencyPickingFor: string | null = null;

function findNextUnfilledDependency(): string | null {
    if (!draftArtefact) return null;
    const sortDef = sortStore.getSort(draftArtefact.sortName);
    if (!sortDef) return null;
    for (const [depKey, expectedSort] of Object.entries(sortDef.dependencies)) {
        if (expectedSort !== "flag" && !draftArtefact.dependencies[depKey]) {
            return depKey;
        }
    }
    return null;
}

let mergeMode: boolean = false;
let mergeFirstArtefact: Artefact | null = null;
let mergeSecondArtefact: Artefact | null = null;
let mergePickingFor: "first" | "second" | null = null;
let mergeHoverArtefact: Artefact | null = null;

function startMergeMode(preselectFirst: Artefact | null = null): void {
    draftArtefact = null;
    dependencyPickingFor = null;
    mergeHoverArtefact = null;
    stopPositionPicker();

    mergeMode = true;
    if (preselectFirst && drawing.getArtefacts().includes(preselectFirst)) {
        mergeFirstArtefact = preselectFirst;
        mergeSecondArtefact = null;
        mergePickingFor = "second";
    } else {
        mergeFirstArtefact = null;
        mergeSecondArtefact = null;
        mergePickingFor = "first";
    }

    renderMenu();
    renderInspector();
    updateCanvas();
}

function cancelMergeMode(): void {
    mergeMode = false;
    mergeFirstArtefact = null;
    mergeSecondArtefact = null;
    mergePickingFor = null;
    mergeHoverArtefact = null;
    renderMenu();
    renderInspector();
    updateCanvas();
}

function updateActiveDrawingBanner(): void {
    const nameEl = document.getElementById("active-drawing-name");
    const tagEl = document.getElementById("active-drawing-rule-tag");
    if (nameEl) {
        nameEl.textContent = activeDrawingName || "Unsaved Drawing";
    }

    if (tagEl) {
        if (drawing.isRule) {
            const ruleCheck = drawing.checkRuleConditions();
            if (!ruleCheck.isRule) {
                tagEl.innerHTML = `<span class="rule-badge rule-badge-invalid" title="${ruleCheck.reason}">Rule (invalid)</span>`;
            } else if (drawingStore.checkIsFirstOrder(drawing)) {
                tagEl.innerHTML = `<span class="first-order-badge" title="First-order rule: root layer has only one child">First-Order Rule</span>`;
            } else {
                tagEl.innerHTML = `<span class="second-order-badge" title="Second-order rule: root layer has several child layers">Second-Order Rule</span>`;
            }
        } else {
            tagEl.innerHTML = "";
        }
    }

    const ruleCheckbox = document.getElementById("mark-rule-checkbox") as HTMLInputElement | null;
    if (ruleCheckbox) {
        ruleCheckbox.checked = drawing.isRule;
    }
}

function mergeBaseOpacity(art: Artefact): number {
    if (art === mergeFirstArtefact || art === mergeSecondArtefact) {
        return 1.0;
    }
    if (mergeFirstArtefact && drawing.areDependenciesEqual(mergeFirstArtefact, art)) {
        return drawing.areProvablyEqual(mergeFirstArtefact, art) ? 1.0 : 0.85;
    }
    if (!mergeFirstArtefact) {
        return 0.85;
    }
    return 0.35;
}

function mergeCanvasOpacity(art: Artefact, hoveredSet: Set<Artefact> | null): number {
    return hoveredSet && hoveredSet.has(art) ? 1.0 : (hoveredSet ? 0.5 : mergeBaseOpacity(art));
}

function updateCanvas(): void {
    svgContext.selectAll("*").remove();
    drawing.draw(svgContext);
    updateActiveDrawingBanner();

    if (draftArtefact) {
        const sortDef = sortStore.getSort(draftArtefact.sortName);
        if (sortDef) {
            let canPreview = true;

            for (const [depKey, expectedSort] of Object.entries(sortDef.dependencies)) {
                if (expectedSort !== "flag") {
                    if (!draftArtefact.dependencies[depKey]) {
                        canPreview = false;
                        break;
                    }
                }
            }

            for (const [attrName, _] of Object.entries(sortDef.attributes)) {
                if (draftArtefact.data[attrName] === undefined) {
                    canPreview = false;
                    break;
                }
            }

            if (canPreview) {
                try {
                    const tempArt = new Artefact(
                        draftArtefact.sortName,
                        draftArtefact.dependencies,
                        draftArtefact.data,
                        sortDef.drawFunction,
                        draftArtefact.layerId
                    );
                    tempArt.flagLayers = { ...draftArtefact.flagLayers };
                    tempArt.draw(svgContext);
                    if (tempArt.svgElement) {
                        tempArt.svgElement.attr("opacity", 0.7);
                    }
                } catch (e) {
                    // Ignore preview errors if draft incomplete
                }
            }
        }
    }

    renderRuleApplications();

    if (mergeMode) {
        const hoveredSet = mergeHoverArtefact ? mergeHoverArtefact.getSelfAndDependencies() : null;
        for (const art of drawing.getArtefacts()) {
            if (art.svgElement) {
                art.svgElement.attr("opacity", mergeCanvasOpacity(art, hoveredSet));
            }
        }
    }
}

const layerProvability = new Map<string, { provable: boolean; reason: string }>();

function renderLayersTree(): void {
    const container = document.getElementById("layers-content");
    if (!container) return;
    container.innerHTML = "";

    const allLayers = drawing.getAllLayers();
    const focusedId = drawing.getFocusedLayerId();
    const rootLayers = allLayers.filter(l => l.parentId === null);

    function buildLayerDOM(layer: Layer): HTMLElement {
        const itemDiv = document.createElement("div");
        itemDiv.className = `layer-item ${layer.parentId === null ? "root-layer" : ""}`;

        const isEffectivelyVisible = drawing.isLayerVisible(layer.id);

        const rowDiv = document.createElement("div");
        rowDiv.className = `layer-row ${focusedId === layer.id ? "focused" : ""} ${!isEffectivelyVisible ? "layer-hidden" : ""}`;

        const titleSpan = document.createElement("span");
        titleSpan.className = "layer-title";
        titleSpan.textContent = layer.name;
        titleSpan.title = `ID: ${layer.id}${!isEffectivelyVisible ? " (hidden)" : ""}`;

        const headerDiv = document.createElement("div");
        headerDiv.className = "layer-row-header";

        const actionsDiv = document.createElement("div");
        actionsDiv.className = "layer-row-actions";

        const hideBtn = document.createElement("button");
        hideBtn.className = `layer-btn hide-btn ${!layer.visible ? "active" : ""}`;
        hideBtn.textContent = layer.visible ? "Hide" : "Show";
        hideBtn.title = layer.visible
            ? (isEffectivelyVisible ? "Hide this layer on canvas" : "Hide layer (hidden by parent)")
            : "Show this layer on canvas";
        hideBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            layer.visible = !layer.visible;
            updateCanvas();
            renderLayersTree();
            renderMenu();
        });

        const focusBtn = document.createElement("button");
        focusBtn.className = `layer-btn focus-btn ${focusedId === layer.id ? "active" : ""}`;
        focusBtn.textContent = focusedId === layer.id ? "Focusing" : "Focus";
        focusBtn.title = "Focus on this layer (dims other layers to 50% opacity)";
        focusBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            if (focusedId === layer.id) {
                drawing.setFocusedLayer(null);
            } else {
                drawing.setFocusedLayer(layer.id);
            }
            updateCanvas();
            renderLayersTree();
            renderMenu();
        });

        const colorCheckbox = document.createElement("input");
        colorCheckbox.type = "checkbox";
        colorCheckbox.checked = layer.colorEnabled;
        colorCheckbox.title = "Toggle partial layer color";
        colorCheckbox.addEventListener("change", (e) => {
            layer.colorEnabled = (e.target as HTMLInputElement).checked;
            updateCanvas();
            renderLayersTree();
        });

        const colorInput = document.createElement("input");
        colorInput.type = "color";
        colorInput.className = "layer-color-input";
        colorInput.value = layer.color;
        colorInput.title = "Choose layer color";
        colorInput.addEventListener("change", (e) => {
            layer.color = (e.target as HTMLInputElement).value;
            layer.colorEnabled = true;
            colorCheckbox.checked = true;
            updateCanvas();
            renderLayersTree();
        });

        const addChildBtn = document.createElement("button");
        addChildBtn.className = "layer-btn";
        addChildBtn.textContent = "+ Child";
        addChildBtn.title = `Add a child layer above '${layer.name}'`;
        addChildBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            const childName = prompt(`Enter name for child layer above '${layer.name}':`, `Child of ${layer.name}`);
            if (childName && childName.trim()) {
                const childId = `layer-${Date.now().toString(36)}`;
                const randomColor = `#${Math.floor(Math.random()*16777215).toString(16).padStart(6, '0')}`;
                drawing.addLayer(childId, childName.trim(), layer.id, randomColor, true);
                updateCanvas();
                renderLayersTree();
                renderInspector();
            }
        });

        const deleteBtn = document.createElement("button");
        deleteBtn.className = "layer-btn";
        deleteBtn.style.color = "#e74c3c";
        deleteBtn.textContent = "×";
        deleteBtn.title = "Delete layer and all its child layers & artefacts";
        deleteBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            const descendants = drawing.getDescendants(layer.id);
            const msg = descendants.size > 1 
                ? `Delete '${layer.name}' and its ${descendants.size - 1} child layer(s)? All associated artefacts will be removed!`
                : `Delete layer '${layer.name}'?`;
            if (confirm(msg)) {
                drawing.removeLayer(layer.id);
                updateCanvas();
                renderLayersTree();
                renderMenu();
                renderInspector();
            }
        });

        headerDiv.appendChild(titleSpan);

        const provableResult = layerProvability.get(layer.id);
        if (provableResult) {
            const provableBadge = document.createElement("span");
            provableBadge.className = `provable-badge ${provableResult.provable ? "provable-ok" : "provable-fail"}`;
            provableBadge.textContent = provableResult.provable ? "✓" : "✗";
            provableBadge.title = provableResult.provable
                ? "Provable: all artefacts in this layer are already in its parent layer"
                : `Not provable: ${provableResult.reason}`;
            headerDiv.appendChild(provableBadge);
        }

        const provableBtn = document.createElement("button");
        if (layer.parentId !== null) {
            provableBtn.className = "layer-btn provable-btn";
            provableBtn.textContent = "Prove";
            provableBtn.title = "Check if all artefacts in this layer are already in its parent layer";
            provableBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                try {
                    const result = drawing.checkLayerProvable(layer.id);
                    layerProvability.set(layer.id, { provable: result.provable, reason: result.reason ?? "" });
                    renderLayersTree();
                } catch (err) {
                    alert((err as Error).message);
                }
            });
        } else {
            provableBtn.style.display = "none";
        }
        actionsDiv.appendChild(hideBtn);
        actionsDiv.appendChild(focusBtn);
        actionsDiv.appendChild(provableBtn);
        actionsDiv.appendChild(colorCheckbox);
        actionsDiv.appendChild(colorInput);
        actionsDiv.appendChild(addChildBtn);
        actionsDiv.appendChild(deleteBtn);
        rowDiv.appendChild(headerDiv);
        rowDiv.appendChild(actionsDiv);
        itemDiv.appendChild(rowDiv);

        const children = allLayers.filter(l => l.parentId === layer.id);
        if (children.length > 0) {
            const childrenContainer = document.createElement("div");
            childrenContainer.className = "layer-children";
            for (const child of children) {
                childrenContainer.appendChild(buildLayerDOM(child));
            }
            itemDiv.appendChild(childrenContainer);
        }

        return itemDiv;
    }

    for (const rootL of rootLayers) {
        container.appendChild(buildLayerDOM(rootL));
    }
}

const addRootLayerBtn = document.getElementById("add-root-layer-btn");
if (addRootLayerBtn) {
    addRootLayerBtn.addEventListener("click", () => {
        const name = prompt("Enter name for new root layer:", "New Root Layer");
        if (name && name.trim()) {
            const id = `layer-${Date.now().toString(36)}`;
            drawing.addLayer(id, name.trim(), null, "#9b59b6", true);
            updateCanvas();
            renderLayersTree();
            renderInspector();
        }
    });
}

function renderMenu(): void {
    const menuContent = document.getElementById("menu-content");
    if (!menuContent) return;
    
    menuContent.innerHTML = "";
    const allArtefacts = drawing.getArtefacts();
    
    const uiNodeMap = new Map<Artefact, HTMLElement[]>();
    for (const art of allArtefacts) {
        uiNodeMap.set(art, []);
    }
    
    const grouped = allArtefacts.reduce((acc, artefact) => {
        if (!acc[artefact.sortName]) acc[artefact.sortName] = [];
        acc[artefact.sortName].push(artefact);
        return acc;
    }, {} as Record<string, typeof allArtefacts>);

    function applyOpacities(target: Artefact | null) {
        if (mergeMode) {
            const hoveredSet = mergeHoverArtefact ? mergeHoverArtefact.getSelfAndDependencies() : null;
            for (const art of allArtefacts) {
                if (art.svgElement) {
                    art.svgElement.attr("opacity", mergeCanvasOpacity(art, hoveredSet));
                }

                const uiEls = uiNodeMap.get(art);
                if (uiEls) {
                    const treeOpacity = mergeBaseOpacity(art);
                    for (const el of uiEls) {
                        el.style.opacity = treeOpacity.toString();
                    }
                }
            }
            return;
        }

        if (!target) {
            for (const art of allArtefacts) {
                if (art.svgElement) {
                    art.svgElement.attr("opacity", 1);
                }
                const uiEls = uiNodeMap.get(art);
                if (uiEls) {
                    for (const el of uiEls) {
                        el.style.opacity = "1";
                    }
                }
            }
            return;
        }

        const activeSet = target.getSelfAndDependencies();
        for (const art of allArtefacts) {
            const isActive = activeSet.has(art);
            const opacity = isActive ? 1 : 0.5;

            if (art.svgElement) {
                art.svgElement.attr("opacity", opacity);
            }

            const uiEls = uiNodeMap.get(art);
            if (uiEls) {
                for (const el of uiEls) {
                    el.style.opacity = opacity.toString();
                }
            }
        }
    }

    function buildTreeNode(artefact: Artefact, dependencyKey?: string, isTagGroupCtx?: string, parentArtefact?: Artefact): HTMLElement {
        const nodeDiv = document.createElement("div");
        nodeDiv.className = "tree-node";
        
        if (!artefact || !artefact.data) {
            const errorSpan = document.createElement("span");
            errorSpan.className = "node-label";
            errorSpan.textContent = `${dependencyKey ? dependencyKey + ': ' : ''}Invalid Artefact`;
            errorSpan.style.color = "red";
            nodeDiv.appendChild(errorSpan);
            return nodeDiv;
        }

        const headerDiv = document.createElement("div");
        headerDiv.className = "node-header";
        
        const toggleIcon = document.createElement("span");
        toggleIcon.className = "toggle-icon";
        
        const labelSpan = document.createElement("span");
        labelSpan.className = "node-label";
        
        let artefactLabel = artefact.data.label;
        if (!artefactLabel) {
            if (artefact.sortName === "Equality") {
                const children = artefact instanceof EqualityArtefact
                    ? artefact.children
                    : Object.values(artefact.dependencies).filter((v): v is Artefact => typeof v !== "boolean");
                artefactLabel = children.map(c => c.data.label || c.sortName).join(" = ");
            } else {
                artefactLabel = "(unnamed)";
            }
        }

        if (artefact.sortName === "Equality") {
            const children = artefact instanceof EqualityArtefact
                ? artefact.children
                : Object.values(artefact.dependencies).filter((v): v is Artefact => typeof v !== "boolean");
            if (children.length > 0) {
                artefactLabel += ` [${children[0].sortName}]`;
            }
        }
        
        const activeFlags = Object.entries(artefact.dependencies)
            .filter(([_, val]) => val === true)
            .map(([key]) => {
                const flagLayerId = artefact.getFlagLayer(key);
                if (flagLayerId === artefact.layerId) return key;
                const flagLayer = drawing.getLayer(flagLayerId);
                return `${key}@${flagLayer ? flagLayer.name : flagLayerId}`;
            });
            
        if (activeFlags.length > 0) {
            artefactLabel += ` (${activeFlags.join(", ")})`;
        }

        const prefix = dependencyKey ? `${dependencyKey}: ` : "";
        labelSpan.textContent = `${prefix}${artefactLabel}`;

        const layerObj = drawing.getLayer(artefact.layerId);
        const layerBadge = document.createElement("span");
        layerBadge.className = "layer-badge";
        const isLayerVis = layerObj ? drawing.isLayerVisible(layerObj.id) : true;
        layerBadge.textContent = layerObj ? layerObj.name + (isLayerVis ? "" : " (hidden)") : artefact.layerId;
        if (!isLayerVis) {
            layerBadge.style.backgroundColor = "#f5b7b1";
            layerBadge.style.color = "#78281f";
        }
        
        const removeBtn = document.createElement("span");
        removeBtn.className = "remove-btn";
        removeBtn.textContent = "×";
        removeBtn.title = isTagGroupCtx ? `Remove tag '${isTagGroupCtx}'` : "Remove artefact";

        const isProvablyEqualCandidate = mergeMode && !!mergeFirstArtefact && artefact !== mergeFirstArtefact
            && drawing.areDependenciesEqual(mergeFirstArtefact, artefact)
            && drawing.areProvablyEqual(mergeFirstArtefact, artefact);

        headerDiv.appendChild(toggleIcon);
        headerDiv.appendChild(labelSpan);
        headerDiv.appendChild(layerBadge);
        if (isProvablyEqualCandidate) {
            const eqBadge = document.createElement("span");
            eqBadge.className = "eq-badge";
            eqBadge.textContent = "≡";
            eqBadge.title = "Provably equal (via equality artefacts)";
            headerDiv.appendChild(eqBadge);
        }
        headerDiv.appendChild(removeBtn);
        nodeDiv.appendChild(headerDiv);

        const uiNodes = uiNodeMap.get(artefact);
        if (uiNodes) {
            uiNodes.push(nodeDiv);
        }

        if (isProvablyEqualCandidate) {
            nodeDiv.classList.add("provably-equal");
        }

        if (inspectedArtefact === artefact || (mergeMode && (mergeFirstArtefact === artefact || mergeSecondArtefact === artefact))) {
            nodeDiv.classList.add("inspected");
        }

        removeBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            if (isTagGroupCtx) {
                delete artefact.dependencies[isTagGroupCtx];
            } else if (parentArtefact && parentArtefact.sortName === "Equality") {
                drawing.removeEqualityChild(parentArtefact, artefact);
            } else {
                drawing.removeArtefact(artefact);
            }
            updateCanvas();
            renderMenu();
        });

        labelSpan.addEventListener("click", (e) => {
            e.stopPropagation();

            if (mergeMode) {
                mergeHoverArtefact = null;
                if (mergePickingFor === "first" || !mergeFirstArtefact) {
                    mergeFirstArtefact = artefact;
                    if (mergeSecondArtefact === artefact) {
                        mergeSecondArtefact = null;
                    }
                    mergePickingFor = "second";
                    renderMenu();
                    renderInspector();
                    updateCanvas();
                } else if (mergePickingFor === "second" || mergeFirstArtefact) {
                    if (artefact === mergeFirstArtefact) {
                        alert("Cannot merge an artefact with itself.");
                    } else if (!drawing.areDependenciesEqual(mergeFirstArtefact, artefact)) {
                        alert(`Cannot merge: Artefact '${artefact.data.label || artefact.sortName}' does not have matching dependencies.`);
                    } else {
                        mergeSecondArtefact = artefact;
                        mergePickingFor = null;
                        renderMenu();
                        renderInspector();
                        updateCanvas();
                    }
                }
                return;
            }

            if (dependencyPickingFor && draftArtefact) {
                if (draftArtefact.sortName === "Equality") {
                    const existingItems = Object.values(draftArtefact.dependencies).filter((v): v is Artefact => typeof v !== "boolean");
                    if (existingItems.length > 0 && existingItems[0].sortName !== artefact.sortName) {
                        alert(`Equality artefact requires all elements to be of sort '${existingItems[0].sortName}', but selected '${artefact.sortName}'.`);
                    } else {
                        const nextIdx = Object.keys(draftArtefact.dependencies).length;
                        draftArtefact.dependencies[`${nextIdx}`] = artefact;
                        renderMenu();
                        renderInspector();
                        updateCanvas();
                    }
                } else {
                    const sortDef = sortStore.getSort(draftArtefact.sortName);
                    const expectedSort = sortDef?.dependencies[dependencyPickingFor];

                    if (expectedSort && artefact.sortName === expectedSort) {
                        draftArtefact.dependencies[dependencyPickingFor] = artefact;
                        dependencyPickingFor = findNextUnfilledDependency();
                        renderMenu();
                        renderInspector();
                        updateCanvas();
                    } else {
                        alert(`Expected sort '${expectedSort}', but selected '${artefact.sortName}'.`);
                    }
                }
                return;
            }

            if (inspectedArtefact === artefact) {
                inspectedArtefact = null;
            } else {
                inspectedArtefact = artefact;
                draftArtefact = null;
                dependencyPickingFor = null;
                stopPositionPicker();
            }
            renderMenu();
            renderInspector();
        });

        headerDiv.addEventListener("mouseenter", (e) => {
            e.stopPropagation();
            if (mergeMode) {
                mergeHoverArtefact = artefact;
                applyOpacities(null);
                return;
            }
            applyOpacities(artefact);
        });

        headerDiv.addEventListener("mouseleave", (e) => {
            e.stopPropagation();
            if (mergeMode) {
                mergeHoverArtefact = null;
                applyOpacities(null);
                return;
            }
            applyOpacities(inspectedArtefact);
        });

        const depEntries = Object.entries(artefact.dependencies).filter(
            ([_, depArt]) => typeof depArt !== "boolean"
        ) as [string, Artefact][];

        const flagEntries = Object.entries(artefact.dependencies).filter(
            ([_, val]) => val === true
        );
        
        if (depEntries.length === 0 && flagEntries.length === 0) {
            nodeDiv.classList.add("empty");
        } else {
            const childrenDiv = document.createElement("div");
            childrenDiv.className = "node-children";
            
            for (const [key, depArt] of depEntries) {
                const childNode = buildTreeNode(depArt, key, undefined, artefact);
                childrenDiv.appendChild(childNode);
            }

            for (const [flagKey, _] of flagEntries) {
                const flagNodeDiv = document.createElement("div");
                flagNodeDiv.className = "tree-node empty";

                const flagHeaderDiv = document.createElement("div");
                flagHeaderDiv.className = "node-header";

                const flagIcon = document.createElement("span");
                flagIcon.className = "toggle-icon";

                const flagLabelSpan = document.createElement("span");
                flagLabelSpan.className = "node-label";
                flagLabelSpan.textContent = flagKey;

                const flagRemoveBtn = document.createElement("span");
                flagRemoveBtn.className = "remove-btn";
                flagRemoveBtn.textContent = "×";
                flagRemoveBtn.title = `Remove tag '${flagKey}'`;

                flagHeaderDiv.appendChild(flagIcon);
                flagHeaderDiv.appendChild(flagLabelSpan);
                flagHeaderDiv.appendChild(flagRemoveBtn);
                flagNodeDiv.appendChild(flagHeaderDiv);

                flagRemoveBtn.addEventListener("click", (e) => {
                    e.stopPropagation();
                    delete artefact.dependencies[flagKey];
                    updateCanvas();
                    renderMenu();
                });

                childrenDiv.appendChild(flagNodeDiv);
            }

            nodeDiv.appendChild(childrenDiv);

            toggleIcon.addEventListener("click", (e) => {
                e.stopPropagation();
                nodeDiv.classList.toggle("expanded");
            });
        }

        return nodeDiv;
    }

    const focusedId = drawing.getFocusedLayerId();

    for (const sortDef of sortStore.getAllSorts()) {
        const artefacts = grouped[sortDef.name] || [];
        const topLevelArtefacts = focusedId 
            ? artefacts.filter(art => art.layerId === focusedId) 
            : artefacts;

        const groupHeader = document.createElement("h3");
        
        const titleSpan = document.createElement("span");
        titleSpan.textContent = `${sortDef.name} (${topLevelArtefacts.length})`;
        
        const addBtn = document.createElement("button");
        addBtn.className = "add-sort-btn";
        addBtn.textContent = "+";
        addBtn.title = `Add new ${sortDef.name}`;
        
        addBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            inspectedArtefact = null;
            mergeMode = false;
            mergeFirstArtefact = null;
            mergeSecondArtefact = null;
            mergePickingFor = null;
            mergeHoverArtefact = null;

            const initialData: Record<string, any> = {};
            for (const [attrName, expectedType] of Object.entries(sortDef.attributes)) {
                if (expectedType === "position") {
                    initialData[attrName] = [300, 300];
                } else if (expectedType === "number") {
                    initialData[attrName] = attrName === "bend" ? 0 : 2;
                } else if (expectedType === "boolean") {
                    initialData[attrName] = false;
                } else if (expectedType === "string") {
                    initialData[attrName] = "";
                }
            }

            const defaultLayerId = focusedId || (drawing.getAllLayers().length > 0 ? drawing.getAllLayers()[0].id : "root");

            draftArtefact = {
                sortName: sortDef.name,
                dependencies: {},
                data: initialData,
                layerId: defaultLayerId,
                flagLayers: {}
            };
            dependencyPickingFor = null;

            stopPositionPicker();

            const singlePositionAttr = getSinglePositionAttr(sortDef);
            if (singlePositionAttr) {
                activePositionPicker = {
                    artefact: { data: draftArtefact!.data } as Artefact,
                    attrName: singlePositionAttr,
                    inputX: null,
                    inputY: null,
                    pickBtn: null
                };
                d3.select("body").style("cursor", "crosshair");
            }

            renderMenu();
            renderInspector();
            updateCanvas();
        });

        groupHeader.appendChild(titleSpan);
        groupHeader.appendChild(addBtn);
        menuContent.appendChild(groupHeader);

        for (const art of topLevelArtefacts) {
            const rootNode = buildTreeNode(art);
            rootNode.classList.add("root-node");
            menuContent.appendChild(rootNode);
        }
    }

    const tagGroups: Record<string, Artefact[]> = {};
    for (const artefact of allArtefacts) {
        for (const [key, val] of Object.entries(artefact.dependencies)) {
            if (val === true) {
                if (!tagGroups[key]) tagGroups[key] = [];
                tagGroups[key].push(artefact);
            }
        }
    }

    for (const [tagName, artefacts] of Object.entries(tagGroups)) {
        const topLevelTagArtefacts = focusedId 
            ? artefacts.filter(art => art.layerId === focusedId || art.getEffectiveFlagLayers().has(focusedId))
            : artefacts;

        if (topLevelTagArtefacts.length === 0 && focusedId) {
            continue;
        }

        const groupHeader = document.createElement("h3");
        groupHeader.textContent = `${tagName} (${topLevelTagArtefacts.length})`;
        menuContent.appendChild(groupHeader);

        for (const art of topLevelTagArtefacts) {
            const rootNode = buildTreeNode(art, undefined, tagName);
            rootNode.classList.add("root-node");
            menuContent.appendChild(rootNode);
        }
    }

    applyOpacities(inspectedArtefact);
}

function renderDrawingsStore(): void {
    const container = document.getElementById("drawings-content");
    if (!container) return;
    container.innerHTML = "";

    const exportSelectAll = document.getElementById("export-select-all") as HTMLInputElement | null;
    if (exportSelectAll) {
        exportSelectAll.checked = false;
    }

    const drawings = drawingStore.getAllDrawings();

    if (drawings.length === 0) {
        const emptyMsg = document.createElement("div");
        emptyMsg.style.color = "#888";
        emptyMsg.style.fontStyle = "italic";
        emptyMsg.style.fontSize = "0.8rem";
        emptyMsg.style.marginTop = "4px";
        emptyMsg.textContent = "No drawings saved yet.";
        container.appendChild(emptyMsg);
        return;
    }

    for (const savedDrawing of drawings) {
        const isActive = savedDrawing.name === activeDrawingName;
        const rowDiv = document.createElement("div");
        rowDiv.className = `drawing-row${isActive ? " active" : ""}${savedDrawing.isFirstOrder ? " first-order" : ""}`;

        const titleSpan = document.createElement("span");
        titleSpan.className = "drawing-title";
        titleSpan.textContent = savedDrawing.name;
        titleSpan.title = `Drawing: ${savedDrawing.name} (${savedDrawing.layers.length} layers, ${savedDrawing.artefacts.length} artefacts)${savedDrawing.isRule ? (savedDrawing.isFirstOrder ? ' [First-Order Rule]' : ' [Rule]') : ''}`;

        const headerDiv = document.createElement("div");
        headerDiv.className = "drawing-row-header";

        const actionsDiv = document.createElement("div");
        actionsDiv.className = "drawing-row-actions";

        const exportCheckbox = document.createElement("input");
        exportCheckbox.type = "checkbox";
        exportCheckbox.className = "export-checkbox";
        exportCheckbox.dataset.drawingName = savedDrawing.name;
        exportCheckbox.title = `Include '${savedDrawing.name}' in the next export`;
        exportCheckbox.addEventListener("change", () => {
            if (exportSelectAll) {
                const checkboxes = Array.from(container.querySelectorAll<HTMLInputElement>(".export-checkbox"));
                exportSelectAll.checked = checkboxes.length > 0 && checkboxes.every(cb => cb.checked);
            }
        });
        headerDiv.appendChild(exportCheckbox);
        headerDiv.appendChild(titleSpan);

        if (isActive) {
            const activeBadge = document.createElement("span");
            activeBadge.className = "active-badge";
            activeBadge.textContent = "Editing";
            activeBadge.title = "Currently active on canvas";
            headerDiv.appendChild(activeBadge);
        }

        if (savedDrawing.isRule) {
            const badge = document.createElement("span");
            if (savedDrawing.isFirstOrder) {
                badge.className = "first-order-badge";
                badge.textContent = "First-Order";
                badge.title = "First-order rule: root layer has only one child";
            } else {
                badge.className = "second-order-badge";
                badge.textContent = "Second-Order";
                badge.title = "Second-order rule: root layer has several child layers";
            }
            headerDiv.appendChild(badge);
        }

        const loadBtn = document.createElement("button");
        loadBtn.className = "layer-btn";
        loadBtn.textContent = "Load";
        loadBtn.title = `Load drawing '${savedDrawing.name}' to edit further`;
        loadBtn.addEventListener("click", () => {
            if (confirm(`Load drawing '${savedDrawing.name}'? Unsaved canvas changes will be overwritten.`)) {
                try {
                    drawingStore.loadDrawing(savedDrawing.name, drawing);
                    activeDrawingName = savedDrawing.name;
                    layerProvability.clear();
                    inspectedArtefact = null;
                    draftArtefact = null;
                    dependencyPickingFor = null;
                    stopPositionPicker();
                    updateCanvas();
                    renderLayersTree();
                    renderMenu();
                    renderInspector();
                    renderDrawingsStore();
                } catch (err) {
                    alert(`Error loading drawing:\n${(err as Error).message}`);
                }
            }
        });

        const ruleToggleBtn = document.createElement("button");
        ruleToggleBtn.className = "layer-btn";
        if (savedDrawing.isRule) {
            ruleToggleBtn.textContent = "Unmark Rule";
            ruleToggleBtn.title = "Remove the explicit rule marking from this drawing";
        } else {
            ruleToggleBtn.textContent = "Mark Rule";
            ruleToggleBtn.title = "Explicitly mark this drawing as a rule (must satisfy rule conditions)";
        }
        ruleToggleBtn.addEventListener("click", () => {
            const newRuleState = !savedDrawing.isRule;
            try {
                if (savedDrawing.name === activeDrawingName) {
                    drawing.setIsRule(newRuleState);
                }
                drawingStore.markAsRule(savedDrawing.name, newRuleState);
                updateActiveDrawingBanner();
                renderDrawingsStore();
            } catch (err) {
                alert((err as Error).message);
            }
        });

        const deleteBtn = document.createElement("button");
        deleteBtn.className = "layer-btn";
        deleteBtn.style.color = "#e74c3c";
        deleteBtn.textContent = "×";
        deleteBtn.title = `Delete drawing '${savedDrawing.name}'`;
        deleteBtn.addEventListener("click", () => {
            if (savedDrawing.name === activeDrawingName) {
                activeDrawingName = null;
            }
            drawingStore.deleteDrawing(savedDrawing.name);
            updateActiveDrawingBanner();
            renderDrawingsStore();
        });

        actionsDiv.appendChild(loadBtn);
        actionsDiv.appendChild(ruleToggleBtn);
        actionsDiv.appendChild(deleteBtn);
        rowDiv.appendChild(headerDiv);
        rowDiv.appendChild(actionsDiv);
        container.appendChild(rowDiv);
    }

    renderRuleApplications();
}

function renderRuleApplications(): void {
    const container = document.getElementById("rules-content");
    if (!container) return;
    container.innerHTML = "";

    const rules = drawingStore.getAllDrawings().filter(d => d.isRule);
    if (rules.length === 0) {
        const emptyMsg = document.createElement("div");
        emptyMsg.style.color = "#888";
        emptyMsg.style.fontStyle = "italic";
        emptyMsg.style.fontSize = "0.8rem";
        emptyMsg.style.marginTop = "4px";
        emptyMsg.textContent = "No rules saved yet.";
        container.appendChild(emptyMsg);
        return;
    }

    let applicationCount = 0;

    for (const savedRule of rules) {
        let ruleDrawing: Drawing;
        try {
            ruleDrawing = new Drawing(sortStore);
            drawingStore.loadDrawing(savedRule.name, ruleDrawing);
        } catch {
            continue;
        }

        let applications: ReturnType<typeof findRuleApplications>;
        try {
            applications = savedRule.isFirstOrder
                ? findFirstOrderRuleApplications(ruleDrawing, drawing)
                : findSecondOrderRuleApplications(ruleDrawing, drawing);
        } catch {
            continue;
        }

        const ruleRootId = ruleDrawing.getAllLayers().find(l => l.parentId === null)?.id;
        const patternArts: Artefact[] = ruleRootId
            ? ruleDrawing.getArtefacts().filter(a => a.sortName !== "Equality" && a.layerId === ruleRootId)
            : ruleDrawing.getArtefacts().filter(a => a.sortName !== "Equality");
        const dependedOn = new Set<Artefact>();
        for (const a of patternArts) {
            for (const dep of Object.values(a.dependencies)) {
                if (typeof dep !== "boolean") {
                    dependedOn.add(dep);
                }
            }
        }
        const topLevel = patternArts.filter(a => !dependedOn.has(a));
        const matchArtefacts = topLevel.length > 0 ? topLevel : patternArts;

        for (const app of applications) {
            applicationCount++;

            const rowDiv = document.createElement("div");
            rowDiv.className = `rule-app-row${savedRule.isFirstOrder ? " first-order" : " second-order"}`;

            const nameSpan = document.createElement("div");
            nameSpan.className = "rule-app-name";
            nameSpan.textContent = savedRule.name;

            if (savedRule.isFirstOrder) {
                const badge = document.createElement("span");
                badge.className = "first-order-badge";
                badge.textContent = "First-Order";
                badge.title = "First-order rule: root layer has only one child";
                nameSpan.appendChild(badge);
            } else {
                const badge = document.createElement("span");
                badge.className = "second-order-badge";
                badge.textContent = "Second-Order";
                badge.title = "Second-order rule: root layer has several child layers";
                nameSpan.appendChild(badge);
            }

            const labels: string[] = [];
            for (const a of matchArtefacts) {
                const img = app.matchedArtefacts.get(a);
                if (img) {
                    labels.push(img.data.label || img.sortName);
                }
            }

            const matchSpan = document.createElement("div");
            matchSpan.className = "rule-app-match";
            matchSpan.textContent = labels.length > 0 ? labels.join(", ") : "(no labelled artefacts)";

            rowDiv.appendChild(nameSpan);
            rowDiv.appendChild(matchSpan);

            const applyBtn = document.createElement("button");
            applyBtn.className = "apply-btn";
            applyBtn.textContent = "Apply";
            applyBtn.title = savedRule.isFirstOrder
                ? "Apply this first-order rule to the matched artefacts"
                : "Apply this second-order rule to the matched artefacts";
            applyBtn.addEventListener("click", (ev) => {
                ev.stopPropagation();
                try {
                    if (savedRule.isFirstOrder) {
                        const created = applyFirstOrderRule(ruleDrawing, drawing, app);
                        console.log(`Applied '${savedRule.name}': added ${created.length} artefact(s).`);
                    } else {
                        const result = applySecondOrderRule(ruleDrawing, drawing, app, { hostName: activeDrawingName ?? "Unsaved Drawing", ruleName: savedRule.name });
                        console.log(`Applied '${savedRule.name}': added ${result.hostArtefacts.length} artefact(s), derived ${result.derivedRules.length} drawing(s).`);
                        const createdNames: string[] = [];
                        for (const derived of result.derivedRules) {
                            let name = derived.name;
                            let suffix = 2;
                            while (drawingStore.getDrawing(name)) {
                                name = `${derived.name} (${suffix})`;
                                suffix++;
                            }
                            drawingStore.saveDrawing(name, derived.drawing);
                            createdNames.push(name);
                            console.log(`Saved derived drawing '${name}': isRule=${derived.drawing.isRule}, artefacts=${derived.drawing.getArtefacts().length}.`);
                        }
                        alert(`Applied rule '${savedRule.name}': added ${result.hostArtefacts.length} artefact(s) and created ${createdNames.length} derived drawing(s):\n- ${createdNames.join("\n- ")}`);
                    }
                    updateCanvas();
                    renderMenu();
                    renderInspector();
                    renderLayersTree();
                    renderDrawingsStore();
                    renderRuleApplications();
                } catch (err) {
                    alert(`Error applying rule '${savedRule.name}':\n${(err as Error).message}`);
                }
            });
            rowDiv.appendChild(applyBtn);

            const activeSet = app.hostArtefacts;

            rowDiv.addEventListener("mouseenter", () => {
                if (mergeMode) return;
                for (const art of drawing.getArtefacts()) {
                    const opacity = activeSet.has(art) ? 1 : 0.5;
                    if (art.svgElement) {
                        art.svgElement.attr("opacity", opacity);
                    }
                }
            });

            rowDiv.addEventListener("mouseleave", () => {
                for (const art of drawing.getArtefacts()) {
                    if (art.svgElement) {
                        art.svgElement.attr("opacity", 1);
                    }
                }
            });

            container.appendChild(rowDiv);
        }
    }

    if (applicationCount === 0) {
        const emptyMsg = document.createElement("div");
        emptyMsg.style.color = "#888";
        emptyMsg.style.fontStyle = "italic";
        emptyMsg.style.fontSize = "0.8rem";
        emptyMsg.style.marginTop = "4px";
        emptyMsg.textContent = "No applyable rules.";
        container.appendChild(emptyMsg);
    }
}

// Refresh Applyable Rules Button Listener
const refreshRulesBtn = document.getElementById("refresh-rules-btn");
if (refreshRulesBtn) {
    refreshRulesBtn.addEventListener("click", () => {
        renderRuleApplications();
    });
}

// Merge Artefacts Button Listener
const mergeArtefactsBtn = document.getElementById("merge-artefacts-btn");
if (mergeArtefactsBtn) {
    mergeArtefactsBtn.addEventListener("click", () => {
        if (mergeMode) {
            cancelMergeMode();
        } else {
            startMergeMode(inspectedArtefact);
        }
    });
}

// Initial UI Render
updateCanvas();
renderDrawingsStore();
renderLayersTree();
renderMenu();
renderInspector();

// Mark Current Drawing as Rule Checkbox Listener
const markRuleCheckbox = document.getElementById("mark-rule-checkbox") as HTMLInputElement | null;
if (markRuleCheckbox) {
    markRuleCheckbox.addEventListener("change", () => {
        try {
            drawing.setIsRule(markRuleCheckbox.checked);
        } catch (err) {
            alert((err as Error).message);
            markRuleCheckbox.checked = drawing.isRule;
        }
        updateCanvas();
        renderDrawingsStore();
    });
}

// Save Drawing Button Listener
const saveDrawingBtn = document.getElementById("save-drawing-btn");
if (saveDrawingBtn) {
    saveDrawingBtn.addEventListener("click", () => {
        let name = activeDrawingName;
        if (!name) {
            const input = prompt("Enter a name for the drawing:");
            if (!input || !input.trim()) return;
            name = input.trim();
        }
        try {
            drawingStore.saveDrawing(name, drawing);
            activeDrawingName = name;
            updateActiveDrawingBanner();
            renderDrawingsStore();
        } catch (err) {
            alert(`Error saving drawing:\n${(err as Error).message}`);
        }
    });
}

// New Drawing Button Listener
const newDrawingBtn = document.getElementById("new-drawing-btn");
if (newDrawingBtn) {
    newDrawingBtn.addEventListener("click", () => {
        const hasContent = drawing.getArtefacts().length > 0 || drawing.getAllLayers().length > 1;
        if (hasContent && !confirm("Start a new drawing? Current canvas content will be discarded.")) {
            return;
        }
        const input = prompt("Enter a name for the new drawing:");
        if (!input || !input.trim()) return;
        const name = input.trim();
        if (drawingStore.getDrawing(name)) {
            alert(`A drawing named '${name}' already exists.`);
            return;
        }
        drawing.clear();
        activeDrawingName = null;
        layerProvability.clear();
        inspectedArtefact = null;
        draftArtefact = null;
        dependencyPickingFor = null;
        mergeMode = false;
        mergeFirstArtefact = null;
        mergeSecondArtefact = null;
        mergePickingFor = null;
        mergeHoverArtefact = null;
        stopPositionPicker();
        drawingStore.saveDrawing(name, drawing);
        activeDrawingName = name;
        updateCanvas();
        renderLayersTree();
        renderMenu();
        renderInspector();
        renderDrawingsStore();
    });
}

// Import Drawing Button Listener
const importDrawingBtn = document.getElementById("import-drawing-btn");
const drawingJsonUpload = document.getElementById("drawing-json-upload") as HTMLInputElement;

if (importDrawingBtn && drawingJsonUpload) {
    importDrawingBtn.addEventListener("click", () => {
        drawingJsonUpload.value = "";
        drawingJsonUpload.click();
    });

    drawingJsonUpload.addEventListener("change", (e) => {
        const files = (e.target as HTMLInputElement).files;
        if (!files || files.length === 0) return;

        const file = files[0];
        const reader = new FileReader();

        reader.onload = (event) => {
            const jsonText = event.target?.result as string;
            if (!jsonText) return;

            try {
                const { drawings, renames } = drawingStore.importDrawingsJSON(jsonText);
                let summary = `Imported ${drawings.length} drawing(s): ${drawings.map(d => `'${d.name}'`).join(", ")}.`;
                if (renames.length > 0) {
                    summary += `\nRenamed on collision: ${renames.map(r => `'${r.requested}' -> '${r.actual}'`).join(", ")}.`;
                }
                alert(summary);
                renderDrawingsStore();
            } catch (err) {
                alert(`Error importing drawing:\n${(err as Error).message}`);
            }
        };

        reader.readAsText(file);
    });
}

// Export Drawings Button Listener
const exportDrawingsBtn = document.getElementById("export-drawings-btn");
const exportSelectAll = document.getElementById("export-select-all") as HTMLInputElement | null;

function getSelectedDrawingNames(): string[] {
    return Array.from(document.querySelectorAll<HTMLInputElement>(".export-checkbox"))
        .filter(cb => cb.checked)
        .map(cb => cb.dataset.drawingName)
        .filter((name): name is string => !!name);
}

if (exportSelectAll) {
    exportSelectAll.addEventListener("change", (e) => {
        const checked = (e.target as HTMLInputElement).checked;
        document.querySelectorAll<HTMLInputElement>(".export-checkbox").forEach(cb => cb.checked = checked);
    });
}

if (exportDrawingsBtn) {
    exportDrawingsBtn.addEventListener("click", () => {
        const selectedNames = getSelectedDrawingNames();

        if (selectedNames.length === 0) {
            alert("Select at least one drawing to export.");
            return;
        }
        try {
            const jsonStr = drawingStore.exportDrawingsJSON(selectedNames);
            const blob = new Blob([jsonStr], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "drawings.json";
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (err) {
            alert(`Error exporting drawings:\n${(err as Error).message}`);
        }
    });
}

// Delete Drawings Button Listener
const deleteDrawingsBtn = document.getElementById("delete-drawings-btn");
if (deleteDrawingsBtn) {
    deleteDrawingsBtn.addEventListener("click", () => {
        const selectedNames = getSelectedDrawingNames();
        if (selectedNames.length === 0) {
            alert("Select at least one drawing to delete.");
            return;
        }
        if (!confirm(`Are you sure you want to delete ${selectedNames.length} drawing(s): ${selectedNames.map(n => `'${n}'`).join(", ")}?`)) {
            return;
        }
        for (const name of selectedNames) {
            if (name === activeDrawingName) {
                activeDrawingName = null;
            }
            drawingStore.deleteDrawing(name);
        }
        updateActiveDrawingBanner();
        renderDrawingsStore();
    });
}

// Clear All Button Listener
const clearBtn = document.getElementById("clear-btn");
if (clearBtn) {
    clearBtn.addEventListener("click", () => {
        if (confirm("Are you sure you want to clear all artefacts and layers?")) {
            drawing.clear();
            activeDrawingName = null;
            layerProvability.clear();
            inspectedArtefact = null;
            draftArtefact = null;
            dependencyPickingFor = null;
            stopPositionPicker();
            updateCanvas();
            renderLayersTree();
            renderMenu();
            renderInspector();
            renderDrawingsStore();
        }
    });
}

// Load Sort Script Button Listener
const loadScriptBtn = document.getElementById("load-script-btn");
const scriptUpload = document.getElementById("script-upload") as HTMLInputElement;

if (loadScriptBtn && scriptUpload) {
    loadScriptBtn.addEventListener("click", () => {
        scriptUpload.value = "";
        scriptUpload.click();
    });

    scriptUpload.addEventListener("change", (e) => {
        const files = (e.target as HTMLInputElement).files;
        if (!files || files.length === 0) return;

        const file = files[0];
        const reader = new FileReader();

        reader.onload = (event) => {
            const code = event.target?.result as string;
            if (!code) return;

            try {
                sortStore.clear();
                drawing.clear();
                layerProvability.clear();
                inspectedArtefact = null;
                draftArtefact = null;
                dependencyPickingFor = null;
                stopPositionPicker();

                const executor = new Function('sortStore', 'd3', code);
                executor(sortStore, d3);

                updateCanvas();
                renderLayersTree();
                renderMenu();
                renderInspector();

            } catch (err) {
                alert(`Error executing sort script:\n${(err as Error).message}`);
                console.error("Script Execution Error:", err);
            }
        };

        reader.readAsText(file);
    });
}

// 8. Inspector Logic
function renderInspector() {
    const inspectorContent = document.getElementById("inspector-content");
    if (!inspectorContent) return;

    inspectorContent.innerHTML = "";

    // Merge Mode View
    if (mergeMode) {
        const h3 = document.createElement("h3");
        h3.textContent = "Merge Artefacts";
        h3.style.marginTop = "0";
        inspectorContent.appendChild(h3);

        const helpText = document.createElement("p");
        helpText.style.color = "#666";
        helpText.style.fontSize = "0.82rem";
        helpText.style.marginTop = "4px";
        helpText.style.marginBottom = "12px";
        helpText.textContent = "Select two artefacts of the same sort with identical dependencies to merge them.";
        inspectorContent.appendChild(helpText);

        const form = document.createElement("div");

        // 1. First Artefact
        const group1 = document.createElement("div");
        group1.className = "form-group";
        group1.innerHTML = `<label>1st Artefact (to be removed)</label>`;

        const pick1Btn = document.createElement("button");
        pick1Btn.type = "button";
        pick1Btn.className = `pick-dep-btn ${mergePickingFor === "first" ? "active" : ""}`;
        if (mergeFirstArtefact) {
            const l1 = mergeFirstArtefact.data.label || "(unnamed)";
            pick1Btn.textContent = `1st: ${l1} (${mergeFirstArtefact.sortName})`;
        } else {
            pick1Btn.textContent = mergePickingFor === "first" ? "Click artefact in tree..." : "Pick 1st Artefact";
        }

        pick1Btn.addEventListener("click", (e) => {
            e.stopPropagation();
            mergePickingFor = mergePickingFor === "first" ? null : "first";
            renderInspector();
            renderMenu();
        });
        group1.appendChild(pick1Btn);
        form.appendChild(group1);

        // 2. Second Artefact
        const group2 = document.createElement("div");
        group2.className = "form-group";
        group2.innerHTML = `<label>2nd Artefact (datafields kept)</label>`;

        if (mergeFirstArtefact) {
            const candidates = drawing.getArtefacts().filter(art =>
                art !== mergeFirstArtefact && drawing.areDependenciesEqual(mergeFirstArtefact!, art)
            );

            if (candidates.length === 0) {
                const noCandMsg = document.createElement("div");
                noCandMsg.style.fontSize = "0.8rem";
                noCandMsg.style.color = "#e74c3c";
                noCandMsg.style.fontStyle = "italic";
                noCandMsg.style.marginTop = "4px";
                noCandMsg.textContent = "No other artefacts with matching dependencies found.";
                group2.appendChild(noCandMsg);
            } else {
                const provablyEqual = candidates.filter(c => drawing.areProvablyEqual(mergeFirstArtefact!, c));
                const others = candidates.filter(c => !drawing.areProvablyEqual(mergeFirstArtefact!, c));
                const orderedCandidates = [...provablyEqual, ...others];

                const selectEl = document.createElement("select");
                const defaultOpt = document.createElement("option");
                defaultOpt.value = "";
                defaultOpt.textContent = "-- Select 2nd Artefact --";
                selectEl.appendChild(defaultOpt);

                const optionText = (cand: Artefact) => {
                    const layerObj = drawing.getLayer(cand.layerId);
                    return `${cand.data.label || "(unnamed)"} (${cand.sortName} in '${layerObj ? layerObj.name : cand.layerId}')`;
                };

                const addOption = (container: HTMLSelectElement | HTMLOptGroupElement, cand: Artefact, proven: boolean) => {
                    const opt = document.createElement("option");
                    opt.value = orderedCandidates.indexOf(cand).toString();
                    opt.textContent = proven ? `≡ ${optionText(cand)} (proven equal)` : optionText(cand);
                    if (proven) {
                        opt.style.color = "#8e44ad";
                        opt.style.fontWeight = "bold";
                    }
                    if (cand === mergeSecondArtefact) opt.selected = true;
                    container.appendChild(opt);
                };

                if (provablyEqual.length > 0) {
                    const eqGroup = document.createElement("optgroup");
                    eqGroup.label = "≡ Provably equal (via equality artefacts)";
                    provablyEqual.forEach(cand => addOption(eqGroup, cand, true));
                    selectEl.appendChild(eqGroup);
                }
                if (others.length > 0) {
                    const otherGroup = document.createElement("optgroup");
                    otherGroup.label = "Other candidates";
                    others.forEach(cand => addOption(otherGroup, cand, false));
                    selectEl.appendChild(otherGroup);
                }

                selectEl.addEventListener("change", (e) => {
                    const val = (e.target as HTMLSelectElement).value;
                    if (val !== "") {
                        const idx = parseInt(val, 10);
                        mergeSecondArtefact = orderedCandidates[idx];
                        mergePickingFor = null;
                    } else {
                        mergeSecondArtefact = null;
                    }
                    renderMenu();
                    renderInspector();
                    updateCanvas();
                });
                group2.appendChild(selectEl);
            }

            const pick2Btn = document.createElement("button");
            pick2Btn.type = "button";
            pick2Btn.className = `pick-dep-btn ${mergePickingFor === "second" ? "active" : ""}`;
            pick2Btn.style.marginTop = "6px";
            if (mergeSecondArtefact) {
                const l2 = mergeSecondArtefact.data.label || "(unnamed)";
                pick2Btn.textContent = `2nd: ${l2} (${mergeSecondArtefact.sortName})`;
            } else {
                pick2Btn.textContent = mergePickingFor === "second" ? "Click candidate in tree..." : "Or Pick in Tree/Canvas";
            }
            pick2Btn.addEventListener("click", (e) => {
                e.stopPropagation();
                mergePickingFor = mergePickingFor === "second" ? null : "second";
                renderInspector();
                renderMenu();
            });
            group2.appendChild(pick2Btn);

        } else {
            const disabledMsg = document.createElement("div");
            disabledMsg.style.fontSize = "0.8rem";
            disabledMsg.style.color = "#888";
            disabledMsg.style.fontStyle = "italic";
            disabledMsg.textContent = "Select 1st artefact first.";
            group2.appendChild(disabledMsg);
        }
        form.appendChild(group2);

        // 3. Preview Box
        if (mergeFirstArtefact && mergeSecondArtefact) {
            const label1 = typeof mergeFirstArtefact.data.label === "string" ? mergeFirstArtefact.data.label.trim() : "";
            const label2 = typeof mergeSecondArtefact.data.label === "string" ? mergeSecondArtefact.data.label.trim() : "";
            let previewLabel = "";
            if (label1 && label2) previewLabel = `${label1}, ${label2}`;
            else if (label1) previewLabel = label1;
            else if (label2) previewLabel = label2;

            const previewBox = document.createElement("div");
            previewBox.className = "merge-preview-box";
            previewBox.innerHTML = `
                <strong style="color: #8e44ad;">Merge Result Preview:</strong><br/>
                • Datafields kept from: <strong>${mergeSecondArtefact.data.label || mergeSecondArtefact.sortName}</strong><br/>
                • New Label: <strong>${previewLabel || "(none)"}</strong>
            `;
            form.appendChild(previewBox);
        }

        // 4. Action Buttons
        const actionGroup = document.createElement("div");
        actionGroup.className = "action-btns";

        const cancelBtn = document.createElement("button");
        cancelBtn.type = "button";
        cancelBtn.className = "btn btn-cancel";
        cancelBtn.textContent = "Cancel";
        cancelBtn.addEventListener("click", () => {
            cancelMergeMode();
        });

        const canMerge = !!(mergeFirstArtefact && mergeSecondArtefact && mergeFirstArtefact !== mergeSecondArtefact && drawing.areDependenciesEqual(mergeFirstArtefact, mergeSecondArtefact));

        const validateBtn = document.createElement("button");
        validateBtn.type = "button";
        validateBtn.className = "btn btn-merge";
        validateBtn.textContent = "Merge";
        validateBtn.disabled = !canMerge;

        validateBtn.addEventListener("click", () => {
            if (canMerge && mergeFirstArtefact && mergeSecondArtefact) {
                try {
                    const mergedResult = drawing.mergeArtefacts(mergeFirstArtefact, mergeSecondArtefact);
                    mergeMode = false;
                    mergeFirstArtefact = null;
                    mergeSecondArtefact = null;
                    mergePickingFor = null;
                    mergeHoverArtefact = null;
                    inspectedArtefact = mergedResult;
                    updateCanvas();
                    renderMenu();
                    renderInspector();
                } catch (err) {
                    alert((err as Error).message);
                }
            }
        });

        actionGroup.appendChild(cancelBtn);
        actionGroup.appendChild(validateBtn);
        form.appendChild(actionGroup);

        inspectorContent.appendChild(form);
        return;
    }

    // A. Creation View (Draft Artefact Mode)
    if (draftArtefact) {
        const sortDef = sortStore.getSort(draftArtefact.sortName);
        if (!sortDef) return;

        const triggerDraftUpdate = () => {
            updateCanvas();
            renderInspector();
        };

        const h3 = document.createElement("h3");
        h3.textContent = `New ${draftArtefact.sortName}`;
        h3.style.marginTop = "0";
        inspectorContent.appendChild(h3);

        const form = document.createElement("div");

        // 0. Layer Selection
        const layerGroup = document.createElement("div");
        layerGroup.className = "form-group";
        layerGroup.innerHTML = `<label>Layer</label>`;
        const layerSelect = document.createElement("select");
        for (const l of drawing.getAllLayers()) {
            const opt = document.createElement("option");
            opt.value = l.id;
            opt.textContent = l.name;
            if (l.id === draftArtefact.layerId) opt.selected = true;
            layerSelect.appendChild(opt);
        }
        layerSelect.addEventListener("change", (e) => {
            draftArtefact!.layerId = (e.target as HTMLSelectElement).value;
            const descendants = drawing.getDescendants(draftArtefact!.layerId);
            for (const [flagKey, flagLayerId] of Object.entries(draftArtefact!.flagLayers)) {
                if (!descendants.has(flagLayerId)) {
                    delete draftArtefact!.flagLayers[flagKey];
                }
            }
            triggerDraftUpdate();
        });
        layerGroup.appendChild(layerSelect);
        form.appendChild(layerGroup);

        // 1. Dependencies Section
        if (draftArtefact.sortName === "Equality") {
            const depsHeader = document.createElement("h4");
            depsHeader.textContent = "Equalized Artefacts (pick >= 2 of same sort)";
            depsHeader.style.margin = "10px 0 5px 0";
            depsHeader.style.fontSize = "0.95rem";
            depsHeader.style.color = "#444";
            form.appendChild(depsHeader);

            const selectedItems = Object.values(draftArtefact.dependencies).filter((v): v is Artefact => typeof v !== "boolean");
            for (let i = 0; i < selectedItems.length; i++) {
                const item = selectedItems[i];
                const itemDiv = document.createElement("div");
                itemDiv.style.fontSize = "0.85rem";
                itemDiv.style.margin = "3px 0";
                itemDiv.textContent = `• ${item.data.label || item.sortName} (${item.sortName})`;
                form.appendChild(itemDiv);
            }

            const pickBtn = document.createElement("button");
            pickBtn.type = "button";
            pickBtn.className = `pick-dep-btn ${dependencyPickingFor === "Equality" ? "active" : ""}`;
            pickBtn.textContent = dependencyPickingFor === "Equality" ? "Click artefact in tree..." : "+ Pick Artefact";
            pickBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                dependencyPickingFor = dependencyPickingFor === "Equality" ? null : "Equality";
                renderInspector();
            });
            form.appendChild(pickBtn);
        } else {
            const nonFlagDeps = Object.entries(sortDef.dependencies).filter(([_, expected]) => expected !== "flag");
            if (nonFlagDeps.length > 0) {
                const depsHeader = document.createElement("h4");
                depsHeader.textContent = "Dependencies";
                depsHeader.style.margin = "10px 0 5px 0";
                depsHeader.style.fontSize = "0.95rem";
                depsHeader.style.color = "#444";
                form.appendChild(depsHeader);

                for (const [depKey, expectedSort] of nonFlagDeps) {
                    const group = document.createElement("div");
                    group.className = "form-group";

                    const picked = draftArtefact.dependencies[depKey] as Artefact | undefined;
                    const pickedLabel = picked ? (picked.data.label || "(unnamed)") : null;

                    group.innerHTML = `<label>${depKey} (${expectedSort})</label>`;

                    const pickDepBtn = document.createElement("button");
                    pickDepBtn.type = "button";
                    pickDepBtn.className = "pick-dep-btn";
                    if (dependencyPickingFor === depKey) {
                        pickDepBtn.classList.add("active");
                    }

                    if (picked) {
                        pickDepBtn.textContent = `✓ ${pickedLabel}`;
                    } else {
                        pickDepBtn.textContent = dependencyPickingFor === depKey ? "Select in tree..." : `Pick ${depKey}`;
                    }

                    pickDepBtn.addEventListener("click", (e) => {
                        e.stopPropagation();
                        if (dependencyPickingFor === depKey) {
                            dependencyPickingFor = null;
                        } else {
                            dependencyPickingFor = depKey;
                        }
                        renderInspector();
                    });

                    group.appendChild(pickDepBtn);
                    form.appendChild(group);
                }
            }
        }

        // 2. Data Attributes Section
        const dataHeader = document.createElement("h4");
        dataHeader.textContent = "Data Attributes";
        dataHeader.style.margin = "15px 0 5px 0";
        dataHeader.style.fontSize = "0.95rem";
        dataHeader.style.color = "#444";
        form.appendChild(dataHeader);

        // Label input
        const labelGroup = document.createElement("div");
        labelGroup.className = "form-group";
        labelGroup.innerHTML = `<label>Label</label>`;
        const labelInput = document.createElement("input");
        labelInput.type = "text";
        labelInput.value = draftArtefact.data.label || "";
        labelInput.addEventListener("change", (e) => {
            const val = (e.target as HTMLInputElement).value.trim();
            if (val === "") delete draftArtefact!.data.label;
            else draftArtefact!.data.label = val;
            triggerDraftUpdate();
        });
        labelGroup.appendChild(labelInput);
        form.appendChild(labelGroup);

        for (const [attrName, expectedType] of Object.entries(sortDef.attributes)) {
            const group = document.createElement("div");
            if (expectedType === "string" || expectedType === "number") {
                group.className = "form-group";
                group.innerHTML = `<label>${attrName} (${expectedType})</label>`;
                const input = document.createElement("input");
                input.type = expectedType === "number" ? "number" : "text";
                if (expectedType === "number") input.step = "any";
                input.value = draftArtefact.data[attrName] !== undefined ? draftArtefact.data[attrName] : "";

                input.addEventListener("change", (e) => {
                    const target = e.target as HTMLInputElement;
                    if (expectedType === "number") {
                        const parsed = parseFloat(target.value);
                        if (!isNaN(parsed)) {
                            draftArtefact!.data[attrName] = parsed;
                            triggerDraftUpdate();
                        }
                    } else {
                        draftArtefact!.data[attrName] = target.value;
                        triggerDraftUpdate();
                    }
                });
                group.appendChild(input);

            } else if (expectedType === "boolean") {
                group.className = "form-group checkbox";
                const input = document.createElement("input");
                input.type = "checkbox";
                input.checked = !!draftArtefact.data[attrName];
                const label = document.createElement("label");
                label.textContent = attrName;

                input.addEventListener("change", (e) => {
                    draftArtefact!.data[attrName] = (e.target as HTMLInputElement).checked;
                    triggerDraftUpdate();
                });
                group.appendChild(input);
                group.appendChild(label);

            } else if (expectedType === "position") {
                group.className = "form-group";
                group.innerHTML = `<label>${attrName} (x, y)</label>`;
                const posContainer = document.createElement("div");
                posContainer.className = "position";

                const inputX = document.createElement("input");
                inputX.type = "number";
                inputX.step = "any";
                inputX.value = draftArtefact.data[attrName] ? draftArtefact.data[attrName][0] : 0;

                const inputY = document.createElement("input");
                inputY.type = "number";
                inputY.step = "any";
                inputY.value = draftArtefact.data[attrName] ? draftArtefact.data[attrName][1] : 0;

                const updatePosition = () => {
                    const x = parseFloat(inputX.value);
                    const y = parseFloat(inputY.value);
                    if (!isNaN(x) && !isNaN(y)) {
                        draftArtefact!.data[attrName] = [x, y];
                        triggerDraftUpdate();
                    }
                };

                inputX.addEventListener("change", updatePosition);
                inputY.addEventListener("change", updatePosition);

                const pickBtn = document.createElement("button");
                pickBtn.type = "button";
                pickBtn.className = "pick-btn";
                pickBtn.textContent = "📍";
                pickBtn.title = "Click canvas to pick position";

                const draftProxy = { data: draftArtefact.data } as Artefact;

                if (activePositionPicker && activePositionPicker.artefact.data === draftArtefact.data && activePositionPicker.attrName === attrName) {
                    pickBtn.style.backgroundColor = "#aed6f1";
                    activePositionPicker.pickBtn = pickBtn;
                    activePositionPicker.inputX = inputX;
                    activePositionPicker.inputY = inputY;
                }

                pickBtn.addEventListener("click", (e) => {
                    e.stopPropagation();
                    if (activePositionPicker && activePositionPicker.artefact.data === draftArtefact!.data && activePositionPicker.attrName === attrName) {
                        stopPositionPicker();
                    } else {
                        clearActivePickerButton();
                        activePositionPicker = {
                            artefact: draftProxy,
                            attrName,
                            inputX,
                            inputY,
                            pickBtn
                        };
                        d3.select("body").style("cursor", "crosshair");
                        pickBtn.style.backgroundColor = "#aed6f1";
                    }
                });

                posContainer.appendChild(inputX);
                posContainer.appendChild(inputY);
                posContainer.appendChild(pickBtn);
                group.appendChild(posContainer);
            }
            form.appendChild(group);
        }

        // 3. Flags Section
        const flagDeps = Object.entries(sortDef.dependencies).filter(([_, expected]) => expected === "flag");
        if (flagDeps.length > 0) {
            const flagsHeader = document.createElement("h4");
            flagsHeader.textContent = "Flags";
            flagsHeader.style.margin = "15px 0 5px 0";
            flagsHeader.style.fontSize = "0.95rem";
            flagsHeader.style.color = "#444";
            form.appendChild(flagsHeader);

            for (const [flagKey, _] of flagDeps) {
                const group = document.createElement("div");
                group.className = "form-group checkbox flag-row";

                const input = document.createElement("input");
                input.type = "checkbox";
                input.checked = draftArtefact.dependencies[flagKey] === true;

                const label = document.createElement("label");
                label.textContent = flagKey;

                const flagLayerSelect = appendFlagLayerSelect(
                    group,
                    flagKey,
                    draftArtefact.layerId,
                    draftArtefact.flagLayers[flagKey] ?? draftArtefact.layerId,
                    (layerId) => {
                        if (layerId === draftArtefact!.layerId) {
                            delete draftArtefact!.flagLayers[flagKey];
                        } else {
                            draftArtefact!.flagLayers[flagKey] = layerId;
                        }
                        triggerDraftUpdate();
                    }
                );
                flagLayerSelect.style.display = input.checked ? "" : "none";

                input.addEventListener("change", (e) => {
                    if ((e.target as HTMLInputElement).checked) {
                        draftArtefact!.dependencies[flagKey] = true;
                        flagLayerSelect.style.display = "";
                    } else {
                        delete draftArtefact!.dependencies[flagKey];
                        delete draftArtefact!.flagLayers[flagKey];
                        flagLayerSelect.style.display = "none";
                    }
                    triggerDraftUpdate();
                });

                group.appendChild(input);
                group.appendChild(label);
                form.appendChild(group);
            }
        }

        // 4. Action Buttons
        const actionGroup = document.createElement("div");
        actionGroup.className = "action-btns";

        const cancelBtn = document.createElement("button");
        cancelBtn.type = "button";
        cancelBtn.className = "btn btn-cancel";
        cancelBtn.textContent = "Cancel";
        cancelBtn.addEventListener("click", () => {
            draftArtefact = null;
            dependencyPickingFor = null;
            stopPositionPicker();
            renderMenu();
            renderInspector();
            updateCanvas();
        });

        let isValid = true;
        if (draftArtefact.sortName === "Equality") {
            const children = Object.values(draftArtefact.dependencies).filter((v): v is Artefact => typeof v !== "boolean");
            if (children.length < 2) isValid = false;
        } else {
            for (const [depKey, expectedSort] of Object.entries(sortDef.dependencies)) {
                if (expectedSort !== "flag" && !draftArtefact.dependencies[depKey]) {
                    isValid = false;
                    break;
                }
            }
        }
        for (const [attrName, _] of Object.entries(sortDef.attributes)) {
            if (draftArtefact.data[attrName] === undefined) {
                isValid = false;
                break;
            }
        }

        const validateBtn = document.createElement("button");
        validateBtn.type = "button";
        validateBtn.className = "btn btn-validate";
        validateBtn.textContent = "Validate";
        validateBtn.disabled = !isValid;

        validateBtn.addEventListener("click", () => {
            if (isValid) {
                try {
                    const finalDeps: Record<string, Artefact | boolean | { __flag: true; layerId: string }> = { ...draftArtefact!.dependencies };
                    for (const [flagKey, flagLayerId] of Object.entries(draftArtefact!.flagLayers)) {
                        if (finalDeps[flagKey] === true) {
                            finalDeps[flagKey] = { __flag: true, layerId: flagLayerId };
                        }
                    }
                    drawing.newArtefact(
                        draftArtefact!.sortName,
                        finalDeps,
                        draftArtefact!.data,
                        draftArtefact!.layerId
                    );
                    draftArtefact = null;
                    dependencyPickingFor = null;
                    stopPositionPicker();
                    updateCanvas();
                    renderMenu();
                    renderInspector();
                } catch (err) {
                    alert((err as Error).message);
                }
            }
        });

        actionGroup.appendChild(cancelBtn);
        actionGroup.appendChild(validateBtn);
        form.appendChild(actionGroup);

        inspectorContent.appendChild(form);
        return;
    }

    // B. Normal Inspection Mode
    if (!inspectedArtefact) {
        inspectorContent.innerHTML = `<p style="color: #666; font-style: italic;">Select an artefact to inspect.</p>`;
        return;
    }

    const sortDef = sortStore.getSort(inspectedArtefact.sortName);
    if (!sortDef) return;

    const h3 = document.createElement("h3");
    let titleText = inspectedArtefact.sortName;
    if (inspectedArtefact.sortName === "Equality") {
        const children = inspectedArtefact instanceof EqualityArtefact
            ? inspectedArtefact.children
            : Object.values(inspectedArtefact.dependencies).filter((v): v is Artefact => typeof v !== "boolean");
        if (children.length > 0) {
            titleText += ` [${children[0].sortName}]`;
        }
    }
    h3.textContent = titleText;
    h3.style.marginTop = "0";
    inspectorContent.appendChild(h3);

    const triggerUpdate = () => {
        svgContext.selectAll("*").remove();
        drawing.draw(svgContext);
        renderMenu();
    };

    const form = document.createElement("div");

    // 0. Layer Selector
    const layerGroup = document.createElement("div");
    layerGroup.className = "form-group";
    layerGroup.innerHTML = `<label>Layer</label>`;
    const layerSelect = document.createElement("select");
    for (const l of drawing.getAllLayers()) {
        const opt = document.createElement("option");
        opt.value = l.id;
        opt.textContent = l.name;
        if (l.id === inspectedArtefact.layerId) opt.selected = true;
        layerSelect.appendChild(opt);
    }
    layerSelect.addEventListener("change", (e) => {
        const newLayerId = (e.target as HTMLSelectElement).value;
        try {
            drawing.setArtefactLayer(inspectedArtefact!, newLayerId);
            triggerUpdate();
            renderInspector();
        } catch (err) {
            alert((err as Error).message);
            layerSelect.value = inspectedArtefact!.layerId;
        }
    });
    layerGroup.appendChild(layerSelect);
    form.appendChild(layerGroup);

    // 1. Label Field
    const labelGroup = document.createElement("div");
    labelGroup.className = "form-group";
    labelGroup.innerHTML = `<label>Label</label>`;
    const labelInput = document.createElement("input");
    labelInput.type = "text";
    labelInput.value = inspectedArtefact.data.label || "";
    if (inspectedArtefact.sortName === "Equality") {
        const children = inspectedArtefact instanceof EqualityArtefact
            ? inspectedArtefact.children
            : Object.values(inspectedArtefact.dependencies).filter((v): v is Artefact => typeof v !== "boolean");
        labelInput.placeholder = children.map(c => c.data.label || c.sortName).join(" = ");
    }
    labelInput.addEventListener("change", (e) => {
        const target = e.target as HTMLInputElement;
        if (target.value.trim() === "") {
            delete inspectedArtefact!.data.label;
        } else {
            inspectedArtefact!.data.label = target.value;
        }
        triggerUpdate();
    });
    labelGroup.appendChild(labelInput);
    form.appendChild(labelGroup);

    // 2. Data Attributes
    for (const [attrName, expectedType] of Object.entries(sortDef.attributes)) {
        const group = document.createElement("div");
        
        if (expectedType === "string" || expectedType === "number") {
            group.className = "form-group";
            group.innerHTML = `<label>${attrName} (${expectedType})</label>`;
            const input = document.createElement("input");
            input.type = expectedType === "number" ? "number" : "text";
            if (expectedType === "number") input.step = "any";
            input.value = inspectedArtefact.data[attrName] !== undefined ? inspectedArtefact.data[attrName] : "";
            
            input.addEventListener("change", (e) => {
                const target = e.target as HTMLInputElement;
                if (expectedType === "number") {
                    const parsed = parseFloat(target.value);
                    if (!isNaN(parsed)) {
                        inspectedArtefact!.data[attrName] = parsed;
                        triggerUpdate();
                    }
                } else {
                    inspectedArtefact!.data[attrName] = target.value;
                    triggerUpdate();
                }
            });
            group.appendChild(input);

        } else if (expectedType === "boolean") {
            group.className = "form-group checkbox";
            const input = document.createElement("input");
            input.type = "checkbox";
            input.checked = !!inspectedArtefact.data[attrName];
            
            const label = document.createElement("label");
            label.textContent = attrName;
            
            input.addEventListener("change", (e) => {
                const target = e.target as HTMLInputElement;
                inspectedArtefact!.data[attrName] = target.checked;
                triggerUpdate();
            });
            group.appendChild(input);
            group.appendChild(label);
            
        } else if (expectedType === "position") {
            group.className = "form-group";
            group.innerHTML = `<label>${attrName} (x, y)</label>`;
            
            const posContainer = document.createElement("div");
            posContainer.className = "position";
            
            const inputX = document.createElement("input");
            inputX.type = "number";
            inputX.step = "any";
            inputX.value = inspectedArtefact.data[attrName] ? inspectedArtefact.data[attrName][0] : 0;
            
            const inputY = document.createElement("input");
            inputY.type = "number";
            inputY.step = "any";
            inputY.value = inspectedArtefact.data[attrName] ? inspectedArtefact.data[attrName][1] : 0;

            const updatePosition = () => {
                const x = parseFloat(inputX.value);
                const y = parseFloat(inputY.value);
                if (!isNaN(x) && !isNaN(y)) {
                    inspectedArtefact!.data[attrName] = [x, y];
                    triggerUpdate();
                }
            };
            
            inputX.addEventListener("change", updatePosition);
            inputY.addEventListener("change", updatePosition);
            
            const pickBtn = document.createElement("button");
            pickBtn.type = "button";
            pickBtn.className = "pick-btn";
            pickBtn.textContent = "📍";
            pickBtn.title = "Click canvas to pick position";

            if (activePositionPicker && activePositionPicker.artefact === inspectedArtefact && activePositionPicker.attrName === attrName) {
                pickBtn.style.backgroundColor = "#aed6f1";
                activePositionPicker.pickBtn = pickBtn;
                activePositionPicker.inputX = inputX;
                activePositionPicker.inputY = inputY;
            }

            pickBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                if (activePositionPicker && activePositionPicker.artefact === inspectedArtefact && activePositionPicker.attrName === attrName) {
                    stopPositionPicker();
                } else {
                    clearActivePickerButton();
                    activePositionPicker = {
                        artefact: inspectedArtefact!,
                        attrName,
                        inputX,
                        inputY,
                        pickBtn
                    };
                    d3.select("body").style("cursor", "crosshair");
                    pickBtn.style.backgroundColor = "#aed6f1";
                }
            });

            posContainer.appendChild(inputX);
            posContainer.appendChild(inputY);
            posContainer.appendChild(pickBtn);
            group.appendChild(posContainer);
        }
        
        form.appendChild(group);
    }

    // 3. Flags
    const flagDependencies = Object.entries(sortDef.dependencies).filter(([_, expectedSort]) => expectedSort === "flag");
    
    if (flagDependencies.length > 0) {
        const flagsHeader = document.createElement("h4");
        flagsHeader.textContent = "Flags";
        flagsHeader.style.marginTop = "15px";
        flagsHeader.style.marginBottom = "10px";
        flagsHeader.style.fontSize = "0.95rem";
        flagsHeader.style.color = "#444";
        form.appendChild(flagsHeader);

        for (const [flagKey, _] of flagDependencies) {
            const group = document.createElement("div");
            group.className = "form-group checkbox flag-row";
            
            const input = document.createElement("input");
            input.type = "checkbox";
            input.checked = inspectedArtefact.dependencies[flagKey] === true;
            
            const label = document.createElement("label");
            label.textContent = flagKey;

            const flagLayerSelect = appendFlagLayerSelect(
                group,
                flagKey,
                inspectedArtefact.layerId,
                inspectedArtefact.getFlagLayer(flagKey),
                (layerId) => {
                    try {
                        if (layerId === inspectedArtefact!.layerId) {
                            delete inspectedArtefact!.flagLayers[flagKey];
                        } else {
                            inspectedArtefact!.flagLayers[flagKey] = layerId;
                        }
                        triggerUpdate();
                    } catch (err) {
                        alert((err as Error).message);
                    }
                }
            );
            flagLayerSelect.style.display = input.checked ? "" : "none";
            
            input.addEventListener("change", (e) => {
                const target = e.target as HTMLInputElement;
                if (target.checked) {
                    inspectedArtefact!.dependencies[flagKey] = true as any;
                    flagLayerSelect.style.display = "";
                } else {
                    delete inspectedArtefact!.dependencies[flagKey];
                    delete inspectedArtefact!.flagLayers[flagKey];
                    flagLayerSelect.style.display = "none";
                }
                triggerUpdate();
            });
            
            group.appendChild(input);
            group.appendChild(label);
            form.appendChild(group);
        }
    }

    const mergeWithBtn = document.createElement("button");
    mergeWithBtn.type = "button";
    mergeWithBtn.className = "btn btn-merge";
    mergeWithBtn.style.marginTop = "15px";
    mergeWithBtn.style.width = "100%";
    mergeWithBtn.textContent = "Merge with another artefact...";
    mergeWithBtn.addEventListener("click", () => {
        startMergeMode(inspectedArtefact);
    });
    form.appendChild(mergeWithBtn);

    inspectorContent.appendChild(form);
}
