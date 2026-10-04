import {dailyKey, type DailyActivity} from "./dailyActivity";

export interface WorldActivitySnapshot {
    updatedAt: string;
    activities: Array<{at:string;kind:string;summary:string}>;
    calendarEvents: Array<{title:string;start:string;end?:string}>;
    reminders: Array<{title:string;at:string}>;
}
export interface WorldObsidianClientRecord {id:string;kind:"post-it"|"ai-post-it"|"reminder"|"daily-job"|"activity"|"file-studio";title:string;content:string;updatedAt:string;}

function parseJson(value: string | null): unknown {
    try { return value ? JSON.parse(value) : null; } catch { return null; }
}

export function readWorldActivitySnapshot(storageScope: string, now = new Date()): WorldActivitySnapshot {
    const activities: WorldActivitySnapshot["activities"] = [];
    for (let offset = 0; offset < 8; offset += 1) {
        const date = new Date(now); date.setDate(date.getDate() - offset);
        const values = parseJson(localStorage.getItem(dailyKey(storageScope, date)));
        if (!Array.isArray(values)) continue;
        for (const value of values as DailyActivity[]) {
            if (!value || typeof value.summary !== "string" || typeof value.at !== "string") continue;
            activities.push({at:value.at, kind:String(value.kind || "recent"), summary:value.summary.slice(0,240)});
        }
    }
    const calendarEvents: WorldActivitySnapshot["calendarEvents"] = [];
    const calendars = parseJson(localStorage.getItem(`folderrocket-daily-calendars-${storageScope}`));
    if (calendars && typeof calendars === "object" && !Array.isArray(calendars)) {
        const seen = new Set<string>();
        for (const events of Object.values(calendars)) {
            if (!Array.isArray(events)) continue;
            for (const event of events as Array<{title?:unknown;start?:unknown;end?:unknown}>) {
                if (typeof event?.start !== "string" || Number.isNaN(Date.parse(event.start))) continue;
                const title = typeof event.title === "string" ? event.title.slice(0,160) : "Calendar event";
                const key = `${title}\0${event.start}`;
                if (seen.has(key)) continue;
                seen.add(key);
                calendarEvents.push({title,start:event.start,...(typeof event.end === "string" ? {end:event.end} : {})});
            }
        }
    }
    const reminders: WorldActivitySnapshot["reminders"] = [];
    const notes = parseJson(localStorage.getItem(`folderrocket-sticky-notes-${storageScope}`));
    if (Array.isArray(notes)) {
        for (const note of notes as Array<{reminder?:unknown;reminderAt?:unknown;title?:unknown}>) {
            if (!note?.reminder || typeof note.reminderAt !== "string" || Number.isNaN(Date.parse(note.reminderAt))) continue;
            reminders.push({title:typeof note.title === "string" && note.title.trim() ? note.title.trim().slice(0,120) : "Reminder", at:note.reminderAt});
        }
    }
    return {updatedAt:now.toISOString(), activities:activities.slice(-300), calendarEvents:calendarEvents.slice(0,120), reminders:reminders.slice(0,120)};
}

export function selectWorldActivitySnapshot(snapshot: WorldActivitySnapshot, sources: readonly string[] = []): WorldActivitySnapshot {
    const enabled = new Set(sources);
    return {
        updatedAt:snapshot.updatedAt,
        activities:snapshot.activities.filter(item => item.kind === "teams" ? enabled.has("teams") : enabled.has("dailyActivities")),
        calendarEvents:enabled.has("calendar") ? snapshot.calendarEvents : [],
        reminders:enabled.has("reminders") ? snapshot.reminders : []
    };
}

/** Local, user-requested metadata only; file contents, credentials, and email bodies are never included. */
export function buildWorldObsidianClientRecords(storageScope:string, now=new Date()):WorldObsidianClientRecord[] {
    const snapshot=readWorldActivitySnapshot(storageScope,now);
    const records:WorldObsidianClientRecord[]=[];
    snapshot.activities.forEach((item,index)=>{
        const kind:WorldObsidianClientRecord["kind"]=item.kind==="studio"?"file-studio":item.kind==="folders"||item.kind==="fire"?"activity":"daily-job";
        records.push({id:`${item.at}:${item.kind}:${index}`,kind,title:item.summary.slice(0,180),content:item.summary.slice(0,1200),updatedAt:item.at});
    });
    snapshot.reminders.forEach((item,index)=>records.push({id:`${item.at}:${item.title}:${index}`,kind:"reminder",title:item.title,content:`Due: ${item.at}`,updatedAt:item.at}));
    try {
        const saved=JSON.parse(localStorage.getItem(`folderrocket-sticky-notes-${storageScope}`)||"null") as unknown;
        if(Array.isArray(saved)) for(const value of saved){
            if(!value||typeof value!=="object")continue;
            const note=value as {id?:unknown;title?:unknown;text?:unknown;ai?:unknown;aiPrompt?:unknown;aiResponse?:unknown;reminder?:unknown;reminderAt?:unknown};
            const text=typeof note.text==="string"?note.text:typeof note.aiResponse==="string"?note.aiResponse:"";
            const title=typeof note.title==="string"&&note.title.trim()?note.title.trim():note.reminder===true?"Reminder":"Post-it";
            if(!text.trim()&&typeof note.aiPrompt!=="string")continue;
            const kind:WorldObsidianClientRecord["kind"]=note.reminder===true?"reminder":note.ai===true?"ai-post-it":"post-it";
            const content=[text,typeof note.aiPrompt==="string"&&note.aiPrompt.trim()?`AI prompt: ${note.aiPrompt.trim()}`:"",typeof note.reminderAt==="string"&&note.reminderAt?`Due: ${note.reminderAt}`:""].filter(Boolean).join("\n\n").slice(0,8000);
            records.push({id:typeof note.id==="string"?note.id:`${kind}:${title}:${records.length}`,kind,title,content,updatedAt:typeof note.reminderAt==="string"?note.reminderAt:""});
        }
    } catch { /* Never block sync; the server reports sources it could not include. */ }
    return records.slice(-500);
}
