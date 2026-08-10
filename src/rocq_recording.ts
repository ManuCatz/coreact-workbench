import { Artefact, Drawing, DrawingStore, SortStore } from "./index";
import { drawingExportNames, ruleTypeInfo, newExportRegistry, renderForallChain, renderSigma } from "./rocq_export";
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

function renderPremiseType(
    premiseElements: LayerElement[],
    childElements: LayerElement[],
    rootNameToHost: Map<string, string>
): string {
    // Substitute rule root names for their matched host names in two passes so
    // a host name can never be re-matched by another substitution.
    const substitutions = [...rootNameToHost.entries()].sort(([a], [b]) => b.length - a.length);
    const substitute = (s: string): string => {
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
    };
    const mapElements = (elements: LayerElement[]): LayerElement[] =>
        elements.map(el => ({ ...el, type: substitute(el.type) }));
    return renderForallChain(mapElements(premiseElements), renderSigma(mapElements(childElements)));
}

export class RocqRecorder {
    private active: boolean = false;
    private drawingName: string | null = null;
    private lines: string[] = [];
    private usedAdmit: boolean = false;

    public isActive(): boolean {
        return this.active;
    }

    public getRecordedDrawingName(): string | null {
        return this.drawingName;
    }

    public start(drawing: Drawing, activeDrawingName: string, sortStore: SortStore): void {
        this.drawingName = activeDrawingName;
        this.lines = [];
        this.usedAdmit = false;

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
        this.lines.push("intros.");
        this.lines.push("subst_all.");

        this.active = true;
    }

    public recordRuleApply(
        ruleDrawing: Drawing,
        savedRuleName: string,
        application: { matchedArtefacts: Map<Artefact, Artefact> },
        hostDrawing: Drawing,
        createdArtefacts: Artefact[],
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
                // After the header's `subst_all.` the matched host arguments are
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

        const newNames = createdArtefacts.map(art => {
            const newId = artefactToDataId(hostDrawing, art);
            const newName = art.sortName === "Equality"
                ? hostNames.equalityFieldNames.get(newId) ?? hostNames.fieldNames.get(newId)
                : hostNames.fieldNames.get(newId);
            if (!newName) {
                throw new Error(`Consistency Check Failed: No field name assigned for new host artefact '${newId}'.`);
            }
            return newName;
        });

        // Second-order rules: assert each premise as an admitted hypothesis whose
        // type is the rule's premise type re-rendered with the host's names.
        const rootNameToHost = new Map<string, string>();
        ruleInfo.rootElements.forEach((el, i) => rootNameToHost.set(el.name, tupleValues[i]));

        const premiseProofNames: string[] = [];
        for (let k = 0; k < ruleInfo.premiseLayers.length; k++) {
            const premise = ruleInfo.premiseLayers[k];
            const premiseType = renderPremiseType(premise.premiseElements, premise.childElements, rootNameToHost);
            const proofName = `Hpremise${k + 1}`;
            this.lines.push(`assert (${proofName} : ${premiseType}) by admit.`);
            premiseProofNames.push(proofName);
            this.usedAdmit = true;
        }

        const conclusionHasEquality = ruleInfo.conclusionElements.some(el => el.kind === "equation");

        if (premiseProofNames.length > 0) {
            const fullArgsStr = [...tupleValues, ...premiseProofNames].join(" ");
            const assertBase = `assert (${newNames[0]} := @${ruleParam} ${fullArgsStr})`;
            if (createdArtefacts.length === 1) {
                this.lines.push(conclusionHasEquality ? `${assertBase}; subst_all.` : `${assertBase}.`);
            } else {
                const destruct = `${assertBase}; destruct ${newNames[0]} as (${newNames.join(" & ")})`;
                this.lines.push(conclusionHasEquality ? `${destruct}; subst_all.` : `${destruct}.`);
            }
            return;
        }

        const destructBase = `destruct (@${ruleParam} ${argsStr}) as (${newNames.join(" & ")})`;
        const assertBase = `assert (${newNames[0]} := @${ruleParam} ${argsStr})`;
        if (createdArtefacts.length === 1) {
            this.lines.push(conclusionHasEquality ? `${assertBase}; subst_all.` : `${assertBase}.`);
        } else {
            this.lines.push(conclusionHasEquality ? `${destructBase}; subst_all.` : `${destructBase}.`);
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
        const finalLine = this.usedAdmit ? "Admitted." : "Qed.";
        const script = [...this.lines, finalLine].join("\n") + "\n";
        this.lines = [];
        this.drawingName = null;
        return script;
    }
}
