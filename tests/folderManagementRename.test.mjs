import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import {createRequire} from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const source = fs.readFileSync(new URL("../src/components/FolderManagement.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("FolderManagement.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const handlers = [];
function visit(node) {
    if (ts.isFunctionDeclaration(node) && ["beginRenameFile", "renameFile"].includes(node.name?.text)) handlers.push(node.getText(ast));
    ts.forEachChild(node, visit);
}
visit(ast);
assert.equal(handlers.length, 2, "test executes the actual controlled rename handlers");
const script = ts.transpileModule(handlers.join("\n"), {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;

function harness(fetchReply) {
    const file = {name:"original.pdf", path:"C:\\Synthetic\\original.pdf", size:31};
    const updates = [];
    const state = {
        renameTarget:null, renameName:"", renameError:"", renamingFile:false, message:"",
        results:[file], moveQueue:[file], selectedPaths:[file.path], selectedFiles:[file],
        folderContents:{root:{files:[file],folders:[]}}
    };
    const requests = [];
    const context = {
        ...state, API_BASE_URL:"http://synthetic.test",
        folders:[{id:"virtual",storage:"imaginary",virtualFiles:[file]}],
        onUpdate:(id,change)=>updates.push({id,change}),
        fetch:async(url,options)=>{requests.push({url,options}); return fetchReply(url,options);},
        window:{prompt(){throw new Error("prompt() is not supported.");}}
    };
    for (const key of Object.keys(state)) {
        context[`set${key[0].toUpperCase()}${key.slice(1)}`] = value => {
            context[key] = typeof value === "function" ? value(context[key]) : value;
        };
    }
    vm.createContext(context);
    vm.runInContext(script, context);
    return {context,file,requests,updates};
}

test("opening rename never calls the unsupported Electron prompt or sends a request", () => {
    const {context,file,requests} = harness(()=>{throw new Error("must not fetch before confirmation");});
    context.beginRenameFile(file);
    assert.equal(context.renameTarget,file);
    assert.equal(context.renameName,file.name);
    assert.equal(requests.length,0);
});

test("blank and unchanged names do not send a rename request", async () => {
    const {context,file,requests} = harness(()=>{throw new Error("invalid name submitted");});
    context.beginRenameFile(file);
    await context.renameFile();
    context.renameName="  ";
    await context.renameFile();
    assert.match(context.renameError,/file name/i);
    assert.equal(requests.length,0);
    assert.equal(context.results[0].path,file.path);
});

test("confirmed rename updates lists, selections and virtual references only after success", async () => {
    const reply={name:"renamed.pdf",path:"C:\\Synthetic\\renamed.pdf"};
    const {context,file,requests,updates}=harness(async()=>({ok:true,json:async()=>reply}));
    context.beginRenameFile(file);
    context.renameName=" renamed ";
    await context.renameFile();
    assert.deepEqual(JSON.parse(requests[0].options.body),{path:file.path,name:"renamed"});
    assert.equal(requests[0].options.credentials,"include");
    for (const key of ["results","moveQueue","selectedFiles"]) assert.equal(context[key][0].path,reply.path);
    assert.equal(context.selectedPaths[0],reply.path);
    assert.equal(context.folderContents.root.files[0].name,reply.name);
    assert.equal(updates[0].change.virtualFiles[0].path,reply.path);
    assert.equal(file.path,"C:\\Synthetic\\original.pdf","the prior record is not mutated");
    assert.equal(context.renameTarget,null);
    assert.equal(context.renamingFile,false);
});

for (const [label,fetchReply] of [
    ["collision",async()=>({ok:false,json:async()=>({message:"The target already exists."})})],
    ["network error",async()=>{throw new Error("Connection interrupted.");}],
    ["invalid JSON",async()=>({ok:true,json:async()=>{throw new Error("Invalid JSON");}})]
]) {
    test(`${label} preserves the dialog and every original file reference`, async()=>{
        const {context,file,updates}=harness(fetchReply);
        context.beginRenameFile(file);
        context.renameName="renamed";
        await context.renameFile();
        assert.equal(context.renameTarget,file);
        assert.ok(context.renameError);
        assert.equal(context.renamingFile,false);
        assert.equal(context.results[0].path,file.path);
        assert.equal(context.selectedPaths[0],file.path);
        assert.equal(context.folderContents.root.files[0].path,file.path);
        assert.equal(updates.length,0);
    });
}
