const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const {getRuntimeDataDirectory} = require("./runtimePaths");

const DATA_DIRECTORY = getRuntimeDataDirectory();
const USERS_PATH = path.join(DATA_DIRECTORY, "users.json");
const SESSIONS_PATH = path.join(DATA_DIRECTORY, "sessions.json");
const WORKSPACES_DIRECTORY = path.join(DATA_DIRECTORY, "workspaces");
const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 14;
const INVITE_DURATION_MS = 1000 * 60 * 60 * 24 * 7;
const RECOVERY_CODE_DURATION_MS = 1000 * 60 * 30;
const EMERGENCY_CODE_DURATION_MS = 1000 * 60 * 60 * 24 * 365;

function ensureDataDirectory() {
    fs.mkdirSync(DATA_DIRECTORY, {recursive: true});
    fs.mkdirSync(WORKSPACES_DIRECTORY, {recursive: true});
}

function readJson(filePath, fallback) {
    try { return JSON.parse(fs.readFileSync(filePath, "utf8")); }
    catch { return fallback; }
}

function writeJson(filePath, value) {
    ensureDataDirectory();
    fs.writeFileSync(filePath, JSON.stringify(value, null, 2), {encoding: "utf8", mode: 0o600});
}

function readUsers() {
    const users = readJson(USERS_PATH, []);
    return Array.isArray(users) ? users : [];
}

function writeUsers(users) { writeJson(USERS_PATH, users); }

function readSessions() {
    const sessions = readJson(SESSIONS_PATH, {});
    return sessions && typeof sessions === "object" ? sessions : {};
}

function writeSessions(sessions) { writeJson(SESSIONS_PATH, sessions); }

function normaliseEmail(value) {
    return String(value ?? "").trim().toLowerCase();
}

function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function passwordDigest(password, salt = crypto.randomBytes(16).toString("hex")) {
    return `${salt}:${crypto.scryptSync(password, salt, 64).toString("hex")}`;
}

function passwordsMatch(password, storedValue) {
    const [salt, hash] = String(storedValue ?? "").split(":");
    if (!salt || !hash) return false;
    const candidate = crypto.scryptSync(password, salt, 64);
    const stored = Buffer.from(hash, "hex");
    return stored.length === candidate.length && crypto.timingSafeEqual(stored, candidate);
}

function safeWorkspacePath(userId) {
    return path.join(WORKSPACES_DIRECTORY, userId);
}

function publicUser(user) {
    if (!user) return null;
    return {
        id: user.id,
        email: user.email,
        role: user.role,
        workspacePath: user.workspacePath,
        createdAt: user.createdAt
    };
}

function cleanExpiredSessions(sessions) {
    const now = Date.now();
    for (const [digest, session] of Object.entries(sessions)) {
        if (!session || !session.expiresAt || session.expiresAt <= now) delete sessions[digest];
    }
}

function createSession(userId) {
    const token = crypto.randomBytes(32).toString("base64url");
    const digest = crypto.createHash("sha256").update(token).digest("hex");
    const sessions = readSessions();
    cleanExpiredSessions(sessions);
    sessions[digest] = {userId, expiresAt: Date.now() + SESSION_DURATION_MS};
    writeSessions(sessions);
    return {token, expiresAt: sessions[digest].expiresAt};
}

function getUserFromSession(token) {
    if (!token) return null;
    const digest = crypto.createHash("sha256").update(token).digest("hex");
    const sessions = readSessions();
    cleanExpiredSessions(sessions);
    const session = sessions[digest];
    if (!session) { writeSessions(sessions); return null; }
    const user = readUsers().find(item => item.id === session.userId) ?? null;
    if (!user) delete sessions[digest];
    writeSessions(sessions);
    return publicUser(user);
}

function removeSession(token) {
    if (!token) return;
    const digest = crypto.createHash("sha256").update(token).digest("hex");
    const sessions = readSessions();
    if (sessions[digest]) { delete sessions[digest]; writeSessions(sessions); }
}

function removeUserSessions(userId) {
    const sessions = readSessions();
    for (const [digest, session] of Object.entries(sessions)) {
        if (session?.userId === userId) delete sessions[digest];
    }
    writeSessions(sessions);
}

function getCookie(request, name) {
    const cookies = String(request.headers.cookie ?? "").split(";");
    const match = cookies.map(item => item.trim()).find(item => item.startsWith(`${name}=`));
    return match ? decodeURIComponent(match.slice(name.length + 1)) : "";
}

function authenticateRequest(request) {
    return getUserFromSession(getCookie(request, "folderrocket_session"));
}

function validatePassword(value) {
    if (typeof value !== "string" || value.length < 12) {
        throw new Error("Use a password with at least 12 characters.");
    }
}

