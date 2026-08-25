import {LoaderCircle, Monitor, Search, SlidersHorizontal, X} from "lucide-react";
import {useEffect, useRef, useState, type PointerEvent as ReactPointerEvent} from "react";
import type {ScreenCaptureCrop} from "./DashboardSourceBlock";
import {API_BASE_URL} from "../api";

const MIN_CROP_SIZE = .08;
const DEFAULT_CROP: ScreenCaptureCrop = {x: 0, y: 0, width: 1, height: 1};

function clamp(value: number, minimum: number, maximum: number) {
    return Math.min(maximum, Math.max(minimum, value));
}

function normalizeCrop(crop?: ScreenCaptureCrop): ScreenCaptureCrop {
    if (!crop) return DEFAULT_CROP;
    const width = clamp(Number.isFinite(crop.width) ? crop.width : 1, MIN_CROP_SIZE, 1);
    const height = clamp(Number.isFinite(crop.height) ? crop.height : 1, MIN_CROP_SIZE, 1);
    return {
        x: clamp(Number.isFinite(crop.x) ? crop.x : 0, 0, 1 - width),
        y: clamp(Number.isFinite(crop.y) ? crop.y : 0, 0, 1 - height),
        width,
        height
    };
}

type CropAction = "move" | "nw" | "ne" | "sw" | "se";

interface ScreenCaptureSourcePanelProps {
    crop?: ScreenCaptureCrop;
    onCropChange: (crop: ScreenCaptureCrop) => void;
}

