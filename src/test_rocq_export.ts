import * as fs from "fs";
import * as path from "path";
import * as d3 from "d3";
import { SortStore, Drawing, DrawingStore, findFirstOrderRuleApplications, findSecondOrderRuleApplications, applyFirstOrderRule, applySecondOrderRule } from "./index";
import { exportDrawingsToRocq } from "./rocq_export";
import { RocqRecorder } from "./rocq_recording";

const rootDir = path.resolve(process.cwd());

const sortStore = new SortStore();
const defaultSortsCode = fs.readFileSync(path.join(rootDir, "public", "default_sorts.js"), "utf8");
new Function("sortStore", "d3", defaultSortsCode)(sortStore, d3);

const drawing = new Drawing(sortStore);
drawing.getLayer("root")!.name = "Root Layer";
drawing.addLayer("layer-1", "Child Layer 1", "root", "#e74c3c", true);
drawing.addLayer("layer-2", "Child Layer 2", "layer-1", "#2ecc71", true);

const v0 = drawing.newArtefact("Vertex", {}, { position: [200, 300], label: "v0" }, "root");
const v1 = drawing.newArtefact("Vertex", {}, { position: [600, 300], label: "v1" }, "root");
const v2 = drawing.newArtefact("Vertex", {}, { position: [400, 150], label: "v2" }, "root");
const e0 = drawing.newArtefact("Edge", { source: v0, target: v1 }, { width: 4, bend: 0, label: "e0" }, "root");

const sq_v0 = drawing.newArtefact("Vertex", {}, { position: [400, 400], label: "A" }, "root");
const sq_v1 = drawing.newArtefact("Vertex", {}, { position: [600, 400], label: "B" }, "root");
const sq_v2 = drawing.newArtefact("Vertex", {}, { position: [400, 550], label: "C" }, "root");
const sq_v3 = drawing.newArtefact("Vertex", {}, { position: [600, 550], label: "D" }, "root");

const e1 = drawing.newArtefact(
    "Edge",
    { source: v1, target: v2, mono: { __flag: true, layerId: "layer-2" } },
    { width: 2, bend: 30, label: "e1" },
    "layer-1"
);
const e2 = drawing.newArtefact("Edge", { source: v2, target: v0 }, { width: 2, bend: 0, label: "e2" }, "layer-1");

const p1 = drawing.newArtefact("Edge", { source: sq_v0, target: sq_v1 }, { width: 2, bend: 0, label: "p1" }, "layer-1");
const p2 = drawing.newArtefact("Edge", { source: sq_v0, target: sq_v2 }, { width: 2, bend: 0, label: "p2" }, "layer-1");
const q1 = drawing.newArtefact("Edge", { source: sq_v1, target: sq_v3 }, { width: 2, bend: 0, label: "q1" }, "layer-1");
const q2 = drawing.newArtefact("Edge", { source: sq_v2, target: sq_v3 }, { width: 2, bend: 0, label: "q2" }, "layer-1");

drawing.newArtefact("Pullback", { p1, p2, q1, q2 }, {}, "layer-2");
drawing.newArtefact("Triangle", { "1": e1, "2": e2, o: e0 }, {}, "layer-2");

drawing.newEqualityArtefact([v0, v1, v2], "root");

const drawing2 = new Drawing(sortStore);
drawing2.getLayer("root")!.name = "Root Layer";
const s0 = drawing2.newArtefact("Vertex", {}, { position: [0, 0], label: "s0" }, "root");
const s1 = drawing2.newArtefact("Vertex", {}, { position: [100, 0], label: "s1" }, "root");
drawing2.newArtefact("Edge", { source: s0, target: s1 }, { width: 2, bend: 0, label: "f" }, "root");
drawing2.newEqualityArtefact([s0, s1], "root");

const store = new DrawingStore();
store.saveDrawing("Initial Drawing", drawing);
store.saveDrawing("Second Drawing", drawing2);

// First-order rule Foo
const foo = new Drawing(sortStore);
foo.getLayer("root")!.name = "Root Layer";
const fx = foo.newArtefact("Vertex", {}, { position: [0, 0], label: "x" }, "root");
const fy = foo.newArtefact("Vertex", {}, { position: [100, 0], label: "y" }, "root");
foo.addLayer("conclusion", "Conclusion", "root");
foo.newArtefact("Edge", { source: fx, target: fy }, { width: 2, bend: 0, label: "f" }, "conclusion");
foo.setIsRule(true);
store.saveDrawing("Foo", foo);

// Second-order rule with premise
const rule2 = new Drawing(sortStore);
rule2.getLayer("root")!.name = "Root Layer";
const rx = rule2.newArtefact("Vertex", {}, { position: [0, 0], label: "x" }, "root");
const ry = rule2.newArtefact("Vertex", {}, { position: [100, 0], label: "y" }, "root");
rule2.addLayer("premise-1", "Premise Layer", "root");
rule2.newArtefact("Edge", { source: rx, target: ry }, { width: 2, bend: 0, label: "pe" }, "premise-1");
rule2.addLayer("premise-1-child", "Premise Child Layer", "premise-1");
rule2.newArtefact("Edge", { source: rx, target: ry }, { width: 2, bend: 0, label: "pce" }, "premise-1-child");
rule2.addLayer("conclusion", "Conclusion Layer", "root");
rule2.newArtefact("Edge", { source: rx, target: ry }, { width: 2, bend: 0, label: "ce" }, "conclusion");
rule2.setIsRule(true);
store.saveDrawing("SecondOrderRule", rule2);

