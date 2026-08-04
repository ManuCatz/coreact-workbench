import * as d3 from 'd3';
import { SortStore, Drawing } from './index';

// 1. Initialize the Sort Store
const sortStore = new SortStore();

// 2. Define our Sorts (Vertex and Edge)
sortStore
    .newSort(
        "Vertex",
        {}, // No dependencies
        { position: "position" },
        (data: any, context: d3.Selection<d3.BaseType, unknown, HTMLElement, any>) => {
            // Draw a vertex (circle) at data.position
            const group = context.append("g")
                .attr("transform", `translate(${data.position[0]}, ${data.position[1]})`);

            group.append("circle")
                .attr("r", 20)
                .attr("fill", "#69b3a2")
                .attr("stroke", "#333")
                .attr("stroke-width", 2);

            if (data.label) {
                group.append("text")
                    .attr("text-anchor", "middle")
                    .attr("dy", ".3em") // Vertically center text
                    .attr("fill", "white")
                    .attr("font-family", "sans-serif")
                    .attr("font-size", "14px")
                    .text(data.label);
            }
            
            return group; // Return the group to store in Artefact
        }
    )
    .newSort(
        "Edge",
        { source: "Vertex", target: "Vertex", mono: "flag" }, // Dependencies + flag
        { width: "number" },
        (data: any, context: d3.Selection<d3.BaseType, unknown, HTMLElement, any>) => {
            // Draw an edge (line) from data.source to data.target with given width
            // Note: In D3, SVG elements are drawn in the order they are appended.
            // To ensure lines appear *behind* vertices, we might ideally use groups or layer management,
            // but for this prototype, we'll just append them to the context.
            
            // The data object contains 'source' and 'target' which are the data objects of the dependencies
            const srcPos = data.source.position;
            const tgtPos = data.target.position;

            const lineGroup = context.insert("g", ":first-child");

            lineGroup.append("line")
                .attr("x1", srcPos[0])
                .attr("y1", srcPos[1])
                .attr("x2", tgtPos[0])
                .attr("y2", tgtPos[1])
                .attr("stroke", data.mono ? "#2c3e50" : "#999")
                .attr("stroke-width", data.width)
                .attr("stroke-dasharray", data.mono ? "5,5" : "none")
                .attr("marker-end", data.mono ? "url(#arrowhead-mono)" : "url(#arrowhead-normal)");

            if (data.mono) {
                // Draw a small indicator hook/circle if mono flag is true
                const midX = (srcPos[0] + tgtPos[0]) / 2;
                const midY = (srcPos[1] + tgtPos[1]) / 2;
                
                lineGroup.append("circle")
                    .attr("cx", midX)
                    .attr("cy", midY)
                    .attr("r", 4)
                    .attr("fill", "#e74c3c");
            }

            if (data.label) {
                // Calculate midpoint for label
                const midX = (srcPos[0] + tgtPos[0]) / 2;
                const midY = (srcPos[1] + tgtPos[1]) / 2;

                context.append("text")
                    .attr("x", midX)
                    .attr("y", midY - 10) // slightly above the line
                    .attr("text-anchor", "middle")
                    .attr("fill", "#333")
                    .attr("font-family", "sans-serif")
                    .attr("font-size", "12px")
                    .text(data.label);
            }
            
            return lineGroup; // Return the line group
        },
        (context: d3.Selection<d3.BaseType, unknown, HTMLElement, any>) => {
            // initContext: Set up SVG Defs for Arrowhead Markers
            let defs = context.select("defs") as any;
            if (defs.empty()) {
                defs = context.append("defs") as any;
            }

            // Standard arrowhead
            defs.append("marker")
                .attr("id", "arrowhead-normal")
                .attr("viewBox", "0 -5 10 10")
                .attr("refX", 25) // Offset to sit on the edge of the r=20 circle
                .attr("refY", 0)
                .attr("orient", "auto")
                .attr("markerWidth", 8)
                .attr("markerHeight", 8)
                .append("path")
                .attr("d", "M0,-5L10,0L0,5")
                .attr("fill", "#999");

            // Mono arrowhead
            defs.append("marker")
                .attr("id", "arrowhead-mono")
                .attr("viewBox", "0 -5 10 10")
                .attr("refX", 25) 
                .attr("refY", 0)
                .attr("orient", "auto")
                .attr("markerWidth", 8)
                .attr("markerHeight", 8)
                .append("path")
                .attr("d", "M0,-5L10,0L0,5")
                .attr("fill", "#2c3e50");
        }
    )
    .newSort(
        "Pullback",
        { p1: "Edge", p2: "Edge", q1: "Edge", q2: "Edge" },
        {},
        (data: any, context: d3.Selection<d3.BaseType, unknown, HTMLElement, any>) => {
            // Assume p1 and p2 share the pullback source vertex
            const V = data.p1.source.position;
            const T1 = data.p1.target.position;
            const T2 = data.p2.target.position;
            
            // Calculate normalized direction vectors
            const dx1 = T1[0] - V[0];
            const dy1 = T1[1] - V[1];
            const len1 = Math.sqrt(dx1*dx1 + dy1*dy1);
            const ux1 = dx1 / len1;
            const uy1 = dy1 / len1;

            const dx2 = T2[0] - V[0];
            const dy2 = T2[1] - V[1];
            const len2 = Math.sqrt(dx2*dx2 + dy2*dy2);
            const ux2 = dx2 / len2;
            const uy2 = dy2 / len2;

            // distance from the center of the vertex
            const offset = 25; 
            // size of the pullback corner legs
            const size = 15; 

            // Re-calculate points strictly using the unit vectors for arbitrary angles
            const p1x = V[0] + ux1 * offset + ux2 * (offset + size);
            const p1y = V[1] + uy1 * offset + uy2 * (offset + size);
            
            const p2x = V[0] + ux1 * (offset + size) + ux2 * (offset + size);
            const p2y = V[1] + uy1 * (offset + size) + uy2 * (offset + size); // The innermost corner
            
            const p3x = V[0] + ux1 * (offset + size) + ux2 * offset;
            const p3y = V[1] + uy1 * (offset + size) + uy2 * offset;

            return context.append("path")
                .attr("d", `M ${p1x},${p1y} L ${p2x},${p2y} L ${p3x},${p3y}`)
                .attr("fill", "none")
                .attr("stroke", "#333")
                .attr("stroke-width", 2)
                .attr("stroke-linejoin", "miter");
        }
    );

