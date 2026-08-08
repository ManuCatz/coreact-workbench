<script lang="ts">
    import type { Artefact, SortDefinition } from '../index';
    import { sortStore, drawing, allArtefacts } from './store';
    import { startDraftForSort } from './store';
    import ArtefactNode from './ArtefactNode.svelte';

    let sortDefs: SortDefinition[] = [];
    let grouped: Record<string, Artefact[]> = {};
    let focusedId: string | null = null;
    let tagGroups: Record<string, Artefact[]> = {};

    $: {
        $allArtefacts;
        sortDefs = sortStore.getAllSorts();
        focusedId = drawing.getFocusedLayerId();
        grouped = $allArtefacts.reduce((acc, artefact) => {
            if (!acc[artefact.sortName]) acc[artefact.sortName] = [];
            acc[artefact.sortName].push(artefact);
            return acc;
        }, {} as Record<string, Artefact[]>);
        tagGroups = $allArtefacts.reduce((acc, artefact) => {
            for (const [key, val] of Object.entries(artefact.dependencies)) {
                if (val === true) {
                    if (!acc[key]) acc[key] = [];
                    acc[key].push(artefact);
                }
            }
            return acc;
        }, {} as Record<string, Artefact[]>);
    }
</script>

{#each sortDefs as sortDef (sortDef.name)}
    {@const artefacts = grouped[sortDef.name] || []}
    {@const topLevelArtefacts = focusedId ? artefacts.filter(a => a.layerId === focusedId) : artefacts}
    <h3>
        <span>{sortDef.name} ({topLevelArtefacts.length})</span>
        <button class="add-sort-btn" title={`Add new ${sortDef.name}`} onclick={() => startDraftForSort(sortDef)}>+</button>
    </h3>
    {#each topLevelArtefacts as art}
        <ArtefactNode artefact={art} rootNode />
    {/each}
{/each}

{#each Object.entries(tagGroups) as [tagName, artefacts]}
    {@const topLevelTagArtefacts = focusedId
        ? artefacts.filter(art => art.layerId === focusedId || (focusedId !== null && art.getEffectiveFlagLayers().has(focusedId)))
        : artefacts}
    {#if !focusedId || topLevelTagArtefacts.length > 0}
        <h3>{tagName} ({topLevelTagArtefacts.length})</h3>
        {#each topLevelTagArtefacts as art}
            <ArtefactNode artefact={art} isTagGroupCtx={tagName} rootNode />
        {/each}
    {/if}
{/each}
