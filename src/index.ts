import type { D3Context } from './types';

export interface SortDefinition {
    name: string;
    dependencies: Record<string, string>;
    attributes: Record<string, string>;
    drawFunction: (data: any, context: D3Context) => D3Context | null; // Now returns the element
    initContext?: (context: D3Context) => void;
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

    constructor() {
        this.registerBuiltInSorts();
    }

    private registerBuiltInSorts(): void {
        this.sorts.set("Equality", {
            name: "Equality",
            dependencies: {},
            attributes: {},
            drawFunction: () => null
        });
    }

    getAllSorts(): SortDefinition[] {
        return Array.from(this.sorts.values());
    }

    newSort(
        name: string,
        dependencies: Record<string, string>,
        attributes: Record<string, string>,
        drawFunction: (data: any, context: D3Context) => D3Context | null,
        initContext?: (context: D3Context) => void
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
        this.registerBuiltInSorts();
    }
}

export type FlagRef = { __flag: true; layerIds: string[] } | { __flag: true; layerId: string };

export type ArtefactDependency = Artefact | boolean | FlagRef;

/**
 * A dependency after FlagRefs have been normalized by `Drawing.newArtefact`
 * into a `true` boolean plus a `flagLayers` entry. This is what
 * `Artefact.dependencies` actually holds at runtime.
 */
export type ResolvedDependency = Artefact | boolean;

/**
 * The legal primitive values for a sort's data attributes, matching the
 * attribute types "number", "string", "boolean" and "position".
 */
export type DataAttributeValue = string | number | boolean | [number, number];

export class Artefact {
    public svgElement: D3Context | null = null; // Store the rendered SVG element
    // A flag may be established in several layers at once; the artefact's own
    // layer is always implicit and never stored here.
    public flagLayers: Record<string, string[]> = {};

    constructor(
        public sortName: string,
        public dependencies: Record<string, ResolvedDependency>,
        public data: Record<string, any>,
        protected drawFunction: (data: any, context: D3Context) => D3Context | null,
        public layerId: string = "root"
    ) {}

    getFlagLayer(flagKey: string): string {
        return this.getFlagLayers(flagKey)[0];
    }

    getFlagLayers(flagKey: string): string[] {
        const layers = this.flagLayers[flagKey];
        if (layers && layers.length > 0) {
            return Array.from(new Set(layers));
        }
        return [this.layerId];
    }

    getEffectiveFlagLayers(): Set<string> {
        const layers = new Set<string>();
        for (const [key, val] of Object.entries(this.dependencies)) {
            if (val === true) {
                for (const layer of this.getFlagLayers(key)) {
                    layers.add(layer);
                }
            }
        }
        return layers;
    }

