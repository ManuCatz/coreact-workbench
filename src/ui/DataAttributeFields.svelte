<script lang="ts">
    export let prefix: string;
    export let model: { data: Record<string, any> };
    export let attributes: Record<string, string>;
    export let onValueChange: (attrName: string, value: string | number | boolean) => void;
    export let onSetPosition: (attrName: string, axis: 0 | 1, newVal: number) => void;
    export let isPickerActive: (attrName: string) => boolean;
    export let onPickPosition: (attrName: string) => void;
</script>

{#each Object.entries(attributes) as [attrName, expectedType]}
    {#if expectedType === 'string' || expectedType === 'number'}
        <div class="form-group">
            <label for="{prefix}-attr-{attrName}">{attrName} ({expectedType})</label>
            <input
                id="{prefix}-attr-{attrName}"
                type={expectedType === 'number' ? 'number' : 'text'}
                step={expectedType === 'number' ? 'any' : undefined}
                value={model.data[attrName] !== undefined ? model.data[attrName] : ''}
                onchange={(e) => {
                    const target = e.currentTarget as HTMLInputElement;
                    if (expectedType === 'number') {
                        const parsed = parseFloat(target.value);
                        if (!Number.isNaN(parsed)) onValueChange(attrName, parsed);
                    } else {
                        onValueChange(attrName, target.value);
                    }
                }}
            />
        </div>
    {:else if expectedType === 'boolean'}
        <div class="form-group checkbox">
            <input
                id="{prefix}-bool-{attrName}"
                type="checkbox"
                checked={!!model.data[attrName]}
                onchange={(e) => onValueChange(attrName, (e.currentTarget as HTMLInputElement).checked)}
            />
            <label for="{prefix}-bool-{attrName}">{attrName}</label>
        </div>
    {:else if expectedType === 'position'}
        <div class="form-group">
            <label for="{prefix}-pos-{attrName}-x">{attrName} (x, y)</label>
            <div class="position">
                <input
                    id="{prefix}-pos-{attrName}-x"
                    type="number"
                    step="any"
                    value={model.data[attrName] ? model.data[attrName][0] : 0}
                    onchange={(e) => onSetPosition(attrName, 0, parseFloat((e.currentTarget as HTMLInputElement).value))}
                />
                <input
                    id="{prefix}-pos-{attrName}-y"
                    type="number"
                    step="any"
                    value={model.data[attrName] ? model.data[attrName][1] : 0}
                    onchange={(e) => onSetPosition(attrName, 1, parseFloat((e.currentTarget as HTMLInputElement).value))}
                />
                <button
                    type="button"
                    class="pick-btn"
                    style={isPickerActive(attrName) ? 'background-color: #aed6f1;' : ''}
                    title="Click canvas to pick position"
                    onclick={() => onPickPosition(attrName)}
                >📍</button>
            </div>
        </div>
    {/if}
{/each}
