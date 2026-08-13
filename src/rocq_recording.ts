import { Artefact, Drawing, DrawingStore, SortStore } from "./index";
import { drawingExportNames, ruleTypeInfo, newExportRegistry, renderExactTerm, renderForallChain, renderSigma, sanitizeIdent } from "./rocq_export";
import type { DrawingExportNames, LayerElement, RuleTypeInfo } from "./rocq_export";

function artefactToDataId(drawing: Drawing, art: Artefact): string {
    const idx = drawing.getArtefacts().indexOf(art);
    if (idx === -1) {
        throw new Error("Consistency Check Failed: Artefact does not belong to drawing.");
    }
    return `art_${idx}`;
}

function resolveHostFlagFieldName(hostNames: DrawingExportNames, hostId: string, flagKey: string): string | undefined {
    // A rule flag element at relative depth 0 (own-layer) or a conclusion flag is
    // realised on the host artefact's own layer, so the per-layer proof field is
    // keyed by that layer id.
    const hostArtefact = hostNames.model.artefactById.get(hostId);
    if (!hostArtefact) {
        return undefined;
    }
    return hostNames.flagFieldNames.get(`${hostId}::${flagKey}::${hostArtefact.layerId}`);
}

function escapeRegExp(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function substituteRuleNames(s: string, rootNameToHost: Map<string, string>): string {
    // Substitute rule root names for their matched host names in two passes so
    // a host name can never be re-matched by another substitution.
    const substitutions = [...rootNameToHost.entries()].sort(([a], [b]) => b.length - a.length);
    let out = s;
    const tokens: string[] = [];
    substitutions.forEach(([ruleName], i) => {
        const token = `\u0001${i}\u0001`;
        tokens.push(rootNameToHost.get(ruleName)!);
        out = out.replace(new RegExp(`\\b${escapeRegExp(ruleName)}\\b`, "g"), token);
    });
    tokens.forEach((hostName, i) => {
        out = out.split(`\u0001${i}\u0001`).join(hostName);
    });
    return out;
}

function mapElements(elements: LayerElement[], rootNameToHost: Map<string, string>): LayerElement[] {
    return elements.map(el => ({ ...el, type: substituteRuleNames(el.type, rootNameToHost) }));
}

function mapElementsToHost(elements: LayerElement[], rootNameToHost: Map<string, string>): LayerElement[] {
    return elements.map(el => ({
        ...el,
        name: el.kind === "equation" ? el.name : rootNameToHost.get(el.name) ?? el.name,
        type: substituteRuleNames(el.type, rootNameToHost)
    }));
}

function renderPremiseType(
    premiseElements: LayerElement[],
    childElements: LayerElement[],
    rootNameToHost: Map<string, string>
): string {
    return renderForallChain(mapElements(premiseElements, rootNameToHost), renderSigma(mapElements(childElements, rootNameToHost)));
}

function renderPremiseLemmaType(
    rootElements: LayerElement[],
    premiseElements: LayerElement[],
    childElements: LayerElement[],
    rootNameToHost: Map<string, string>
): string {
    const premiseType = renderPremiseType(premiseElements, childElements, rootNameToHost);
    return renderForallChain(mapElementsToHost(rootElements, rootNameToHost), premiseType);
}

export class RocqRecorder {
    private active: boolean = false;
    private drawingName: string | null = null;
    private conclusionLayerId: string | null = null;
    private ruleInfo: RuleTypeInfo | null = null;
    private sortStore: SortStore | null = null;
    private lines: string[] = [];
    private prelude: string[] = [];
    private preludeLemmas: Set<string> = new Set();

    public isActive(): boolean {
        return this.active;
    }

    public getRecordedDrawingName(): string | null {
        return this.drawingName;
    }

    public start(drawing: Drawing, activeDrawingName: string, sortStore: SortStore): void {
        this.drawingName = activeDrawingName;
        this.sortStore = sortStore;
        this.lines = [];
        this.prelude = [];
        this.preludeLemmas = new Set();

        const savedDrawing = DrawingStore.drawingToSavedDrawing(activeDrawingName, drawing);
        const exportNames = drawingExportNames(savedDrawing, sortStore);
        const moduleName = exportNames.moduleName;

        const rootLayers = savedDrawing.layers.filter(l => l.parentId === null);
        if (rootLayers.length === 0) {
            throw new Error(`Consistency Check Failed: Recorded drawing '${activeDrawingName}' has no root layer.`);
        }

        const registry = newExportRegistry(sortStore);
        const info = ruleTypeInfo(savedDrawing, sortStore, registry, { reserveParam: false, includePremises: false });
        const lemmaName = `${moduleName}_rule`;
        this.conclusionLayerId = info.conclusionLayerId;
        this.ruleInfo = info;

        this.lines.push(`Lemma ${lemmaName} : ${info.type}.`);
        this.lines.push("intros_sigma ().");

        this.active = true;
    }

    public recordRuleApply(
        ruleDrawing: Drawing,
        savedRuleName: string,
        application: { matchedArtefacts: Map<Artefact, Artefact> },
        hostDrawing: Drawing,
        applicationResult: { artefacts: Artefact[]; created: Map<Artefact, Artefact> },
        hostActiveName: string,
        sortStore: SortStore
    ): void {
        if (!this.active || hostActiveName !== this.drawingName) {
            return;
        }

        const savedRule = DrawingStore.drawingToSavedDrawing(savedRuleName, ruleDrawing);
        const ruleNames = drawingExportNames(savedRule, sortStore);

        const ruleRoot = savedRule.layers.find(l => l.parentId === null);
        if (!ruleRoot) {
            throw new Error(`Consistency Check Failed: Applied rule '${savedRuleName}' has no root layer.`);
        }

        const savedHost = DrawingStore.drawingToSavedDrawing(hostActiveName, hostDrawing);
        const hostNames = drawingExportNames(savedHost, sortStore);

        // Map pattern artefact ID -> matched host artefact ID
        const matchMap = new Map<string, string>();
        for (const [pArt, hArt] of application.matchedArtefacts.entries()) {
            const pId = artefactToDataId(ruleDrawing, pArt);
            const hId = artefactToDataId(hostDrawing, hArt);
            matchMap.set(pId, hId);
        }

        // The rule's own structure: root elements give the canonical
        // (dependency-ordered) argument order of the exported rule parameter.
        const rootChildren = savedRule.layers.filter(l => l.parentId === ruleRoot.id);
        const hasConclusion = rootChildren.some(child => {
            const childrenOfChild = savedRule.layers.filter(l => l.parentId === child.id);
            return childrenOfChild.length === 0;
        });
        const ruleInfo = ruleTypeInfo(savedRule, sortStore, newExportRegistry(sortStore), {
            reserveParam: true,
            includePremises: hasConclusion
        });
        const ruleParam = ruleNames.ruleParam;
        if (!ruleParam) {
            throw new Error(`Consistency Check Failed: Rule '${savedRuleName}' has no exported rule parameter.`);
        }

        // Build the rule argument list in the exported type's binder order
        // (artefacts, flags, and equalities interleaved topologically).
        const tupleValues: string[] = [];
        for (const el of ruleInfo.rootElements) {
            if (el.kind === "equation") {
                // After the header's `subst_all ().` the matched host arguments are
                // definitionally equal, so the constraint is satisfied by `eq_refl`.
                tupleValues.push("eq_refl");
                continue;
            }
            const artefactId = el.artefactId;
            if (!artefactId) {
                throw new Error(`Consistency Check Failed: Rule element '${el.name}' in '${savedRuleName}' has no artefact id.`);
            }
            const matchedHostId = matchMap.get(artefactId);
            if (!matchedHostId) {
                throw new Error(`Consistency Check Failed: Pattern artefact '${artefactId}' was not matched in rule application.`);
            }
            if (el.kind === "flag") {
                if (!el.flagKey) {
                    throw new Error(`Consistency Check Failed: Rule element '${el.name}' in '${savedRuleName}' has no flag key.`);
                }
                const hostFlagName = resolveHostFlagFieldName(hostNames, matchedHostId, el.flagKey);
                if (!hostFlagName) {
                    throw new Error(`Consistency Check Failed: No flag field name for '${el.flagKey}' on artefact '${artefactId}' in rule '${savedRuleName}'.`);
                }
                tupleValues.push(hostFlagName);
            } else {
                const hostFieldName = hostNames.fieldNames.get(matchedHostId);
                if (!hostFieldName) {
                    throw new Error(`Consistency Check Failed: No field name assigned for matched host artefact '${matchedHostId}'.`);
                }
                tupleValues.push(hostFieldName);
            }
        }

        const argsStr = tupleValues.join(" ");

        // Names for the conclusion binders, in the exported conclusion's
        // (dependency-ordered) order, always sourced from the host layer:
        // created host copies for artefacts/equalities and host flag field
        // names for flags.
        const ruleArtById = new Map<string, Artefact>();
        for (const ruleArt of ruleDrawing.getArtefacts()) {
            ruleArtById.set(artefactToDataId(ruleDrawing, ruleArt), ruleArt);
        }

        const conclusionHostNames = ruleInfo.conclusionElements.map(el => {
            const ruleArt = el.artefactId ? ruleArtById.get(el.artefactId) : undefined;
            if (el.kind === "flag") {
                if (!el.flagKey) {
                    throw new Error(`Consistency Check Failed: Conclusion element '${el.name}' in rule '${savedRuleName}' has no flag key.`);
                }
                let hostId = matchMap.get(el.artefactId ?? "");
                if (!hostId && ruleArt) {
                    const hostCopy = applicationResult.created.get(ruleArt);
                    if (hostCopy) {
                        hostId = artefactToDataId(hostDrawing, hostCopy);
                    }
                }
                const hostFlagName = hostId ? resolveHostFlagFieldName(hostNames, hostId, el.flagKey) : undefined;
                if (!hostFlagName) {
                    throw new Error(`Consistency Check Failed: No host flag field name for '${el.flagKey}' on '${el.name}' in rule '${savedRuleName}'.`);
                }
                return hostFlagName;
            }
            if (!ruleArt) {
                throw new Error(`Consistency Check Failed: Conclusion element '${el.name}' in rule '${savedRuleName}' has no artefact id.`);
            }
            const hostCopy = applicationResult.created.get(ruleArt);
            if (!hostCopy) {
                throw new Error(`Consistency Check Failed: No created host artefact for conclusion element '${el.name}' in rule '${savedRuleName}'.`);
            }
            const hostId = artefactToDataId(hostDrawing, hostCopy);
            const hostFieldName = el.kind === "equation"
                ? hostNames.equalityFieldNames.get(hostId) ?? hostNames.fieldNames.get(hostId)
                : hostNames.fieldNames.get(hostId);
            if (!hostFieldName) {
                throw new Error(`Consistency Check Failed: No field name assigned for created host artefact '${el.name}' in rule '${savedRuleName}'.`);
            }
            return hostFieldName;
        });

        const assertName = conclusionHostNames[0] ?? "h";
        const conclusionArity = ruleInfo.conclusionElements.length;

        // Second-order rules: assert each premise via `eauto using` the derived
        // drawing's rule. That rule is emitted as a preliminary Lemma (whose proof
        // is admitted) whose type is the premise re-rendered with the host's names.
        const rootNameToHost = new Map<string, string>();
        ruleInfo.rootElements.forEach((el, i) => rootNameToHost.set(el.name, tupleValues[i]));

        // The premise layers in the same order as ruleInfo.premiseLayers: the
        // root's children that have a child layer of their own.
        const premiseLayerDefs = rootChildren.filter(child => {
            const childrenOfChild = savedRule.layers.filter(l => l.parentId === child.id);
            return childrenOfChild.length > 0;
        });
        if (premiseLayerDefs.length !== ruleInfo.premiseLayers.length) {
            throw new Error(`Consistency Check Failed: Premise layer mismatch in rule '${savedRuleName}'.`);
        }

        const premiseProofNames: string[] = [];
        for (let k = 0; k < ruleInfo.premiseLayers.length; k++) {
            const premise = ruleInfo.premiseLayers[k];
            const premiseType = renderPremiseType(premise.premiseElements, premise.childElements, rootNameToHost);
            const proofName = `Hpremise${k + 1}`;
            const derivedName = `${hostActiveName} > ${savedRuleName} > ${premiseLayerDefs[k].name}`;
            const lemmaName = `${sanitizeIdent(derivedName)}_rule`;
            if (!this.preludeLemmas.has(lemmaName)) {
                this.preludeLemmas.add(lemmaName);
                this.prelude.push(`Lemma ${lemmaName} : ${renderPremiseLemmaType(ruleInfo.rootElements, premise.premiseElements, premise.childElements, rootNameToHost)}.`);
                this.prelude.push("Admitted.");
            }
            this.lines.push(`assert (${proofName} : ${premiseType}) by eauto using ${lemmaName}.`);
            premiseProofNames.push(proofName);
        }

        if (premiseProofNames.length > 0) {
            const fullArgsStr = [...tupleValues, ...premiseProofNames].join(" ");
            if (conclusionArity === 0) {
                this.lines.push(`assert (${assertName} := @${ruleParam} ${fullArgsStr}).`);
            } else if (conclusionArity === 1) {
                this.lines.push(`destruct_sigma (@${ruleParam} ${fullArgsStr}) as ${conclusionHostNames.join(" ")}.`);
            } else {
                this.lines.push(`assert (${assertName} := @${ruleParam} ${fullArgsStr}); destruct_sigma ${assertName} as ${conclusionHostNames.join(" ")}.`);
            }
            return;
        }

        if (conclusionArity === 0) {
            this.lines.push(`assert (${assertName} := @${ruleParam} ${argsStr}).`);
        } else {
            this.lines.push(`destruct_sigma (@${ruleParam} ${argsStr}) as ${conclusionHostNames.join(" ")}.`);
        }
    }

    public recordRename(oldFieldName: string, newFieldName: string, hostActiveName: string): void {
        if (!this.active || hostActiveName !== this.drawingName) {
            return;
        }
        if (oldFieldName !== newFieldName) {
            this.lines.push(`rename ${oldFieldName} into ${newFieldName}.`);
        }
    }

    public recordProveSuccess(hostDrawing: Drawing, layerId: string | null, match: Map<Artefact, Artefact> | null, hostActiveName: string): void {
        if (!this.active || hostActiveName !== this.drawingName) {
            return;
        }

        if (this.conclusionLayerId === null) {
            this.lines.push("exact I.");
            return;
        }

        if (layerId !== this.conclusionLayerId) {
            throw new Error(`Consistency Check Failed: Recording rule for drawing '${this.drawingName}' has conclusion layer '${this.conclusionLayerId}', cannot prove layer '${layerId}'.`);
        }
        if (!match) {
            throw new Error(`Consistency Check Failed: Recording rule for drawing '${this.drawingName}' has conclusion layer '${this.conclusionLayerId}' and requires a successful match to produce an exact proof term.`);
        }

        const ruleInfo = this.ruleInfo;
        if (!ruleInfo) {
            throw new Error("Consistency Check Failed: No export info available; start a recording before proving a layer.");
        }

        const savedHost = DrawingStore.drawingToSavedDrawing(hostActiveName, hostDrawing);
        const hostNames = drawingExportNames(savedHost, this.sortStore!);

        const idToLiveArt = new Map<string, Artefact>();
        for (const art of hostDrawing.getArtefacts()) {
            idToLiveArt.set(artefactToDataId(hostDrawing, art), art);
        }

        const witnessFor = (el: LayerElement): string => {
            switch (el.kind) {
                case "artefact": {
                    const live = el.artefactId ? idToLiveArt.get(el.artefactId) : undefined;
                    const parent = live ? match.get(live) : undefined;
                    if (!parent) {
                        throw new Error(`Consistency Check Failed: No host parent matched for artefact '${el.artefactId}' in conclusion layer '${this.conclusionLayerId}'.`);
                    }
                    const parentDataId = artefactToDataId(hostDrawing, parent);
                    const hostFieldName = hostNames.fieldNames.get(parentDataId);
                    if (!hostFieldName) {
                        throw new Error(`Consistency Check Failed: Matched parent for '${el.artefactId}' has no assigned field name in '${this.drawingName}'.`);
                    }
                    return hostFieldName;
                }
                case "equation": {
                    const artData = el.artefactId ? ruleInfo.model.artefactById.get(el.artefactId) : undefined;
                    const childCount = artData ? Object.values(artData.dependencies).filter(v => typeof v === "string").length : 2;
                    const eqCount = Math.max(1, childCount - 1);
                    let w = "eq_refl";
                    for (let i = 1; i < eqCount; i++) {
                        w = `conj eq_refl (${w})`;
                    }
                    return w;
                }
                case "flag": {
                    if (!el.flagKey) {
                        throw new Error(`Consistency Check Failed: Flag element '${el.name}' has no flagKey.`);
                    }
                    const live = el.artefactId ? idToLiveArt.get(el.artefactId) : undefined;
                    const parent = live ? (live.layerId === this.conclusionLayerId ? match.get(live) : live) : undefined;
                    if (!parent) {
                        throw new Error(`Consistency Check Failed: No host parent matched for flagged artefact '${el.artefactId}' in conclusion layer '${this.conclusionLayerId}'.`);
                    }
                    const parentDataId = artefactToDataId(hostDrawing, parent);
                    const hostFlagName = resolveHostFlagFieldName(hostNames, parentDataId, el.flagKey);
                    if (!hostFlagName) {
                        throw new Error(`Consistency Check Failed: Matched parent for flagged artefact '${el.artefactId}' has no corresponding flag '${el.flagKey}' in '${this.drawingName}'.`);
                    }
                    return hostFlagName;
                }
            }
        };

        this.lines.push(`exact ${renderExactTerm(ruleInfo.conclusionElements, witnessFor)}.`);
    }

    public stop(): string {
        if (!this.active) {
            throw new Error("Consistency Check Failed: Rocq recording is not active.");
        }
        this.active = false;
        const script = [...this.prelude, ...this.lines, "Qed."].join("\n") + "\n";
        this.lines = [];
        this.prelude = [];
        this.preludeLemmas = new Set();
        this.drawingName = null;
        this.conclusionLayerId = null;
        this.ruleInfo = null;
        return script;
    }
}
