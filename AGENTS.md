# AGENTS.md

## Overview

`coreact2` is a TypeScript/JavaScript library for drawing SVG shapes with data, featuring an API inspired by D3.js. It models structured diagrams using a categorical system of **Sorts** (definitions), **Artefacts** (instances), and a **Layer Tree Hierarchy**.

---

## Tech Stack

- **Language**: TypeScript (`^5.0.0`) targeting `ES2020`
- **Build Tool / Bundler**: Vite (`^5.0.0`)
- **Core Dependencies**:
  - `d3` (`^7.8.0`) & `@types/d3`: SVG DOM manipulation & drawing context
  - `puppeteer` (`^24.43.1`): Headless automation / log capture
- **Module Format**: ES Modules (`"type": "module"`)
- **Type Checking**: Strict TypeScript configuration (`strict: true`, `noUnusedLocals: true`, `noUnusedParameters: true`)

---

## Setup & Commands

- **Install dependencies**:
  ```bash
  npm install
  ```
- **Start development server**:
  ```bash
  npm run dev
  ```
- **Build default sorts script**:
  ```bash
  npm run build:sorts
  ```
  *(Compiles `src/default_sorts.ts` into `public/default_sorts.js` for dynamic execution)*
- **Preview production build**:
  ```bash
  npm run preview
  ```

---

## Project Structure & Architecture

```
.
├── src/
│   ├── index.ts           # Core library classes: Layer, SortStore, Artefact, Drawing
│   ├── main.ts            # Web application entrypoint, UI controls, inspector & layer management
│   ├── default_sorts.ts   # Definition of default sorts (Vertex, Edge, Pullback)
│   └── vite-env.d.ts      # Vite TypeScript environment definitions
├── public/
│   ├── default_sorts.js   # Pre-compiled JS default sorts script loaded dynamically at runtime
│   └── index.js           # Public entry script
├── index.html             # UI container with sidebar controls, SVG canvas, and inspector panel
├── tsconfig.json          # TypeScript compiler configuration
└── package.json           # Package definition and build scripts
```

### Core Architecture

1. **`SortStore` (`src/index.ts`)**:
   - Manages sort definitions (`SortDefinition`).
   - Defines required dependencies (other sorts or `"flag"` for optional booleans), data attributes, and a drawing callback function.
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

3. **Method Chaining**:
   - `SortStore.newSort()` returns `this` (`SortStore`) to allow fluent chaining.

4. **D3 Rendering Rules**:
   - Drawing functions receive `(data: any, context: d3.Selection)` and must return the created SVG element/group (`<g>`, `<path>`, etc.).
   - Prior to redrawing the canvas, clear previous SVG children (`context.selectAll("*").remove()`).
   - Support optional `initContext` callbacks for sort definitions (e.g. defining SVG `<defs>`, markers, or gradients).

5. **Dynamic Script Execution**:
   - Custom sort scripts are executed using `new Function('sortStore', 'd3', code)`.
   - Any external sort file must adhere to the `sortStore.newSort(...)` interface.
