export const configuredRequestTimeoutSeconds = Number(process.env.DOOR_REQUEST_TIMEOUT_SECONDS);
export const requestTimeoutSeconds = Number.isFinite(configuredRequestTimeoutSeconds) && configuredRequestTimeoutSeconds >= 0
    ? configuredRequestTimeoutSeconds
    : 3;
export const configuredRequestSearchWindowMinutes = Number(process.env.DOOR_REQUEST_SEARCH_WINDOW_MINUTES);
export const requestSearchWindowMinutes = Number.isFinite(configuredRequestSearchWindowMinutes) && configuredRequestSearchWindowMinutes > 0
    ? configuredRequestSearchWindowMinutes
    : 1;
