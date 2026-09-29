import {ChevronDown, ChevronUp, GripHorizontal, Minus, X} from "lucide-react";
import {useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode} from "react";

export type DashboardSourceType = "gmail" | "outlook" | "calendar" | "usb" | "domain" | "screen" | "search" | "recent" | "phone";

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
    const heightRef = useRef(block.height);
    const blockRef = useRef<HTMLDivElement>(null);

    useEffect(() => { heightRef.current = block.height; }, [block.height]);
    useEffect(() => {
        if (!menuOpen) return;
        const closeWhenOutside = (event: PointerEvent) => {
            if (!blockRef.current?.contains(event.target as Node)) { setMenuOpen(false); setDeleteArmed(false); }
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
        <button type="button" className="sourceBlockMenuToggle" onClick={() => { setMenuOpen(current => !current); setDeleteArmed(false); }} aria-label="Block options" aria-expanded={menuOpen} title="Block options"><Minus size={13} /></button>
        {menuOpen && <div className="sourceBlockMenu">
            <button type="button" className={deleteArmed ? "sourceBlockDelete deleteArmed" : "sourceBlockDelete"} onClick={() => { if (deleteArmed) onDelete(); else setDeleteArmed(true); }} title={deleteArmed ? "Press Delete block again to delete" : "Delete block"}><X size={14} />Delete block</button>
            <button type="button" disabled={index === 0} onClick={() => { onMove("up"); setMenuOpen(false); setDeleteArmed(false); }}><ChevronUp size={14} />Move up</button>
            <button type="button" disabled={index === total - 1} onClick={() => { onMove("down"); setMenuOpen(false); setDeleteArmed(false); }}><ChevronDown size={14} />Move down</button>
        </div>}
        <div className="sourceBlockContent">{children}</div>
        <button type="button" className="sourceBlockResize" onPointerDown={startResize} title="Drag to change block height" aria-label="Change block height"><GripHorizontal size={15} /></button>
    </div>;
}
