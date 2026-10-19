import type {PlanetGraphData, PlanetGraphNode} from "./planetGraphLayout";

export type PlanetGraphAnswer = {answer:string;matches:PlanetGraphNode[];total:number};

const STOP_WORDS=new Set(["quanti","quante","quale","quali","che","cosa","ci","sono","nel","nella","nelle","della","delle","degli","dei","del","di","il","lo","la","i","gli","le","un","una","uno","per","con","mostra","trova","cerca","dammi","elementi","elemento","items","item","please","show","find","search","how","many","what","is","are","the","in","on","of","for","and","to","planet","grafo","graph","only","solo","this","these","project","collegati","collegate","collegata","collegato","linked","connected","related","alla","all","questo","questa","these","due","scadono","oggi","today"]);
const TYPE_TERMS:Record<string,string[]>={
    folders:["folder","folders","cartella","cartelle"],files:["file","files","documento","documenti"],
    email:["email","mail","conversation","conversations","thread","threads","conversazione","conversazioni"],
    people:["person","people","contact","contacts","persona","persone","contatto","contatti"],
    calendar:["calendar","event","events","calendario","evento","eventi"],
    reminders:["reminder","reminders","alert","alerts","promemoria","avviso","avvisi"],
    activity:["activity","activities","search","attivita","ricerca","ricerche"],notes:["note","notes","postit","post-it"]
};
const TYPE_MATCHERS:Record<string,(node:PlanetGraphNode)=>boolean>={
    folders:node=>node.type==="folder",files:node=>node.type==="file",email:node=>node.type.startsWith("email"),people:node=>node.type==="person",
    calendar:node=>node.type==="calendar-event",reminders:node=>node.type==="reminder"||node.type==="alert",activity:node=>node.type==="activity"||node.type==="search",notes:node=>node.type==="note"
};

function localDateKey(date:Date){return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;}

export function answerPlanetGraphQuery(graph:PlanetGraphData,rawQuery:string,focusNodeId?:string,now=new Date()):PlanetGraphAnswer {
    const query=rawQuery.trim().toLocaleLowerCase();
    if(!query)return {answer:"Scrivi una domanda o un nome da cercare nel grafo di questo pianeta.",matches:[],total:0};
    const queryTerms=query.split(/[^\p{L}\p{N}@._-]+/u).filter(Boolean);
    const requestedType=Object.entries(TYPE_TERMS).find(([,values])=>queryTerms.some(term=>values.includes(term)))?.[0];
    const terms=queryTerms.filter(term=>term.length>1&&!STOP_WORDS.has(term)&&!Object.values(TYPE_TERMS).some(values=>values.includes(term)));
    const predicate=requestedType?TYPE_MATCHERS[requestedType]:()=>true;
    const asksToday=/\b(today|oggi)\b/u.test(query);
    const asksLinked=/\b(linked|connected|related|collegat[oaie])\b/u.test(query);
    if(asksLinked&&!focusNodeId)return {answer:"Select a graph item first; I can show only relationships explicitly present in this planet’s graph.",matches:[],total:0};
    const linkedIds=new Set<string>();
    if(asksLinked&&focusNodeId){linkedIds.add(focusNodeId);for(const edge of graph.edges)if(edge.from===focusNodeId)linkedIds.add(edge.to);else if(edge.to===focusNodeId)linkedIds.add(edge.from);}
    const today=localDateKey(now);
    const matchingNodes=graph.nodes.filter(node=>{
        if(!predicate(node))return false;
        if(asksLinked&&!linkedIds.has(node.id))return false;
        if(asksToday){const dates=[node.details?.at,node.details?.start,node.details?.due,node.sourceRef?.at,node.sourceRef?.start].filter((value):value is string=>typeof value==="string").map(value=>new Date(value)).filter(value=>!Number.isNaN(value.getTime()));if(!dates.some(value=>localDateKey(value)===today))return false;}
        if(!terms.length)return true;
        const searchable=[node.label,node.type,node.sourceType,...Object.values(node.details||{}).filter(value=>typeof value==="string"),...Object.values(node.sourceRef||{}).filter(value=>typeof value==="string")].join(" ").toLocaleLowerCase();
        return terms.every(term=>searchable.includes(term));
    });
    const matches=matchingNodes.slice(0,20);
    const total=matchingNodes.length;
    const asksCount=/\b(quanti|quante|how many|count|numero|totale)\b/u.test(query);
    const category=requestedType?requestedType:"elementi";
    const answer=total===0?"Non ho trovato elementi corrispondenti nel grafo indicizzato di questo pianeta.":asksCount?`Nel grafo indicizzato ci sono ${total} ${category} corrispondenti${total>matches.length?`; mostro i primi ${matches.length}`:""}.`:`Ho trovato ${total} ${category} corrispondenti${total>matches.length?`; mostro i primi ${matches.length}`:""}. Seleziona una fonte qui sotto per evidenziarla nel grafo.`;
    return {answer,matches,total};
}
