import { Artefact, Drawing, DrawingStore, SortStore } from "./index";
import { drawingExportNames } from "./rocq_export";

function artefactToDataId(drawing: Drawing, art: Artefact): string {
    const idx = drawing.getArtefacts().indexOf(art);
    if (idx === -1) {
        throw new Error("Consistency Check Failed: Artefact does not belong to drawing.");
    }
    return `art_${idx}`;
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
        const root = rootLayers[0];
        const rootRecordName = exportNames.recordNames.get(root.id);
        if (!rootRecordName) {
            throw new Error(`Consistency Check Failed: Root layer of '${activeDrawingName}' has no record name.`);
        }

        const childLayers = savedDrawing.layers.filter(l => l.parentId === root.id);
        const conclusion = childLayers.find(child => {
            const childrenOfChild = savedDrawing.layers.filter(l => l.parentId === child.id);
            return childrenOfChild.length === 0;
        });

        if (conclusion && exportNames.recordNames.has(conclusion.id)) {
            const conclusionRecordName = exportNames.recordNames.get(conclusion.id)!;
            this.lines.push(`Goal (forall p : ${moduleName}.${rootRecordName}, ${moduleName}.${conclusionRecordName} p).`);
            this.lines.push("destruct p.");
        } else {
            this.lines.push(`Goal (forall p : ${moduleName}.${rootRecordName}, True).`);
            this.lines.push("intro p.");
            this.lines.push("destruct p.");
        }

        this.active = true;
    }

    public recordRuleApply(
        ruleDrawing: Drawing,
        savedRuleName: string,
        application: { matchedArtefacts: Map<Artefact, Artefact> },
        hostDrawing: Drawing,
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

        const ruleRootArts = savedRule.artefacts.filter(a => a.layerId === ruleRoot.id);
        const patternArts = ruleRootArts.filter(a => a.sortName !== "Equality");
        const savedHost = DrawingStore.drawingToSavedDrawing(hostActiveName, hostDrawing);
        const hostNames = drawingExportNames(savedHost, sortStore);

        // Map pattern artefact ID -> matched host artefact ID
        const matchMap = new Map<string, string>();
        for (const [pArt, hArt] of application.matchedArtefacts.entries()) {
            const pId = artefactToDataId(ruleDrawing, pArt);
            const hId = artefactToDataId(hostDrawing, hArt);
            matchMap.set(pId, hId);
        }

        const assignments: string[] = [];
        for (const pArtData of patternArts) {
            const ruleFieldName = ruleNames.fieldNames.get(pArtData.id);
            if (!ruleFieldName) {
                throw new Error(`Consistency Check Failed: No field name assigned for rule pattern artefact '${pArtData.id}'.`);
            }
            const matchedHostId = matchMap.get(pArtData.id);
            if (!matchedHostId) {
                throw new Error(`Consistency Check Failed: Pattern artefact '${pArtData.id}' was not matched in rule application.`);
            }
            const hostFieldName = hostNames.fieldNames.get(matchedHostId);
            if (!hostFieldName) {
                throw new Error(`Consistency Check Failed: No field name assigned for matched host artefact '${matchedHostId}'.`);
            }
            assignments.push(`${ruleNames.moduleName}.${ruleFieldName} := ${hostFieldName}`);

            // Flag proof fields established in the rule root layer are filled from the
            // host's flag hypothesis (in scope after the header's `destruct p.`).
            const def = sortStore.getSort(pArtData.sortName);
            if (def) {
                for (const [flagKey, expected] of Object.entries(def.dependencies)) {
                    if (expected !== "flag") {
                        continue;
                    }
                    if (pArtData.dependencies[flagKey] !== true) {
                        continue;
                    }
                    const ruleFlagLayer = pArtData.flagLayers?.[flagKey] ?? pArtData.layerId;
                    if (ruleFlagLayer !== ruleRoot.id) {
                        continue;
                    }
                    const ruleFlagName = ruleNames.flagFieldNames.get(`${pArtData.id}::${flagKey}`);
                    const hostFlagName = hostNames.flagFieldNames.get(`${matchedHostId}::${flagKey}`);
                    if (!ruleFlagName || !hostFlagName) {
                        throw new Error(`Consistency Check Failed: No flag field name for '${flagKey}' on artefact '${pArtData.id}' in rule '${savedRuleName}'.`);
                    }
                    assignments.push(`${ruleNames.moduleName}.${ruleFlagName} := ${hostFlagName}`);
                }
            }
        }

        // Equality proof fields in the rule root layer are solved from the host's
        // equality hypotheses using `congruence` (valid as a term via `ltac:(...)`).
        for (const eqArt of ruleRootArts.filter(a => a.sortName === "Equality")) {
            const ruleEqName = ruleNames.equalityFieldNames.get(eqArt.id);
            if (!ruleEqName) {
                throw new Error(`Consistency Check Failed: No equality field name for equality artefact '${eqArt.id}' in rule '${savedRuleName}'.`);
            }
            assignments.push(`${ruleNames.moduleName}.${ruleEqName} := ltac:(congruence)`);
        }

        const recordStr = `{| ${assignments.join("; ")} |}`;

        if (!ruleNames.ruleParam) {
            throw new Error(`Consistency Check Failed: Rule '${savedRuleName}' has no exported rule parameter.`);
        }

        if (savedRule.isFirstOrder) {
            this.lines.push(`destruct (${ruleNames.ruleParam} ${recordStr}).`);
        } else {
            this.lines.push(`destruct (${ruleNames.ruleParam} (p := ${recordStr})).`);

            const childLayers = savedRule.layers.filter(l => l.parentId === ruleRoot.id);
            const conclusion = childLayers.find(child => {
                const childrenOfChild = savedRule.layers.filter(l => l.parentId === child.id);
                return childrenOfChild.length === 0;
            });
            const premiseLayers = childLayers.filter(child => child !== conclusion);

            for (const premise of premiseLayers) {
                const premiseRecordName = ruleNames.recordNames.get(premise.id);
                const childOfPremise = savedRule.layers.find(l => l.parentId === premise.id);
                if (!childOfPremise) {
                    throw new Error(`Consistency Check Failed: Premise layer '${premise.name}' has no child layer.`);
                }
                const childRecordName = ruleNames.recordNames.get(childOfPremise.id);
                if (!premiseRecordName || !childRecordName) {
                    throw new Error(`Consistency Check Failed: Premise layer '${premise.name}' missing record names.`);
                }
                this.lines.push("{");
                this.lines.push(`  change (forall p : ${ruleNames.moduleName}.${premiseRecordName} ${recordStr}, ${ruleNames.moduleName}.${childRecordName} p).`);
                this.lines.push("  admit.");
                this.lines.push("}");
                this.usedAdmit = true;
            }
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
        this.lines.push("constructor; easy.");
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
