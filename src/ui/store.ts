import { writable, derived, get } from 'svelte/store';
import * as d3 from 'd3';
import {
    SortStore,
    Drawing,
    DrawingStore,
    Artefact,
    findFirstOrderRuleApplications,
    findSecondOrderRuleApplications,
    applyFirstOrderRule,
    applySecondOrderRule,
    filterRedundantRuleApplications,
    type SortDefinition,
    type SavedDrawing,
    type RuleApplication,
    type DataAttributeValue
} from '../index';
import { RocqRecorder } from '../rocq_recording';
import { exportDrawingsToRocq, drawingExportNames } from '../rocq_export';

// ---------------------------------------------------------------------------
// Core singletons (non-reactive class instances; mutations are signalled via
// the `version` store + `refresh()` below).
// ---------------------------------------------------------------------------

export const sortStore = new SortStore();
export const drawing = new Drawing(sortStore);
export const drawingStore = new DrawingStore();
export const rocqRecorder = new RocqRecorder();

// ---------------------------------------------------------------------------
// Versioning
//
// The core `Drawing`/`DrawingStore` classes are plain mutable objects with no
// reactivity. After any mutation of their state, call `refresh()` so that all
// derived stores recompute and every subscribed component re-renders.
// ---------------------------------------------------------------------------

export const version = writable(0);

export function refresh(): void {
    version.update(v => v + 1);
}

// ---------------------------------------------------------------------------
// Interaction state
// ---------------------------------------------------------------------------

export const activeDrawingName = writable<string | null>(null);
export const inspectedArtefact = writable<Artefact | null>(null);

export interface DraftArtefact {
    sortName: string;
    dependencies: Record<string, Artefact>;
    data: Record<string, DataAttributeValue>;
    layerId: string;
}

export const draftArtefact = writable<DraftArtefact | null>(null);
export const dependencyPickingFor = writable<string | null>(null);

export interface PositionPicker {
    artefact: Artefact;
    attrName: string;
}

export const positionPicker = writable<PositionPicker | null>(null);

export const mergeMode = writable(false);
export const mergeFirstArtefact = writable<Artefact | null>(null);
export const mergeSecondArtefact = writable<Artefact | null>(null);
export const mergePickingFor = writable<'first' | 'second' | null>(null);
export const mergeHoverArtefact = writable<Artefact | null>(null);

export const menuHoverArtefact = writable<Artefact | null>(null);
export const ruleHoverArtefacts = writable<Set<Artefact> | null>(null);

export const layerProvability = writable<Map<string, { provable: boolean; reason: string }>>(new Map());
export const exportSelection = writable<Set<string>>(new Set());

// ---------------------------------------------------------------------------
// Toasts (non-blocking replacement for alert()/window.alert)
// ---------------------------------------------------------------------------

export type ToastKind = 'info' | 'error';

export interface Toast {
    id: number;
    kind: ToastKind;
    message: string;
}

export const toasts = writable<Toast[]>([]);

let nextToastId = 1;

export function dismissToast(id: number): void {
    toasts.update(list => list.filter(t => t.id !== id));
}

export function pushToast(kind: ToastKind, message: string): void {
    const id = nextToastId++;
    toasts.update(list => [...list, { id, kind, message }]);
    setTimeout(() => dismissToast(id), kind === 'error' ? 8000 : 4000);
}

// ---------------------------------------------------------------------------
// Derived collections (recomputed whenever `version` bumps)
// ---------------------------------------------------------------------------

export const allArtefacts = derived(version, () => drawing.getArtefacts());
export const allLayers = derived(version, () => drawing.getAllLayers());
export const allDrawings = derived(version, () => drawingStore.getAllDrawings());

export type RuleTag = { kind: 'invalid'; reason: string } | { kind: 'first' } | { kind: 'second' };

