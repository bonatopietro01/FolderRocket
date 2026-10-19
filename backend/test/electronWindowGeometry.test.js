const test = require("node:test");
const assert = require("node:assert/strict");
const {
    getMainWindowZoomLimits,
    clampMainZoomFactor,
    getMainWindowMinimumSize,
    clampMainWindowBounds
} = require("../../desktop/mainWindowGeometry.cjs");

test("Electron zoom limits step down to the greatest supported factor that fits", () => {
    const limits = getMainWindowZoomLimits({
        workAreaWidth: 1280,
        frameWidth: 16,
        minLayoutCssWidth: 1150
    });

    assert.deepEqual(limits, {min: 0.75, max: 1.05, fits: true, availableContentWidth: 1264});
    assert.equal(clampMainZoomFactor(1.5, limits), 1.05);
    assert.equal(clampMainZoomFactor(0.85, limits), 0.85);
});

test("a display below the supported zoom floor reports no fit without widening past its work area", () => {
    const limits = getMainWindowZoomLimits({
        workAreaWidth: 850,
        frameWidth: 16,
        minLayoutCssWidth: 1150
    });
    const minimumSize = getMainWindowMinimumSize({
        zoomFactor: limits.min,
        workAreaWidth: 850,
        workAreaHeight: 640,
        frameWidth: 16,
        minLayoutCssWidth: 1150,
        availableContentWidth: limits.availableContentWidth
    });

    assert.deepEqual({min: limits.min, max: limits.max, fits: limits.fits}, {min: 0.75, max: 0.75, fits: false});
    assert.equal(minimumSize.width, 850);
    assert.equal(minimumSize.height, 638);
    assert.equal(clampMainZoomFactor(1.25, limits), 0.75);
});

test("minimum window sizing preserves the native content floor within the available display area", () => {
    const minimumSize = getMainWindowMinimumSize({
        zoomFactor: 1.05,
        workAreaWidth: 1280,
        workAreaHeight: 672,
        frameWidth: 16,
        minLayoutCssWidth: 1150,
        availableContentWidth: 1264
    });

    assert.deepEqual(minimumSize, {width: 1224, height: 670});
});

test("the measured account-menu row caps zoom at 1.0 on the 1280 DIP display", () => {
    const limits = getMainWindowZoomLimits({
        workAreaWidth: 1280,
        frameWidth: 14,
        minLayoutCssWidth: 1220
    });
    const minimumSize = getMainWindowMinimumSize({
        zoomFactor: limits.max,
        workAreaWidth: 1280,
        workAreaHeight: 672,
        frameWidth: 14,
        minLayoutCssWidth: 1220,
        availableContentWidth: limits.availableContentWidth
    });
    const bounds = clampMainWindowBounds(
        {x: 0, y: 0, width: minimumSize.width, height: minimumSize.height},
        {x: 0, y: 0, width: 1280, height: 670}
    );

    assert.deepEqual({min: limits.min, max: limits.max, fits: limits.fits}, {min: 0.75, max: 1, fits: true});
    assert.equal(minimumSize.width, 1234);
    assert.equal(minimumSize.height, 670);
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 1280);
    assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= 672);
});

test("window bounds stay inside work areas with negative monitor coordinates", () => {
    assert.deepEqual(clampMainWindowBounds(
        {x: -2400, y: -120, width: 1440, height: 940},
        {x: -1920, y: -200, width: 1280, height: 672}
    ), {x: -1920, y: -200, width: 1280, height: 672});
});