// 3. Create the Drawing instance
const drawing = new Drawing(sortStore);

console.log("Creating valid artefacts...");

// 4. Instantiate Artefacts (mimicking the pseudocode from the README)
// We add some offsets to position to make them visible on the 800x600 canvas
const v0 = drawing.newArtefact("Vertex", {}, { position: [200, 300], label: "v0" });
const v1 = drawing.newArtefact("Vertex", {}, { position: [600, 300], label: "v1" });
const v2 = drawing.newArtefact("Vertex", {}, { position: [400, 150], label: "v2" });

// Create edges connecting them
drawing.newArtefact("Edge", { source: v0, target: v1 }, { width: 4, label: "e0" });
drawing.newArtefact("Edge", { source: v1, target: v2, mono: true }, { width: 2, label: "e1" }); // Using the mono flag in dependencies!
drawing.newArtefact("Edge", { source: v2, target: v0 }, { width: 2, label: "e2" });

// --- Square Graph for Pullback Demo ---
console.log("Creating square graph artefacts...");

// A separate square placed further down the canvas
const sq_v0 = drawing.newArtefact("Vertex", {}, { position: [400, 400], label: "A" }); // Pullback object
const sq_v1 = drawing.newArtefact("Vertex", {}, { position: [600, 400], label: "B" });
const sq_v2 = drawing.newArtefact("Vertex", {}, { position: [400, 550], label: "C" });
const sq_v3 = drawing.newArtefact("Vertex", {}, { position: [600, 550], label: "D" });

const p1 = drawing.newArtefact("Edge", { source: sq_v0, target: sq_v1 }, { width: 2, label: "p1" });
const p2 = drawing.newArtefact("Edge", { source: sq_v0, target: sq_v2 }, { width: 2, label: "p2" });
const q1 = drawing.newArtefact("Edge", { source: sq_v1, target: sq_v3 }, { width: 2, label: "q1" });
const q2 = drawing.newArtefact("Edge", { source: sq_v2, target: sq_v3 }, { width: 2, label: "q2" });

// The Pullback artefact itself
drawing.newArtefact("Pullback", { p1, p2, q1, q2 }, {});

// 5. Draw the artefacts onto the D3 context
// We select our canvas SVG element
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

// To draw edges behind vertices, it's a common D3 practice to use layer groups. 
// However, according to our architecture, drawing.draw(context) will iterate sequentially.
// Thus, to keep things strictly aligned with the class structure, we will just call draw().
// Wait, if we added them in order (Vertices then Edges), edges will draw ON TOP of vertices in SVG.
// To fix this simply, let's clear the SVG, then draw.
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
    drawing.newArtefact("Edge", { source: v0, target: v1 }, { width: 4 });
} catch (e) {
    console.error("Caught expected error for missing dependency:", (e as Error).message);
}