export const ruleTag = derived([version, activeDrawingName], () => {
    if (!drawing.isRule) return null;
    const check = drawing.checkRuleConditions();
    if (!check.isRule) {
        return { kind: 'invalid', reason: check.reason ?? 'Unknown reason' } satisfies RuleTag;
    }
    return drawingStore.checkIsFirstOrder(drawing)
        ? ({ kind: 'first' } satisfies RuleTag)
        : ({ kind: 'second' } satisfies RuleTag);
});

// ---------------------------------------------------------------------------
// Position picker helpers
// ---------------------------------------------------------------------------

export function stopPositionPicker(): void {
    positionPicker.set(null);
    d3.select('body').style('cursor', 'default');
}

export function startPositionPicker(target: PositionPicker): void {
    positionPicker.set(target);
    d3.select('body').style('cursor', 'crosshair');
}

export function applyPickedPosition(x: number, y: number): void {
    const picker = get(positionPicker);
    if (!picker) return;
    picker.artefact.data[picker.attrName] = [x, y];
    stopPositionPicker();
    refresh();
}

export function getSinglePositionAttr(sortDef: SortDefinition): string | null {
    const positionAttrs = Object.entries(sortDef.attributes)
        .filter(([_, type]) => type === 'position')
        .map(([name]) => name);
    return positionAttrs.length === 1 ? positionAttrs[0] : null;
}

export function isPositionPickerActive(artefact: Artefact, attrName: string): boolean {
    const picker = get(positionPicker);
    if (!picker) return false;
    if (picker.attrName !== attrName) return false;
    return picker.artefact === artefact || picker.artefact.data === artefact.data;
}

export function togglePositionPicker(artefact: Artefact, attrName: string): void {
    if (isPositionPickerActive(artefact, attrName)) {
        stopPositionPicker();
    } else {
        startPositionPicker({ artefact, attrName });
    }
}

// ---------------------------------------------------------------------------
// Draft artefact helpers (mutations go through `update` so subscribers fire)
// ---------------------------------------------------------------------------

export function findNextUnfilledDependency(draft: DraftArtefact): string | null {
    const sortDef = sortStore.getSort(draft.sortName);
    if (!sortDef) return null;
    for (const [depKey] of Object.entries(sortDef.dependencies)) {
        if (!draft.dependencies[depKey]) {
            return depKey;
        }
    }
    return null;
}

export function setDraftDataField(name: string, value: DataAttributeValue): void {
    draftArtefact.update(d => {
        if (!d) return d;
        if (name === 'label' && value === '') {
            delete d.data[name];
        } else {
            d.data[name] = value;
        }
        return d;
    });
    refresh();
}

export function setDraftLayer(layerId: string): void {
    draftArtefact.update(d => {
        if (!d) return d;
        d.layerId = layerId;
        return d;
    });
    refresh();
}

export function startDraftForSort(sortDef: SortDefinition): void {
    inspectedArtefact.set(null);
    cancelMergeMode();

    const initialData: Record<string, DataAttributeValue> = {};
    for (const [attrName, expectedType] of Object.entries(sortDef.attributes)) {
        if (expectedType === 'position') {
            initialData[attrName] = [300, 300];
        } else if (expectedType === 'number') {
            initialData[attrName] = attrName === 'bend' ? 0 : 2;
        } else if (expectedType === 'boolean') {
            initialData[attrName] = false;
        } else if (expectedType === 'string') {
            initialData[attrName] = '';
        }
    }

    const focusedId = drawing.getFocusedLayerId();
    const allLayersList = drawing.getAllLayers();
    const defaultLayerId = focusedId || (allLayersList.length > 0 ? allLayersList[0].id : 'root');

    draftArtefact.set({
        sortName: sortDef.name,
        dependencies: {},
        data: initialData,
        layerId: defaultLayerId
    });
    dependencyPickingFor.set(null);
    stopPositionPicker();

    const singlePositionAttr = getSinglePositionAttr(sortDef);
    if (singlePositionAttr) {
        startPositionPicker({ artefact: { data: initialData } as Artefact, attrName: singlePositionAttr });
    }

    refresh();
}

