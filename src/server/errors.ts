/** Thrown by services for business-rule failures the user should read (e.g. "Only 1 room left on 20 Nov"). */
export class UserError extends Error {}

/** Thrown when the session is missing or a permission is not granted. */
export class ActionError extends Error {}
