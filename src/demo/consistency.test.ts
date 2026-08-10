import { describe, it, expect } from 'vitest';
import { EqualityArtefact } from '../index';
import { makeDrawing, makeVertex, makeEdge } from './helpers';

describe('consistency checks', () => {
    it('rejects an invalid position attribute', () => {
        const drawing = makeDrawing();
        expect(() =>
            drawing.newArtefact('Vertex', {}, { position: '200, 300', label: 'InvalidPos' })
        ).toThrowError(/Consistency Check Failed/);
    });

    it('rejects a missing dependency', () => {
        const drawing = makeDrawing();
        const v0 = makeVertex(drawing, 'v0');
        expect(() =>
            drawing.newArtefact('Edge', { source: v0 }, { width: 4, bend: 0 })
        ).toThrowError(/Consistency Check Failed/);
    });

    it('rejects a wrong dependency type', () => {
        const drawing = makeDrawing();
        const v0 = makeVertex(drawing, 'v0');
        const v1 = makeVertex(drawing, 'v1');
        const e0 = makeEdge(drawing, 'e0', v0, v1);
        expect(() =>
            drawing.newArtefact('Edge', { source: v0, target: e0 }, { width: 4, bend: 0 })
        ).toThrowError(/Consistency Check Failed/);
    });

    it('rejects an unexpected dependency/flag', () => {
        const drawing = makeDrawing();
        const v0 = makeVertex(drawing, 'v0');
        const v1 = makeVertex(drawing, 'v1');
        expect(() =>
            drawing.newArtefact('Edge', { source: v0, target: v1, unexpectedFlag: true }, { width: 4, bend: 0 })
        ).toThrowError(/Consistency Check Failed/);
    });

    it('rejects a bad flag type', () => {
        const drawing = makeDrawing();
        const v0 = makeVertex(drawing, 'v0');
        const v1 = makeVertex(drawing, 'v1');
        expect(() =>
            drawing.newArtefact('Edge', { source: v0, target: v1, mono: 'yes' as unknown as boolean }, { width: 4, bend: 0 })
        ).toThrowError(/Consistency Check Failed/);
    });

    it('rejects a flag leaving from a non-descendant layer', () => {
        const drawing = makeDrawing();
        drawing.addLayer('layer-1', 'Child Layer 1', 'root');
        const v0 = makeVertex(drawing, 'v0');
        const v1 = makeVertex(drawing, 'v1');
        expect(() =>
            drawing.newArtefact('Edge', { source: v0, target: v1, mono: { __flag: true, layerId: 'root' } }, { width: 4, bend: 0 }, 'layer-1')
        ).toThrowError(/Consistency Check Failed/);
    });

    it('rejects a flag leaving from a nonexistent layer', () => {
        const drawing = makeDrawing();
        const v0 = makeVertex(drawing, 'v0');
        const v1 = makeVertex(drawing, 'v1');
        expect(() =>
            drawing.newArtefact('Edge', { source: v0, target: v1, mono: { __flag: true, layerId: 'does-not-exist' } }, { width: 4, bend: 0 })
        ).toThrowError(/Consistency Check Failed/);
    });

    it('rejects a dependency on an artefact not in a lower ancestor layer', () => {
        const drawing = makeDrawing();
        drawing.addLayer('layer-1', 'Child Layer 1', 'root');
        const v0 = makeVertex(drawing, 'v0');
        const v1 = drawing.newArtefact('Vertex', {}, { position: [100, 100], label: 'v_top' }, 'layer-1');
        expect(() =>
            drawing.newArtefact('Edge', { source: v0, target: v1 }, { width: 2, bend: 0, label: 'invalid_edge' }, 'root')
        ).toThrowError(/Consistency Check Failed/);
    });
});