export function cancelDraft(): void {
    draftArtefact.set(null);
    dependencyPickingFor.set(null);
    stopPositionPicker();
    refresh();
}

export function createDraftArtefact(): boolean {
    const draft = get(draftArtefact);
    if (!draft) return false;
    try {
        const finalDeps: Record<string, Artefact> = { ...draft.dependencies };
        drawing.newArtefact(draft.sortName, finalDeps, draft.data, draft.layerId);
        draftArtefact.set(null);
        dependencyPickingFor.set(null);
        stopPositionPicker();
        refresh();
        return true;
    } catch (err) {
        pushToast('error', (err as Error).message);
        return false;
    }
}

export function isDraftComplete(draft: DraftArtefact): boolean {
    const sortDef = sortStore.getSort(draft.sortName);
    if (!sortDef) return false;
    if (draft.sortName === 'Equality') {
        return equalityChildren(draft).length >= 2;
    }
    for (const [depKey] of Object.entries(sortDef.dependencies)) {
        if (!draft.dependencies[depKey]) {
            return false;
        }
    }
    for (const [attrName, _] of Object.entries(sortDef.attributes)) {
        if (draft.data[attrName] === undefined) {
            return false;
        }
    }
    return true;
}

// ---------------------------------------------------------------------------
// Merge helpers
// ---------------------------------------------------------------------------

export function startMergeMode(preselectFirst: Artefact | null = null): void {
    draftArtefact.set(null);
    dependencyPickingFor.set(null);
    mergeHoverArtefact.set(null);
    stopPositionPicker();

    mergeMode.set(true);
    if (preselectFirst && drawing.getArtefacts().includes(preselectFirst)) {
        mergeFirstArtefact.set(preselectFirst);
        mergeSecondArtefact.set(null);
        mergePickingFor.set('second');
    } else {
        mergeFirstArtefact.set(null);
        mergeSecondArtefact.set(null);
        mergePickingFor.set('first');
    }
    refresh();
}

export function cancelMergeMode(): void {
    mergeMode.set(false);
    mergeFirstArtefact.set(null);
    mergeSecondArtefact.set(null);
    mergePickingFor.set(null);
    mergeHoverArtefact.set(null);
    refresh();
}

export function selectMergeArtefact(artefact: Artefact): void {
    mergeHoverArtefact.set(null);
    const first = get(mergeFirstArtefact);
    const pickingFor = get(mergePickingFor);
    if (pickingFor === 'first' || !first) {
        mergeFirstArtefact.set(artefact);
        if (get(mergeSecondArtefact) === artefact) {
            mergeSecondArtefact.set(null);
        }
        mergePickingFor.set('second');
    } else if (pickingFor === 'second' || first) {
        if (artefact === first) {
            pushToast('error', 'Cannot merge an artefact with itself.');
        } else if (!drawing.areDependenciesEqual(first, artefact)) {
            pushToast('error', `Cannot merge: Artefact '${artefact.data.label || artefact.sortName}' does not have matching dependencies.`);
        } else {
            mergeSecondArtefact.set(artefact);
            mergePickingFor.set(null);
        }
    }
    refresh();
}

export function performMerge(): void {
    const first = get(mergeFirstArtefact);
    const second = get(mergeSecondArtefact);
    if (!first || !second || first === second || !drawing.areDependenciesEqual(first, second)) return;
    try {
        const mergedResult = drawing.mergeArtefacts(first, second);
        mergeMode.set(false);
        mergeFirstArtefact.set(null);
        mergeSecondArtefact.set(null);
        mergePickingFor.set(null);
        mergeHoverArtefact.set(null);
        inspectedArtefact.set(mergedResult);
        refresh();
    } catch (err) {
        pushToast('error', (err as Error).message);
    }
}

