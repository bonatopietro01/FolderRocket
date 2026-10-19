import {useEffect, useRef, useState, type ReactNode} from "react";
import {CalendarDays, Clock3, Globe2, Mail, Monitor, Plus, Search, Smartphone, Usb, Users} from "lucide-react";
import {createPortal} from "react-dom";
import DashboardSourceBlock, {type DashboardSourceBlockData, type DashboardSourceType} from "./DashboardSourceBlock";

interface Props {
    className: string;
    title: string;
    blocks: DashboardSourceBlockData[];
    onAdd: (type: DashboardSourceType) => void;
    onDelete: (id: string) => void;
    onMove: (id: string, direction: "up" | "down") => void;
    onResize: (id: string, height: number) => void;
    renderBlock: (block: DashboardSourceBlockData) => ReactNode;
}

export default function DashboardSourceColumn({className, title, blocks, onAdd, onDelete, onMove, onResize, renderBlock}: Props) {
    const [pickerOpen, setPickerOpen] = useState(false);
    const pickerRef = useRef<HTMLDivElement | null>(null);
    const triggerRef = useRef<HTMLButtonElement | null>(null);
    const menuRef = useRef<HTMLDivElement | null>(null);
    const [menuStyle, setMenuStyle] = useState<{top:number;left:number;maxHeight:number}>({top:0,left:0,maxHeight:320});

    useEffect(() => {
        if (!pickerOpen) return;
        const place = () => {
            const trigger = triggerRef.current?.getBoundingClientRect();
            if (!trigger) return;
            const height = Math.min(menuRef.current?.scrollHeight || 320, window.innerHeight - 24);
            const top = trigger.bottom + height <= window.innerHeight - 12 ? trigger.bottom + 6 : Math.max(12, trigger.top - height - 6);
            setMenuStyle({top, left: Math.max(12, Math.min(trigger.left, window.innerWidth - 192)), maxHeight: Math.max(120, window.innerHeight - 24)});
        };
        place();
        window.addEventListener("resize", place);
        window.addEventListener("scroll", place, true);
        return () => {window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true);};
    }, [pickerOpen]);

    useEffect(() => {
        if (!pickerOpen) return;
        const closePicker = (event: PointerEvent) => {
            if (!pickerRef.current?.contains(event.target as Node) && !menuRef.current?.contains(event.target as Node)) setPickerOpen(false);
        };
        const escape = (event: KeyboardEvent) => {
            if (event.key === "Escape") {setPickerOpen(false); triggerRef.current?.focus(); return;}
            if (!["ArrowDown","ArrowUp","Home","End"].includes(event.key) || !menuRef.current?.contains(event.target as Node)) return;
            const items = Array.from(menuRef.current.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]'));
            if (!items.length) return;
            event.preventDefault();
            const index = items.indexOf(document.activeElement as HTMLButtonElement);
            const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
            items[next].focus();
        };
        document.addEventListener("pointerdown", closePicker);
        document.addEventListener("keydown", escape);
        return () => {document.removeEventListener("pointerdown", closePicker); document.removeEventListener("keydown", escape);};
    }, [pickerOpen]);

    function add(type: DashboardSourceType) {
        onAdd(type);
        setPickerOpen(false);
        requestAnimationFrame(() => triggerRef.current?.focus());
    }

    return <aside className={`dashboardColumn sourceBlocksColumn ${className}`}>
        <div className="sourcesColumnHeader"><strong>{title}</strong></div>
        <div className="sourcesBlockList">{blocks.map((block, index) => <DashboardSourceBlock key={block.id} block={block} index={index} total={blocks.length} onDelete={() => onDelete(block.id)} onMove={direction => onMove(block.id, direction)} onResize={height => onResize(block.id, height)}>{renderBlock(block)}</DashboardSourceBlock>)}</div>
        <div className="sourcesAddFooter"><div className="sourcePickerWrap" ref={pickerRef}><button ref={triggerRef} type="button" className="sourcesAddButton" onClick={() => setPickerOpen(current => !current)} aria-expanded={pickerOpen} aria-label={`Add ${title.toLowerCase()} block`} title={`Add ${title.toLowerCase()} block`}><Plus size={15} /></button>{pickerOpen && createPortal(<div ref={menuRef} className="sourcePicker sourcePickerPortal" style={menuStyle} role="menu"><button type="button" role="menuitem" onClick={() => add("gmail")}><Mail className="gmailPanelIcon sourcePickerIcon" size={15} />Gmail</button><button type="button" role="menuitem" onClick={() => add("outlook")}><Mail className="outlookPanelIcon sourcePickerIcon" size={15} />Outlook</button><button type="button" role="menuitem" onClick={() => add("teams")}><Users className="sourcePickerIcon" size={15}/>Teams</button><button type="button" role="menuitem" onClick={() => add("search")}><Search className="sourcePickerIcon" size={15} />Search + Fire</button><button type="button" role="menuitem" onClick={() => add("calendar")}><CalendarDays className="sourcePickerIcon sourcePickerCalendarIcon" size={15} />Calendar</button><button type="button" role="menuitem" onClick={() => add("recent")}><Clock3 className="sourcePickerIcon" size={15}/>Recent files</button><button type="button" role="menuitem" onClick={() => add("phone")}><Smartphone className="sourcePickerIcon" size={15}/>Phone</button><button type="button" role="menuitem" onClick={() => add("usb")}><Usb className="sourcePickerIcon sourcePickerUsbIcon" size={15} />USB drive</button><button type="button" role="menuitem" onClick={() => add("domain")}><Globe2 className="sourcePickerIcon" size={15}/>Domain</button><button type="button" role="menuitem" onClick={() => add("screen")}><Monitor className="sourcePickerIcon" size={15}/>Screen</button></div>, document.body)}</div></div>
    </aside>;
}
