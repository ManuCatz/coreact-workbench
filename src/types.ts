import type { Selection } from 'd3';

/**
 * The D3 selection type used as the drawing context for all sort draw
 * functions, `Artefact.draw` and `Drawing.draw`.
 *
 * d3's `Selection` type is invariant in its element generic, so it cannot be
 * meaningfully widened to a `Selection<BaseType, …>` without casts. We anchor
 * it on `SVGGElement`, which is exactly what artefact draw functions receive
 * (the per-layer `<g>` group created by `Drawing.draw`) and what they return.
 * Callers that pass a different concrete selection (e.g. the root `<svg>`
 * selection in `Canvas.svelte`) cast at that single boundary.
 */
export type D3Context = Selection<SVGGElement, unknown, null, undefined>;
