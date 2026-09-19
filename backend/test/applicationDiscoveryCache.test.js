const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

test("application discovery cache persists, validates extensions, and removes entries", async t => {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "folderrocket-cache-"));
    t.after(() => fs.promises.rm(root, {recursive:true,force:true}));
    process.env.FOLDERROCKET_DATA_DIR = root;
    const cache = require("../services/applicationDiscoveryCache");
    const result = {
        files:[{name:"drawing.sldprt",path:path.join(root,"drawing.sldprt"),size:42}],
        directories:[{path:root,mtimeMs:123}]
    };
    cache.write("user-a","solidworks",["sldprt","sldasm"],result);
    const restored = cache.read("user-a","solidworks",["sldasm","sldprt"]);
    assert.deepEqual(restored.files,result.files);
    assert.deepEqual(restored.directories,result.directories);
    assert.equal(cache.read("user-a","solidworks",["pdf"]),null);
    cache.remove("user-a","solidworks");
    assert.equal(cache.read("user-a","solidworks",["sldasm","sldprt"]),null);
});