describe('equality artefacts', () => {
    it('creates an equality artefact and merges overlapping children on the same layer', () => {
        const drawing = makeDrawing();
        const v0 = makeVertex(drawing, 'v0');
        const v1 = makeVertex(drawing, 'v1');
        const v2 = makeVertex(drawing, 'v2');

        const eq1 = drawing.newEqualityArtefact([v0, v1], 'root');
        expect(eq1).toBeInstanceOf(EqualityArtefact);
        expect(eq1.children).toHaveLength(2);

        const eq2 = drawing.newEqualityArtefact([v1, v2], 'root');
        expect(eq2).toBeInstanceOf(EqualityArtefact);
        expect(eq2.children).toHaveLength(3);
        expect(eq1.children).toHaveLength(3);
    });

    it('does not merge equalities created in different layers', () => {
        const drawing = makeDrawing();
        drawing.addLayer('layer-1', 'Child Layer 1', 'root');
        const v0 = makeVertex(drawing, 'v0');
        const v1 = makeVertex(drawing, 'v1');
        const v2 = makeVertex(drawing, 'v2');
        const sq_v0 = drawing.newArtefact('Vertex', {}, { position: [400, 400], label: 'A' }, 'root');

        const eqRoot = drawing.newEqualityArtefact([v0, v1], 'root');
        const eqLayer1 = drawing.newEqualityArtefact([v2, sq_v0], 'layer-1');

        expect(eqRoot.children).toHaveLength(2);
        expect(eqLayer1.children).toHaveLength(2);
        expect(eqRoot).not.toBe(eqLayer1);
    });

    it('rejects a degenerate equality (fewer than 2 distinct elements)', () => {
        const drawing = makeDrawing();
        const v0 = makeVertex(drawing, 'v0');
        expect(() => drawing.newEqualityArtefact([v0], 'root')).toThrowError(/Consistency Check Failed/);
    });

    it('rejects an equality across different sorts', () => {
        const drawing = makeDrawing();
        const v0 = makeVertex(drawing, 'v0');
        const v1 = makeVertex(drawing, 'v1');
        const p1 = makeEdge(drawing, 'p1', v0, v1);
        expect(() => drawing.newEqualityArtefact([v0, p1], 'root')).toThrowError(/Consistency Check Failed/);
    });

    it('rejects an equality between artefacts with non-equal dependencies', () => {
        const drawing = makeDrawing();
        const v0 = makeVertex(drawing, 'v0');
        const v1 = makeVertex(drawing, 'v1');
        const v2 = makeVertex(drawing, 'v2');
        const e0 = makeEdge(drawing, 'e0', v0, v1);
        const e1 = makeEdge(drawing, 'e1', v1, v2);
        expect(() => drawing.newEqualityArtefact([e1, e0], 'root')).toThrowError(/Consistency Check Failed/);
    });
});

describe('artefact merge', () => {
    it('merges two vertices and updates dependent artefacts', () => {
        const drawing = makeDrawing();
        drawing.addLayer('layer-1', 'Child Layer 1', 'root');
        const tv0 = drawing.newArtefact('Vertex', {}, { position: [100, 100], label: 'tv0' }, 'root');
        const tv1 = drawing.newArtefact('Vertex', {}, { position: [200, 200], label: 'tv1' }, 'root');
        const sq_v1 = drawing.newArtefact('Vertex', {}, { position: [600, 400], label: 'B' }, 'root');
        const te0 = drawing.newArtefact('Edge', { source: tv0, target: sq_v1 }, { width: 2, bend: 0, label: 'te0' }, 'layer-1');

        expect(drawing.areDependenciesEqual(tv0, tv1)).toBe(true);

        const merged = drawing.mergeArtefacts(tv0, tv1);
        expect(merged).toBe(tv1);
        expect(merged.data.label).toBe('tv0, tv1');
        expect(merged.data.position).toEqual([200, 200]);
        expect(te0.dependencies.source).toBe(merged);
        expect(drawing.getArtefacts()).not.toContain(tv0);
    });

    it('rejects merging artefacts of different sorts/dependencies', () => {
        const drawing = makeDrawing();
        const v0 = makeVertex(drawing, 'v0');
        const v1 = makeVertex(drawing, 'v1');
        const edge = makeEdge(drawing, 'e0', v0, v1);
        expect(() => drawing.mergeArtefacts(v0, edge)).toThrowError(/Consistency Check Failed/);
    });

    it('rejects merging an artefact with itself', () => {
        const drawing = makeDrawing();
        const v0 = makeVertex(drawing, 'v0');
        expect(() => drawing.mergeArtefacts(v0, v0)).toThrowError(/Consistency Check Failed/);
    });
});

describe('layer provability', () => {
    it('is provable without flags and non-provable when a flag is established in the layer', () => {
        const drawing = makeDrawing();
        drawing.addLayer('prov-child', 'Prov Child', 'root');
        const pv0 = makeVertex(drawing, 'pv0');
        const pv1 = makeVertex(drawing, 'pv1');
        const pre = makeEdge(drawing, 'pre', pv0, pv1);
        const pce = drawing.newArtefact('Edge', { source: pv0, target: pv1 }, { width: 2, bend: 0, label: 'pce' }, 'prov-child');

        drawing.addEqualityArtefactUnchecked([pre, pce], 'root');

        expect(drawing.checkLayerProvable('prov-child').provable).toBe(true);

        pre.dependencies['mono'] = true;
        pre.flagLayers['mono'] = 'prov-child';

        expect(drawing.checkLayerProvable('prov-child').provable).toBe(false);
    });
});
