// Stable interfaces for future graph and multi-character tooling.
export type ReferenceNode = {
  id: string;
  kind: "character" | "world" | "location" | "faction" | "lore";
  label: string;
};
export type ReferenceEdge = {
  sourceId: string;
  targetId: string;
  kind: "mentions" | "belongs_to" | "contradicts";
  evidence?: string;
};
export interface ReferenceGraphProvider {
  build(
    projectId: string,
  ): Promise<{ nodes: ReferenceNode[]; edges: ReferenceEdge[] }>;
}
