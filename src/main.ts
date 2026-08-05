import * as d3 from 'd3';
import { SortStore, Drawing, Artefact, EqualityArtefact, Layer, DrawingStore, findRuleApplications } from './index';
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
const e1 = drawing.newArtefact("Edge", { source: v1, target: v2, mono: true }, { width: 2, bend: 30, label: "e1" }, "layer-1");
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
    inputX: HTMLInputElement;
    inputY: HTMLInputElement;
    pickBtn: HTMLButtonElement;
} | null = null;

svgContext.on("click", (event: MouseEvent) => {
    if (activePositionPicker) {
        event.stopPropagation();
        const coords = d3.pointer(event, svgContext.node());
        const x = Math.round(coords[0]);
        const y = Math.round(coords[1]);

        activePositionPicker.artefact.data[activePositionPicker.attrName] = [x, y];
        activePositionPicker.inputX.value = x.toString();
        activePositionPicker.inputY.value = y.toString();

        activePositionPicker.pickBtn.style.backgroundColor = "";
        activePositionPicker = null;
        d3.select("body").style("cursor", "default");

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

// Hierarchy Check: Try creating an edge in "root" layer whose target vertex is in "layer-1"
let v_layer1: Artefact;
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

// Save drawing as a rule-compliant drawing
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
drawingStore.saveDrawing("ComposableEdges", ruleDrawing);
console.log("Saved 'ComposableEdges' rule, isRule =", drawingStore.getDrawing("ComposableEdges")!.isRule);

const tempRuleDraw = new Drawing(sortStore);
drawingStore.loadDrawing("ComposableEdges", tempRuleDraw);
const ruleApps = findRuleApplications(tempRuleDraw, drawing);
console.log("ComposableEdges applications:", ruleApps.length);

// 7. Render UI Menu & Interaction
let activeDrawingName: string | null = "Rule Drawing Demo";
let inspectedArtefact: Artefact | null = null;

let draftArtefact: {
    sortName: string;
    dependencies: Record<string, Artefact | boolean>;
    data: Record<string, any>;
    layerId: string;
} | null = null;

let dependencyPickingFor: string | null = null;

let mergeMode: boolean = false;
let mergeFirstArtefact: Artefact | null = null;
let mergeSecondArtefact: Artefact | null = null;
let mergePickingFor: "first" | "second" | null = null;

function startMergeMode(preselectFirst: Artefact | null = null): void {
    draftArtefact = null;
    dependencyPickingFor = null;
    if (activePositionPicker) {
        activePositionPicker.pickBtn.style.backgroundColor = "";
        activePositionPicker = null;
        d3.select("body").style("cursor", "default");
    }

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
        const ruleCheck = drawingStore.checkIsRule(drawing);
        if (ruleCheck.isRule) {
            tagEl.innerHTML = `<span class="rule-badge" title="This drawing satisfies rule conditions">Rule</span>`;
        } else {
            tagEl.innerHTML = "";
        }
    }
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
}

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

        rowDiv.appendChild(titleSpan);
        rowDiv.appendChild(hideBtn);
        rowDiv.appendChild(focusBtn);
        rowDiv.appendChild(colorCheckbox);
        rowDiv.appendChild(colorInput);
        rowDiv.appendChild(addChildBtn);
        rowDiv.appendChild(deleteBtn);
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
            for (const art of allArtefacts) {
                let opacity = 0.35;
                if (art === mergeFirstArtefact || art === mergeSecondArtefact) {
                    opacity = 1.0;
                } else if (mergeFirstArtefact && drawing.areDependenciesEqual(mergeFirstArtefact, art)) {
                    opacity = 0.85;
                } else if (!mergeFirstArtefact) {
                    opacity = 0.85;
                }

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
            .map(([key, _]) => key);
            
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

        headerDiv.appendChild(toggleIcon);
        headerDiv.appendChild(labelSpan);
        headerDiv.appendChild(layerBadge);
        headerDiv.appendChild(removeBtn);
        nodeDiv.appendChild(headerDiv);

        const uiNodes = uiNodeMap.get(artefact);
        if (uiNodes) {
            uiNodes.push(nodeDiv);
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
                        dependencyPickingFor = null;
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
            }
            renderMenu();
            renderInspector();
        });

        headerDiv.addEventListener("mouseenter", (e) => {
            e.stopPropagation();
            applyOpacities(artefact);
        });

        headerDiv.addEventListener("mouseleave", (e) => {
            e.stopPropagation();
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
                layerId: defaultLayerId
            };
            dependencyPickingFor = null;
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
            ? artefacts.filter(art => art.layerId === focusedId) 
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
        rowDiv.className = `drawing-row${isActive ? " active" : ""}`;

        const titleSpan = document.createElement("span");
        titleSpan.className = "drawing-title";
        titleSpan.textContent = savedDrawing.name;
        titleSpan.title = `Drawing: ${savedDrawing.name} (${savedDrawing.layers.length} layers, ${savedDrawing.artefacts.length} artefacts)${savedDrawing.isRule ? ' [Rule]' : ''}`;

        rowDiv.appendChild(titleSpan);

        if (isActive) {
            const activeBadge = document.createElement("span");
            activeBadge.className = "active-badge";
            activeBadge.textContent = "Editing";
            activeBadge.title = "Currently active on canvas";
            rowDiv.appendChild(activeBadge);
        }

        if (savedDrawing.isRule) {
            const badge = document.createElement("span");
            badge.className = "rule-badge";
            badge.textContent = "Rule";
            badge.title = "This drawing satisfies rule conditions";
            rowDiv.appendChild(badge);
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
                    inspectedArtefact = null;
                    draftArtefact = null;
                    dependencyPickingFor = null;
                    if (activePositionPicker) {
                        activePositionPicker = null;
                        d3.select("body").style("cursor", "default");
                    }
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

        const exportBtn = document.createElement("button");
        exportBtn.className = "layer-btn";
        exportBtn.textContent = "Export";
        exportBtn.title = `Export drawing '${savedDrawing.name}' to JSON file`;
        exportBtn.addEventListener("click", () => {
            try {
                const jsonStr = drawingStore.exportDrawingJSON(savedDrawing.name);
                const blob = new Blob([jsonStr], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `${savedDrawing.name.replace(/[^a-z0-9_-]/gi, '_')}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            } catch (err) {
                alert(`Error exporting drawing:\n${(err as Error).message}`);
            }
        });

        const deleteBtn = document.createElement("button");
        deleteBtn.className = "layer-btn";
        deleteBtn.style.color = "#e74c3c";
        deleteBtn.textContent = "×";
        deleteBtn.title = `Delete drawing '${savedDrawing.name}'`;
        deleteBtn.addEventListener("click", () => {
            if (confirm(`Delete drawing '${savedDrawing.name}'?`)) {
                if (savedDrawing.name === activeDrawingName) {
                    activeDrawingName = null;
                }
                drawingStore.deleteDrawing(savedDrawing.name);
                updateActiveDrawingBanner();
                renderDrawingsStore();
            }
        });

        rowDiv.appendChild(loadBtn);
        rowDiv.appendChild(exportBtn);
        rowDiv.appendChild(deleteBtn);
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
            applications = findRuleApplications(ruleDrawing, drawing);
        } catch {
            continue;
        }

        const patternArts = ruleDrawing.getArtefacts().filter(a => a.sortName !== "Equality");
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
            rowDiv.className = "rule-app-row";

            const nameSpan = document.createElement("div");
            nameSpan.className = "rule-app-name";
            nameSpan.textContent = savedRule.name;

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

            const activeSet = new Set<Artefact>(app.matchedArtefacts.values());

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

// Save Drawing Button Listener
const saveDrawingBtn = document.getElementById("save-drawing-btn");
if (saveDrawingBtn) {
    saveDrawingBtn.addEventListener("click", () => {
        const name = prompt("Enter a name for the drawing:");
        if (name && name.trim()) {
            try {
                drawingStore.saveDrawing(name.trim(), drawing);
                activeDrawingName = name.trim();
                updateActiveDrawingBanner();
                renderDrawingsStore();
            } catch (err) {
                alert(`Error saving drawing:\n${(err as Error).message}`);
            }
        }
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
                const imported = drawingStore.importDrawingJSON(jsonText);
                if (confirm(`Imported drawing '${imported.name}'. Would you like to load it onto the canvas now?`)) {
                    drawingStore.loadDrawing(imported.name, drawing);
                    activeDrawingName = imported.name;
                    inspectedArtefact = null;
                    draftArtefact = null;
                    dependencyPickingFor = null;
                    if (activePositionPicker) {
                        activePositionPicker = null;
                        d3.select("body").style("cursor", "default");
                    }
                    updateCanvas();
                    renderLayersTree();
                    renderMenu();
                    renderInspector();
                }
                renderDrawingsStore();
            } catch (err) {
                alert(`Error importing drawing:\n${(err as Error).message}`);
            }
        };

        reader.readAsText(file);
    });
}

// Clear All Button Listener
const clearBtn = document.getElementById("clear-btn");
if (clearBtn) {
    clearBtn.addEventListener("click", () => {
        if (confirm("Are you sure you want to clear all artefacts and layers?")) {
            drawing.clear();
            activeDrawingName = null;
            inspectedArtefact = null;
            draftArtefact = null;
            dependencyPickingFor = null;
            if (activePositionPicker) {
                activePositionPicker = null;
                d3.select("body").style("cursor", "default");
            }
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
                inspectedArtefact = null;
                draftArtefact = null;
                dependencyPickingFor = null;
                if (activePositionPicker) {
                    activePositionPicker = null;
                    d3.select("body").style("cursor", "default");
                }

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
                const selectEl = document.createElement("select");
                const defaultOpt = document.createElement("option");
                defaultOpt.value = "";
                defaultOpt.textContent = "-- Select 2nd Artefact --";
                selectEl.appendChild(defaultOpt);

                for (let i = 0; i < candidates.length; i++) {
                    const cand = candidates[i];
                    const opt = document.createElement("option");
                    opt.value = i.toString();
                    const layerObj = drawing.getLayer(cand.layerId);
                    opt.textContent = `${cand.data.label || "(unnamed)"} (${cand.sortName} in '${layerObj ? layerObj.name : cand.layerId}')`;
                    if (cand === mergeSecondArtefact) opt.selected = true;
                    selectEl.appendChild(opt);
                }

                selectEl.addEventListener("change", (e) => {
                    const val = (e.target as HTMLSelectElement).value;
                    if (val !== "") {
                        const idx = parseInt(val, 10);
                        mergeSecondArtefact = candidates[idx];
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
                        activePositionPicker = null;
                        d3.select("body").style("cursor", "default");
                        pickBtn.style.backgroundColor = "";
                    } else {
                        if (activePositionPicker) {
                            activePositionPicker.pickBtn.style.backgroundColor = "";
                        }
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
                group.className = "form-group checkbox";

                const input = document.createElement("input");
                input.type = "checkbox";
                input.checked = draftArtefact.dependencies[flagKey] === true;

                const label = document.createElement("label");
                label.textContent = flagKey;

                input.addEventListener("change", (e) => {
                    if ((e.target as HTMLInputElement).checked) {
                        draftArtefact!.dependencies[flagKey] = true;
                    } else {
                        delete draftArtefact!.dependencies[flagKey];
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
                    drawing.newArtefact(
                        draftArtefact!.sortName,
                        draftArtefact!.dependencies,
                        draftArtefact!.data,
                        draftArtefact!.layerId
                    );
                    draftArtefact = null;
                    dependencyPickingFor = null;
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
                    activePositionPicker = null;
                    d3.select("body").style("cursor", "default");
                    pickBtn.style.backgroundColor = "";
                } else {
                    if (activePositionPicker) {
                        activePositionPicker.pickBtn.style.backgroundColor = "";
                    }
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
            group.className = "form-group checkbox";
            
            const input = document.createElement("input");
            input.type = "checkbox";
            input.checked = inspectedArtefact.dependencies[flagKey] === true;
            
            const label = document.createElement("label");
            label.textContent = flagKey;
            
            input.addEventListener("change", (e) => {
                const target = e.target as HTMLInputElement;
                if (target.checked) {
                    inspectedArtefact!.dependencies[flagKey] = true as any;
                } else {
                    delete inspectedArtefact!.dependencies[flagKey];
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
