<script lang="ts">
    import { onMount } from 'svelte';
    import { get } from 'svelte/store';
    import * as d3 from 'd3';
    import { Artefact } from '../index';
    import {
        drawing,
        sortStore,
        version,
        draftArtefact,
        positionPicker,
        applyPickedPosition,
        mergeMode,
        mergeFirstArtefact,
        mergeSecondArtefact,
        mergeHoverArtefact,
        inspectedArtefact,
        menuHoverArtefact,
        ruleHoverArtefacts
    } from './store';

    let svgElement!: SVGSVGElement;
    let svgContext: d3.Selection<SVGSVGElement, unknown, null, undefined> | null = null;

    let mergeOn = false;
    let mergeFirst: Artefact | null = null;
    let mergeSecond: Artefact | null = null;
    let mergeHover: Artefact | null = null;
    let inspected: Artefact | null = null;
    let menuHover: Artefact | null = null;
    let ruleHover: Set<Artefact> | null = null;

    $: {
        mergeOn = $mergeMode;
        mergeFirst = $mergeFirstArtefact;
        mergeSecond = $mergeSecondArtefact;
        mergeHover = $mergeHoverArtefact;
        inspected = $inspectedArtefact;
        menuHover = $menuHoverArtefact;
        ruleHover = $ruleHoverArtefacts;
        if (svgContext) {
            if (mergeOn || ruleHover || menuHover || inspected) {
                applyOverlays();
            } else {
                redraw();
            }
        }
    }

    function mergeBaseOpacity(art: Artefact): number {
        if (art === mergeFirst || art === mergeSecond) {
            return 1.0;
        }
        if (mergeFirst && drawing.areDependenciesEqual(mergeFirst, art)) {
            return drawing.areProvablyEqual(mergeFirst, art) ? 1.0 : 0.85;
        }
        if (!mergeFirst) {
            return 0.85;
        }
        return 0.35;
    }

    function canvasOpacity(art: Artefact): number | null {
        if (mergeOn) {
            const hoveredSet = mergeHover ? mergeHover.getSelfAndDependencies() : null;
            if (hoveredSet && hoveredSet.has(art)) {
                return 1.0;
            }
            if (hoveredSet) {
                return 0.5;
            }
            return mergeBaseOpacity(art);
        }
        if (ruleHover) {
            return ruleHover.has(art) ? 1 : 0.5;
        }
        const target = menuHover ?? inspected;
        if (target) {
            return target.getSelfAndDependencies().has(art) ? 1 : 0.5;
        }
        return null;
    }

    function applyOverlays(): void {
        if (!svgContext) return;
        for (const art of drawing.getArtefacts()) {
            if (!art.svgElement) continue;
            const opacity = canvasOpacity(art);
            if (opacity !== null) {
                art.svgElement.attr('opacity', opacity);
            }
        }
    }

    function drawDraftPreview(): void {
        const draft = get(draftArtefact);
        if (!draft) return;
        const sortDef = sortStore.getSort(draft.sortName);
        if (!sortDef) return;

        let canPreview = true;
        for (const [depKey, expectedSort] of Object.entries(sortDef.dependencies)) {
            if (expectedSort !== 'flag' && !draft.dependencies[depKey]) {
                canPreview = false;
                break;
            }
        }
        for (const [attrName] of Object.entries(sortDef.attributes)) {
            if (draft.data[attrName] === undefined) {
                canPreview = false;
                break;
            }
        }
        if (!canPreview) return;

        try {
            const tempArt = new Artefact(
                draft.sortName,
                draft.dependencies,
                draft.data,
                sortDef.drawFunction,
                draft.layerId
            );
            tempArt.flagLayers = { ...draft.flagLayers };
            tempArt.draw(svgContext!);
            if (tempArt.svgElement) {
                tempArt.svgElement.attr('opacity', 0.7);
            }
        } catch (e) {
            // Ignore preview errors if draft incomplete
        }
    }

    function redraw(): void {
        if (!svgContext) return;
        svgContext.selectAll('*').remove();
        drawing.draw(svgContext);
        drawDraftPreview();
    }

    function onSvgClick(event: MouseEvent): void {
        if (get(positionPicker)) {
            event.stopPropagation();
            const coords = d3.pointer(event, svgContext!.node());
            applyPickedPosition(Math.round(coords[0]), Math.round(coords[1]));
        }
    }

    onMount(() => {
        svgContext = d3.select(svgElement);
        svgContext.on('click', onSvgClick);
        const unsub = version.subscribe(() => {
            redraw();
            applyOverlays();
        });
        return () => {
            unsub();
        };
    });
</script>

<svg id="canvas" width="800" height="800" bind:this={svgElement}></svg>
