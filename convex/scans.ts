import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// ─── Save a scan ──────────────────────────────────────────────────────────────

export const saveScan = mutation({
    args: {
        userId: v.string(),
        scanId: v.string(),
        projectName: v.string(),
        languageMode: v.string(),
        projectScore: v.number(),
        grade: v.string(),
        categoryScores: v.object({
            readability: v.number(),
            maintainability: v.number(),
            cleanliness: v.number(),
            structure: v.number(),
        }),
        totalFiles: v.number(),
        totalLines: v.number(),
        totalFunctions: v.number(),
        topImprovements: v.string(),
        aiSummary: v.string(),
        visibility: v.string(),
        fileResults: v.optional(v.string()),
        architectureInsights: v.optional(v.string()),
        rootCauseClusters: v.optional(v.string()),
        topFixes: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        return await ctx.db.insert("ScansTable", {
            ...args,
            createdAt: Date.now(),
        });
    },
});

// ─── Get all scans for a user (dashboard) ────────────────────────────────────

export const getScansByUser = query({
    args: { userId: v.string() },
    handler: async (ctx, args) => {
        const scans = await ctx.db
            .query("ScansTable")
            .withIndex("by_userId", (q) => q.eq("userId", args.userId))
            .order("desc")
            .collect();

        // Return lightweight list — no fileResults for dashboard
        return scans.map((s) => ({
            _id: s._id,
            scanId: s.scanId,
            projectName: s.projectName,
            projectScore: s.projectScore,
            grade: s.grade,
            categoryScores: s.categoryScores,
            totalFiles: s.totalFiles,
            totalLines: s.totalLines,
            languageMode: s.languageMode,
            aiSummary: s.aiSummary,
            visibility: s.visibility,
            createdAt: s.createdAt,
        }));
    },
});

// ─── Get scans grouped by project name ───────────────────────────────────────

export const getProjectHistory = query({
    args: { userId: v.string(), projectName: v.string() },
    handler: async (ctx, args) => {
        const scans = await ctx.db
            .query("ScansTable")
            .withIndex("by_userId", (q) => q.eq("userId", args.userId))
            .order("asc")  // oldest first for trend chart
            .collect();

        return scans
            .filter((s) => s.projectName === args.projectName)
            .map((s) => ({
                scanId: s.scanId,
                projectScore: s.projectScore,
                grade: s.grade,
                categoryScores: s.categoryScores,
                createdAt: s.createdAt,
            }));
    },
});

// ─── Get a single scan by public scanId (for share links) ────────────────────

export const getScanById = query({
    args: { scanId: v.string() },
    handler: async (ctx, args) => {
        const results = await ctx.db
            .query("ScansTable")
            .withIndex("by_scanId", (q) => q.eq("scanId", args.scanId))
            .first();

        if (!results) return null;

        const base = {
            scanId: results.scanId,
            projectName: results.projectName,
            projectScore: results.projectScore,
            grade: results.grade,
            categoryScores: results.categoryScores,
            totalFiles: results.totalFiles,
            totalLines: results.totalLines,
            totalFunctions: results.totalFunctions,
            topImprovements: results.topImprovements,
            aiSummary: results.aiSummary,
            languageMode: results.languageMode,
            visibility: results.visibility,
            createdAt: results.createdAt,
            architectureInsights: results.architectureInsights,
            rootCauseClusters: results.rootCauseClusters,
            topFixes: results.topFixes,
        };

        // Only include file results if visibility is "full"
        if (results.visibility === "full" && results.fileResults) {
            return { ...base, fileResults: results.fileResults };
        }

        return base;
    },
});

// ─── Delete a scan ────────────────────────────────────────────────────────────

export const deleteScan = mutation({
    args: { scanId: v.string(), userId: v.string() },
    handler: async (ctx, args) => {
        const scan = await ctx.db
            .query("ScansTable")
            .withIndex("by_scanId", (q) => q.eq("scanId", args.scanId))
            .first();

        // Only allow deleting your own scans
        if (scan && scan.userId === args.userId) {
            await ctx.db.delete(scan._id);
            return { success: true };
        }
        return { success: false };
    },
});

// ─── Delete all scans for a project ───────────────────────────────────────────
export const deleteProjectScans = mutation({
    args: { userId: v.string(), projectName: v.string() },
    handler: async (ctx, args) => {
        const scans = await ctx.db
            .query("ScansTable")
            .withIndex("by_userId", (q) => q.eq("userId", args.userId))
            .collect();

        const target = scans.filter((s) => s.projectName === args.projectName);
        for (const scan of target) {
            await ctx.db.delete(scan._id);
        }

        return { success: true, deletedCount: target.length };
    },
});
