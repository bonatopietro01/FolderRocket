export type PlanetGraphNode = {id:string;type:string;label:string;sourceType?:string;sourceRef?:Record<string,unknown>;details?:Record<string,unknown>};
export type PlanetGraphEdge = {id:string;type:string;from:string;to:string};
export type PlanetGraphSourceIssue = {scope:"source"|"global";reasonCode:string;message:string;retryable:boolean};
export type PlanetGraphSourceStatus = {sourceId:string;type:string;label:string;status:string;reasonCode?:string;message?:string;processed?:number;total?:number;retryable?:boolean;updatedAt?:string;issues?:PlanetGraphSourceIssue[]};
export type PlanetGraphData = {status:string;progress:{stage:string;processed:number;total:number;limitReached?:boolean};warnings:string[];sourceStatuses:PlanetGraphSourceStatus[];nodes:PlanetGraphNode[];edges:PlanetGraphEdge[];sharedThreads:Array<{threadId:string;blockId:string;sourceWorldId:string}>};

const isRecord=(value:unknown):value is Record<string,unknown>=>value!==null&&typeof value==="object"&&!Array.isArray(value);

export function normalizePlanetGraphData(value:unknown):PlanetGraphData {
    const data=isRecord(value)?value:{};
    const nodes=Array.isArray(data.nodes)?data.nodes.filter((node):node is PlanetGraphNode=>isRecord(node)&&typeof node.id==="string"&&node.id.length>0&&typeof node.type==="string"&&typeof node.label==="string").map(node=>({...node,sourceRef:isRecord(node.sourceRef)?node.sourceRef:undefined,details:isRecord(node.details)?node.details:undefined})):[];
    const nodeIds=new Set(nodes.map(node=>node.id));
    const edges=Array.isArray(data.edges)?data.edges.filter((edge):edge is PlanetGraphEdge=>isRecord(edge)&&typeof edge.id==="string"&&typeof edge.type==="string"&&typeof edge.from==="string"&&typeof edge.to==="string"&&nodeIds.has(edge.from)&&nodeIds.has(edge.to)):[];
    const rawProgress=isRecord(data.progress)?data.progress:{};
    const numberOrZero=(candidate:unknown)=>typeof candidate==="number"&&Number.isFinite(candidate)?candidate:0;
    const progress:PlanetGraphData["progress"]={stage:typeof rawProgress.stage==="string"?rawProgress.stage:"idle",processed:numberOrZero(rawProgress.processed),total:numberOrZero(rawProgress.total)};
    if(typeof rawProgress.limitReached==="boolean")progress.limitReached=rawProgress.limitReached;
    const sharedThreads=Array.isArray(data.sharedThreads)?data.sharedThreads.filter((item):item is {threadId:string;blockId:string;sourceWorldId:string}=>isRecord(item)&&typeof item.threadId==="string"&&typeof item.blockId==="string"&&typeof item.sourceWorldId==="string"):[];
    const sourceStatuses=Array.isArray(data.sourceStatuses)?data.sourceStatuses.filter(isRecord).filter(item=>typeof item.sourceId==="string"&&typeof item.type==="string"&&typeof item.label==="string"&&typeof item.status==="string").map(item=>({sourceId:item.sourceId as string,type:item.type as string,label:item.label as string,status:item.status as string,reasonCode:typeof item.reasonCode==="string"?item.reasonCode:undefined,message:typeof item.message==="string"?item.message:undefined,processed:numberOrZero(item.processed),total:numberOrZero(item.total),retryable:item.retryable===true,updatedAt:typeof item.updatedAt==="string"?item.updatedAt:undefined,issues:Array.isArray(item.issues)?item.issues.filter(isRecord).filter(issue=>(issue.scope==="source"||issue.scope==="global")&&typeof issue.reasonCode==="string"&&typeof issue.message==="string").slice(0,20).map(issue=>({scope:issue.scope as "source"|"global",reasonCode:issue.reasonCode as string,message:issue.message as string,retryable:issue.retryable===true})):undefined})):[];
    return {status:typeof data.status==="string"?data.status:"disabled",progress,warnings:Array.isArray(data.warnings)?data.warnings.filter((item):item is string=>typeof item==="string"):[],sourceStatuses,nodes,edges,sharedThreads};
}

export function positionPlanetGraphNodes(nodes:PlanetGraphNode[]) {
    const center={x:900,y:540};
    const groups=new Map<string,PlanetGraphNode[]>();
    for(const node of nodes){const group=node.type==="world"?"world":node.type.startsWith("email")||node.type==="person"?"email":node.type;const list=groups.get(group)||[];list.push(node);groups.set(group,list);}
    const layout=new Map<string,{x:number;y:number}>();
    const worlds=groups.get("world")||[];
    worlds.forEach((item,index)=>{const angle=(index/Math.max(worlds.length,1))*Math.PI*2;const radius=index===0?0:90;layout.set(item.id,{x:center.x+Math.cos(angle)*radius,y:center.y+Math.sin(angle)*radius});});
    const rings=[{name:"folder",angle:-Math.PI*.82},{name:"file",angle:-Math.PI*.25},{name:"email",angle:Math.PI*.1},{name:"calendar-event",angle:Math.PI*.48},{name:"reminder",angle:Math.PI*.78},{name:"note",angle:Math.PI*.93},{name:"alert",angle:-Math.PI*.55},{name:"activity",angle:-Math.PI*.98},{name:"search",angle:-Math.PI*.96}];
    for(const ring of rings){const list=(groups.get(ring.name)||[]).sort((a,b)=>a.label.localeCompare(b.label));const radius=ring.name==="folder"?340:510;list.forEach((item,index)=>{const spread=(index-(list.length-1)/2)*.14;const angle=ring.angle+spread;const row=Math.floor(index/11)*55;layout.set(item.id,{x:center.x+Math.cos(angle)*(radius+row),y:center.y+Math.sin(angle)*(radius+row)});});}
    const ringNames=new Set(["world",...rings.map(item=>item.name)]);
    const ungrouped=[...groups].filter(([group])=>!ringNames.has(group)).flatMap(([,list])=>list);
    const columns=Math.min(12,Math.max(1,Math.ceil(Math.sqrt(ungrouped.length*1.6))));
    const rows=Math.ceil(ungrouped.length/columns);
    const columnGap=columns>1?1440/(columns-1):0;
    const rowGap=rows>1?800/(rows-1):0;
    ungrouped.forEach((item,index)=>layout.set(item.id,{x:columns===1?center.x:180+(index%columns)*columnGap,y:rows===1?center.y:140+Math.floor(index/columns)*rowGap}));
    return layout;
}
