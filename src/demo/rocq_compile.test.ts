import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawnSync } from 'child_process';
import {
    Drawing,
    DrawingStore,
    findFirstOrderRuleApplications,
    findSecondOrderRuleApplications,
    applyFirstOrderRule,
    applySecondOrderRule,
    type Artefact,
    type RuleApplication,
    type SortStore
} from '../index';
import { exportDrawingsToRocq } from '../rocq_export';
import { RocqRecorder } from '../rocq_recording';
import { newSortStore, makeVertex, makeEdge } from './helpers';

const rocqAvailable = ((): boolean => {
    try {
        const result = spawnSync('rocq', ['--version'], { encoding: 'utf8', timeout: 30000 });
        return result.status === 0;
    } catch {
        return false;
    }
})();

type ApplyResult = { artefacts: Artefact[]; created: Map<Artefact, Artefact> };

interface BuiltScenario {
    host: Drawing;
    rule: Drawing;
    ruleName: string;
    secondOrder: boolean;
    apps: RuleApplication[];
}

function recordScenario(sortStore: SortStore, scenario: BuiltScenario): string {
    const store = new DrawingStore();
    store.saveDrawing('Main', scenario.host);
    store.saveDrawing(scenario.ruleName, scenario.rule);
    const recorder = new RocqRecorder();
    recorder.start(scenario.host, 'Main', sortStore);
    let applyResult: ApplyResult;
    if (scenario.secondOrder) {
        const result = applySecondOrderRule(scenario.rule, scenario.host, scenario.apps[0], { hostName: 'Main', ruleName: scenario.ruleName });
        applyResult = { artefacts: result.hostArtefacts, created: result.hostCreated };
    } else {
        applyResult = applyFirstOrderRule(scenario.rule, scenario.host, scenario.apps[0]);
    }
    recorder.recordRuleApply(scenario.rule, scenario.ruleName, scenario.apps[0], scenario.host, applyResult, 'Main', sortStore);
    recorder.recordProveSuccess(scenario.host, null, null, 'Main');
    const script = recorder.stop();
    return exportDrawingsToRocq(store.getAllDrawings(), sortStore) + '\n' + script;
}

function buildSingleEqConclusion(sortStore: SortStore): BuiltScenario {
    const host = new Drawing(sortStore);
    makeVertex(host, 'a');
    makeVertex(host, 'b');
    const rule = new Drawing(sortStore);
    const rx = makeVertex(rule, 'x');
    const ry = makeVertex(rule, 'y');
    rule.addLayer('conclusion', 'Conclusion', 'root');
    rule.newEqualityArtefact([rx, ry], 'conclusion');
    rule.setIsRule(true);
    const apps = findFirstOrderRuleApplications(rule, host);
    if (apps.length === 0) {
        throw new Error('EqConclusionRule produced no applications');
    }
    return { host, rule, ruleName: 'EqConclusionRule', secondOrder: false, apps };
}

function buildMultiEqConclusion(sortStore: SortStore): BuiltScenario {
    const host = new Drawing(sortStore);
    const ma = makeVertex(host, 'a');
    const mb = makeVertex(host, 'b');
    makeEdge(host, 'g', ma, mb);
    host.newEqualityArtefact([ma, mb], 'root');
    const rule = new Drawing(sortStore);
    const rx = makeVertex(rule, 'x');
    const ry = makeVertex(rule, 'y');
    rule.addLayer('conclusion', 'Conclusion', 'root');
    rule.newArtefact('Edge', { source: rx, target: ry }, { width: 2, bend: 0, label: 'f' }, 'conclusion');
    rule.newEqualityArtefact([rx, ry], 'conclusion');
    rule.setIsRule(true);
    const apps = findFirstOrderRuleApplications(rule, host);
    if (apps.length === 0) {
        throw new Error('FooEq produced no applications');
    }
    return { host, rule, ruleName: 'FooEq', secondOrder: false, apps };
}

function buildSecondOrder(sortStore: SortStore): BuiltScenario {
    const host = new Drawing(sortStore);
    makeVertex(host, 'a');
    makeVertex(host, 'b');
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
    const apps = findSecondOrderRuleApplications(rule, host);
    if (apps.length === 0) {
        throw new Error('SecondOrderRule produced no applications');
    }
    return { host, rule, ruleName: 'SecondOrderRule', secondOrder: true, apps };
}

