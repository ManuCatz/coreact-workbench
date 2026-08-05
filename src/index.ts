export interface SortDefinition {
    name: string;
    dependencies: Record<string, string>;
    attributes: Record<string, string>;
    drawFunction: (data: any, context: any) => any; // Now returns the element
    initContext?: (context: any) => void;
}

export class Layer {
    constructor(
        public id: string,
        public name: string,
        public parentId: string | null = null,
        public color: string = "#3498db",
        public colorEnabled: boolean = false,
        public visible: boolean = true
    ) {}
}

export class SortStore {
    private sorts: Map<string, SortDefinition> = new Map();

    getAllSorts(): SortDefinition[] {
        return Array.from(this.sorts.values());
    }

    newSort(
        name: string,
        dependencies: Record<string, string>,
        attributes: Record<string, string>,
        drawFunction: (data: any, context: any) => any, // Ensure this returns any
        initContext?: (context: any) => void
    ): this {
        // Consistency check: all dependencies must be already defined sorts, unless it's a flag
        for (const [depKey, depSortName] of Object.entries(dependencies)) {
            if (depSortName !== "flag" && !this.sorts.has(depSortName)) {
                throw new Error(`Consistency Check Failed: Dependency sort '${depSortName}' for dependency '${depKey}' in sort '${name}' is not defined.`);
            }
        }

        // Validate attribute types (basic check to ensure they are strings representing types)
        const validTypes = ["number", "string", "boolean", "position"];
        for (const [attrName, attrType] of Object.entries(attributes)) {
            if (!validTypes.includes(attrType)) {
                throw new Error(`Consistency Check Failed: Invalid attribute type '${attrType}' for attribute '${attrName}' in sort '${name}'.`);
            }
        }

        this.sorts.set(name, {
            name,
            dependencies,
            attributes,
            drawFunction,
            initContext
        });

        return this; // Enable chaining
    }

    getSort(name: string): SortDefinition | undefined {
        return this.sorts.get(name);
    }

    clear(): void {
        this.sorts.clear();
    }
}

export class Artefact {
    public svgElement: any = null; // Store the rendered SVG node

    constructor(
        public sortName: string,
        public dependencies: Record<string, Artefact | boolean>,
        public data: Record<string, any>,
        private drawFunction: (data: any, context: any) => any,
        public layerId: string = "root"
    ) {}

    getResolvedData(): any {
        const result = { ...this.data };
        for (const [key, depArtefact] of Object.entries(this.dependencies)) {
            if (typeof depArtefact === "boolean") {
                result[key] = depArtefact; // Just copy flags directly
            } else {
                result[key] = depArtefact.getResolvedData();
            }
        }
        return result;
    }

    getSelfAndDependencies(): Set<Artefact> {
        const result = new Set<Artefact>();
        result.add(this);
        for (const depArtefact of Object.values(this.dependencies)) {
            if (typeof depArtefact !== "boolean") {
                for (const nestedDep of depArtefact.getSelfAndDependencies()) {
                    result.add(nestedDep);
                }
            }
        }
        return result;
    }

    draw(context: any): void {
        this.svgElement = this.drawFunction(this.getResolvedData(), context);
    }
}

export class Drawing {
    private artefacts: Artefact[] = [];
    private layers: Map<string, Layer> = new Map();
    private focusedLayerId: string | null = null;

    constructor(private sortStore: SortStore) {
        this.addLayer("root", "Root Layer", null, "#3498db", false);
    }

    public addLayer(
        id: string,
        name: string,
        parentId: string | null = null,
        color: string = "#3498db",
        colorEnabled: boolean = false,
        visible: boolean = true
    ): Layer {
        if (this.layers.has(id)) {
            throw new Error(`Layer with id '${id}' already exists.`);
        }
        if (parentId !== null && !this.layers.has(parentId)) {
            throw new Error(`Parent layer '${parentId}' does not exist.`);
        }
        const layer = new Layer(id, name, parentId, color, colorEnabled, visible);
        this.layers.set(id, layer);
        return layer;
    }

