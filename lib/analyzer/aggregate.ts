import type { AnalysisResult, Issue, MetricsSummary, Grade } from './types';

export interface FileResult {
    filename: string;
    score: number;
    grade: Grade;
    correctnessStatus?: 'pass' | 'fail' | 'unknown';
    syntaxErrorCount?: number;
    topIssue: string | null;
    issueCount: number;
    metrics: MetricsSummary;
    mode: 'deep' | 'quick';
}

export interface ProjectResult {
    projectScore: number;
    projectGrade: Grade;
    summary: string;
    fileResults: FileResult[];
    topImprovements: TopImprovement[];
    categoryScores: CategoryScores;
    totalFiles: number;
    totalLines: number;
    totalFunctions: number;
    aiExplanation: string;
}

export interface TopImprovement {
    area: string;
    description: string;
    affectedFiles: number;
    potentialGain: number; // estimated score points gain
}

export interface CategoryScores {
    readability: number;      // nesting + function length
    maintainability: number;  // complexity + duplication
    cleanliness: number;      // unused imports + file org
    structure: number;        // function count balance
}

function clamp(v: number) { return Math.max(0, Math.min(100, Math.round(v))); }

function gradeFromScore(score: number): Grade {
    if (score >= 90) return 'Excellent';
    if (score >= 70) return 'Good';
    if (score >= 50) return 'Fair';
    return 'Critical';
}

export function aggregateResults(
    fileResults: FileResult[],
    aiExplanation: string
): ProjectResult {
    if (fileResults.length === 0) {
        return {
            projectScore: 0,
            projectGrade: 'Critical',
            summary: 'No analyzable files found.',
            fileResults: [],
            topImprovements: [],
            categoryScores: { readability: 0, maintainability: 0, cleanliness: 0, structure: 0 },
            totalFiles: 0,
            totalLines: 0,
            totalFunctions: 0,
            aiExplanation,
        };
    }

    // Weighted project score — worse files pull score down more
    const sorted = [...fileResults].sort((a, b) => a.score - b.score);
    let weightedSum = 0;
    let weightTotal = 0;
    sorted.forEach((f, i) => {
        // bottom files get higher weight (2x) to penalize weak files more
        const w = i < Math.ceil(sorted.length / 3) ? 2 : 1;
        weightedSum += f.score * w;
        weightTotal += w;
    });
    const projectScore = clamp(weightedSum / weightTotal);
    const projectGrade = gradeFromScore(projectScore);

    // Aggregate raw metrics
    const all = fileResults.map(f => f.metrics);
    const avg = (arr: number[]) => arr.length === 0 ? 0 :
        Math.round(arr.reduce((a, b) => a + b, 0) / arr.length * 10) / 10;

    const avgComplexity = avg(all.map(m => m.avgCyclomaticComplexity));
    const avgDepth = avg(all.map(m => m.maxNestingDepth));
    const avgFnLen = avg(all.map(m => m.avgFunctionLength));
    const avgDupe = avg(all.map(m => m.duplicationPercentage));
    const avgUnused = avg(all.map(m => m.unusedImportCount));
    const totalLines = all.reduce((s, m) => s + m.totalLines, 0);
    const totalFunctions = all.reduce((s, m) => s + m.totalFunctions, 0);

    // Category scores
    const categoryScores: CategoryScores = {
        readability: clamp(100 - Math.max(0, avgDepth - 2) * 15 - Math.max(0, avgFnLen - 20) * 0.8),
        maintainability: clamp(100 - (avgComplexity - 1) * 8 - avgDupe * 1.5),
        cleanliness: clamp(100 - avgUnused * 12),
        structure: clamp(projectScore * 0.9 + 10), // derived / approximate
    };

    // Top improvements — find the biggest levers
    const improvements: TopImprovement[] = [];

    const highNestFiles = fileResults.filter(f => f.metrics.maxNestingDepth >= 4).length;
    if (highNestFiles > 0) improvements.push({
        area: 'Reduce Deep Nesting',
        description: `${highNestFiles} file${highNestFiles > 1 ? 's have' : ' has'} logic nested 4+ levels deep. Using early returns could significantly improve readability.`,
        affectedFiles: highNestFiles,
        potentialGain: Math.round(highNestFiles / fileResults.length * 15),
    });

    const complexFiles = fileResults.filter(f => f.metrics.avgCyclomaticComplexity >= 7).length;
    if (complexFiles > 0) improvements.push({
        area: 'Simplify Complex Functions',
        description: `${complexFiles} file${complexFiles > 1 ? 's have' : ' has'} functions with high complexity. Breaking them into smaller helpers would make them easier to test.`,
        affectedFiles: complexFiles,
        potentialGain: Math.round(complexFiles / fileResults.length * 12),
    });

    const dupeFiles = fileResults.filter(f => f.metrics.duplicationPercentage > 15).length;
    if (dupeFiles > 0) improvements.push({
        area: 'Remove Repeated Logic',
        description: `${dupeFiles} file${dupeFiles > 1 ? 's contain' : ' contains'} repeated code blocks. Extracting shared logic would reduce maintenance effort.`,
        affectedFiles: dupeFiles,
        potentialGain: Math.round(dupeFiles / fileResults.length * 10),
    });

    const unusedFiles = fileResults.filter(f => f.metrics.unusedImportCount > 0).length;
    if (unusedFiles > 0) improvements.push({
        area: 'Clean Up Unused Imports',
        description: `${unusedFiles} file${unusedFiles > 1 ? 's have' : ' has'} unused imports. Removing them keeps things tidy and slightly reduces bundle size.`,
        affectedFiles: unusedFiles,
        potentialGain: Math.round(unusedFiles / fileResults.length * 5),
    });

    // Sort by potential gain — show biggest wins first (top 3)
    const topImprovements = improvements
        .sort((a, b) => b.potentialGain - a.potentialGain)
        .slice(0, 3);

    // Summary paragraph
    const worstFile = sorted[0];
    const bestFile = sorted[sorted.length - 1];
    const summary = projectScore >= 80
        ? `Your project is in solid shape overall. ${bestFile.filename} is your strongest file — ${worstFile.filename} has the most room to grow.`
        : projectScore >= 60
            ? `There are a few areas worth attention across ${fileResults.length} files. Focusing on ${worstFile.filename} first would give you the biggest score improvement.`
            : `The project has some structural patterns worth refactoring. The good news: most improvements are focused in ${Math.min(3, fileResults.length)} key files.`;

    return {
        projectScore,
        projectGrade,
        summary,
        fileResults: sorted.reverse(), // best first in UI
        topImprovements,
        categoryScores,
        totalFiles: fileResults.length,
        totalLines,
        totalFunctions,
        aiExplanation,
    };
}
