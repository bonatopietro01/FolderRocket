const {execFile} = require('child_process');
const path = require('path');

function windowsTask(script, request, timeout = 45000) {
    if (process.platform !== 'win32') return Promise.reject(new Error('This integration requires Windows.'));
    return new Promise((resolve, reject) => {
        execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-STA', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, '..', 'scripts', script), '-Request', Buffer.from(JSON.stringify(request), 'utf8').toString('base64')], {windowsHide: true, timeout, maxBuffer: 8 * 1024 * 1024, encoding: 'utf8'}, (error, stdout, stderr) => {
            if (error) return reject(new Error(error.killed ? (script === 'change-format.ps1' ? 'Word did not respond. Open Word once to finish setup/sign-in, then retry with fewer files. DOCX to DOCX does not require Word.' : 'Operation timed out. Unlock the device and retry with fewer files.') : stderr.trim() || 'Windows could not complete this operation.'));
            try { resolve(JSON.parse(stdout.replace(/^\uFEFF/, '').trim())); }
            catch { reject(new Error('Windows returned an unreadable response.')); }
        });
    });
}
module.exports = {windowsTask};
