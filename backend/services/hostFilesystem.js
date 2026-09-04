// The backend and its dependencies are packaged outside app.asar (extraResources).
// File browsing must describe the host filesystem, not Electron's virtual ASAR
// directories. Besides misclassifying archives, Electron's synthetic Stats trigger
// DEP0180 on current runtimes. This affects only the backend process; the desktop
// main process keeps ASAR support to load the packaged application.
if (process.versions.electron) process.noAsar = true;
