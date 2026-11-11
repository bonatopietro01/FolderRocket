import {ChevronDown, ChevronUp, GripHorizontal, Minus, X} from "lucide-react";
import {createPortal} from "react-dom";
import {useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode} from "react";

export type DashboardSourceType = "gmail" | "outlook" | "teams" | "calendar" | "usb" | "domain" | "screen" | "search" | "recent" | "phone";

export interface ScreenCaptureCrop { x: number; y: number; width: number; height: number; }

export interface DashboardSourceBlockData {
    id: string;
    type: DashboardSourceType;
    height: number;
    accountBlockId?: string | null;
    url?: string;
    recentHours?: number;
    recentPaths?: string;
    phoneHours?: number;
    calendarId?: string;
    calendarDays?: number;
    calendarView?: "week" | "upcoming";
    calendarWeekStart?: string;
    crop?: ScreenCaptureCrop;
}

interface DashboardSourceBlockProps {
    block: DashboardSourceBlockData;
    index: number;
    total: number;
    onDelete: () => void;
    onMove: (direction: "up" | "down") => void;
    onResize: (height: number) => void;
    children: ReactNode;
}

const MAX_HEIGHT = 1100;

export default function DashboardSourceBlock({block, index, total, onDelete, onMove, onResize, children}: DashboardSourceBlockProps) {
    const [menuOpen, setMenuOpen] = useState(false);
    const [resizing, setResizing] = useState(false);
    const [deleteArmed, setDeleteArmed] = useState(false);
    const [menuPosition, setMenuPosition] = useState<{top:number;left:number}|null>(null);
    const heightRef = useRef(block.height);
    const blockRef = useRef<HTMLDivElement>(null);
    const menuToggleRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => { heightRef.current = block.height; }, [block.height]);
    useLayoutEffect(() => {
        if (!menuOpen) return;
        const placeMenu = () => {
            const anchor = menuToggleRef.current?.getBoundingClientRect();
            const menu = menuRef.current?.getBoundingClientRect();
            if (!anchor || !menu) return;
            const edge = 8;
            const gap = 6;
            const below = anchor.bottom + gap + menu.height <= window.innerHeight - edge;
            const above = anchor.top - gap - menu.height >= edge;
            const top = below
                ? anchor.bottom + gap
                : above
                    ? anchor.top - gap - menu.height
                    : Math.max(edge, Math.min(anchor.bottom + gap, window.innerHeight - menu.height - edge));
            const left = Math.max(edge, Math.min(anchor.right - menu.width, window.innerWidth - menu.width - edge));
            setMenuPosition(current => current?.top === top && current.left === left ? current : {top,left});
        };
        placeMenu();
        window.addEventListener("resize", placeMenu);
        window.addEventListener("scroll", placeMenu, true);
        return () => {
            window.removeEventListener("resize", placeMenu);
            window.removeEventListener("scroll", placeMenu, true);
        };
    }, [menuOpen]);
    useEffect(() => {
        if (!menuOpen) return;
        const closeWhenOutside = (event: PointerEvent) => {
            if (!blockRef.current?.contains(event.target as Node) && !menuRef.current?.contains(event.target as Node)) { setMenuOpen(false); setDeleteArmed(false); }
        };
        document.addEventListener("pointerdown", closeWhenOutside);
        return () => document.removeEventListener("pointerdown", closeWhenOutside);
    }, [menuOpen]);

    function startResize(event: ReactPointerEvent<HTMLButtonElement>) {
        const startY = event.clientY;
        const startHeight = heightRef.current;
        const minimumHeight = block.type === "search" ? 108 : 210;
        setResizing(true);
        event.currentTarget.setPointerCapture(event.pointerId);
        const move = (moveEvent: PointerEvent) => {
            const nextHeight = Math.min(MAX_HEIGHT, Math.max(minimumHeight, startHeight + moveEvent.clientY - startY));
            heightRef.current = nextHeight;
            onResize(nextHeight);
        };
        const stop = () => {
            setResizing(false);
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", stop);
            window.removeEventListener("pointercancel", stop);
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", stop);
        window.addEventListener("pointercancel", stop);
    }

    return <div ref={blockRef} className={`dashboardSourceBlock sourceBlock-${block.type}${menuOpen ? " sourceBlockMenuOpen" : ""}${resizing ? " isResizing" : ""}`} style={{height: block.height}}>
        <button ref={menuToggleRef} type="button" className="sourceBlockMenuToggle" onClick={() => { setMenuOpen(current => !current); setDeleteArmed(false); }} aria-label="Block options" aria-expanded={menuOpen} title="Block options"><Minus size={13} /></button>
        {menuOpen && createPortal(<div ref={menuRef} className="sourceBlockMenu sourceBlockMenuPortal" data-positioned={menuPosition ? "true" : "false"} style={menuPosition ? {"--source-block-menu-top":`${menuPosition.top}px`, "--source-block-menu-left":`${menuPosition.left}px`} as CSSProperties : undefined}>
            <button type="button" className={deleteArmed ? "sourceBlockDelete deleteArmed" : "sourceBlockDelete"} onClick={() => { if (deleteArmed) onDelete(); else setDeleteArmed(true); }} title={deleteArmed ? "Press Delete block again to delete" : "Delete block"}><X size={14} />Delete block</button>
            <button type="button" disabled={index === 0} onClick={() => { onMove("up"); setMenuOpen(false); setDeleteArmed(false); }}><ChevronUp size={14} />Move up</button>
            <button type="button" disabled={index === total - 1} onClick={() => { onMove("down"); setMenuOpen(false); setDeleteArmed(false); }}><ChevronDown size={14} />Move down</button>
        </div>, document.body)}
        <div className="sourceBlockContent">{children}</div>
        <button type="button" className="sourceBlockResize" onPointerDown={startResize} title="Drag to change block height" aria-label="Change block height"><GripHorizontal size={15} /></button>
    </div>;
}
