/** Observe drag in capture phase: drop targets deliberately stop bubbling. */
export function watchFolderDragHover(
    selector: string,
    onOpen: (block: HTMLElement, isCurrent: () => boolean) => void | Promise<void>,
    scope: Document = document,
    delay = 2000
) {
    let current: {block: HTMLElement; timer: ReturnType<typeof setTimeout> | null} | null = null;

    const clear = () => {
        if (current?.timer !== null && current?.timer !== undefined) clearTimeout(current.timer);
        current?.block.removeAttribute("data-drag-hover");
        current = null;
    };
    const hover = (event: DragEvent) => {
        const types = Array.from(event.dataTransfer?.types ?? []);
        if (!types.length || types.includes("application/x-folderrocket-folder-order")) {
            clear();
            return;
        }
        const target = event.target as Element | null;
        const block = target && typeof target.closest === "function" ? target.closest<HTMLElement>(selector) : null;
        if (!block || target?.closest(".deleteZone,.deleteFile")) {
            clear();
            return;
        }
        if (current?.block === block) return;
        clear();
        const visit = {block, timer: null as ReturnType<typeof setTimeout> | null};
        current = visit;
        block.setAttribute("data-drag-hover", "waiting");
        visit.timer = setTimeout(() => {
            visit.timer = null;
            block.removeAttribute("data-drag-hover");
            const isCurrent = () => current === visit && block.isConnected;
            if (isCurrent()) {
                // Keep the visit until the pointer leaves: an empty folder must
                // not trigger another request on every subsequent dragover.
                void Promise.resolve(onOpen(block, isCurrent)).catch(error => {
                    console.warn("Unable to open hovered folder", error);
                });
            }
        }, delay);
    };
    const leave = (event: DragEvent) => {
        if (current?.block.contains(event.target as Node | null)
            && !current.block.contains(event.relatedTarget as Node | null)) clear();
    };

    scope.addEventListener("dragenter", hover, true);
    scope.addEventListener("dragover", hover, true);
    scope.addEventListener("dragleave", leave, true);
    scope.addEventListener("drop", clear, true);
    scope.addEventListener("dragend", clear, true);
    scope.defaultView?.addEventListener("blur", clear);
    return () => {
        clear();
        scope.removeEventListener("dragenter", hover, true);
        scope.removeEventListener("dragover", hover, true);
        scope.removeEventListener("dragleave", leave, true);
        scope.removeEventListener("drop", clear, true);
        scope.removeEventListener("dragend", clear, true);
        scope.defaultView?.removeEventListener("blur", clear);
    };
}
