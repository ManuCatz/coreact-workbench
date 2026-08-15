import { describe, it, expect } from 'vitest';
import {
    findRuleApplications,
    findFirstOrderRuleApplications,
    findSecondOrderRuleApplications,
    applyFirstOrderRule,
    applySecondOrderRule,
    EqualityArtefact
} from '../index';
import {
    makeDrawing,
    makeVertex,
    makeEdge,
    buildComposableEdgesRule,
    buildComposableHost,
    buildIsMonoInChildLayerRule,
    buildIsMonoInRootRule,
    buildChildEqRule,
    buildSecondOrderRule,
    buildTrianglePairHost,
    buildSharedEdgeTrianglesRule
} from './helpers';

describe('first-order rule matching', () => {
    it('finds an application for two composable edges', () => {
        const { rule } = buildComposableEdgesRule();
        const { host } = buildComposableHost();
        const apps = findRuleApplications(rule, host);
        expect(apps.length).toBeGreaterThanOrEqual(1);
    });

    it('matches a rule whose isMono artefact leaves from a child layer without requiring isMono in the host', () => {
        const rule = buildIsMonoInChildLayerRule();
        const { host } = buildComposableHost();
        const apps = findFirstOrderRuleApplications(rule, host);
        expect(apps.length).toBe(1);
    });

    it('requires an isMono artefact in the rule root layer to be present in the host', () => {
        const rule = buildIsMonoInRootRule();
        const { host } = buildComposableHost();
        const apps = findFirstOrderRuleApplications(rule, host);
        expect(apps.length).toBe(0);
    });
});

describe('applying first-order rules', () => {
    it('adds the conclusion-layer isMono artefact to the matched host root artefact', () => {
        const rule = buildIsMonoInChildLayerRule();
        const { host } = buildComposableHost();
        const apps = findFirstOrderRuleApplications(rule, host);
        expect(apps.length).toBe(1);

        applyFirstOrderRule(rule, host, apps[0]);

        const monoArtefacts = host.getArtefacts().filter(a => a.sortName === 'isMono');
        expect(monoArtefacts.length).toBe(1);
        expect(monoArtefacts[0].layerId).toBe('root');
        const arrow = monoArtefacts[0].dependencies['arrow'];
        expect(arrow).toBeDefined();
        expect(arrow.data.label).toBe('he2');
    });

    it('adds an isMono artefact in the root while keeping an existing isMono in a child layer', () => {
        const rule = buildIsMonoInChildLayerRule();
        const host = makeDrawing();
        const omv0 = makeVertex(host, 'omv0');
        const omv1 = makeVertex(host, 'omv1');
        const omv2 = makeVertex(host, 'omv2');
        makeEdge(host, 'ome1', omv0, omv1);
        const ome2 = host.newArtefact('Edge', { source: omv1, target: omv2 }, { width: 2, bend: 0, label: 'ome2' }, 'root');
        host.addLayer('mono-layer', 'Mono Layer', 'root');
        host.newArtefact('isMono', { arrow: ome2 }, {}, 'mono-layer');

        const apps = findFirstOrderRuleApplications(rule, host);
        expect(apps.length).toBe(1);
        applyFirstOrderRule(rule, host, apps[0]);

        const monoArtefacts = host.getArtefacts().filter(a => a.sortName === 'isMono');
        expect(monoArtefacts.length).toBe(2);
        const rootMonos = monoArtefacts.filter(a => a.layerId === 'root');
        const childMonos = monoArtefacts.filter(a => a.layerId === 'mono-layer');
        expect(rootMonos.length).toBe(1);
        expect(childMonos.length).toBe(1);
        const arrow = rootMonos[0].dependencies['arrow'];
        expect(arrow.data.label).toBe('ome2');
    });

    it('adds conclusion equalities that are not already provable in the host', () => {
        const rule = buildChildEqRule();
        const { host } = buildComposableHost();
        const apps = findFirstOrderRuleApplications(rule, host);
        expect(apps.length).toBe(1);

        const applied = applyFirstOrderRule(rule, host, apps[0]).artefacts;
        const addedEqualities = applied.filter(a => a.sortName === 'Equality');
        expect(addedEqualities.length).toBe(2);

        const vertexEq = addedEqualities.find(eq => eq instanceof EqualityArtefact && (eq as EqualityArtefact).children.every(c => c.sortName === 'Vertex'));
        const edgeEq = addedEqualities.find(eq => eq instanceof EqualityArtefact && (eq as EqualityArtefact).children.every(c => c.sortName === 'Edge'));
        expect(vertexEq).toBeInstanceOf(EqualityArtefact);
        expect(edgeEq).toBeInstanceOf(EqualityArtefact);
    });

    it('ignores child-layer equalities during matching', () => {
        const drawing = makeDrawing();
        const cev0 = makeVertex(drawing, 'cev0');
        const cev1 = makeVertex(drawing, 'cev1');
        const cev2 = makeVertex(drawing, 'cev2');
        makeEdge(drawing, 'ce1', cev0, cev1);
        makeEdge(drawing, 'ce2', cev1, cev2);
        drawing.addLayer('rule-pattern-eq', 'Rule Pattern', 'root');
        makeEdge(drawing, 'ce3', cev0, cev2, 'rule-pattern-eq');
        drawing.newEqualityArtefact([cev0, cev1], 'rule-pattern-eq');
        drawing.setIsRule(true);

        const { host } = buildComposableHost();
        const apps = findRuleApplications(drawing, host);
        expect(apps.length).toBeGreaterThanOrEqual(1);
    });
});

