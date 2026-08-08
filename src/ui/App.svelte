<script lang="ts">
    import { get } from 'svelte/store';
    import Canvas from './Canvas.svelte';
    import LayersTree from './LayersTree.svelte';
    import ArtefactMenu from './ArtefactMenu.svelte';
    import DrawingsStorePanel from './DrawingsStorePanel.svelte';
    import Inspector from './Inspector.svelte';
    import RuleApplications from './RuleApplications.svelte';
    import { loadSortScript, clearAll, mergeMode, startMergeMode, cancelMergeMode, inspectedArtefact, refresh } from './store';

    let scriptUpload: HTMLInputElement;

    function onLoadScript(): void {
        scriptUpload.click();
    }

    function onScriptChange(event: Event): void {
        const target = event.currentTarget as HTMLInputElement;
        const file = target.files?.[0];
        if (file) {
            loadSortScript(file);
        }
        target.value = '';
    }

    function onMergeClick(): void {
        if (get(mergeMode)) {
            cancelMergeMode();
        } else {
            startMergeMode(get(inspectedArtefact));
        }
    }
</script>

<div id="app">
    <div id="menu">
        <div class="menu-header">
            <h2>Layers & Artefacts</h2>
            <div class="menu-header-actions">
                <button
                    class="btn"
                    id="load-script-btn"
                    title="Load JS script to define sorts"
                    onclick={onLoadScript}
                >Load Sorts</button>
                <button
                    class="btn btn-cancel"
                    id="clear-btn"
                    title="Clear all artefacts and layers"
                    onclick={() => clearAll()}
                >Clear All</button>
                <input bind:this={scriptUpload} type="file" id="script-upload" accept=".js" style="display: none;" onchange={onScriptChange} />
            </div>
        </div>

        <DrawingsStorePanel />

        <LayersTree />

        <div class="artefacts-header">
            <h3 class="panel-subtitle">Artefacts</h3>
            <button
                class="layer-btn merge-btn"
                id="merge-artefacts-btn"
                title="Merge two artefacts with identical dependencies"
                onclick={onMergeClick}
            >Merge</button>
        </div>
        <ArtefactMenu />
    </div>

    <Canvas />

    <div id="inspector">
        <h2>Inspector</h2>
        <Inspector />
    </div>

    <div id="rules-panel">
        <div class="rules-header">
            <h2>Applyable Rules</h2>
            <button class="layer-btn" id="refresh-rules-btn" title="Refresh applyable rules list" onclick={() => refresh()}>Refresh</button>
        </div>
        <div id="rules-content">
            <RuleApplications />
        </div>
    </div>
</div>
