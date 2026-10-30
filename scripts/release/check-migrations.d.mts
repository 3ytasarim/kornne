export declare const DESTRUCTIVE: RegExp[];
export declare function scanMigrations(dir?: string): { migration: string; destructive: string[]; approved: boolean }[];