function buildProvableChild(sortStore: SortStore): Drawing {
    const host = new Drawing(sortStore);
    const a = makeVertex(host, 'a');
    const b = makeVertex(host, 'b');
    const c = makeVertex(host, 'c');
    makeEdge(host, 'e1', a, b);
    makeEdge(host, 'e2', b, c);
    host.newEqualityArtefact([a, b], 'root');
    host.newEqualityArtefact([b, c], 'root');
    host.addLayer('child', 'Child Layer', 'root');
    makeEdge(host, 'g1', a, b, 'child');
    makeEdge(host, 'g2', b, c, 'child');
    host.newEqualityArtefact([a, b, c], 'child');
    return host;
}

function buildFlagOnlyConclusion(sortStore: SortStore): BuiltScenario {
    const host = new Drawing(sortStore);
    const hv0 = makeVertex(host, 'hv0');
    const hv1 = makeVertex(host, 'hv1');
    const hv2 = makeVertex(host, 'hv2');
    makeEdge(host, 'he1', hv0, hv1);
    makeEdge(host, 'he2', hv1, hv2);
    const rule = new Drawing(sortStore);
    const fv0 = makeVertex(rule, 'fv0');
    const fv1 = makeVertex(rule, 'fv1');
    const fv2 = makeVertex(rule, 'fv2');
    makeEdge(rule, 'fe1', fv0, fv1);
    rule.addLayer('flag-conclusion', 'Flag Conclusion', 'root');
    rule.newArtefact('Edge', { source: fv1, target: fv2, mono: { __flag: true, layerId: 'flag-conclusion' } }, { width: 2, bend: 0, label: 'fe2' }, 'root');
    rule.setIsRule(true);
    const apps = findFirstOrderRuleApplications(rule, host);
    if (apps.length === 0) {
        throw new Error('FlagOnlyRule produced no applications');
    }
    return { host, rule, ruleName: 'FlagOnlyRule', secondOrder: false, apps };
}