export function mergeBaseOpacityFor(art: Artefact): number {
    const first = get(mergeFirstArtefact);
    if (art === first || art === get(mergeSecondArtefact)) {
        return 1.0;
    }
    if (first && drawing.areDependenciesEqual(first, art)) {
        return drawing.areProvablyEqual(first, art) ? 1.0 : 0.85;
    }
    if (!first) {
        return 0.85;
    }
    return 0.35;
}

export function isProvablyEqualCandidate(art: Artefact): boolean {
    const first = get(mergeFirstArtefact);
    return get(mergeMode) && !!first && art !== first
        && drawing.areDependenciesEqual(first, art)
        && drawing.areProvablyEqual(first, art);
}

// ---------------------------------------------------------------------------
// Misc helpers
// ---------------------------------------------------------------------------

export function getArtefactLabel(art: Artefact): string {
    if (art.data.label) return art.data.label;
    if (art.sortName === 'Equality') {
        return equalityChildren(art).map(c => c.data.label || c.sortName).join(' = ');
    }
    return '(unnamed)';
}

export function equalityChildren(art: { dependencies: Record<string, Artefact> }): Artefact[] {
    return Object.values(art.dependencies);
}

// ---------------------------------------------------------------------------
// Drawing / rule helpers used by the UI
// ---------------------------------------------------------------------------

export function resetInteractionState(): void {
    inspectedArtefact.set(null);
    draftArtefact.set(null);
    dependencyPickingFor.set(null);
    layerProvability.set(new Map());
    mergeMode.set(false);
    mergeFirstArtefact.set(null);
    mergeSecondArtefact.set(null);
    mergePickingFor.set(null);
    mergeHoverArtefact.set(null);
    stopPositionPicker();
}

export function loadDrawingByName(name: string): boolean {
    try {
        drawingStore.loadDrawing(name, drawing);
        activeDrawingName.set(name);
        resetInteractionState();
        refresh();
        return true;
    } catch (err) {
        pushToast('error', `Error loading drawing:\n${(err as Error).message}`);
        return false;
    }
}

export function getSelectedDrawingNames(): string[] {
    const existing = new Set(drawingStore.getAllDrawings().map(d => d.name));
    return Array.from(get(exportSelection)).filter(name => existing.has(name));
}

export function downloadDrawingsJson(names: string[]): void {
    try {
        const jsonStr = drawingStore.exportDrawingsJSON(names);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'drawings.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (err) {
        pushToast('error', `Error exporting drawings:\n${(err as Error).message}`);
    }
}

export function copyRocqExport(names: string[]): void {
    try {
        const drawings: SavedDrawing[] = names
            .map(name => drawingStore.getDrawing(name))
            .filter((d): d is SavedDrawing => !!d);
        if (drawings.length === 0) {
            pushToast('error', 'Error exporting drawings:\nNo drawings found in the store.');
            return;
        }
        const code = exportDrawingsToRocq(drawings, sortStore);
        const ruleCount = drawings.filter(d => d.isRule).length;
        navigator.clipboard
            .writeText(code)
            .then(() => {
                pushToast('info', `Exported ${ruleCount} rule${ruleCount === 1 ? '' : 's'} to Rocq.`);
            })
            .catch(() => {
                pushToast('error', 'Error exporting drawings:\nClipboard access failed.');
            });
    } catch (err) {
        pushToast('error', `Error exporting drawings:\n${(err as Error).message}`);
    }
}

// ---------------------------------------------------------------------------
// Artefact inspection / data editing helpers
// ---------------------------------------------------------------------------

export function selectArtefactToInspect(art: Artefact): void {
    const nowInspected = get(inspectedArtefact) !== art;
    inspectedArtefact.set(nowInspected ? art : null);
    if (nowInspected) {
        draftArtefact.set(null);
        dependencyPickingFor.set(null);
        stopPositionPicker();
    }
    refresh();
}

export function setArtefactDataField(art: Artefact, name: string, value: DataAttributeValue): void {
    if (name === 'label' && value === '') {
        delete art.data.label;
    } else {
        art.data[name] = value;
    }
    refresh();
}

