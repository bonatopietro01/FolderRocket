const MIN_MAIN_ZOOM = 0.75;
const MAX_MAIN_ZOOM = 1.5;
const MAIN_ZOOM_STEP = 0.05;
const MAIN_WINDOW_MIN_LAYOUT_CSS_WIDTH = 1220;
const MAIN_WINDOW_MIN_NATIVE_CONTENT_WIDTH = 1200;
const MAIN_WINDOW_MIN_HEIGHT = 700;
// On the measured Windows work area, Electron's settled native bounds were
// 2 DIP taller than the requested height. Keep this small platform inset so
// the actual window remains within the display work area.
const MAIN_WINDOW_NATIVE_BOUNDS_GUARD = 2;

function finitePositive(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : fallback;
}

function getMainWindowZoomLimits({workAreaWidth, frameWidth, minLayoutCssWidth, min = MIN_MAIN_ZOOM, max = MAX_MAIN_ZOOM, step = MAIN_ZOOM_STEP}) {
    const displayWidth = finitePositive(workAreaWidth);
    const nativeFrameWidth = Math.max(0, Number(frameWidth) || 0);
    const layoutWidth = finitePositive(minLayoutCssWidth);
    const minimum = finitePositive(min, MIN_MAIN_ZOOM);
    const maximum = Math.max(minimum, finitePositive(max, MAX_MAIN_ZOOM));
    const increment = finitePositive(step, MAIN_ZOOM_STEP);
    const availableContentWidth = Math.max(0, displayWidth - nativeFrameWidth);
    const fittingMaximum = layoutWidth ? Math.min(maximum, availableContentWidth / layoutWidth) : maximum;
    const fits = fittingMaximum + 1e-9 >= minimum;
    const steppedMaximum = Math.floor(fittingMaximum / increment + 1e-9) * increment;
    const limitedMaximum = fits ? Number(steppedMaximum.toFixed(2)) : minimum;

    return {min: minimum, max: limitedMaximum, fits, availableContentWidth};
}

function clampMainZoomFactor(requested, limits) {
    const minimum = finitePositive(limits?.min, MIN_MAIN_ZOOM);
    const maximum = Math.max(minimum, finitePositive(limits?.max, MAX_MAIN_ZOOM));
    const candidate = Number(requested);
    const zoom = Number.isFinite(candidate) ? candidate : 1;
    return Math.min(maximum, Math.max(minimum, zoom));
}

function getMainWindowMinimumSize({zoomFactor, workAreaWidth, workAreaHeight, frameWidth, minLayoutCssWidth, availableContentWidth, nativeContentWidth = MAIN_WINDOW_MIN_NATIVE_CONTENT_WIDTH, minimumHeight = MAIN_WINDOW_MIN_HEIGHT}) {
    const displayWidth = finitePositive(workAreaWidth);
    const displayHeight = finitePositive(workAreaHeight);
    const nativeFrameWidth = Math.max(0, Number(frameWidth) || 0);
    const available = Math.max(0, Number.isFinite(Number(availableContentWidth))
        ? Number(availableContentWidth)
        : displayWidth - nativeFrameWidth);
    const nativeFloor = Math.min(finitePositive(nativeContentWidth, MAIN_WINDOW_MIN_NATIVE_CONTENT_WIDTH), available);
    const layoutWidth = finitePositive(minLayoutCssWidth);
    const zoom = clampMainZoomFactor(zoomFactor, {min: MIN_MAIN_ZOOM, max: MAX_MAIN_ZOOM});
    // Never ask Windows for a minimum wider than this display can show. When
    // fits is false the renderer reports that the supported zoom floor cannot
    // accommodate the whole row, while the native window remains on-screen.
    const contentWidth = Math.min(available, Math.max(nativeFloor, layoutWidth * zoom));
    const usableHeight = Math.max(1, displayHeight - MAIN_WINDOW_NATIVE_BOUNDS_GUARD);
    const boundedHeight = Math.min(finitePositive(minimumHeight, MAIN_WINDOW_MIN_HEIGHT), usableHeight);

    return {
        width: Math.max(1, Math.ceil(contentWidth + nativeFrameWidth)),
        height: Math.max(1, Math.floor(boundedHeight))
    };
}

function clampMainWindowBounds(bounds, workArea) {
    const area = {
        x: Number(workArea?.x) || 0,
        y: Number(workArea?.y) || 0,
        width: finitePositive(workArea?.width, 1),
        height: finitePositive(workArea?.height, 1)
    };
    const width = Math.min(finitePositive(bounds?.width, area.width), area.width);
    const height = Math.min(finitePositive(bounds?.height, area.height), area.height);
    const maxX = area.x + area.width - width;
    const maxY = area.y + area.height - height;
    const requestedX = Number.isFinite(Number(bounds?.x)) ? Number(bounds.x) : area.x;
    const requestedY = Number.isFinite(Number(bounds?.y)) ? Number(bounds.y) : area.y;

    return {
        x: Math.round(Math.min(maxX, Math.max(area.x, requestedX))),
        y: Math.round(Math.min(maxY, Math.max(area.y, requestedY))),
        width: Math.floor(width),
        height: Math.floor(height)
    };
}

module.exports = {
    MIN_MAIN_ZOOM,
    MAX_MAIN_ZOOM,
    MAIN_ZOOM_STEP,
    MAIN_WINDOW_MIN_LAYOUT_CSS_WIDTH,
    MAIN_WINDOW_MIN_NATIVE_CONTENT_WIDTH,
    MAIN_WINDOW_MIN_HEIGHT,
    MAIN_WINDOW_NATIVE_BOUNDS_GUARD,
    getMainWindowZoomLimits,
    clampMainZoomFactor,
    getMainWindowMinimumSize,
    clampMainWindowBounds
};
