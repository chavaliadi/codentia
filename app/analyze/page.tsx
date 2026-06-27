'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUser, UserButton } from '@clerk/nextjs';
import type { AnalysisResult, Grade } from '@/lib/analyzer/types';
import ScoreGauge from '@/components/analyzer/ScoreGauge';
import IssueList from '@/components/analyzer/IssueList';
import MetricsGrid from '@/components/analyzer/MetricsGrid';
import AIInsight from '@/components/analyzer/AIInsight';
import ThemeToggle from '@/components/ThemeToggle';
import { ArrowLeft, RefreshCw, BarChart2, LogIn } from 'lucide-react';

export default function AnalyzePage() {
    const [result, setResult] = useState<AnalysisResult | null>(null);
    const [language, setLanguage] = useState('ts');
    const [code, setCode] = useState('');
    const [languageMode, setLanguageMode] = useState<'deep' | 'quick'>('deep');
    const router = useRouter();
    const { user, isLoaded } = useUser();

    useEffect(() => {
        const raw = sessionStorage.getItem('cv_result');
        if (!raw) {
            router.replace('/');
            return;
        }
        try {
            setResult(JSON.parse(raw) as AnalysisResult);
            setLanguage(sessionStorage.getItem('cv_lang') ?? 'ts');
            setCode(sessionStorage.getItem('cv_code') ?? '');
            const mode = sessionStorage.getItem('cv_language_mode');
            setLanguageMode((mode === 'deep' || mode === 'quick') ? mode : 'deep');
        } catch {
            router.replace('/');
        }
    }, [router]);

    if (!result) {
        return (
            <div className="analyze-loading">
                <div className="loading-ring" />
                <span>Loading analysis…</span>
            </div>
        );
    }

    const highCount = result.issues.filter((i) => i.severity === 'high').length;
    const mediumCount = result.issues.filter((i) => i.severity === 'medium').length;
    const lowCount = result.issues.filter((i) => i.severity === 'low').length;
    const correctness = result.correctness ?? { status: 'unknown' as const, syntaxErrors: [] };
    const WASM_SUPPORTED = new Set(['py', 'python', 'go', 'golang', 'java', 'cpp', 'rust', 'c#', 'cs']);
    const hasQuickSyntaxCheck = WASM_SUPPORTED.has(language.toLowerCase());
    const correctnessLabel =
        correctness.status === 'pass' ? 'Pass' :
            correctness.status === 'fail' ? 'Fail' :
                'Not checked';

    // Explainable Scoring computation
    const metrics = result.metrics;
    const complexitySub = Math.max(0, Math.min(100, Math.round(100 - (metrics.avgCyclomaticComplexity - 1) * 8)));
    const lengthSub = Math.max(0, Math.min(100, Math.round(100 - Math.max(0, metrics.avgFunctionLength - 20) * 1.2)));
    const nestingSub = Math.max(0, Math.min(100, Math.round(100 - Math.max(0, metrics.maxNestingDepth - 2) * 15)));
    const duplicationSub = Math.max(0, Math.min(100, Math.round(100 - metrics.duplicationPercentage * 2)));
    const unusedSub = Math.max(0, Math.min(100, Math.round(100 - metrics.unusedImportCount * 10)));

    const complexityPenalty = Math.round((100 - complexitySub) * 0.30);
    const lengthPenalty = Math.round((100 - lengthSub) * 0.25);
    const nestingPenalty = Math.round((100 - nestingSub) * 0.20);
    const duplicationPenalty = Math.round((100 - duplicationSub) * 0.15);
    const unusedPenalty = Math.round((100 - unusedSub) * 0.10);

    const whatIfs = [
        { name: 'Complexity', penalty: complexityPenalty, action: 'Simplify complexity' },
        { name: 'Nesting', penalty: nestingPenalty, action: 'Flatten deep nesting' },
        { name: 'Duplication', penalty: duplicationPenalty, action: 'Extract duplicate logic' },
        { name: 'Unused Imports', penalty: unusedPenalty, action: 'Clean up unused imports' },
        { name: 'Function Length', penalty: lengthPenalty, action: 'Shorten long functions' },
    ].filter(w => w.penalty > 0);

    // Multi-Dimension Report Card calculations
    const readabilityScore = Math.max(0, Math.min(100, Math.round(100 - Math.max(0, metrics.maxNestingDepth - 2) * 15 - Math.max(0, metrics.avgFunctionLength - 20) * 0.8)));
    const maintainabilityScore = Math.max(0, Math.min(100, Math.round(100 - (metrics.avgCyclomaticComplexity - 1) * 8 - metrics.duplicationPercentage * 1.5)));
    const cleanlinessScore = Math.max(0, Math.min(100, Math.round(100 - metrics.unusedImportCount * 12)));
    const structureScore = Math.max(0, Math.min(100, Math.round(result.score * 0.9 + 10)));

    const getGrade = (s: number): Grade => {
        if (s >= 90) return 'Excellent';
        if (s >= 70) return 'Good';
        if (s >= 50) return 'Fair';
        return 'Critical';
    };

    const dimensionColors: Record<Grade, string> = {
        Excellent: '#22c55e',
        Good: '#3b82f6',
        Fair: '#f59e0b',
        Critical: '#ef4444',
    };

    return (
        <main className="analyze-main">
            {/* ── Navbar ─────────────────────────────────────────────── */}
            <nav className="cv-nav">
                <div className="cv-nav-logo" onClick={() => router.push('/')}>
                    <span className="cv-logo-dot" />
                    Aurelin
                </div>
                <div className="cv-nav-actions">
                    <button className="nav-back-btn" onClick={() => router.push('/')}>
                        <ArrowLeft size={14} /> New Analysis
                    </button>
                    <ThemeToggle />
                    {isLoaded && (
                        user ? (
                            <>
                                <button className="nav-back-btn" onClick={() => router.push('/dashboard')}>
                                    <BarChart2 size={14} /> Dashboard
                                </button>
                                <UserButton afterSignOutUrl="/" />
                            </>
                        ) : (
                            <button className="nav-back-btn" onClick={() => router.push('/sign-in')}>
                                <LogIn size={14} /> Sign In
                            </button>
                        )
                    )}
                </div>
            </nav>

            {/* ── Page Header ────────────────────────────────────────── */}
            <div className="analyze-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <h1 className="analyze-title">Analysis Report</h1>
                    <span className={`mode-badge mode-${languageMode}`}>
                        {languageMode === 'deep' ? '🔬 Deep Structural Analysis' : '⚡ Quick Structural Scan'}
                    </span>
                </div>
                <div className="analyze-issue-summary">
                    {highCount > 0 && <span className="pill pill-high">{highCount} Worth Fixing</span>}
                    {mediumCount > 0 && <span className="pill pill-medium">{mediumCount} Nice to Fix</span>}
                    {lowCount > 0 && <span className="pill pill-low">{lowCount} Minor Polish</span>}
                    {result.issues.length === 0 && <span className="pill pill-clean">Looks Clean ✓</span>}
                </div>
            </div>

            <div className="correctness-row">
                <div className={`glass-card correctness-card correctness-${correctness.status}`}>
                    <h2 className="card-title">Correctness Gate</h2>
                    <div className="correctness-status-line">
                        <span className="correctness-pill">{correctnessLabel}</span>
                        <span className="correctness-subtext">
                            {languageMode === 'deep'
                                ? 'Syntax-aware check'
                                : (hasQuickSyntaxCheck ? 'Quick mode syntax check (WASM)' : 'Quick mode syntax check not available for this language')}
                        </span>
                    </div>
                    {correctness.status === 'fail' && correctness.syntaxErrors.length > 0 && (
                        <ul className="correctness-errors">
                            {correctness.syntaxErrors.slice(0, 3).map((err, idx) => (
                                <li key={idx}>
                                    {err.line ? `Line ${err.line}` : 'Unknown line'}: {err.message}
                                </li>
                            ))}
                        </ul>
                    )}
                    {correctness.status === 'unknown' && (
                        <p className="correctness-warning">
                            Maintainability score does not confirm syntax or runtime correctness.
                        </p>
                    )}
                </div>
            </div>

            {/* ── Top Row: Score + AI Insight ────────────────────────── */}
            <div className="top-row">
                {/* Score Card */}
                <div className="glass-card score-card">
                    <h2 className="card-title">Health Score</h2>
                    <ScoreGauge score={result.score} grade={result.grade} />
                    <div className="score-meta">
                        <div className="score-meta-item">
                            <span className="meta-label">Functions</span>
                            <span className="meta-value">{result.metrics.totalFunctions}</span>
                        </div>
                        <div className="score-meta-item">
                            <span className="meta-label">Lines</span>
                            <span className="meta-value">{result.metrics.totalLines}</span>
                        </div>
                        <div className="score-meta-item">
                            <span className="meta-label">To Refine</span>
                            <span className="meta-value">{result.issues.length}</span>
                        </div>
                    </div>

                    {/* Explainable Scoring */}
                    <div className="explainable-scoring-card">
                        <h3 className="breakdown-title">Score Breakdown</h3>
                        <div className="score-breakdown-list">
                            {complexityPenalty > 0 && (
                                <div className="score-breakdown-item">
                                    <span className="breakdown-label">Complexity Penalty</span>
                                    <span className="breakdown-value penalty">-{complexityPenalty} pts</span>
                                </div>
                            )}
                            {lengthPenalty > 0 && (
                                <div className="score-breakdown-item">
                                    <span className="breakdown-label">Function Length Penalty</span>
                                    <span className="breakdown-value penalty">-{lengthPenalty} pts</span>
                                </div>
                            )}
                            {nestingPenalty > 0 && (
                                <div className="score-breakdown-item">
                                    <span className="breakdown-label">Nesting Penalty</span>
                                    <span className="breakdown-value penalty">-{nestingPenalty} pts</span>
                                </div>
                            )}
                            {duplicationPenalty > 0 && (
                                <div className="score-breakdown-item">
                                    <span className="breakdown-label">Duplication Penalty</span>
                                    <span className="breakdown-value penalty">-{duplicationPenalty} pts</span>
                                </div>
                            )}
                            {unusedPenalty > 0 && (
                                <div className="score-breakdown-item">
                                    <span className="breakdown-label">Unused Imports Penalty</span>
                                    <span className="breakdown-value penalty">-{unusedPenalty} pts</span>
                                </div>
                            )}
                            {correctness.status === 'fail' && (
                                <div className="score-breakdown-item">
                                    <span className="breakdown-label">Syntax Errors Cap</span>
                                    <span className="breakdown-value penalty">Capped at 60 max</span>
                                </div>
                            )}
                            {languageMode === 'quick' && correctness.status !== 'fail' && (
                                <div className="score-breakdown-item">
                                    <span className="breakdown-label">Quick Scan Engine Cap</span>
                                    <span className="breakdown-value penalty">Capped at 80 max</span>
                                </div>
                            )}
                            {complexityPenalty === 0 && lengthPenalty === 0 && nestingPenalty === 0 && duplicationPenalty === 0 && unusedPenalty === 0 && (
                                <div className="score-breakdown-item">
                                    <span className="breakdown-label">Deductions</span>
                                    <span className="breakdown-value boost">None</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* What-If Playbook */}
                    {whatIfs.length > 0 && correctness.status !== 'fail' && (
                        <div className="what-if-playbook">
                            <h3 className="what-if-title">⚡ What-If Playbook</h3>
                            <ul className="what-if-list">
                                {whatIfs.map((w, idx) => {
                                    const rawProj = result.score + w.penalty;
                                    const proj = languageMode === 'quick' ? Math.min(rawProj, 80) : Math.min(rawProj, 100);
                                    return (
                                        <li key={idx} className="what-if-item">
                                            <span>{w.action}</span>
                                            <span className="what-if-projected">
                                                Projected Score: <strong>{proj} (+{w.penalty} pts)</strong>
                                            </span>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    )}

                    {languageMode === 'quick' && correctness.status === 'unknown' && (
                        <div className="quick-scan-note">
                            ⚠️ This score reflects structure only. Syntax errors and runtime issues were not validated.
                        </div>
                    )}
                </div>

                {/* AI Card */}
                <div className="glass-card ai-card">
                    <h2 className="card-title">AI Insight</h2>
                    <AIInsight explanation={result.aiExplanation} />
                </div>
            </div>

            {/* ── Multi-Dimension Report Card ── */}
            <div className="glass-card metrics-section">
                <h2 className="card-title">Multi-Dimension Report Card</h2>
                <div className="report-card-grid">
                    <div className="dimension-card">
                        <div className="dimension-header">
                            <h4>Readability</h4>
                            <span className="dimension-grade" style={{ color: dimensionColors[getGrade(readabilityScore)], borderColor: `${dimensionColors[getGrade(readabilityScore)]}40`, background: `${dimensionColors[getGrade(readabilityScore)]}12` }}>
                                {getGrade(readabilityScore)} <span className="dimension-score">({readabilityScore})</span>
                            </span>
                        </div>
                        <p className="dimension-desc">Measures logical block nesting levels and function line count boundaries.</p>
                    </div>
                    <div className="dimension-card">
                        <div className="dimension-header">
                            <h4>Maintainability</h4>
                            <span className="dimension-grade" style={{ color: dimensionColors[getGrade(maintainabilityScore)], borderColor: `${dimensionColors[getGrade(maintainabilityScore)]}40`, background: `${dimensionColors[getGrade(maintainabilityScore)]}12` }}>
                                {getGrade(maintainabilityScore)} <span className="dimension-score">({maintainabilityScore})</span>
                            </span>
                        </div>
                        <p className="dimension-desc">Measures logic decision path complexity and code block duplication.</p>
                    </div>
                    <div className="dimension-card">
                        <div className="dimension-header">
                            <h4>Cleanliness</h4>
                            <span className="dimension-grade" style={{ color: dimensionColors[getGrade(cleanlinessScore)], borderColor: `${dimensionColors[getGrade(cleanlinessScore)]}40`, background: `${dimensionColors[getGrade(cleanlinessScore)]}12` }}>
                                {getGrade(cleanlinessScore)} <span className="dimension-score">({cleanlinessScore})</span>
                            </span>
                        </div>
                        <p className="dimension-desc">Measures clean import declarations and detects unused references.</p>
                    </div>
                    <div className="dimension-card">
                        <div className="dimension-header">
                            <h4>Structure</h4>
                            <span className="dimension-grade" style={{ color: dimensionColors[getGrade(structureScore)], borderColor: `${dimensionColors[getGrade(structureScore)]}40`, background: `${dimensionColors[getGrade(structureScore)]}12` }}>
                                {getGrade(structureScore)} <span className="dimension-score">({structureScore})</span>
                            </span>
                        </div>
                        <p className="dimension-desc">Evaluates balance of function density and module file sizes.</p>
                    </div>
                </div>
            </div>

            {/* ── Metrics Grid ───────────────────────────────────────── */}
            <div className="glass-card metrics-section">
                <h2 className="card-title">Metrics Breakdown</h2>
                <MetricsGrid metrics={result.metrics} />
            </div>

            {/* ── Issues ─────────────────────────────────────────────── */}
            <div className="glass-card issues-section">
                <h2 className="card-title">
                    Areas to Refine
                    <span className="issues-count">{result.issues.length}</span>
                </h2>
                <IssueList
                    issues={result.issues}
                    code={code}
                    language={language}
                    estimatedImprovement={result.estimatedImprovement}
                    onRerun={() => router.push('/')}
                />
            </div>

            {/* ── CTA ────────────────────────────────────────────────── */}
            <div className="analyze-cta">
                <button className="analyze-btn" onClick={() => router.push('/')}>
                    <RefreshCw size={15} /> Analyze Another File
                </button>
            </div>

            <footer className="cv-footer">
                Aurelin · AI-powered code health analysis
            </footer>
        </main>
    );
}
