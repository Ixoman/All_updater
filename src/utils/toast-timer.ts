export interface CallbackRef {
    current: (id: string) => void;
}

export function createToastAutoCloseHandler(ref: CallbackRef, id: string): () => void {
    return () => ref.current(id);
}
