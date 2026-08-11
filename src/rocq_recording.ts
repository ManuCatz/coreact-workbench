import { Artefact, Drawing, DrawingStore, SortStore } from "./index";
import { drawingExportNames, ruleTypeInfo, newExportRegistry, renderForallChain, renderSigma, sanitizeIdent } from "./rocq_export";
import type { LayerElement } from "./rocq_export";

function artefactToDataId(drawing: Drawing, art: Artefact): string {
    const idx = drawing.getArtefacts().indexOf(art);
    if (idx === -1) {
        throw new Error("Consistency Check Failed: Artefact does not belong to drawing.");
    }
    return `art_${idx}`;
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

        this.lines.push(`Lemma ${lemmaName} : ${info.type}.`);
        if (info.rootElements.some(el => el.kind === "equation")) {
            this.lines.push("repeat (intros; subst_all ()).");
        } else {
            this.lines.push("intros.");
        }

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
                const hostFlagName = hostNames.flagFieldNames.get(`${matchedHostId}::${el.flagKey}`);
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
                let hostId = matchMap.get(el.artefactId ?? "");
                if (!hostId && ruleArt) {
                    const hostCopy = applicationResult.created.get(ruleArt);
                    if (hostCopy) {
                        hostId = artefactToDataId(hostDrawing, hostCopy);
                    }
                }
                const hostFlagName = hostId ? hostNames.flagFieldNames.get(`${hostId}::${el.flagKey}`) : undefined;
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

        const conclusionHasEquality = ruleInfo.conclusionElements.some(el => el.kind === "equation");

        if (premiseProofNames.length > 0) {
            const fullArgsStr = [...tupleValues, ...premiseProofNames].join(" ");
            const assertBase = `assert (${assertName} := @${ruleParam} ${fullArgsStr})`;
            if (conclusionArity <= 1) {
                this.lines.push(conclusionHasEquality ? `${assertBase}; subst_all ().` : `${assertBase}.`);
            } else {
                const destruct = `${assertBase}; destruct_sigma ${assertName} as ${conclusionHostNames.join(" ")}`;
                this.lines.push(conclusionHasEquality ? `${destruct}; subst_all ().` : `${destruct}.`);
            }
            return;
        }

        const destructBase = `destruct_sigma (@${ruleParam} ${argsStr}) as ${conclusionHostNames.join(" ")}`;
        const assertBase = `assert (${assertName} := @${ruleParam} ${argsStr})`;
        if (conclusionArity <= 1) {
            this.lines.push(conclusionHasEquality ? `${assertBase}; subst_all ().` : `${assertBase}.`);
        } else {
            this.lines.push(conclusionHasEquality ? `${destructBase}; subst_all ().` : `${destructBase}.`);
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

    public recordProveSuccess(hostActiveName: string): void {
        if (!this.active || hostActiveName !== this.drawingName) {
            return;
        }
        this.lines.push("repeat constructor; eassumption.");
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
        return script;
    }
}
