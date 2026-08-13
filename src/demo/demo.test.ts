import { describe, it, expect } from 'vitest';
import { buildDemo, newDemoContext } from './buildDemo';

describe('default sort registration', () => {
    it('registers the five default sorts', () => {
        const { sortStore } = newDemoContext();
        const names = sortStore.getAllSorts().map(s => s.name);
        expect(names).toEqual(expect.arrayContaining(['Vertex', 'Edge', 'Pullback', 'Triangle', 'Equality']));
    });
});

describe('demo drawing construction', () => {
    it('builds the full demo drawing with expected layers and artefacts', () => {
        const ctx = newDemoContext();
        buildDemo(ctx);
        const { drawing } = ctx;

        const layerNames = drawing.getAllLayers().map(l => l.name);
        expect(layerNames).toContain('Root Layer');
        expect(layerNames).toContain('Child Layer 1');
        expect(layerNames).toContain('Child Layer 2');
        expect(layerNames).toContain('Leaf Layer');

        const artefacts = drawing.getArtefacts();
        const labels = artefacts.map(a => a.data.label).filter(Boolean);
        expect(labels).toContain('v0');
        expect(labels).toContain('v1');
        expect(labels).toContain('v2');
        expect(labels).toContain('e0');
        expect(labels).toContain('e1');
        expect(labels).toContain('e2');
        expect(labels).toContain('A');
        expect(labels).toContain('p1');
        expect(labels).toContain('p2');
        expect(labels).toContain('q1');
        expect(labels).toContain('q2');
        expect(labels).toContain('r1');
        expect(labels).toContain('r2');
        expect(labels).toContain('cd0');

        expect(artefacts.some(a => a.sortName === 'Pullback')).toBe(true);
        expect(artefacts.some(a => a.sortName === 'Triangle')).toBe(true);
        expect(artefacts.some(a => a.sortName === 'Equality')).toBe(true);

        expect(labels).not.toContain('tv0');
        expect(labels).not.toContain('tv1');
        expect(labels).not.toContain('te0');
    });
});

describe('demo drawing store', () => {
    it('saves and reloads the demo and rule drawings', () => {
        const ctx = newDemoContext();
        buildDemo(ctx);
        const { drawingStore, drawing } = ctx;

        const expectedNames = [
            'Initial Drawing',
            'Rule Drawing Demo',
            'ComposableEdges',
            'FlagInChildLayer',
            'FlagInRoot',
            'ComposableEdgesChildEq',
            'ChildEqApply',
            'SecondOrderComp',
            'SharedEdgeTriangles'
        ];
        for (const name of expectedNames) {
            expect(drawingStore.getDrawing(name)).toBeDefined();
        }

        const initial = drawingStore.getDrawing('Initial Drawing')!;
        const demo = drawingStore.getDrawing('Rule Drawing Demo')!;
        const comp = drawingStore.getDrawing('ComposableEdges')!;
        const soComp = drawingStore.getDrawing('SecondOrderComp')!;

        expect(initial.isRule).toBe(false);
        expect(demo.isRule).toBe(false);
        expect(comp.isRule).toBe(true);
        expect(comp.isFirstOrder).toBe(true);
        expect(soComp.isRule).toBe(true);
        expect(soComp.isFirstOrder).toBe(false);

        // buildDemo ends by loading 'Rule Drawing Demo' back into the canvas drawing
        expect(drawing.isRule).toBe(false);
        expect(drawing.getArtefacts().length).toBe(demo.artefacts.length);
    });
});
