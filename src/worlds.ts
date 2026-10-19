export type WorldPlanetStyle = "planet" | "rocky" | "ringed" | "glowing" | "asteroid" | "black-hole" | "galaxy";
export type WorldAssistantModel = "gpt-4.1-mini" | "gpt-4.1";
export type WorldAssistantCapability = "search-files" | "draft-post-it";

export interface WorldAgentProfile {
    id: string;
    name: string;
    description: string;
    instructions: string;
    enabled: boolean;
    model: WorldAssistantModel;
    capabilities: WorldAssistantCapability[];
}

export interface WorldSkillProfile {
    id: string;
    name: string;
    description: string;
    instructions: string;
    enabled: boolean;
    model: WorldAssistantModel;
    capabilities: WorldAssistantCapability[];
}

export interface WorldPermissionFoundation {
    schemaVersion: 1;
    configured: false;
}

export type WorldEmailProvider = "gmail" | "outlook";
export interface WorldEmailAccount {
    provider: WorldEmailProvider;
    blockId: string;
    email?: string;
}
export interface WorldObsidianSettings {
    enabled: boolean;
    autoSync?: boolean;
    vaultPath: string;
    sourceSelection?: WorldObsidianSourceSelection;
    lastSyncAt?: string;
    status?: string;
    lastResult?: {total?: number; written?: number; unchanged?: number; conflicts?: number; warnings?: string[] } | null;
}
export interface WorldObsidianSourceSelection {
    version: 2;
    folders: boolean;
    email: boolean;
    alerts: boolean;
    activity: boolean;
    snapshots: boolean;
    clientNotes: boolean;
    attachments: boolean;
    threadMode: "all" | "selected";
    threadIds: string[];
    folderMode: "all" | "selected";
    folderIds: string[];
    fileTypeMode: "all" | "selected";
    fileTypes: string[];
    includeSubfolders: boolean;
    excludedFileIds: string[];
}
export const DEFAULT_OBSIDIAN_SOURCE_SELECTION: WorldObsidianSourceSelection = {
    version: 2, folders: true, email: true, alerts: true, activity: true, snapshots: true, clientNotes: true, attachments: true, threadMode: "all", threadIds: [], folderMode: "all", folderIds: [], fileTypeMode: "all", fileTypes: [], includeSubfolders: true, excludedFileIds: []
};

const WORLD_GRAPH_FILE_TYPES = [".pdf", ".doc", ".docx", ".rtf", ".txt", ".xls", ".xlsx", ".csv", ".ppt", ".pptx", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".mp3", ".mp4", ".mov", ".avi", ".mkv"];
function normalizeObsidianSourceSelection(value: unknown): WorldObsidianSourceSelection {
    const source = value && typeof value === "object" ? value as Partial<WorldObsidianSourceSelection> : {};
    const legacy = (source.version ?? 1) < 2;
    return {version: 2, folders: source.folders !== false, email: source.email !== false, alerts: source.alerts !== false, activity: source.activity !== false, snapshots: source.snapshots !== false, clientNotes: source.clientNotes !== false, attachments: source.attachments !== false, threadMode: source.threadMode === "selected" ? "selected" : "all", threadIds: Array.isArray(source.threadIds) ? [...new Set(source.threadIds.filter((id): id is string => typeof id === "string" && id.length > 0 && id.length <= 300))].slice(0, 500) : [], folderMode: !legacy && source.folderMode === "selected" ? "selected" : "all", folderIds: Array.isArray(source.folderIds) ? [...new Set(source.folderIds.filter((id): id is string => typeof id === "string" && /^[a-zA-Z0-9_-]{1,120}$/.test(id)))].slice(0, 200) : [], fileTypeMode: !legacy && source.fileTypeMode === "selected" ? "selected" : "all", fileTypes: Array.isArray(source.fileTypes) ? [...new Set(source.fileTypes.filter((value): value is string => typeof value === "string" && WORLD_GRAPH_FILE_TYPES.includes(value.toLowerCase())).map(value => value.toLowerCase()))] : [], includeSubfolders: legacy ? true : source.includeSubfolders !== false, excludedFileIds: Array.isArray(source.excludedFileIds) ? [...new Set(source.excludedFileIds.filter((id): id is string => typeof id === "string" && id.length > 0 && id.length <= 500))].slice(0, 500) : []};
}

