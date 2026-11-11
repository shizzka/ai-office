// Shared by Node route handlers and Edge middleware.
export const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-in-production";