export function setInspectedLabel(art: Artefact, rawLabel: string): void {
    const target = rawLabel.trim();
    const activeName = get(activeDrawingName) ?? 'Unsaved Drawing';
    const isRootLayer = art.layerId === 'root' || drawing.getLayer(art.layerId)?.parentId === null;
    let oldFieldName: string | null = null;
    if (rocqRecorder.isActive() && isRootLayer) {
        const savedOld = DrawingStore.drawingToSavedDrawing(activeName, drawing);
        const oldExport = drawingExportNames(savedOld, sortStore);
        const artIdx = drawing.getArtefacts().indexOf(art);
        if (artIdx !== -1) {
            oldFieldName = oldExport.fieldNames.get(`art_${artIdx}`) ?? null;
        }
    }
    if (target === '') {
        delete art.data.label;
    } else {
        art.data.label = target;
    }
    if (rocqRecorder.isActive() && isRootLayer && oldFieldName) {
        const savedNew = DrawingStore.drawingToSavedDrawing(activeName, drawing);
        const newExport = drawingExportNames(savedNew, sortStore);
        const artIdx = drawing.getArtefacts().indexOf(art);
        if (artIdx !== -1) {
            const newFieldName = newExport.fieldNames.get(`art_${artIdx}`);
            if (newFieldName && newFieldName !== oldFieldName) {
                rocqRecorder.recordRename(oldFieldName, newFieldName, activeName);
            }
        }
    }
    refresh();
}

export function setArtefactLayer(art: Artefact, targetLayerId: string): void {
    drawing.setArtefactLayer(art, targetLayerId);
    refresh();
}

export function pickDraftDependency(artefact: Artefact): void {
    const draft = get(draftArtefact);
    const picking = get(dependencyPickingFor);
    if (!draft || !picking) return;

    if (draft.sortName === 'Equality') {
        draftArtefact.update(d => {
            if (!d) return d;
            const existingItems = equalityChildren(d);
            if (existingItems.length > 0 && existingItems[0].sortName !== artefact.sortName) {
                pushToast('error', `Equality artefact requires all elements to be of sort '${existingItems[0].sortName}', but selected '${artefact.sortName}'.`);
                return d;
            }
            const nextIdx = Object.keys(d.dependencies).length;
            d.dependencies[`${nextIdx}`] = artefact;
            return d;
        });
        refresh();
        return;
    }

    const sortDef = sortStore.getSort(draft.sortName);
    const expectedSort = sortDef?.dependencies[picking];
    if (expectedSort && artefact.sortName === expectedSort) {
        draftArtefact.update(d => {
            if (d) d.dependencies[picking] = artefact;
            return d;
        });
        dependencyPickingFor.set(findNextUnfilledDependency(get(draftArtefact) as DraftArtefact));
        refresh();
    } else {
        pushToast('error', `Expected sort '${expectedSort}', but selected '${artefact.sortName}'.`);
    }
}

export function removeArtefactNode(artefact: Artefact, parentArtefact: Artefact | null = null): void {
    if (parentArtefact && parentArtefact.sortName === 'Equality') {
        drawing.removeEqualityChild(parentArtefact, artefact);
    } else {
        drawing.removeArtefact(artefact);
    }
    refresh();
}

export function onArtefactNodeClick(art: Artefact): void {
    if (get(mergeMode)) {
        selectMergeArtefact(art);
        return;
    }
    if (get(dependencyPickingFor) && get(draftArtefact)) {
        pickDraftDependency(art);
        return;
    }
    selectArtefactToInspect(art);
}

// ---------------------------------------------------------------------------
// Drawing store / rule / recording app actions
// ---------------------------------------------------------------------------

export const rocqRecordingActive = writable(false);
export const isCurrentDrawingRule = derived(version, () => drawing.isRule);

export function setCurrentDrawingRule(checked: boolean): void {
    try {
        drawing.setIsRule(checked);
        refresh();
    } catch (err) {
        pushToast('error', (err as Error).message);
    }
}