function finiteCount(value: unknown) { return Number.isFinite(value) ? Math.max(0, Math.round(Number(value))) : 0; }
export type WorldTreeRootMode = "computer" | "desktop";

export type WorldDigestProvider = "gmail" | "outlook" | "";
export type WorldDigestSource = "dailyActivities" | "reminders" | "calendar" | "gmailAlerts" | "outlookAlerts" | "teams";
export interface WorldActivityNotifications {
    enabled: boolean;
    senderProvider: WorldDigestProvider;
    senderBlockId: string;
    recipient: string;
    everyDays: number;
    time: string;
    timeZone: string;
    calendarWindow: "today" | "tomorrow" | "week";
    sources: WorldDigestSource[];
    anchorDate?: string;
}

export interface WorkspaceWorld {
    id: string;
    name: string;
    color: string;
    style: WorldPlanetStyle;
    aiEnabled: boolean;
    graphEnabled: boolean;
    emailAccount?: WorldEmailAccount | null;
    treeRootMode?: WorldTreeRootMode;
    obsidian?: WorldObsidianSettings;
    agents: WorldAgentProfile[];
    skills: WorldSkillProfile[];
    permissions: WorldPermissionFoundation;
    activityNotifications?: WorldActivityNotifications;
}

export interface WorkspaceWorldState {
    worlds: WorkspaceWorld[];
    activeWorldId: string;
}

const WORLD_STATE_VERSION = 1;

export function worldsStorageKey(userId: string) {
    return `folderrocket-world-state-v${WORLD_STATE_VERSION}-${userId}`;
}

export function activeWorldStorageScope(userId: string, worldId: string) {
    return `${userId}-world-${worldId}`;
}

export function createDefaultWorlds(): WorkspaceWorld[] {
    return [
        {id: "work", name: "Lavoro", color: "#5dbdff", style: "ringed", aiEnabled: false, graphEnabled: false, emailAccount: null, treeRootMode: "computer", obsidian: {enabled: false, autoSync: false, vaultPath: "", sourceSelection: {...DEFAULT_OBSIDIAN_SOURCE_SELECTION}}, agents: [], skills: [], permissions: {schemaVersion: 1, configured: false}},
        {id: "personal", name: "Personale", color: "#c28cff", style: "glowing", aiEnabled: false, graphEnabled: false, emailAccount: null, treeRootMode: "computer", obsidian: {enabled: false, autoSync: false, vaultPath: "", sourceSelection: {...DEFAULT_OBSIDIAN_SOURCE_SELECTION}}, agents: [], skills: [], permissions: {schemaVersion: 1, configured: false}}
    ];
}

