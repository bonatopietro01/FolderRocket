import test from "node:test";
import assert from "node:assert/strict";
import {answerPlanetGraphQuery} from "../src/components/planetGraphQuery.ts";

const graph={nodes:[
    {id:"f1",type:"folder",label:"Research",sourceType:"filesystem",sourceRef:{path:"C:/Research"},details:{}},
    {id:"f2",type:"folder",label:"Personal",sourceType:"filesystem",sourceRef:{path:"C:/Personal"},details:{}},
    {id:"m1",type:"email-thread",label:"Research update",sourceType:"gmail",sourceRef:{threadId:"thread-1"},details:{accountEmail:"p@example.test"}},
    {id:"n1",type:"note",label:"Meeting reminder",sourceType:"sticky-note",sourceRef:{id:"note-1"},details:{}}
],edges:[],warnings:[],progress:{stage:"complete",processed:4,total:4},status:"ready",sharedThreads:[]};

test("planet graph chat answers locally with matching source node citations",()=>{
    const answer=answerPlanetGraphQuery(graph,"how many email conversations");
    assert.equal(answer.total,1);
    assert.deepEqual(answer.matches.map(node=>node.id),["m1"]);
    assert.match(answer.answer,/1 email/);
});

test("planet graph chat searches labels and reports empty and blank queries",()=>{
    assert.deepEqual(answerPlanetGraphQuery(graph,"research").matches.map(node=>node.id),["f1","m1"]);
    assert.equal(answerPlanetGraphQuery(graph,"unknown item").total,0);
    assert.equal(answerPlanetGraphQuery(graph,"").matches.length,0);
});

test("planet graph chat limits relationship answers to explicit graph edges from the selected item",()=>{
    const related={...graph,edges:[{id:"edge-1",type:"contains",from:"f1",to:"m1"}]};
    const response=answerPlanetGraphQuery(related,"show linked items", "f1");
    assert.deepEqual(response.matches.map(node=>node.id),["f1","m1"]);
    assert.equal(answerPlanetGraphQuery(related,"show linked items").total,0,"without a selected graph node, no relation is inferred");
});

test("planet graph chat filters today's events and reminders by their indexed timestamps",()=>{
    const dated={...graph,nodes:[
        ...graph.nodes,
        {id:"r-today",type:"reminder",label:"Due reminder",details:{at:"2026-10-04T09:00:00"}},
        {id:"r-later",type:"reminder",label:"Later reminder",details:{at:"2026-10-05T09:00:00"}},
        {id:"e-today",type:"calendar-event",label:"Today meeting",details:{start:"2026-10-04T11:00:00Z"}}
    ]};
    const response=answerPlanetGraphQuery(dated,"quali reminder scadono oggi",undefined,new Date("2026-10-04T12:00:00"));
    assert.deepEqual(response.matches.map(node=>node.id),["r-today"]);
});
