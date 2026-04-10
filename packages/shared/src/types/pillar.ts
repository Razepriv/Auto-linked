// ---------------------------------------------------------------------------
// Content Pillar domain types
// ---------------------------------------------------------------------------

/** A content pillar represents a thematic category for LinkedIn posts. */
export interface ContentPillar {
  readonly id: string;
  readonly userId: string;
  readonly name: string;
  readonly description: string;
  readonly color: string;
  /** Target percentage of total posts allocated to this pillar (0-100). */
  readonly targetPercentage: number;
  /** Example topics / angles within this pillar. */
  readonly exampleTopics: readonly string[];
  /** Whether this pillar is currently active for content generation. */
  readonly isActive: boolean;
  readonly sortOrder: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** Input payload for creating a new content pillar. */
export interface ContentPillarCreateInput {
  readonly name: string;
  readonly description: string;
  readonly color?: string;
  readonly targetPercentage?: number;
  readonly exampleTopics?: readonly string[];
  readonly isActive?: boolean;
  readonly sortOrder?: number;
}

/** Input payload for updating an existing content pillar. */
export interface ContentPillarUpdateInput {
  readonly name?: string;
  readonly description?: string;
  readonly color?: string;
  readonly targetPercentage?: number;
  readonly exampleTopics?: readonly string[];
  readonly isActive?: boolean;
  readonly sortOrder?: number;
}
