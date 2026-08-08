<script lang="ts">
    import type { Artefact } from '../index';
    import { drawing, sortStore } from './store';
    import {
        mergeMode,
        mergeFirstArtefact,
        mergeSecondArtefact,
        mergePickingFor,
        draftArtefact,
        dependencyPickingFor,
        inspectedArtefact
    } from './store';
    import {
        cancelMergeMode,
        performMerge,
        cancelDraft,
        createDraftArtefact,
        isDraftComplete,
        setDraftLayer,
        setDraftDataField,
        setDraftFlagLayer,
        toggleDraftFlag,
        setArtefactLayer,
        setInspectedLabel,
        setArtefactDataField,
        setArtefactFlag,
        setArtefactFlagLayer,
        startMergeMode,
        togglePositionPicker,
        isPositionPickerActive,
        flagLayerCandidates,
        equalityChildren
    } from './store';

    // --- Merge view helpers ---
    let orderedCandidates: Artefact[] = [];
    let provablyEqualCandidates: Artefact[] = [];
    let otherCandidates: Artefact[] = [];
    let mergePreviewLabel = '';

    $: {
        const first = $mergeFirstArtefact;
        if (first) {
            const candidates = drawing.getArtefacts().filter(art =>
                art !== first && drawing.areDependenciesEqual(first, art)
            );
            provablyEqualCandidates = candidates.filter(c => drawing.areProvablyEqual(first, c));
            otherCandidates = candidates.filter(c => !drawing.areProvablyEqual(first, c));
            orderedCandidates = [...provablyEqualCandidates, ...otherCandidates];
        } else {
            provablyEqualCandidates = [];
            otherCandidates = [];
            orderedCandidates = [];
        }
    }

    $: {
        const label1 = $mergeFirstArtefact && typeof $mergeFirstArtefact.data.label === 'string'
            ? ($mergeFirstArtefact.data.label as string).trim()
            : '';
        const label2 = $mergeSecondArtefact && typeof $mergeSecondArtefact.data.label === 'string'
            ? ($mergeSecondArtefact.data.label as string).trim()
            : '';
        if (label1 && label2) mergePreviewLabel = `${label1}, ${label2}`;
        else if (label1) mergePreviewLabel = label1;
        else if (label2) mergePreviewLabel = label2;
        else mergePreviewLabel = '';
    }

    let secondSelectIndex: number;
    $: secondSelectIndex = $mergeSecondArtefact ? orderedCandidates.indexOf($mergeSecondArtefact) : -1;

    $: canMerge = !!($mergeFirstArtefact && $mergeSecondArtefact
        && $mergeFirstArtefact !== $mergeSecondArtefact
        && drawing.areDependenciesEqual($mergeFirstArtefact, $mergeSecondArtefact));

    function toggleMergeFirst(): void {
        mergePickingFor.set($mergePickingFor === 'first' ? null : 'first');
    }

    function toggleMergeSecond(): void {
        mergePickingFor.set($mergePickingFor === 'second' ? null : 'second');
    }

    function onMergeSecondSelect(e: Event): void {
        const val = (e.currentTarget as HTMLSelectElement).value;
        if (val !== '') {
            mergeSecondArtefact.set(orderedCandidates[parseInt(val, 10)]);
            mergePickingFor.set(null);
        } else {
            mergeSecondArtefact.set(null);
        }
    }

    function candidateOptionText(cand: Artefact): string {
        const layerObj = drawing.getLayer(cand.layerId);
        return `${cand.data.label || '(unnamed)'} (${cand.sortName} in '${layerObj ? layerObj.name : cand.layerId}')`;
    }

    function toggleDraftPicking(): void {
        dependencyPickingFor.set($dependencyPickingFor === 'Equality' ? null : 'Equality');
    }

    function toggleDepPicking(depKey: string): void {
        dependencyPickingFor.set($dependencyPickingFor === depKey ? null : depKey);
    }

    function updateDraftPosition(attrName: string, newVal: number, axis: 0 | 1): void {
        const draft = $draftArtefact;
        if (!draft) return;
        const current = Array.isArray(draft.data[attrName]) ? draft.data[attrName] as number[] : [0, 0];
        const next = axis === 0 ? [newVal, current[1]] : [current[0], newVal];
        if (!Number.isNaN(next[0]) && !Number.isNaN(next[1])) {
            setDraftDataField(attrName, next);
        }
    }

    function updateInspectPosition(art: Artefact, attrName: string, newVal: number, axis: 0 | 1): void {
        const current = Array.isArray(art.data[attrName]) ? art.data[attrName] as number[] : [0, 0];
        const next = axis === 0 ? [newVal, current[1]] : [current[0], newVal];
        if (!Number.isNaN(next[0]) && !Number.isNaN(next[1])) {
            setArtefactDataField(art, attrName, next);
        }
    }
