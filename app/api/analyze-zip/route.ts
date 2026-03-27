import { NextRequest, NextResponse } from 'next/server';
import AdmZip from 'adm-zip';
import { parseCode } from '@/lib/analyzer/parser';
import { computeMetrics } from '@/lib/analyzer/metrics';
import { computeScore, sortIssues } from '@/lib/analyzer/scorer';
import { analyzeText } from '@/lib/analyzer/textAnalyzer';
import { applyCorrectnessCap, checkSyntaxByLanguage } from '@/lib/analyzer/syntaxCheck';
import { aggregateResults, FileResult } from '@/lib/analyzer/aggregate';
import { GroqProvider } from '@/lib/ai/groq';
import type { AnalysisResult } from '@/lib/analyzer/types';
import { logAnalyticsEvent } from '@/lib/telemetry/logEvent';

const ai = new GroqProvider();

const DEEP_EXTENSIONS = new Set(['.js', '.ts', '.jsx', '.tsx']);
const QUICK_EXTENSIONS = new Set([
    '.py', '.java', '.go', '.cpp', '.c', '.cs', '.rs', '.rb',
    '.swift', '.kt', '.php', '.scala', '.r', '.m',
]);
const EXCLUDED_PATHS = ['node_modules', '.next', 'dist', 'build', '.git', 'vendor', '__pycache__'];
const ZIP_SOFT_LIMIT_BYTES = 20 * 1024 * 1024;
const ZIP_HARD_LIMIT_BYTES = 25 * 1024 * 1024; // App-level cap (hosting platform may enforce stricter limits)
const TRUSTED_BLOB_HOST_SUFFIX = 'blob.vercel-storage.com';

type ZipInput = {
    filename: string;
    size: number;
    buffer: Buffer;
};

function isTrustedBlobUrl(urlString: string): boolean {
    try {
        const parsed = new URL(urlString);
        return (
            parsed.protocol === 'https:' &&
            (parsed.hostname === TRUSTED_BLOB_HOST_SUFFIX || parsed.hostname.endsWith(`.${TRUSTED_BLOB_HOST_SUFFIX}`))
        );
    } catch {
        return false;
    }
}

async function parseZipInput(req: NextRequest): Promise<{ input: ZipInput | null; error: NextResponse | null }> {
    const contentType = req.headers.get('content-type') ?? '';

    if (contentType.includes('application/json')) {
        const body = await req.json() as { blobUrl?: string; fileName?: string; fileSize?: number };
        const blobUrl = body.blobUrl?.trim();
        const fileName = (body.fileName ?? 'project.zip').trim();

        if (!blobUrl) {
            return {
                input: null,
                error: NextResponse.json({ error: 'Missing blob URL for ZIP analysis.' }, { status: 400 })
            };
        }

        if (!isTrustedBlobUrl(blobUrl)) {
            return {
                input: null,
                error: NextResponse.json({ error: 'Invalid ZIP source URL.' }, { status: 400 })
            };
        }

        if (!fileName.toLowerCase().endsWith('.zip')) {
            return {
                input: null,
                error: NextResponse.json({ error: 'Please upload a .zip file.' }, { status: 400 })
            };
        }

        if (typeof body.fileSize === 'number' && body.fileSize > ZIP_HARD_LIMIT_BYTES) {
            return {
                input: null,
                error: NextResponse.json({ error: 'ZIP file is too large for deployed analysis. Keep it under 25MB or upload a smaller subset.' }, { status: 400 })
            };
        }

        const blobResponse = await fetch(blobUrl, { cache: 'no-store' });
        if (!blobResponse.ok) {
            return {
                input: null,
                error: NextResponse.json({ error: 'Could not download uploaded ZIP. Please try again.' }, { status: 422 })
            };
        }

        const downloadedBuffer = Buffer.from(await blobResponse.arrayBuffer());
        return {
            input: {
                filename: fileName,
                size: downloadedBuffer.length,
                buffer: downloadedBuffer,
            },
            error: null,
        };
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
        return {
            input: null,
            error: NextResponse.json({ error: 'No file uploaded.' }, { status: 400 })
        };
    }

    if (!file.name.toLowerCase().endsWith('.zip')) {
        return {
            input: null,
            error: NextResponse.json({ error: 'Please upload a .zip file.' }, { status: 400 })
        };
    }

    return {
        input: {
            filename: file.name,
            size: file.size,
            buffer: Buffer.from(await file.arrayBuffer()),
        },
        error: null,
    };
}