function normalizeWorlds(value: unknown): WorkspaceWorld[] | null {
    if (!Array.isArray(value)) return null;
    const worlds = value.filter((world): world is WorkspaceWorld => Boolean(world)
        && typeof world.id === "string"
        && /^[a-zA-Z0-9_-]{1,80}$/.test(world.id)
        && typeof world.name === "string"
        && typeof world.color === "string"
        && /^#[0-9a-fA-F]{6}$/.test(world.color)
        && ["rocky", "planet", "ringed", "glowing", "asteroid", "black-hole", "galaxy"].includes(world.style));
    if (!worlds.length) return null;
    const unique = new Set<string>();
    return worlds.map(world => {
        const storedStyle = String(world.style);
        let id = world.id;
        while (unique.has(id)) id = `${world.id}-${crypto.randomUUID().slice(0, 6)}`;
        unique.add(id);
        return {
            id,
            name: world.name.trim().slice(0, 40) || "Pianeta",
            color: world.color,
            // Keep the persisted appearance identifier intact; presentation changes
            // must not silently migrate a user's saved planet style.
            style: storedStyle as WorldPlanetStyle,
            aiEnabled: Boolean(world.aiEnabled),
            graphEnabled: world.graphEnabled === true,
            emailAccount: Object.hasOwn(world, "emailAccount")
                ? world.emailAccount && (world.emailAccount.provider === "gmail" || world.emailAccount.provider === "outlook") && typeof world.emailAccount.blockId === "string" && /^[a-zA-Z0-9_-]{1,120}$/.test(world.emailAccount.blockId)
                    ? {provider: world.emailAccount.provider, blockId: world.emailAccount.blockId, ...(typeof world.emailAccount.email === "string" ? {email: world.emailAccount.email.slice(0, 254)} : {})}
                    : null
                : undefined,
            treeRootMode: world.treeRootMode === "desktop" ? "desktop" : "computer",
            obsidian: world.obsidian && typeof world.obsidian === "object"
                ? {enabled: world.obsidian.enabled === true, autoSync: world.obsidian.autoSync === true, vaultPath: typeof world.obsidian.vaultPath === "string" ? world.obsidian.vaultPath.slice(0, 1024) : "", sourceSelection: normalizeObsidianSourceSelection(world.obsidian.sourceSelection), ...(typeof world.obsidian.lastSyncAt === "string" ? {lastSyncAt: world.obsidian.lastSyncAt.slice(0, 40)} : {}), ...(typeof world.obsidian.status === "string" ? {status: world.obsidian.status.slice(0, 200)} : {}), ...(world.obsidian.lastResult && typeof world.obsidian.lastResult === "object" ? {lastResult: {total: finiteCount(world.obsidian.lastResult.total), written: finiteCount(world.obsidian.lastResult.written), unchanged: finiteCount(world.obsidian.lastResult.unchanged), conflicts: finiteCount(world.obsidian.lastResult.conflicts), warnings: Array.isArray(world.obsidian.lastResult.warnings) ? world.obsidian.lastResult.warnings.filter((item): item is string => typeof item === "string").slice(0, 20) : []}} : {})}
                : {enabled: false, vaultPath: "", sourceSelection: {...DEFAULT_OBSIDIAN_SOURCE_SELECTION}},
            agents: Array.isArray(world.agents) ? world.agents.filter(agent => agent && typeof agent.id === "string" && typeof agent.name === "string").map(agent => ({
                id: agent.id,
                name: agent.name.trim().slice(0, 60) || "Agente",
                description: typeof agent.description === "string" ? agent.description.slice(0, 240) : "",
                instructions: typeof agent.instructions === "string" ? agent.instructions.slice(0, 2000) : "",
                enabled: Boolean(agent.enabled),
                model: agent.model === "gpt-4.1" ? "gpt-4.1" : "gpt-4.1-mini",
                capabilities: Array.isArray(agent.capabilities) ? agent.capabilities.filter((capability): capability is WorldAssistantCapability => ["search-files", "draft-post-it"].includes(capability)) : []
            })) : [],
            skills: Array.isArray(world.skills) ? world.skills.filter(skill => skill && typeof skill.id === "string" && typeof skill.name === "string").map(skill => ({
                id: skill.id,
                name: skill.name.trim().slice(0, 60) || "Skill",
                description: typeof skill.description === "string" ? skill.description.slice(0, 240) : "",
                instructions: typeof skill.instructions === "string" ? skill.instructions.slice(0, 2000) : "",
                enabled: Boolean(skill.enabled),
                model: skill.model === "gpt-4.1" ? "gpt-4.1" : "gpt-4.1-mini",
                capabilities: Array.isArray(skill.capabilities) ? skill.capabilities.filter((capability): capability is WorldAssistantCapability => ["search-files", "draft-post-it"].includes(capability)) : []
            })) : [],
            // Reserved, inert schema. Permission semantics are intentionally deferred.
            permissions: {schemaVersion: 1, configured: false},
            activityNotifications: normalizeActivityNotifications(world.activityNotifications)
        };
    });
}