</script>

<!-- ================= Merge Mode View ================= -->
{#if $mergeMode}
    <h3 style="margin-top: 0;">Merge Artefacts</h3>
    <p style="color: #666; font-size: 0.82rem; margin-top: 4px; margin-bottom: 12px;">
        Select two artefacts of the same sort with identical dependencies to merge them.
    </p>

    <div>
        <div class="form-group">
            <label for="merge-first-btn">1st Artefact (to be removed)</label>
            <button
                id="merge-first-btn"
                type="button"
                class="pick-dep-btn {$mergePickingFor === 'first' ? 'active' : ''}"
                onclick={toggleMergeFirst}
            >
                {#if $mergeFirstArtefact}
                    1st: {$mergeFirstArtefact.data.label || '(unnamed)'} ({$mergeFirstArtefact.sortName})
                {:else if $mergePickingFor === 'first'}
                    Click artefact in tree...
                {:else}
                    Pick 1st Artefact
                {/if}
            </button>
        </div>

        <div class="form-group">
            <label for="merge-second-select">2nd Artefact (datafields kept)</label>
            {#if $mergeFirstArtefact}
                {#if orderedCandidates.length === 0}
                    <div style="font-size: 0.8rem; color: #e74c3c; font-style: italic; margin-top: 4px;">
                        No other artefacts with matching dependencies found.
                    </div>
                {:else}
                    <select id="merge-second-select" value={secondSelectIndex >= 0 ? String(secondSelectIndex) : ''} onchange={onMergeSecondSelect}>
                        <option value="">-- Select 2nd Artefact --</option>
                        {#if provablyEqualCandidates.length > 0}
                            <optgroup label="≡ Provably equal (via equality artefacts)">
                                {#each provablyEqualCandidates as cand}
                                    <option
                                        value={orderedCandidates.indexOf(cand)}
                                        style="color: #8e44ad; font-weight: bold;"
                                    >≡ {candidateOptionText(cand)} (proven equal)</option>
                                {/each}
                            </optgroup>
                        {/if}
                        {#if otherCandidates.length > 0}
                            <optgroup label="Other candidates">
                                {#each otherCandidates as cand}
                                    <option value={orderedCandidates.indexOf(cand)}>{candidateOptionText(cand)}</option>
                                {/each}
                            </optgroup>
                        {/if}
                    </select>
                {/if}
                <button
                    type="button"
                    class="pick-dep-btn {$mergePickingFor === 'second' ? 'active' : ''}"
                    style="margin-top: 6px;"
                    onclick={toggleMergeSecond}
                >
                    {#if $mergeSecondArtefact}
                        2nd: {$mergeSecondArtefact.data.label || '(unnamed)'} ({$mergeSecondArtefact.sortName})
                    {:else if $mergePickingFor === 'second'}
                        Click candidate in tree...
                    {:else}
                        Or Pick in Tree/Canvas
                    {/if}
                </button>
            {:else}
                <div style="font-size: 0.8rem; color: #888; font-style: italic;">
                    Select 1st artefact first.
                </div>
            {/if}
        </div>

        {#if $mergeFirstArtefact && $mergeSecondArtefact}
            <div class="merge-preview-box">
                <strong style="color: #8e44ad;">Merge Result Preview:</strong><br/>
                • Datafields kept from: <strong>{$mergeSecondArtefact.data.label || $mergeSecondArtefact.sortName}</strong><br/>
                • New Label: <strong>{mergePreviewLabel || '(none)'}</strong>
            </div>
        {/if}

        <div class="action-btns">
            <button type="button" class="btn btn-cancel" onclick={cancelMergeMode}>Cancel</button>
            <button type="button" class="btn btn-merge" disabled={!canMerge} onclick={performMerge}>Merge</button>
        </div>
    </div>

<!-- ================= Draft (Creation) View ================= -->
{:else if $draftArtefact}
    {@const draft = $draftArtefact}
    {@const draftSortDef = sortStore.getSort(draft.sortName)}
    {@const draftProxy = { data: draft.data } as Artefact}
    {#if draftSortDef}
        {@const nonFlagDeps = Object.entries(draftSortDef.dependencies).filter(([_, expected]) => expected !== 'flag')}
        {@const flagDeps = Object.entries(draftSortDef.dependencies).filter(([_, expected]) => expected === 'flag')}
        <h3 style="margin-top: 0;">New {draft.sortName}</h3>

        <div>
            <div class="form-group">
                <label for="draft-layer-select">Layer</label>
                <select
                    id="draft-layer-select"
                    value={draft.layerId}
                    onchange={(e) => setDraftLayer((e.currentTarget as HTMLSelectElement).value)}
                >
                    {#each drawing.getAllLayers() as l}
                        <option value={l.id}>{l.name}</option>
                    {/each}
                </select>
            </div>

            {#if draft.sortName === 'Equality'}
                <h4 style="margin: 10px 0 5px 0; font-size: 0.95rem; color: #444;">Equalized Artefacts (pick >= 2 of same sort)</h4>
                {#each equalityChildren(draft) as item}
                    <div style="font-size: 0.85rem; margin: 3px 0;">• {item.data.label || item.sortName} ({item.sortName})</div>
                {/each}
                <button
                    type="button"
                    class="pick-dep-btn {$dependencyPickingFor === 'Equality' ? 'active' : ''}"
                    onclick={toggleDraftPicking}
                >
                    {$dependencyPickingFor === 'Equality' ? 'Click artefact in tree...' : '+ Pick Artefact'}
                </button>
            {:else if nonFlagDeps.length > 0}
                <h4 style="margin: 10px 0 5px 0; font-size: 0.95rem; color: #444;">Dependencies</h4>
                {#each nonFlagDeps as [depKey, expectedSort]}
                    {@const picked = draft.dependencies[depKey]}
                    <div class="form-group">
                        <label for="draft-dep-{depKey}">{depKey} ({expectedSort})</label>
                        <button
                            id="draft-dep-{depKey}"
                            type="button"
                            class="pick-dep-btn {$dependencyPickingFor === depKey ? 'active' : ''}"
                            onclick={() => toggleDepPicking(depKey)}
                        >
                            {#if picked && typeof picked !== 'boolean'}
                                ✓ {picked.data.label || '(unnamed)'}
                            {:else if $dependencyPickingFor === depKey}
                                Select in tree...
                            {:else}
                                Pick {depKey}
                            {/if}
                        </button>
                    </div>
                {/each}
            {/if}

            <h4 style="margin: 15px 0 5px 0; font-size: 0.95rem; color: #444;">Data Attributes</h4>
            <div class="form-group">
                <label for="draft-label-input">Label</label>
                <input
                    id="draft-label-input"
                    type="text"
                    value={draft.data.label || ''}
                    onchange={(e) => setDraftDataField('label', (e.currentTarget as HTMLInputElement).value)}
                />
            </div>

            {#each Object.entries(draftSortDef.attributes) as [attrName, expectedType]}
                {#if expectedType === 'string' || expectedType === 'number'}
                    <div class="form-group">
                        <label for="draft-attr-{attrName}">{attrName} ({expectedType})</label>
                        <input
                            id="draft-attr-{attrName}"
                            type={expectedType === 'number' ? 'number' : 'text'}
                            step={expectedType === 'number' ? 'any' : undefined}
                            value={draft.data[attrName] !== undefined ? draft.data[attrName] : ''}
                            onchange={(e) => {
                                const target = e.currentTarget as HTMLInputElement;
                                if (expectedType === 'number') {
                                    const parsed = parseFloat(target.value);
                                    if (!Number.isNaN(parsed)) setDraftDataField(attrName, parsed);
                                } else {
                                    setDraftDataField(attrName, target.value);
                                }
                            }}
                        />
                    </div>
                {:else if expectedType === 'boolean'}
                    <div class="form-group checkbox">
                        <input
                            id="draft-bool-{attrName}"
                            type="checkbox"
                            checked={!!draft.data[attrName]}
                            onchange={(e) => setDraftDataField(attrName, (e.currentTarget as HTMLInputElement).checked)}
                        />
                        <label for="draft-bool-{attrName}">{attrName}</label>
                    </div>
                {:else if expectedType === 'position'}
                    <div class="form-group">
                        <label for="draft-pos-{attrName}-x">{attrName} (x, y)</label>
                        <div class="position">
                            <input
                                id="draft-pos-{attrName}-x"
                                type="number"
                                step="any"
                                value={draft.data[attrName] ? draft.data[attrName][0] : 0}
                                onchange={(e) => updateDraftPosition(attrName, parseFloat((e.currentTarget as HTMLInputElement).value), 0)}
                            />
                            <input
                                id="draft-pos-{attrName}-y"
                                type="number"
                                step="any"
                                value={draft.data[attrName] ? draft.data[attrName][1] : 0}
                                onchange={(e) => updateDraftPosition(attrName, parseFloat((e.currentTarget as HTMLInputElement).value), 1)}
                            />
                            <button
                                type="button"
                                class="pick-btn"
                                style={isPositionPickerActive(draftProxy, attrName) ? 'background-color: #aed6f1;' : ''}
                                title="Click canvas to pick position"
                                onclick={() => togglePositionPicker(draftProxy, attrName)}
                            >📍</button>
                        </div>
                    </div>
                {/if}
            {/each}

            {#if flagDeps.length > 0}
                <h4 style="margin: 15px 0 5px 0; font-size: 0.95rem; color: #444;">Flags</h4>
                {#each flagDeps as [flagKey]}
                    {@const flagActive = draft.dependencies[flagKey] === true}
                    {@const flagLayerId = draft.flagLayers[flagKey] ?? draft.layerId}
                    <div class="form-group checkbox flag-row">
                        <input
                            id="draft-flag-{flagKey}"
                            type="checkbox"
                            checked={flagActive}
                            onchange={(e) => toggleDraftFlag(flagKey, (e.currentTarget as HTMLInputElement).checked)}
                        />
                        <label for="draft-flag-{flagKey}">{flagKey}</label>
                        {#if flagActive}
                            <select
                                class="flag-layer-select"
                                value={flagLayerId}
                                onchange={(e) => setDraftFlagLayer(flagKey, (e.currentTarget as HTMLSelectElement).value)}
                            >
                                {#each flagLayerCandidates(draft.layerId) as candidateId}
                                    <option value={candidateId}>{drawing.getLayer(candidateId)?.name ?? candidateId}</option>
                                {/each}
                            </select>
                        {/if}
                    </div>
                {/each}
            {/if}

            <div class="action-btns">
                <button type="button" class="btn btn-cancel" onclick={cancelDraft}>Cancel</button>
                <button
                    type="button"
                    class="btn btn-validate"
                    disabled={!isDraftComplete(draft)}
                    onclick={() => createDraftArtefact()}
                >Validate</button>
            </div>
        </div>
    {/if}

<!-- ================= Normal Inspection View ================= -->
{:else if $inspectedArtefact}
    {@const art = $inspectedArtefact}
    {@const artSortDef = sortStore.getSort(art.sortName)}
    {#if artSortDef}
        {@const artFlagDeps = Object.entries(artSortDef.dependencies).filter(([_, expected]) => expected === 'flag')}
        <h3 style="margin-top: 0;">
            {art.sortName}
            {#if art.sortName === 'Equality' && equalityChildren(art).length > 0}
                [{equalityChildren(art)[0].sortName}]
            {/if}
        </h3>

        <div>
            <div class="form-group">
                <label for="inspect-layer-select">Layer</label>
                <select
                    id="inspect-layer-select"
                    value={art.layerId}
                    onchange={(e) => {
                        const newLayerId = (e.currentTarget as HTMLSelectElement).value;
                        try {
                            setArtefactLayer(art, newLayerId);
                        } catch (err) {
                            alert((err as Error).message);
                        }
                    }}
                >
                    {#each drawing.getAllLayers() as l}
                        <option value={l.id}>{l.name}</option>
                    {/each}
                </select>
            </div>

            <div class="form-group">
                <label for="inspect-label-input">Label</label>
                <input
                    id="inspect-label-input"
                    type="text"
                    value={art.data.label || ''}
                    placeholder={art.sortName === 'Equality'
                        ? equalityChildren(art).map(c => c.data.label || c.sortName).join(' = ')
                        : undefined}
                    onchange={(e) => setInspectedLabel(art, (e.currentTarget as HTMLInputElement).value)}
                />
            </div>

            {#each Object.entries(artSortDef.attributes) as [attrName, expectedType]}
                {#if expectedType === 'string' || expectedType === 'number'}
                    <div class="form-group">
                        <label for="inspect-attr-{attrName}">{attrName} ({expectedType})</label>
                        <input
                            id="inspect-attr-{attrName}"
                            type={expectedType === 'number' ? 'number' : 'text'}
                            step={expectedType === 'number' ? 'any' : undefined}
                            value={art.data[attrName] !== undefined ? art.data[attrName] : ''}
                            onchange={(e) => {
                                const target = e.currentTarget as HTMLInputElement;
                                if (expectedType === 'number') {
                                    const parsed = parseFloat(target.value);
                                    if (!Number.isNaN(parsed)) setArtefactDataField(art, attrName, parsed);
                                } else {
                                    setArtefactDataField(art, attrName, target.value);
                                }
                            }}
                        />
                    </div>
                {:else if expectedType === 'boolean'}
                    <div class="form-group checkbox">
                        <input
                            id="inspect-bool-{attrName}"
                            type="checkbox"
                            checked={!!art.data[attrName]}
                            onchange={(e) => setArtefactDataField(art, attrName, (e.currentTarget as HTMLInputElement).checked)}
                        />
                        <label for="inspect-bool-{attrName}">{attrName}</label>
                    </div>
                {:else if expectedType === 'position'}
                    <div class="form-group">
                        <label for="inspect-pos-{attrName}-x">{attrName} (x, y)</label>
                        <div class="position">
                            <input
                                id="inspect-pos-{attrName}-x"
                                type="number"
                                step="any"
                                value={art.data[attrName] ? art.data[attrName][0] : 0}
                                onchange={(e) => updateInspectPosition(art, attrName, parseFloat((e.currentTarget as HTMLInputElement).value), 0)}
                            />
                            <input
                                id="inspect-pos-{attrName}-y"
                                type="number"
                                step="any"
                                value={art.data[attrName] ? art.data[attrName][1] : 0}
                                onchange={(e) => updateInspectPosition(art, attrName, parseFloat((e.currentTarget as HTMLInputElement).value), 1)}
                            />
                            <button
                                type="button"
                                class="pick-btn"
                                style={isPositionPickerActive(art, attrName) ? 'background-color: #aed6f1;' : ''}
                                title="Click canvas to pick position"
                                onclick={() => togglePositionPicker(art, attrName)}
                            >📍</button>
                        </div>
                    </div>
                {/if}
            {/each}

            {#if artFlagDeps.length > 0}
                <h4 style="margin-top: 15px; margin-bottom: 10px; font-size: 0.95rem; color: #444;">Flags</h4>
                {#each artFlagDeps as [flagKey]}
                    {@const flagActive = art.dependencies[flagKey] === true}
                    {@const flagLayerId = art.getFlagLayer(flagKey)}
                    <div class="form-group checkbox flag-row">
                        <input
                            id="inspect-flag-{flagKey}"
                            type="checkbox"
                            checked={flagActive}
                            onchange={(e) => setArtefactFlag(art, flagKey, (e.currentTarget as HTMLInputElement).checked)}
                        />
                        <label for="inspect-flag-{flagKey}">{flagKey}</label>
                        {#if flagActive}
                            <select
                                class="flag-layer-select"
                                value={flagLayerId}
                                onchange={(e) => setArtefactFlagLayer(art, flagKey, (e.currentTarget as HTMLSelectElement).value)}
                            >
                                {#each flagLayerCandidates(art.layerId) as candidateId}
                                    <option value={candidateId}>{drawing.getLayer(candidateId)?.name ?? candidateId}</option>
                                {/each}
                            </select>
                        {/if}
                    </div>
                {/each}
            {/if}

            <button
                type="button"
                class="btn btn-merge"
                style="margin-top: 15px; width: 100%;"
                onclick={() => startMergeMode(art)}
            >Merge with another artefact...</button>
        </div>
    {/if}
{:else}
    <p style="color: #666; font-style: italic;">Select an artefact to inspect.</p>
{/if}
