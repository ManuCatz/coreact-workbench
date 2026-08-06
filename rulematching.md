# Rule Matching and Application

This document describes the rule matching and application algorithms implemented in `src/index.ts`. It covers the structural rules a drawing must satisfy to be a rule, the backtracking matcher used to find rule applications in a host drawing, and the first- and second-order application procedures.

All algorithms enforce the `Layer Hierarchy Rule`: an artefact in layer `L` can only depend on artefacts in layer `L` or any lower ancestor layer (parent, grandparent, root).

---

## 1. Rule Structure (`checkRuleStructure`, `checkRuleConditions`)

Before a drawing can be used as a rule it must be explicitly marked with `setIsRule(true)`, which validates four structural conditions:

1. **At most one root layer** (`parentId === null`).
2. **Maximum depth 3** — layers form a tree of height at most 3.
3. **Exactly one child layer of the root that has no children** — this is the **conclusion layer**. The conclusion is merged into the host when the rule is applied.
4. **Each child layer of the root has at most one child layer** — the other children of the root are **premise layers**, each with at most one grandchild layer.

A drawing that satisfies these conditions but has only one child layer of the root is a **first-order** rule. A drawing whose root has two or more child layers is a **second-order** rule (`isFirstOrder` is derived from the layer structure).

---

## 2. Rule Applications (`findRuleApplications*`)

The public entry points are:

| Function | Requires | Pattern used for matching |
|---|---|---|
| `findRuleApplications(rule, host)` | Any valid rule | All non-`Equality` artefacts of the rule |
| `findFirstOrderRuleApplications(rule, host)` | Root has **exactly one** child layer | **Root-layer** artefacts only |
| `findSecondOrderRuleApplications(rule, host)` | Root has **at least two** child layers | **Root-layer** artefacts only |

All three validate the rule first (`validateRuleDrawing`); they return `[]` if the layer-count preconditions are not met. They share `findRootRuleApplications(rule, host)`, which:

- takes the root-layer artefacts (excluding `Equality`) as the pattern, and
- extracts equality constraints from the **root-layer** equality artefacts (`extractEqualityConstraints`).

> **Important:** only the rule's **root layer** participates in matching. Child-layer artefacts and child-layer equalities are part of the rule's structure (the conclusion/premises), not of its pattern. In particular, a child-layer equality is never required to be provable in the host.

Each returned `RuleApplication` contains:
- `matchedArtefacts`: a map from each pattern artefact to a host artefact;
- `hostArtefacts`: the set of host artefacts consumed by the match (all matched images plus every non-boolean dependency of those images).

### 2.1 Equality constraints (`extractEqualityConstraints`)

Root-layer equality artefacts express that their children are provably equal in the host. During matching, the constraint holds only when the assigned host images are pairwise provably equal (see §2.4). Constraints whose children are not all part of the pattern are ignored.

### 2.2 The matcher (`findRuleApplicationsInternal`)

1. **Candidate pool** (`hostCandidates`): every host artefact that lives in a host **root layer**.
2. **Topological ordering**: pattern artefacts are ordered so that every artefact appears before any artefact that depends on it (dependencies first). If the pattern cannot be fully ordered this way, matching is impossible.
3. **Backtracking assignment** over the ordered pattern artefacts, with the following per-candidate checks:
   - the candidate's `sortName` must equal the pattern artefact's;
   - each host artefact may be used at most once (`used` set);
   - **flag dependencies** (`dep === true`):
     - if the flag **leaves from a child layer** of the rule (`getFlagLayer(k)` is not a rule root layer), it is part of the rule's structure and does **not** constrain matching — the candidate may have the flag set or not;
     - if the flag **leaves from the rule's root layer**, the candidate must have the flag set (`cand.dependencies[k] === true`), and the **relative depth** of the flag layer with respect to the artefact's layer must be equal in the rule and the host:
       ```
       ruleDepth(flagLayer) - ruleDepth(artefactLayer) == hostDepth(flagLayer) - hostDepth(artefactLayer)
       ```
     - flags the pattern does not set are never required.
   - **artefact dependencies**:
     - if the dependency has already been assigned a host image, the candidate's dependency must be that image itself or provably equal to it (`host.areEqual(dep, img, cand.layerId)`);
     - the candidate's dependency must be a real artefact (not `undefined`, not a boolean).
4. **Final check**: once a complete assignment is found, every applicable equality constraint must hold — the assigned images must be pairwise equal via `host.areEqual`.
5. **Deduplication**: two applications are considered equivalent when every pattern artefact maps to the same host artefact or to host artefacts that are provably equal (`applicationsEquivalent`). Only one representative of each equivalence class is returned.

### 2.3 `areEqual` — provable equality in the host

`Drawing.areEqual(a, b, layerId)` decides whether `a` and `b` are **provably equal** at a given layer:

