<script lang="ts">
    import type { Layer } from '../index';
    import { drawing, allLayers, layerProvability } from './store';
    import {
        toggleLayerVisibility,
        toggleLayerFocus,
        setLayerColor,
        toggleLayerColorEnabled,
        addChildLayer,
        renameLayer,
        deleteLayer,
        checkLayerProvable
    } from './store';
    import LayerNode from './LayerNode.svelte';

    export let layer: Layer;

    let childLayers: Layer[] = [];
    let focusedId: string | null = null;
    let isEffectivelyVisible = true;
    let provableResult: { provable: boolean; reason: string } | undefined;

    $: childLayers = $allLayers.filter(l => l.parentId === layer.id);
    $: focusedId = drawing.getFocusedLayerId();
    $: isEffectivelyVisible = drawing.isLayerVisible(layer.id);
    $: provableResult = $layerProvability.get(layer.id);
</script>

<div class="layer-item {layer.parentId === null ? 'root-layer' : ''}">
    <div
        class="layer-row {focusedId === layer.id ? 'focused' : ''} {!isEffectivelyVisible ? 'layer-hidden' : ''}"
    >
        <div class="layer-row-header">
            <span class="layer-title" title="ID: {layer.id}{!isEffectivelyVisible ? ' (hidden)' : ''}">
                {layer.name}
            </span>
            {#if provableResult}
                <span
                    class="provable-badge {provableResult.provable ? 'provable-ok' : 'provable-fail'}"
                    title={provableResult.provable
                        ? 'Provable: all artefacts in this layer are already in its parent layer'
                        : `Not provable: ${provableResult.reason}`}
                >{provableResult.provable ? '✓' : '✗'}</span>
            {/if}
        </div>
        <div class="layer-row-actions">
            <button
                class="layer-btn hide-btn {!layer.visible ? 'active' : ''}"
                title={layer.visible
                    ? (isEffectivelyVisible ? 'Hide this layer on canvas' : 'Hide layer (hidden by parent)')
                    : 'Show this layer on canvas'}
                onclick={() => toggleLayerVisibility(layer)}
            >{layer.visible ? 'Hide' : 'Show'}</button>
            <button
                class="layer-btn focus-btn {focusedId === layer.id ? 'active' : ''}"
                title="Focus on this layer (dims other layers to 50% opacity)"
                onclick={() => toggleLayerFocus(layer.id)}
            >{focusedId === layer.id ? 'Focusing' : 'Focus'}</button>
            <button class="layer-btn" title={`Rename layer '${layer.name}'`} onclick={() => renameLayer(layer)}>
                Rename
            </button>
            {#if layer.parentId !== null}
                <button
                    class="layer-btn provable-btn"
                    title="Check if all artefacts in this layer are already in its parent layer"
                    onclick={() => checkLayerProvable(layer.id)}
                >Prove</button>
            {/if}
            <input
                type="checkbox"
                checked={layer.colorEnabled}
                title="Toggle partial layer color"
                onchange={(e) => toggleLayerColorEnabled(layer, e.currentTarget.checked)}
            />
            <input
                type="color"
                class="layer-color-input"
                value={layer.color}
                title="Choose layer color"
                onchange={(e) => setLayerColor(layer, e.currentTarget.value)}
            />
            <button class="layer-btn" title={`Add a child layer above '${layer.name}'`} onclick={() => addChildLayer(layer)}>
                + Child
            </button>
            <button
                class="layer-btn"
                style="color: #e74c3c;"
                title="Delete layer and all its child layers & artefacts"
                onclick={() => deleteLayer(layer)}
            >×</button>
        </div>
    </div>

    {#if childLayers.length > 0}
        <div class="layer-children">
            {#each childLayers as child}
                <LayerNode layer={child} />
            {/each}
        </div>
    {/if}
</div>
