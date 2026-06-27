import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import type { FileResult } from "@/lib/analyzer/types";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

function generateScanId(): string {
    return Math.random().toString(36).slice(2, 10) +
        Math.random().toString(36).slice(2, 10);
}

function extractAiSummary(aiExplanation: string): string {
    // Extract first sentence from AI explanation for lightweight storage
    const firstSentence = aiExplanation.split(/[.!]/)[0]?.trim() ?? '';
    return firstSentence.slice(0, 200);
}

interface SaveScanParams {
    userId: string;
    projectName: string;
    languageMode: string;
    projectScore: number;
    grade: string;
    categoryScores: {
        readability: number;
        maintainability: number;
        cleanliness: number;
        structure: number;
    };
    totalFiles: number;
    totalLines: number;
    totalFunctions: number;
    topImprovements: string;   // JSON string
    aiExplanation: string;
    visibility: 'summary' | 'full';
    fileResults?: FileResult[];
    architectureInsights?: string;
    rootCauseClusters?: string;
    topFixes?: string;
}

export async function saveScanToConvex(params: SaveScanParams): Promise<string> {
    const scanId = generateScanId();

    await convex.mutation(api.scans.saveScan, {
        userId: params.userId,
        scanId,
        projectName: params.projectName,
        languageMode: params.languageMode,
        projectScore: params.projectScore,
        grade: params.grade,
        categoryScores: params.categoryScores,
        totalFiles: params.totalFiles,
        totalLines: params.totalLines,
        totalFunctions: params.totalFunctions,
        topImprovements: params.topImprovements,
        aiSummary: extractAiSummary(params.aiExplanation),
        visibility: params.visibility,
        fileResults: params.visibility === 'full' && params.fileResults
            ? JSON.stringify(params.fileResults)
            : undefined,
        architectureInsights: params.architectureInsights,
        rootCauseClusters: params.rootCauseClusters,
        topFixes: params.topFixes,
    });

    return scanId;
}
