import { describe, it, expect } from 'vitest';
import type { Artefact, Drawing } from '../index';
import { makeDrawing, makeVertex, makeEdge } from './helpers';

function resolvedWithReverseInfo(drawing: Drawing, artefact: Artefact): Record<string, any> {
    return artefact.getResolvedData(undefined, drawing.buildReverseDependencyInfo());
}

describe('reverse dependency fields', () => {
    it('injects isMono = true on an edge with a visible isMono artefact', () => {
        const drawing = makeDrawing();
        const v0 = makeVertex(drawing, 'v0');
        const v1 = makeVertex(drawing, 'v1');
        const e = makeEdge(drawing, 'e', v0, v1);
        drawing.newArtefact('isMono', { arrow: e }, {}, 'root');

        expect(resolvedWithReverseInfo(drawing, e).isMono).toBe(true);
    });

    it('injects isMono = false on an edge without isMono', () => {
        const drawing = makeDrawing();
        const v0 = makeVertex(drawing, 'v0');
        const v1 = makeVertex(drawing, 'v1');
        const e = makeEdge(drawing, 'e', v0, v1);

        expect(resolvedWithReverseInfo(drawing, e).isMono).toBe(false);
    });

    it('two isMono artefacts still yield true', () => {
        const drawing = makeDrawing();
        const v0 = makeVertex(drawing, 'v0');
        const v1 = makeVertex(drawing, 'v1');
        const e = makeEdge(drawing, 'e', v0, v1);
        drawing.newArtefact('isMono', { arrow: e }, {}, 'root');
        drawing.newArtefact('isMono', { arrow: e }, {}, 'root');

        expect(resolvedWithReverseInfo(drawing, e).isMono).toBe(true);
    });

    it('an isMono in a hidden layer does not count', () => {
        const drawing = makeDrawing();
        drawing.addLayer('hidden', 'Hidden', 'root');
        drawing.getLayer('hidden')!.visible = false;
        const v0 = makeVertex(drawing, 'v0');
        const v1 = makeVertex(drawing, 'v1');
        const e = makeEdge(drawing, 'e', v0, v1);
        drawing.newArtefact('isMono', { arrow: e }, {}, 'hidden');

        expect(resolvedWithReverseInfo(drawing, e).isMono).toBe(false);
    });

    it('an isMono under a hidden ancestor layer does not count', () => {
        const drawing = makeDrawing();
        drawing.addLayer('parent', 'Parent', 'root');
        drawing.addLayer('child', 'Child', 'parent');
        drawing.getLayer('parent')!.visible = false;
        const v0 = makeVertex(drawing, 'v0');
        const v1 = makeVertex(drawing, 'v1');
        const e = makeEdge(drawing, 'e', v0, v1);
        drawing.newArtefact('isMono', { arrow: e }, {}, 'child');

        expect(resolvedWithReverseInfo(drawing, e).isMono).toBe(false);
    });

    it('only an isMono on the same edge counts, not one on another edge', () => {
        const drawing = makeDrawing();
        const v0 = makeVertex(drawing, 'v0');
        const v1 = makeVertex(drawing, 'v1');
        const v2 = makeVertex(drawing, 'v2');
        const e0 = makeEdge(drawing, 'e0', v0, v1);
        const e1 = makeEdge(drawing, 'e1', v1, v2);
        drawing.newArtefact('isMono', { arrow: e1 }, {}, 'root');

        expect(resolvedWithReverseInfo(drawing, e0).isMono).toBe(false);
        expect(resolvedWithReverseInfo(drawing, e1).isMono).toBe(true);
    });

    it('does not overwrite existing data or dependency keys', () => {
        const drawing = makeDrawing();
        const v0 = makeVertex(drawing, 'v0');
        const v1 = makeVertex(drawing, 'v1');
        const e = drawing.newArtefact('Edge', { source: v0, target: v1, mono: true }, { width: 4, bend: 3, label: 'e' }, 'root');
        drawing.newArtefact('isMono', { arrow: e }, {}, 'root');

        const resolved = resolvedWithReverseInfo(drawing, e);
        expect(resolved.width).toBe(4);
        expect(resolved.bend).toBe(3);
        expect(resolved.source).toBeDefined();
        expect(resolved.target).toBeDefined();
        expect(resolved.mono).toBe(true);
        expect(resolved.isMono).toBe(true);
    });
});
