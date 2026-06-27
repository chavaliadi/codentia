import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  UserTable: defineTable({
    name: v.string(),
    email: v.string(),
    token: v.number(),
  }),

  ScansTable: defineTable({
    // Identity
    userId: v.string(),          // Clerk user ID
    scanId: v.string(),          // unique public ID for shareable link

    // Project info
    projectName: v.string(),     // user-provided name e.g. "MyApp Backend"
    languageMode: v.string(),    // "deep" | "quick" | "mixed"

    // Scores
    projectScore: v.number(),
    grade: v.string(),           // "Excellent" | "Good" | "Fair" | "Critical"
    categoryScores: v.object({
      readability: v.number(),
      maintainability: v.number(),
      cleanliness: v.number(),
      structure: v.number(),
    }),

    // Summary stats
    totalFiles: v.number(),
    totalLines: v.number(),
    totalFunctions: v.number(),

    // Top improvements (stored as JSON string for flexibility)
    topImprovements: v.string(),   // JSON.stringify(TopImprovement[])

    // AI summary (short — first sentence only)
    aiSummary: v.string(),

    // Share settings
    visibility: v.string(),        // "summary" | "full"

    // Full file results (only used when visibility === "full")
    fileResults: v.optional(v.string()),  // JSON.stringify(FileResult[])

    // Stage 2 Architecture & Root Cause insights (optional)
    architectureInsights: v.optional(v.string()), // JSON.stringify(ArchitectureInsights)
    rootCauseClusters: v.optional(v.string()),   // JSON.stringify(RootCauseCluster[])
    topFixes: v.optional(v.string()),            // JSON.stringify(TopFix[])

    // Timestamp
    createdAt: v.number(),           // Date.now()
  })
    .index("by_userId", ["userId"])
    .index("by_scanId", ["scanId"])
    .index("by_userId_createdAt", ["userId", "createdAt"]),

  // Lightweight analytics — no user tracking, just feature usage
  AnalyticsTable: defineTable({
    event: v.string(),      // e.g. "suggest_fix_clicked"
    timestamp: v.number(),  // Date.now()
  }),
});
