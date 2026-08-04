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
            let defs = context.select("defs");
            if (defs.empty()) {
                defs = context.append("defs");
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

            const L = 15; // Length of corner legs
            
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

            // Base point (shifted away from the vertex circle along both vectors)
            const baseX = V[0] + ux1 * offset + ux2 * offset;
            const baseY = V[1] + uy1 * offset + uy2 * offset;

            // The three points of the corner (inward pointing)
            const pnt1 = [baseX + ux1 * size, baseY]; // Point on Leg 1 (Wait, need proper vector addition)
            
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
const e0 = drawing.newArtefact("Edge", { source: v0, target: v1 }, { width: 4, label: "e0" });
const e1 = drawing.newArtefact("Edge", { source: v1, target: v2, mono: true }, { width: 2, label: "e1" }); // Using the mono flag in dependencies!
const e2 = drawing.newArtefact("Edge", { source: v2, target: v0 }, { width: 2, label: "e2" });

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
    drawing.newArtefact("Edge", { source: v0 }, { width: 4 });
} catch (e) {
    console.error("Caught expected error for missing dependency:", (e as Error).message);
}

try {
    drawing.newArtefact("Edge", { source: v0, target: e0 }, { width: 4 });
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

    // Recursive function to build the tree DOM
    function buildTreeNode(artefact: Artefact, dependencyKey?: string, isTagGroupCtx?: string): HTMLElement {
        const nodeDiv = document.createElement("div");
        nodeDiv.className = "tree-node";
        
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

        // Remove button action
        removeBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            if (isTagGroupCtx) {
                delete artefact.dependencies[isTagGroupCtx];
            } else {
                drawing.removeArtefact(artefact);
            }
            // Redraw Canvas
            svgContext.selectAll("*").remove();
            drawing.draw(svgContext);
            // Re-render UI
            renderMenu();
        });

        // Interaction Logic (Hover)
        labelSpan.addEventListener("mouseenter", () => {
            // Calculate active set
            const activeSet = artefact.getSelfAndDependencies();

            // Update Canvas & UI Opacities
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
        });

        labelSpan.addEventListener("mouseleave", () => {
            // Reset Canvas & UI Opacities
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
                    svgContext.selectAll("*").remove();
                    drawing.draw(svgContext);
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

    // Render the groups
    for (const [sortName, artefacts] of Object.entries(grouped)) {
        const groupHeader = document.createElement("h3");
        groupHeader.textContent = `${sortName} (${artefacts.length})`;
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
}

// Initial UI Render
renderMenu();