function shouldInclude(entryName: string): boolean {
    const lower = entryName.toLowerCase();
    const basename = entryName.split('/').pop() ?? '';
    // Filter macOS resource fork files and __MACOSX metadata directories
    if (basename.startsWith('._')) return false;
    if (lower.includes('/__macosx/') || lower.startsWith('__macosx/')) return false;
    if (EXCLUDED_PATHS.some(p =>
        lower.includes(`/${p}/`) || lower.includes(`\\${p}\\`) || lower.startsWith(`${p}/`)
    )) return false;
    const ext = '.' + lower.split('.').pop();
    return DEEP_EXTENSIONS.has(ext) || QUICK_EXTENSIONS.has(ext);
}

function getMode(filename: string): 'deep' | 'quick' {
    const ext = '.' + filename.toLowerCase().split('.').pop();
    return DEEP_EXTENSIONS.has(ext) ? 'deep' : 'quick';
}

function getLang(filename: string): 'js' | 'ts' {
    return filename.endsWith('.ts') || filename.endsWith('.tsx') ? 'ts' : 'js';
}

function getLanguageId(filename: string): string {
    const ext = filename.toLowerCase().split('.').pop() ?? '';
    const extMap: Record<string, string> = {
        'js': 'js',
        'ts': 'ts',
        'py': 'py',
        'java': 'java',
        'go': 'go',
        'cpp': 'cpp',
        'cc': 'cpp',
        'cxx': 'cpp',
        'c': 'cpp', // group C with C++
        'cs': 'java', // C# uses similar patterns to Java
        'rs': 'go',   // Rust error patterns similar to Go
        'rb': 'py',   // Ruby similar to Python
    };
    return extMap[ext] || ext;
}

function getSyntaxLanguageId(filename: string): string {
    const ext = filename.toLowerCase().split('.').pop() ?? '';
    if (ext === 'py') return 'py';
    if (ext === 'go') return 'go';
    return 'unknown';
}

async function analyzeFile(
    filename: string,
    code: string,
    mode: 'deep' | 'quick'
): Promise<Omit<AnalysisResult, 'aiExplanation'>> {
    if (mode === 'deep') {
        try {
            const { ast, syntaxErrors } = parseCode(code, getLang(filename));
            const { summary, issues: rawIssues } = computeMetrics(ast, code);
            const { score } = computeScore(summary, rawIssues, 'deep');
            const issues = sortIssues(rawIssues);
            const correctnessStatus: 'pass' | 'fail' = syntaxErrors.length > 0 ? 'fail' : 'pass';
            const corrected = applyCorrectnessCap(score, {
                status: correctnessStatus,
                syntaxErrors,
            });
            return {
                score: corrected.score,
                grade: corrected.grade,
                issues,
                metrics: summary,
                correctness: {
                    status: correctnessStatus,
                    syntaxErrors,
                },
            };
        } catch {
            // fallback to text if AST fails
            const languageId = getLanguageId(filename);
            const fallback = await analyzeText(code, languageId);
            return {
                ...fallback,
                correctness: {
                    status: 'unknown',
                    syntaxErrors: [],
                },
            };
        }
    }
    const languageId = getLanguageId(filename);
    const quickResult = await analyzeText(code, languageId);
    const quickCorrectness = checkSyntaxByLanguage(code, getSyntaxLanguageId(filename));
    const corrected = applyCorrectnessCap(quickResult.score, quickCorrectness);
    return {
        ...quickResult,
        score: corrected.score,
        grade: corrected.grade,
        correctness: {
            ...quickCorrectness,
        },
    };
}