    public isLayerVisible(layerId: string): boolean {
        let current: string | null = layerId;
        while (current && this.layers.has(current)) {
            const layer = this.layers.get(current)!;
            if (!layer.visible) {
                return false;
            }
            current = layer.parentId;
        }
        return true;
    }

    public getLayer(id: string): Layer | undefined {
        return this.layers.get(id);
    }

    public getAllLayers(): Layer[] {
        return Array.from(this.layers.values());
    }

    public getFocusedLayerId(): string | null {
        return this.focusedLayerId;
    }

    public setFocusedLayer(id: string | null): void {
        if (id !== null && !this.layers.has(id)) {
            throw new Error(`Layer '${id}' does not exist.`);
        }
        this.focusedLayerId = id;
    }

    public getAncestors(layerId: string): Set<string> {
        const ancestors = new Set<string>();
        let current: string | null = layerId;
        while (current && this.layers.has(current)) {
            ancestors.add(current);
            const layer: Layer = this.layers.get(current)!;
            current = layer.parentId;
        }
        return ancestors;
    }

    public getDescendants(layerId: string): Set<string> {
        const descendants = new Set<string>();
        descendants.add(layerId);

        let addedNew = true;
        while (addedNew) {
            addedNew = false;
            for (const layer of this.layers.values()) {
                if (layer.parentId && descendants.has(layer.parentId) && !descendants.has(layer.id)) {
                    descendants.add(layer.id);
                    addedNew = true;
                }
            }
        }
        return descendants;
    }

    public removeLayer(layerId: string): void {
        if (!this.layers.has(layerId)) return;

        const descendants = this.getDescendants(layerId);

        // Remove all artefacts in any of these layers
        this.artefacts = this.artefacts.filter(art => !descendants.has(art.layerId));

        // Remove the layers
        for (const id of descendants) {
            this.layers.delete(id);
        }

        if (this.focusedLayerId && descendants.has(this.focusedLayerId)) {
            this.focusedLayerId = null;
        }

        // If all layers were deleted, re-create default root layer
        if (this.layers.size === 0) {
            this.addLayer("root", "Root Layer", null, "#3498db", false);
        }
    }

    public setArtefactLayer(artefact: Artefact, targetLayerId: string): void {
        if (!this.layers.has(targetLayerId)) {
            throw new Error(`Layer '${targetLayerId}' does not exist.`);
        }

        const allowedAncestors = this.getAncestors(targetLayerId);

        // Check artefact's dependencies
        for (const [depKey, depVal] of Object.entries(artefact.dependencies)) {
            if (typeof depVal !== "boolean") {
                if (!allowedAncestors.has(depVal.layerId)) {
                    const depLayerName = this.layers.get(depVal.layerId)?.name || depVal.layerId;
                    const targetLayerName = this.layers.get(targetLayerId)?.name || targetLayerId;
                    throw new Error(`Consistency Check Failed: Dependency '${depKey}' (in layer '${depLayerName}') is not in layer '${targetLayerName}' or any of its lower ancestor layers.`);
                }
            }
        }

        // Check artefacts that depend on this artefact
        for (const otherArt of this.artefacts) {
            if (otherArt === artefact) continue;
            for (const depVal of Object.values(otherArt.dependencies)) {
                if (depVal === artefact) {
                    const otherAllowed = this.getAncestors(otherArt.layerId);
                    if (!otherAllowed.has(targetLayerId)) {
                        const targetLayerName = this.layers.get(targetLayerId)?.name || targetLayerId;
                        const otherLayerName = this.layers.get(otherArt.layerId)?.name || otherArt.layerId;
                        throw new Error(`Consistency Check Failed: Artefact '${otherArt.data.label || otherArt.sortName}' (in layer '${otherLayerName}') depends on this artefact, but layer '${targetLayerName}' is not in its lower ancestor layers.`);
                    }
                }
            }
        }

        artefact.layerId = targetLayerId;
    }

