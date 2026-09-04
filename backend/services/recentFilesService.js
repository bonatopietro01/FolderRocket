const fs = require('fs/promises');
const path = require('path');
const os = require('os');

const excluded = new Set(['node_modules', '.git', 'appdata', '$recycle.bin', 'windows', 'program files', 'program files (x86)', 'system volume information']);
function defaultRecentRoots() {
    const homes = [os.homedir(), process.env.OneDrive, process.env.OneDriveCommercial].filter(Boolean);
    return [...new Set(homes.flatMap(home => ['Downloads', 'Desktop', 'Documents'].map(name => path.join(home, name))))];
}

async function recentFiles(roots, {hours = 24, now = Date.now(), limit = 300, maxEntries = 60000, maxMs = 10000} = {}) {
    const requestedHours = Number(hours);
    if (!Number.isFinite(requestedHours) || requestedHours <= 0) throw new Error('Enter a positive number of hours.');
    const cutoff = now - requestedHours * 3600000;
    const pending = [...new Set(roots.map(root => path.resolve(root)))];
    const visited = new Set();
    const files = [];
    const started = Date.now();
    let inspected = 0, skipped = 0, truncated = false;
    outer: while (pending.length) {
        const folder = pending.shift();
        let canonical, entries;
        try {
            const stat = await fs.lstat(folder);
            if (stat.isSymbolicLink()) continue;
            canonical = await fs.realpath(folder);
            const key = process.platform === 'win32' ? canonical.toLowerCase() : canonical;
            if (visited.has(key)) continue;
            visited.add(key);
            entries = await fs.readdir(canonical, {withFileTypes: true});
        } catch { skipped++; continue; }
        for (const entry of entries) {
            if (++inspected > maxEntries || Date.now() - started > maxMs) { truncated = true; break outer; }
            if (entry.isSymbolicLink()) continue;
            const fullPath = path.join(canonical, entry.name);
            if (entry.isDirectory()) { if (!excluded.has(entry.name.toLowerCase()) && !entry.name.startsWith('.')) pending.push(fullPath); continue; }
            if (!entry.isFile() || /\.(crdownload|part|tmp)$/i.test(entry.name) || entry.name.startsWith('~$')) continue;
            try {
                const stat = await fs.stat(fullPath);
                const created = stat.birthtimeMs || stat.ctimeMs;
                if (created < cutoff || created > now + 60000) continue;
                let downloaded = false;
                if (process.platform === 'win32') {
                    const zone = await fs.readFile(`${fullPath}:Zone.Identifier`, 'utf8').catch(() => '');
                    downloaded = /ZoneId=[34]|HostUrl=/i.test(zone);
                }
                files.push({name: entry.name, path: fullPath, size: stat.size, createdAt: new Date(created).toISOString(), downloaded});
            } catch { skipped++; }
        }
    }
    files.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return {files: files.slice(0, limit), truncated: truncated || files.length > limit, inspected, skipped, roots};
}
module.exports = {recentFiles, defaultRecentRoots};
