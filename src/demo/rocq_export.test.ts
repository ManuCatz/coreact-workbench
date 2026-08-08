import { describe, it, expect } from 'vitest';
import { exportDrawingsToRocq } from '../rocq_export';
import { RocqRecorder } from '../rocq_recording';
import { Drawing, DrawingStore, findFirstOrderRuleApplications } from '../index';
import { newSortStore, makeVertex, makeEdge } from './helpers';

describe('rocq export', () => {
    it('exports a drawing to rocq code with the expected module', () => {
        const sortStore = newSortStore();
        const drawing = new Drawing(sortStore);
        const v0 = makeVertex(drawing, 'a');
        const v1 = makeVertex(drawing, 'b');
        makeEdge(drawing, 'f', v0, v1);

        const store = new DrawingStore();
        store.saveDrawing('MainDrawing', drawing);

        const code = exportDrawingsToRocq(store.getAllDrawings(), sortStore);
        expect(code).toContain('Module MainDrawing');
        expect(code).toContain('End MainDrawing');
        expect(code).toContain('Parameter');
        expect(code).toContain('Record');
    });

    it('records a rule application against a host and emits a goal', () => {
        const sortStore = newSortStore();
        const store = new DrawingStore();

        const host = new Drawing(sortStore);
        const ma = makeVertex(host, 'a');
        const mb = makeVertex(host, 'b');
        makeEdge(host, 'g', ma, mb);
        host.newEqualityArtefact([ma, mb], 'root');
        store.saveDrawing('MainDrawing', host);

        const rule = new Drawing(sortStore);
        const rx = makeVertex(rule, 'x');
        const ry = makeVertex(rule, 'y');
        rule.addLayer('conclusion', 'Conclusion', 'root');
        makeEdge(rule, 'f', rx, ry);
        rule.setIsRule(true);
        store.saveDrawing('Foo', rule);

        const recorder = new RocqRecorder();
        recorder.start(host, 'MainDrawing', sortStore);
        const apps = findFirstOrderRuleApplications(rule, host);
        expect(apps.length).toBe(1);
        recorder.recordRuleApply(rule, 'Foo', apps[0], host, 'MainDrawing', sortStore);
        recorder.recordProveSuccess('MainDrawing');
        const script = recorder.stop();

        expect(script).toContain('Goal');
        expect(script).toContain('MainDrawing');
        expect(script).toContain('Admitted');

        const code = exportDrawingsToRocq(store.getAllDrawings(), sortStore) + '\n' + script;
        expect(code).toContain('Module MainDrawing');
        expect(code).toContain('Module Foo');
    });
});
