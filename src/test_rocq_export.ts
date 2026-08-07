import * as fs from "fs";
import * as path from "path";
import * as d3 from "d3";
import { SortStore, Drawing, DrawingStore } from "./index";
import { exportDrawingsToRocq } from "./rocq_export";

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

const code = exportDrawingsToRocq(store.getAllDrawings(), sortStore);
process.stdout.write(code);
