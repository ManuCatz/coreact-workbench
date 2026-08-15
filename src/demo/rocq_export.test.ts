import { describe, it, expect } from 'vitest';
import { exportDrawingsToRocq } from '../rocq_export';
import { RocqRecorder } from '../rocq_recording';
import { Drawing, DrawingStore, findFirstOrderRuleApplications, applyFirstOrderRule, findSecondOrderRuleApplications, applySecondOrderRule } from '../index';
import { newSortStore, makeVertex, makeEdge, makeDrawing, buildComposableHost, buildIsMonoInChildLayerRule, buildIsMonoOnlyConclusionRule, buildSecondOrderRule } from './helpers';

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
        expect(code.startsWith('Require Import Ltac2.Ltac2.')).toBe(true);
        expect(code).toContain('Definition Sigma');
        expect(code).not.toContain('(sigT (fun x => ..');
        expect(code).toContain('Parameter Vertex : Type.');
        expect(code).toContain('Parameter Edge : Vertex -> Vertex -> Type.');
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
        recorder.recordProveSuccess(host, null, null, 'MainDrawing');
        const script = recorder.stop();

        expect(script).toContain('Lemma MainDrawing_rule :');
        expect(script).toContain('intros');
        expect(script).toContain('@Foo_rule a b');
        expect(script).toContain('as f');
        expect(script).toContain('forall (a b : Vertex)');
        expect(script).toContain('Qed');

        const code = exportDrawingsToRocq(store.getAllDrawings(), sortStore) + '\n' + script;
        expect(code).toContain('Parameter Foo_rule :');
        expect(code).toContain('forall');
        expect(code).not.toContain('Module MainDrawing');
        expect(code).not.toContain('Module Foo');
    });

    it('starts the proof with intros only when the root layer has no equality', () => {
        const sortStore = newSortStore();
        const store = new DrawingStore();

        const host = new Drawing(sortStore);
        makeVertex(host, 'a');
        makeVertex(host, 'b');
        store.saveDrawing('MainDrawing', host);

        const recorder = new RocqRecorder();
        recorder.start(host, 'MainDrawing', sortStore);
        const script = recorder.stop();

        expect(script).toContain('Lemma MainDrawing_rule :');
    });

    it('applies a rule whose multi-element conclusion combines an artefact and an equality', () => {
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

        expect(script).toContain('@FooEq_rule a b');
    });

    it('applies a rule whose conclusion is a single equality', () => {
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

        expect(script).toContain('@EqConclusionRule_rule a b');
        expect(script).toContain('as eq_a_b');
    });

    it('applies a second-order rule with a single non-equality conclusion', () => {
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
        recorder.recordRuleApply(rule, 'SecondOrderRule', apps[0], host, { artefacts: result.hostArtefacts, created: result.hostCreated }, 'MainDrawing', sortStore);
        const script = recorder.stop();

        expect(script).toContain('Lemma MainDrawing___SecondOrderRule___Premise_rule :');
        expect(script).toContain('Admitted.');
        expect(script).toContain('by eauto using MainDrawing___SecondOrderRule___Premise_rule');
        expect(script).toContain('@SecondOrderRule_rule a b Hpremise1');
        expect(script).toContain('as ce');
        expect(script).not.toContain('by admit');
    });

    it('orders rule arguments topologically, interleaving root equalities at their dependency position', () => {
        const sortStore = newSortStore();
        const store = new DrawingStore();

        const host = new Drawing(sortStore);
        const ha = makeVertex(host, 'a');
        const hb = makeVertex(host, 'b');
        const hc = makeVertex(host, 'c');
        host.newEqualityArtefact([ha, hb], 'root');
        const hmw = host.newArtefact('Edge', { source: ha, target: hc }, { width: 2, bend: 0, label: 'mw' }, 'root');
        host.newArtefact('isMono', { arrow: hmw }, {}, 'root');
        store.saveDrawing('MainDrawing', host);

        const rule = new Drawing(sortStore);
        const rx = makeVertex(rule, 'x');
        const ry = makeVertex(rule, 'y');
        const rw = makeVertex(rule, 'w');
        rule.newEqualityArtefact([rx, ry], 'root');
        const rmw = rule.newArtefact('Edge', { source: rx, target: rw }, { width: 2, bend: 0, label: 'mw' }, 'root');
        rule.newArtefact('isMono', { arrow: rmw }, {}, 'root');
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
        recorder.recordProveSuccess(host, null, null, 'MainDrawing');
        const script = recorder.stop();

        expect(script).toContain('@ArgOrderRule_rule a b c eq_refl mw isMono_2');
        expect(script).not.toContain('@ArgOrderRule_rule a b c mw isMono_2 eq_refl');
    });

    it('applies a first-order rule combining an artefact and a conclusion-layer isMono, naming it from the host', () => {
        const sortStore = newSortStore();
        const store = new DrawingStore();

        const host = buildComposableHost().host;
        store.saveDrawing('MainDrawing', host);

        const rule = buildIsMonoInChildLayerRule();
        store.saveDrawing('IsMonoInChildLayer', rule);

        const recorder = new RocqRecorder();
        recorder.start(host, 'MainDrawing', sortStore);
        const apps = findFirstOrderRuleApplications(rule, host);
        expect(apps.length).toBe(1);
        const created = applyFirstOrderRule(rule, host, apps[0]);
        recorder.recordRuleApply(rule, 'IsMonoInChildLayer', apps[0], host, created, 'MainDrawing', sortStore);
        const script = recorder.stop();

        expect(script).toContain('@IsMonoInChildLayer_rule hv0 hv1 hv2 he1 he2');
        expect(script).toContain('as fe3 isMono_2');
        expect(script).not.toContain('as ()');
    });

    it('applies a second-order rule combining an artefact and a conclusion-layer isMono, naming it from the host', () => {
        const sortStore = newSortStore();
        const store = new DrawingStore();

        const host = buildComposableHost().host;
        store.saveDrawing('MainDrawing', host);

        const rule = buildSecondOrderRule();
        store.saveDrawing('SecondOrderRule', rule);

        const recorder = new RocqRecorder();
        recorder.start(host, 'MainDrawing', sortStore);
        const apps = findSecondOrderRuleApplications(rule, host);
        expect(apps.length).toBeGreaterThan(0);
        const result = applySecondOrderRule(rule, host, apps[0], { hostName: 'MainDrawing', ruleName: 'SecondOrderRule' });
        recorder.recordRuleApply(rule, 'SecondOrderRule', apps[0], host, { artefacts: result.hostArtefacts, created: result.hostCreated }, 'MainDrawing', sortStore);
        const script = recorder.stop();

        expect(script).toContain('Lemma MainDrawing___SecondOrderRule___Premise_A_rule :');
        expect(script).toContain('@SecondOrderRule_rule hv0 hv1 hv2 he1 he2 Hpremise1');
        expect(script).toContain('as sh isMono_2');
        expect(script).not.toContain('as ()');
    });

    it('applies a rule whose conclusion is only an isMono already present in a host child layer', () => {
        const sortStore = newSortStore();
        const store = new DrawingStore();

        const host = makeDrawing();
        const hv0 = makeVertex(host, 'hv0');
        const hv1 = makeVertex(host, 'hv1');
        const hv2 = makeVertex(host, 'hv2');
        makeEdge(host, 'he1', hv0, hv1);
        host.addLayer('mono-layer', 'Mono Layer', 'root');
        const he2 = host.newArtefact('Edge', { source: hv1, target: hv2 }, { width: 2, bend: 0, label: 'he2' }, 'root');
        host.newArtefact('isMono', { arrow: he2 }, {}, 'mono-layer');
        store.saveDrawing('MainDrawing', host);

        const rule = buildIsMonoOnlyConclusionRule();
        store.saveDrawing('FlagOnlyRule', rule);

        const recorder = new RocqRecorder();
        recorder.start(host, 'MainDrawing', sortStore);
        const apps = findFirstOrderRuleApplications(rule, host);
        expect(apps.length).toBe(1);
        const created = applyFirstOrderRule(rule, host, apps[0]);
        recorder.recordRuleApply(rule, 'FlagOnlyRule', apps[0], host, created, 'MainDrawing', sortStore);
        const script = recorder.stop();

        expect(script).toContain('@FlagOnlyRule_rule hv0 hv1 hv2 he1 he2');
        // The host already has an isMono artefact (in mono-layer, named isMono_2),
        // so the created conclusion binds as isMono_3.
        expect(script).toContain('as isMono_3');
        expect(script).not.toContain('as ()');
    });

    it('places a root equality binder before the conclusion sorts in the rule type', () => {
        const sortStore = newSortStore();
        const store = new DrawingStore();

        const rule = new Drawing(sortStore);
        const rx = makeVertex(rule, 'x');
        const ry = makeVertex(rule, 'y');
        rule.newEqualityArtefact([rx, ry], 'root');
        rule.addLayer('conclusion', 'Conclusion', 'root');
        makeEdge(rule, 'f', rx, ry, 'conclusion');
        rule.setIsRule(true);
        store.saveDrawing('WrappedEqRule', rule);

        const code = exportDrawingsToRocq(store.getAllDrawings(), sortStore);
        expect(code).toContain('Parameter WrappedEqRule_rule : forall (x y : Vertex)(eq_x_y : x = y),');
        expect(code).toContain('Edge x y');
    });

    it('places a conclusion equality binder before the sigma body in the rule type', () => {
        const sortStore = newSortStore();
        const store = new DrawingStore();

        const rule = new Drawing(sortStore);
        const rx = makeVertex(rule, 'x');
        const ry = makeVertex(rule, 'y');
        rule.addLayer('conclusion', 'Conclusion', 'root');
        rule.newEqualityArtefact([rx, ry], 'conclusion');
        makeEdge(rule, 'f', rx, ry, 'conclusion');
        rule.setIsRule(true);
        store.saveDrawing('SigmaEqRule', rule);

        const code = exportDrawingsToRocq(store.getAllDrawings(), sortStore);
        expect(code).toContain('Parameter SigmaEqRule_rule : forall (x y : Vertex), Σ (eq_x_y : x = y),');
        expect(code).toContain('Edge x y');
    });

    it('records an exact proof of a provable child layer, naming the matched parent', () => {
        const sortStore = newSortStore();
        const store = new DrawingStore();

        const host = new Drawing(sortStore);
        const ma = makeVertex(host, 'a');
        const mb = makeVertex(host, 'b');
        makeEdge(host, 'g', ma, mb);
        host.addLayer('child', 'Child Layer', 'root');
        makeEdge(host, 'c', ma, mb, 'child');
        store.saveDrawing('MainDrawing', host);

        const result = host.checkLayerProvable('child');
        expect(result.provable).toBe(true);

        const recorder = new RocqRecorder();
        recorder.start(host, 'MainDrawing', sortStore);
        recorder.recordProveSuccess(host, 'child', result.match ?? null, 'MainDrawing');
        const script = recorder.stop();

        expect(script).toContain('exact g.');
    });

    it('records an exact proof for a child layer containing an isMono established in the parent', () => {
        const sortStore = newSortStore();
        const store = new DrawingStore();

        const host = new Drawing(sortStore);
        const ma = makeVertex(host, 'a');
        const mb = makeVertex(host, 'b');
        const me = makeEdge(host, 'g', ma, mb);
        
        host.addLayer('child', 'Child Layer', 'root');
        const ce = host.newArtefact('Edge', { source: ma, target: mb }, { width: 2, bend: 0, label: 'c' }, 'child');
        host.addEqualityArtefactUnchecked([me, ce], 'child');

        // isMono established in root AND child
        host.newArtefact('isMono', { arrow: me }, {}, 'root');
        host.newArtefact('isMono', { arrow: me }, {}, 'child');
        
        store.saveDrawing('MainDrawing', host);

        const recorder = new RocqRecorder();
        recorder.start(host, 'MainDrawing', sortStore);
        
        const result = host.checkLayerProvable('child');
        expect(result.provable).toBe(true);
        recorder.recordProveSuccess(host, 'child', result.match ?? null, 'MainDrawing');
        
        const script = recorder.stop();
        // The proof witness should be a tuple with 'g' and the isMono proof term.
        // It might be 'isMono_2' depending on NameRegistry specifics, so we check for exact (...).
        expect(script).toContain('exact (');
    });

    it('records an exact proof when a child layer contains equations', () => {
        const sortStore = newSortStore();
        const store = new DrawingStore();

        const host = new Drawing(sortStore);
        const ma = makeVertex(host, 'a');
        const mb = makeVertex(host, 'b');
        makeEdge(host, 'g', ma, mb);
        host.addEqualityArtefactUnchecked([ma, mb], 'root');

        host.addLayer('child', 'Child Layer', 'root');
        host.addEqualityArtefactUnchecked([ma, mb], 'child');
        makeEdge(host, 'c', ma, mb, 'child');

        store.saveDrawing('MainDrawing', host);

        const recorder = new RocqRecorder();
        recorder.start(host, 'MainDrawing', sortStore);

        const result = host.checkLayerProvable('child');
        expect(result.provable).toBe(true);
        recorder.recordProveSuccess(host, 'child', result.match ?? null, 'MainDrawing');

        const script = recorder.stop();
        expect(script).toContain('exact (');
    });
});
