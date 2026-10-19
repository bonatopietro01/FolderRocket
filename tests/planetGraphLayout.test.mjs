import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {normalizePlanetGraphData, positionPlanetGraphNodes} from "../src/components/planetGraphLayout.ts";

test("layout assigns positions to every visible node, including nodes beyond the old ring cap", () => {
    const nodes=Array.from({length:1200},(_,index)=>({id:`folder-${index}`,type:"folder",label:`Folder ${index}`}));
    const positions=positionPlanetGraphNodes(nodes);
    assert.equal(positions.size,nodes.length);
    assert.ok(nodes.every(node=>Number.isFinite(positions.get(node.id)?.x)&&Number.isFinite(positions.get(node.id)?.y)));
});

test("layout positions every world node", () => {
    const nodes=["one","two","three"].map(id=>({id,type:"world",label:id}));
    const positions=positionPlanetGraphNodes(nodes);
    assert.equal(positions.size,nodes.length);
    assert.ok(nodes.every(node=>Number.isFinite(positions.get(node.id)?.x)&&Number.isFinite(positions.get(node.id)?.y)));
});

test("large knowledge layouts keep every node inside the initial graph viewport", () => {
    const nodes=Array.from({length:500},(_,index)=>({id:`knowledge-${index}`,type:"knowledge-document",label:`Knowledge ${index}`}));
    const positions=positionPlanetGraphNodes(nodes);
    assert.equal(positions.size,nodes.length);
    assert.ok(nodes.every(node=>{
        const point=positions.get(node.id);
        return point&&point.x>=0&&point.x<=1800&&point.y>=0&&point.y<=1080;
    }));
});

test("invalid graph node and edge shapes are discarded before layout", () => {
    const graph=normalizePlanetGraphData({
        nodes:[{id:"good",type:"file",label:"Good",sourceRef:[]},{id:"bad-label",type:"file",label:null},{id:"bad-type",type:4,label:"Bad"},null],
        edges:[{id:"good-edge",type:"contains",from:"good",to:"good"},{id:"missing-endpoint",type:"contains",from:"good",to:"missing"},{id:"bad-from",type:"contains",from:null,to:"good"},null]
    });
    assert.deepEqual(graph.nodes.map(node=>node.id),["good"]);
    assert.deepEqual(graph.edges.map(edge=>edge.id),["good-edge"]);
    assert.equal(graph.nodes[0].sourceRef,undefined);
    const positions=positionPlanetGraphNodes(graph.nodes);
    assert.ok(Number.isFinite(positions.get("good")?.x)&&Number.isFinite(positions.get("good")?.y));
});

test("planet graph identifies Obsidian and explains verified shared graph/vault links", () => {
    const component=readFileSync(new URL("../src/components/PlanetGraph.tsx",import.meta.url),"utf8");
    const css=readFileSync(new URL("../src/App.css",import.meta.url),"utf8");
    assert.match(component,/obsidianMark from "\.\.\/assets\/obsidian-mark\.svg"/);
    assert.match(component,/<h1>Planet \{world\.name\} Graph<\/h1>/);
    assert.match(component,/Knowledge links and generated Obsidian notes share the same planet scope/);
    assert.match(css,/\.planetGraphTitle>img\s*\{/);
    assert.match(css,/\.planetGraphRelationshipGuide\s*\{/);
});

test("graph normalization preserves separate global and source diagnostic causes", () => {
    const graph=normalizePlanetGraphData({sourceStatuses:[{sourceId:"folder:a",type:"folder",label:"A",status:"partial",issues:[
        {scope:"global",reasonCode:"file_limit",message:"Global scan exhausted",retryable:false},
        {scope:"source",reasonCode:"permission_denied",message:"Nested folder denied",retryable:true},
        {scope:"invalid",reasonCode:"x",message:"Malformed"},null
    ]}]});
    assert.deepEqual(graph.sourceStatuses[0].issues,[
        {scope:"global",reasonCode:"file_limit",message:"Global scan exhausted",retryable:false},
        {scope:"source",reasonCode:"permission_denied",message:"Nested folder denied",retryable:true}
    ]);
});
