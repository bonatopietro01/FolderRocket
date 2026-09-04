import {useEffect, useRef, useState, type ReactNode} from "react";
import {CalendarDays, Mail, Plus, Search, Usb} from "lucide-react";
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

    useEffect(() => {
        if (!pickerOpen) return;
        const closePicker = (event: PointerEvent) => {
            if (!pickerRef.current?.contains(event.target as Node)) setPickerOpen(false);
        };
        document.addEventListener("pointerdown", closePicker);
        return () => document.removeEventListener("pointerdown", closePicker);
    }, [pickerOpen]);

    function add(type: DashboardSourceType) {
        onAdd(type);
        setPickerOpen(false);
    }

    return <aside className={`dashboardColumn sourceBlocksColumn ${className}`}>
        <div className="sourcesColumnHeader"><span>{title}</span><div className="sourcePickerWrap" ref={pickerRef}><button type="button" className="sourcesAddButton" onClick={() => setPickerOpen(current => !current)} aria-expanded={pickerOpen} title="Add source block"><Plus size={15} /></button>{pickerOpen && <div className="sourcePicker"><button type="button" onClick={() => add("gmail")}><Mail className="gmailPanelIcon" size={15} />Gmail</button><button type="button" onClick={() => add("outlook")}><Mail className="outlookPanelIcon" size={15} />Outlook</button><button type="button" onClick={() => add("search")}><Search size={15} />Search + Fire</button><button type="button" onClick={() => add("calendar")}><CalendarDays className="sourcePickerCalendarIcon" size={15} />Calendar</button><button type="button" onClick={() => add("recent")}><span>◷</span>Recent files</button><button type="button" onClick={() => add("phone")}><span>▯</span>Phone</button><button type="button" onClick={() => add("usb")}><Usb className="sourcePickerUsbIcon" size={15} />USB drive</button><button type="button" onClick={() => add("domain")}><span className="sourcePickerDomainIcon">◎</span>Domain</button><button type="button" onClick={() => add("screen")}><span className="sourcePickerScreenIcon">▣</span>Screen</button></div>}</div></div>
        <div className="sourcesBlockList">{blocks.map((block, index) => <DashboardSourceBlock key={block.id} block={block} index={index} total={blocks.length} onDelete={() => onDelete(block.id)} onMove={direction => onMove(block.id, direction)} onResize={height => onResize(block.id, height)}>{renderBlock(block)}</DashboardSourceBlock>)}</div>
    </aside>;
}