export function saveActiveDrawing(): void {
    let name = get(activeDrawingName);
    if (!name) {
        const input = prompt('Enter a name for the drawing:');
        if (!input || !input.trim()) return;
        name = input.trim();
    }
    try {
        drawingStore.saveDrawing(name, drawing);
        activeDrawingName.set(name);
        refresh();
    } catch (err) {
        pushToast('error', `Error saving drawing:\n${(err as Error).message}`);
    }
}

export function newDrawing(): void {
    const hasContent = drawing.getArtefacts().length > 0 || drawing.getAllLayers().length > 1;
    if (hasContent && !confirm('Start a new drawing? Current canvas content will be discarded.')) {
        return;
    }
    const input = prompt('Enter a name for the new drawing:');
    if (!input || !input.trim()) return;
    const name = input.trim();
    if (drawingStore.getDrawing(name)) {
        pushToast('error', `A drawing named '${name}' already exists.`);
        return;
    }
    drawing.clear();
    resetInteractionState();
    try {
        drawingStore.saveDrawing(name, drawing);
        activeDrawingName.set(name);
        refresh();
    } catch (err) {
        pushToast('error', (err as Error).message);
    }
}

export async function importDrawingsFile(file: File): Promise<void> {
    const text = await file.text();
    try {
        const { drawings, renames } = drawingStore.importDrawingsJSON(text);
        let summary = `Imported ${drawings.length} drawing(s): ${drawings.map(d => `'${d.name}'`).join(', ')}.`;
        if (renames.length > 0) {
            summary += `\nRenamed on collision: ${renames.map(r => `'${r.requested}' -> '${r.actual}'`).join(', ')}.`;
        }
        pushToast('info', summary);
        refresh();
    } catch (err) {
        pushToast('error', `Error importing drawing:\n${(err as Error).message}`);
    }
}

export function deleteSelectedDrawings(names: string[]): void {
    if (names.length === 0) {
        pushToast('error', 'Select at least one drawing to delete.');
        return;
    }
    if (!confirm(`Are you sure you want to delete ${names.length} drawing(s): ${names.map(n => `'${n}'`).join(', ')}?`)) {
        return;
    }
    const deleted = new Set(names);
    for (const name of names) {
        if (name === get(activeDrawingName)) {
            activeDrawingName.set(null);
        }
        drawingStore.deleteDrawing(name);
    }
    exportSelection.update(sel => {
        const next = new Set(sel);
        for (const name of deleted) {
            next.delete(name);
        }
        return next;
    });
    refresh();
}

export function renameDrawingName(oldName: string, newName: string): void {
    try {
        drawingStore.renameDrawing(oldName, newName);
        if (oldName === get(activeDrawingName)) {
            activeDrawingName.set(newName);
        }
        exportSelection.update(sel => {
            if (!sel.has(oldName)) {
                return sel;
            }
            const next = new Set(sel);
            next.delete(oldName);
            next.add(newName);
            return next;
        });
        refresh();
    } catch (err) {
        pushToast('error', (err as Error).message);
    }
}

export function markDrawingAsRule(name: string, isRule: boolean): void {
    try {
        if (name === get(activeDrawingName)) {
            drawing.setIsRule(isRule);
        }
        drawingStore.markAsRule(name, isRule);
        refresh();
    } catch (err) {
        pushToast('error', (err as Error).message);
    }
}

export function toggleRocqRecording(): void {
    try {
        if (rocqRecorder.isActive()) {
            const script = rocqRecorder.stop();
            rocqRecordingActive.set(false);
            navigator.clipboard
                .writeText(script)
                .then(() => {
                    pushToast('info', 'Rocq recording script copied to clipboard.');
                })
                .catch(() => {
                    pushToast('error', 'Error copying recording:\nClipboard access failed.');
                });
        } else {
            const name = get(activeDrawingName) ?? 'Unsaved Drawing';
            rocqRecorder.start(drawing, name, sortStore);
            rocqRecordingActive.set(true);
        }
        refresh();
    } catch (err) {
        pushToast('error', `Rocq Recording Error:\n${(err as Error).message}`);
    }
}

