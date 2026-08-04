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
        }
    )
    .newSort(
        "Edge",
        { source: "Vertex", target: "Vertex" }, // Dependencies
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
    .newFlag("mono", "Edge")
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

            context.append("path")
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
const e1 = drawing.newArtefact("Edge", { source: v1, target: v2 }, { width: 2, label: "e1", mono: true }); // Using the mono flag!
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
    drawing.newArtefact("Edge", { source: v0, target: v1 }, { width: 4, unexpected: true });
} catch (e) {
    console.error("Caught expected error for unexpected attribute:", (e as Error).message);
}

try {
    drawing.newArtefact("Edge", { source: v0, target: v1 }, { width: 4, mono: "yes" });
} catch (e) {
    console.error("Caught expected error for bad flag type:", (e as Error).message);
}
