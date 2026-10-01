import {dailyKey, type DailyActivity} from "./dailyActivity";

export interface WorldActivitySnapshot {
    updatedAt: string;
    activities: Array<{at:string;kind:string;summary:string}>;
    calendarEvents: Array<{title:string;start:string;end?:string}>;
    reminders: Array<{title:string;at:string}>;
}

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