export function toggleExportSelection(name: string): void {
    exportSelection.update(sel => {
        const next = new Set(sel);
        if (next.has(name)) {
            next.delete(name);
        } else {
            next.add(name);
        }
        return next;
    });
}

export function setExportSelectionAll(checked: boolean): void {
    exportSelection.set(checked ? new Set(drawingStore.getAllDrawings().map(d => d.name)) : new Set());
}

export function clearAll(): void {
    if (!confirm('Are you sure you want to clear all artefacts and layers?')) {
        return;
    }
    drawing.clear();
    activeDrawingName.set(null);
    resetInteractionState();
    refresh();
}

export async function loadSortScript(file: File): Promise<void> {
    const code = await file.text();
    try {
        sortStore.clear();
        drawing.clear();
        resetInteractionState();
        const executor = new Function('sortStore', 'd3', code);
        executor(sortStore, d3);
        refresh();
    } catch (err) {
        pushToast('error', `Error executing sort script:\n${(err as Error).message}`);
        console.error('Script Execution Error:', err);
    }
}

// ---------------------------------------------------------------------------
// Layer helpers
// ---------------------------------------------------------------------------

export function addRootLayer(): void {
    const name = prompt('Enter name for new root layer:', 'New Root Layer');
    if (name && name.trim()) {
        const id = `layer-${Date.now().toString(36)}`;
        drawing.addLayer(id, name.trim(), null, '#9b59b6', true);
        refresh();
    }
}

export function addChildLayer(layer: { id: string; name: string }): void {
    const childName = prompt(`Enter name for child layer above '${layer.name}':`, `Child of ${layer.name}`);
    if (childName && childName.trim()) {
        const childId = `layer-${Date.now().toString(36)}`;
        const randomColor = `#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0')}`;
        drawing.addLayer(childId, childName.trim(), layer.id, randomColor, true);
        refresh();
    }
}

export function renameLayer(layer: { id: string; name: string }): void {
    const newName = prompt(`Enter new name for layer '${layer.name}':`, layer.name);
    if (newName && newName.trim() && newName.trim() !== layer.name) {
        layer.name = newName.trim();
        refresh();
    }
}

export function deleteLayer(layer: { id: string; name: string }): void {
    const descendants = drawing.getDescendants(layer.id);
    const msg = descendants.size > 1
        ? `Delete '${layer.name}' and its ${descendants.size - 1} child layer(s)? All associated artefacts will be removed!`
        : `Delete layer '${layer.name}'?`;
    if (confirm(msg)) {
        drawing.removeLayer(layer.id);
        refresh();
    }
}

export function toggleLayerVisibility(layer: { id: string; visible: boolean }): void {
    layer.visible = !layer.visible;
    refresh();
}

export function toggleLayerFocus(layerId: string): void {
    if (drawing.getFocusedLayerId() === layerId) {
        drawing.setFocusedLayer(null);
    } else {
        drawing.setFocusedLayer(layerId);
    }
    refresh();
}

export function setLayerColor(layer: { id: string; color: string; colorEnabled: boolean }, color: string): void {
    layer.color = color;
    layer.colorEnabled = true;
    refresh();
}

export function toggleLayerColorEnabled(layer: { id: string; colorEnabled: boolean }, checked: boolean): void {
    layer.colorEnabled = checked;
    refresh();
}

export function checkLayerProvable(layerId: string): void {
    try {
        const result = drawing.checkLayerProvable(layerId);
        layerProvability.update(m => {
            const next = new Map(m);
            next.set(layerId, { provable: result.provable, reason: result.reason ?? '' });
            return next;
        });
        if (result.provable) {
            rocqRecorder.recordProveSuccess(drawing, layerId, result.match ?? null, get(activeDrawingName) ?? 'Unsaved Drawing');
        }
        refresh();
    } catch (err) {
        pushToast('error', (err as Error).message);
    }
}