export async function POST(req: NextRequest) {
    try {
        const parsedInput = await parseZipInput(req);
        if (parsedInput.error) {
            return parsedInput.error;
        }
        const input = parsedInput.input;
        if (!input) {
            return NextResponse.json({ error: 'Invalid ZIP payload.' }, { status: 400 });
        }

        // Soft warning range for performance
        if (input.size > ZIP_SOFT_LIMIT_BYTES && input.size <= ZIP_HARD_LIMIT_BYTES) {
            console.warn(`[analyze-zip] Large ZIP uploaded: ${(input.size / 1024 / 1024).toFixed(1)}MB`);
        }

        if (input.size > ZIP_HARD_LIMIT_BYTES) {
            return NextResponse.json(
                { error: 'ZIP file is too large for deployed analysis. Keep it under 25MB or upload a smaller subset.' },
                { status: 400 }
            );
        }

        // Extract ZIP
        const zip = new AdmZip(input.buffer);
        const entries = zip.getEntries().filter(e =>
            !e.isDirectory && shouldInclude(e.entryName)
        );

        if (entries.length === 0) {
            return NextResponse.json({
                error: 'No analyzable code files found. Supported: .js, .ts, .tsx, .py, .java, .go, .cpp, .cs, .rs, .rb and more.'
            }, { status: 422 });
        }

        if (entries.length > 150) {
            return NextResponse.json({
                error: `ZIP contains ${entries.length} files. Limit is 150 files per scan. Try analyzing a specific subdirectory.`
            }, { status: 422 });
        }

        // Analyze each file (cap individual files at 100KB)
        const fileResults: FileResult[] = [];

        for (const entry of entries) {
            const code = entry.getData().toString('utf8');
            if (code.length > 100_000) continue; // skip very large files

            const filename = entry.entryName.split('/').pop() ?? entry.entryName;
            const mode = getMode(entry.entryName);

            const result = await analyzeFile(filename, code, mode);

            fileResults.push({
                filename,
                score: result.score,
                grade: result.grade,
                correctnessStatus: result.correctness?.status ?? 'unknown',
                syntaxErrorCount: result.correctness?.syntaxErrors?.length ?? 0,
                topIssue: result.issues[0]?.message?.slice(0, 100) ?? null,
                issueCount: result.issues.length,
                metrics: result.metrics,
                mode,
            });
        }

        if (fileResults.length === 0) {
            return NextResponse.json({ error: 'Could not analyze any files in the ZIP.' }, { status: 422 });
        }

        // ── Telemetry (fire-and-forget) ───────────────────────────────────
        // Best-effort only; never block request completion.
        const syntaxFailCount = fileResults.filter(f => f.correctnessStatus === 'fail').length;
        const syntaxUnknownCount = fileResults.filter(f => f.correctnessStatus === 'unknown').length;

        const syntaxUnsupportedQuickCount = fileResults.filter(f => {
            if (f.mode !== 'quick') return false;
            const ext = f.filename.toLowerCase().split('.').pop() ?? '';
            return f.correctnessStatus === 'unknown' && !['py', 'python', 'go', 'golang'].includes(ext);
        }).length;

        logAnalyticsEvent(`syntax_fail_zip_count:${syntaxFailCount}`).catch(() => { });
        logAnalyticsEvent(`syntax_unknown_zip_count:${syntaxUnknownCount}`).catch(() => { });
        logAnalyticsEvent(`syntax_unsupported_quick_zip_count:${syntaxUnsupportedQuickCount}`).catch(() => { });

        // Get AI explanation for the project-level view
        const worstFile = [...fileResults].sort((a, b) => a.score - b.score)[0];
        const avgScore = Math.round(fileResults.reduce((s, f) => s + f.score, 0) / fileResults.length);

        // Build a condensed metrics summary for the AI
        const projectMetrics = {
            avgCyclomaticComplexity: Math.round(fileResults.reduce((s, f) => s + f.metrics.avgCyclomaticComplexity, 0) / fileResults.length * 10) / 10,
            maxCyclomaticComplexity: Math.max(...fileResults.map(f => f.metrics.maxCyclomaticComplexity)),
            avgFunctionLength: Math.round(fileResults.reduce((s, f) => s + f.metrics.avgFunctionLength, 0) / fileResults.length * 10) / 10,
            maxFunctionLength: Math.max(...fileResults.map(f => f.metrics.maxFunctionLength)),
            maxNestingDepth: Math.max(...fileResults.map(f => f.metrics.maxNestingDepth)),
            duplicationPercentage: Math.round(fileResults.reduce((s, f) => s + f.metrics.duplicationPercentage, 0) / fileResults.length),
            unusedImportCount: fileResults.reduce((s, f) => s + f.metrics.unusedImportCount, 0),
            totalFunctions: fileResults.reduce((s, f) => s + f.metrics.totalFunctions, 0),
            totalLines: fileResults.reduce((s, f) => s + f.metrics.totalLines, 0),
        };

        const aiExplanation = await ai.explain(
            projectMetrics,
            worstFile ? [{
                type: 'complexity' as const,
                category: 'structural' as const,
                severity: 'medium' as const,
                priority: 'structural' as const,
                message: `Weakest file: ${worstFile.filename} (score ${worstFile.score}/100)`
            }] : [],
            avgScore,
            {
                filename: worstFile?.filename,
                mode: worstFile ? getMode(worstFile.filename) : 'quick',
                language: worstFile ? getLanguageId(worstFile.filename) : undefined,
            }
        );

        const project = aggregateResults(fileResults, aiExplanation);

        return NextResponse.json(project);
    } catch (err) {
        console.error('[/api/analyze-zip] Error:', err);
        return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
    }
}
