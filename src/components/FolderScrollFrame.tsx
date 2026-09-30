import {useEffect, useRef, useState, type CSSProperties, type ReactNode} from "react";

type DashboardFolderLayout = "three-column" | "folders-top";

interface Props {
    layout: DashboardFolderLayout;
    itemCount: number;
    children: ReactNode;
}

const TILE_WIDTH = 228;
const TILE_GAP = 9;
const SIDE_PADDING = 44;

function folderRowCount(itemCount: number, viewportWidth: number): 1 | 2 {
    const usableWidth = Math.max(TILE_WIDTH, viewportWidth - SIDE_PADDING);
    const visibleColumns = Math.max(1, Math.floor((usableWidth + TILE_GAP) / (TILE_WIDTH + TILE_GAP)));
    return itemCount > visibleColumns ? 2 : 1;
}

export default function FolderScrollFrame({layout, itemCount, children}: Props) {
    const viewportRef = useRef<HTMLDivElement | null>(null);
    const [viewportWidth, setViewportWidth] = useState(0);
    const [edges, setEdges] = useState({before: false, after: false});
    const rows = layout === "folders-top" ? folderRowCount(itemCount, viewportWidth) : 1;

    useEffect(() => {
        const viewport = viewportRef.current;
        if (!viewport) return;
        const measure = () => {
            setViewportWidth(current => current === viewport.clientWidth ? current : viewport.clientWidth);
            const scrollPosition = layout === "folders-top" ? viewport.scrollLeft : viewport.scrollTop;
            const maxScroll = layout === "folders-top"
                ? viewport.scrollWidth - viewport.clientWidth
                : viewport.scrollHeight - viewport.clientHeight;
            const next = {before: scrollPosition > 2, after: maxScroll - scrollPosition > 2};
            setEdges(current => current.before === next.before && current.after === next.after ? current : next);
        };
        const sizeObserver = new ResizeObserver(measure);
        sizeObserver.observe(viewport);
        let content = viewport.firstElementChild;
        if (content) sizeObserver.observe(content);
        const contentObserver = new MutationObserver(() => {
            if (content) sizeObserver.unobserve(content);
            content = viewport.firstElementChild;
            if (content) sizeObserver.observe(content);
            measure();
        });
        contentObserver.observe(viewport, {childList: true});
        const onWheel = (event: WheelEvent) => {
            if (layout !== "folders-top" || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
            const maxScroll = viewport.scrollWidth - viewport.clientWidth;
            const next = Math.min(maxScroll, Math.max(0, viewport.scrollLeft + event.deltaY));
            if (maxScroll > 2 && next !== viewport.scrollLeft) {
                event.preventDefault();
                viewport.scrollLeft = next;
            }
        };
        viewport.addEventListener("scroll", measure, {passive: true});
        viewport.addEventListener("wheel", onWheel, {passive: false});
        const frame = requestAnimationFrame(measure);
        return () => {
            cancelAnimationFrame(frame);
            viewport.removeEventListener("scroll", measure);
            viewport.removeEventListener("wheel", onWheel);
            contentObserver.disconnect();
            sizeObserver.disconnect();
        };
    }, [itemCount, layout]);

    return <section className={`dashboardColumn foldersColumn${edges.before ? " folderFadeBefore" : ""}${edges.after ? " folderFadeAfter" : ""}`}>
        <div ref={viewportRef} className="foldersScrollRegion" style={{"--folder-rows": rows} as CSSProperties}>{children}</div>
    </section>;
}
