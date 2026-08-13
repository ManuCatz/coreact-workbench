import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { get } from 'svelte/store';
import { drawing, drawingStore, exportSelection, getSelectedDrawingNames, deleteSelectedDrawings, renameDrawingName, toasts, pushToast, dismissToast } from './store';

describe('export selection bookkeeping', () => {
    beforeEach(() => {
        drawing.clear(false);
        drawingStore.clear();
        drawingStore.saveDrawing('Initial Drawing', drawing);
        drawingStore.saveDrawing('Rule Drawing Demo', drawing);
        exportSelection.set(new Set(['Initial Drawing', 'Rule Drawing Demo']));
        vi.stubGlobal('confirm', () => true);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        exportSelection.set(new Set());
    });

    it('removes deleted drawing names from the export selection', () => {
        deleteSelectedDrawings(['Initial Drawing']);
        expect(get(exportSelection)).toEqual(new Set(['Rule Drawing Demo']));
        const names = getSelectedDrawingNames();
        expect(names).toEqual(['Rule Drawing Demo']);
        expect(() => drawingStore.exportDrawingsJSON(names)).not.toThrow();
    });

    it('migrates the export selection across a rename', () => {
        renameDrawingName('Initial Drawing', 'Renamed Drawing');
        expect(get(exportSelection)).toEqual(new Set(['Renamed Drawing', 'Rule Drawing Demo']));
        expect(getSelectedDrawingNames()).toEqual(expect.arrayContaining(['Renamed Drawing', 'Rule Drawing Demo']));
    });

    it('filters stale names out of the export selection', () => {
        exportSelection.set(new Set(['Initial Drawing', 'Ghost Drawing']));
        expect(getSelectedDrawingNames()).toEqual(['Initial Drawing']);
    });
});

describe('toasts', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
        toasts.set([]);
    });

    it('pushes a toast with unique ids', () => {
        pushToast('error', 'boom');
        expect(get(toasts)).toHaveLength(1);
        expect(get(toasts)[0].kind).toBe('error');
        expect(get(toasts)[0].message).toBe('boom');
        pushToast('error', 'again');
        expect(get(toasts)).toHaveLength(2);
        expect(get(toasts)[0].id).not.toBe(get(toasts)[1].id);
    });

    it('dismisses a toast by id', () => {
        pushToast('info', 'hi');
        const id = get(toasts)[0].id;
        dismissToast(id);
        expect(get(toasts)).toEqual([]);
    });

    it('auto-dismisses after the kind-specific delay', () => {
        pushToast('info', 'hi');
        vi.advanceTimersByTime(3999);
        expect(get(toasts)).toHaveLength(1);
        vi.advanceTimersByTime(1);
        expect(get(toasts)).toEqual([]);
    });
});
