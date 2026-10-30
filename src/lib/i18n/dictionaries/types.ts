export type DeepPartial<T> = T extends string ? string : T extends readonly (infer U)[] ? readonly DeepPartial<U>[] : { [K in keyof T]?: DeepPartial<T[K]> };