    public getLayersTopological(): Layer[] {
        const result: Layer[] = [];
        const visited = new Set<string>();

        const visit = (layerId: string) => {
            if (visited.has(layerId)) return;
            const layer = this.layers.get(layerId);
            if (!layer) return;
            if (layer.parentId && this.layers.has(layer.parentId) && !visited.has(layer.parentId)) {
                visit(layer.parentId);
            }
            visited.add(layerId);
            result.push(layer);
        };

        for (const layerId of this.layers.keys()) {
            visit(layerId);
        }
        return result;
    }

    newArtefact(
        sortName: string,
        dependencies: Record<string, Artefact | boolean>,
        data: Record<string, any>,
        layerId?: string
    ): Artefact {
        const sortDef = this.sortStore.getSort(sortName);
        if (!sortDef) {
            throw new Error(`Consistency Check Failed: Sort '${sortName}' is not defined.`);
        }

        const targetLayerId = layerId || (this.layers.size > 0 ? Array.from(this.layers.keys())[0] : "root");
        if (!this.layers.has(targetLayerId)) {
            throw new Error(`Consistency Check Failed: Layer '${targetLayerId}' does not exist.`);
        }

        const allowedAncestors = this.getAncestors(targetLayerId);

        // 1. Validate Dependencies
        for (const [depKey, expectedSortName] of Object.entries(sortDef.dependencies)) {
            const providedValue = dependencies[depKey];
            
            if (expectedSortName === "flag") {
                if (providedValue !== undefined && typeof providedValue !== "boolean") {
                    throw new Error(`Consistency Check Failed: Dependency '${depKey}' expected flag (boolean), but got '${typeof providedValue}'.`);
                }
            } else {
                if (!providedValue || typeof providedValue === "boolean") {
                    throw new Error(`Consistency Check Failed: Missing dependency '${depKey}' for artefact of sort '${sortName}'.`);
                }
                if (providedValue.sortName !== expectedSortName) {
                    throw new Error(`Consistency Check Failed: Dependency '${depKey}' expected sort '${expectedSortName}', but got '${providedValue.sortName}'.`);
                }
                // Hierarchy validation: dependency layer must be in allowedAncestors
                if (!allowedAncestors.has(providedValue.layerId)) {
                    const depLayerName = this.layers.get(providedValue.layerId)?.name || providedValue.layerId;
                    const targetLayerName = this.layers.get(targetLayerId)?.name || targetLayerId;
                    throw new Error(`Consistency Check Failed: Dependency '${depKey}' (in layer '${depLayerName}') is not in layer '${targetLayerName}' or any of its lower ancestor layers.`);
                }
            }
        }

        // Verify no extra unexpected dependencies were provided
        for (const providedKey of Object.keys(dependencies)) {
            if (!sortDef.dependencies[providedKey]) {
                throw new Error(`Consistency Check Failed: Unexpected dependency '${providedKey}' provided for artefact of sort '${sortName}'.`);
            }
        }

        // 2. Validate Data Attributes (Strict Check)
        for (const [attrName, expectedType] of Object.entries(sortDef.attributes)) {
            const value = data[attrName];
            if (value === undefined) {
                throw new Error(`Consistency Check Failed: Missing data attribute '${attrName}' for artefact of sort '${sortName}'.`);
            }

            // Primitive type checking
            if (expectedType === "position") {
                if (!Array.isArray(value) || value.length !== 2 || typeof value[0] !== "number" || typeof value[1] !== "number") {
                    throw new Error(`Consistency Check Failed: Data attribute '${attrName}' expected to be of primitive type 'position' ([number, number]), but got ${JSON.stringify(value)}.`);
                }
            } else if (typeof value !== expectedType) {
                throw new Error(`Consistency Check Failed: Data attribute '${attrName}' expected to be '${expectedType}', but got '${typeof value}'.`);
            }
        }

        // Check for unexpected properties
        for (const key of Object.keys(data)) {
            if (key === "label") {
                if (typeof data[key] !== "string") {
                    throw new Error(`Consistency Check Failed: Data attribute 'label' expected to be 'string', but got '${typeof data[key]}'.`);
                }
            } else if (sortDef.attributes[key] === undefined) {
                throw new Error(`Consistency Check Failed: Unexpected data attribute '${key}' provided for sort '${sortName}'.`);
            }
        }

        const artefact = new Artefact(sortName, dependencies, data, sortDef.drawFunction, targetLayerId);
        this.artefacts.push(artefact);
        
        return artefact;
    }