1. If `a === b`, they are equal.
2. It builds an undirected adjacency graph from all **equality artefacts** that live in the allowed ancestor layers of `layerId` (the layer's ancestors including itself). Each equality artefact connects all of its children pairwise.
3. `a` and `b` are equal iff they are in the same connected component (breadth-first search from `a` reaches `b`).

Equality is therefore only visible from layers at or below the layer where the equality artefact was declared (the Layer Hierarchy Rule).

### 2.4 Flag layer semantics (recap)

- `Artefact.getFlagLayer(key)` returns `flagLayers[key]` if the flag was assigned a layer explicitly, otherwise the artefact's own layer.
- `mono: true` is shorthand for `mono: { __flag: true, layerId: <artefact's layer> }`.
- A flag may leave from the artefact's layer or any descendant of it; anything else throws a `Consistency Check Failed` error.
- Only flags leaving from the **rule root layer** constrain matching; flags leaving from child layers are rule structure, not pattern.

---

## 3. Host Root Resolution (`resolveHostRootId`)

When applying a rule, the target host root layer is determined from the match:

- Collect the layer ids of the matched host images used as dependencies of the rule's artefacts (`match.get(dep).layerId`).
- If exactly **one** distinct host root layer is referenced, that layer is the target.
- If **none** is referenced, the first host root layer is used.
- If **multiple** distinct roots are referenced, a `Consistency Check Failed` error is thrown ("Matched artefacts span multiple root layers").

---

## 4. Application

Application is shared between first- and second-order rules through `applyRuleConclusion(rule, host, application, childLayer)`. It merges a rule's child layer into the host root and returns `{ artefacts, conclusionFlags }`:

- `artefacts` — the newly created host artefacts (the conclusion content);
- `conclusionFlags` — a map from matched host artefacts to the set of flag keys added by the conclusion.

### 4.1 Conclusion flag propagation

Root-layer rule artefacts may carry flags that **leave from the conclusion layer** (`getFlagLayer(k) === childLayer.id`). Such a flag is neither required for matching (§2.2) nor present on the host artefact. During application it is added to the matched host artefact in the host root:

```
img.dependencies[k] = true
img.flagLayers[k]   = hostRootId
```

If the host artefact already has the flag set, it is left untouched (it is pre-existing host content, not a conclusion addition) and is therefore not recorded in `conclusionFlags`.

### 4.2 Conclusion artefact creation

1. The conclusion-layer artefacts (excluding `Equality`) are created in the host root **in dependency order**:
   - boolean (flag) dependencies are copied as-is;
   - dependencies on rule root-layer artefacts resolve to their matched host images;
   - dependencies on other conclusion artefacts resolve to the copies already created.
   - Flag layers are remapped from the rule to the host (`remapFlagLayers`, with the rule root and conclusion layer mapped to the host root).
2. The rule's **child-layer equalities** are re-created in the host root with the same resolution rules, using `addEqualityArtefactUnchecked` (no re-validation) and skipping any that collapse to fewer than two distinct children.

### 4.3 First-order application (`applyFirstOrderRule`)

1. Validates the rule flag and conditions; requires the root to have **exactly one** child layer (the conclusion).
2. Calls `applyRuleConclusion` with that single child layer.
3. Returns the created host artefacts (`artefacts`).

### 4.4 Second-order application (`applySecondOrderRule`)

The root has at least two child layers: the **conclusion** (the unique childless child of the root) and one or more **premise layers** (each with at most one child layer).

**Step 1 — conclusion into the host.** `applyRuleConclusion` is called with the conclusion layer. The host root receives the conclusion artefacts and the conclusion-added flags (see §4.1). The result records which host artefacts were created (`conclusionCreated`) so they can be excluded from the derived drawings.

**Step 2 — one derived drawing per premise layer.** For each premise layer `A`:

1. Resolve the host root for `A` (`resolveHostRootId`).
2. Create a new empty `Drawing` (not marked as a rule — `isRule` stays `false`).
3. **Copy the host root** into the derived root as a standalone snapshot:
   - non-`Equality` host root artefacts are copied in dependency order; every host artefact maps 1:1 to a fresh derived artefact;
   - artefacts created by the conclusion (Step 1) are **excluded**;
   - conclusion-added flags are **excluded** — they are skipped while copying dependencies and deleted from the copy's `flagLayers` after `remapFlagLayers`. Only premise/root content is carried over;
   - host root equality artefacts are copied (again excluding conclusion-created ones), re-resolved against the copies.
4. **Instantiate premise layer `A`** in the derived root:
   - dependencies on rule root artefacts resolve to the *copies* of the matched host images (`origToCopy`);
   - dependencies on other premise-`A` artefacts resolve to already-created premise copies;
   - premise equalities are copied the same way.
5. **Add the child layer `B` of `A`** (at most one, by rule condition 4) as a child of the derived root, and instantiate layer `B`'s artefacts and equalities there, resolving dependencies against the derived-root copies, premise copies, or other `B` copies as appropriate.
6. The derived drawing is returned as `{ name: premiseName, drawing }`.

The function returns `{ hostArtefacts, derivedRules }`, where `hostArtefacts` is the conclusion content created in the host root and `derivedRules` is one entry per premise layer.

---

## 5. Summary of rules of thumb

- **Only the rule's root layer matches.** Everything below it is structure.
- **Root-layer flags constrain matching; child-layer flags do not.** A matched root-layer flag must be set in the host and at the same relative depth.
- **Child-layer equalities are never required** for matching; they are re-created in the host when the rule is applied.
- **Root-layer equalities are required**: matched images must be provably equal in the host.
- **Applying merges the conclusion into the host root**, including conclusion-layer flags on matched root artefacts.
- **Second-order application builds one derived drawing per premise** that copies the host root (minus conclusion content) plus the premise layer and its child layer, without rule marking.
