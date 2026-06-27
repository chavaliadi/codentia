import type { 
    MetricsSummary, Grade, CategoryScores, ArchitectureInsights, 
    RootCauseCluster, TopFix, Issue, FileResult, ProjectResult, 
    CorrectnessConfidenceBand, TopImprovement 
} from './types';
import path from 'node:path';

// CategoryScores is imported from types.ts

function clamp(v: number) { return Math.max(0, Math.min(100, Math.round(v))); }

function gradeFromScore(score: number): Grade {
    if (score >= 90) return 'Excellent';
    if (score >= 70) return 'Good';
    if (score >= 50) return 'Fair';
    return 'Critical';
}

// ─── Import Resolution Heuristics ───────────────────────────────────────────
function resolveImportPath(importSrc: string, currentFile: string, allFiles: Set<string>): string | null {
    if (!importSrc.startsWith('.')) {
        if (importSrc.startsWith('@/')) {
            const relativeToRoot = importSrc.slice(2);
            return matchFileCandidate(relativeToRoot, allFiles);
        }
        return null; // external package
    }
    const currentDir = path.posix.dirname(currentFile);
    const resolved = path.posix.join(currentDir, importSrc);
    return matchFileCandidate(resolved, allFiles);
}

function matchFileCandidate(resolvedPath: string, allFiles: Set<string>): string | null {
    const candidates = [
        resolvedPath,
        resolvedPath + '.ts',
        resolvedPath + '.tsx',
        resolvedPath + '.js',
        resolvedPath + '.jsx',
        path.posix.join(resolvedPath, 'index.ts'),
        path.posix.join(resolvedPath, 'index.tsx'),
        path.posix.join(resolvedPath, 'index.js'),
        path.posix.join(resolvedPath, 'index.jsx'),
    ];
    for (const c of candidates) {
        const clean = c.replace(/^\.\//, '');
        if (allFiles.has(clean)) {
            return clean;
        }
    }
    return null;
}

// ─── Tarjan's SCC for Cycle Detection ────────────────────────────────────────
function findCycles(adjList: Map<string, string[]>): string[][] {
    const indexMap = new Map<string, number>();
    const lowLinkMap = new Map<string, number>();
    const onStack = new Set<string>();
    const stack: string[] = [];
    let index = 0;
    const cycles: string[][] = [];

    function strongConnect(node: string) {
        indexMap.set(node, index);
        lowLinkMap.set(node, index);
        index++;
        stack.push(node);
        onStack.add(node);

        const neighbors = adjList.get(node) || [];
        for (const neighbor of neighbors) {
            if (!indexMap.has(neighbor)) {
                strongConnect(neighbor);
                lowLinkMap.set(node, Math.min(lowLinkMap.get(node)!, lowLinkMap.get(neighbor)!));
            } else if (onStack.has(neighbor)) {
                lowLinkMap.set(node, Math.min(lowLinkMap.get(node)!, indexMap.get(neighbor)!));
            }
        }

        if (lowLinkMap.get(node) === indexMap.get(node)) {
            const component: string[] = [];
            let w;
            do {
                w = stack.pop()!;
                onStack.delete(w);
                component.push(w);
            } while (w !== node);

            if (component.length > 1) {
                cycles.push(component.reverse());
            } else if (component.length === 1) {
                const selfLoop = (adjList.get(component[0]) || []).includes(component[0]);
                if (selfLoop) {
                    cycles.push(component);
                }
            }
        }
    }

    for (const node of adjList.keys()) {
        if (!indexMap.has(node)) {
            strongConnect(node);
        }
    }

    return cycles;
}

// Heuristics for typical Entry Point filenames in full-stack frameworks
const ENTRY_POINT_NAMES = new Set([
    'page.tsx', 'layout.tsx', 'route.ts', 'route.tsx', 'index.ts', 'index.js',
    'main.ts', 'main.js', 'App.tsx', 'App.jsx', 'App.js', 'global.d.ts', 'next-env.d.ts'
]);

function isEntryPoint(filePath: string): boolean {
    const lower = filePath.toLowerCase();
    const base = path.posix.basename(filePath);
    if (ENTRY_POINT_NAMES.has(base)) return true;
    if (lower.startsWith('app/api/') || lower.includes('/app/api/')) return true;
    return false;
}

// ─── Main Aggregator ────────────────────────────────────────────────────────
export function aggregateResults(
    fileResults: FileResult[],
    aiExplanation: string,
    allIssues: { filePath: string; issue: Issue }[] = []
): ProjectResult {
    if (fileResults.length === 0) {
        return {
            projectScore: 0,
            projectGrade: 'Critical',
            summary: 'No analyzable files found.',
            fileResults: [],
            topImprovements: [],
            categoryScores: { readability: 0, maintainability: 0, cleanliness: 0, structure: 0 },
            correctnessSummary: {
                filesFailedSyntax: 0,
                filesUnchecked: 0,
                filesChecked: 0,
                passFiles: 0,
                failFiles: 0,
                confidenceBand: 'unknown',
            },
            totalFiles: 0,
            totalLines: 0,
            totalFunctions: 0,
            aiExplanation,
        };
    }

    // ── Correctness aggregation ──────────────────────────────────────────
    const passFiles = fileResults.filter(f => f.correctnessStatus === 'pass').length;
    const failFiles = fileResults.filter(f => f.correctnessStatus === 'fail').length;
    const uncheckedFiles = fileResults.filter(f => f.correctnessStatus === 'unknown').length;

    const filesChecked = Math.max(0, fileResults.length - uncheckedFiles);
    const failedSyntax = failFiles; // currently: only "fail" represents failed syntax check

    const checkedRatio = fileResults.length === 0 ? 0 : filesChecked / fileResults.length;
    const confidenceBand: CorrectnessConfidenceBand =
        filesChecked === 0 ? 'unknown' :
            checkedRatio >= 0.8 ? 'high' :
                checkedRatio >= 0.4 ? 'medium' :
                    'low';

    // ── Import Graph Resolution ──────────────────────────────────────────
    const allFilesSet = new Set(fileResults.map(f => f.filePath));
    const adjList = new Map<string, string[]>();
    const inDegreeMap = new Map<string, number>();

    fileResults.forEach(f => {
        const resolved = (f.imports || [])
            .map((imp: string) => resolveImportPath(imp, f.filePath, allFilesSet))
            .filter((imp: string | null): imp is string => imp !== null);

        const uniqueResolved = Array.from(new Set(resolved));
        adjList.set(f.filePath, uniqueResolved);

        uniqueResolved.forEach(target => {
            inDegreeMap.set(target, (inDegreeMap.get(target) || 0) + 1);
        });
    });

    // Detect cycles using Tarjan's SCC
    const cycles = findCycles(adjList);

    // Detect dead code (zero in-degree and not an entry point candidate)
    const deadCode: string[] = [];
    fileResults.forEach(f => {
        const inDegree = inDegreeMap.get(f.filePath) || 0;
        if (inDegree === 0 && !isEntryPoint(f.filePath)) {
            deadCode.push(f.filePath);
        }
    });

    // Detect god files (highly complex/long + heavily imported/coupled)
    const godFiles: string[] = [];
    fileResults.forEach(f => {
        const inDegree = inDegreeMap.get(f.filePath) || 0;
        const outDegree = (adjList.get(f.filePath) || []).length;
        if ((inDegree >= 4 || outDegree >= 8) && (f.metrics.totalLines > 150 || f.metrics.maxCyclomaticComplexity > 12)) {
            godFiles.push(f.filePath);
        }
    });

    // Generate limited Mermaid import graph to keep layout clean and readable
    const nodesToRender = new Set<string>();
    cycles.flat().forEach(node => nodesToRender.add(node));
    godFiles.forEach(node => nodesToRender.add(node));

    // Include top 10 most coupled files to fill layout context
    const degreeList = Array.from(adjList.keys()).map(node => {
        const outDegree = (adjList.get(node) || []).length;
        const inDegree = inDegreeMap.get(node) || 0;
        return { node, degree: outDegree + inDegree };
    }).sort((a, b) => b.degree - a.degree);

    degreeList.slice(0, 10).forEach(d => nodesToRender.add(d.node));

    const mermaidLines: string[] = ['graph TD'];
    nodesToRender.forEach(node => {
        const base = path.posix.basename(node);
        const nodeCleanId = node.replace(/[^a-zA-Z0-9]/g, '_');
        mermaidLines.push(`    ${nodeCleanId}["${base}"]`);
    });

    nodesToRender.forEach(node => {
        const nodeCleanId = node.replace(/[^a-zA-Z0-9]/g, '_');
        const targets = adjList.get(node) || [];
        for (const t of targets) {
            if (nodesToRender.has(t)) {
                const targetCleanId = t.replace(/[^a-zA-Z0-9]/g, '_');
                mermaidLines.push(`    ${nodeCleanId} --> ${targetCleanId}`);
            }
        }
    });
    const mermaidGraph = mermaidLines.length > 1 ? mermaidLines.join('\n') : 'graph TD\n    empty["No coupled imports found"]';

    const architectureInsights: ArchitectureInsights = {
        mermaidGraph,
        cycles,
        deadCode,
        godFiles,
    };

    // ── Root Cause Clustering ────────────────────────────────────────────
    const folderIssuesMap = new Map<string, { affectedFiles: Set<string>; categories: Set<string>; count: number }>();

    allIssues.forEach(({ filePath, issue }) => {
        const folder = path.posix.dirname(filePath);
        if (folder === '.') return; // skip root folder for noise reduction

        if (!folderIssuesMap.has(folder)) {
            folderIssuesMap.set(folder, {
                affectedFiles: new Set<string>(),
                categories: new Set<string>(),
                count: 0
            });
        }

        const data = folderIssuesMap.get(folder)!;
        data.affectedFiles.add(path.posix.basename(filePath));
        data.categories.add(issue.type);
        data.count++;
    });

    const rootCauseClusters: RootCauseCluster[] = [];
    folderIssuesMap.forEach((data, folder) => {
        if (data.count >= 2) {
            rootCauseClusters.push({
                folder,
                issueCount: data.count,
                affectedFiles: Array.from(data.affectedFiles),
                categories: Array.from(data.categories),
                architecturalTip: '', // Will be updated in analyze-zip API route using LLM
            });
        }
    });

    // Heuristically generate Top Fixes placeholder (will be re-ordered and detailed by LLM)
    const topFixes: TopFix[] = [];
    let rank = 1;
    if (cycles.length > 0) {
        topFixes.push({
            rank: rank++,
            title: 'Break Circular Dependencies',
            impact: 'High',
            description: `${cycles.length} circular loops detected (e.g. ${cycles[0].map(c => path.posix.basename(c)).join(' -> ')}). Extract shared interfaces to improve testability.`,
        });
    }
    if (godFiles.length > 0) {
        topFixes.push({
            rank: rank++,
            title: 'Simplify God Files',
            impact: 'High',
            description: `${godFiles.length} modules have excessive complexity and size (e.g. ${path.posix.basename(godFiles[0])}). Break them down into smaller helpers.`,
        });
    }
    if (deadCode.length > 0) {
        topFixes.push({
            rank: rank++,
            title: 'Clean Up Dead Code',
            impact: 'Medium',
            description: `${deadCode.length} files are not imported anywhere in the project scope (e.g. ${path.posix.basename(deadCode[0])}). Verify and delete.`,
        });
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
        correctnessSummary: {
            filesFailedSyntax: failedSyntax,
            filesUnchecked: uncheckedFiles,
            filesChecked,
            passFiles,
            failFiles,
            confidenceBand,
        },
        totalFiles: fileResults.length,
        totalLines,
        totalFunctions,
        aiExplanation,
        architectureInsights,
        rootCauseClusters,
        topFixes: topFixes.slice(0, 5),
    };
}
