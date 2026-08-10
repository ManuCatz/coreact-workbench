import { describe, it, expect } from 'vitest';
import { exportDrawingsToRocq } from '../rocq_export';
import { RocqRecorder } from '../rocq_recording';
import { Drawing, DrawingStore, findFirstOrderRuleApplications, applyFirstOrderRule, findSecondOrderRuleApplications, applySecondOrderRule } from '../index';
import { newSortStore, makeVertex, makeEdge } from './helpers';

describe('rocq export', () => {
    it('exports sorts and a sigma notation preamble without records or modules', () => {
        const sortStore = newSortStore();
        const drawing = new Drawing(sortStore);
        const v0 = makeVertex(drawing, 'a');
        const v1 = makeVertex(drawing, 'b');
        makeEdge(drawing, 'f', v0, v1);

        const store = new DrawingStore();
        store.saveDrawing('MainDrawing', drawing);

        const code = exportDrawingsToRocq(store.getAllDrawings(), sortStore);
        expect(code.startsWith('Notation')).toBe(true);
        expect(code).toContain('sigT');
        expect(code).toContain('Parameter Vertex : Type.');
        expect(code).toContain('Parameter Edge : Vertex -> Vertex -> Type.');
        expect(code).toContain('Notation "( x , .. , y , p )"');
        expect(code).toContain('Ltac subst_all :=');
        expect(code).toContain('Tactic Notation "subst_all_in"');
        expect(code).toContain('existT');
        expect(code).not.toContain('Module MainDrawing');
        expect(code).not.toContain('Record');
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
        rule.newArtefact('Edge', { source: rx, target: ry }, { width: 2, bend: 0, label: 'f' }, 'conclusion');
        rule.setIsRule(true);
        store.saveDrawing('Foo', rule);

        const recorder = new RocqRecorder();
        recorder.start(host, 'MainDrawing', sortStore);
        const apps = findFirstOrderRuleApplications(rule, host);
        expect(apps.length).toBe(1);
        const created = applyFirstOrderRule(rule, host, apps[0]);
        recorder.recordRuleApply(rule, 'Foo', apps[0], host, created, 'MainDrawing', sortStore);
        recorder.recordProveSuccess('MainDrawing');
        const script = recorder.stop();

        expect(script).toContain('Lemma MainDrawing_rule :');
        expect(script).toContain('intros');
        expect(script).toContain('subst_all.');
        expect(script).toContain('MainDrawing');
        expect(script).toContain('Qed');
        expect(script).toContain('assert (f := @Foo_rule a b).');
        expect(script).toContain('repeat constructor; eassumption');
        expect(script).toContain('forall (a b : Vertex)');
        expect(script).not.toContain('ltac:(subst_all_in');
        expect(script).not.toContain('; subst_all.');

        const code = exportDrawingsToRocq(store.getAllDrawings(), sortStore) + '\n' + script;
        expect(code).toContain('Parameter Foo_rule :');
        expect(code).toContain('forall');
        expect(code).not.toContain('Module MainDrawing');
        expect(code).not.toContain('Module Foo');
    });

    it('keeps subst_all when the rule conclusion includes an equality', () => {
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
        rule.newArtefact('Edge', { source: rx, target: ry }, { width: 2, bend: 0, label: 'f' }, 'conclusion');
        rule.newEqualityArtefact([rx, ry], 'conclusion');
        rule.setIsRule(true);
        store.saveDrawing('FooEq', rule);

        const recorder = new RocqRecorder();
        recorder.start(host, 'MainDrawing', sortStore);
        const apps = findFirstOrderRuleApplications(rule, host);
        expect(apps.length).toBe(1);
        const created = applyFirstOrderRule(rule, host, apps[0]);
        recorder.recordRuleApply(rule, 'FooEq', apps[0], host, created, 'MainDrawing', sortStore);
        const script = recorder.stop();

        expect(script).toContain('destruct (@FooEq_rule a b) as (');
        expect(script).toContain('; subst_all.');
    });

    it('uses assert with subst_all and no destruct when a rule has a single equality in its conclusion', () => {
        const sortStore = newSortStore();
        const store = new DrawingStore();

        const host = new Drawing(sortStore);
        makeVertex(host, 'a');
        makeVertex(host, 'b');
        store.saveDrawing('MainDrawing', host);

        const rule = new Drawing(sortStore);
        const rx = makeVertex(rule, 'x');
        const ry = makeVertex(rule, 'y');
        rule.addLayer('conclusion', 'Conclusion', 'root');
        rule.newEqualityArtefact([rx, ry], 'conclusion');
        rule.setIsRule(true);
        store.saveDrawing('EqConclusionRule', rule);

        const recorder = new RocqRecorder();
        recorder.start(host, 'MainDrawing', sortStore);
        const apps = findFirstOrderRuleApplications(rule, host);
        expect(apps.length).toBeGreaterThan(0);
        const created = applyFirstOrderRule(rule, host, apps[0]);
        recorder.recordRuleApply(rule, 'EqConclusionRule', apps[0], host, created, 'MainDrawing', sortStore);
        const script = recorder.stop();

        expect(script).toContain('assert (eq_a_b := @EqConclusionRule_rule a b); subst_all.');
        expect(script).not.toContain('destruct');
    });

    it('uses assert with no destruct or subst_all for a second-order rule with a single non-equality conclusion', () => {
        const sortStore = newSortStore();
        const store = new DrawingStore();

        const host = new Drawing(sortStore);
        makeVertex(host, 'a');
        makeVertex(host, 'b');
        store.saveDrawing('MainDrawing', host);

        const rule = new Drawing(sortStore);
        const rx = makeVertex(rule, 'x');
        const ry = makeVertex(rule, 'y');
        rule.addLayer('premise-1', 'Premise', 'root');
        makeEdge(rule, 'pe', rx, ry, 'premise-1');
        rule.addLayer('premise-1-child', 'Premise Child', 'premise-1');
        makeEdge(rule, 'pce', rx, ry, 'premise-1-child');
        rule.addLayer('conclusion', 'Conclusion', 'root');
        makeEdge(rule, 'ce', rx, ry, 'conclusion');
        rule.setIsRule(true);
        store.saveDrawing('SecondOrderRule', rule);

        const recorder = new RocqRecorder();
        recorder.start(host, 'MainDrawing', sortStore);
        const apps = findSecondOrderRuleApplications(rule, host);
        expect(apps.length).toBeGreaterThan(0);
        const result = applySecondOrderRule(rule, host, apps[0], { hostName: 'MainDrawing', ruleName: 'SecondOrderRule' });
        recorder.recordRuleApply(rule, 'SecondOrderRule', apps[0], host, result.hostArtefacts, 'MainDrawing', sortStore);
        const script = recorder.stop();

        expect(script).toContain('assert (Hpremise1 : forall (pe : Edge a b), Edge a b) by admit.');
        expect(script).toContain('assert (ce := @SecondOrderRule_rule a b Hpremise1).');
        expect(script).not.toContain('destruct');
        expect(script).not.toContain('; subst_all.');
    });

    it('orders rule arguments topologically, interleaving root equalities at their dependency position', () => {
        const sortStore = newSortStore();
        const store = new DrawingStore();

        const host = new Drawing(sortStore);
        const ha = makeVertex(host, 'a');
        const hb = makeVertex(host, 'b');
        const hc = makeVertex(host, 'c');
        host.newEqualityArtefact([ha, hb], 'root');
        host.newArtefact('Edge', { source: ha, target: hc, mono: { __flag: true, layerId: 'root' } }, { width: 2, bend: 0, label: 'mw' }, 'root');
        store.saveDrawing('MainDrawing', host);

        const rule = new Drawing(sortStore);
        const rx = makeVertex(rule, 'x');
        const ry = makeVertex(rule, 'y');
        const rw = makeVertex(rule, 'w');
        rule.newEqualityArtefact([rx, ry], 'root');
        rule.newArtefact('Edge', { source: rx, target: rw, mono: { __flag: true, layerId: 'root' } }, { width: 2, bend: 0, label: 'mw' }, 'root');
        rule.addLayer('conclusion', 'Conclusion', 'root');
        rule.newArtefact('Edge', { source: rx, target: ry }, { width: 2, bend: 0, label: 'f' }, 'conclusion');
        rule.setIsRule(true);
        store.saveDrawing('ArgOrderRule', rule);

        const recorder = new RocqRecorder();
        recorder.start(host, 'MainDrawing', sortStore);
        const apps = findFirstOrderRuleApplications(rule, host);
        expect(apps.length).toBe(1);
        const created = applyFirstOrderRule(rule, host, apps[0]);
        recorder.recordRuleApply(rule, 'ArgOrderRule', apps[0], host, created, 'MainDrawing', sortStore);
        recorder.recordProveSuccess('MainDrawing');
        const script = recorder.stop();

        expect(script).toContain('assert (f := @ArgOrderRule_rule a b c eq_refl mw mono_mw).');
        expect(script).not.toContain('@ArgOrderRule_rule a b c mw mono_mw eq_refl');
    });
});
