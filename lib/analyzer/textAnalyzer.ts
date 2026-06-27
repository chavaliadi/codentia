import type { AnalysisResult, Issue, MetricsSummary, Grade, IssueType, Severity, Priority } from './types';
import { estimateImprovement } from './scorer';
import { getLanguageModule } from './languages/index';

// ─── Priority Helper ───────────────────────────────────────────────
function determinePriority(type: IssueType, severity: Severity): Priority {
    if (type === 'unused_imports') return 'quick-win';
    if (severity === 'low') return 'quick-win';
    if (type === 'duplication' && severity === 'medium') return 'quick-win';
    return 'structural';
}

// ─── Language detection ───────────────────────────────────────────────────────

// Language family patterns — one regex set covers all
const FUNCTION_PATTERNS: RegExp[] = [
    // JS/TS (handled by AST, but usable as fallback)
    /\bfunction\s+\w+\s*\(/g,
    /\bconst\s+\w+\s*=\s*(async\s*)?\(/g,
    /\bconst\s+\w+\s*=\s*(async\s*)?(\w+\s*)=>/g,
    // Python
    /^\s*def\s+\w+\s*\(/gm,
    /^\s*async\s+def\s+\w+\s*\(/gm,
    // Go
    /\bfunc\s+\w+\s*\(/g,
    /\bfunc\s*\(\w+\s+\w+\)\s+\w+\s*\(/g,
    // Java / C# / C++
    /\b(public|private|protected|static|void|int|string|bool|auto)\s+\w+\s*\(/g,
    // Rust
    /\bfn\s+\w+\s*\(/g,
    // Ruby
    /^\s*def\s+\w+/gm,
];

const COMPLEXITY_KEYWORDS = /\b(if|else\s+if|elif|for|while|switch|case|catch|&&|\|\||and\b|or\b|unless\b|\?\?)\b/g;

function extractRawImportsText(code: string, language?: string): string[] {
    const imports: string[] = [];
    const normalized = language?.toLowerCase();
    
    if (normalized === 'py' || normalized === 'python') {
        const pyRegex = /^\s*(?:import\s+(\w+)|from\s+(\w+)\s+import)/gm;
        let match;
        while ((match = pyRegex.exec(code)) !== null) {
            const imp = match[1] || match[2];
            if (imp) imports.push(imp);
        }
    } else if (normalized === 'go' || normalized === 'golang') {
        const goRegex = /^\s*import\s+(?:"([^"]+)"|\(([\s\S]*?)\))/gm;
        let match;
        while ((match = goRegex.exec(code)) !== null) {
            if (match[1]) {
                imports.push(match[1]);
            } else if (match[2]) {
                const subMatches = match[2].match(/"([^"]+)"/g) || [];
                for (const sm of subMatches) {
                    imports.push(sm.replace(/"/g, ''));
                }
            }
        }
    } else if (normalized === 'java') {
        const javaRegex = /^\s*import\s+([\w\.]+);/gm;
        let match;
        while ((match = javaRegex.exec(code)) !== null) {
            imports.push(match[1]);
        }
    } else if (normalized === 'cpp') {
        const cppRegex = /^\s*#include\s+["<]([^">]+)[">]/gm;
        let match;
        while ((match = cppRegex.exec(code)) !== null) {
            imports.push(match[1]);
        }
    }
    return imports;
}

// ─── Core text analysis ───────────────────────────────────────────────────────

function measureNestingDepth(code: string): number {
    // Works for brace-based AND indentation-based languages
    let maxBraceDepth = 0;
    let depth = 0;
    for (const ch of code) {
        if (ch === '{') { depth++; maxBraceDepth = Math.max(maxBraceDepth, depth); }
        else if (ch === '}') depth = Math.max(0, depth - 1);
    }

    // Also check indentation depth (for Python & Ruby)
    let maxIndentDepth = 0;
    for (const line of code.split('\n')) {
        const spaces = line.match(/^(\s+)/)?.[1]?.length ?? 0;
        const indentLevel = Math.floor(spaces / 4); // assume 4-space indent
        maxIndentDepth = Math.max(maxIndentDepth, indentLevel);
    }

    return Math.max(maxBraceDepth, maxIndentDepth);
}

function detectFunctions(code: string): { count: number; lengths: number[] } {
    // Find function start lines via any pattern
    const lines = code.split('\n');
    const functionStartLines: number[] = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        for (const pattern of FUNCTION_PATTERNS) {
            pattern.lastIndex = 0;
            if (pattern.test(line)) {
                functionStartLines.push(i);
                break;
            }
        }
    }

    if (functionStartLines.length === 0) {
        return { count: 0, lengths: [] };
    }

    // Estimate function lengths by gap to next function (or end of file)
    const lengths: number[] = functionStartLines.map((startLine, idx) => {
        const endLine = idx + 1 < functionStartLines.length
            ? functionStartLines[idx + 1] - 1
            : lines.length - 1;
        return endLine - startLine + 1;
    });

    return { count: functionStartLines.length, lengths };
}

function detectDuplication(code: string): number {
    const lines = code.split('\n').map(l => l.trim()).filter(l => l.length > 4);
    const windowSize = 5;
    const seen = new Map<string, number>();
    let duplicateWindows = 0;
    let totalWindows = 0;

    for (let i = 0; i <= lines.length - windowSize; i++) {
        const block = lines.slice(i, i + windowSize).join('\n');
        const count = seen.get(block) ?? 0;
        seen.set(block, count + 1);
        totalWindows++;
        if (count > 0) duplicateWindows++;
    }
    return totalWindows === 0 ? 0 : Math.round((duplicateWindows / totalWindows) * 100);
}

function countComplexity(code: string): number {
    const matches = code.match(COMPLEXITY_KEYWORDS);
    return (matches?.length ?? 0) + 1; // +1 base path
}

// ─── Micro-pattern detection (regex-based) ──────────────────────────────────

function detectEmptyCatchBlocks(code: string): number {
    // Matches: catch (...) { } or catch: (Python)
    const pattern = /catch\s*\([^)]*\)\s*\{\s*\}/g;
    return (code.match(pattern) ?? []).length;
}

function detectRedundantElse(code: string): number {
    // Matches: return/throw followed by else block
    const pattern = /(?:return|throw)[^}]*\}\s*else\s*\{/g;
    return (code.match(pattern) ?? []).length;
}

function detectBooleanComparisons(code: string): number {
    // Matches: === true, == false, === True, etc.
    const pattern = /(?:===|==|!==|!=)\s*(?:true|false|True|False|nullptr|null)\b/g;
    return (code.match(pattern) ?? []).length;
}

function detectLongParameterLists(code: string): number {
    // Looks for function signatures with 6+ params
    // Simplistic: counts commas in function parameter lists
    const funcSignatures = code.match(/\w+\s*\([^)]{80,}\)/g) ?? [];
    return funcSignatures.filter(sig => {
        const params = sig.match(/,/g) ?? [];
        return params.length >= 5; // 6+ params means 5+ commas
    }).length;
}

function detectConditionChains(code: string): number {
    // Matches: if (...) ... else if (...) ... else if
    const pattern = /if\s*\([^)]*\)\s*\{[^}]*\}\s*else\s+if/g;
    return (code.match(pattern) ?? []).length;
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function analyzeText(code: string, language?: string): Promise<Omit<AnalysisResult, 'aiExplanation'>> {
    const rawImports = extractRawImportsText(code, language);
    const lines = code.split('\n');
    const totalLines = lines.length;

    const nestingDepth = measureNestingDepth(code);
    const { count: totalFunctions, lengths: fnLengths } = detectFunctions(code);
    const duplicationPercentage = detectDuplication(code);
    const totalComplexity = countComplexity(code);

    const avg = (arr: number[]) => arr.length === 0 ? 0 :
        Math.round(arr.reduce((a, b) => a + b, 0) / arr.length * 10) / 10;

    const avgFunctionLength = avg(fnLengths);
    const maxFunctionLength = fnLengths.length > 0 ? Math.max(...fnLengths) : 0;
    // Distribute total complexity across functions
    const avgComplexity = totalFunctions > 0
        ? Math.round((totalComplexity / totalFunctions) * 10) / 10
        : totalComplexity;

    const metrics: MetricsSummary = {
        avgCyclomaticComplexity: avgComplexity,
        maxCyclomaticComplexity: avgComplexity, // text-based can't isolate per-function
        avgFunctionLength,
        maxFunctionLength,
        maxNestingDepth: nestingDepth,
        duplicationPercentage,
        unusedImportCount: 0, // language-agnostic detection too noisy — skip
        totalFunctions,
        totalLines,
    };

    // Issues
    const issues: Issue[] = [];

    if (nestingDepth >= 4) {
        const severity: Severity = nestingDepth >= 6 ? 'high' : 'medium';
        issues.push({
            type: 'nesting',
            category: 'structural',
            severity,
            priority: determinePriority('nesting', severity),
            message: `Some logic here is nested ${nestingDepth} levels deep, which can be tricky to follow. Early returns or small helper functions could make this much clearer.`,
            confidence: 75,
            method: 'Text + indent',
        });
    }

    if (avgFunctionLength > 50) {
        const severity: Severity = avgFunctionLength > 100 ? 'high' : 'medium';
        issues.push({
            type: 'length',
            category: 'structural',
            severity,
            priority: determinePriority('length', severity),
            message: `Functions average ${avgFunctionLength} lines. Breaking longer ones into 2–3 smaller functions would make them much easier to scan and maintain.`,
            confidence: 85,
            method: 'Text + boundaries',
        });
    }

    if (avgComplexity >= 10) {
        const severity: Severity = avgComplexity >= 15 ? 'high' : 'medium';
        issues.push({
            type: 'complexity',
            category: 'structural',
            severity,
            priority: determinePriority('complexity', severity),
            message: `The code has roughly ${avgComplexity} decision paths on average. Simplifying conditional logic would improve readability and testability.`,
            confidence: 70,
            method: 'Text + keywords',
        });
    }

    if (duplicationPercentage > 15) {
        const severity: Severity = duplicationPercentage > 30 ? 'high' : 'medium';
        issues.push({
            type: 'duplication',
            category: 'structural',
            severity,
            priority: determinePriority('duplication', severity),
            message: `About ${duplicationPercentage}% of code blocks look similar. Pulling shared logic into a helper would reduce repetition and make future edits easier.`,
            confidence: 80,
            method: 'Text + similarity',
        });
    }

    // ── Micro-patterns ──
    const emptyCatches = detectEmptyCatchBlocks(code);
    if (emptyCatches > 0) {
        issues.push({
            type: 'empty_catch',
            category: 'structural',
            severity: 'medium',
            priority: 'quick-win',
            message: `${emptyCatches} empty catch block${emptyCatches > 1 ? 's' : ''} silently swallow errors. Either log them, rethrow, or document why it's safe to ignore.`,
            confidence: 90,
            method: 'Text + regex',
        });
    }

    const redundantElses = detectRedundantElse(code);
    if (redundantElses > 0) {
        issues.push({
            type: 'redundant_else',
            category: 'structural',
            severity: 'low',
            priority: 'quick-win',
            message: `${redundantElses} else block${redundantElses > 1 ? 's' : ''} after return/throw ${redundantElses > 1 ? 'are' : 'is'} unnecessary. Dedent the content to simplify the flow.`,
            confidence: 90,
            method: 'Text + regex',
        });
    }

    const boolComparisons = detectBooleanComparisons(code);
    if (boolComparisons > 0) {
        issues.push({
            type: 'bool_comparison',
            category: 'structural',
            severity: 'low',
            priority: 'quick-win',
            message: `${boolComparisons} comparison${boolComparisons > 1 ? 's' : ''} to true/false ${boolComparisons > 1 ? 'are' : 'is'} redundant. Use the variable directly or negate it instead.`,
            confidence: 95,
            method: 'Text + regex',
        });
    }

    const longParams = detectLongParameterLists(code);
    if (longParams > 0) {
        issues.push({
            type: 'long_params',
            category: 'structural',
            severity: 'medium',
            priority: 'structural',
            message: `${longParams} function${longParams > 1 ? 's' : ''} ${longParams > 1 ? 'have' : 'has'} 6+ parameters. Wrapping them in a config object would make it easier to extend.`,
            confidence: 80,
            method: 'Text + regex',
        });
    }

    const condChains = detectConditionChains(code);
    if (condChains > 0) {
        issues.push({
            type: 'condition_chain',
            category: 'structural',
            severity: 'low',
            priority: 'quick-win',
            message: `${condChains} if-else-if chain${condChains > 1 ? 's' : ''} can be hard to follow. Consider a switch statement or a lookup object for clarity.`,
            confidence: 85,
            method: 'Text + regex',
        });
    }

    // ── Language-specific patterns (Phase 5) ──
    // Call language module if available and language is specified
       // ── Language-specific patterns (Phase 5) ──
    // Call language module if available and language is specified
    if (language) {
        try {
            const languageModule = await getLanguageModule(language);
            if (languageModule) {
                const languageIssues = languageModule.detectPatterns(code);
                // ✅ Tag all language issues with category: 'language'
                const taggedIssues = languageIssues.map(issue => ({
                    ...issue,
                    category: 'language' as const,
                    priority: issue.priority || 'quick-win' as const,
                    confidence: issue.confidence || 90,
                    method: issue.method || 'Text + regex',
                }));
                issues.push(...taggedIssues);
            }
        } catch (error) {
            // Silently fail if language module unavailable
            console.warn(`Language module error for ${language}:`, error);
        }
    }

    // Scoring (same weighted formula as AST scorer)
    function clamp(v: number) { return Math.max(0, Math.min(100, Math.round(v))); }

    const complexityScore = clamp(100 - (avgComplexity - 1) * 8);
    const lengthScore = clamp(100 - Math.max(0, avgFunctionLength - 20) * 1.2);
    const nestingScore = clamp(100 - Math.max(0, nestingDepth - 2) * 15);
    const duplicationScore = clamp(100 - duplicationPercentage * 2);
    const unusedScore = 100; // unused imports skipped in text mode

    const score = clamp(
        complexityScore * 0.30 +
        lengthScore * 0.25 +
        nestingScore * 0.20 +
        duplicationScore * 0.15 +
        unusedScore * 0.10
    );

    // ⚠️ INTEGRITY FIX: Cap Quick Mode (text analyzer is always Quick mode)
    // Structure only — syntax/runtime correctness not validated
    const cappedScore = Math.min(score, 80);

    const grade: Grade =
        cappedScore >= 90 ? 'Excellent' :
            cappedScore >= 70 ? 'Good' :
                cappedScore >= 50 ? 'Fair' :
                    'Critical';

    // Sort issues by severity
    const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
    issues.sort((a, b) => order[a.severity] - order[b.severity]);

    return { score: cappedScore, grade, issues, metrics, estimatedImprovement: estimateImprovement(issues), imports: rawImports };
}