function createUser({email, password, inviteCode = ""}) {
    const normalisedEmail = normaliseEmail(email);
    validatePassword(password);
    if (!isValidEmail(normalisedEmail)) throw new Error("Enter a valid email address.");
    const users = readUsers();
    if (users.some(user => user.email === normalisedEmail)) throw new Error("An account with this email already exists.");

    let role = "member";
    if (!users.length) {
        role = "admin";
    } else {
        const inviteDigest = crypto.createHash("sha256").update(String(inviteCode)).digest("hex");
        const invite = users.flatMap(user => user.invites ?? []).find(item => item && item.email === normalisedEmail && item.codeDigest === inviteDigest && item.expiresAt > Date.now() && !item.usedAt);
        if (!invite) throw new Error("This installation is private. Ask an administrator for a valid invitation code.");
        invite.usedAt = Date.now();
    }

    const id = crypto.randomUUID();
    const user = {
        id,
        email: normalisedEmail,
        role,
        passwordDigest: passwordDigest(password),
        workspacePath: safeWorkspacePath(id),
        createdAt: new Date().toISOString(),
        invites: role === "admin" ? [] : undefined
    };
    fs.mkdirSync(user.workspacePath, {recursive: true});
    users.push(user);
    writeUsers(users);
    return publicUser(user);
}

function login({email, password}) {
    const user = readUsers().find(item => item.email === normaliseEmail(email));
    if (!user || !passwordsMatch(String(password ?? ""), user.passwordDigest)) throw new Error("Incorrect email or password.");
    return publicUser(user);
}

function createInvite(adminUserId, email) {
    const users = readUsers();
    const admin = users.find(user => user.id === adminUserId && user.role === "admin");
    if (!admin) throw new Error("Only the administrator can create invitations.");
    const normalisedEmail = normaliseEmail(email);
    if (!isValidEmail(normalisedEmail)) throw new Error("Enter a valid email address.");
    if (users.some(user => user.email === normalisedEmail)) throw new Error("This email already has an account.");
    const code = crypto.randomBytes(18).toString("base64url");
    admin.invites = (admin.invites ?? []).filter(invite => invite.expiresAt > Date.now() && !invite.usedAt && invite.email !== normalisedEmail);
    admin.invites.push({
        email: normalisedEmail,
        codeDigest: crypto.createHash("sha256").update(code).digest("hex"),
        createdAt: Date.now(),
        expiresAt: Date.now() + INVITE_DURATION_MS
    });
    writeUsers(users);
    return {email: normalisedEmail, code, expiresAt: new Date(Date.now() + INVITE_DURATION_MS).toISOString()};
}

function createCode() {
    const code = crypto.randomBytes(15).toString("base64url");
    return {code, digest: crypto.createHash("sha256").update(code).digest("hex")};
}

function createEmergencyRecoveryCode(userId) {
    const users = readUsers();
    const user = users.find(item => item.id === userId);
    if (!user) throw new Error("Account not found.");
    const generated = createCode();
    user.emergencyRecovery = {
        codeDigest: generated.digest,
        createdAt: Date.now(),
        expiresAt: Date.now() + EMERGENCY_CODE_DURATION_MS
    };
    writeUsers(users);
    return {code: generated.code, expiresAt: new Date(user.emergencyRecovery.expiresAt).toISOString()};
}

function createPasswordReset(adminUserId, email) {
    const users = readUsers();
    const admin = users.find(item => item.id === adminUserId && item.role === "admin");
    if (!admin) throw new Error("Only the administrator can reset another account password.");
    const user = users.find(item => item.email === normaliseEmail(email));
    if (!user) throw new Error("No account was found for this email.");
    const generated = createCode();
    user.passwordReset = {
        codeDigest: generated.digest,
        createdAt: Date.now(),
        expiresAt: Date.now() + RECOVERY_CODE_DURATION_MS
    };
    writeUsers(users);
    return {email: user.email, code: generated.code, expiresAt: new Date(user.passwordReset.expiresAt).toISOString()};
}

function resetPassword({email, code, password}) {
    validatePassword(password);
    const users = readUsers();
    const user = users.find(item => item.email === normaliseEmail(email));
    if (!user) throw new Error("Invalid email or recovery code.");
    const digest = crypto.createHash("sha256").update(String(code ?? "")).digest("hex");
    const validTemporaryCode = user.passwordReset && user.passwordReset.expiresAt > Date.now() && user.passwordReset.codeDigest === digest;
    const validEmergencyCode = user.emergencyRecovery && user.emergencyRecovery.expiresAt > Date.now() && user.emergencyRecovery.codeDigest === digest;
    if (!validTemporaryCode && !validEmergencyCode) throw new Error("Invalid or expired recovery code.");
    user.passwordDigest = passwordDigest(password);
    delete user.passwordReset;
    if (validEmergencyCode) delete user.emergencyRecovery;
    writeUsers(users);
    removeUserSessions(user.id);
    return publicUser(user);
}

function setupRequired() { return readUsers().length === 0; }

module.exports = {
    authenticateRequest,
    createEmergencyRecoveryCode,
    createInvite,
    createPasswordReset,
    createSession,
    createUser,
    getCookie,
    getUserFromSession,
    login,
    publicUser,
    removeSession,
    resetPassword,
    setupRequired
};