export const filterRedundantMatches = writable(false);

export function toggleFilterRedundantMatches(): void {
    filterRedundantMatches.update(v => !v);
}

// ---------------------------------------------------------------------------
// Applyable rules (computed reactively by RuleApplications.svelte)
// ---------------------------------------------------------------------------

export interface RuleAppEntry {
    savedRule: SavedDrawing;
    ruleDrawing: Drawing;
    applications: RuleApplication[];
    hiddenRedundant: number;
}

export function computeRuleApplications(): RuleAppEntry[] {
    const entries: RuleAppEntry[] = [];
    for (const savedRule of drawingStore.getAllDrawings()) {
        if (!savedRule.isRule) continue;
        let ruleDrawing: Drawing;
        try {
            ruleDrawing = new Drawing(sortStore);
            drawingStore.loadDrawing(savedRule.name, ruleDrawing);
        } catch {
            continue;
        }
        let applications: RuleApplication[];
        try {
            applications = savedRule.isFirstOrder
                ? findFirstOrderRuleApplications(ruleDrawing, drawing)
                : findSecondOrderRuleApplications(ruleDrawing, drawing);
        } catch {
            continue;
        }
        
        let hiddenRedundant = 0;
        if (get(filterRedundantMatches) && applications.length > 1) {
            const total = applications.length;
            applications = filterRedundantRuleApplications(ruleDrawing, drawing, applications);
            hiddenRedundant = total - applications.length;
        }

        entries.push({ savedRule, ruleDrawing, applications, hiddenRedundant });
    }
    return entries;
}

export function applyRuleAt(savedRuleName: string, appIndex: number): void {
    const entry = computeRuleApplications().find(e => e.savedRule.name === savedRuleName);
    if (!entry || !entry.applications[appIndex]) return;
    const { savedRule, ruleDrawing, applications } = entry;
    const app = applications[appIndex];
    const activeName = get(activeDrawingName) ?? 'Unsaved Drawing';
    let applicationResult: { artefacts: Artefact[]; created: Map<Artefact, Artefact> } | null = null;
    try {
        if (savedRule.isFirstOrder) {
            const result = applyFirstOrderRule(ruleDrawing, drawing, app);
            applicationResult = result;
            console.log(`Applied '${savedRule.name}': added ${result.artefacts.length} artefact(s).`);
        } else {
            const result = applySecondOrderRule(ruleDrawing, drawing, app, { hostName: activeName, ruleName: savedRule.name });
            applicationResult = { artefacts: result.hostArtefacts, created: result.hostCreated };
            console.log(`Applied '${savedRule.name}': added ${result.hostArtefacts.length} artefact(s), derived ${result.derivedRules.length} drawing(s).`);
            const createdNames: string[] = [];
            for (const derived of result.derivedRules) {
                let name = derived.name;
                let suffix = 2;
                while (drawingStore.getDrawing(name)) {
                    name = `${derived.name} (${suffix})`;
                    suffix++;
                }
                drawingStore.saveDrawing(name, derived.drawing);
                createdNames.push(name);
                console.log(`Saved derived drawing '${name}': isRule=${derived.drawing.isRule}, artefacts=${derived.drawing.getArtefacts().length}.`);
            }
            pushToast('info', `Applied rule '${savedRule.name}': added ${result.hostArtefacts.length} artefact(s) and created ${createdNames.length} derived drawing(s):\n- ${createdNames.join('\n- ')}`);
        }
        if (applicationResult) {
            rocqRecorder.recordRuleApply(ruleDrawing, savedRule.name, app, drawing, applicationResult, activeName, sortStore);
        }
        refresh();
    } catch (err) {
        pushToast('error', `Error applying rule '${savedRule.name}':\n${(err as Error).message}`);
    }
}
