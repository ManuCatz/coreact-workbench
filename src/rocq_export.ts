import type { ArtefactData, LayerData, SavedDrawing, SortDefinition, SortStore } from "./index";

const ROCQ_KEYWORDS: ReadonlySet<string> = new Set([
    "Match", "End", "match", "end", "let", "in", "fun", "forall", "exists",
    "if", "then", "else", "Prop", "Set", "Type", "Record", "Inductive",
    "CoInductive", "Definition", "Example", "Theorem", "Lemma", "Corollary",
    "Proposition", "Fixpoint", "CoFixpoint", "Class", "Instance", "Structure",
    "Module", "Section", "Context", "Variable", "Variables", "Hypothesis",
    "Hypotheses", "Axiom", "Parameter", "Parameters", "Arguments", "Notation",
    "Infix", "Generalizable", "Implicit", "Admitted", "Obligation", "Proof",
    "eq", "and", "or", "not", "iff", "True", "False", "nat", "bool", "O", "S",
    "true", "false", "pair", "ex", "sig", "id"
]);

function sanitizeIdent(raw: string): string {
    let s = raw.replace(/[^A-Za-z0-9_']/g, "_");
    if (!s) {
        s = "x";
    }
    if (/^[0-9_]/.test(s)) {
        s = `x${s}`;
    }
    if (ROCQ_KEYWORDS.has(s)) {
        s = `x${s}`;
    }
    return s;
}

class NameRegistry {
    private readonly used: Set<string>;

    constructor(initial: Iterable<string> = []) {
        this.used = new Set(initial);
    }

    has(name: string): boolean {
        return this.used.has(name);
    }

    reserve(name: string): void {
        this.used.add(name);
    }

    unique(base: string): string {
        let candidate = base;
        let index = 2;
        while (this.used.has(candidate)) {
            candidate = `${base}_${index}`;
            index++;
        }
        this.used.add(candidate);
        return candidate;
    }
}

function getSort(sortStore: SortStore, name: string): SortDefinition {
    const def = sortStore.getSort(name);
    if (!def) {
        throw new Error(`Consistency Check Failed: Sort '${name}' is not defined.`);
    }
    return def;
}

function nonFlagDeps(def: SortDefinition): Array<[string, string]> {
    return Object.entries(def.dependencies).filter(([, sortName]) => sortName !== "flag");
}

function uniquePrefix(depKey: string, used: Set<string>): string {
    const base = sanitizeIdent(depKey);
    let prefix = base;
    let index = 2;
    while (used.has(prefix)) {
        prefix = `${base}_${index}`;
        index++;
    }
    used.add(prefix);
    return prefix;
}

function leafBinderNames(sortStore: SortStore, sortName: string): string[] {
    const def = getSort(sortStore, sortName);
    const deps = nonFlagDeps(def);
    if (deps.length === 0) {
        return [];
    }
    const result: string[] = [];
    const headerNames = new Set<string>();
    for (const [depKey, depSortName] of deps) {
        const prefix = uniquePrefix(depKey, headerNames);
        for (const leaf of leafBinderNames(sortStore, depSortName)) {
            result.push(`${prefix}_${leaf}`);
        }
        result.push(prefix);
    }
    return result;
}

function sortHeaderType(sortStore: SortStore, def: SortDefinition): string {
    const deps = nonFlagDeps(def);
    if (deps.length === 0) {
        return "Type";
    }
    const binders: string[] = [];
    const arrows: string[] = [];
    const headerNames = new Set<string>();
    for (const [depKey, depSortName] of deps) {
        const leafs = leafBinderNames(sortStore, depSortName);
        if (leafs.length === 0) {
            arrows.push(depSortName);
        } else {
            const prefix = uniquePrefix(depKey, headerNames);
            const prefixed = leafs.map(leaf => `${prefix}_${leaf}`);
            binders.push(`\`(${prefix} : ${depSortName} ${prefixed.join(" ")})`);
        }
    }
    if (binders.length === 0) {
        return `${arrows.join(" -> ")} -> Type`;
    }
    const tail = arrows.length > 0 ? `${arrows.join(" -> ")} -> Type` : "Type";
    return `forall ${binders.join(" ")}, ${tail}`;
}

function flagHeaderType(sortStore: SortStore, sortName: string): string {
    const leafs = leafBinderNames(sortStore, sortName);
    if (leafs.length === 0) {
        return `${sortName} -> Prop`;
    }
    return `forall \`(e : ${sortName} ${leafs.join(" ")}), Prop`;
}

interface FieldItem {
    name: string;
    type: string;
    deps: string[];
}

function topoSortFields(items: FieldItem[]): FieldItem[] {
    const names = items.map(item => item.name);
    const nameSet = new Set(names);
    const indeg = new Map<string, number>();
    for (const item of items) {
        indeg.set(item.name, item.deps.filter(dep => nameSet.has(dep)).length);
    }
    const order: FieldItem[] = [];
    const queue = items.filter(item => indeg.get(item.name) === 0);
    while (queue.length > 0) {
        const item = queue.shift()!;
        order.push(item);
        for (const other of items) {
            if (other.deps.includes(item.name)) {
                const current = indeg.get(other.name)! - 1;
                indeg.set(other.name, current);
                if (current === 0 && !order.includes(other) && !queue.includes(other)) {
                    queue.push(other);
                }
            }
        }
    }
    if (order.length !== items.length) {
        throw new Error("Consistency Check Failed: Cyclic field dependencies within a layer record.");
    }
    return order;
}

interface DrawingModel {
    name: string;
    layerById: Map<string, LayerData>;
    artefactById: Map<string, ArtefactData>;
    layerOrder: LayerData[];
    ancestors: Map<string, string[]>;
    recordNames: Map<string, string>;
    fieldNames: Map<string, string>;
}

function buildDrawingModel(
    savedDrawing: SavedDrawing,
    registry: NameRegistry
): DrawingModel {
    const layerById = new Map(savedDrawing.layers.map(layer => [layer.id, layer] as const));
    const artefactById = new Map(savedDrawing.artefacts.map(art => [art.id, art] as const));

    const layerOrder: LayerData[] = [];
    const visited = new Set<string>();
    const visit = (layerId: string): void => {
        if (visited.has(layerId)) {
            return;
        }
        const layer = layerById.get(layerId);
        if (!layer) {
            return;
        }
        if (layer.parentId !== null && layerById.has(layer.parentId) && !visited.has(layer.parentId)) {
            visit(layer.parentId);
        }
        visited.add(layerId);
        layerOrder.push(layer);
    };
    for (const layer of savedDrawing.layers) {
        visit(layer.id);
    }

    const ancestors = new Map<string, string[]>();
    for (const layer of savedDrawing.layers) {
        const chain: string[] = [];
        let current: string | null = layer.id;
        while (current !== null && layerById.has(current)) {
            chain.push(current);
            current = layerById.get(current)!.parentId;
        }
        ancestors.set(layer.id, chain);
    }

    const recordNames = new Map<string, string>();
    for (const layer of savedDrawing.layers) {
        const baseName = sanitizeIdent(layer.name || layer.id);
        recordNames.set(layer.id, registry.unique(baseName));
    }

    const fieldNames = new Map<string, string>();
    for (const art of savedDrawing.artefacts) {
        const baseName = sanitizeIdent(typeof art.data.label === "string" && art.data.label ? art.data.label : art.sortName);
        fieldNames.set(art.id, registry.unique(baseName));
    }

    return { name: savedDrawing.name, layerById, artefactById, layerOrder, ancestors, recordNames, fieldNames };
}

function effectiveAncestors(model: DrawingModel, layerId: string): string[] {
    return (model.ancestors.get(layerId) ?? []).filter(ancId => model.recordNames.has(ancId));
}

function refFrom(model: DrawingModel, fromLayerId: string, artefactId: string): string {
    const art = model.artefactById.get(artefactId);
    if (!art) {
        throw new Error(`Consistency Check Failed: Artefact '${artefactId}' does not exist in drawing '${model.name}'.`);
    }
    const fieldName = model.fieldNames.get(artefactId);
    if (!fieldName) {
        throw new Error(`Consistency Check Failed: No field assigned for artefact '${artefactId}' in drawing '${model.name}'.`);
    }
    if (art.layerId === fromLayerId) {
        return fieldName;
    }
    const chain = effectiveAncestors(model, fromLayerId);
    const pos = chain.indexOf(art.layerId);
    if (pos === -1) {
        const layerName = model.layerById.get(fromLayerId)?.name ?? fromLayerId;
        throw new Error(
            `Consistency Check Failed: Artefact '${labelOf(art)}' (in layer '${model.layerById.get(art.layerId)?.name ?? art.layerId}') is not in layer '${layerName}' or any of its lower ancestor layers.`
        );
    }
    const depth = (model.ancestors.get(fromLayerId) ?? []).length;
    const fromRoot = chain.slice(1).reverse();
    const idx = fromRoot.indexOf(art.layerId);
    const paramName = "g".repeat(depth - 2 - idx) + "p";
    return `${paramName}.(${fieldName})`;
}

function labelOf(art: ArtefactData): string {
    return typeof art.data.label === "string" && art.data.label ? art.data.label : art.sortName;
}

function stringDepEntries(dependencies: Record<string, string | boolean>): Array<[string, string]> {
    return Object.entries(dependencies)
        .filter((entry): entry is [string, string] => typeof entry[1] === "string")
        .sort(([a], [b]) => a.localeCompare(b, "en", { numeric: true }));
}

function fieldType(model: DrawingModel, sortStore: SortStore, art: ArtefactData): string {
    const def = getSort(sortStore, art.sortName);
    const depRefs: string[] = [];
    for (const [depKey] of nonFlagDeps(def)) {
        const depValue = art.dependencies[depKey];
        if (typeof depValue !== "string") {
            throw new Error(
                `Consistency Check Failed: Missing artefact dependency '${depKey}' for artefact '${labelOf(art)}' (sort '${art.sortName}').`
            );
        }
        depRefs.push(refFrom(model, art.layerId, depValue));
    }
    return depRefs.length === 0 ? art.sortName : `${art.sortName} ${depRefs.join(" ")}`;
}

function equalityFieldName(model: DrawingModel, art: ArtefactData): string {
    const label = art.data.label;
    if (typeof label === "string" && label) {
        return `eq_${sanitizeIdent(label)}`;
    }
    const childIds = stringDepEntries(art.dependencies).map(([, value]) => value);
    const childLabels = childIds
        .map(id => model.artefactById.get(id))
        .filter((child): child is ArtefactData => !!child)
        .map(labelOf)
        .map(sanitizeIdent);
    return childLabels.length > 0 ? `eq_${childLabels.join("_")}` : "eq_x";
}

function equalityFieldType(model: DrawingModel, art: ArtefactData): string {
    const childIds = stringDepEntries(art.dependencies).map(([, value]) => value);
    if (childIds.length < 2) {
        throw new Error("Consistency Check Failed: A degenerate equality artefact (fewer than 2 children) cannot be exported.");
    }
    const refs = childIds.map(id => refFrom(model, art.layerId, id));
    const pairs: string[] = [];
    for (let i = 0; i + 1 < refs.length; i++) {
        pairs.push(`${refs[i]} = ${refs[i + 1]}`);
    }
    return pairs.join(" /\\ ");
}

function exportDrawing(
    savedDrawing: SavedDrawing,
    sortStore: SortStore,
    registry: NameRegistry
): string[] {
    const model = buildDrawingModel(savedDrawing, registry);
    const lines: string[] = [];

    interface FlagField {
        layerId: string;
        name: string;
        type: string;
        depFieldNames: string[];
    }
    const flagFieldsByLayer = new Map<string, FlagField[]>();
    const addFlagField = (layerId: string, flag: FlagField): void => {
        const list = flagFieldsByLayer.get(layerId) ?? [];
        list.push(flag);
        flagFieldsByLayer.set(layerId, list);
    };

    for (const art of savedDrawing.artefacts) {
        if (art.sortName === "Equality") {
            continue;
        }
        const def = getSort(sortStore, art.sortName);
        for (const [flagKey, expectedSortName] of Object.entries(def.dependencies)) {
            if (expectedSortName !== "flag") {
                continue;
            }
            if (art.dependencies[flagKey] !== true) {
                continue;
            }
            const flagLayerId = art.flagLayers?.[flagKey] ?? art.layerId;
            const artefactFieldName = model.fieldNames.get(art.id);
            if (!artefactFieldName) {
                throw new Error(`Consistency Check Failed: No field assigned for flagged artefact '${labelOf(art)}'.`);
            }
            const name = registry.unique(`${flagKey}_${artefactFieldName}`);
            addFlagField(flagLayerId, {
                layerId: flagLayerId,
                name,
                type: `${flagKey} ${refFrom(model, flagLayerId, art.id)}`,
                depFieldNames: art.layerId === flagLayerId ? [artefactFieldName] : []
            });
        }
    }

    for (const layer of model.layerOrder) {
        const layerArtefacts = savedDrawing.artefacts.filter(art => art.layerId === layer.id);
        const items: FieldItem[] = [];

        for (const art of layerArtefacts) {
            if (art.sortName === "Equality") {
                const name = registry.unique(equalityFieldName(model, art));
                const childIds = stringDepEntries(art.dependencies).map(([, value]) => value);
                const depFieldNames = childIds
                    .filter(id => model.artefactById.get(id)?.layerId === layer.id)
                    .map(id => model.fieldNames.get(id))
                    .filter((name): name is string => !!name);
                items.push({ name, type: equalityFieldType(model, art), deps: depFieldNames });
            } else {
                const fieldName = model.fieldNames.get(art.id);
                if (!fieldName) {
                    throw new Error(`Consistency Check Failed: No field assigned for artefact '${labelOf(art)}'.`);
                }
                const depFieldNames: string[] = [];
                const def = getSort(sortStore, art.sortName);
                for (const [depKey] of nonFlagDeps(def)) {
                    const depValue = art.dependencies[depKey];
                    if (typeof depValue === "string") {
                        const depArt = model.artefactById.get(depValue);
                        if (depArt && depArt.layerId === layer.id) {
                            const depFieldName = model.fieldNames.get(depValue);
                            if (depFieldName) {
                                depFieldNames.push(depFieldName);
                            }
                        }
                    }
                }
                items.push({ name: fieldName, type: fieldType(model, sortStore, art), deps: depFieldNames });
            }
        }

        const flagFields = flagFieldsByLayer.get(layer.id) ?? [];
        for (const flag of flagFields) {
            items.push({ name: flag.name, type: flag.type, deps: flag.depFieldNames });
        }

        if (items.length === 0) {
            continue;
        }

        const ordered = topoSortFields(items);
        const chain = effectiveAncestors(model, layer.id);
        const ancestorChain = chain.slice(1).reverse();

        if (ancestorChain.length === 0) {
            lines.push("");
            lines.push(`  Record ${model.recordNames.get(layer.id)} := {`);
        } else {
            const paramStrs: string[] = [];
            const argNames: string[] = [];
            for (let i = 0; i < ancestorChain.length; i++) {
                const paramName = "g".repeat(ancestorChain.length - 1 - i) + "p";
                const recordName = model.recordNames.get(ancestorChain[i]);
                if (!recordName) {
                    throw new Error(`Consistency Check Failed: No record assigned for ancestor layer of '${layer.name}'.`);
                }
                paramStrs.push(`(${paramName} : ${recordName}${argNames.length > 0 ? ` ${argNames.join(" ")}` : ""})`);
                argNames.push(paramName);
            }
            lines.push("");
            lines.push(`  Record ${model.recordNames.get(layer.id)} ${paramStrs.join(" ")} := {`);
        }

        for (const item of ordered) {
            lines.push(`    ${item.name} : ${item.type};`);
        }
        lines.push("  }.");
    }

    return lines;
}

export function exportDrawingsToRocq(savedDrawings: SavedDrawing[], sortStore: SortStore): string {
    if (savedDrawings.length === 0) {
        throw new Error("Consistency Check Failed: No drawings selected for export.");
    }

    const lines: string[] = [];
    lines.push("Generalizable All Variables.");
    lines.push("Set Implicit Arguments.");
    lines.push("");

    const sortDefs = sortStore.getAllSorts().filter(def => def.name !== "Equality");
    const emittedSorts = new Set<string>();
    const emitSort = (name: string): void => {
        if (emittedSorts.has(name)) {
            return;
        }
        const def = getSort(sortStore, name);
        for (const [, depSortName] of nonFlagDeps(def)) {
            if (depSortName !== "Equality") {
                emitSort(depSortName);
            }
        }
        emittedSorts.add(name);
        lines.push(`  Parameter ${def.name} : ${sortHeaderType(sortStore, def)}.`);
    };
    for (const def of sortDefs) {
        emitSort(def.name);
    }

    const flagPredicates = new Set<string>();
    for (const def of sortDefs) {
        for (const [flagKey, depSortName] of Object.entries(def.dependencies)) {
            if (depSortName === "flag") {
                flagPredicates.add(flagKey);
            }
        }
    }
    for (const flagName of flagPredicates) {
        const host = sortDefs.find(def => Object.values(def.dependencies).includes("flag") && Object.keys(def.dependencies).includes(flagName));
        if (host) {
            lines.push(`  Parameter ${flagName} : ${flagHeaderType(sortStore, host.name)}.`);
        }
    }

    for (const drawing of savedDrawings) {
        const registry = new NameRegistry();
        for (const name of flagPredicates) {
            registry.reserve(name);
        }
        for (const def of sortDefs) {
            registry.reserve(def.name);
        }
        registry.reserve("Equality");
        const moduleName = registry.unique(sanitizeIdent(drawing.name || "Drawing"));
        lines.push("");
        lines.push(`  (* ${drawing.name.replace(/\*\)/g, "* )")} *)`);
        lines.push(`  Module ${moduleName}.`);
        lines.push(...exportDrawing(drawing, sortStore, registry));
        lines.push(`  End ${moduleName}.`);
    }

    return lines.join("\n") + "\n";
}
