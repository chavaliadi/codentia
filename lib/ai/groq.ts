import Groq from 'groq-sdk';
import type { AIProvider, AIFixResponse } from './types';
import type { MetricsSummary, Issue } from '@/lib/analyzer/types';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ─── Explain Prompt ───────────────────────────────────────────────────────────

function buildPrompt(
    metrics: MetricsSummary,
    issues: Issue[],
    score: number,
    context?: { filename?: string; mode?: 'deep' | 'quick'; language?: string }
): string {
    const fileCtx = context?.filename
        ? `File: ${context.filename} (${context.mode === 'deep' ? 'Deep Analysis — AST' : 'Quick Scan — pattern-based'})`
        : context?.mode === 'deep'
            ? 'Deep Analysis — AST-based'
            : 'Quick Scan — pattern-based';

    const issuesSummary = issues
        .slice(0, 8)
        .map((i) => `- [${i.severity.toUpperCase()}] ${i.type}${i.name ? ` ("${i.name}")` : ''}: ${i.message}`)
        .join('\n');

    // Lead with positives
    const positives: string[] = [];
    if (metrics.avgCyclomaticComplexity <= 5) positives.push('low average complexity');
    if (metrics.maxNestingDepth <= 3) positives.push('well-controlled nesting');
    if (metrics.duplicationPercentage < 10) positives.push('minimal repeated logic');
    if (metrics.unusedImportCount === 0) positives.push('clean imports');
    if (metrics.avgFunctionLength <= 30) positives.push('concise function sizes');

    const positivesText = positives.length > 0
        ? `What's working well: ${positives.join(', ')}.`
        : 'The code has a clear structure to build on.';

    // Detect micro-patterns for lightweight contextual hints
    const detectedPatterns = issues
        .map((i) => i.type)
        .filter((v, i, a) => a.indexOf(v) === i); // unique

    let patternHints = '';
    if (detectedPatterns.includes('empty_catch')) {
        patternHints += 'Empty catch blocks were detected — suggest meaningful error handling (logging or rethrow).\n';
    }
    if (detectedPatterns.includes('redundant_else')) {
        patternHints += 'Redundant else blocks detected — suggest guard clauses for cleaner flow.\n';
    }
    if (detectedPatterns.includes('bool_comparison')) {
        patternHints += 'Boolean comparisons detected — suggest simplifying by using the variable directly.\n';
    }
    if (detectedPatterns.includes('long_params')) {
        patternHints += 'Functions with many parameters detected — suggest grouping them into a config object.\n';
    }
    if (detectedPatterns.includes('condition_chain')) {
        patternHints += 'Long if-else-if chains detected — suggest switch statements or lookup objects for clarity.\n';
    }

    const quickSyntaxLanguages = new Set(['py', 'python', 'go', 'golang']);
    const languageToken = context?.language?.toLowerCase();
    const quickHasSyntaxValidation = context?.mode === 'quick' && !!languageToken && quickSyntaxLanguages.has(languageToken);

    const quickSafetyLine = context?.mode === 'quick'
        ? quickHasSyntaxValidation
            ? '⚠️ IMPORTANT: This is a Quick Scan, and syntax was validated for Python/Go. Runtime correctness was NOT validated.'
            : '⚠️ IMPORTANT: This is a Quick Scan (pattern-based analysis). Syntax errors and runtime correctness were NOT validated. Focus your suggestions on structural improvements only.'
        : '';

    return `You are a supportive senior engineer helping a teammate improve their code.
Your tone is calm, constructive, and encouraging — like a good code reviewer, not a strict grader.
Do NOT use alarmist language. Do NOT fabricate issues not in the METRICS below.
Start by acknowledging what is working, then gently suggest the most impactful improvement.

CONTEXT: ${fileCtx}

${quickSafetyLine ? `${quickSafetyLine}\n` : ''}

METRICS:
- Code Health: ${score}/100
- ${positivesText}
- Avg Complexity: ${metrics.avgCyclomaticComplexity} (max: ${metrics.maxCyclomaticComplexity})
- Avg Function Length: ${metrics.avgFunctionLength} lines (max: ${metrics.maxFunctionLength})
- Max Nesting Depth: ${metrics.maxNestingDepth}
- Repeated Logic: ${metrics.duplicationPercentage}%
- Unused Imports: ${metrics.unusedImportCount}
- Total Functions: ${metrics.totalFunctions}

AREAS TO REFINE:
${issuesSummary || 'None — this code looks clean!'}

${patternHints ? `PATTERN HINTS (guide your thinking, don't force):\n${patternHints}` : ''}

Respond in this EXACT format (no markdown headers, no extra text):

SUMMARY: <1-2 sentences: start with something positive, then mention the most impactful improvement in a calm, approachable way — reference the specific numbers>

TOP_ACTIONS:
1. <a friendly, specific suggestion referencing the actual measured numbers>
2. <a friendly, specific suggestion>
3. <a friendly, specific suggestion — or omit if fewer than 3 issues>

EFFORT: <Low | Medium | High> — <one encouraging line on why it is manageable>`;
}

// ─── Suggest Fix Prompt ───────────────────────────────────────────────────────

function buildSuggestFixPrompt(issue: Issue, codeSnippet: string, language: string): string {
    // Pattern-aware guidance
    let patternGuidance = '';

    if (issue.type === 'empty_catch') {
        patternGuidance = '\nGuidance: Replace empty catch with either logging, rethrowing, or a clear comment explaining why it is safe to ignore.';
    } else if (issue.type === 'redundant_else') {
        patternGuidance = '\nGuidance: Remove the else block entirely — the return/throw makes it unnecessary.';
    } else if (issue.type === 'bool_comparison') {
        patternGuidance = '\nGuidance: Use the boolean directly (e.g., "if (isActive)" instead of "if (isActive === true)").';
    } else if (issue.type === 'long_params') {
        patternGuidance = '\nGuidance: Group parameters into a single config object or options interface for easier extension.';
    } else if (issue.type === 'condition_chain') {
        patternGuidance = '\nGuidance: Consider a switch statement, object lookup, or strategy pattern for clarity.';
    } else if (issue.type === 'complexity') {
        patternGuidance = '\nGuidance: Extract the most complex branch or section into its own focused helper function.';
    } else if (issue.type === 'length') {
        patternGuidance = '\nGuidance: Identify logical sections and extract 2–3 focused helper functions; preserve the main flow.';
    } else if (issue.type === 'nesting') {
        patternGuidance = '\nGuidance: Use early returns or guard clauses to flatten the structure.';
    }

    return `You are a senior engineer reviewing a specific code quality issue.
Your job is to suggest a targeted, minimal fix for ONE specific issue.
Do NOT rewrite the whole file. Do NOT add new features. Keep the fix scoped and safe.

LANGUAGE: ${language}
ISSUE TYPE: ${issue.type}
ISSUE: ${issue.message}
${issue.name ? `FUNCTION: "${issue.name}"` : ''}${patternGuidance}

CODE SNIPPET:
\`\`\`
${codeSnippet.slice(0, 2000)}
\`\`\`

Respond ONLY in valid JSON with this exact shape — no extra text, no markdown:
{
  "explanation": "<1-2 sentences explaining exactly what the fix does and why it is better>",
  "beforeSnippet": "<the original problematic code section, 5-20 lines max>",
  "afterSnippet": "<the improved version, same structure, minimal changes>",
  "whyItHelps": ["<benefit 1, e.g. Reduces nesting depth>", "<benefit 2>", "<benefit 3 if applicable>"],
  "disclaimer": "Review before applying. This is a structural suggestion, not a guaranteed solution."
}`;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export class GroqProvider implements AIProvider {
    async explain(
        metrics: MetricsSummary,
        issues: Issue[],
        score: number,
        context?: { filename?: string; mode?: 'deep' | 'quick'; language?: string }
    ): Promise<string> {
        try {
            const completion = await groq.chat.completions.create({
                model: 'llama-3.3-70b-versatile',
                temperature: 0.2,
                max_tokens: 450,
                messages: [{ role: 'user', content: buildPrompt(metrics, issues, score, context) }],
            });
            return completion.choices[0]?.message?.content
                ?? 'Analysis complete. No additional AI insight available.';
        } catch (err) {
            console.error('Groq explain error:', err);
            return 'AI insight temporarily unavailable. Your metrics-based score above is accurate.';
        }
    }

    async suggestFix(
        issue: Issue,
        codeSnippet: string,
        language: string
    ): Promise<AIFixResponse | null> {
        try {
            const completion = await groq.chat.completions.create({
                model: 'llama-3.3-70b-versatile',
                temperature: 0.1,   // lower temp = more deterministic JSON
                max_tokens: 600,
                messages: [
                    {
                        role: 'system',
                        content: 'Respond ONLY in valid JSON. No markdown. No extra text. No code fences.',
                    },
                    {
                        role: 'user',
                        content: buildSuggestFixPrompt(issue, codeSnippet, language),
                    },
                ],
            });

            const raw = completion.choices[0]?.message?.content ?? '';
            // Strip any accidental markdown fences before parsing
            const cleaned = raw.replace(/^```[a-z]*\n?/i, '').replace(/```$/i, '').trim();
            const parsed = JSON.parse(cleaned) as AIFixResponse;

            // Validate required fields are present
            if (!parsed.explanation || !parsed.beforeSnippet || !parsed.afterSnippet) {
                console.error('Groq suggestFix: missing required fields in response', parsed);
                return null;
            }

            return parsed;
        } catch (err) {
            console.error('Groq suggestFix error:', err);
            return null;
        }
    }
}
