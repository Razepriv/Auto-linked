// ---------------------------------------------------------------------------
// Analytics domain types
// ---------------------------------------------------------------------------

/** Engagement metrics for a single published post. */
export interface PostAnalytics {
  readonly id: string;
  readonly postId: string;
  readonly impressions: number;
  readonly likes: number;
  readonly comments: number;
  readonly shares: number;
  readonly clicks: number;
  /** Engagement rate = (likes + comments + shares + clicks) / impressions. */
  readonly engagementRate: number;
  /** Follower count change attributed to this post. */
  readonly followerDelta: number;
  readonly fetchedAt: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** Aggregated metrics for a single content pillar within a reporting period. */
export interface PillarAnalytics {
  readonly pillarId: string;
  readonly pillarName: string;
  readonly postCount: number;
  readonly avgEngagementRate: number;
  readonly totalImpressions: number;
  readonly totalLikes: number;
  readonly totalComments: number;
  readonly totalShares: number;
  readonly totalClicks: number;
}

/** A data point on a time-series chart. */
export interface TimeSeriesPoint {
  readonly date: string;
  readonly value: number;
}

/** Weekly summary report sent to the user. */
export interface WeeklyReport {
  readonly id: string;
  readonly userId: string;
  readonly weekStartDate: string;
  readonly weekEndDate: string;

  // Counts
  readonly postsPublished: number;
  readonly postsDrafted: number;
  readonly postsFailed: number;
  readonly postsSkipped: number;

  // Engagement totals
  readonly totalImpressions: number;
  readonly totalLikes: number;
  readonly totalComments: number;
  readonly totalShares: number;
  readonly totalClicks: number;
  readonly avgEngagementRate: number;

  // Growth
  readonly followerDelta: number;
  readonly followerTotal: number;

  // Best performing
  readonly topPostId: string | null;
  readonly topPostEngagementRate: number | null;

  // Breakdown by pillar
  readonly pillarBreakdown: readonly PillarAnalytics[];

  readonly createdAt: string;
}

/** Dashboard summary for the main app overview screen. */
export interface DashboardSummary {
  // Upcoming
  readonly scheduledPostsCount: number;
  readonly draftsCount: number;
  readonly nextScheduledAt: string | null;

  // This week
  readonly postsPublishedThisWeek: number;
  readonly impressionsThisWeek: number;
  readonly engagementRateThisWeek: number;

  // Trends (last 4 weeks)
  readonly impressionsTrend: readonly TimeSeriesPoint[];
  readonly engagementTrend: readonly TimeSeriesPoint[];
  readonly followerTrend: readonly TimeSeriesPoint[];

  // Pillar distribution (current month)
  readonly pillarDistribution: readonly PillarAnalytics[];

  // Quality
  readonly avgQualityScore: number | null;

  // Plan usage
  readonly postsUsedThisWeek: number;
  readonly postsLimitThisWeek: number;
  readonly imagesUsedThisMonth: number;
  readonly imagesLimitThisMonth: number;
  readonly carouselsUsedThisMonth: number;
  readonly carouselsLimitThisMonth: number;
}
