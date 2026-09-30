import {useEffect, useRef, useState, type ReactNode} from "react";

type DashboardFolderLayout = "three-column" | "folders-top";

interface Props {
    layout: DashboardFolderLayout;
    itemCount: number;
    children: ReactNode;
}

export default function FolderScrollFrame({layout, itemCount, children}: Props) {
    const viewportRef = useRef<HTMLDivElement | null>(null);
    const [edges, setEdges] = useState({before: false, after: false});

    useEffect(() => {
        const viewport = viewportRef.current;
        if (!viewport) return;
        const measure = () => {
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
            const group = (event.target as HTMLElement).closest<HTMLElement>(".dashboardProjectGroup");
            if (group) {
                const maxVerticalScroll = group.scrollHeight - group.clientHeight;
                const canScrollGroup = event.deltaY < 0 ? group.scrollTop > 0 : group.scrollTop < maxVerticalScroll - 1;
                if (maxVerticalScroll > 1 && canScrollGroup) return;
            }
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
        <div ref={viewportRef} className="foldersScrollRegion">{children}</div>
    </section>;
}
