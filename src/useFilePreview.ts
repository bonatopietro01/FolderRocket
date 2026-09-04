import {useEffect, useState} from 'react';
import {API_BASE_URL} from './api';

interface FilePreview {
    kind: 'loading' | 'text' | 'image' | 'pdf' | 'unavailable';
    text?: string;
    url?: string;
    message?: string;
}

// Key results by path so switching files never shows the previous preview.
export function useFilePreview(path?: string): FilePreview | null {
    const [result, setResult] = useState<{path: string; preview: FilePreview} | null>(null);
    useEffect(() => {
        if (!path) return;
        const controller = new AbortController();
        void (async () => {
            let preview: FilePreview;
            try {
                const response = await fetch(`${API_BASE_URL}/files/preview`, {
                    method: 'POST', signal: controller.signal, credentials: 'include',
                    headers: {'Content-Type': 'application/json'}, body: JSON.stringify({path})
                });
                const data = await response.json() as FilePreview;
                preview = response.ok && data.kind ? data : {kind: 'unavailable', message: data.message || 'Preview unavailable.'};
            } catch { preview = {kind: 'unavailable', message: 'Unable to load this preview.'}; }
            if (!controller.signal.aborted) setResult({path, preview});
        })();
        return () => controller.abort();
    }, [path]);
    if (!path) return null;
    return result?.path === path ? result.preview : {kind: 'loading'};
}
