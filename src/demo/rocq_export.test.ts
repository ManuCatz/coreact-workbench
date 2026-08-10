import { describe, it, expect } from 'vitest';
import { exportDrawingsToRocq } from '../rocq_export';
import { RocqRecorder } from '../rocq_recording';
import { Drawing, DrawingStore, findFirstOrderRuleApplications, applyFirstOrderRule, findSecondOrderRuleApplications, applySecondOrderRule } from '../index';
import { newSortStore, makeVertex, makeEdge, makeDrawing, buildComposableHost, buildFlagInChildLayerRule, buildFlagOnlyConclusionRule, buildSecondOrderRule } from './helpers';

describe('rocq export', () => {
    it('exports sorts and a sigma notation preamble without records, modules, or tuple notation', () => {
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
        expect(code).toContain('Ltac subst_all :=');
        expect(code).toContain('Tactic Notation "subst_all_in"');
        expect(code).not.toContain('existT');
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
        expect(script).toContain('repeat (intros; cbn; subst_all).');
        expect(script).toContain('MainDrawing');
        expect(script).toContain('Qed');
        expect(script).toContain('assert (f := @Foo_rule a b).');
        expect(script).toContain('repeat constructor; eassumption');
        expect(script).toContain('forall (a b : Vertex)');
        expect(script).toContain('ltac:(subst_all_in (True))');
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
        recorder.recordRuleApply(rule, 'SecondOrderRule', apps[0], host, { artefacts: result.hostArtefacts, created: result.hostCreated }, 'MainDrawing', sortStore);
        const script = recorder.stop();

        expect(script).toContain('Lemma MainDrawing___SecondOrderRule___Premise_rule : forall (a b : Vertex), forall (pe : Edge a b), Edge a b.');
        expect(script).toContain('Admitted.');
        expect(script).toContain('assert (Hpremise1 : forall (pe : Edge a b), Edge a b) by eauto using MainDrawing___SecondOrderRule___Premise_rule.');
        expect(script).toContain('assert (ce := @SecondOrderRule_rule a b Hpremise1).');
        expect(script).not.toContain('by admit');
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

    it('destructs a first-order conclusion combining an artefact and a conclusion-layer flag, naming the flag from the host', () => {
        const sortStore = newSortStore();
        const store = new DrawingStore();

        const host = buildComposableHost().host;
        store.saveDrawing('MainDrawing', host);

        const rule = buildFlagInChildLayerRule();
        store.saveDrawing('FlagInChildLayer', rule);

        const recorder = new RocqRecorder();
        recorder.start(host, 'MainDrawing', sortStore);
        const apps = findFirstOrderRuleApplications(rule, host);
        expect(apps.length).toBe(1);
        const created = applyFirstOrderRule(rule, host, apps[0]);
        recorder.recordRuleApply(rule, 'FlagInChildLayer', apps[0], host, created, 'MainDrawing', sortStore);
        const script = recorder.stop();

        expect(script).toContain('destruct (@FlagInChildLayer_rule hv0 hv1 hv2 he1 he2) as (fe3 & mono_he2)');
        expect(script).not.toContain('as ()');
    });

    it('destructs a second-order conclusion combining an artefact and a conclusion-layer flag, naming the flag from the host', () => {
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

        expect(script).toContain('Lemma MainDrawing___SecondOrderRule___Premise_A_rule : forall (hv0 hv1 hv2 : Vertex)(he1 : Edge hv0 hv1)(he2 : Edge hv1 hv2), forall (sdv : Vertex), Edge sdv hv1.');
        expect(script).toContain('assert (sh := @SecondOrderRule_rule hv0 hv1 hv2 he1 he2 Hpremise1); destruct sh as (sh & mono_he1)');
        expect(script).not.toContain('as ()');
    });

    it('asserts a conclusion that is only a flag already present in a host child layer, without destruct', () => {
        const sortStore = newSortStore();
        const store = new DrawingStore();

        const host = makeDrawing();
        const hv0 = makeVertex(host, 'hv0');
        const hv1 = makeVertex(host, 'hv1');
        const hv2 = makeVertex(host, 'hv2');
        makeEdge(host, 'he1', hv0, hv1);
        host.addLayer('mono-layer', 'Mono Layer', 'root');
        host.newArtefact('Edge', { source: hv1, target: hv2, mono: { __flag: true, layerId: 'mono-layer' } }, { width: 2, bend: 0, label: 'he2' }, 'root');
        store.saveDrawing('MainDrawing', host);

        const rule = buildFlagOnlyConclusionRule();
        store.saveDrawing('FlagOnlyRule', rule);

        const recorder = new RocqRecorder();
        recorder.start(host, 'MainDrawing', sortStore);
        const apps = findFirstOrderRuleApplications(rule, host);
        expect(apps.length).toBe(1);
        const created = applyFirstOrderRule(rule, host, apps[0]);
        recorder.recordRuleApply(rule, 'FlagOnlyRule', apps[0], host, created, 'MainDrawing', sortStore);
        const script = recorder.stop();

        expect(script).toContain('assert (mono_he2 := @FlagOnlyRule_rule hv0 hv1 hv2 he1 he2)');
        expect(script).not.toContain('destruct');
        expect(script).not.toContain('as ()');
    });

    it('wraps the sort sequence after a root equality run in ltac subst_all_in', () => {
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
        expect(code).toContain('Parameter WrappedEqRule_rule : forall (x y : Vertex)(eq_x_y : x = y), ltac:(subst_all_in (Edge x y)).');
    });

    it('wraps the sigma body after a conclusion equality binder in ltac subst_all_in', () => {
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
        expect(code).toContain('Parameter SigmaEqRule_rule : forall (x y : Vertex), Σ (eq_x_y : x = y), ltac:(subst_all_in (Edge x y)).');
    });
});