// Main Host Drawing for Recording Test
const mainDrawing = new Drawing(sortStore);
mainDrawing.getLayer("root")!.name = "Root Layer";
const ma = mainDrawing.newArtefact("Vertex", {}, { position: [0, 0], label: "a" }, "root");
const mb = mainDrawing.newArtefact("Vertex", {}, { position: [100, 0], label: "b" }, "root");
mainDrawing.addLayer("child", "Child Layer", "root");
mainDrawing.newArtefact("Edge", { source: ma, target: mb }, { width: 2, bend: 0, label: "g" }, "child");
mainDrawing.newArtefact(
    "Edge",
    { source: ma, target: mb, mono: { __flag: true, layerId: "root" } },
    { width: 2, bend: 0, label: "mf" },
    "root"
);
mainDrawing.newEqualityArtefact([ma, mb], "root");
store.saveDrawing("MainDrawing", mainDrawing);

// Rule with a mono flag established in its root layer
const monoRule = new Drawing(sortStore);
monoRule.getLayer("root")!.name = "Root Layer";
const mx = monoRule.newArtefact("Vertex", {}, { position: [0, 0], label: "x" }, "root");
const my = monoRule.newArtefact("Vertex", {}, { position: [100, 0], label: "y" }, "root");
monoRule.newArtefact(
    "Edge",
    { source: mx, target: my, mono: { __flag: true, layerId: "root" } },
    { width: 2, bend: 0, label: "f" },
    "root"
);
monoRule.addLayer("conclusion", "Conclusion Layer", "root");
monoRule.newArtefact("Edge", { source: mx, target: my }, { width: 2, bend: 0, label: "g" }, "conclusion");
monoRule.setIsRule(true);
store.saveDrawing("MonoRule", monoRule);

// Rule with an equality artefact in its root layer
const eqRule = new Drawing(sortStore);
eqRule.getLayer("root")!.name = "Root Layer";
const ex = eqRule.newArtefact("Vertex", {}, { position: [0, 0], label: "x" }, "root");
const ey = eqRule.newArtefact("Vertex", {}, { position: [100, 0], label: "y" }, "root");
eqRule.newEqualityArtefact([ex, ey], "root");
eqRule.addLayer("conclusion", "Conclusion Layer", "root");
eqRule.newArtefact("Edge", { source: ex, target: ey }, { width: 2, bend: 0, label: "g" }, "conclusion");
eqRule.setIsRule(true);
store.saveDrawing("EqRule", eqRule);

// Record operations on MainDrawing
const recorder = new RocqRecorder();
recorder.start(mainDrawing, "MainDrawing", sortStore);

// Apply Foo
const fooApps = findFirstOrderRuleApplications(foo, mainDrawing);
if (fooApps.length > 0) {
    const createdFoo = applyFirstOrderRule(foo, mainDrawing, fooApps[0]);
    recorder.recordRuleApply(foo, "Foo", fooApps[0], mainDrawing, createdFoo, "MainDrawing", sortStore);
}

// Apply SecondOrderRule
const soApps = findSecondOrderRuleApplications(rule2, mainDrawing);
if (soApps.length > 0) {
    const soResult = applySecondOrderRule(rule2, mainDrawing, soApps[0], { hostName: "MainDrawing", ruleName: "SecondOrderRule" });
    recorder.recordRuleApply(rule2, "SecondOrderRule", soApps[0], mainDrawing, soResult.hostArtefacts, "MainDrawing", sortStore);
}

// Apply MonoRule (mono flag proof field in the rule root record)
const monoApps = findFirstOrderRuleApplications(monoRule, mainDrawing);
if (monoApps.length === 0) {
    throw new Error("MonoRule produced no applications on MainDrawing");
}
const createdMono = applyFirstOrderRule(monoRule, mainDrawing, monoApps[0]);
recorder.recordRuleApply(monoRule, "MonoRule", monoApps[0], mainDrawing, createdMono, "MainDrawing", sortStore);

// Apply EqRule (equality proof field in the rule root record)
const eqApps = findFirstOrderRuleApplications(eqRule, mainDrawing);
if (eqApps.length === 0) {
    throw new Error("EqRule produced no applications on MainDrawing");
}
const createdEq = applyFirstOrderRule(eqRule, mainDrawing, eqApps[0]);
recorder.recordRuleApply(eqRule, "EqRule", eqApps[0], mainDrawing, createdEq, "MainDrawing", sortStore);

recorder.recordProveSuccess("MainDrawing");
const recordingScript = recorder.stop();

const exportCode = exportDrawingsToRocq(store.getAllDrawings(), sortStore);
const fullCode = exportCode + "\n" + recordingScript;
process.stdout.write(fullCode);
