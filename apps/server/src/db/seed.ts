import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { users } from './schema/users.js';
import { linkedinOauthTokens } from './schema/oauth-tokens.js';
import { voiceProfiles } from './schema/voice-profiles.js';
import { contentPillars } from './schema/content-pillars.js';
import { posts } from './schema/posts.js';
import { postAnalytics } from './schema/post-analytics.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function daysAgo(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

function hoursFromNow(hours: number): Date {
  const date = new Date();
  date.setHours(date.getHours() + hours);
  return date;
}

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------

async function seed(): Promise<void> {
  const databaseUrl = process.env['DATABASE_URL'];

  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  const pool = new pg.Pool({
    connectionString: databaseUrl,
    max: 1,
  });

  const db = drizzle(pool);

  console.info('Seeding database...');

  // -----------------------------------------------------------------------
  // 1. Demo user
  // -----------------------------------------------------------------------

  const [demoUser] = await db
    .insert(users)
    .values({
      email: 'demo@autolinked.ai',
      name: 'Alex Rivera',
      timezone: 'America/New_York',
      subscriptionTier: 'pro',
      subscriptionExpiresAt: hoursFromNow(24 * 365),
      linkedinId: 'alex-rivera-demo-12345',
      linkedinVanityUrl: 'alex-rivera-demo',
      onboardingCompletedAt: daysAgo(30),
      onboardingStep: 'complete',
      autoPublish: false,
      autoPublishWindowHours: 24,
      emailNotifications: true,
      postingSchedule: {
        days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
        timesUtc: ['13:00', '17:00'],
      },
    })
    .returning();

  if (!demoUser) {
    throw new Error('Failed to create demo user');
  }

  console.info(`  Created user: ${demoUser.email} (id=${demoUser.id})`);

  // -----------------------------------------------------------------------
  // 2. LinkedIn OAuth token (fake encrypted values)
  // -----------------------------------------------------------------------

  await db.insert(linkedinOauthTokens).values({
    userId: demoUser.id,
    accessTokenEnc: 'enc:v1:aes256gcm:fake-access-token-ciphertext-base64',
    refreshTokenEnc: 'enc:v1:aes256gcm:fake-refresh-token-ciphertext-base64',
    scopes: ['openid', 'profile', 'email', 'w_member_social'],
    expiresAt: hoursFromNow(24 * 60),
    refreshExpiresAt: hoursFromNow(24 * 365),
    issuedAt: daysAgo(1),
    lastRefreshedAt: daysAgo(0),
    refreshFailureCount: 0,
  });

  console.info('  Created LinkedIn OAuth token');

  // -----------------------------------------------------------------------
  // 3. Voice profile
  // -----------------------------------------------------------------------

  await db.insert(voiceProfiles).values({
    userId: demoUser.id,
    versionNumber: 1,
    tone: 'professional-casual',
    avgPostLength: 250,
    emojiFrequency: 'light',
    hashtagStyle: 'minimal',
    formatting: 'spaced',
    lineBreakStyle: 'double',
    analysisData: {
      sentenceStructure: {
        avgLength: 14.3,
        complexity: 'medium',
        preferredOpeners: ['questions', 'bold-statements', 'anecdotes'],
      },
      vocabulary: {
        level: 'professional',
        industryTerms: ['AI', 'machine learning', 'product-market fit', 'GTM strategy'],
        avoidedWords: ['synergy', 'disrupt', 'pivot'],
      },
      storytelling: {
        usesPersonalAnecdotes: true,
        narrativeArc: 'problem-insight-takeaway',
        ctaStyle: 'question',
      },
      engagement: {
        hookTypes: ['contrarian-take', 'data-point', 'personal-failure'],
        closingPatterns: ['open-question', 'actionable-tip', 'reflection'],
      },
      formatting: {
        paragraphLength: 'short',
        usesListsOrBullets: true,
        lineBreakFrequency: 'after-every-sentence',
      },
    },
    analyzedPostCount: 47,
    analysisSource: 'linkedin-import',
    userEdited: false,
    userNotes: null,
  });

  console.info('  Created voice profile');

  // -----------------------------------------------------------------------
  // 4. Content pillars (weights sum to 1.0)
  // -----------------------------------------------------------------------

  const pillarData: Array<{
    name: string;
    description: string;
    weight: string;
    color: string;
    sortOrder: number;
  }> = [
    {
      name: 'Leadership',
      description: 'Lessons on leading teams, managing up, and building culture in fast-moving orgs.',
      weight: '0.250',
      color: '#6366F1',
      sortOrder: 0,
    },
    {
      name: 'Tech Trends',
      description: 'Commentary on emerging technologies, AI developments, and their business impact.',
      weight: '0.250',
      color: '#06B6D4',
      sortOrder: 1,
    },
    {
      name: 'Career Growth',
      description: 'Practical advice on career transitions, skill-building, and professional development.',
      weight: '0.200',
      color: '#10B981',
      sortOrder: 2,
    },
    {
      name: 'Industry Insights',
      description: 'Analysis of market shifts, competitor moves, and strategic opportunities.',
      weight: '0.150',
      color: '#F59E0B',
      sortOrder: 3,
    },
    {
      name: 'Personal Stories',
      description: 'Authentic stories of failures, breakthroughs, and lessons learned the hard way.',
      weight: '0.150',
      color: '#EF4444',
      sortOrder: 4,
    },
  ];

  const insertedPillars = await db
    .insert(contentPillars)
    .values(
      pillarData.map((p) => ({
        userId: demoUser.id,
        name: p.name,
        description: p.description,
        weight: p.weight,
        color: p.color,
        sortOrder: p.sortOrder,
      })),
    )
    .returning();

  console.info(`  Created ${insertedPillars.length} content pillars`);

  // Build a lookup by name for assigning posts to pillars
  const pillarByName = new Map(insertedPillars.map((p) => [p.name, p]));

  // -----------------------------------------------------------------------
  // 5. Posts (20 total across all statuses)
  // -----------------------------------------------------------------------

  interface SeedPost {
    content: string;
    hook: string;
    hashtags: string[];
    format: string;
    pillarName: string;
    status: string;
    scheduledAt: Date | null;
    approvedAt: Date | null;
    publishedAt: Date | null;
    linkedinPostId: string | null;
    linkedinPostUrl: string | null;
  }

  const now = new Date();

  const seedPosts: SeedPost[] = [
    // ----- 5 Published (spread over 2 weeks) -----
    {
      content: 'The best leaders I know share one trait: they ask more questions than they give answers.\n\nIn my first year as a VP, I thought leadership meant having the answer to everything. I was wrong.\n\nHere are 3 questions that transformed how my team operates:\n\n1. "What would you do if I weren\'t here?"\n2. "What are we optimizing for?"\n3. "Who hasn\'t spoken yet?"\n\nThe third one changed everything. Our quietest engineer had the best ideas - she just needed space.\n\nLeadership isn\'t about being the smartest person in the room. It\'s about making everyone else smarter.',
      hook: 'The best leaders I know share one trait',
      hashtags: ['leadership', 'management', 'teambuilding'],
      format: 'text',
      pillarName: 'Leadership',
      status: 'published',
      scheduledAt: daysAgo(14),
      approvedAt: daysAgo(14),
      publishedAt: daysAgo(13),
      linkedinPostId: 'urn:li:share:7100000000000000001',
      linkedinPostUrl: 'https://www.linkedin.com/feed/update/urn:li:share:7100000000000000001',
    },
    {
      content: 'GPT-5 won\'t replace your job. But someone using AI tools effectively will.\n\nI spent last week auditing how our team uses AI:\n- Code reviews: 40% faster with AI-assisted analysis\n- Customer research: 3x more insights per hour\n- Content creation: 5 drafts in the time it took to write 1\n\nThe gap isn\'t AI vs. humans. It\'s AI-augmented humans vs. everyone else.\n\nWhat AI tool has changed your workflow the most?',
      hook: 'GPT-5 won\'t replace your job',
      hashtags: ['AI', 'futureofwork', 'productivity'],
      format: 'text',
      pillarName: 'Tech Trends',
      status: 'published',
      scheduledAt: daysAgo(11),
      approvedAt: daysAgo(11),
      publishedAt: daysAgo(10),
      linkedinPostId: 'urn:li:share:7100000000000000002',
      linkedinPostUrl: 'https://www.linkedin.com/feed/update/urn:li:share:7100000000000000002',
    },
    {
      content: 'I got rejected from 47 jobs before landing my dream role.\n\nHere\'s what nobody tells you about job searching:\n\nYour resume gets 6 seconds of attention. Six.\n\nSo I stopped writing resumes and started writing stories:\n- "Increased revenue by 23%" became "Turned a failing product into the company\'s #1 revenue driver"\n- "Managed a team of 12" became "Built a team from 0 to 12 that shipped our first mobile app in 90 days"\n\nResults speak. But stories are what people remember.\n\nDrop your best resume line below.',
      hook: 'I got rejected from 47 jobs',
      hashtags: ['careers', 'jobsearch', 'resume'],
      format: 'text',
      pillarName: 'Career Growth',
      status: 'published',
      scheduledAt: daysAgo(8),
      approvedAt: daysAgo(8),
      publishedAt: daysAgo(7),
      linkedinPostId: 'urn:li:share:7100000000000000003',
      linkedinPostUrl: 'https://www.linkedin.com/feed/update/urn:li:share:7100000000000000003',
    },
    {
      content: 'The SaaS market is shifting under our feet.\n\n3 trends I\'m watching closely:\n\n1. Usage-based pricing is replacing seat-based models. Customers want to pay for value, not headcount.\n\n2. AI-native startups are disrupting incumbents 10x faster than the previous wave. The moat is in data and workflow, not features.\n\n3. The "platform play" is back. Companies that own the ecosystem win.\n\nThe companies that adapt fast will thrive. The ones that don\'t?\n\nWell, ask Blockbuster.',
      hook: 'The SaaS market is shifting under our feet',
      hashtags: ['SaaS', 'startups', 'trends'],
      format: 'text',
      pillarName: 'Industry Insights',
      status: 'published',
      scheduledAt: daysAgo(5),
      approvedAt: daysAgo(5),
      publishedAt: daysAgo(4),
      linkedinPostId: 'urn:li:share:7100000000000000004',
      linkedinPostUrl: 'https://www.linkedin.com/feed/update/urn:li:share:7100000000000000004',
    },
    {
      content: 'I almost quit tech in 2019.\n\nBurnout hit me like a freight train. 80-hour weeks, no boundaries, and a voice in my head saying "you\'re not doing enough."\n\nMy wake-up call? My 5-year-old drew a picture of our family. I wasn\'t in it.\n\nThat day I made 3 changes:\n1. Hard stop at 6pm (no exceptions)\n2. One phone-free day per week\n3. Said "no" to 50% of meetings\n\nMy output didn\'t drop. It doubled.\n\nBurnout isn\'t a badge of honor. It\'s a design flaw.\n\nIf this resonates, share it with someone who needs to hear it.',
      hook: 'I almost quit tech in 2019',
      hashtags: ['burnout', 'worklifebalance', 'mentalhealth'],
      format: 'text',
      pillarName: 'Personal Stories',
      status: 'published',
      scheduledAt: daysAgo(2),
      approvedAt: daysAgo(2),
      publishedAt: daysAgo(1),
      linkedinPostId: 'urn:li:share:7100000000000000005',
      linkedinPostUrl: 'https://www.linkedin.com/feed/update/urn:li:share:7100000000000000005',
    },

    // ----- 5 Approved -----
    {
      content: 'Your first 90 days as a manager will define the next 3 years.\n\nHere\'s the playbook I wish someone gave me:\n\nWeek 1-2: Listen. Don\'t change anything. Just observe.\nWeek 3-4: Identify the top 3 pain points your team faces.\nWeek 5-8: Fix ONE thing. Ship a visible win.\nWeek 9-12: Build the system that prevents the next fire.\n\nMost new managers try to change everything at once. That\'s how you lose trust.\n\nStart small. Build momentum. Earn the right to lead.',
      hook: 'Your first 90 days as a manager',
      hashtags: ['management', 'leadership', 'newmanager'],
      format: 'text',
      pillarName: 'Leadership',
      status: 'approved',
      scheduledAt: null,
      approvedAt: daysAgo(0),
      publishedAt: null,
      linkedinPostId: null,
      linkedinPostUrl: null,
    },
    {
      content: 'RAG is not dead. You\'re just implementing it wrong.\n\n90% of RAG failures come from 3 mistakes:\n\n1. Chunking strategy is wrong. Don\'t split on token count - split on semantic boundaries.\n2. Embeddings aren\'t fine-tuned. Generic embeddings miss domain-specific nuance.\n3. No re-ranking. Vector similarity isn\'t enough - you need a second pass.\n\nFix these three and your retrieval accuracy jumps from ~60% to ~90%.\n\nI\'ll share our exact implementation in a follow-up post.',
      hook: 'RAG is not dead',
      hashtags: ['RAG', 'AI', 'engineering'],
      format: 'text',
      pillarName: 'Tech Trends',
      status: 'approved',
      scheduledAt: null,
      approvedAt: daysAgo(0),
      publishedAt: null,
      linkedinPostId: null,
      linkedinPostUrl: null,
    },
    {
      content: 'Stop networking. Start helping.\n\nThe most connected people I know never "network." They:\n\n- Make introductions without being asked\n- Share relevant articles with a personal note\n- Remember details about people\'s lives\n- Follow up 3 months later, not 3 days\n\nNetworking feels transactional because most people make it transactional.\n\nFlip the script: ask "How can I help?" instead of "What can you do for me?"\n\nYour network is your net worth. Build it with generosity.',
      hook: 'Stop networking. Start helping.',
      hashtags: ['networking', 'career', 'relationships'],
      format: 'text',
      pillarName: 'Career Growth',
      status: 'approved',
      scheduledAt: null,
      approvedAt: daysAgo(0),
      publishedAt: null,
      linkedinPostId: null,
      linkedinPostUrl: null,
    },
    {
      content: 'The creator economy is merging with B2B. Here\'s what that means.\n\nEvery B2B company will have a "creator strategy" by 2026. Why?\n\n- Trust in brands is at an all-time low\n- Trust in individuals is at an all-time high\n- Founder-led content generates 3-5x more engagement than brand content\n\nThe companies winning right now aren\'t running ads. They\'re building audiences.\n\nLinkedIn is the last underpriced platform for B2B. The window is closing.\n\nAre you building your audience or renting someone else\'s?',
      hook: 'The creator economy is merging with B2B',
      hashtags: ['B2B', 'creatoreconomy', 'marketing'],
      format: 'text',
      pillarName: 'Industry Insights',
      status: 'approved',
      scheduledAt: null,
      approvedAt: daysAgo(0),
      publishedAt: null,
      linkedinPostId: null,
      linkedinPostUrl: null,
    },
    {
      content: 'My biggest career mistake taught me the most important lesson.\n\nIn 2021, I turned down a founding engineer role at a startup. The reason? "It\'s too risky."\n\nThat startup is now worth $2B.\n\nBut here\'s what I learned: regret from inaction hurts more than regret from failure.\n\nSince then, my decision framework is simple:\n- Will I learn something new? Ship it.\n- Does it scare me a little? Good sign.\n- Can I recover if it fails? Then go.\n\nPlay to win, not to not lose.',
      hook: 'My biggest career mistake',
      hashtags: ['career', 'startups', 'risk'],
      format: 'text',
      pillarName: 'Personal Stories',
      status: 'approved',
      scheduledAt: null,
      approvedAt: daysAgo(0),
      publishedAt: null,
      linkedinPostId: null,
      linkedinPostUrl: null,
    },

    // ----- 5 Draft -----
    {
      content: 'Unpopular opinion: 1-on-1 meetings are broken.\n\nMost 1:1s are status updates disguised as "check-ins." That\'s what Slack is for.\n\nGreat 1:1s focus on:\n- Career development (where do you want to be in 2 years?)\n- Blockers only the manager can remove\n- Feedback in both directions\n- Energy levels and motivation\n\nI moved status updates to async and gave my team back 4 hours/week.\n\nEngagement scores went up. Attrition went down.\n\nHow do you run your 1:1s?',
      hook: 'Unpopular opinion: 1-on-1 meetings are broken',
      hashtags: ['management', 'meetings', 'productivity'],
      format: 'text',
      pillarName: 'Leadership',
      status: 'draft',
      scheduledAt: null,
      approvedAt: null,
      publishedAt: null,
      linkedinPostId: null,
      linkedinPostUrl: null,
    },
    {
      content: 'Edge computing will be bigger than cloud computing. Here\'s why.\n\nBy 2027, 75% of enterprise data will be processed at the edge (Gartner).\n\nWhy? Because latency matters more than ever:\n- Self-driving cars can\'t wait 200ms for a cloud response\n- AR/VR needs sub-10ms rendering\n- IoT devices generate too much data to send everything to the cloud\n\nThe companies building edge-first architectures today will own the next decade.\n\nWatch this space.',
      hook: 'Edge computing will be bigger than cloud',
      hashtags: ['edgecomputing', 'cloud', 'technology'],
      format: 'text',
      pillarName: 'Tech Trends',
      status: 'draft',
      scheduledAt: null,
      approvedAt: null,
      publishedAt: null,
      linkedinPostId: null,
      linkedinPostUrl: null,
    },
    {
      content: 'The skill that got you promoted won\'t get you to the next level.\n\nIC to Manager: Stop being the best individual contributor. Start multiplying others.\n\nManager to Director: Stop managing tasks. Start managing systems.\n\nDirector to VP: Stop managing systems. Start managing strategy.\n\nVP to C-suite: Stop managing strategy. Start managing narratives.\n\nEach transition requires letting go of what made you successful before.\n\nThat\'s why it\'s so hard. And why so few make it.',
      hook: 'The skill that got you promoted',
      hashtags: ['career', 'promotion', 'growth'],
      format: 'text',
      pillarName: 'Career Growth',
      status: 'draft',
      scheduledAt: null,
      approvedAt: null,
      publishedAt: null,
      linkedinPostId: null,
      linkedinPostUrl: null,
    },
    {
      content: 'Remote work isn\'t the future. Async work is.\n\nRemote just moves the office to your living room. Async changes how work gets done.\n\nThe difference:\n- Remote: Same meetings, different location\n- Async: Fewer meetings, better documentation, more deep work\n\nCompanies that go async-first see:\n- 35% more deep work hours per week\n- 50% fewer meetings\n- Higher employee satisfaction\n\nThe future isn\'t about where you work. It\'s about when and how.',
      hook: 'Remote work isn\'t the future',
      hashtags: ['remotework', 'async', 'future'],
      format: 'text',
      pillarName: 'Industry Insights',
      status: 'draft',
      scheduledAt: null,
      approvedAt: null,
      publishedAt: null,
      linkedinPostId: null,
      linkedinPostUrl: null,
    },
    {
      content: 'I fired my best friend. Here\'s what happened.\n\nWe co-founded a startup together in 2018. By 2020, it was clear: we were great friends but terrible business partners.\n\nI avoided the conversation for 6 months. The company suffered.\n\nWhen I finally had the talk, I expected to lose a friend. Instead, he said: "I\'ve been waiting for you to say this."\n\nWe\'re still friends. The company recovered.\n\nLesson: The conversations you avoid are the ones that matter most.',
      hook: 'I fired my best friend',
      hashtags: ['entrepreneurship', 'founders', 'hardlessons'],
      format: 'text',
      pillarName: 'Personal Stories',
      status: 'draft',
      scheduledAt: null,
      approvedAt: null,
      publishedAt: null,
      linkedinPostId: null,
      linkedinPostUrl: null,
    },

    // ----- 3 Scheduled -----
    {
      content: 'The best feedback I ever received was 4 words: "You\'re not listening enough."\n\nAs a leader, I thought my job was to have answers. My mentor told me my job was to create the space where answers emerge.\n\nNow I practice the 80/20 rule in every meeting: listen 80%, talk 20%.\n\nResult? Better decisions. Stronger team. Less ego.',
      hook: 'The best feedback I ever received',
      hashtags: ['leadership', 'feedback', 'listening'],
      format: 'text',
      pillarName: 'Leadership',
      status: 'scheduled',
      scheduledAt: hoursFromNow(24),
      approvedAt: daysAgo(0),
      publishedAt: null,
      linkedinPostId: null,
      linkedinPostUrl: null,
    },
    {
      content: 'AI agents are the next platform shift. Here\'s my prediction.\n\nIn 2025, we\'re where mobile was in 2008. Everyone knows it\'s big. Nobody knows what it looks like.\n\nWhat I\'m betting on:\n- Agent-to-agent protocols (the HTTP of AI)\n- Specialized vertical agents > general horizontal ones\n- The "app store" moment is 18 months away\n\nThe companies building agent infrastructure today will be the AWS of 2030.',
      hook: 'AI agents are the next platform shift',
      hashtags: ['AI', 'agents', 'platforms'],
      format: 'text',
      pillarName: 'Tech Trends',
      status: 'scheduled',
      scheduledAt: hoursFromNow(48),
      approvedAt: daysAgo(0),
      publishedAt: null,
      linkedinPostId: null,
      linkedinPostUrl: null,
    },
    {
      content: 'Your salary is not your worth. Your skills are.\n\nI took a 30% pay cut to join a startup. Best financial decision I ever made.\n\nNot because of the equity (though that helped). Because in 2 years I learned:\n- How to sell\n- How to build product\n- How to lead without authority\n\nThose skills have compounded more than any salary ever could.\n\nOptimize for learning rate, not earning rate. Especially early in your career.',
      hook: 'Your salary is not your worth',
      hashtags: ['salary', 'career', 'startup'],
      format: 'text',
      pillarName: 'Career Growth',
      status: 'scheduled',
      scheduledAt: hoursFromNow(72),
      approvedAt: daysAgo(0),
      publishedAt: null,
      linkedinPostId: null,
      linkedinPostUrl: null,
    },

    // ----- 2 Skipped -----
    {
      content: 'Why I deleted all my productivity apps.\n\nAt one point I had: Notion, Todoist, Trello, Asana, Google Calendar, Obsidian, and 3 different habit trackers.\n\nI spent more time organizing my productivity system than actually being productive.\n\nNow I use: a notebook and a single calendar.\n\nThe best productivity system is the one you actually use.',
      hook: 'Why I deleted all my productivity apps',
      hashtags: ['productivity', 'minimalism'],
      format: 'text',
      pillarName: 'Personal Stories',
      status: 'skipped',
      scheduledAt: null,
      approvedAt: null,
      publishedAt: null,
      linkedinPostId: null,
      linkedinPostUrl: null,
    },
    {
      content: 'Hot take: Most "thought leadership" on LinkedIn is just recycled advice.\n\n"Wake up at 5am" - not for everyone.\n"Follow your passion" - privilege, not strategy.\n"Hustle harder" - burnout in disguise.\n\nReal thought leadership means sharing original insights from your unique experience.\n\nBe specific. Be vulnerable. Be different.\n\nOr just keep reposting motivational quotes. Your choice.',
      hook: 'Hot take: Most thought leadership is recycled',
      hashtags: ['linkedin', 'thoughtleadership', 'authenticity'],
      format: 'text',
      pillarName: 'Industry Insights',
      status: 'skipped',
      scheduledAt: null,
      approvedAt: null,
      publishedAt: null,
      linkedinPostId: null,
      linkedinPostUrl: null,
    },
  ];

  const insertedPosts = await db
    .insert(posts)
    .values(
      seedPosts.map((p) => {
        const pillar = pillarByName.get(p.pillarName);
        return {
          userId: demoUser.id,
          pillarId: pillar?.id ?? null,
          content: p.content,
          hook: p.hook,
          hashtags: p.hashtags,
          format: p.format,
          aiModel: 'claude-sonnet-4-20250514',
          generationPrompt: `Write a LinkedIn post about ${p.pillarName.toLowerCase()}`,
          status: p.status,
          scheduledAt: p.scheduledAt,
          approvedAt: p.approvedAt,
          publishedAt: p.publishedAt,
          linkedinPostId: p.linkedinPostId,
          linkedinPostUrl: p.linkedinPostUrl,
        };
      }),
    )
    .returning();

  console.info(`  Created ${insertedPosts.length} posts`);

  // -----------------------------------------------------------------------
  // 6. Post analytics for published posts
  // -----------------------------------------------------------------------

  const publishedPosts = insertedPosts.filter((p) => p.status === 'published');

  const analyticsData: Array<{
    impressions: number;
    reactions: number;
    comments: number;
    reposts: number;
    clicks: number;
  }> = [
    { impressions: 12450, reactions: 342, comments: 87, reposts: 23, clicks: 567 },
    { impressions: 8730, reactions: 215, comments: 52, reposts: 14, clicks: 389 },
    { impressions: 15200, reactions: 478, comments: 124, reposts: 41, clicks: 823 },
    { impressions: 6890, reactions: 156, comments: 38, reposts: 9, clicks: 234 },
    { impressions: 21300, reactions: 612, comments: 198, reposts: 67, clicks: 1245 },
  ];

  const analyticsInserts = publishedPosts.map((post, i) => {
    const data = analyticsData[i];
    if (!data) {
      throw new Error(`Missing analytics data for post index ${i}`);
    }
    const totalEngagement = data.reactions + data.comments + data.reposts + data.clicks;
    const engagementRate = data.impressions > 0
      ? (totalEngagement / data.impressions).toFixed(4)
      : '0.0000';

    return {
      postId: post.id,
      userId: demoUser.id,
      impressions: data.impressions,
      reactions: data.reactions,
      comments: data.comments,
      reposts: data.reposts,
      clicks: data.clicks,
      engagementRate,
      snapshotAt: post.publishedAt ?? now,
      rawResponse: {
        source: 'seed-data',
        fetchedAt: now.toISOString(),
      },
    };
  });

  await db.insert(postAnalytics).values(analyticsInserts);

  console.info(`  Created ${analyticsInserts.length} post analytics records`);

  // -----------------------------------------------------------------------
  // Done
  // -----------------------------------------------------------------------

  console.info('Seeding complete!');

  await pool.end();
}

seed().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Seed failed: ${message}`);
  process.exit(1);
});
