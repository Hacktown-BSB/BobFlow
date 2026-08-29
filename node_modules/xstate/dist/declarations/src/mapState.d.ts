import { AnyMachineSnapshot, AnyStateNode, StateSchema, StateSchemaFrom } from "./types.js";
/**
 * A mapper object that defines how to transform a snapshot based on its state.
 * Can be nested to match the state hierarchy of the machine.
 */
type StateSchemaMapper<TSnapshot extends AnyMachineSnapshot, T extends StateSchema, TResult> = {
    /** Maps the snapshot to a value when this state is active. */
    map?: (snapshot: TSnapshot) => TResult;
    /** Nested mappers for child states. */
    states?: {
        [K in keyof T['states']]?: T['states'][K] extends StateSchema ? StateSchemaMapper<TSnapshot, T['states'][K], TResult> : never;
    };
};
/**
 * Maps a machine snapshot to an array of result objects based on active states.
 *
 * Traverses all active state nodes (from atomic/leaf states up to root) and
 * collects results from matching `map` functions in the mapper object. Results
 * are ordered leaf-to-root (most specific state first).
 */
export declare function mapState<T extends AnyMachineSnapshot, TResult>(snapshot: T, mapper: StateSchemaMapper<T, StateSchemaFrom<T['machine']>, TResult>): {
    stateNode: AnyStateNode;
    result: TResult;
}[];
export {};