    draw(context: any): void {
        // 1. Initialize context for all defined sorts (e.g., for SVG defs/markers)
        for (const sortDef of this.sortStore.getAllSorts()) {
            if (sortDef.initContext) {
                sortDef.initContext(context);
            }
        }

        // 2. Draw layers in topological order
        const orderedLayers = this.getLayersTopological();
        for (const layer of orderedLayers) {
            const layerGroup = context.append("g")
                .attr("class", "layer-group")
                .attr("data-layer-id", layer.id);

            if (!this.isLayerVisible(layer.id)) {
                layerGroup.attr("display", "none");
            }

            // Set Opacity based on Focus
            if (this.focusedLayerId !== null) {
                const opacity = (layer.id === this.focusedLayerId) ? 1.0 : 0.5;
                layerGroup.attr("opacity", opacity);
            } else {
                layerGroup.attr("opacity", 1.0);
            }

            // Draw artefacts belonging to this layer
            const layerArtefacts = this.artefacts.filter(a => a.layerId === layer.id);
            for (const artefact of layerArtefacts) {
                artefact.draw(layerGroup);
            }

            // Apply partial layer color if colorEnabled
            if (layer.colorEnabled && layer.color) {
                layerGroup.classed("layer-colored", true);
                layerGroup.selectAll("line, path").attr("stroke", layer.color);
                layerGroup.selectAll("circle").attr("stroke", layer.color).attr("fill", layer.color);
            }
        }
    }

    getArtefacts(): Artefact[] {
        return this.artefacts;
    }

    removeArtefact(target: Artefact): void {
        this.artefacts = this.artefacts.filter(art => !art.getSelfAndDependencies().has(target));
    }

    clear(keepDefaultRoot: boolean = true): void {
        this.artefacts = [];
        this.layers.clear();
        this.focusedLayerId = null;
        if (keepDefaultRoot) {
            this.addLayer("root", "Root Layer", null, "#3498db", false);
        }
    }
}

export interface LayerData {
    id: string;
    name: string;
    parentId: string | null;
    color: string;
    colorEnabled: boolean;
    visible?: boolean;
}

export interface ArtefactData {
    id: string;
    sortName: string;
    layerId: string;
    dependencies: Record<string, string | boolean>;
    data: Record<string, any>;
}

export interface SavedDrawing {
    name: string;
    layers: LayerData[];
    artefacts: ArtefactData[];
    isRule: boolean;
}

export class DrawingStore {
    private drawings: Map<string, SavedDrawing> = new Map();