    getResolvedData(isLayerVisible?: (layerId: string) => boolean): Record<string, any> {
        const result = { ...this.data };
        for (const [key, depArtefact] of Object.entries(this.dependencies)) {
            if (typeof depArtefact === "boolean") {
                if (depArtefact === true && isLayerVisible) {
                    result[key] = this.getFlagLayers(key).some(layer => isLayerVisible(layer));
                } else {
                    result[key] = depArtefact;
                }
            } else {
                result[key] = depArtefact.getResolvedData(isLayerVisible);
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

    draw(context: D3Context, isLayerVisible?: (layerId: string) => boolean): void {
        this.svgElement = this.drawFunction(this.getResolvedData(isLayerVisible), context);
    }
}

export class EqualityArtefact extends Artefact {
    public children: Artefact[];

    constructor(
        children: Artefact[],
        data: Record<string, any> = {},
        layerId: string = "root"
    ) {
        const deps: Record<string, ResolvedDependency> = {};
        children.forEach((child, idx) => {
            deps[`${idx}`] = child;
        });
        super("Equality", deps, data, () => null, layerId);
        this.children = [...children];
    }

    public setChildren(newChildren: Artefact[]): void {
        this.children = [...newChildren];
        const newDeps: Record<string, ResolvedDependency> = {};
        this.children.forEach((child, idx) => {
            newDeps[`${idx}`] = child;
        });
        this.dependencies = newDeps;
    }
}

export function checkRuleStructure(layers: Array<{ id: string; name: string; parentId: string | null }>): { isRule: boolean; reason?: string } {
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
            const layer = layers.find(l => l.id === current);
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

    // Rule condition 4: Each child layer of the root layer has at most one child layer
    for (const child of rootChildren) {
        const childrenOfChild = layers.filter(l => l.parentId === child.id);
        if (childrenOfChild.length > 1) {
            return {
                isRule: false,
                reason: `Child layer '${child.name}' of the root layer has ${childrenOfChild.length} child layers (at most 1 allowed).`
            };
        }
    }

    return { isRule: true };
}

export class Drawing {
    private artefacts: Artefact[] = [];
    private layers: Map<string, Layer> = new Map();
    private focusedLayerId: string | null = null;
    private ruleFlag: boolean = false;

    constructor(public sortStore: SortStore) {
        this.addLayer("root", "Root Layer", null, "#3498db", false);
    }

    public get isRule(): boolean {
        return this.ruleFlag;
    }

    public setIsRule(isRule: boolean): void {
        if (isRule) {
            const check = this.checkRuleConditions();
            if (!check.isRule) {
                throw new Error(`Consistency Check Failed: Drawing cannot be marked as a rule: ${check.reason}`);
            }
        }
        this.ruleFlag = isRule;
    }

    public checkRuleConditions(): { isRule: boolean; reason?: string } {
        return checkRuleStructure(Array.from(this.layers.values()));
    }

    public checkLayerProvable(layerId: string): { provable: boolean; reason?: string; match?: Map<Artefact, Artefact> } {
        const layer = this.layers.get(layerId);
        if (!layer) {
            throw new Error(`Consistency Check Failed: Layer '${layerId}' does not exist.`);
        }
        if (layer.parentId === null) {
            return { provable: false, reason: `Layer '${layer.name}' has no parent layer.` };
        }

        const parentId: string = layer.parentId;
        const parentLayer = this.layers.get(parentId);
        const parentName = parentLayer ? parentLayer.name : parentId;

        const labelOf = (a: Artefact): string => (typeof a.data.label === "string" ? a.data.label : a.sortName);

        const parentAncestors = this.getAncestors(parentId);
        const layerFlagScope = this.getDescendants(layerId);

        for (const art of this.artefacts) {
            for (const [flagKey, flagVal] of Object.entries(art.dependencies)) {
                if (flagVal === true) {
                    const flagLayers = art.getFlagLayers(flagKey);
                    const parentSeesFlag = flagLayers.some(l => parentAncestors.has(l));

                    if (!parentSeesFlag) {
                        for (const flagLayer of flagLayers) {
                            if (layerFlagScope.has(flagLayer)) {
                                const flagLayerName = this.layers.get(flagLayer)?.name || flagLayer;
                                return {
                                    provable: false,
                                    reason: `Flag '${flagKey}' on artefact '${labelOf(art)}' (${art.sortName}) is established in layer '${flagLayerName}', within layer '${layer.name}' or its descendants; the layer is not provable in parent layer '${parentName}'.`
                                };
                            }
                        }
                    }
                }
            }
        }

        const layerArtefacts = this.artefacts.filter(a => a.layerId === layerId);
        const parentArtefacts = this.artefacts.filter(b => b.layerId === parentId);

        const pattern: Artefact[] = [];
        const equalityConstraints: Array<{ children: Artefact[] }> = [];

        for (const art of layerArtefacts) {
            if (art.sortName === "Equality") {
                const children = artefactChildren(art);

                if (children.length < 2) {
                    return {
                        provable: false,
                        reason: `Degenerate equality artefact (fewer than 2 children) in layer '${layer.name}'.`
                    };
                }

                equalityConstraints.push({ children });
            } else {
                pattern.push(art);
            }
        }

        // Order pattern artefacts so that dependencies within the pattern come first.
        const patternSet = new Set<Artefact>(pattern);
        const ordered = topologicallyOrderPattern(pattern);
        if (!ordered) {
            return {
                provable: false,
                reason: `Layer '${layer.name}' contains artefacts with circular dependencies; it cannot be matched in parent layer '${parentName}'.`
            };
        }

        const assignment = new Map<Artefact, Artefact>();

        const checkEqualityConstraints = (): boolean => {
            for (const c of equalityConstraints) {
                const imgs: Artefact[] = [];
                for (const child of c.children) {
                    const img = patternSet.has(child) ? assignment.get(child) : child;
                    if (!img) return false;
                    imgs.push(img);
                }
                for (let i = 1; i < imgs.length; i++) {
                    if (!this.areEqual(imgs[0], imgs[i], parentId)) {
                        return false;
                    }
                }
            }
            return true;
        };

        const backtrack = (i: number): boolean => {
            if (i === ordered.length) {
                return checkEqualityConstraints();
            }

            const a = ordered[i];
            for (const cand of parentArtefacts) {
                if (cand.sortName !== a.sortName) continue;

                let ok = true;
                for (const [k, dep] of Object.entries(a.dependencies)) {
                    if (typeof dep === "boolean") {
                        const set = dep === true;
                        const candSet = cand.dependencies[k] === true;
                        if (set !== candSet) {
                            ok = false;
                            break;
                        }
                        if (set && !this.flagsMatch(a, cand, k)) {
                            ok = false;
                            break;
                        }
                    } else {
                        const hostDep = cand.dependencies[k];
                        if (typeof hostDep === "boolean" || hostDep === undefined) {
                            ok = false;
                            break;
                        }
                        const expected = patternSet.has(dep) ? assignment.get(dep) : dep;
                        if (expected === undefined) {
                            ok = false;
                            break;
                        }
                        if (hostDep !== expected && !this.areEqual(hostDep, expected, parentId)) {
                            ok = false;
                            break;
                        }
                    }
                }
                if (!ok) continue;

                assignment.set(a, cand);
                if (backtrack(i + 1)) {
                    return true;
                }
                assignment.delete(a);
            }
            return false;
        };

        if (backtrack(0)) {
            return { provable: true, match: new Map(assignment) };
        }

        return {
            provable: false,
            reason: `Layer '${layer.name}' has no match in parent layer '${parentName}' compatible with its dependencies up to provable equality.`
        };
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
            const layer: Layer = this.layers.get(current)!;
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

    public getLayerDepth(layerId: string): number {
        let depth = 0;
        let current: string | null = layerId;
        const visited = new Set<string>();
        while (current && this.layers.has(current) && !visited.has(current)) {
            visited.add(current);
            depth++;
            const layer: Layer = this.layers.get(current)!;
            current = layer.parentId;
        }
        return depth;
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

        // Reset any surviving flag whose layer was deleted to the artefact's own layer
        for (const art of this.artefacts) {
            for (const [flagKey, flagLayerArr] of Object.entries(art.flagLayers)) {
                const surviving = flagLayerArr.filter(flagLayer => !descendants.has(flagLayer));
                if (surviving.length > 0) {
                    art.flagLayers[flagKey] = surviving;
                } else {
                    delete art.flagLayers[flagKey];
                }
            }
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

        // Drop old own layer if explicitly stored, since the artefact is moving to targetLayerId.
        for (const [flagKey, flagLayerArr] of Object.entries(artefact.flagLayers)) {
            const withoutOldOwn = flagLayerArr.filter(l => l !== artefact.layerId);
            if (withoutOldOwn.length > 0) {
                artefact.flagLayers[flagKey] = withoutOldOwn;
            } else {
                delete artefact.flagLayers[flagKey];
            }
        }

        // Check flags: each set flag must leave from the new layer or one of its descendants
        for (const [flagKey, flagValue] of Object.entries(artefact.dependencies)) {
            if (flagValue === true) {
                for (const flagLayer of artefact.getFlagLayers(flagKey)) {
                    this.validateFlagLayer(flagLayer, targetLayerId, flagKey);
                }
            }
        }

        if (artefact.sortName === "Equality") {
            const children = artefactChildren(artefact);
            
            // Validate equality dependencies for the target layer
            this.validateEqualityDependencies(children, targetLayerId);

            artefact.layerId = targetLayerId;

            // Trigger same-layer merging if there are overlapping equality artefacts on targetLayerId
            const sameLayerEqualities = this.artefacts.filter(
                art => art !== artefact && (art instanceof EqualityArtefact || art.sortName === "Equality") && art.layerId === targetLayerId
            );

            const childrenSet = new Set(children);
            const overlapping = sameLayerEqualities.filter(art => {
                const cList = artefactChildren(art);
                return cList.some(c => childrenSet.has(c));
            });

            if (overlapping.length > 0) {
                const combinedSet = new Set<Artefact>(children);
                for (const ov of overlapping) {
                    const cList = artefactChildren(ov);
                    cList.forEach(c => combinedSet.add(c));
                }
                const combined = Array.from(combinedSet);
                this.validateEqualityDependencies(combined, targetLayerId);

                if (artefact instanceof EqualityArtefact) {
                    artefact.setChildren(combined);
                }
                for (const ov of overlapping) {
                    this.artefacts = this.artefacts.filter(a => a !== ov);
                }
            }
        } else {
            artefact.layerId = targetLayerId;
        }
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

    public areEqual(a: Artefact, b: Artefact, layerId: string): boolean {
        if (a === b) return true;

        const allowedAncestors = this.getAncestors(layerId);
        
        const adj = new Map<Artefact, Set<Artefact>>();
        for (const art of this.artefacts) {
            if (art.sortName === "Equality" && allowedAncestors.has(art.layerId)) {
                const children = artefactChildren(art);
                for (let i = 0; i < children.length; i++) {
                    for (let j = i + 1; j < children.length; j++) {
                        const c1 = children[i];
                        const c2 = children[j];
                        if (!adj.has(c1)) adj.set(c1, new Set());
                        if (!adj.has(c2)) adj.set(c2, new Set());
                        adj.get(c1)!.add(c2);
                        adj.get(c2)!.add(c1);
                    }
                }
            }
        }

        if (!adj.has(a)) return false;

        const visited = new Set<Artefact>();
        const queue: Artefact[] = [a];
        visited.add(a);

        while (queue.length > 0) {
            const current = queue.shift()!;
            if (current === b) return true;
            const neighbors = adj.get(current);
            if (neighbors) {
                for (const neighbor of neighbors) {
                    if (!visited.has(neighbor)) {
                        visited.add(neighbor);
                        queue.push(neighbor);
                    }
                }
            }
        }

        return false;
    }

    public validateEqualityDependencies(artefacts: Artefact[], layerId: string): void {
        const uniqueArtefacts = Array.from(new Set(artefacts));
        if (uniqueArtefacts.length < 2) {
            throw new Error("Consistency Check Failed: An equality artefact must connect at least two distinct artefacts.");
        }

        const allowedAncestors = this.getAncestors(layerId);

        // 1. Validate sort uniformity & layer hierarchy
        const firstSort = uniqueArtefacts[0].sortName;
        for (const art of uniqueArtefacts) {
            if (art.sortName !== firstSort) {
                throw new Error(`Consistency Check Failed: All artefacts in an equality artefact must be of the same sort. Found '${firstSort}' and '${art.sortName}'.`);
            }
            if (!allowedAncestors.has(art.layerId)) {
                const artLayerName = this.layers.get(art.layerId)?.name || art.layerId;
                const targetLayerName = this.layers.get(layerId)?.name || layerId;
                throw new Error(`Consistency Check Failed: Artefact '${art.data.label || art.sortName}' (in layer '${artLayerName}') is not in layer '${targetLayerName}' or any of its lower ancestor layers.`);
            }
        }

        // 2. Pairwise dependency check against first artefact
        const sortDef = this.sortStore.getSort(firstSort);
        if (!sortDef) {
            throw new Error(`Consistency Check Failed: Sort '${firstSort}' is not defined.`);
        }

        const firstArt = uniqueArtefacts[0];
        for (let i = 1; i < uniqueArtefacts.length; i++) {
            const otherArt = uniqueArtefacts[i];

            for (const [depKey, depSortName] of Object.entries(sortDef.dependencies)) {
                const firstDep = firstArt.dependencies[depKey];
                const otherDep = otherArt.dependencies[depKey];

                if (depSortName === "flag") {
                    if (!this.flagsMatch(firstArt, otherArt, depKey)) {
                        throw new Error(`Consistency Check Failed: Flag dependency '${depKey}' differs between artefacts in equality artefact.`);
                    }
                } else {
                    if (!firstDep || typeof firstDep === "boolean" || !otherDep || typeof otherDep === "boolean") {
                        throw new Error(`Consistency Check Failed: Missing artefact dependency '${depKey}' for equality check.`);
                    }
                    if (!this.areEqual(firstDep, otherDep, layerId)) {
                        throw new Error(`Consistency Check Failed: Dependencies '${depKey}' of artefacts '${firstArt.data.label || firstArt.sortName}' and '${otherArt.data.label || otherArt.sortName}' are not equal at layer '${layerId}'.`);
                    }
                }
            }
        }
    }

    public addEqualityArtefactUnchecked(
        children: Artefact[],
        layerId: string,
        data: Record<string, any> = {}
    ): EqualityArtefact {
        const eq = new EqualityArtefact(children, data, layerId);
        this.artefacts.push(eq);
        return eq;
    }

    public newEqualityArtefact(
        artefacts: Artefact[],
        layerId?: string,
        data: Record<string, any> = {}
    ): EqualityArtefact {
        const targetLayerId = layerId || (this.layers.size > 0 ? Array.from(this.layers.keys())[0] : "root");
        if (!this.layers.has(targetLayerId)) {
            throw new Error(`Consistency Check Failed: Layer '${targetLayerId}' does not exist.`);
        }

        const inputSet = new Set(artefacts);
        if (inputSet.size < 2) {
            throw new Error("Consistency Check Failed: An equality artefact must connect at least two distinct artefacts.");
        }

        // Search for overlapping equality artefacts on the exact SAME layer
        const sameLayerEqualities = this.artefacts.filter(
            art => (art instanceof EqualityArtefact || art.sortName === "Equality") && art.layerId === targetLayerId
        );

        const overlapping: Artefact[] = [];
        for (const eq of sameLayerEqualities) {
            const children = artefactChildren(eq);
            if (children.some(c => inputSet.has(c))) {
                overlapping.push(eq);
            }
        }

        if (overlapping.length > 0) {
            const combinedChildrenSet = new Set<Artefact>(inputSet);
            for (const eq of overlapping) {
                const children = artefactChildren(eq);
                children.forEach(c => combinedChildrenSet.add(c));
            }

            const combinedChildren = Array.from(combinedChildrenSet);
            this.validateEqualityDependencies(combinedChildren, targetLayerId);

            const mainEq = overlapping[0];
            let resultEq: EqualityArtefact;
            if (mainEq instanceof EqualityArtefact) {
                mainEq.setChildren(combinedChildren);
                Object.assign(mainEq.data, data);
                resultEq = mainEq;
            } else {
                const idx = this.artefacts.indexOf(mainEq);
                resultEq = new EqualityArtefact(combinedChildren, { ...mainEq.data, ...data }, targetLayerId);
                if (idx !== -1) this.artefacts[idx] = resultEq;
            }

            for (let i = 1; i < overlapping.length; i++) {
                const toRemove = overlapping[i];
                this.artefacts = this.artefacts.filter(a => a !== toRemove);
            }

            return resultEq;
        } else {
            const initialChildren = Array.from(inputSet);
            this.validateEqualityDependencies(initialChildren, targetLayerId);

            const newEq = new EqualityArtefact(initialChildren, data, targetLayerId);
            this.artefacts.push(newEq);
            return newEq;
        }
    }

    newArtefact(
        sortName: string,
        dependencies: Record<string, ArtefactDependency>,
        data: Record<string, any>,
        layerId?: string
    ): Artefact {
        if (sortName === "Equality") {
            const children: Artefact[] = [];
            if (Array.isArray(data.children)) {
                children.push(...data.children);
            } else {
                for (const val of Object.values(dependencies)) {
                    if (val && typeof val !== "boolean" && !this.isFlagRef(val)) {
                        children.push(val);
                    }
                }
            }
            return this.newEqualityArtefact(children, layerId, data);
        }

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
                if (providedValue !== undefined && typeof providedValue !== "boolean" && !this.isFlagRef(providedValue)) {
                    throw new Error(`Consistency Check Failed: Dependency '${depKey}' expected flag (boolean or { layerId }), but got '${typeof providedValue}'.`);
                }
            } else {
                if (!providedValue || typeof providedValue === "boolean" || this.isFlagRef(providedValue)) {
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

        // 3. Normalize flag references ({ layerIds }) into booleans + flagLayers entries
        const normalizedDeps: Record<string, Artefact | boolean> = {};
        const flagLayers: Record<string, string[]> = {};
        for (const [depKey, providedValue] of Object.entries(dependencies)) {
            const expectedSortName = sortDef.dependencies[depKey];
            if (expectedSortName === "flag" && this.isFlagRef(providedValue)) {
                const layerIds = this.flagRefLayerIds(providedValue);
                for (const layerId of layerIds) {
                    this.validateFlagLayer(layerId, targetLayerId, depKey);
                }
                normalizedDeps[depKey] = true;
                const layers = Array.from(new Set(layerIds));
                if (layers.length > 0) {
                    flagLayers[depKey] = layers;
                }
            } else {
                normalizedDeps[depKey] = providedValue as Artefact | boolean;
            }
        }

        const artefact = new Artefact(sortName, normalizedDeps, data, sortDef.drawFunction, targetLayerId);
        artefact.flagLayers = flagLayers;
        this.artefacts.push(artefact);
        
        return artefact;
    }

    private isFlagRef(value: unknown): value is FlagRef {
        if (typeof value !== "object" || value === null) return false;
        const v = value as { __flag?: unknown; layerId?: unknown; layerIds?: unknown };
        if (v.__flag !== true) return false;
        if (typeof v.layerId === "string") return true;
        if (Array.isArray(v.layerIds) && v.layerIds.every(l => typeof l === "string")) return true;
        return false;
    }

    private flagRefLayerIds(value: FlagRef): string[] {
        if ("layerIds" in value) {
            return value.layerIds;
        }
        return [value.layerId];
    }

    private validateFlagLayer(flagLayerId: string, artefactLayerId: string, flagKey: string): void {
        if (!this.layers.has(flagLayerId)) {
            throw new Error(`Consistency Check Failed: Flag '${flagKey}' leaves from layer '${flagLayerId}', which does not exist.`);
        }
        if (!this.getDescendants(artefactLayerId).has(flagLayerId)) {
            const artefactLayerName = this.layers.get(artefactLayerId)?.name || artefactLayerId;
            const flagLayerName = this.layers.get(flagLayerId)?.name || flagLayerId;
            throw new Error(`Consistency Check Failed: Flag '${flagKey}' leaves from layer '${flagLayerName}', which is not '${artefactLayerName}' or any of its descendant layers.`);
        }
    }

    draw(context: D3Context): void {
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

        // Draw artefacts belonging to this layer
        const layerArtefacts = this.artefacts.filter(a => a.layerId === layer.id);
        const isLayerVisible = (layerId: string) => this.isLayerVisible(layerId);
        for (const artefact of layerArtefacts) {
            artefact.draw(layerGroup, isLayerVisible);
            if (this.focusedLayerId !== null) {
                const focused = this.isFocused(artefact);
                if (artefact.svgElement && artefact.svgElement.attr) {
                    artefact.svgElement.attr("opacity", focused ? 1.0 : 0.5);
                }
            }
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
        // Remove any equality artefacts whose children count fell below 2
        this.artefacts = this.artefacts.filter(art => {
            if (art.sortName === "Equality") {
                const children = artefactChildren(art);
                return children.length >= 2;
            }
            return true;
        });
    }

    removeEqualityChild(eq: Artefact, childToRemove: Artefact): void {
        if (eq.sortName !== "Equality") return;

        const currentChildren = artefactChildren(eq);

        const remaining = currentChildren.filter(c => c !== childToRemove);
        if (remaining.length < 2) {
            this.artefacts = this.artefacts.filter(art => art !== eq);
        } else {
            if (eq instanceof EqualityArtefact) {
                eq.setChildren(remaining);
            } else {
                const newDeps: Record<string, Artefact | boolean> = {};
                remaining.forEach((child, idx) => {
                    newDeps[`${idx}`] = child;
                });
                eq.dependencies = newDeps;
            }
        }
    }

    private isFocused(artefact: Artefact): boolean {
        if (this.focusedLayerId === null) return true;
        if (artefact.layerId === this.focusedLayerId) return true;
        for (const flagLayer of artefact.getEffectiveFlagLayers()) {
            if (flagLayer === this.focusedLayerId) return true;
        }
        return false;
    }

    public flagsMatch(a1: Artefact, a2: Artefact, flagKey: string): boolean {
        const dep1 = a1.dependencies[flagKey];
        const dep2 = a2.dependencies[flagKey];
        const set1 = dep1 === true;
        const set2 = dep2 === true;
        if (set1 !== set2) return false;
        if (!set1) return true;
        const layers1 = a1.getFlagLayers(flagKey);
        const layers2 = a2.getFlagLayers(flagKey);
        if (layers1.length !== layers2.length) return false;
        const set = new Set(layers1);
        return layers2.every(layer => set.has(layer));
    }

    public areDependenciesEqual(a1: Artefact, a2: Artefact): boolean {
        if (a1.sortName !== a2.sortName) {
            return false;
        }

        const keys1 = Object.keys(a1.dependencies);
        const keys2 = Object.keys(a2.dependencies);

        if (keys1.length !== keys2.length) {
            return false;
        }

        for (const k of keys1) {
            if (!Object.prototype.hasOwnProperty.call(a2.dependencies, k)) {
                return false;
            }
            if (a1.dependencies[k] !== a2.dependencies[k]) {
                return false;
            }
            if (a1.dependencies[k] === true && !this.flagsMatch(a1, a2, k)) {
                return false;
            }
        }

        return true;
    }

    public areProvablyEqual(a: Artefact, b: Artefact): boolean {
        return this.areEqual(a, b, a.layerId) || this.areEqual(a, b, b.layerId);
    }

    public mergeArtefacts(a1: Artefact, a2: Artefact): Artefact {
        if (!this.artefacts.includes(a1) || !this.artefacts.includes(a2)) {
            throw new Error("Consistency Check Failed: Both artefacts must exist in the drawing to be merged.");
        }
        if (a1 === a2) {
            throw new Error("Consistency Check Failed: Cannot merge an artefact with itself.");
        }
        if (!this.areDependenciesEqual(a1, a2)) {
            throw new Error("Consistency Check Failed: Cannot merge artefacts with different dependencies or sorts.");
        }

        // Layer hierarchy check: any artefact depending on a1 must allow a2's layerId in its ancestors
        const allowedForA2Layer = a2.layerId;
        for (const art of this.artefacts) {
            if (art === a1 || art === a2) continue;
            for (const depVal of Object.values(art.dependencies)) {
                if (depVal === a1) {
                    const artAllowed = this.getAncestors(art.layerId);
                    if (!artAllowed.has(allowedForA2Layer)) {
                        const a2LayerName = this.layers.get(allowedForA2Layer)?.name || allowedForA2Layer;
                        const artLayerName = this.layers.get(art.layerId)?.name || art.layerId;
                        throw new Error(`Consistency Check Failed: Merging would violate layer hierarchy. Artefact '${art.data.label || art.sortName}' (in layer '${artLayerName}') depends on this artefact, but target layer '${a2LayerName}' is not in its lower ancestor layers.`);
                    }
                }
            }
        }

        // Determine new label: concatenation of old labels separated by ", "
        const label1 = typeof a1.data.label === "string" ? a1.data.label.trim() : "";
        const label2 = typeof a2.data.label === "string" ? a2.data.label.trim() : "";

        let combinedLabel = "";
        if (label1 && label2) {
            combinedLabel = `${label1}, ${label2}`;
        } else if (label1) {
            combinedLabel = label1;
        } else if (label2) {
            combinedLabel = label2;
        }

        // Keep second artefact's datafields and set combined label
        if (combinedLabel) {
            a2.data.label = combinedLabel;
        } else {
            delete a2.data.label;
        }

        // Replace references to a1 with a2 in all artefacts
        for (const art of this.artefacts) {
            if (art === a1) continue;

            for (const [depKey, depVal] of Object.entries(art.dependencies)) {
                if (depVal === a1) {
                    art.dependencies[depKey] = a2;
                }
            }

            if (art.sortName === "Equality") {
                const currentChildren = artefactChildren(art);

                const updatedChildren = currentChildren.map(c => c === a1 ? a2 : c);
                const uniqueChildren = Array.from(new Set(updatedChildren));

                if (art instanceof EqualityArtefact) {
                    art.setChildren(uniqueChildren);
                } else {
                    const newDeps: Record<string, Artefact | boolean> = {};
                    uniqueChildren.forEach((child, idx) => {
                        newDeps[`${idx}`] = child;
                    });
                    art.dependencies = newDeps;
                }
            }
        }

        // Clean up any equality artefacts that now have fewer than 2 distinct children
        this.artefacts = this.artefacts.filter(art => {
            if (art.sortName === "Equality") {
                const children = artefactChildren(art);
                return children.length >= 2;
            }
            return true;
        });

        // Remove a1 from drawing
        this.artefacts = this.artefacts.filter(art => art !== a1);

        return a2;
    }

    clear(keepDefaultRoot: boolean = true): void {
        this.artefacts = [];
        this.layers.clear();
        this.focusedLayerId = null;
        this.ruleFlag = false;
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
    flagLayers?: Record<string, string[]>;
}

export interface SavedDrawing {
    name: string;
    layers: LayerData[];
    artefacts: ArtefactData[];
    isRule: boolean;
    isFirstOrder: boolean;
}

export class DrawingStore {
    private drawings: Map<string, SavedDrawing> = new Map();

    public checkIsRule(drawing: Drawing): { isRule: boolean; reason?: string } {
        return drawing.checkRuleConditions();
    }

    private static firstOrderFromLayers(layers: Array<{ id: string; parentId: string | null }>): boolean {
        const rootLayers = layers.filter(l => l.parentId === null);
        if (rootLayers.length !== 1) {
            return false;
        }
        const root = rootLayers[0];
        const rootChildren = layers.filter(l => l.parentId === root.id);
        return rootChildren.length === 1;
    }

    public checkIsFirstOrder(drawing: Drawing): boolean {
        if (!drawing.isRule) {
            return false;
        }
        if (!this.checkIsRule(drawing).isRule) {
            return false;
        }
        return DrawingStore.firstOrderFromLayers(drawing.getAllLayers());
    }

    public markAsRule(name: string, isRule: boolean): SavedDrawing {
        const saved = this.drawings.get(name);
        if (!saved) {
            throw new Error(`Consistency Check Failed: Drawing '${name}' does not exist.`);
        }
        if (isRule) {
            const check = checkRuleStructure(saved.layers);
            if (!check.isRule) {
                throw new Error(`Consistency Check Failed: Drawing '${name}' cannot be marked as a rule: ${check.reason}`);
            }
        }
        saved.isRule = isRule;
        saved.isFirstOrder = isRule && DrawingStore.firstOrderFromLayers(saved.layers);
        return saved;
    }

    public static drawingToSavedDrawing(name: string, drawing: Drawing): SavedDrawing {
        const trimmedName = (name || "Drawing").trim() || "Drawing";
        const markedAsRule = drawing.isRule;

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
                data: JSON.parse(JSON.stringify(art.data)),
                flagLayers: Object.keys(art.flagLayers).length > 0 ? { ...art.flagLayers } : undefined
            };
        });

        return {
            name: trimmedName,
            layers: layersData,
            artefacts: artefactsData,
            isRule: markedAsRule,
            isFirstOrder: markedAsRule && DrawingStore.firstOrderFromLayers(layersData)
        };
    }

    public saveDrawing(name: string, drawing: Drawing): SavedDrawing {
        if (!name || !name.trim()) {
            throw new Error("Consistency Check Failed: Drawing name cannot be empty.");
        }

        const trimmedName = name.trim();
        const markedAsRule = drawing.isRule;

        if (markedAsRule) {
            const ruleCheck = this.checkIsRule(drawing);
            if (!ruleCheck.isRule) {
                throw new Error(`Consistency Check Failed: Drawing '${trimmedName}' is marked as a rule but does not satisfy rule conditions: ${ruleCheck.reason}`);
            }
        }

        const savedDrawing = DrawingStore.drawingToSavedDrawing(trimmedName, drawing);
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
                const resolvedDeps: Record<string, Artefact | boolean | FlagRef> = {};

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
                    for (const [flagKey, flagLayer] of Object.entries(artData.flagLayers ?? {})) {
                        if (resolvedDeps[flagKey] === true) {
                            const layerIds = Array.isArray(flagLayer) ? flagLayer : [flagLayer];
                            resolvedDeps[flagKey] = { __flag: true, layerIds };
                        }
                    }
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

        drawing.setIsRule(savedDrawing.isRule);
        savedDrawing.isFirstOrder = this.checkIsFirstOrder(drawing);
    }

    public exportDrawingJSON(name: string): string {
        const savedDrawing = this.drawings.get(name);
        if (!savedDrawing) {
            throw new Error(`Consistency Check Failed: Drawing '${name}' does not exist.`);
        }
        return JSON.stringify(savedDrawing, null, 2);
    }

    public exportDrawingsJSON(names?: string[]): string {
        let drawings: SavedDrawing[];
        if (names) {
            drawings = names.map(name => {
                const savedDrawing = this.drawings.get(name);
                if (!savedDrawing) {
                    throw new Error(`Consistency Check Failed: Drawing '${name}' does not exist.`);
                }
                return savedDrawing;
            });
        } else {
            drawings = this.getAllDrawings();
        }
        return JSON.stringify({ drawings }, null, 2);
    }

    private static parseImportJSON(jsonString: string): unknown {
        let parsed: unknown;
        try {
            parsed = JSON.parse(jsonString);
        } catch (err) {
            throw new Error(`Consistency Check Failed: Invalid JSON format: ${(err as Error).message}`);
        }
        return parsed;
    }

    private static validateAndBuildDrawing(parsed: unknown): SavedDrawing {
        if (!parsed || typeof parsed !== "object") {
            throw new Error("Consistency Check Failed: Invalid JSON structure for drawing.");
        }
        const p = parsed as Record<string, unknown>;

        if (!p.name || typeof p.name !== "string" || !p.name.trim()) {
            throw new Error("Consistency Check Failed: Missing or invalid 'name' attribute in imported drawing.");
        }

        if (!Array.isArray(p.layers)) {
            throw new Error("Consistency Check Failed: Missing or invalid 'layers' array in imported drawing.");
        }

        if (!Array.isArray(p.artefacts)) {
            throw new Error("Consistency Check Failed: Missing or invalid 'artefacts' array in imported drawing.");
        }

        const trimmedName = p.name.trim();

        // Validate layer structures
        for (const layer of p.layers) {
            if (!layer || typeof layer.id !== "string" || typeof layer.name !== "string") {
                throw new Error("Consistency Check Failed: Invalid layer structure in imported drawing.");
            }
        }

        // Validate artefact structures
        for (const art of p.artefacts) {
            if (!art || typeof art.id !== "string" || typeof art.sortName !== "string" || typeof art.layerId !== "string" || !art.dependencies || typeof art.dependencies !== "object" || !art.data || typeof art.data !== "object") {
                throw new Error("Consistency Check Failed: Invalid artefact structure in imported drawing.");
            }
            if (art.flagLayers !== undefined) {
                if (typeof art.flagLayers !== "object" || art.flagLayers === null || Array.isArray(art.flagLayers)) {
                    throw new Error("Consistency Check Failed: Invalid flagLayers structure in imported drawing.");
                }
                for (const val of Object.values(art.flagLayers as Record<string, unknown>)) {
                    const valid = typeof val === "string" ||
                        (Array.isArray(val) && val.every(l => typeof l === "string"));
                    if (!valid) {
                        throw new Error("Consistency Check Failed: Invalid flag layer value in imported drawing.");
                    }
                }
            }
        }

        const markedAsRule = !!p.isRule;

        if (markedAsRule) {
            const check = checkRuleStructure(p.layers);
            if (!check.isRule) {
                throw new Error(`Consistency Check Failed: Imported drawing '${trimmedName}' is marked as a rule but does not satisfy rule conditions: ${check.reason}`);
            }
        }

        return {
            name: trimmedName,
            layers: p.layers,
            artefacts: p.artefacts,
            isRule: markedAsRule,
            isFirstOrder: markedAsRule && DrawingStore.firstOrderFromLayers(p.layers)
        };
    }

    private uniqueName(requestedName: string): string {
        if (!this.drawings.has(requestedName)) {
            return requestedName;
        }
        let i = 1;
        while (this.drawings.has(`${requestedName} (${i})`)) {
            i++;
        }
        return `${requestedName} (${i})`;
    }

    private storeImportedDrawing(parsed: unknown): { drawing: SavedDrawing; requestedName: string; renamed: boolean } {
        const built = DrawingStore.validateAndBuildDrawing(parsed);
        const requestedName = built.name;
        const actualName = this.uniqueName(requestedName);
        const renamed = actualName !== requestedName;
        built.name = actualName;
        this.drawings.set(actualName, built);
        return { drawing: built, requestedName, renamed };
    }

    public importDrawingJSON(jsonString: string): SavedDrawing {
        return this.storeImportedDrawing(DrawingStore.parseImportJSON(jsonString)).drawing;
    }

    public importDrawingsJSON(jsonString: string): { drawings: SavedDrawing[]; renames: Array<{ requested: string; actual: string }> } {
        const parsed = DrawingStore.parseImportJSON(jsonString);
        const parsedRecord = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;

        if (parsedRecord && Array.isArray(parsedRecord.drawings)) {
            const drawings: SavedDrawing[] = [];
            const renames: Array<{ requested: string; actual: string }> = [];
            for (const item of parsedRecord.drawings) {
                const result = this.storeImportedDrawing(item);
                drawings.push(result.drawing);
                if (result.renamed) {
                    renames.push({ requested: result.requestedName, actual: result.drawing.name });
                }
            }
            return { drawings, renames };
        }

        const result = this.storeImportedDrawing(parsed);
        return {
            drawings: [result.drawing],
            renames: result.renamed ? [{ requested: result.requestedName, actual: result.drawing.name }] : []
        };
    }

    public getDrawing(name: string): SavedDrawing | undefined {
        return this.drawings.get(name);
    }

    public getAllDrawings(): SavedDrawing[] {
        return Array.from(this.drawings.values());
    }

    public renameDrawing(oldName: string, newName: string): SavedDrawing {
        const saved = this.drawings.get(oldName);
        if (!saved) {
            throw new Error(`Consistency Check Failed: Drawing '${oldName}' does not exist.`);
        }
        const trimmed = newName.trim();
        if (!trimmed) {
            throw new Error("Consistency Check Failed: Drawing name cannot be empty.");
        }
        if (trimmed === oldName) {
            return saved;
        }
        if (this.drawings.has(trimmed)) {
            throw new Error(`Consistency Check Failed: A drawing named '${trimmed}' already exists.`);
        }
        this.drawings.delete(oldName);
        saved.name = trimmed;
        this.drawings.set(trimmed, saved);
        return saved;
    }

    public deleteDrawing(name: string): boolean {
        return this.drawings.delete(name);
    }

    public clear(): void {
        this.drawings.clear();
    }
}

export interface RuleApplication {
    matchedArtefacts: Map<Artefact, Artefact>;
    hostArtefacts: Set<Artefact>;
}

function extractEqualityConstraints(rule: Drawing): Array<{ children: Artefact[] }> {
    const rootLayerIds = rule.getAllLayers()
        .filter(l => l.parentId === null)
        .map(l => l.id);
    return rule.getArtefacts()
        .filter(a => a.sortName === "Equality" && rootLayerIds.includes(a.layerId))
        .map(a => ({
            children: artefactChildren(a)
        }))
        .filter(c => c.children.length >= 2);
}

function findRuleApplicationsInternal(
    host: Drawing,
    patternArts: Artefact[],
    equalityConstraints: Array<{ children: Artefact[] }>,
    rule: Drawing
): RuleApplication[] {
    const results: RuleApplication[] = [];

    if (patternArts.length === 0) {
        return [{ matchedArtefacts: new Map(), hostArtefacts: new Set() }];
    }

    const patternSet = new Set<Artefact>(patternArts);
    const applicableConstraints = equalityConstraints
        .filter(c => c.children.every(child => patternSet.has(child)));

    const rootLayerIds = host.getAllLayers()
        .filter(l => l.parentId === null)
        .map(l => l.id);
    const ruleRootLayerIds = new Set(rule.getAllLayers()
        .filter(l => l.parentId === null)
        .map(l => l.id));
    const hostCandidates = host.getArtefacts().filter(a => rootLayerIds.includes(a.layerId));

    const ordered = topologicallyOrderPattern(patternArts);
    if (!ordered) {
        return [];
    }

    const assignment = new Map<Artefact, Artefact>();
    const used = new Set<Artefact>();

    const checkEqualityConstraints = (): boolean => {
        for (const c of applicableConstraints) {
            const imgs: Artefact[] = [];
            for (const child of c.children) {
                const img = assignment.get(child);
                if (!img) return false;
                imgs.push(img);
            }
            for (let i = 1; i < imgs.length; i++) {
                if (!host.areEqual(imgs[0], imgs[i], imgs[0].layerId)) {
                    return false;
                }
            }
        }
        return true;
    };

    const backtrack = (i: number): void => {
        if (i === ordered.length) {
            if (checkEqualityConstraints()) {
                const hostArtefacts = new Set<Artefact>(used);
                for (const [a, cand] of assignment) {
                    for (const [k, dep] of Object.entries(a.dependencies)) {
                        if (typeof dep === "boolean") continue;
                        const hostDep = cand.dependencies[k];
                        if (typeof hostDep !== "boolean" && hostDep !== undefined) {
                            hostArtefacts.add(hostDep);
                        }
                    }
                }
                results.push({ matchedArtefacts: new Map(assignment), hostArtefacts });
            }
            return;
        }

        const a = ordered[i];
        for (const cand of hostCandidates) {
            if (cand.sortName !== a.sortName || used.has(cand)) continue;

            let ok = true;
            for (const [k, dep] of Object.entries(a.dependencies)) {
                if (typeof dep === "boolean") {
                    if (dep === true) {
                        // Flags leaving from a non-root layer belong to the rule's
                        // child-layer structure, not the root pattern: they must not
                        // constrain matching. Only root-layer flag layers constrain.
                        const rootFlagLayers = a.getFlagLayers(k).filter(l => ruleRootLayerIds.has(l));
                        if (rootFlagLayers.length === 0) {
                            continue;
                        }
                        if (cand.dependencies[k] !== true) {
                            ok = false;
                            break;
                        }
                        // A flag leaves from the rule root layer: require the same
                        // relative depth between the flag's layer and the artefact's layer.
                        const patternRelative = rule.getLayerDepth(rootFlagLayers[0]) - rule.getLayerDepth(a.layerId);
                        const hostRelative = cand.getFlagLayers(k).map(l => host.getLayerDepth(l) - host.getLayerDepth(cand.layerId));
                        if (!hostRelative.includes(patternRelative)) {
                            ok = false;
                            break;
                        }
                    }
                } else if (patternSet.has(dep)) {
                    const img = assignment.get(dep);
                    if (img === undefined) {
                        ok = false;
                        break;
                    }
                    const hostDep = cand.dependencies[k];
                    if (typeof hostDep === "boolean" || hostDep === undefined) {
                        ok = false;
                        break;
                    }
                    if (hostDep !== img && !host.areEqual(hostDep, img, cand.layerId)) {
                        ok = false;
                        break;
                    }
                }
            }
            if (!ok) continue;

            assignment.set(a, cand);
            used.add(cand);
            backtrack(i + 1);
            used.delete(cand);
            assignment.delete(a);
        }
    };

    backtrack(0);

    const uniqueResults: RuleApplication[] = [];
    for (const r of results) {
        if (!uniqueResults.some(u => applicationsEquivalent(host, patternSet, r, u))) {
            uniqueResults.push(r);
        }
    }
    return uniqueResults;
}

function applicationsEquivalent(
    host: Drawing,
    patternSet: Set<Artefact>,
    a: RuleApplication,
    b: RuleApplication
): boolean {
    for (const p of patternSet) {
        const img1 = a.matchedArtefacts.get(p);
        const img2 = b.matchedArtefacts.get(p);
        if (!img1 || !img2) return false;
        if (img1 !== img2 && !host.areEqual(img1, img2, img1.layerId)) return false;
    }
    return true;
}

function validateRuleDrawing(rule: Drawing): void {
    if (!rule.isRule) {
        throw new Error("Consistency Check Failed: Drawing is not marked as a rule; a drawing must be explicitly marked as a rule before it can be used as a rule.");
    }
    const ruleStructure = rule.checkRuleConditions();
    if (!ruleStructure.isRule) {
        throw new Error(`Consistency Check Failed: Drawing marked as a rule does not satisfy rule conditions: ${ruleStructure.reason}`);
    }
}

function findRootRuleApplications(rule: Drawing, host: Drawing): RuleApplication[] {
    const rootLayers = rule.getAllLayers().filter(l => l.parentId === null);
    if (rootLayers.length !== 1) {
        return [];
    }
    const root = rootLayers[0];
    const rootArts = rule.getArtefacts().filter(a => a.sortName !== "Equality" && a.layerId === root.id);
    return findRuleApplicationsInternal(host, rootArts, extractEqualityConstraints(rule), rule);
}

export function findRuleApplications(rule: Drawing, host: Drawing): RuleApplication[] {
    validateRuleDrawing(rule);

    return findRootRuleApplications(rule, host);
}

export function findFirstOrderRuleApplications(rule: Drawing, host: Drawing): RuleApplication[] {
    validateRuleDrawing(rule);

    const layers = rule.getAllLayers();
    const rootLayers = layers.filter(l => l.parentId === null);
    if (rootLayers.length !== 1) {
        return [];
    }
    const root = rootLayers[0];
    const childLayers = layers.filter(l => l.parentId === root.id);
    if (childLayers.length !== 1) {
        return [];
    }

    return findRootRuleApplications(rule, host);
}

export function findSecondOrderRuleApplications(rule: Drawing, host: Drawing): RuleApplication[] {
    validateRuleDrawing(rule);

    const layers = rule.getAllLayers();
    const rootLayers = layers.filter(l => l.parentId === null);
    if (rootLayers.length !== 1) {
        return [];
    }
    const root = rootLayers[0];
    const childLayers = layers.filter(l => l.parentId === root.id);
    if (childLayers.length < 2) {
        return [];
    }

    return findRootRuleApplications(rule, host);
}

function resolveHostRootId(
    ruleRoot: Layer,
    ruleArts: Artefact[],
    match: Map<Artefact, Artefact>,
    hostRoots: Layer[]
): string {
    const anchorLayerIds = new Set<string>();
    for (const a of ruleArts) {
        for (const dep of Object.values(a.dependencies)) {
            if (typeof dep !== "boolean" && dep.layerId === ruleRoot.id && match.has(dep)) {
                anchorLayerIds.add(match.get(dep)!.layerId);
            }
        }
    }
    if (anchorLayerIds.size === 0) {
        return hostRoots[0].id;
    } else if (anchorLayerIds.size === 1) {
        return Array.from(anchorLayerIds)[0];
    } else {
        throw new Error("Consistency Check Failed: Matched artefacts span multiple root layers; cannot determine target layer.");
    }
}

function artefactChildren(art: Artefact): Artefact[] {
    return art instanceof EqualityArtefact
        ? art.children
        : Object.values(art.dependencies).filter((v): v is Artefact => typeof v !== "boolean");
}

function topologicallyOrderPattern(pattern: Artefact[]): Artefact[] | null {
    const patternSet = new Set<Artefact>(pattern);
    const ordered: Artefact[] = [];
    const orderedSet = new Set<Artefact>();
    while (ordered.length < pattern.length) {
        const next = pattern.find(a =>
            !orderedSet.has(a) &&
            Object.values(a.dependencies).every(dep =>
                typeof dep === "boolean" || !patternSet.has(dep) || orderedSet.has(dep)
            )
        );
        if (!next) break;
        ordered.push(next);
        orderedSet.add(next);
    }
    return orderedSet.size === pattern.length ? ordered : null;
}

function remapFlagLayers(source: Artefact, target: Artefact, targetDrawing: Drawing, layerMap: Record<string, string>): void {
    for (const [flagKey, flagLayerArr] of Object.entries(source.flagLayers)) {
        const mapped = flagLayerArr.map(flagLayer => layerMap[flagLayer] ?? flagLayer);
        const kept = Array.from(new Set(mapped)).filter(flagLayer =>
            flagLayer !== target.layerId &&
            !!targetDrawing.getLayer(flagLayer) &&
            targetDrawing.getDescendants(target.layerId).has(flagLayer)
        );
        if (kept.length > 0) {
            target.flagLayers[flagKey] = kept;
        }
    }
}

function computeConclusionFlags(rule: Drawing, ruleRoot: Layer, childLayer: Layer, match: Map<Artefact, Artefact>): Map<Artefact, Set<string>> {
    const result = new Map<Artefact, Set<string>>();
    for (const a of rule.getArtefacts()) {
        if (a.layerId !== ruleRoot.id) continue;
        for (const [key, dep] of Object.entries(a.dependencies)) {
            if (dep !== true) continue;
            if (!a.getFlagLayers(key).includes(childLayer.id)) continue;
            const img = match.get(a);
            if (!img) continue;
            if (!result.has(img)) result.set(img, new Set());
            result.get(img)!.add(key);
        }
    }
    return result;
}

function applyRuleConclusion(rule: Drawing, host: Drawing, application: RuleApplication, childLayer: Layer): { artefacts: Artefact[]; conclusionFlags: Map<Artefact, Set<string>>; created: Map<Artefact, Artefact> } {
    const layers = rule.getAllLayers();
    const rootLayers = layers.filter(l => l.parentId === null);
    if (rootLayers.length !== 1) {
        throw new Error("Consistency Check Failed: Applying a rule requires the rule to have exactly one root layer.");
    }
    const ruleRoot = rootLayers[0];

    const childArts = rule.getArtefacts()
        .filter(a => a.layerId === childLayer.id && a.sortName !== "Equality");

    const match = application.matchedArtefacts;

    const hostRoots = host.getAllLayers().filter(l => l.parentId === null);
    if (hostRoots.length === 0) {
        throw new Error("Consistency Check Failed: Host drawing has no root layer to add artefacts to.");
    }

    const hostRootId = resolveHostRootId(ruleRoot, childArts, match, hostRoots);

    // Flags set on root-layer rule artefacts that leave from the conclusion layer
    // are added to the matched host artefacts in the host root layer.
    const conclusionFlags = computeConclusionFlags(rule, ruleRoot, childLayer, match);
    for (const [img, keys] of conclusionFlags) {
        for (const key of keys) {
            img.dependencies[key] = true;
            const current = img.getFlagLayers(key);
            const next = Array.from(new Set([...current, hostRootId]));
            if (next.length > 0) {
                img.flagLayers[key] = next;
            } else {
                delete img.flagLayers[key];
            }
        }
    }

    const created = new Map<Artefact, Artefact>();
    const result: Artefact[] = [];
    const remaining = [...childArts];

    while (remaining.length > 0) {
        const idx = remaining.findIndex(a =>
            Object.values(a.dependencies).every(dep =>
                typeof dep === "boolean" ||
                (dep.layerId === ruleRoot.id && match.has(dep)) ||
                (dep.layerId === childLayer.id && created.has(dep))
            )
        );
        if (idx === -1) {
            const unresolved = remaining.find(a => {
                for (const dep of Object.values(a.dependencies)) {
                    if (typeof dep === "boolean") continue;
                    if (dep.layerId === ruleRoot.id && match.has(dep)) continue;
                    if (dep.layerId === childLayer.id && created.has(dep)) continue;
                    return true;
                }
                return false;
            });
            const label = unresolved ? (unresolved.data.label || unresolved.sortName) : "unknown";
            throw new Error(`Consistency Check Failed: Cannot resolve dependencies when applying rule (artefact '${label}').`);
        }

        const a = remaining.splice(idx, 1)[0];
        const newDeps: Record<string, Artefact | boolean> = {};
        for (const [key, dep] of Object.entries(a.dependencies)) {
            if (typeof dep === "boolean") {
                newDeps[key] = dep;
            } else if (dep.layerId === ruleRoot.id) {
                const img = match.get(dep);
                if (!img) {
                    throw new Error(`Consistency Check Failed: No match found for rule artefact '${dep.data.label || dep.sortName}'.`);
                }
                newDeps[key] = img;
            } else {
                const copy = created.get(dep);
                if (!copy) {
                    throw new Error(`Consistency Check Failed: No copy created for rule artefact '${dep.data.label || dep.sortName}'.`);
                }
                newDeps[key] = copy;
            }
        }

        const newArt = host.newArtefact(a.sortName, newDeps, JSON.parse(JSON.stringify(a.data)), hostRootId);
        const layerMap: Record<string, string> = {};
        layerMap[ruleRoot.id] = hostRootId;
        layerMap[childLayer.id] = hostRootId;
        remapFlagLayers(a, newArt, host, layerMap);
        created.set(a, newArt);
        result.push(newArt);
    }

    // Re-create the rule's child-layer equalities in the host drawing (without validation)
    const childEqualities = rule.getArtefacts()
        .filter(a => a.sortName === "Equality" && a.layerId === childLayer.id);

    for (const eq of childEqualities) {
        const resolvedChildren: Artefact[] = [];
        for (const child of artefactChildren(eq)) {
            if (child.layerId === ruleRoot.id) {
                const img = match.get(child);
                if (!img) {
                    throw new Error(`Consistency Check Failed: No match found for rule equality child '${child.data.label || child.sortName}'.`);
                }
                resolvedChildren.push(img);
            } else {
                const copy = created.get(child);
                if (!copy) {
                    throw new Error(`Consistency Check Failed: No copy created for rule equality child '${child.data.label || child.sortName}'.`);
                }
                resolvedChildren.push(copy);
            }
        }

        const uniqueChildren = Array.from(new Set(resolvedChildren));
        if (uniqueChildren.length >= 2) {
            const newEq = host.addEqualityArtefactUnchecked(uniqueChildren, hostRootId, JSON.parse(JSON.stringify(eq.data)));
            created.set(eq, newEq);
            result.push(newEq);
        }
    }

    return { artefacts: result, conclusionFlags, created };
}

export function applyFirstOrderRule(rule: Drawing, host: Drawing, application: RuleApplication): { artefacts: Artefact[]; created: Map<Artefact, Artefact> } {
    if (!rule.isRule) {
        throw new Error("Consistency Check Failed: Drawing is not marked as a rule; a drawing must be explicitly marked as a rule before it can be applied.");
    }
    const ruleStructure = rule.checkRuleConditions();
    if (!ruleStructure.isRule) {
        throw new Error(`Consistency Check Failed: Drawing marked as a rule does not satisfy rule conditions: ${ruleStructure.reason}`);
    }

    const layers = rule.getAllLayers();
    const rootLayers = layers.filter(l => l.parentId === null);
    if (rootLayers.length !== 1) {
        throw new Error("Consistency Check Failed: Applying a first-order rule requires the rule to have exactly one root layer.");
    }
    const ruleRoot = rootLayers[0];
    const childLayers = layers.filter(l => l.parentId === ruleRoot.id);
    if (childLayers.length !== 1) {
        throw new Error("Consistency Check Failed: Applying a first-order rule requires the rule's root layer to have exactly one child layer.");
    }
    const childLayer = childLayers[0];

    return applyRuleConclusion(rule, host, application, childLayer);
}

export interface DerivedRule {
    name: string;
    drawing: Drawing;
}

export interface SecondOrderRuleNames {
    hostName: string;
    ruleName: string;
}

export interface SecondOrderRuleApplicationResult {
    hostArtefacts: Artefact[];
    hostCreated: Map<Artefact, Artefact>;
    derivedRules: DerivedRule[];
}

export function applySecondOrderRule(rule: Drawing, host: Drawing, application: RuleApplication, names?: SecondOrderRuleNames): SecondOrderRuleApplicationResult {
    if (!rule.isRule) {
        throw new Error("Consistency Check Failed: Drawing is not marked as a rule; a drawing must be explicitly marked as a rule before it can be applied.");
    }
    const ruleStructure = rule.checkRuleConditions();
    if (!ruleStructure.isRule) {
        throw new Error(`Consistency Check Failed: Drawing marked as a rule does not satisfy rule conditions: ${ruleStructure.reason}`);
    }

    const layers = rule.getAllLayers();
    const rootLayers = layers.filter(l => l.parentId === null);
    if (rootLayers.length !== 1) {
        throw new Error("Consistency Check Failed: Applying a second-order rule requires the rule to have exactly one root layer.");
    }
    const ruleRoot = rootLayers[0];
    const childLayers = layers.filter(l => l.parentId === ruleRoot.id);
    if (childLayers.length < 2) {
        throw new Error("Consistency Check Failed: Applying a second-order rule requires the rule's root layer to have at least two child layers.");
    }

    // The conclusion is the unique child of the root layer that has no children of its own
    const conclusion = childLayers.find(child => {
        const childrenOfChild = layers.filter(l => l.parentId === child.id);
        return childrenOfChild.length === 0;
    });
    if (!conclusion) {
        throw new Error("Consistency Check Failed: A second-order rule requires exactly one child layer of the root layer without children.");
    }

    // The premise layers are the other depth-2 child layers; each has at most one child layer (rule condition 4)
    const premiseLayers = childLayers.filter(child => child !== conclusion);

    // Step 1: apply the rule as if it were first-order, ignoring the other child layers of depth 2
    const { artefacts: hostArtefacts, conclusionFlags, created } = applyRuleConclusion(rule, host, application, conclusion);
    // The conclusion is merged into the host root; it must NOT be carried over
    // into the derived drawings created for each premise layer.
    const conclusionCreated = new Set<Artefact>(hostArtefacts);

    // Step 2: for each other child layer A with child layer B, create a new drawing
    const match = application.matchedArtefacts;
    const hostRoots = host.getAllLayers().filter(l => l.parentId === null);
    if (hostRoots.length === 0) {
        throw new Error("Consistency Check Failed: Host drawing has no root layer to add artefacts to.");
    }

    const derivedRules: DerivedRule[] = [];

    for (const premise of premiseLayers) {
        const premiseArts = rule.getArtefacts()
            .filter(a => a.layerId === premise.id && a.sortName !== "Equality");

        const hostRootId = resolveHostRootId(ruleRoot, premiseArts, match, hostRoots);

        const derived = new Drawing(rule.sortStore);
        const derivedRootId = "root";

        // Copy the host root layer's artefacts into the derived drawing (standalone snapshot)
        const origToCopy = new Map<Artefact, Artefact>();
        const hostRootArts = host.getArtefacts()
            .filter(a => a.layerId === hostRootId && a.sortName !== "Equality" && !conclusionCreated.has(a));

        const remainingHost = [...hostRootArts];
        while (remainingHost.length > 0) {
            const idx = remainingHost.findIndex(a =>
                Object.values(a.dependencies).every(dep =>
                    typeof dep === "boolean" ||
                    (typeof dep !== "boolean" && (dep.layerId !== hostRootId || origToCopy.has(dep)))
                )
            );
            if (idx === -1) {
                throw new Error(`Consistency Check Failed: Cannot resolve dependencies when copying host root artefacts for derived rule '${premise.name}'.`);
            }
            const a = remainingHost.splice(idx, 1)[0];
            const excludedFlags = conclusionFlags.get(a);
            const copiedDeps: Record<string, Artefact | boolean> = {};
            for (const [key, dep] of Object.entries(a.dependencies)) {
                if (excludedFlags?.has(key)) continue;
                if (typeof dep === "boolean") {
                    copiedDeps[key] = dep;
                } else {
                    const copy = origToCopy.get(dep);
                    if (!copy) {
                        throw new Error(`Consistency Check Failed: No copy created for host root artefact '${dep.data.label || dep.sortName}'.`);
                    }
                    copiedDeps[key] = copy;
                }
            }
            const copy = derived.newArtefact(a.sortName, copiedDeps, JSON.parse(JSON.stringify(a.data)), derivedRootId);
            const copyLayerMap: Record<string, string> = {};
            copyLayerMap[hostRootId] = derivedRootId;
            remapFlagLayers(a, copy, derived, copyLayerMap);
            if (excludedFlags) {
                for (const key of excludedFlags) delete copy.flagLayers[key];
            }
            origToCopy.set(a, copy);
        }

        const hostRootEqualities = host.getArtefacts()
            .filter(a => a.layerId === hostRootId && a.sortName === "Equality" && !conclusionCreated.has(a));
        for (const eq of hostRootEqualities) {
            const mappedChildren = artefactChildren(eq)
                .map(c => origToCopy.get(c))
                .filter((c): c is Artefact => c !== undefined);
            const uniqueChildren = Array.from(new Set(mappedChildren));
            if (uniqueChildren.length >= 2) {
                derived.addEqualityArtefactUnchecked(uniqueChildren, derivedRootId, JSON.parse(JSON.stringify(eq.data)));
            }
        }

        // Instantiate the premise layer A's artefacts in the derived root layer
        const aCreated = new Map<Artefact, Artefact>();
        const remainingA = [...premiseArts];
        while (remainingA.length > 0) {
            const idx = remainingA.findIndex(a =>
                Object.values(a.dependencies).every(dep =>
                    typeof dep === "boolean" ||
                    (dep.layerId === ruleRoot.id && match.has(dep) && origToCopy.has(match.get(dep)!)) ||
                    (dep.layerId === premise.id && aCreated.has(dep))
                )
            );
            if (idx === -1) {
                const unresolved = remainingA.find(a => {
                    for (const dep of Object.values(a.dependencies)) {
                        if (typeof dep === "boolean") continue;
                        if (dep.layerId === ruleRoot.id && match.has(dep) && origToCopy.has(match.get(dep)!)) continue;
                        if (dep.layerId === premise.id && aCreated.has(dep)) continue;
                        return true;
                    }
                    return false;
                });
                const label = unresolved ? (unresolved.data.label || unresolved.sortName) : "unknown";
                throw new Error(`Consistency Check Failed: Cannot resolve dependencies when instantiating premise layer '${premise.name}' (artefact '${label}').`);
            }

            const a = remainingA.splice(idx, 1)[0];
            const newDeps: Record<string, Artefact | boolean> = {};
            for (const [key, dep] of Object.entries(a.dependencies)) {
                if (typeof dep === "boolean") {
                    newDeps[key] = dep;
                } else if (dep.layerId === ruleRoot.id) {
                    const img = match.get(dep);
                    const copy = img ? origToCopy.get(img) : undefined;
                    if (!img || !copy) {
                        throw new Error(`Consistency Check Failed: No copy found for matched rule artefact '${dep.data.label || dep.sortName}'.`);
                    }
                    newDeps[key] = copy;
                } else {
                    const copy = aCreated.get(dep);
                    if (!copy) {
                        throw new Error(`Consistency Check Failed: No copy created for premise artefact '${dep.data.label || dep.sortName}'.`);
                    }
                    newDeps[key] = copy;
                }
            }
            const newArt = derived.newArtefact(a.sortName, newDeps, JSON.parse(JSON.stringify(a.data)), derivedRootId);
            const premiseLayerMap: Record<string, string> = {};
            premiseLayerMap[ruleRoot.id] = derivedRootId;
            premiseLayerMap[premise.id] = derivedRootId;
            remapFlagLayers(a, newArt, derived, premiseLayerMap);
            aCreated.set(a, newArt);
        }

        const premiseEqualities = rule.getArtefacts()
            .filter(a => a.layerId === premise.id && a.sortName === "Equality");
        for (const eq of premiseEqualities) {
            const resolvedChildren: Artefact[] = [];
            for (const child of artefactChildren(eq)) {
                if (child.layerId === ruleRoot.id) {
                    const img = match.get(child);
                    const copy = img ? origToCopy.get(img) : undefined;
                    if (!img || !copy) {
                        throw new Error(`Consistency Check Failed: No copy found for matched rule equality child '${child.data.label || child.sortName}'.`);
                    }
                    resolvedChildren.push(copy);
                } else {
                    const copy = aCreated.get(child);
                    if (!copy) {
                        throw new Error(`Consistency Check Failed: No copy created for premise equality child '${child.data.label || child.sortName}'.`);
                    }
                    resolvedChildren.push(copy);
                }
            }
            const uniqueChildren = Array.from(new Set(resolvedChildren));
            if (uniqueChildren.length >= 2) {
                derived.addEqualityArtefactUnchecked(uniqueChildren, derivedRootId, JSON.parse(JSON.stringify(eq.data)));
            }
        }

        // The child layer B of the premise layer A (at most one, by rule condition 4)
        const childOfPremise = rule.getAllLayers().filter(l => l.parentId === premise.id)[0];
        if (!childOfPremise) {
            throw new Error(`Consistency Check Failed: Premise layer '${premise.name}' has no child layer.`);
        }

        derived.addLayer(childOfPremise.id, "Goal", derivedRootId, childOfPremise.color, childOfPremise.colorEnabled);

        // Copy the child layer B's artefacts, adapted to this parent
        const bArts = rule.getArtefacts()
            .filter(a => a.layerId === childOfPremise.id && a.sortName !== "Equality");
        const bCreated = new Map<Artefact, Artefact>();
        const remainingB = [...bArts];
        while (remainingB.length > 0) {
            const idx = remainingB.findIndex(a =>
                Object.values(a.dependencies).every(dep =>
                    typeof dep === "boolean" ||
                    (dep.layerId === ruleRoot.id && match.has(dep) && origToCopy.has(match.get(dep)!)) ||
                    (dep.layerId === premise.id && aCreated.has(dep)) ||
                    (dep.layerId === childOfPremise.id && bCreated.has(dep))
                )
            );
            if (idx === -1) {
                const unresolved = remainingB.find(a => {
                    for (const dep of Object.values(a.dependencies)) {
                        if (typeof dep === "boolean") continue;
                        if (dep.layerId === ruleRoot.id && match.has(dep) && origToCopy.has(match.get(dep)!)) continue;
                        if (dep.layerId === premise.id && aCreated.has(dep)) continue;
                        if (dep.layerId === childOfPremise.id && bCreated.has(dep)) continue;
                        return true;
                    }
                    return false;
                });
                const label = unresolved ? (unresolved.data.label || unresolved.sortName) : "unknown";
                throw new Error(`Consistency Check Failed: Cannot resolve dependencies when copying child layer '${childOfPremise.name}' (artefact '${label}').`);
            }

            const a = remainingB.splice(idx, 1)[0];
            const newDeps: Record<string, Artefact | boolean> = {};
            for (const [key, dep] of Object.entries(a.dependencies)) {
                if (typeof dep === "boolean") {
                    newDeps[key] = dep;
                } else if (dep.layerId === ruleRoot.id) {
                    const img = match.get(dep);
                    const copy = img ? origToCopy.get(img) : undefined;
                    if (!img || !copy) {
                        throw new Error(`Consistency Check Failed: No copy found for matched rule artefact '${dep.data.label || dep.sortName}'.`);
                    }
                    newDeps[key] = copy;
                } else if (dep.layerId === premise.id) {
                    const copy = aCreated.get(dep);
                    if (!copy) {
                        throw new Error(`Consistency Check Failed: No copy created for premise artefact '${dep.data.label || dep.sortName}'.`);
                    }
                    newDeps[key] = copy;
                } else {
                    const copy = bCreated.get(dep);
                    if (!copy) {
                        throw new Error(`Consistency Check Failed: No copy created for child layer artefact '${dep.data.label || dep.sortName}'.`);
                    }
                    newDeps[key] = copy;
                }
            }
            const newArt = derived.newArtefact(a.sortName, newDeps, JSON.parse(JSON.stringify(a.data)), childOfPremise.id);
            const bLayerMap: Record<string, string> = {};
            bLayerMap[ruleRoot.id] = derivedRootId;
            bLayerMap[premise.id] = derivedRootId;
            remapFlagLayers(a, newArt, derived, bLayerMap);
            bCreated.set(a, newArt);
        }

        const childEqualities = rule.getArtefacts()
            .filter(a => a.layerId === childOfPremise.id && a.sortName === "Equality");
        for (const eq of childEqualities) {
            const resolvedChildren: Artefact[] = [];
            for (const child of artefactChildren(eq)) {
                if (child.layerId === ruleRoot.id) {
                    const img = match.get(child);
                    const copy = img ? origToCopy.get(img) : undefined;
                    if (!img || !copy) {
                        throw new Error(`Consistency Check Failed: No copy found for matched rule equality child '${child.data.label || child.sortName}'.`);
                    }
                    resolvedChildren.push(copy);
                } else if (child.layerId === premise.id) {
                    const copy = aCreated.get(child);
                    if (!copy) {
                        throw new Error(`Consistency Check Failed: No copy created for premise equality child '${child.data.label || child.sortName}'.`);
                    }
                    resolvedChildren.push(copy);
                } else {
                    const copy = bCreated.get(child);
                    if (!copy) {
                        throw new Error(`Consistency Check Failed: No copy created for child layer equality child '${child.data.label || child.sortName}'.`);
                    }
                    resolvedChildren.push(copy);
                }
            }
            const uniqueChildren = Array.from(new Set(resolvedChildren));
            if (uniqueChildren.length >= 2) {
                derived.addEqualityArtefactUnchecked(uniqueChildren, childOfPremise.id, JSON.parse(JSON.stringify(eq.data)));
            }
        }

        const derivedName = names
            ? `${names.hostName} > ${names.ruleName} > ${premise.name}`
            : premise.name;
        derivedRules.push({ name: derivedName, drawing: derived });
    }

    return { hostArtefacts, hostCreated: created, derivedRules };
}
