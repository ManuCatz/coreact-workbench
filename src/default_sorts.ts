declare const sortStore: import('./index').SortStore;

{
    sortStore
        .newSort(
            "Vertex",
            {},
            { position: "position" },
            (data: any, context: import('d3').Selection<import('d3').BaseType, unknown, HTMLElement, any>) => {
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
            { width: "number", bend: "number" },
            (data: any, context: import('d3').Selection<import('d3').BaseType, unknown, HTMLElement, any>) => {
                const srcPos = data.source.position;
                const tgtPos = data.target.position;
                const bend = typeof data.bend === "number" ? data.bend : 0;

                const dx = tgtPos[0] - srcPos[0];
                const dy = tgtPos[1] - srcPos[1];
                const len = Math.sqrt(dx * dx + dy * dy);

                // Perpendicular unit vector (-dy/len, dx/len)
                const nx = len > 0 ? -dy / len : 0;
                const ny = len > 0 ? dx / len : 0;

                // Midpoint between source and target
                const mx = (srcPos[0] + tgtPos[0]) / 2;
                const my = (srcPos[1] + tgtPos[1]) / 2;

                // Control point for quadratic Bézier curve
                const cx = mx + bend * nx;
                const cy = my + bend * ny;

                // Curve midpoint at t = 0.5
                const midX = 0.25 * srcPos[0] + 0.5 * cx + 0.25 * tgtPos[0];
                const midY = 0.25 * srcPos[1] + 0.5 * cy + 0.25 * tgtPos[1];

                const lineGroup = context.insert("g", ":first-child");

                lineGroup.append("path")
                    .attr("d", `M ${srcPos[0]},${srcPos[1]} Q ${cx},${cy} ${tgtPos[0]},${tgtPos[1]}`)
                    .attr("fill", "none")
                    .attr("stroke", data.mono ? "#2c3e50" : "#999")
                    .attr("stroke-width", data.width)
                    .attr("stroke-dasharray", data.mono ? "5,5" : "none")
                    .attr("marker-end", data.mono ? "url(#arrowhead-mono)" : "url(#arrowhead-normal)");

                if (data.mono) {
                    // Draw a small indicator hook/circle if mono flag is true
                    lineGroup.append("circle")
                        .attr("cx", midX)
                        .attr("cy", midY)
                        .attr("r", 4)
                        .attr("fill", "#e74c3c");
                }

                if (data.label) {
                    context.append("text")
                        .attr("x", midX)
                        .attr("y", midY - 10) // slightly above the curve
                        .attr("text-anchor", "middle")
                        .attr("fill", "#333")
                        .attr("font-family", "sans-serif")
                        .attr("font-size", "12px")
                        .text(data.label);
                }

                return lineGroup; // Return the line group
            },
            (context: import('d3').Selection<import('d3').BaseType, unknown, HTMLElement, any>) => {
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
            (data: any, context: import('d3').Selection<import('d3').BaseType, unknown, HTMLElement, any>) => {
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
        )
        .newSort(
            "Triangle",
            { "1": "Edge", "2": "Edge", o: "Edge" },
            {},
            (data: any, context: import('d3').Selection<import('d3').BaseType, unknown, HTMLElement, any>) => {
                // A triangle is composed of three edges: "1", "2", and "o".
                // Draw it like a 2-cell: a double arrow from the target of edge
                // "1" to the middle of edge "o".
                const startPos = data["1"].target.position;

                // Compute the middle of edge "o" using the same quadratic Bézier
                // midpoint formula as the Edge sort's label placement.
                const srcPos = data["o"].source.position;
                const tgtPos = data["o"].target.position;
                const bend = typeof data["o"].bend === "number" ? data["o"].bend : 0;

                const dx = tgtPos[0] - srcPos[0];
                const dy = tgtPos[1] - srcPos[1];
                const len = Math.sqrt(dx * dx + dy * dy);
                const nx = len > 0 ? -dy / len : 0;
                const ny = len > 0 ? dx / len : 0;

                const mx = (srcPos[0] + tgtPos[0]) / 2;
                const my = (srcPos[1] + tgtPos[1]) / 2;
                const cx = mx + bend * nx;
                const cy = my + bend * ny;

                const midX = 0.25 * srcPos[0] + 0.5 * cx + 0.25 * tgtPos[0];
                const midY = 0.25 * srcPos[1] + 0.5 * cy + 0.25 * tgtPos[1];

                // Unit direction from the target of edge "1" to the middle of edge "o"
                const vx = midX - startPos[0];
                const vy = midY - startPos[1];
                const vLen = Math.sqrt(vx * vx + vy * vy);
                const ux = vLen > 0 ? vx / vLen : 1;
                const uy = vLen > 0 ? vy / vLen : 0;

                // Perpendicular unit vector for offsetting the two arrow lines
                const px = -uy;
                const py = ux;

                const offset = 6;
                const startGap = 24; // Clear the r=20 vertex circle

                const group = context.append("g");

                for (const side of [-1, 1]) {
                    const startX = startPos[0] + ux * startGap + px * offset * side;
                    const startY = startPos[1] + uy * startGap + py * offset * side;
                    const endX = midX + px * offset * side;
                    const endY = midY + py * offset * side;

                    group.append("path")
                        .attr("d", `M ${startX},${startY} L ${endX},${endY}`)
                        .attr("fill", "none")
                        .attr("stroke", "#8e44ad")
                        .attr("stroke-width", 2)
                        .attr("marker-end", "url(#arrowhead-2cell)");
                }

                return group;
            },
            (context: import('d3').Selection<import('d3').BaseType, unknown, HTMLElement, any>) => {
                // initContext: Set up SVG Defs for the 2-cell Arrowhead Marker
                let defs = context.select("defs") as any;
                if (defs.empty()) {
                    defs = context.append("defs") as any;
                }

                defs.append("marker")
                    .attr("id", "arrowhead-2cell")
                    .attr("viewBox", "0 -5 10 10")
                    .attr("refX", 9) // Tip of the arrow lands at the middle of edge "o"
                    .attr("refY", 0)
                    .attr("orient", "auto")
                    .attr("markerWidth", 8)
                    .attr("markerHeight", 8)
                    .append("path")
                    .attr("d", "M0,-5L10,0L0,5")
                    .attr("fill", "#8e44ad");
            }
        );
}