    public checkIsRule(drawing: Drawing): { isRule: boolean; reason?: string } {
        const layers = drawing.getAllLayers();
        const rootLayers = layers.filter(l => l.parentId === null);

        // Rule condition 1: At most one root layer
        if (rootLayers.length > 1) {
            return {
                isRule: false,
                reason: `Drawing has ${rootLayers.length} root layers (at most 1 allowed).`
            };
        }

        // Rule condition 2: Depth at most 3
        const getLayerDepth = (layerId: string): number => {
            let depth = 0;
            let current: string | null = layerId;
            const visited = new Set<string>();
            while (current) {
                if (visited.has(current)) break;
                visited.add(current);
                depth++;
                const layer = drawing.getLayer(current);
                current = layer ? layer.parentId : null;
            }
            return depth;
        };

        for (const layer of layers) {
            const depth = getLayerDepth(layer.id);
            if (depth > 3) {
                return {
                    isRule: false,
                    reason: `Layer '${layer.name}' exceeds maximum allowed depth of 3 (current depth: ${depth}).`
                };
            }
        }

        // Rule condition 3: Exactly one child of the root layer that does not have any children
        if (rootLayers.length === 0) {
            return {
                isRule: false,
                reason: "Drawing has no root layer (a rule requires exactly one child of the root layer with no children)."
            };
        }

        const root = rootLayers[0];
        const rootChildren = layers.filter(l => l.parentId === root.id);
        const leafRootChildren = rootChildren.filter(child => {
            const childrenOfChild = layers.filter(l => l.parentId === child.id);
            return childrenOfChild.length === 0;
        });

        if (leafRootChildren.length !== 1) {
            return {
                isRule: false,
                reason: `Root layer must have exactly 1 child layer without children, but found ${leafRootChildren.length}.`
            };
        }

        return { isRule: true };
    }

    public saveDrawing(name: string, drawing: Drawing): SavedDrawing {
        if (!name || !name.trim()) {
            throw new Error("Consistency Check Failed: Drawing name cannot be empty.");
        }

        const trimmedName = name.trim();
        const ruleCheck = this.checkIsRule(drawing);

        const artefacts = drawing.getArtefacts();
        const artefactToId = new Map<Artefact, string>();
        artefacts.forEach((art, index) => {
            artefactToId.set(art, `art_${index}`);
        });

        const layersData: LayerData[] = drawing.getAllLayers().map(l => ({
            id: l.id,
            name: l.name,
            parentId: l.parentId,
            color: l.color,
            colorEnabled: l.colorEnabled,
            visible: l.visible
        }));

        const artefactsData: ArtefactData[] = artefacts.map(art => {
            const serializedDeps: Record<string, string | boolean> = {};
            for (const [key, val] of Object.entries(art.dependencies)) {
                if (typeof val === "boolean") {
                    serializedDeps[key] = val;
                } else if (val && artefactToId.has(val)) {
                    serializedDeps[key] = artefactToId.get(val)!;
                }
            }

            return {
                id: artefactToId.get(art)!,
                sortName: art.sortName,
                layerId: art.layerId,
                dependencies: serializedDeps,
                data: JSON.parse(JSON.stringify(art.data))
            };
        });

        const savedDrawing: SavedDrawing = {
            name: trimmedName,
            layers: layersData,
            artefacts: artefactsData,
            isRule: ruleCheck.isRule
        };

        this.drawings.set(trimmedName, savedDrawing);
        return savedDrawing;
    }