try {
    // Note: passing v1 as 'target' is valid, but we need to trigger an error. Let's pass a Vertex where an Edge is expected.
    // However, source/target expect Vertex. We will pass sq_v0 (Vertex) as target, which is valid.
    // Actually, to fail, we should pass an Edge where a Vertex is expected, or missing target.
    // We will just let it fail for missing 'target' if we only provide 'source'.
    drawing.newArtefact("Edge", { source: v0 }, { width: 4 });
} catch (e) {
    console.error("Caught expected error for wrong dependency type:", (e as Error).message);
}

try {
    drawing.newArtefact("Edge", { source: v0, target: v1, unexpectedFlag: true }, { width: 4 });
} catch (e) {
    console.error("Caught expected error for unexpected dependency/flag:", (e as Error).message);
}

try {
    drawing.newArtefact("Edge", { source: v0, target: v1, mono: "yes" as any }, { width: 4 });
} catch (e) {
    console.error("Caught expected error for bad flag type:", (e as Error).message);
}

// 7. Render UI Menu & Interaction
import { Artefact } from './index';

let inspectedArtefact: Artefact | null = null;

let draftArtefact: {
    sortName: string;
    dependencies: Record<string, Artefact | boolean>;
    data: Record<string, any>;
} | null = null;

let dependencyPickingFor: string | null = null;

