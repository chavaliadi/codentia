'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUser, UserButton } from '@clerk/nextjs';
import type { AnalysisResult } from '@/lib/analyzer/types';
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
    const hasQuickSyntaxCheck = language === 'py' || language === 'go';
    const correctnessLabel =
        correctness.status === 'pass' ? 'Pass' :
            correctness.status === 'fail' ? 'Fail' :
                'Not checked';

    return (
        <main className="analyze-main">
            {/* ── Navbar ─────────────────────────────────────────────── */}
            <nav className="cv-nav">
                <div className="cv-nav-logo" onClick={() => router.push('/')}>
                    <span className="cv-logo-dot" />
                    CodeVitals
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
                                : (hasQuickSyntaxCheck ? 'Quick mode syntax check (Python/Go)' : 'Quick mode syntax check not available yet')}
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
                CodeVitals · AI-powered code health analysis
            </footer>
        </main>
    );
}