export default function ScreenCaptureSourcePanel({crop, onCropChange}: ScreenCaptureSourcePanelProps) {
    const hiddenVideoRef = useRef<HTMLVideoElement>(null);
    const previewVideoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const editorRef = useRef<HTMLDivElement>(null);
    const stopButtonRef = useRef<HTMLButtonElement>(null);
    const cropRef = useRef(normalizeCrop(crop));
    const [stream, setStream] = useState<MediaStream | null>(null);
    const [editing, setEditing] = useState(false);
    const [projectionHidden, setProjectionHidden] = useState(false);
    const [error, setError] = useState("");
    const [query, setQuery] = useState("");
    const [analysis, setAnalysis] = useState("");
    const [analysisError, setAnalysisError] = useState("");
    const [isAnalysing, setIsAnalysing] = useState(false);
    const [stopArmed, setStopArmed] = useState(false);

    useEffect(() => { cropRef.current = normalizeCrop(crop); }, [crop]);

    useEffect(() => {
        for (const video of [hiddenVideoRef.current, previewVideoRef.current]) {
            if (video) {
                video.srcObject = stream;
                if (stream) void video.play().catch(() => undefined);
            }
        }
    }, [stream, editing]);

    useEffect(() => {
        if (!stream) return;
        const track = stream.getVideoTracks()[0];
        const stopWhenEnded = () => { setStream(null); setEditing(false); setProjectionHidden(false); setStopArmed(false); };
        track?.addEventListener("ended", stopWhenEnded);
        return () => track?.removeEventListener("ended", stopWhenEnded);
    }, [crop, stream]);

    useEffect(() => () => { stream?.getTracks().forEach(track => track.stop()); }, [stream]);

    useEffect(() => {
        if (!stopArmed) return;
        const resetStop = (event: PointerEvent) => {
            if (!stopButtonRef.current?.contains(event.target as Node)) setStopArmed(false);
        };
        window.addEventListener("pointerdown", resetStop);
        return () => window.removeEventListener("pointerdown", resetStop);
    }, [stopArmed]);

    useEffect(() => {
        if (!stream) return;
        let animationFrame = 0;
        const draw = () => {
            const video = hiddenVideoRef.current;
            const canvas = canvasRef.current;
            if (video && canvas && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
                const displayWidth = Math.max(1, Math.round(canvas.clientWidth));
                const displayHeight = Math.max(1, Math.round(canvas.clientHeight));
                const pixelRatio = window.devicePixelRatio || 1;
                const width = Math.round(displayWidth * pixelRatio);
                const height = Math.round(displayHeight * pixelRatio);
                if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
                const selected = cropRef.current;
                const sourceWidth = video.videoWidth || 1;
                const sourceHeight = video.videoHeight || 1;
                const context = canvas.getContext("2d");
                if (context) {
                    context.imageSmoothingQuality = "high";
                    const croppedWidth = selected.width * sourceWidth;
                    const croppedHeight = selected.height * sourceHeight;
                    const scale = Math.max(width / croppedWidth, height / croppedHeight);
                    const drawnWidth = croppedWidth * scale;
                    const drawnHeight = croppedHeight * scale;
                    context.fillStyle = "#081523";
                    context.fillRect(0, 0, width, height);
                    context.drawImage(video, selected.x * sourceWidth, selected.y * sourceHeight, croppedWidth, croppedHeight, (width - drawnWidth) / 2, (height - drawnHeight) / 2, drawnWidth, drawnHeight);
                }
            }
            animationFrame = window.requestAnimationFrame(draw);
        };
        animationFrame = window.requestAnimationFrame(draw);
        return () => window.cancelAnimationFrame(animationFrame);
    }, [stream]);

    async function startCapture() {
        if (!navigator.mediaDevices?.getDisplayMedia) { setError("This browser cannot share a screen or window."); return; }
        setError("");
        try {
            const nextStream = await navigator.mediaDevices.getDisplayMedia({video: true, audio: false});
            stream?.getTracks().forEach(track => track.stop());
            setStream(nextStream);
            setProjectionHidden(false);
            setAnalysis("");
            setAnalysisError("");
            setStopArmed(false);
        } catch (captureError) {
            const message = captureError instanceof Error ? captureError.message : "Screen sharing was cancelled.";
            setError(message === "NotAllowedError" ? "Screen sharing was cancelled." : message);
        }
    }

    function stopCapture() {
        stream?.getTracks().forEach(track => track.stop());
        setStream(null);
        setEditing(false);
        setProjectionHidden(false);
        setAnalysis("");
        setAnalysisError("");
        setStopArmed(false);
    }

    function clearProjectionSearch() {
        if (isAnalysing) return;
        setQuery("");
        setAnalysis("");
        setAnalysisError("");
    }

    function captureProjectionImage() {
        const video = hiddenVideoRef.current;
        if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth || !video.videoHeight) {
            throw new Error("The projection is not ready yet. Wait a moment and try again.");
        }
        const selected = cropRef.current;
        const sourceWidth = video.videoWidth;
        const sourceHeight = video.videoHeight;
        const cropWidth = Math.max(1, Math.round(selected.width * sourceWidth));
        const cropHeight = Math.max(1, Math.round(selected.height * sourceHeight));
        const maximumSide = 1600;
        const scale = Math.min(1, maximumSide / Math.max(cropWidth, cropHeight));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(cropWidth * scale));
        canvas.height = Math.max(1, Math.round(cropHeight * scale));
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Your browser could not capture the projection.");
        context.drawImage(video, Math.round(selected.x * sourceWidth), Math.round(selected.y * sourceHeight), cropWidth, cropHeight, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL("image/jpeg", .86);
    }

    async function analyseProjection() {
        setAnalysisError("");
        let imageDataUrl = "";
        try {
            imageDataUrl = captureProjectionImage();
        } catch (captureError) {
            setAnalysisError(captureError instanceof Error ? captureError.message : "Unable to capture the projection.");
            return;
        }

        const confirmed = window.confirm("FolderRocket will send one current screenshot of this projection to OpenAI for this analysis. It may contain private content and use API credit. Continue?");
        if (!confirmed) return;

        setIsAnalysing(true);
        try {
            const response = await fetch(`${API_BASE_URL}/projection/analyze`, {
                method: "POST",
                credentials: "include",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({imageDataUrl, query})
            });
            const data = await response.json().catch(() => ({})) as {analysis?: string; message?: string};
            if (!response.ok) throw new Error(data.message || "Projection analysis failed.");
            setAnalysis(data.analysis || "No readable text was found in the projection.");
        } catch (analysisFailure) {
            setAnalysisError(analysisFailure instanceof Error ? analysisFailure.message : "Projection analysis failed.");
        } finally {
            setIsAnalysing(false);
        }
    }

    function updateCrop(next: ScreenCaptureCrop) {
        const normalized = normalizeCrop(next);
        cropRef.current = normalized;
        onCropChange(normalized);
    }

    function beginCropAction(event: ReactPointerEvent<HTMLElement>, action: CropAction) {
        const editor = editorRef.current;
        if (!editor) return;
        event.preventDefault();
        event.stopPropagation();
        const bounds = editor.getBoundingClientRect();
        const startX = event.clientX;
        const startY = event.clientY;
        const startCrop = cropRef.current;
        event.currentTarget.setPointerCapture(event.pointerId);
        const move = (moveEvent: PointerEvent) => {
            const deltaX = (moveEvent.clientX - startX) / bounds.width;
            const deltaY = (moveEvent.clientY - startY) / bounds.height;
            if (action === "move") {
                updateCrop({...startCrop, x: clamp(startCrop.x + deltaX, 0, 1 - startCrop.width), y: clamp(startCrop.y + deltaY, 0, 1 - startCrop.height)});
                return;
            }
            let left = startCrop.x;
            let top = startCrop.y;
            let right = startCrop.x + startCrop.width;
            let bottom = startCrop.y + startCrop.height;
            if (action.includes("w")) left = clamp(left + deltaX, 0, right - MIN_CROP_SIZE);
            if (action.includes("e")) right = clamp(right + deltaX, left + MIN_CROP_SIZE, 1);
            if (action.includes("n")) top = clamp(top + deltaY, 0, bottom - MIN_CROP_SIZE);
            if (action.includes("s")) bottom = clamp(bottom + deltaY, top + MIN_CROP_SIZE, 1);
            updateCrop({x: left, y: top, width: right - left, height: bottom - top});
        };
        const stop = () => {
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", stop);
            window.removeEventListener("pointercancel", stop);
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", stop);
        window.addEventListener("pointercancel", stop);
    }

    const selected = normalizeCrop(crop);
    const zoomLevel = Math.max(1, 1 / Math.max(selected.width, selected.height));
    return <section className="sourceCard screenCaptureCard">
        <video className="screenCaptureHiddenVideo" ref={hiddenVideoRef} autoPlay muted playsInline />
        <div className="sourceHeader"><Monitor className="screenCaptureIcon" size={27} /><span className="sourceTitle">Screen</span>{stream && <button ref={stopButtonRef} type="button" className={stopArmed ? "screenCaptureStop armed" : "screenCaptureStop"} onClick={() => { if (stopArmed) stopCapture(); else setStopArmed(true); }} aria-pressed={stopArmed} title={stopArmed ? "Click again to stop sharing" : "Stop sharing"}><X size={15} /></button>}</div>
        {!stream ? <div className="screenCaptureEmpty"><Monitor size={26} /><strong>Project a window or screen</strong><p>Select a browser tab, a window such as Outlook, or your screen. FolderRocket only displays it locally while sharing is active.</p><button type="button" onClick={() => void startCapture()}>Choose what to project</button>{error && <small>{error}</small>}</div> : <>
            <div className="screenCaptureToolbar"><button type="button" className={editing ? "active" : ""} onClick={() => { setProjectionHidden(false); setEditing(current => !current); }}><SlidersHorizontal size={15} />{editing ? "View" : "Adjust frame"}</button><span>{editing ? "Drag the frame or its corners." : `Live · ${zoomLevel.toFixed(1)}×`}</span><button type="button" className="screenProjectionVisibility" onClick={() => { setEditing(false); setProjectionHidden(current => !current); }}>{projectionHidden ? "Show" : "Hide"}</button></div>
            {editing ? <div className="screenCaptureEditor" ref={editorRef}><video ref={previewVideoRef} autoPlay muted playsInline /><div className="screenCropBox" style={{left: `${selected.x * 100}%`, top: `${selected.y * 100}%`, width: `${selected.width * 100}%`, height: `${selected.height * 100}%`}} onPointerDown={event => beginCropAction(event, "move")}><span className="screenCropHandle nw" onPointerDown={event => beginCropAction(event, "nw")} /><span className="screenCropHandle ne" onPointerDown={event => beginCropAction(event, "ne")} /><span className="screenCropHandle sw" onPointerDown={event => beginCropAction(event, "sw")} /><span className="screenCropHandle se" onPointerDown={event => beginCropAction(event, "se")} /></div></div> : <div className={projectionHidden ? "screenProjectionCanvas isHidden" : "screenProjectionCanvas"}><canvas ref={canvasRef} /></div>}
            <div className={`projectionSearchPanel${projectionHidden ? " expanded" : ""}`}>
                <div className="projectionSearchControls"><input value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === "Enter") void analyseProjection(); }} placeholder="Ask about the visible text…" aria-label="Ask about the projected screen" /><button type="button" onClick={() => void analyseProjection()} disabled={isAnalysing}>{isAnalysing ? <LoaderCircle className="spinning" size={14} /> : <Search size={14} />}{isAnalysing ? "Analysing…" : "Analyse"}</button><button type="button" className="projectionSearchClear" onClick={clearProjectionSearch} disabled={isAnalysing || (!query && !analysis && !analysisError)} title="Clear search and result" aria-label="Clear search and result"><X size={14} /></button></div>
                <p>Captures one current frame only after confirmation; uses AI credit.</p>
                {(projectionHidden || analysis || analysisError) && <div className={`projectionAnalysisResult${analysisError ? " error" : ""}`}>{isAnalysing ? "Analysing the current frame…" : analysisError || analysis || "The projection is hidden. Ask a question to analyse the current frame."}</div>}
            </div>
        </>}
    </section>;
}
