# AGENTS.md

## Overview

`coreact2` is a TypeScript/JavaScript library for drawing SVG shapes with data, featuring an API inspired by D3.js. It models structured diagrams using a categorical system of **Sorts** (definitions), **Artefacts** (instances), and a **Layer Tree Hierarchy**.

---

## Tech Stack

- **Language**: TypeScript (`^5.0.0`) targeting `ES2020`
- **Build Tool / Bundler**: Vite (`^5.0.0`) with `@sveltejs/vite-plugin-svelte` (`^3.1.2`)
- **UI Framework**: Svelte 5 (`^5.0.0`) using **classic stores** (`writable`/`derived`/`get` from `svelte/store`) — NOT runes
- **Core Dependencies**:
  - `d3` (`^7.8.0`) & `@types/d3`: SVG DOM manipulation & drawing context
  - `puppeteer` (`^24.43.1`): Headless automation / log capture
  - `svelte-check` (`^4.0.0`): Type checking for `.svelte` files
- **Module Format**: ES Modules (`"type": "module"`)
- **Type Checking**: Strict TypeScript configuration (`strict: true`, `noUnusedLocals: true`, `noUnusedParameters: true`)

---

## Setup & Commands

- **Install dependencies**:
  ```bash
  npm install
  ```
- **Type-check the whole project (TS + Svelte)**:
  ```bash
  npm run check
  ```
  *(Runs `svelte-check --tsconfig ./tsconfig.json`)*
- **Start development server**:
  ```bash
  npm run dev
  ```
- **Build**:
  ```bash
  npm run build
  ```
  *(Vite production build; type-checking happens via `npm run check`, not in the build script)*
- **Regenerate `src/generated/default_sorts.js` from `src/default_sorts.ts`**:
  ```bash
  npm run build:sorts
  ```
  *(Runs `tsc src/default_sorts.ts --target esnext --moduleResolution node --outDir src/generated`; produces exactly one runnable file. Auto-run via `predev`, `prebuild`, and `pretest`, so you normally never need to call it directly.)*
- **Preview production build**:
  ```bash
  npm run preview
  ```
- **Smoke test (headless)**:
  ```bash
  npm run dev  # serves on http://localhost:5175
  node capture_logs.js
  ```
  *(`capture_logs.js` loads the page, waits ~3s, and prints console + page errors)*

---

## Project Structure & Architecture

```
.
├── src/
│   ├── index.ts           # Core library classes: Layer, SortStore, Artefact, EqualityArtefact, Drawing, DrawingStore
│   ├── types.ts           # Shared types (D3Context: Selection<SVGGElement, …>)
│   ├── default_sorts.ts   # Definition of default sorts (Vertex, Edge, Pullback, Triangle, Equality)
│   ├── rocq_export.ts     # Export drawings to Coq/rocq
│   ├── rocq_recording.ts  # RocqRecorder: records export-affecting edits (labels, deps, layer)
│   ├── demo.ts            # Bootstrap: runs buildDemo, loads active drawing, mounts App.svelte
│   ├── demo/
│   │   ├── buildDemo.ts   # Builds the demo diagram + 9 saved rule drawings (incl. 'Rule Drawing Demo')
│   │   ├── helpers.ts     # Shared demo/test helpers (newDemoContext, registerDefaultSorts)
│   │   └── *.test.ts      # Vitest suites (rules, consistency, demo, rocq export, rocq compile)
│   ├── generated/
│   │   └── default_sorts.js # Gitignored build artifact compiled from src/default_sorts.ts (npm run build:sorts); imported raw by buildDemo
│   ├── main.ts            # Entry point; mounts App.svelte into #app
│   ├── ui/
│   │   ├── store.ts       # All reactive stores + UI actions (single shared module)
│   │   ├── App.svelte     # App layout: menu, canvas, inspector, rules panel, toasts
│   │   ├── Canvas.svelte  # SVG canvas; imperative D3 redraw on store version bump
│   │   ├── LayersTree.svelte, LayerNode.svelte       # Layer tree UI
│   │   ├── ArtefactMenu.svelte, ArtefactNode.svelte  # Artefact tree UI
│   │   ├── DrawingsStorePanel.svelte  # Save/load/import/export drawings
│   │   ├── RuleApplications.svelte    # Applyable rules list + Apply buttons
│   │   ├── Inspector.svelte           # Merge / draft / inspect views
│   │   ├── DataAttributeFields.svelte # Shared attribute form controls (draft + inspect)
│   │   ├── Toasts.svelte              # Non-blocking toast notifications
│   │   └── app.css         # Global styles
│   └── vite-env.d.ts      # Vite + Svelte TypeScript environment definitions
├── index.html             # Minimal mount container (#app) + main.ts entry script
├── tsconfig.json          # TypeScript compiler configuration
├── svelte.config.js       # Svelte preprocessor config (vitePreprocess)
├── vite.config.js         # Vite config (Svelte plugin, base: './')
└── package.json           # Package definition and build scripts
```

