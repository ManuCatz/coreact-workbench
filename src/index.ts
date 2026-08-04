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
        public colorEnabled: boolean = false
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
        colorEnabled: boolean = false
    ): Layer {
        if (this.layers.has(id)) {
            throw new Error(`Layer with id '${id}' already exists.`);
        }
        if (parentId !== null && !this.layers.has(parentId)) {
            throw new Error(`Parent layer '${parentId}' does not exist.`);
        }
        const layer = new Layer(id, name, parentId, color, colorEnabled);
        this.layers.set(id, layer);
        return layer;
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
            const layer = this.layers.get(current)!;
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

    clear(): void {
        this.artefacts = [];
        this.layers.clear();
        this.focusedLayerId = null;
        this.addLayer("root", "Root Layer", null, "#3498db", false);
    }
}