function updateCanvas(): void {
    svgContext.selectAll("*").remove();
    drawing.draw(svgContext);

    if (draftArtefact) {
        const sortDef = sortStore.getSort(draftArtefact.sortName);
        if (sortDef) {
            let canPreview = true;

            // Check non-flag dependencies
            for (const [depKey, expectedSort] of Object.entries(sortDef.dependencies)) {
                if (expectedSort !== "flag") {
                    if (!draftArtefact.dependencies[depKey]) {
                        canPreview = false;
                        break;
                    }
                }
            }

            // Check required attributes
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
                        sortDef.drawFunction
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
}

function renderMenu(): void {
    const menuContent = document.getElementById("menu-content");
    if (!menuContent) return;
    
    menuContent.innerHTML = "";
    const allArtefacts = drawing.getArtefacts();
    
    // Map to track UI elements associated with each artefact for dimming
    const uiNodeMap = new Map<Artefact, HTMLElement[]>();
    for (const art of allArtefacts) {
        uiNodeMap.set(art, []);
    }
    
    // Group by sortName
    const grouped = allArtefacts.reduce((acc, artefact) => {
        if (!acc[artefact.sortName]) acc[artefact.sortName] = [];
        acc[artefact.sortName].push(artefact);
        return acc;
    }, {} as Record<string, typeof allArtefacts>);

    // Helper to apply 50% opacity to irrelevant artefacts and UI elements
    function applyOpacities(target: Artefact | null) {
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

    // Recursive function to build the tree DOM
    function buildTreeNode(artefact: Artefact, dependencyKey?: string, isTagGroupCtx?: string): HTMLElement {
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
        
        let artefactLabel = artefact.data.label || "(unnamed)";
        
        // Extract and append true boolean flags to the label
        const activeFlags = Object.entries(artefact.dependencies)
            .filter(([_, val]) => val === true)
            .map(([key, _]) => key);
            
        if (activeFlags.length > 0) {
            artefactLabel += ` (${activeFlags.join(", ")})`;
        }

        const prefix = dependencyKey ? `${dependencyKey}: ` : "";
        labelSpan.textContent = `${prefix}${artefactLabel}`;
        
        const removeBtn = document.createElement("span");
        removeBtn.className = "remove-btn";
        removeBtn.textContent = "×";
        removeBtn.title = isTagGroupCtx ? `Remove tag '${isTagGroupCtx}'` : "Remove artefact";

        headerDiv.appendChild(toggleIcon);
        headerDiv.appendChild(labelSpan);
        headerDiv.appendChild(removeBtn);
        nodeDiv.appendChild(headerDiv);

        // Register this UI node for the artefact
        const uiNodes = uiNodeMap.get(artefact);
        if (uiNodes) {
            uiNodes.push(nodeDiv);
        }

        if (inspectedArtefact === artefact) {
            nodeDiv.classList.add("inspected");
        }

        // Remove button action
        removeBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            if (isTagGroupCtx) {
                delete artefact.dependencies[isTagGroupCtx];
            } else {
                drawing.removeArtefact(artefact);
            }
            // Redraw Canvas & UI
            updateCanvas();
            renderMenu();
        });

        // Interaction Logic (Click to Inspect or Pick Dependency)
        labelSpan.addEventListener("click", (e) => {
            e.stopPropagation();

            if (dependencyPickingFor && draftArtefact) {
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

        // Interaction Logic (Hover)
        labelSpan.addEventListener("mouseenter", () => {
            if (!inspectedArtefact) {
                applyOpacities(artefact);
            }
        });

        labelSpan.addEventListener("mouseleave", () => {
            if (!inspectedArtefact) {
                applyOpacities(null);
            }
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
            
            // 1. Render Artefact dependencies
            for (const [key, depArt] of depEntries) {
                const childNode = buildTreeNode(depArt, key);
                childrenDiv.appendChild(childNode);
            }

            // 2. Render Flag dependencies (tags) as child nodes
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

            // Toggle logic (click anywhere on header except the label)
            toggleIcon.addEventListener("click", (e) => {
                e.stopPropagation();
                nodeDiv.classList.toggle("expanded");
            });
        }

        return nodeDiv;
    }

    // Render the groups for all registered sorts
    for (const sortDef of sortStore.getAllSorts()) {
        const artefacts = grouped[sortDef.name] || [];
        const groupHeader = document.createElement("h3");
        
        const titleSpan = document.createElement("span");
        titleSpan.textContent = `${sortDef.name} (${artefacts.length})`;
        
        const addBtn = document.createElement("button");
        addBtn.className = "add-sort-btn";
        addBtn.textContent = "+";
        addBtn.title = `Add new ${sortDef.name}`;
        
        addBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            inspectedArtefact = null;

            // Default attribute values for creation draft
            const initialData: Record<string, any> = {};
            for (const [attrName, expectedType] of Object.entries(sortDef.attributes)) {
                if (expectedType === "position") {
                    initialData[attrName] = [300, 300];
                } else if (expectedType === "number") {
                    initialData[attrName] = 2;
                } else if (expectedType === "boolean") {
                    initialData[attrName] = false;
                } else if (expectedType === "string") {
                    initialData[attrName] = "";
                }
            }

            draftArtefact = {
                sortName: sortDef.name,
                dependencies: {},
                data: initialData
            };
            dependencyPickingFor = null;
            renderMenu();
            renderInspector();
            updateCanvas();
        });

        groupHeader.appendChild(titleSpan);
        groupHeader.appendChild(addBtn);
        menuContent.appendChild(groupHeader);

        for (const art of artefacts) {
            const rootNode = buildTreeNode(art);
            rootNode.classList.add("root-node");
            menuContent.appendChild(rootNode);
        }
    }

    // Render Tag Groups (e.g. "mono")
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
        const groupHeader = document.createElement("h3");
        groupHeader.textContent = `${tagName} (${artefacts.length})`;
        menuContent.appendChild(groupHeader);

        for (const art of artefacts) {
            const rootNode = buildTreeNode(art, undefined, tagName);
            rootNode.classList.add("root-node");
            menuContent.appendChild(rootNode);
        }
    }

    // Apply opacities based on active selection
    applyOpacities(inspectedArtefact);
}

// Initial UI Render
renderMenu();
renderInspector();

// Clear All Button Listener
const clearBtn = document.getElementById("clear-btn");
if (clearBtn) {
    clearBtn.addEventListener("click", () => {
        if (confirm("Are you sure you want to clear the entire drawing?")) {
            drawing.clear();
            inspectedArtefact = null;
            draftArtefact = null;
            dependencyPickingFor = null;
            if (activePositionPicker) {
                activePositionPicker = null;
                d3.select("body").style("cursor", "default");
            }
            updateCanvas();
            renderMenu();
            renderInspector();
        }
    });
}

// 8. Inspector Logic
function renderInspector() {
    const inspectorContent = document.getElementById("inspector-content");
    if (!inspectorContent) return;

    inspectorContent.innerHTML = "";

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

        // 1. Dependencies Section
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

        // Validate check
        let isValid = true;
        for (const [depKey, expectedSort] of Object.entries(sortDef.dependencies)) {
            if (expectedSort !== "flag" && !draftArtefact.dependencies[depKey]) {
                isValid = false;
                break;
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
                        draftArtefact!.data
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

    // Header
    const h3 = document.createElement("h3");
    h3.textContent = inspectedArtefact.sortName;
    h3.style.marginTop = "0";
    inspectorContent.appendChild(h3);

    // Helper to redraw on change
    const triggerUpdate = () => {
        svgContext.selectAll("*").remove();
        drawing.draw(svgContext);
        renderMenu();
    };

    // Build form fields
    const form = document.createElement("div");

    // 1. Label Field (Optional string)
    const labelGroup = document.createElement("div");
    labelGroup.className = "form-group";
    labelGroup.innerHTML = `<label>Label</label>`;
    const labelInput = document.createElement("input");
    labelInput.type = "text";
    labelInput.value = inspectedArtefact.data.label || "";
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

    // 3. Flags (Fake Dependencies)
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
            // Check if it's explicitly set to true in dependencies
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

    inspectorContent.appendChild(form);
}