### UI Architecture (Svelte)

1. **`src/ui/store.ts`**:
   - Single module owning the core singletons (`sortStore`, `drawing`, `drawingStore`, `rocqRecorder`) plus every shared reactive store (`version`, `inspectedArtefact`, `draftArtefact`, `mergeMode`, `positionPicker`, etc.) and all UI action functions.
   - The core `Drawing`/`DrawingStore` classes are plain mutable objects with no reactivity. After any mutation of their state, call `refresh()` (bumps the `version` store) so every derived store recomputes and all subscribed components re-render.
   - Never mutate core objects outside this module; components call store actions and read stores.

2. **`Canvas.svelte`**:
   - Owns the `<svg id="canvas">` imperatively. On mount (and on every `version` bump) it clears all children and calls `drawing.draw(svgContext)` with D3; no Svelte template nodes exist inside the SVG.
   - Handles overlay opacity (merge mode, rule hover, menu hover, inspected artefact) and the position-picker click handler.

3. **Component ↔ store communication**:
   - Panels (layers tree, artefact menu, inspector, drawing store, rules) read from derived stores and dispatch through store actions. They never reach into core classes directly except through `store.ts` helpers.

4. **Startup (`src/main.ts`)**:
   - Imports `./demo`, which runs `buildDemo` (constructs the demo diagram and saves 9 rule drawings including 'Rule Drawing Demo'), loads that drawing as active, then mounts `App.svelte` into `#app`.

### Core Architecture

1. **`SortStore` (`src/index.ts`)**:
   - Manages sort definitions (`SortDefinition`).
   - Defines required dependencies (other sorts), data attributes, and a drawing callback function.
   - Supported data attribute primitive types: `"number"`, `"string"`, `"boolean"`, `"position"` (`[x, y]`).

2. **`Layer` & Layer Tree (`src/index.ts`)**:
   - Organizes artefacts in a parent-child tree hierarchy (`id`, `name`, `parentId`, `color`, `colorEnabled`).
   - Deleting a layer recursively deletes all child/descendant layers and their associated artefacts.

3. **`Artefact` (`src/index.ts`)**:
   - Instantiates a sort within a specified layer.
   - Resolves nested dependency data recursively via `getResolvedData()`.

4. **`Drawing` (`src/index.ts`)**:
   - Coordinates layers and artefacts, rendering them to an SVG D3 context.
   - Enforces **Layer Hierarchy Rule**: An artefact in layer $L$ can only depend on artefacts in layer $L$ or any of its lower ancestor layers (parent, grandparent, root). Cross-branch or lower-to-higher dependencies trigger a consistency check error.
   - Handles layer topological drawing order, focus dimming (non-focused layers at 50% opacity), and layer color overrides.

---

## Code Rules & Conventions

1. **Consistency Checks & Error Handling**:
   - Every operation creating or mutating sorts, artefacts, or layers must strictly validate structure and constraints.
   - Errors thrown during validation must follow the pattern:
     `throw new Error("Consistency Check Failed: <message>")`

2. **Type Safety**:
   - Maintain strict type checking. Do not use implicit `any` when adding new interfaces or functions.
   - Ensure attribute types matches allowed primitives: `"number"`, `"string"`, `"boolean"`, `"position"`.
   - Data attribute values are typed as `DataAttributeValue` (`string | number | boolean | [number, number]`); use it for setter parameters and draft data instead of raw `any`.

3. **Method Chaining**:
   - `SortStore.newSort()` returns `this` (`SortStore`) to allow fluent chaining.

4. **D3 Rendering Rules**:
   - Drawing functions receive `(data: any, context: d3.Selection)` and must return the created SVG element/group (`<g>`, `<path>`, etc.).
   - Prior to redrawing the canvas, clear previous SVG children (`context.selectAll("*").remove()`).
   - Support optional `initContext` callbacks for sort definitions (e.g. defining SVG `<defs>`, markers, or gradients).

5. **Dynamic Script Execution**:
   - Custom sort scripts are executed using `new Function('sortStore', 'd3', code)`.
   - Any external sort file must adhere to the `sortStore.newSort(...)` interface.