describe('second-order rules', () => {
    it('matches and applies on a two-composable-edge host, producing a derived rule', () => {
        const rule = buildSecondOrderRule();
        expect(rule.checkRuleConditions().isRule).toBe(true);

        const { host } = buildComposableHost();
        const apps = findSecondOrderRuleApplications(rule, host);
        expect(apps.length).toBe(1);

        const result = applySecondOrderRule(rule, host, apps[0], { hostName: 'SO Host', ruleName: 'SecondOrderComp' });
        expect(result.hostArtefacts.length).toBeGreaterThan(0);
        expect(result.derivedRules.length).toBe(1);

        const dr = result.derivedRules[0];
        expect(dr.drawing.isRule).toBe(false);
        expect(dr.drawing.getArtefacts().some(a => a.data.label === 'sh')).toBe(false);
        expect(host.getArtefacts().some(a => a.data.label === 'sh' && a.layerId === 'root')).toBe(true);

        const hostMonoArtefacts = host.getArtefacts().filter(a => a.sortName === 'isMono');
        expect(hostMonoArtefacts.length).toBe(1);
        expect(hostMonoArtefacts[0].layerId).toBe('root');
        const arrow = hostMonoArtefacts[0].dependencies['arrow'];
        expect(arrow.data.label).toBe('he1');
        expect(dr.drawing.getArtefacts().filter(a => a.sortName === 'isMono').length).toBe(0);
    });
});

describe('rules with an empty root layer', () => {
    it('matches exactly once in any drawing and applies its conclusion', () => {
        const rule = makeDrawing();
        rule.addLayer('conclusion', 'Conclusion', 'root');
        const cv0 = rule.newArtefact('Vertex', {}, { position: [0, 0], label: 'cv0' }, 'conclusion');
        const cv1 = rule.newArtefact('Vertex', {}, { position: [1, 0], label: 'cv1' }, 'conclusion');
        rule.newArtefact('Edge', { source: cv0, target: cv1 }, { width: 2, bend: 0, label: 'ce' }, 'conclusion');
        rule.setIsRule(true);

        const emptyHost = makeDrawing();
        const emptyApps = findFirstOrderRuleApplications(rule, emptyHost);
        expect(emptyApps.length).toBe(1);
        expect(emptyApps[0].matchedArtefacts.size).toBe(0);
        expect(emptyApps[0].hostArtefacts.size).toBe(0);

        const { host } = buildComposableHost();
        const apps = findFirstOrderRuleApplications(rule, host);
        expect(apps.length).toBe(1);

        const applied = applyFirstOrderRule(rule, host, apps[0]).artefacts;
        expect(applied.some(a => a.data.label === 'ce' && a.layerId === 'root')).toBe(true);
    });
});

describe('rule structure restrictions', () => {
    it('rejects a rule whose child of the root has 2 children', () => {
        const drawing = makeDrawing();
        makeVertex(drawing, 'bv0');
        drawing.addLayer('bad-conclusion', 'Bad Conclusion', 'root');
        drawing.addLayer('bad-a', 'Bad A', 'root');
        drawing.addLayer('bad-b1', 'Bad B1', 'bad-a');
        drawing.addLayer('bad-b2', 'Bad B2', 'bad-a');

        expect(drawing.checkRuleConditions().isRule).toBe(false);
        expect(() => drawing.setIsRule(true)).toThrowError(/Consistency Check Failed/);
    });
});

describe('matching up to host equalities', () => {
    it('matches hosts with a truly shared edge and provably equal edges, but not distinct edges', () => {
        const rule = buildSharedEdgeTrianglesRule();

        const hostShared = makeDrawing();
        buildTrianglePairHost(hostShared, 'shared');

        const hostEqualEdges = makeDrawing();
        buildTrianglePairHost(hostEqualEdges, 'equal');

        const hostDistinctEdges = makeDrawing();
        buildTrianglePairHost(hostDistinctEdges, 'distinct');

        expect(findRuleApplications(rule, hostShared).length).toBe(2);
        expect(findRuleApplications(rule, hostEqualEdges).length).toBe(2);
        expect(findRuleApplications(rule, hostDistinctEdges).length).toBe(0);
    });
});
