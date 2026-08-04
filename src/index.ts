export interface SortDefinition {
    name: string;
    dependencies: Record<string, string>;
    attributes: Record<string, string>;
    drawFunction: (data: any, context: any) => void;
    initContext?: (context: any) => void;
}

export class SortStore {
    private sorts: Map<string, SortDefinition> = new Map();
    private flags: Map<string, string> = new Map();

    newFlag(name: string, targetSortName: string): this {
        if (!this.sorts.has(targetSortName)) {
            throw new Error(`Consistency Check Failed: Cannot attach flag '${name}' to undefined sort '${targetSortName}'.`);
        }
        this.flags.set(name, targetSortName);
        return this;
    }

    getFlagsForSort(sortName: string): string[] {
        const result: string[] = [];
        for (const [flagName, targetSort] of this.flags.entries()) {
            if (targetSort === sortName) result.push(flagName);
        }
        return result;
    }

    getAllSorts(): SortDefinition[] {
        return Array.from(this.sorts.values());
    }

    newSort(
        name: string,
        dependencies: Record<string, string>,
        attributes: Record<string, string>,
        drawFunction: (data: any, context: any) => void,
        initContext?: (context: any) => void
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
            drawFunction,
            initContext
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

        // 2. Validate Data Attributes (Strict Check)
        const allowedFlags = this.sortStore.getFlagsForSort(sortName);

        // Check required attributes
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

        // Check for unexpected properties and flag types
        for (const [key, value] of Object.entries(data)) {
            if (key === "label") {
                if (typeof value !== "string") {
                    throw new Error(`Consistency Check Failed: Data attribute 'label' expected to be 'string', but got '${typeof value}'.`);
                }
            } else if (sortDef.attributes[key] !== undefined) {
                // Already checked above
                continue;
            } else if (allowedFlags.includes(key)) {
                if (typeof value !== "boolean") {
                    throw new Error(`Consistency Check Failed: Flag '${key}' expected to be 'boolean', but got '${typeof value}'.`);
                }
            } else {
                throw new Error(`Consistency Check Failed: Unexpected data attribute or flag '${key}' provided for sort '${sortName}'.`);
            }
        }

        const artefact = new Artefact(sortName, dependencies, data, sortDef.drawFunction);
        this.artefacts.push(artefact);
        
        return artefact;
    }

    draw(context: any): void {
        // 1. Initialize context for all defined sorts (e.g., for SVG defs/markers)
        for (const sortDef of this.sortStore.getAllSorts()) {
            if (sortDef.initContext) {
                sortDef.initContext(context);
            }
        }

        // 2. Draw all artefacts
        for (const artefact of this.artefacts) {
            artefact.draw(context);
        }
    }
}
