This is a description of a JS library for drawing SVG shapes, with data. The API is based on d3.js. The library is implemented in TypeScript.

The library provides a class called SortStore. An object of type SortStore has a method newSort with 4 arguments:
1. The name of the sort, as a string.
2. a dictionary whose keys are the names of the dependencies, and the values are the corresponding sort names. 
3. a dictionary, whose fields are names of data attributes used to draw the shape, and the values are the type of the attribute (e.g., "number", "string", "boolean")
4. a function that takes a data object and some drawing context and draws the shape based on the data attributes. The data object has the same fields as specified in the second argument, except that it also has a field for each dependency, whose values is the corresponding data object, as well as field "label", of type string.

The SortStore.newSort returns the same 
sort store (useful for chaining) but it first checks consistency (e.g, dependencies are already defined sorts, and the data attributes are of some meaningful type). If the check fails, an error is thrown.

Consistency checks are performed in the newArtefact method, and an error is thrown if the data object or the dependency object do not match the expected structure (for the dependency).

Therefore, there is a class artefact.
It supports a method draw.

Then there is a class Drawing. The constructor takes a SortStore object as 
an argument. It has a method newArtefact that takes the following arguments:
1. a sort name, as a string
2. a dictionary, whose keys are the names of the dependencies, and the values are the corresponding artefacts,
3. a data dictionary, whose fields are names of data attributes used to draw the shape, and the values are the corresponding values for those attributes, possibly including an additional field "label", of type string.

Of course there is some consistency check.

The Drawing class has a method draw that 
draws all the artefacts in the drawing, by calling the draw method of each artefact. It takes some arguments that specify the drawing context (e.g., a d3 selection of an SVG element).

As an example, we could describe graphs as follows.

```javascript
const sortStore = new SortStore();
sortStore.newSort("Vertex",
  {}, {position: "position"}, (data, context) => {
    // draw a vertex at data.position
    //...
  })
  .newSort("Edge",
  {source: "Vertex", target: "Vertex"}, {width: "number"}, (data, context) => {
    // draw an edge from data.source to data.target with weight data.weight
    //...
  });

const drawing = new Drawing(sortStore);
drawing.newArtefact("Vertex", {}, {position: [0, 0], label: "v0"});
  .newArtefact("Vertex", {}, {position: [2, 0], label: "v1"});
  .newArtefact("Edge", {source: v0, target: v1}, {width: 1, label: "e0"});
  .draw(...);
```


# Flags

Flags are defined as "fake dependencies" directly within the `newSort` method. 

When defining a sort, if a dependency is assigned the value `"flag"` instead of the name of another sort, it becomes an optional boolean attribute for that artefact.

For example, you may want to define a tag "mono" on an edge:
```javascript
sortStore.newSort("Edge",
  {source: "Vertex", target: "Vertex", mono: "flag"}, 
  {width: "number"}, 
  (data, context) => {
    // If data.mono is true, draw the arrow differently
  });
```

When instantiating the artefact, the flag is passed alongside the actual dependencies as a boolean value:
```javascript
drawing.newArtefact("Edge", {source: v0, target: v1, mono: true}, {width: 1, label: "e0"});
```

### Flags can leave from a selectable layer

A flag may be assigned to leave from any layer that is the artefact's layer or a descendant of it (mirroring the Layer Hierarchy Rule). Pass `{ __flag: true, layerId }` instead of a plain boolean:
```javascript
// mono leaves from layer-2, a descendant of the artefact's layer (layer-1)
drawing.newArtefact("Edge", {source: v1, target: v2, mono: { __flag: true, layerId: "layer-2" }}, {width: 2, label: "e1"}, "layer-1");
```

`mono: true` is equivalent to `mono: { __flag: true, layerId: <artefact's layer> }`. Passing a layer that does not exist, or that is not the artefact's layer or a descendant of it, throws a `Consistency Check Failed` error.

The flag's layer affects:
- **Rule matching**: only flags set in the rule's root layer are required for matching; a pattern flag leaving from a root layer matches a host flag when the relative depth between the flag layer and the artefact's layer is equal in both drawings. Flags leaving from child layers are part of the rule's structure, not its pattern, and are ignored during matching.
- **Layer focus styling**: artefacts whose flag leaves from the focused layer are not dimmed.
- **Tag-group filtering**: the tree view shows a tag group under the focused layer when any matching artefact's flag leaves from it.

Draw functions still receive only the boolean value for flags (via `getResolvedData()`), never the layer.

I want rocq export feature for first-order rules. As an example, consider a rule named Comp whose root layer consists of two composable arrows f : a -> b and g : b -> c, and the child layer consists of one arrow h : a -> c together with a triangle artefact named T. The rocq export should yield: Comp : forall (a : Vertex)(b : Vertex)(c : Vertex)(f : Edge {| source := a, target := b |}) (g : Edge {| source := b, target := c |}), {|h : Edge {| source := a, target := c |}
