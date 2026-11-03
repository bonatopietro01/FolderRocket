import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read = path => readFileSync(new URL(path, import.meta.url), "utf8");

test("R38 keeps the selected Gmail identity inside Read attachments and distinguishes missing account state", () => {
    const gmail = read("../src/components/GmailSourcePanel.tsx");
    assert.doesNotMatch(gmail, /emailWorldAccountBadge/);
    const menu = gmail.slice(gmail.indexOf("role=\"dialog\" aria-label=\"Gmail account and attachment settings\""), gmail.indexOf("<hr/>"));
    assert.equal((menu.match(/Account for this planet/g) || []).length, 1);
    assert.match(gmail, /worldAccountEmail\s*\|\|\s*selectedCatalogAccount\?\.email\s*\|\|\s*"Linked account · address unavailable"/);
    assert.match(gmail, /"Loading planet account…"/);
    assert.match(gmail, /"Planet account could not be checked"/);
    assert.match(gmail, /"No account linked to this planet"/);
});

test("R39 loads saved domains only in the embedded page and preserves explicit AI analysis", () => {
    const domain = read("../src/components/DomainSourcePanel.tsx");
    assert.doesNotMatch(domain, /\/domain\/preview|domainReadablePreview|previewLoading|loadPreview/);
    assert.match(domain, /<iframe key=\{loadedUrl\} src=\{loadedUrl\}/);
    assert.match(domain, /\/domain\/analyze/);
    assert.match(domain, /analyseDomain\(\)/);
});

test("R45 removes recap explanation and inbox status without removing draft controls", () => {
    const daily = read("../src/components/DailyJob.tsx");
    assert.doesNotMatch(daily, /Prepara una bozza per il mittente che scegli qui/);
    assert.doesNotMatch(daily, /Planet inbox for Conversations and alerts/);
    assert.match(daily, /Recap sender/);
    assert.match(daily, /Create recap draft/);
    assert.match(daily, /createRecapDraft\(\)/);
});

test("R46-R49 keep saved styles distinct and render Star, Galaxy, and Black hole with lightweight silhouettes", () => {
    const css = read("../src/worlds.css");
    const star = css.slice(css.lastIndexOf(".worldPlanet.glowing .worldPlanetCore {"));
    assert.match(star, /clip-path:none/);
    assert.match(star, /radial-gradient\(ellipse at 29% 24%/);
    assert.match(css, /\.worldGalaxyArms\s*\{[\s\S]*?conic-gradient[\s\S]*?mask:radial-gradient/);
    assert.match(css, /\.worldPlanet\.black-hole \.worldPlanetCore\s*\{[\s\S]*?radial-gradient\(circle,#000 0 72%/);
    for (const style of ["planet", "rocky", "ringed", "glowing", "asteroid", "black-hole", "galaxy"]) {
        assert.match(css, new RegExp(`\\.worldPlanet\\.${style.replace("-", "\\-")} \\.worldPlanetCore`));
    }
});