    public loadDrawing(name: string, drawing: Drawing): void {
        const savedDrawing = this.drawings.get(name);
        if (!savedDrawing) {
            throw new Error(`Consistency Check Failed: Drawing '${name}' does not exist.`);
        }

        drawing.clear(false);

        // Restore layers iteratively
        const remainingLayers = [...savedDrawing.layers];
        let layerProgress = true;
        while (remainingLayers.length > 0 && layerProgress) {
            layerProgress = false;
            for (let i = 0; i < remainingLayers.length; i++) {
                const lData = remainingLayers[i];
                if (lData.parentId === null || drawing.getLayer(lData.parentId) !== undefined) {
                    drawing.addLayer(lData.id, lData.name, lData.parentId, lData.color, lData.colorEnabled, lData.visible ?? true);
                    remainingLayers.splice(i, 1);
                    layerProgress = true;
                    break;
                }
            }
        }

        if (remainingLayers.length > 0) {
            throw new Error(`Consistency Check Failed: Could not restore layer hierarchy for drawing '${name}'.`);
        }

        // Restore artefacts iteratively
        const remainingArtefacts = [...savedDrawing.artefacts];
        const createdArtefacts = new Map<string, Artefact>();

        let artProgress = true;
        while (remainingArtefacts.length > 0 && artProgress) {
            artProgress = false;
            for (let i = 0; i < remainingArtefacts.length; i++) {
                const artData = remainingArtefacts[i];

                let ready = true;
                const resolvedDeps: Record<string, Artefact | boolean> = {};

                for (const [depKey, depVal] of Object.entries(artData.dependencies)) {
                    if (typeof depVal === "boolean") {
                        resolvedDeps[depKey] = depVal;
                    } else if (typeof depVal === "string") {
                        if (createdArtefacts.has(depVal)) {
                            resolvedDeps[depKey] = createdArtefacts.get(depVal)!;
                        } else {
                            ready = false;
                            break;
                        }
                    }
                }

                if (ready) {
                    const newArt = drawing.newArtefact(
                        artData.sortName,
                        resolvedDeps,
                        artData.data,
                        artData.layerId
                    );
                    createdArtefacts.set(artData.id, newArt);
                    remainingArtefacts.splice(i, 1);
                    artProgress = true;
                    break;
                }
            }
        }

        if (remainingArtefacts.length > 0) {
            throw new Error(`Consistency Check Failed: Could not resolve dependencies for drawing '${name}'.`);
        }

        savedDrawing.isRule = this.checkIsRule(drawing).isRule;
    }

    public exportDrawingJSON(name: string): string {
        const savedDrawing = this.drawings.get(name);
        if (!savedDrawing) {
            throw new Error(`Consistency Check Failed: Drawing '${name}' does not exist.`);
        }
        return JSON.stringify(savedDrawing, null, 2);
    }

    public importDrawingJSON(jsonString: string): SavedDrawing {
        let parsed: any;
        try {
            parsed = JSON.parse(jsonString);
        } catch (err) {
            throw new Error(`Consistency Check Failed: Invalid JSON format: ${(err as Error).message}`);
        }

        if (!parsed || typeof parsed !== "object") {
            throw new Error("Consistency Check Failed: Invalid JSON structure for drawing.");
        }

        if (!parsed.name || typeof parsed.name !== "string" || !parsed.name.trim()) {
            throw new Error("Consistency Check Failed: Missing or invalid 'name' attribute in imported drawing.");
        }

        if (!Array.isArray(parsed.layers)) {
            throw new Error("Consistency Check Failed: Missing or invalid 'layers' array in imported drawing.");
        }

        if (!Array.isArray(parsed.artefacts)) {
            throw new Error("Consistency Check Failed: Missing or invalid 'artefacts' array in imported drawing.");
        }

        const trimmedName = parsed.name.trim();

        // Validate layer structures
        for (const layer of parsed.layers) {
            if (!layer || typeof layer.id !== "string" || typeof layer.name !== "string") {
                throw new Error("Consistency Check Failed: Invalid layer structure in imported drawing.");
            }
        }

        // Validate artefact structures
        for (const art of parsed.artefacts) {
            if (!art || typeof art.id !== "string" || typeof art.sortName !== "string" || typeof art.layerId !== "string" || !art.dependencies || typeof art.dependencies !== "object" || !art.data || typeof art.data !== "object") {
                throw new Error("Consistency Check Failed: Invalid artefact structure in imported drawing.");
            }
        }

        const savedDrawing: SavedDrawing = {
            name: trimmedName,
            layers: parsed.layers,
            artefacts: parsed.artefacts,
            isRule: !!parsed.isRule
        };

        this.drawings.set(trimmedName, savedDrawing);
        return savedDrawing;
    }

    public getDrawing(name: string): SavedDrawing | undefined {
        return this.drawings.get(name);
    }

    public getAllDrawings(): SavedDrawing[] {
        return Array.from(this.drawings.values());
    }

    public deleteDrawing(name: string): boolean {
        return this.drawings.delete(name);
    }

    public clear(): void {
        this.drawings.clear();
    }
}
