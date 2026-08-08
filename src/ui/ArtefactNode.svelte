<script lang="ts">
    import type { Artefact, Layer } from '../index';
    import { drawing } from './store';
    import {
        mergeMode,
        mergeFirstArtefact,
        mergeSecondArtefact,
        mergeHoverArtefact,
        inspectedArtefact,
        menuHoverArtefact
    } from './store';
    import {
        getArtefactLabel,
        equalityChildren,
        activeFlagsLabel,
        mergeBaseOpacityFor,
        isProvablyEqualCandidate,
        onArtefactNodeClick,
        removeArtefactNode
    } from './store';
    import ArtefactNode from './ArtefactNode.svelte';

    export let artefact: Artefact;
    export let dependencyKey: string | null = null;
    export let isTagGroupCtx: string | null = null;
    export let parentArtefact: Artefact | null = null;
    export let rootNode = false;

    let expanded = false;

    let children: Artefact[] = [];
    let baseLabel = '';
    let equalitySuffix = '';
    let flags: string[] = [];
    let flagSuffix = '';
    let prefix = '';
    let layerObj: Layer | null | undefined;
    let isLayerVis = true;
    let layerBadgeText = '';
    let provablyEqualCandidate = false;
    let inspectedNode = false;
    let nodeOpacity = 1;
    let depEntries: [string, Artefact][] = [];
    let flagEntries: [string, boolean][] = [];

    $: children = equalityChildren(artefact);
    $: baseLabel = getArtefactLabel(artefact);
    $: equalitySuffix = artefact.sortName === 'Equality' && children.length > 0 ? ` [${children[0].sortName}]` : '';
    $: flags = activeFlagsLabel(artefact);
    $: flagSuffix = flags.length > 0 ? ` (${flags.join(', ')})` : '';
    $: prefix = dependencyKey ? `${dependencyKey}: ` : '';
    $: layerObj = drawing.getLayer(artefact.layerId);
    $: isLayerVis = layerObj ? drawing.isLayerVisible(layerObj.id) : true;
    $: layerBadgeText = layerObj ? layerObj.name + (isLayerVis ? '' : ' (hidden)') : artefact.layerId;
    $: provablyEqualCandidate = isProvablyEqualCandidate(artefact);
    $: inspectedNode =
        $inspectedArtefact === artefact
        || ($mergeMode && ($mergeFirstArtefact === artefact || $mergeSecondArtefact === artefact));

    $: depEntries = (Object.entries(artefact.dependencies) as [string, Artefact | boolean][]).filter(
        (entry): entry is [string, Artefact] => typeof entry[1] !== 'boolean'
    );
    $: flagEntries = (Object.entries(artefact.dependencies) as [string, Artefact | boolean][]).filter(
        (entry): entry is [string, boolean] => entry[1] === true
    );

    $: {
        if ($mergeMode) {
            const hoveredSet = $mergeHoverArtefact ? $mergeHoverArtefact.getSelfAndDependencies() : null;
            if (hoveredSet && hoveredSet.has(artefact)) {
                nodeOpacity = 1;
            } else if (hoveredSet) {
                nodeOpacity = 0.5;
            } else {
                nodeOpacity = mergeBaseOpacityFor(artefact);
            }
        } else {
            const target = $menuHoverArtefact ?? $inspectedArtefact;
            if (target) {
                nodeOpacity = target.getSelfAndDependencies().has(artefact) ? 1 : 0.5;
            } else {
                nodeOpacity = 1;
            }
        }
    }

    function onHeaderMouseEnter(): void {
        if ($mergeMode) {
            mergeHoverArtefact.set(artefact);
        } else {
            menuHoverArtefact.set(artefact);
        }
    }

    function onHeaderMouseLeave(): void {
        if ($mergeMode) {
            mergeHoverArtefact.set(null);
        } else {
            menuHoverArtefact.set(null);
        }
    }

    function onHeaderClick(): void {
        onArtefactNodeClick(artefact);
    }

    function onRemove(): void {
        removeArtefactNode(artefact, parentArtefact, isTagGroupCtx);
    }
</script>

<div
    class="tree-node {provablyEqualCandidate ? 'provably-equal' : ''} {inspectedNode ? 'inspected' : ''}"
    class:expanded={expanded}
    class:root-node={rootNode}
    style="opacity: {nodeOpacity};"
>
    <div
        class="node-header"
        role="button"
        tabindex="0"
        onmouseenter={onHeaderMouseEnter}
        onmouseleave={onHeaderMouseLeave}
    >
        <span
            class="toggle-icon"
            role="button"
            tabindex="0"
            aria-label={expanded ? 'Collapse children' : 'Expand children'}
            onclick={(e) => {
                e.stopPropagation();
                expanded = !expanded;
            }}
            onkeydown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    e.stopPropagation();
                    expanded = !expanded;
                }
            }}
        ></span>
        <span
            class="node-label"
            role="button"
            tabindex="0"
            onclick={(e) => {
                e.stopPropagation();
                onHeaderClick();
            }}
            onkeydown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    e.stopPropagation();
                    onHeaderClick();
                }
            }}
        >{prefix}{baseLabel}{equalitySuffix}{flagSuffix}</span>
        {#if artefact.sortName === 'Equality' || layerBadgeText}
            <span class="layer-badge" style={!isLayerVis ? 'background-color: #f5b7b1; color: #78281f;' : ''}>
                {layerBadgeText}
            </span>
        {/if}
        {#if provablyEqualCandidate}
            <span class="eq-badge" title="Provably equal (via equality artefacts)">≡</span>
        {/if}
        <span
            class="remove-btn"
            role="button"
            tabindex="0"
            title={isTagGroupCtx ? `Remove tag '${isTagGroupCtx}'` : 'Remove artefact'}
            aria-label={isTagGroupCtx ? `Remove tag '${isTagGroupCtx}'` : 'Remove artefact'}
            onclick={(e) => {
                e.stopPropagation();
                onRemove();
            }}
            onkeydown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    e.stopPropagation();
                    onRemove();
                }
            }}
        >×</span>
    </div>

    {#if artefact && artefact.data}
        {#if Object.keys(artefact.dependencies).length > 0}
            <div class="node-children">
                {#each depEntries as [depKey, depArt]}
                    <ArtefactNode artefact={depArt} dependencyKey={depKey} parentArtefact={artefact} />
                {/each}
                {#each flagEntries as [flagKey]}
                    <div class="tree-node empty">
                        <div class="node-header">
                            <span class="toggle-icon"></span>
                            <span class="node-label">{flagKey}</span>
                            <span
                                class="remove-btn"
                                role="button"
                                tabindex="0"
                                title={`Remove tag '${flagKey}'`}
                                aria-label={`Remove tag '${flagKey}'`}
                                onclick={(e) => {
                                    e.stopPropagation();
                                    removeArtefactNode(artefact, null, flagKey);
                                }}
                                onkeydown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        removeArtefactNode(artefact, null, flagKey);
                                    }
                                }}
                            >×</span>
                        </div>
                    </div>
                {/each}
            </div>
        {/if}
    {/if}
</div>
