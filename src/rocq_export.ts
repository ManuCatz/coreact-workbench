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

export function sanitizeIdent(raw: string): string {
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

export class NameRegistry {
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

export const SIGMA_DEFINITION = `(* This alias is a workaround of a rocq bug that makes 
  ltac:(subst_all_in ..) fail *)
  Definition Sigma {A : Type}(B : A -> Type) := sigT B.`;

export const SIGMA_NOTATION = `Notation "'Σ' x .. y , p" :=
  (Sigma (fun x => .. (Sigma (fun y => p)) ..))
  (at level 200, x binder, y binder, right associativity).`;

export const TUPLE_NOTATION = `(* (a, b, c) : Σ (a : A)(b : B), C a b *)
Notation "( x , .. , y , p )" :=
  (existT _ x .. (existT _ y p) ..).`;

export const SUBST_ALL_TACTIC = `Ltac subst_all1 :=
  repeat (match goal with 
     | e : ?x = ?y |- _ => subst x; set (x := y); cbn
    end). `;

export const SUBST_ALL_LTAC2 = `Ltac2 subst_all () := ltac1:(subst_all1).`;

export const SUBST_ALL_IN_TACTIC = `Tactic Notation "subst_all_in"  uconstr(B)  :=
  subst_all1;  exact B.`;

export const DESTRUCT_SIGMA_TACTIC = `(* We use ltac2 because in ltac1 it is not be possible 
to destructure the list of identifiers. destruct_sigma substitutes the equalities *)

Ltac2 rec destruct_sigma_tac (t : constr) (l : ident list) :=
  match l with
  | [] => ()
  | [x] =>
    ltac1:(x t |- assert ( x := t)) (Ltac1.of_ident x) (Ltac1.of_constr t)
  | x :: q =>
      let h := Fresh.in_goal @destruct in
      ltac1:(x t h |- destruct t as [x h]) (Ltac1.of_ident x)
        (Ltac1.of_constr t) (Ltac1.of_ident h);

      let tx := Constr.type (Control.hyp x) in
      lazy_match! tx with
      | _ = _ => ltac1:(h |- subst; cbn in h) (Ltac1.of_ident h)
      | _ => ()
      end;
      destruct_sigma_tac (Control.hyp h) q;
      clear $h
      end.

Ltac2 Notation "destruct_sigma"
    t(constr) "as" l(list1(ident)) :=
  destruct_sigma_tac t l. `;

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

export interface FieldItem {
    name: string;
    type: string;
    deps: string[];
}

export function topoSortFields(items: FieldItem[]): FieldItem[] {
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

export interface DrawingModel {
    name: string;
    layerById: Map<string, LayerData>;
    artefactById: Map<string, ArtefactData>;
    layerOrder: LayerData[];
    ancestors: Map<string, string[]>;
    recordNames: Map<string, string>;
    fieldNames: Map<string, string>;
}

export function buildDrawingModel(
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

function refFrom(model: DrawingModel, fromLayerId: string, artefactId: string): string {
    const art = model.artefactById.get(artefactId);
    if (!art) {
        throw new Error(`Consistency Check Failed: Artefact '${artefactId}' does not exist in drawing '${model.name}'.`);
    }
    const fieldName = model.fieldNames.get(artefactId);
    if (!fieldName) {
        throw new Error(`Consistency Check Failed: No field assigned for artefact '${artefactId}' in drawing '${model.name}'.`);
    }
    if (art.layerId !== fromLayerId) {
        const chain = model.ancestors.get(fromLayerId) ?? [];
        if (!chain.includes(art.layerId)) {
            const layerName = model.layerById.get(fromLayerId)?.name ?? fromLayerId;
            throw new Error(
                `Consistency Check Failed: Artefact '${labelOf(art)}' (in layer '${model.layerById.get(art.layerId)?.name ?? art.layerId}') is not in layer '${layerName}' or any of its lower ancestor layers.`
            );
        }
    }
    return fieldName;
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

interface FlagField {
    layerId: string;
    artefactId: string;
    flagKey: string;
    name: string;
    type: string;
    depFieldNames: string[];
}

export interface ProofFieldNames {
    flagFieldNames: Map<string, string>;
    equalityFieldNames: Map<string, string>;
    flagFieldsByLayer: Map<string, FlagField[]>;
}

export function computeProofFieldNames(
    savedDrawing: SavedDrawing,
    sortStore: SortStore,
    model: DrawingModel,
    registry: NameRegistry
): ProofFieldNames {
    const flagFieldNames = new Map<string, string>();
    const flagFieldsByLayer = new Map<string, FlagField[]>();

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
            flagFieldNames.set(`${art.id}::${flagKey}`, name);
            const list = flagFieldsByLayer.get(flagLayerId) ?? [];
            list.push({
                layerId: flagLayerId,
                artefactId: art.id,
                flagKey,
                name,
                type: `${flagKey} ${refFrom(model, flagLayerId, art.id)}`,
                depFieldNames: art.layerId === flagLayerId ? [artefactFieldName] : []
            });
            flagFieldsByLayer.set(flagLayerId, list);
        }
    }

    const equalityFieldNames = new Map<string, string>();
    for (const layer of model.layerOrder) {
        const layerArtefacts = savedDrawing.artefacts.filter(art => art.layerId === layer.id);
        for (const art of layerArtefacts) {
            if (art.sortName !== "Equality") {
                continue;
            }
            equalityFieldNames.set(art.id, registry.unique(equalityFieldName(model, art)));
        }
    }

    return { flagFieldNames, equalityFieldNames, flagFieldsByLayer };
}

// ---------------------------------------------------------------------------
// Sigma-based rule types
// ---------------------------------------------------------------------------

export interface LayerElement extends FieldItem {
    kind: "artefact" | "flag" | "equation";
    artefactId?: string;
    flagKey?: string;
}

function buildLayerElements(
    savedDrawing: SavedDrawing,
    sortStore: SortStore,
    model: DrawingModel,
    proofNames: ProofFieldNames,
    layerId: string
): LayerElement[] {
    const items: LayerElement[] = [];
    const layerArtefacts = savedDrawing.artefacts.filter(art => art.layerId === layerId);

    for (const art of layerArtefacts) {
        if (art.sortName === "Equality") {
            const name = proofNames.equalityFieldNames.get(art.id);
            if (!name) {
                throw new Error(`Consistency Check Failed: No field name computed for equality artefact '${labelOf(art)}'.`);
            }
            const childIds = stringDepEntries(art.dependencies).map(([, value]) => value);
            const depFieldNames = childIds
                .filter(id => model.artefactById.get(id)?.layerId === layerId)
                .map(id => model.fieldNames.get(id))
                .filter((name): name is string => !!name);
            items.push({ name, type: equalityFieldType(model, art), deps: depFieldNames, kind: "equation", artefactId: art.id });
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
                    if (depArt && depArt.layerId === layerId) {
                        const depFieldName = model.fieldNames.get(depValue);
                        if (depFieldName) {
                            depFieldNames.push(depFieldName);
                        }
                    }
                }
            }
            items.push({ name: fieldName, type: fieldType(model, sortStore, art), deps: depFieldNames, kind: "artefact", artefactId: art.id });
        }
    }

    const flagFields = proofNames.flagFieldsByLayer.get(layerId) ?? [];
    for (const flag of flagFields) {
        items.push({ name: flag.name, type: flag.type, deps: flag.depFieldNames, kind: "flag", artefactId: flag.artefactId, flagKey: flag.flagKey });
    }

    return topoSortFields(items) as LayerElement[];
}

function binderGroups(elements: LayerElement[]): Array<{ names: string[]; type: string }> {
    const groups: Array<{ names: string[]; type: string }> = [];
    for (const el of elements) {
        const last = groups[groups.length - 1];
        if (last && last.type === el.type) {
            last.names.push(el.name);
        } else {
            groups.push({ names: [el.name], type: el.type });
        }
    }
    return groups;
}

function renderGroups(groups: Array<{ names: string[]; type: string }>): string {
    return groups.map(g => `(${g.names.join(" ")} : ${g.type})`).join("");
}

function nextEquationRun(elements: LayerElement[]): number {
    for (let i = 0; i < elements.length; i++) {
        if (elements[i].kind === "equation") {
            let end = i;
            while (end < elements.length && elements[end].kind === "equation") {
                end++;
            }
            return end;
        }
    }
    return -1;
}

export function renderForallChain(elements: LayerElement[], rest: string): string {
    if (elements.length === 0) {
        return rest;
    }
    const runEnd = nextEquationRun(elements);
    if (runEnd === -1) {
        return `forall ${renderGroups(binderGroups(elements))}, ${rest}`;
    }
    const prefix = elements.slice(0, runEnd);
    const remainder = elements.slice(runEnd);
    const wrappedRest = remainder.length === 0 ? rest : renderForallChain(remainder, rest);
    return `forall ${renderGroups(binderGroups(prefix))}, ltac:(subst_all_in (${wrappedRest}))`;
}

export function renderSigma(elements: LayerElement[]): string {
    if (elements.length === 0) {
        return "True";
    }
    if (elements.length === 1) {
        return elements[0].type;
    }
    const binders = elements.slice(0, -1);
    const body = elements[elements.length - 1].type;
    const runEnd = nextEquationRun(binders);
    if (runEnd === -1) {
        return `Σ ${renderGroups(binderGroups(binders))}, ${body}`;
    }
    const prefix = binders.slice(0, runEnd);
    const remainder = elements.slice(runEnd);
    const wrappedRest = renderSigma(remainder);
    return `Σ ${renderGroups(binderGroups(prefix))}, ltac:(subst_all_in (${wrappedRest}))`;
}

export interface PremiseInfo {
    premiseElements: LayerElement[];
    childElements: LayerElement[];
}

export interface RuleTypeInfo {
    paramName: string | null;
    type: string;
    model: DrawingModel;
    proofNames: ProofFieldNames;
    rootElements: LayerElement[];
    conclusionElements: LayerElement[];
    rootLayerId: string;
    conclusionLayerId: string | null;
    premiseLayers: PremiseInfo[];
}

export interface RuleTypeOptions {
    reserveParam: boolean;
    includePremises: boolean;
}

export function ruleTypeInfo(
    savedDrawing: SavedDrawing,
    sortStore: SortStore,
    registry: NameRegistry,
    options: RuleTypeOptions
): RuleTypeInfo {
    const model = buildDrawingModel(savedDrawing, registry);
    const proofNames = computeProofFieldNames(savedDrawing, sortStore, model, registry);

    const rootLayers = savedDrawing.layers.filter(l => l.parentId === null);
    if (rootLayers.length !== 1) {
        throw new Error(`Consistency Check Failed: Rule drawing '${savedDrawing.name}' must have exactly one root layer.`);
    }
    const root = rootLayers[0];
    const rootElements = buildLayerElements(savedDrawing, sortStore, model, proofNames, root.id);

    const rootChildren = savedDrawing.layers.filter(l => l.parentId === root.id);
    const conclusion = rootChildren.find(child => {
        const childrenOfChild = savedDrawing.layers.filter(l => l.parentId === child.id);
        return childrenOfChild.length === 0;
    });

    let paramName: string | null = null;
    if (options.reserveParam) {
        paramName = registry.unique(`${sanitizeIdent(savedDrawing.name || "Drawing")}_rule`);
    }

    if (!conclusion) {
        if (options.includePremises) {
            throw new Error(`Consistency Check Failed: Rule drawing '${savedDrawing.name}' has no conclusion layer.`);
        }
        return {
            paramName,
            type: renderForallChain(rootElements, "True"),
            model,
            proofNames,
            rootElements,
            conclusionElements: [],
            rootLayerId: root.id,
            conclusionLayerId: null,
            premiseLayers: []
        };
    }

    const conclusionElements = buildLayerElements(savedDrawing, sortStore, model, proofNames, conclusion.id);
    const conclusionStr = renderSigma(conclusionElements);

    let type: string;
    let premiseLayers: PremiseInfo[] = [];
    if (options.includePremises) {
        const premises = rootChildren
            .filter(child => child !== conclusion)
            .map(premise => {
                const childOfPremise = savedDrawing.layers.find(l => l.parentId === premise.id);
                if (!childOfPremise) {
                    throw new Error(`Consistency Check Failed: Premise layer '${premise.name}' in rule drawing '${savedDrawing.name}' has no child layer.`);
                }
                return {
                    premiseElements: buildLayerElements(savedDrawing, sortStore, model, proofNames, premise.id),
                    childElements: buildLayerElements(savedDrawing, sortStore, model, proofNames, childOfPremise.id)
                };
            });
        premiseLayers = premises;
        if (premises.length === 0) {
            type = renderForallChain(rootElements, conclusionStr);
        } else {
            const premiseStrs = premises.map(p => {
                const childStr = renderSigma(p.childElements);
                return `(${renderForallChain(p.premiseElements, childStr)})`;
            });
            type = renderForallChain(rootElements, `${premiseStrs.join(" -> ")} -> ${conclusionStr}`);
        }
    } else {
        type = renderForallChain(rootElements, conclusionStr);
    }

    return {
        paramName,
        type,
        model,
        proofNames,
        rootElements,
        conclusionElements,
        rootLayerId: root.id,
        conclusionLayerId: conclusion.id,
        premiseLayers
    };
}

export function newExportRegistry(sortStore: SortStore): NameRegistry {
    const registry = new NameRegistry();
    const sortDefs = sortStore.getAllSorts().filter(def => def.name !== "Equality");
    const flagPredicates = new Set<string>();
    for (const def of sortDefs) {
        for (const [flagKey, depSortName] of Object.entries(def.dependencies)) {
            if (depSortName === "flag") {
                flagPredicates.add(flagKey);
            }
        }
    }
    for (const name of flagPredicates) {
        registry.reserve(name);
    }
    for (const def of sortDefs) {
        registry.reserve(def.name);
    }
    registry.reserve("Equality");
    return registry;
}

export function exportDrawingsToRocq(savedDrawings: SavedDrawing[], sortStore: SortStore): string {
    if (savedDrawings.length === 0) {
        throw new Error("Consistency Check Failed: No drawings selected for export.");
    }

    const lines: string[] = [];
    lines.push("Require Import Ltac2.Ltac2.");
    lines.push("");
    lines.push(SIGMA_DEFINITION);
    lines.push("");
    lines.push(SIGMA_NOTATION);
    lines.push("");
    lines.push(TUPLE_NOTATION);
    lines.push("");
    lines.push(SUBST_ALL_TACTIC);
    lines.push("");
    lines.push(SUBST_ALL_LTAC2);
    lines.push("");
    lines.push(SUBST_ALL_IN_TACTIC);
    lines.push("");
    lines.push(DESTRUCT_SIGMA_TACTIC);
    lines.push("");
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
        lines.push(`Parameter ${def.name} : ${sortHeaderType(sortStore, def)}.`);
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
            lines.push(`Parameter ${flagName} : ${flagHeaderType(sortStore, host.name)}.`);
        }
    }

    const rules = savedDrawings.filter(drawing => drawing.isRule);
    if (rules.length > 0) {
        lines.push("");
    }
    for (const drawing of rules) {
        const registry = newExportRegistry(sortStore);
        const info = ruleTypeInfo(drawing, sortStore, registry, { reserveParam: true, includePremises: true });
        if (!info.paramName) {
            throw new Error(`Consistency Check Failed: Rule drawing '${drawing.name}' has no rule parameter.`);
        }
        lines.push(`Parameter ${info.paramName} : ${info.type}.`);
    }

    return lines.join("\n") + "\n";
}

