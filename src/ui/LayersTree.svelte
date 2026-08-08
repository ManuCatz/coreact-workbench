<script lang="ts">
    import type { Layer } from '../index';
    import { allLayers } from './store';
    import { addRootLayer } from './store';
    import LayerNode from './LayerNode.svelte';

    let rootLayers: Layer[] = [];

    $: rootLayers = $allLayers.filter(l => l.parentId === null);
</script>

<div class="layers-tree-container">
    <div class="panel-header">
        <h3>Layers Tree</h3>
        <button class="layer-btn" title="Add new root layer" onclick={() => addRootLayer()}>+ Root Layer</button>
    </div>
    {#each rootLayers as rootLayer}
        <LayerNode layer={rootLayer} />
    {/each}
</div>