export function normalizeActivityNotifications(value: unknown): WorldActivityNotifications {
    const config = value && typeof value === "object" ? value as Partial<WorldActivityNotifications> : {};
    const validSources: WorldDigestSource[] = ["dailyActivities", "reminders", "calendar", "gmailAlerts", "outlookAlerts", "teams"];
    const localTimeZone = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC";
    const timeZone = typeof config.timeZone === "string" && config.timeZone.length <= 80 && config.timeZone ? config.timeZone : localTimeZone || "UTC";
    return {
        enabled: config.enabled === true,
        senderProvider: config.senderProvider === "gmail" || config.senderProvider === "outlook" ? config.senderProvider : "",
        senderBlockId: typeof config.senderBlockId === "string" && /^[a-zA-Z0-9_-]{1,120}$/.test(config.senderBlockId) ? config.senderBlockId : "",
        recipient: typeof config.recipient === "string" ? config.recipient.trim().slice(0, 254) : "",
        everyDays: Number.isFinite(config.everyDays) ? Math.max(1, Math.min(30, Math.round(Number(config.everyDays)))) : 1,
        time: typeof config.time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(config.time) ? config.time : "08:00",
        timeZone,
        calendarWindow: config.calendarWindow === "tomorrow" || config.calendarWindow === "week" ? config.calendarWindow : "today",
        sources: Array.isArray(config.sources) ? [...new Set(config.sources.filter((source): source is WorldDigestSource => validSources.includes(source as WorldDigestSource)))] : [],
        anchorDate: typeof config.anchorDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(config.anchorDate) ? config.anchorDate : undefined
    };
}

function migrateLegacyWorkspacePreferences(userId: string) {
    const migrationKey = `folderrocket-world-migration-v${WORLD_STATE_VERSION}-${userId}`;
    if (localStorage.getItem(migrationKey) === "done") return;
    const legacyMarker = `-${userId}`;
    const newMarker = `${legacyMarker}-world-work`;
    const legacyKeys = Array.from({length: localStorage.length}, (_, index) => localStorage.key(index)).filter((key): key is string => Boolean(key));
    for (const key of legacyKeys) {
        if (!key.includes(legacyMarker) || key.startsWith("folderrocket-world-") || key.startsWith("folderrocket-daily-activity-")) continue;
        const migratedKey = key.replace(legacyMarker, newMarker);
        if (migratedKey === key || localStorage.getItem(migratedKey) !== null) continue;
        const value = localStorage.getItem(key);
        if (value !== null) localStorage.setItem(migratedKey, value);
    }
    localStorage.setItem(migrationKey, "done");
}

export function loadWorkspaceWorldState(userId: string): WorkspaceWorldState {
    migrateLegacyWorkspacePreferences(userId);
    const key = worldsStorageKey(userId);
    try {
        const saved = JSON.parse(localStorage.getItem(key) ?? "null") as Partial<WorkspaceWorldState> | null;
        const worlds = normalizeWorlds(saved?.worlds);
        if (worlds) {
            const syncedWorlds = worlds.map(world => {
                const savedAiMode = localStorage.getItem(`folderrocket-ai-mode-${activeWorldStorageScope(userId, world.id)}`);
                return savedAiMode === null ? world : {...world, aiEnabled: savedAiMode === "on"};
            });
            const activeWorldId = typeof saved?.activeWorldId === "string" && syncedWorlds.some(world => world.id === saved.activeWorldId)
                ? saved.activeWorldId
                : "work";
            return {worlds: syncedWorlds, activeWorldId: syncedWorlds.some(world => world.id === activeWorldId) ? activeWorldId : syncedWorlds[0].id};
        }
    } catch { /* Initialize the default worlds and keep all existing preferences in Lavoro. */ }
    return {worlds: createDefaultWorlds(), activeWorldId: "work"};
}