export interface DrawingExportNames {
    moduleName: string;
    ruleParam: string | null;
    recordNames: Map<string, string>;
    fieldNames: Map<string, string>;
    flagFieldNames: Map<string, string>;
    equalityFieldNames: Map<string, string>;
    model: DrawingModel;
}

export function drawingExportNames(savedDrawing: SavedDrawing, sortStore: SortStore): DrawingExportNames {
    const registry = new NameRegistry();
    const sortDefs = sortStore.getAllSorts().filter(def => def.name !== "Equality");

    const flagPredicates = new Set<string>();
    for (const def of sortDefs) {
        for (const [flagKey, depSortName] of Object.entries(def.dependencies)) {
            if (depSortName === "flag") {
                flagPredicates.add(flagKey);
            }
        }
    }
    for (const name of flagPredicates) {
        registry.reserve(name);
    }
    for (const def of sortDefs) {
        registry.reserve(def.name);
    }
    registry.reserve("Equality");
    if (savedDrawing.isRule) {
        registry.reserve("rule");
    }

    const moduleName = registry.unique(sanitizeIdent(savedDrawing.name || "Drawing"));
    const model = buildDrawingModel(savedDrawing, registry);
    const proofNames = computeProofFieldNames(savedDrawing, sortStore, model, registry);
    let ruleParam: string | null = null;
    if (savedDrawing.isRule) {
        ruleParam = registry.unique(`${moduleName}_rule`);
    }

    return {
        moduleName,
        ruleParam,
        recordNames: model.recordNames,
        fieldNames: model.fieldNames,
        flagFieldNames: proofNames.flagFieldNames,
        equalityFieldNames: proofNames.equalityFieldNames,
        model
    };
}
