export declare const LOCAL: { host: string; port: number; user: string; password: string; databases: { it: string; e2e: string; restore: string } };
export declare function localTestUrl(kind?: "it" | "e2e" | "restore" | "postgres"): string;
export declare function assertLocalTestUrl(url: string): string;
export declare function testDatabaseUrl(kind?: "it" | "e2e"): string;