describe.skipIf(!rocqAvailable)('rocq export compiles', () => {
    let dir: string;

    beforeAll(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rocq-compile-'));
    });

    afterAll(() => {
        if (dir) {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });

    function compile(name: string, code: string): void {
        const file = path.join(dir, `${name}.v`);
        fs.writeFileSync(file, code);
        const result = spawnSync('rocq', ['compile', file], { encoding: 'utf8', timeout: 120000 });
        expect(result.status, `rocq failed for ${name}:\n${result.stderr}\n---\n${code}`).toBe(0);
    }

    it.each([
        { name: 'single_eq_conclusion', build: buildSingleEqConclusion },
        { name: 'multi_eq_conclusion', build: buildMultiEqConclusion },
        { name: 'second_order', build: buildSecondOrder },
        { name: 'flag_only_conclusion', build: buildFlagOnlyConclusion }
    ])('compiles $name', ({ name, build }) => {
        const sortStore = newSortStore();
        compile(name, recordScenario(sortStore, build(sortStore)));
    });

    it('compiles a provable child layer with a tuple and equality conclusion', () => {
        const sortStore = newSortStore();
        const store = new DrawingStore();
        const host = buildProvableChild(sortStore);
        const result = host.checkLayerProvable('child');
        expect(result.provable).toBe(true);

        store.saveDrawing('Main', host);
        const recorder = new RocqRecorder();
        recorder.start(host, 'Main', sortStore);
        recorder.recordProveSuccess(host, 'child', result.match ?? null, 'Main');
        const script = recorder.stop();
        compile('provable_child', exportDrawingsToRocq(store.getAllDrawings(), sortStore) + '\n' + script);
    });

    it('compiles a host with several sequential rule applications', () => {
        const sortStore = newSortStore();
        const store = new DrawingStore();

        const host = new Drawing(sortStore);
        const ma = makeVertex(host, 'a');
        const mb = makeVertex(host, 'b');
        host.addLayer('child', 'Child Layer', 'root');
        makeEdge(host, 'g', ma, mb, 'child');
        host.newArtefact('Edge', { source: ma, target: mb, mono: { __flag: true, layerId: 'root' } }, { width: 2, bend: 0, label: 'mf' }, 'root');
        host.newEqualityArtefact([ma, mb], 'root');
        store.saveDrawing('Main', host);

        const foo = new Drawing(sortStore);
        const fx = makeVertex(foo, 'x');
        const fy = makeVertex(foo, 'y');
        foo.addLayer('conclusion', 'Conclusion', 'root');
        foo.newArtefact('Edge', { source: fx, target: fy }, { width: 2, bend: 0, label: 'f' }, 'conclusion');
        foo.setIsRule(true);
        store.saveDrawing('Foo', foo);

        const secondOrderRule = new Drawing(sortStore);
        const sx = makeVertex(secondOrderRule, 'x');
        const sy = makeVertex(secondOrderRule, 'y');
        secondOrderRule.addLayer('premise-1', 'Premise Layer', 'root');
        makeEdge(secondOrderRule, 'pe', sx, sy, 'premise-1');
        secondOrderRule.addLayer('premise-1-child', 'Premise Child Layer', 'premise-1');
        makeEdge(secondOrderRule, 'pce', sx, sy, 'premise-1-child');
        secondOrderRule.addLayer('conclusion', 'Conclusion Layer', 'root');
        makeEdge(secondOrderRule, 'ce', sx, sy, 'conclusion');
        secondOrderRule.setIsRule(true);
        store.saveDrawing('SecondOrderRule', secondOrderRule);

        const monoRule = new Drawing(sortStore);
        const mx = makeVertex(monoRule, 'x');
        const my = makeVertex(monoRule, 'y');
        monoRule.newArtefact('Edge', { source: mx, target: my, mono: { __flag: true, layerId: 'root' } }, { width: 2, bend: 0, label: 'f' }, 'root');
        monoRule.addLayer('conclusion', 'Conclusion Layer', 'root');
        makeEdge(monoRule, 'g', mx, my, 'conclusion');
        monoRule.setIsRule(true);
        store.saveDrawing('MonoRule', monoRule);

        const eqRule = new Drawing(sortStore);
        const ex = makeVertex(eqRule, 'x');
        const ey = makeVertex(eqRule, 'y');
        eqRule.newEqualityArtefact([ex, ey], 'root');
        eqRule.addLayer('conclusion', 'Conclusion Layer', 'root');
        makeEdge(eqRule, 'g', ex, ey, 'conclusion');
        eqRule.setIsRule(true);
        store.saveDrawing('EqRule', eqRule);

        const recorder = new RocqRecorder();
        recorder.start(host, 'Main', sortStore);

        const fooApps = findFirstOrderRuleApplications(foo, host);
        if (fooApps.length === 0) {
            throw new Error('Foo produced no applications');
        }
        recorder.recordRuleApply(foo, 'Foo', fooApps[0], host, applyFirstOrderRule(foo, host, fooApps[0]), 'Main', sortStore);

        const soApps = findSecondOrderRuleApplications(secondOrderRule, host);
        if (soApps.length === 0) {
            throw new Error('SecondOrderRule produced no applications');
        }
        const soResult = applySecondOrderRule(secondOrderRule, host, soApps[0], { hostName: 'Main', ruleName: 'SecondOrderRule' });
        recorder.recordRuleApply(
            secondOrderRule,
            'SecondOrderRule',
            soApps[0],
            host,
            { artefacts: soResult.hostArtefacts, created: soResult.hostCreated },
            'Main',
            sortStore
        );

        const monoApps = findFirstOrderRuleApplications(monoRule, host);
        if (monoApps.length === 0) {
            throw new Error('MonoRule produced no applications');
        }
        recorder.recordRuleApply(monoRule, 'MonoRule', monoApps[0], host, applyFirstOrderRule(monoRule, host, monoApps[0]), 'Main', sortStore);

        const eqApps = findFirstOrderRuleApplications(eqRule, host);
        if (eqApps.length === 0) {
            throw new Error('EqRule produced no applications');
        }
        recorder.recordRuleApply(eqRule, 'EqRule', eqApps[0], host, applyFirstOrderRule(eqRule, host, eqApps[0]), 'Main', sortStore);

        const childResult = host.checkLayerProvable('child');
        if (!childResult.provable) {
            throw new Error('child layer not provable: ' + (childResult.reason ?? 'unknown'));
        }
        recorder.recordProveSuccess(host, 'child', childResult.match ?? null, 'Main');
        const script = recorder.stop();
        compile('main', exportDrawingsToRocq(store.getAllDrawings(), sortStore) + '\n' + script);
    });
});
