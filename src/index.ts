export interface SortDefinition {
    name: string;
    dependencies: Record<string, string>;
    attributes: Record<string, string>;
    drawFunction: (data: any, context: any) => void;
}

export class SortStore {
    private sorts: Map<string, SortDefinition> = new Map();

    newSort(
        name: string,
        dependencies: Record<string, string>,
        attributes: Record<string, string>,
        drawFunction: (data: any, context: any) => void
    ): this {
        // Consistency check: all dependencies must be already defined sorts
        for (const [depKey, depSortName] of Object.entries(dependencies)) {
            if (!this.sorts.has(depSortName)) {
                throw new Error(`Consistency Check Failed: Dependency sort '${depSortName}' for dependency '${depKey}' in sort '${name}' is not defined.`);
            }
        }

        // Validate attribute types (basic check to ensure they are strings representing types)
        const validTypes = ["number", "string", "boolean", "position"];
        for (const [attrName, attrType] of Object.entries(attributes)) {
            if (!validTypes.includes(attrType)) {
                throw new Error(`Consistency Check Failed: Invalid attribute type '${attrType}' for attribute '${attrName}' in sort '${name}'.`);
            }
        }

        this.sorts.set(name, {
            name,
            dependencies,
            attributes,
            drawFunction
        });

        return this; // Enable chaining
    }

    getSort(name: string): SortDefinition | undefined {
        return this.sorts.get(name);
    }
}

export class Artefact {
    constructor(
        public sortName: string,
        public dependencies: Record<string, Artefact>,
        public data: Record<string, any>,
        private drawFunction: (data: any, context: any) => void
    ) {}

    draw(context: any): void {
        const combinedData = { ...this.data };
        
        // Add dependency data objects to the combined data
        for (const [key, depArtefact] of Object.entries(this.dependencies)) {
            combinedData[key] = depArtefact.data;
        }

        this.drawFunction(combinedData, context);
    }
}

export class Drawing {
    private artefacts: Artefact[] = [];

    constructor(private sortStore: SortStore) {}

    newArtefact(
        sortName: string,
        dependencies: Record<string, Artefact>,
        data: Record<string, any>
    ): Artefact {
        const sortDef = this.sortStore.getSort(sortName);
        if (!sortDef) {
            throw new Error(`Consistency Check Failed: Sort '${sortName}' is not defined.`);
        }

        // 1. Validate Dependencies
        for (const [depKey, expectedSortName] of Object.entries(sortDef.dependencies)) {
            const providedArtefact = dependencies[depKey];
            if (!providedArtefact) {
                throw new Error(`Consistency Check Failed: Missing dependency '${depKey}' for artefact of sort '${sortName}'.`);
            }
            if (providedArtefact.sortName !== expectedSortName) {
                throw new Error(`Consistency Check Failed: Dependency '${depKey}' expected sort '${expectedSortName}', but got '${providedArtefact.sortName}'.`);
            }
        }

        // Verify no extra unexpected dependencies were provided
        for (const providedKey of Object.keys(dependencies)) {
            if (!sortDef.dependencies[providedKey]) {
                throw new Error(`Consistency Check Failed: Unexpected dependency '${providedKey}' provided for artefact of sort '${sortName}'.`);
            }
        }

        // 2. Validate Data Attributes
        for (const [attrName, expectedType] of Object.entries(sortDef.attributes)) {
            const value = data[attrName];
            if (value === undefined) {
                throw new Error(`Consistency Check Failed: Missing data attribute '${attrName}' for artefact of sort '${sortName}'.`);
            }

            // Primitive type checking
            if (expectedType === "position") {
                if (!Array.isArray(value) || value.length !== 2 || typeof value[0] !== "number" || typeof value[1] !== "number") {
                    throw new Error(`Consistency Check Failed: Data attribute '${attrName}' expected to be of primitive type 'position' ([number, number]), but got ${JSON.stringify(value)}.`);
                }
            } else if (typeof value !== expectedType) {
                throw new Error(`Consistency Check Failed: Data attribute '${attrName}' expected to be '${expectedType}', but got '${typeof value}'.`);
            }
        }

        // Optional 'label' checking
        if (data.label !== undefined && typeof data.label !== "string") {
            throw new Error(`Consistency Check Failed: Data attribute 'label' expected to be 'string', but got '${typeof data.label}'.`);
        }

        const artefact = new Artefact(sortName, dependencies, data, sortDef.drawFunction);
        this.artefacts.push(artefact);
        
        return artefact;
    }

    draw(context: any): void {
        for (const artefact of this.artefacts) {
            artefact.draw(context);
        }
    }
}
