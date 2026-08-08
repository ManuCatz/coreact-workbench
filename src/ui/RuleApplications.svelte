<script lang="ts">
    import type { Artefact } from '../index';
    import { get } from 'svelte/store';
    import { computeRuleApplications, applyRuleAt, mergeMode, version } from './store';
    import { drawing } from './store';

    let entries: ReturnType<typeof computeRuleApplications> = [];
    $: $version, entries = computeRuleApplications();

    function matchLabels(entry: (typeof entries)[number], app: (typeof entry.applications)[number]): string[] {
        const ruleDrawing = entry.ruleDrawing;
        const ruleRootId = ruleDrawing.getAllLayers().find(l => l.parentId === null)?.id;
        const patternArts = ruleRootId
            ? ruleDrawing.getArtefacts().filter(a => a.sortName !== 'Equality' && a.layerId === ruleRootId)
            : ruleDrawing.getArtefacts().filter(a => a.sortName !== 'Equality');
        const dependedOn = new Set<Artefact>();
        for (const a of patternArts) {
            for (const dep of Object.values(a.dependencies)) {
                if (typeof dep !== 'boolean') {
                    dependedOn.add(dep);
                }
            }
        }
        const topLevel = patternArts.filter(a => !dependedOn.has(a));
        const matchArtefacts = topLevel.length > 0 ? topLevel : patternArts;
        const labels: string[] = [];
        for (const a of matchArtefacts) {
            const img = app.matchedArtefacts.get(a);
            if (img) {
                labels.push(img.data.label || img.sortName);
            }
        }
        return labels;
    }

    function onApply(entry: (typeof entries)[number], index: number): void {
        applyRuleAt(entry.savedRule.name, index);
    }

    function onHover(activeSet: Set<Artefact>): void {
        if (get(mergeMode)) return;
        for (const art of drawing.getArtefacts()) {
            const opacity = activeSet.has(art) ? 1 : 0.5;
            if (art.svgElement) {
                art.svgElement.attr('opacity', opacity);
            }
        }
    }

    function onLeave(): void {
        for (const art of drawing.getArtefacts()) {
            if (art.svgElement) {
                art.svgElement.attr('opacity', 1);
            }
        }
    }
</script>

{#each entries as entry (entry.savedRule.name)}
    {#each entry.applications as app, index (entry.savedRule.name + '-' + index)}
        {@const savedRule = entry.savedRule}
        {@const labels = matchLabels(entry, app)}
        <div
            role="group"
            class:first-order={savedRule.isFirstOrder}
            class:second-order={!savedRule.isFirstOrder}
            class="rule-app-row"
            onmouseenter={() => onHover(app.hostArtefacts)}
            onmouseleave={onLeave}
        >
            <div class="rule-app-name">
                {savedRule.name}
                {#if savedRule.isFirstOrder}
                    <span class="first-order-badge" title="First-order rule: root layer has only one child">First-Order</span>
                {:else}
                    <span class="second-order-badge" title="Second-order rule: root layer has several child layers">Second-Order</span>
                {/if}
            </div>
            <div class="rule-app-match">{labels.length > 0 ? labels.join(', ') : '(no labelled artefacts)'}</div>
            <button
                class="apply-btn"
                title={savedRule.isFirstOrder ? 'Apply this first-order rule to the matched artefacts' : 'Apply this second-order rule to the matched artefacts'}
                onclick={(e) => {
                    e.stopPropagation();
                    onApply(entry, index);
                }}
            >Apply</button>
        </div>
    {/each}
{/each}
