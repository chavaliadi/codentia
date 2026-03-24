import { NextRequest, NextResponse } from 'next/server';
import { parseCode } from '@/lib/analyzer/parser';
import { computeMetrics } from '@/lib/analyzer/metrics';
import { computeScore, sortIssues, estimateImprovement } from '@/lib/analyzer/scorer';
import { analyzeText } from '@/lib/analyzer/textAnalyzer';
import { applyCorrectnessCap, checkSyntaxByLanguage } from '@/lib/analyzer/syntaxCheck';
import { GroqProvider } from '@/lib/ai/groq';
import type { AnalysisResult, CorrectnessResult } from '@/lib/analyzer/types';

const ai = new GroqProvider();

// Languages that get full AST deep analysis
const DEEP_LANGUAGES = new Set(['js', 'ts']);

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { code, language = 'ts' } = body as { code: string; language: string };

        if (!code || typeof code !== 'string') {
            return NextResponse.json({ error: 'No code provided.' }, { status: 400 });
        }
        if (code.trim().length < 10) {
            return NextResponse.json({ error: 'Please provide at least 10 characters of code to analyze.' }, { status: 400 });
        }
        if (code.length > 100_000) {
            return NextResponse.json({ error: 'Code exceeds 100KB limit. Try analyzing a smaller file or use ZIP upload for projects.' }, { status: 400 });
        }

        const isDeep = DEEP_LANGUAGES.has(language);
        let analysisBase: Omit<AnalysisResult, 'aiExplanation'>;
        let correctness: CorrectnessResult;

        if (isDeep) {
            // 🔬 Deep Mode — full AST analysis for JS/TS
            let ast;
            try {
                const parsed = parseCode(code, language as 'js' | 'ts');
                ast = parsed.ast;
                correctness = {
                    status: parsed.syntaxErrors.length > 0 ? 'fail' : 'pass',
                    syntaxErrors: parsed.syntaxErrors,
                };
            } catch {
                return NextResponse.json({ error: 'Failed to parse code. Check for syntax errors.' }, { status: 422 });
            }
            const { summary, issues: rawIssues } = computeMetrics(ast, code);
            const { score } = computeScore(summary, rawIssues, 'deep');
            const issues = sortIssues(rawIssues);
            const corrected = applyCorrectnessCap(score, correctness);
            analysisBase = { score: corrected.score, grade: corrected.grade, issues, metrics: summary, correctness };
        } else {
            // ⚡ Quick Scan Mode — text-based for all other languages
            analysisBase = await analyzeText(code, language);
            correctness = checkSyntaxByLanguage(code, language);
            const corrected = applyCorrectnessCap(analysisBase.score, correctness);
            analysisBase = { ...analysisBase, score: corrected.score, grade: corrected.grade, correctness };
        }

        // AI explanation (always) — pass mode context for file-aware prompt
        const aiExplanation = await ai.explain(
            analysisBase.metrics,
            analysisBase.issues,
            analysisBase.score,
            { mode: isDeep ? 'deep' : 'quick' }
        );

        const result: AnalysisResult = {
            ...analysisBase,
            aiExplanation,
            estimatedImprovement: estimateImprovement(analysisBase.issues),
        };

        return NextResponse.json(result);
    } catch (err) {
        console.error('[/api/analyze] Unexpected error:', err);
        return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
    }
}
