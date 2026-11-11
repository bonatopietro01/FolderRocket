const net = require("node:net");

const STATUS_TTL_MS = 15_000;
let cachedStatus = {expiresAt:0,value:null};

function configured() {
    const enabled = process.env.FOLDERROCKET_LOCAL_MODEL_ENABLED === "true";
    const modelName = String(process.env.FOLDERROCKET_LOCAL_MODEL_NAME || "").trim().slice(0,120);
    const url = String(process.env.FOLDERROCKET_LOCAL_MODEL_URL || "http://127.0.0.1:11434").trim();
    const parsed = safeLoopbackUrl(url);
    return {enabled,modelName,url:parsed?.origin || "",configuredUrl:Boolean(parsed)};
}

function safeLoopbackUrl(value) {
    try {
        const url = new URL(value);
        if (url.protocol !== "http:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) return null;
        let host = url.hostname.toLowerCase();
        if (host.startsWith("[") && host.endsWith("]")) host = host.slice(1,-1);
        const ipVersion = net.isIP(host);
        const loopback = host === "localhost" || (ipVersion === 4 && host.startsWith("127.")) || (ipVersion === 6 && host === "::1");
        return loopback ? url : null;
    } catch { return null; }
}

async function requestJson(url, options = {}, signal, timeoutMs = 8_000) {
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (signal?.aborted) throw Object.assign(new Error("Local model request cancelled."),{name:"AbortError"});
    signal?.addEventListener("abort",abort,{once:true});
    const timer = setTimeout(() => controller.abort(), Math.min(30_000,Math.max(500,timeoutMs)));
    try {
        const response = await fetch(url,{...options,redirect:"error",signal:controller.signal,headers:{"content-type":"application/json",...(options.headers||{})}});
        if (response.url && new URL(response.url).origin !== new URL(url).origin) throw new Error("Local model response origin changed.");
        if (!response.ok) throw new Error(`Local model runtime returned HTTP ${response.status}.`);
        const declaredLength = Number(response.headers.get("content-length") || 0);
        if (declaredLength > 1_000_000) throw new Error("Local model response exceeded the size limit.");
        const reader=response.body?.getReader?.();
        if(!reader)throw new Error("Local model response did not provide a readable body.");
        const chunks=[];let totalBytes=0;
        try{
            while(true){
                const {done,value}=await reader.read();
                if(done)break;
                const chunk=Buffer.from(value);
                totalBytes+=chunk.length;
                if(totalBytes>1_000_000){
                    controller.abort();
                    await reader.cancel().catch(()=>{});
                    throw new Error("Local model response exceeded the size limit.");
                }
                chunks.push(chunk);
            }
        }finally{reader.releaseLock?.();}
        return JSON.parse(Buffer.concat(chunks,totalBytes).toString("utf8"));
    } catch(error) {
        if (signal?.aborted) throw Object.assign(new Error("Local model request cancelled."),{name:"AbortError"});
        throw error;
    } finally { clearTimeout(timer); signal?.removeEventListener("abort",abort); }
}

async function inspect({refresh = false} = {}) {
    if (!refresh && cachedStatus.value && cachedStatus.expiresAt > Date.now()) return cachedStatus.value;
    const settings = configured();
    let detectedModels = [], runtimeAvailable = false, error = "";
    if (!settings.enabled) error = "Local model runtime is disabled.";
    else if (settings.configuredUrl) {
        try {
            const result = await requestJson(`${settings.url}/api/tags`,{method:"GET"},undefined,2_000);
            runtimeAvailable = true;
            detectedModels = (Array.isArray(result?.models)?result.models:[]).map(item=>String(item?.name||"").slice(0,120)).filter(Boolean).slice(0,100);
        } catch { error = "Local runtime is unavailable."; }
    } else error = "Configured runtime URL must use a localhost or loopback address.";
    const modelDetected = Boolean(settings.modelName && detectedModels.some(name=>name===settings.modelName || name.split(":")[0]===settings.modelName.split(":")[0]));
    const value = {enabled:settings.enabled,configured:Boolean(settings.modelName&&settings.configuredUrl),runtimeAvailable,modelConfigured:Boolean(settings.modelName),modelDetected,available:settings.enabled&&Boolean(settings.modelName)&&runtimeAvailable&&modelDetected,modelName:settings.modelName||"",models:detectedModels,error};
    cachedStatus = {expiresAt:Date.now()+STATUS_TTL_MS,value};
    return value;
}

async function generate(prompt,{signal,maxOutputChars=4_000,timeoutMs=20_000}={}) {
    const status = await inspect();
    if (!status.available) return null;
    const settings = configured();
    const data = await requestJson(`${settings.url}/api/generate`,{method:"POST",body:JSON.stringify({model:settings.modelName,prompt,stream:false,keep_alive:0,options:{num_predict:Math.min(2_048,Math.max(64,Math.ceil(maxOutputChars/3)))}})},signal,timeoutMs);
    return typeof data?.response === "string" ? data.response.slice(0,Math.min(16_000,maxOutputChars)) : null;
}

module.exports = {configured,safeLoopbackUrl,inspect,generate};
