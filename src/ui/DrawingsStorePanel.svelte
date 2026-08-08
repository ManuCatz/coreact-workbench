<script lang="ts">
    import type { SavedDrawing } from '../index';
    import {
        activeDrawingName,
        allDrawings,
        exportSelection,
        isCurrentDrawingRule,
        rocqRecordingActive,
        ruleTag
    } from './store';
    import {
        saveActiveDrawing,
        newDrawing,
        importDrawingsFile,
        downloadDrawingsJson,
        copyRocqExport,
        loadDrawingByName,
        deleteSelectedDrawings,
        renameDrawingName,
        markDrawingAsRule,
        setCurrentDrawingRule,
        toggleRocqRecording,
        toggleExportSelection,
        setExportSelectionAll,
        getSelectedDrawingNames
    } from './store';

    let importInput: HTMLInputElement;

    function onImportFile(event: Event): void {
        const target = event.currentTarget as HTMLInputElement;
        const file = target.files?.[0];
        if (file) {
            importDrawingsFile(file);
        }
        target.value = '';
    }

    function onExportJson(): void {
        const names = getSelectedDrawingNames();
        if (names.length === 0) {
            alert('Select at least one drawing to export.');
            return;
        }
        downloadDrawingsJson(names);
    }

    function onRocqExport(): void {
        const names = getSelectedDrawingNames();
        if (names.length === 0) {
            alert('Select at least one drawing to export.');
            return;
        }
        copyRocqExport(names);
    }

    function onRename(saved: SavedDrawing): void {
        const newName = prompt(`Enter new name for drawing '${saved.name}':`, saved.name);
        if (!newName || !newName.trim() || newName.trim() === saved.name) return;
        renameDrawingName(saved.name, newName.trim());
    }

    function onToggleRule(saved: SavedDrawing): void {
        markDrawingAsRule(saved.name, !saved.isRule);
    }

    function onDelete(saved: SavedDrawing): void {
        deleteSelectedDrawings([saved.name]);
    }
</script>

<div class="drawings-container">
    <div class="drawings-header">
        <h3 class="panel-subtitle">Drawing Store</h3>
        <div class="drawings-actions">
            <input
                type="checkbox"
                title="Select all drawings for export"
                checked={$exportSelection.size === $allDrawings.length && $allDrawings.length > 0}
                onchange={(e) => setExportSelectionAll((e.currentTarget as HTMLInputElement).checked)}
            />
            <button class="layer-btn new-btn" title="Start a new blank drawing" onclick={newDrawing}>New</button>
            <button class="layer-btn" title="Import one or more drawings from a JSON file" onclick={() => importInput.click()}>Import</button>
            <button class="layer-btn" title="Export the checked drawings to a JSON file" onclick={onExportJson}>Export</button>
            <button class="layer-btn" title="Copy the checked drawings to the clipboard as Rocq code" onclick={onRocqExport}>Rocq</button>
            <button
                class="layer-btn rocq-rec-btn"
                title="Start or stop Rocq recording for the active drawing"
                onclick={toggleRocqRecording}
            >
                {$rocqRecordingActive ? 'Stop recording' : 'Rocq recording'}
            </button>
            <button class="layer-btn" title="Save current drawing" onclick={saveActiveDrawing}>Save</button>
            <button
                class="layer-btn"
                title="Delete the checked drawings"
                onclick={() => deleteSelectedDrawings(getSelectedDrawingNames())}
            >Delete</button>
            <input
                bind:this={importInput}
                type="file"
                accept=".json"
                style="display: none;"
                onchange={onImportFile}
            />
        </div>
    </div>

    <div class="current-drawing-banner">
        <span style="color: #555;">
            Editing: <strong style="color: #2c3e50;">{$activeDrawingName ?? 'Unsaved Drawing'}</strong>
        </span>
        <label
            class="rule-checkbox-label"
            title="Explicitly mark the current drawing as a rule (must satisfy rule conditions)"
        >
            <input type="checkbox" checked={$isCurrentDrawingRule} onchange={(e) => setCurrentDrawingRule((e.currentTarget as HTMLInputElement).checked)} />
            Rule
        </label>
        {#if $ruleTag}
            {#if $ruleTag.kind === 'invalid'}
                <span class="rule-badge rule-badge-invalid" title={$ruleTag.reason}>Invalid Rule</span>
            {:else if $ruleTag.kind === 'first'}
                <span class="first-order-badge" title="First-order rule: root layer has only one child">First-Order</span>
            {:else}
                <span class="second-order-badge" title="Second-order rule: root layer has several child layers">Second-Order</span>
            {/if}
        {/if}
    </div>

    {#if $allDrawings.length === 0}
        <div class="empty-msg">No drawings saved yet.</div>
    {:else}
        {#each $allDrawings as savedDrawing (savedDrawing.name)}
            {@const isActive = savedDrawing.name === $activeDrawingName}
            <div
                class:active={isActive}
                class:first-order={savedDrawing.isFirstOrder}
                class="drawing-row"
            >
                <div class="drawing-row-header">
                    <input
                        type="checkbox"
                        class="export-checkbox"
                        title="Include '{savedDrawing.name}' in the next export"
                        checked={$exportSelection.has(savedDrawing.name)}
                        onchange={() => toggleExportSelection(savedDrawing.name)}
                    />
                    <span
                        class="drawing-title"
                        title="Drawing: {savedDrawing.name} ({savedDrawing.layers.length} layers, {savedDrawing.artefacts.length} artefacts){savedDrawing.isRule ? (savedDrawing.isFirstOrder ? ' [First-Order Rule]' : ' [Rule]') : ''}"
                    >{savedDrawing.name}</span>
                    {#if isActive}
                        <span class="active-badge" title="Currently active on canvas">Editing</span>
                    {/if}
                    {#if savedDrawing.isRule}
                        {#if savedDrawing.isFirstOrder}
                            <span class="first-order-badge" title="First-order rule: root layer has only one child">First-Order</span>
                        {:else}
                            <span class="second-order-badge" title="Second-order rule: root layer has several child layers">Second-Order</span>
                        {/if}
                    {/if}
                </div>
                <div class="drawing-row-actions">
                    <button class="layer-btn" title="Load drawing '{savedDrawing.name}' to edit further" onclick={() => loadDrawingByName(savedDrawing.name)}>Load</button>
                    <button class="layer-btn" title="Rename drawing '{savedDrawing.name}'" onclick={() => onRename(savedDrawing)}>Rename</button>
                    <button class="layer-btn" title={savedDrawing.isRule ? 'Remove the explicit rule marking from this drawing' : 'Explicitly mark this drawing as a rule (must satisfy rule conditions)'} onclick={() => onToggleRule(savedDrawing)}>
                        {savedDrawing.isRule ? 'Unmark Rule' : 'Mark Rule'}
                    </button>
                    <button class="layer-btn delete-btn" title="Delete drawing '{savedDrawing.name}'" onclick={() => onDelete(savedDrawing)}>×</button>
                </div>
            </div>
        {/each}
    {/if}
</div>
