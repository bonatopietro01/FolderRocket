const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();

const browserOrigin = typeof window === "undefined"
    ? ""
    : window.location.origin;

export const API_BASE_URL = (
    configuredApiBaseUrl
    || (import.meta.env.DEV ? "http://localhost:3000" : browserOrigin)
).replace(/\/$/, "");
