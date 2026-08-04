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