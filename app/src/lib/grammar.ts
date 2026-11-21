import { load, type Level } from "./data";

export type Block = { t: "p" | "tip" | "warn"; x: string } | { t: "table"; h: string[]; rows: string[][] };
export interface GEx { q: string; a: string; tr?: string; h?: string; ch?: string[] }
export interface GTopic {
  id: string; lv: Level; title: string; tr: string; summary: string;
  blocks: Block[]; examples: [string, string][]; mistakes: [string, string, string][];
  quiz: { q: string; o: string[]; a: number; why: string }[];
  ex: GEx[];
}
export const loadGrammar = () => load<GTopic[]>("grammar.json");
