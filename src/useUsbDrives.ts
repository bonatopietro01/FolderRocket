import {useCallback, useEffect, useRef, useState} from 'react';
import {API_BASE_URL} from './api';
import type {UsbDrive} from './components/UsbSourcePanel';

export function useUsbDrives(enabled: boolean) {
    const [drives, setDrives] = useState<UsbDrive[] | null>(null);
    const [error, setError] = useState('');
    const request = useRef<AbortController | null>(null);
    const refresh = useCallback(async () => {
        if (!enabled || request.current) return;
        const controller = new AbortController();
        request.current = controller;
        try {
            const response = await fetch(`${API_BASE_URL}/devices/removable`, {credentials:'include', signal:controller.signal});
            const data = await response.json();
            if (!response.ok || !Array.isArray(data.drives) || !data.drives.every((drive:UsbDrive) => typeof drive?.path === 'string')) throw new Error(data.message || 'Unable to check USB drives.');
            if (controller.signal.aborted) return;
            setDrives(previous => JSON.stringify(previous) === JSON.stringify(data.drives) ? previous : data.drives);
            setError('');
            return data.drives as UsbDrive[];
        } catch (reason) {
            // A failed check is not evidence of disconnection: preserve references.
            if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Unable to check USB drives.');
        } finally { if (request.current === controller) request.current = null; }
    }, [enabled]);

    useEffect(() => {
        if (!enabled) return;
        let active = true;
        queueMicrotask(() => { if (active) void refresh(); });
        const timer = window.setInterval(() => void refresh(), 5000);
        const focus = () => void refresh();
        window.addEventListener('focus', focus);
        return () => { active = false; window.clearInterval(timer); window.removeEventListener('focus', focus); request.current?.abort(); request.current = null; };
    }, [enabled, refresh]);
    return {drives, error, refresh};
}
