'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useUser } from '@clerk/nextjs';
import { ArrowLeft, RefreshCw, TrendingUp, ChevronUp, ChevronDown, Minus, Share2, X, Check, BarChart2 } from 'lucide-react';
import type { ProjectResult } from '@/lib/analyzer/aggregate';
import ScoreGauge from '@/components/analyzer/ScoreGauge';
import AIInsight from '@/components/analyzer/AIInsight';
import ThemeToggle from '@/components/ThemeToggle';

export default function ProjectPage() {
    const [project, setProject] = useState<ProjectResult | null>(null);
    const [showShareModal, setShowShareModal] = useState(false);
    const [shareVisibility, setShareVisibility] = useState<'summary' | 'full'>('full');
    const [saving, setSaving] = useState(false);
    const [shareLink, setShareLink] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const router = useRouter();
    const { user } = useUser();

    // Clear generated link when visibility changes — Summary and Full need different links
    useEffect(() => { setShareLink(null); }, [shareVisibility]);

    useEffect(() => {
        const raw = sessionStorage.getItem('cv_project');
        if (!raw) { router.replace('/'); return; }
        try { setProject(JSON.parse(raw) as ProjectResult); }
        catch { router.replace('/'); }
    }, [router]);

    // ── Auto-save for signed-in users ──────────────────────────────────────────
    useEffect(() => {
        if (!project || !user) return;
        const alreadySaved = sessionStorage.getItem('cv_saved');
        if (alreadySaved) return;

        const projectName = sessionStorage.getItem('cv_project_name') ?? 'My Project';
        const languageMode = sessionStorage.getItem('cv_language_mode') ?? 'mixed';

        fetch('/api/save-scan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: user.id,
                projectName,
                languageMode,
                projectScore: project.projectScore,
                grade: project.projectGrade,
                categoryScores: project.categoryScores,
                totalFiles: project.totalFiles,
                totalLines: project.totalLines,
                totalFunctions: project.totalFunctions,
                topImprovements: JSON.stringify(project.topImprovements),
                aiExplanation: project.aiExplanation ?? '',
                visibility: 'summary',
            }),
        })
            .then(async (res) => {
                if (res.ok) {
                    sessionStorage.setItem('cv_saved', 'true');
                } else {
                    const err = await res.json().catch(() => ({}));
                    console.warn('[auto-save] save-scan error:', res.status, err);
                }
            })
            .catch((e) => console.warn('[auto-save] network error:', e));
    }, [project, user]);

    if (!project) {
        return (
            <div className="analyze-loading">
                <div className="loading-ring" />
                <span>Loading project report…</span>
            </div>
        );
    }

    const catItems = [
        { label: 'Readability', value: project.categoryScores.readability, hint: 'Nesting depth + function length' },
        { label: 'Maintainability', value: project.categoryScores.maintainability, hint: 'Complexity + duplication' },
        { label: 'Cleanliness', value: project.categoryScores.cleanliness, hint: 'Unused imports + file hygiene' },
        { label: 'Structure', value: project.categoryScores.structure, hint: 'Function balance + file size' },
    ];

    function barColor(v: number) {
        if (v >= 80) return '#22c55e';
        if (v >= 60) return '#f59e0b';
        return '#f87171';
    }

    function scoreIcon(score: number) {
        if (score >= 80) return <ChevronUp size={14} color="#22c55e" />;
        if (score >= 60) return <Minus size={14} color="#f59e0b" />;
        return <ChevronDown size={14} color="#f87171" />;
    }

    const gradeColor: Record<string, string> = {
        Excellent: '#22c55e', Good: '#3b82f6', Fair: '#f59e0b', Critical: '#ef4444',
    };
    const deepFileCount = project.fileResults.filter((f) => f.mode === 'deep').length;
    const quickFileCount = project.fileResults.filter((f) => f.mode === 'quick').length;
    const correctnessFailedCount = project.fileResults.filter((f) => f.correctnessStatus === 'fail').length;
    const correctnessUnknownCount = project.fileResults.filter((f) => f.correctnessStatus === 'unknown').length;

    async function handleShare() {
        const p = project;  // capture non-null snapshot for TS narrowing
        if (!p) return;
        setSaving(true);
        setShareLink(null);
        try {
            // Ask the server to save the scan and return a scanId
            const payload = {
                userId: user?.id ?? 'guest',
                projectName: sessionStorage.getItem('cv_project_name') ?? 'My Project',
                projectScore: p.projectScore,
                grade: p.projectGrade,
                categoryScores: p.categoryScores,
                totalFiles: p.totalFiles,
                totalLines: p.totalLines,
                totalFunctions: p.totalFunctions,
                topImprovements: JSON.stringify(p.topImprovements),
                aiExplanation: p.aiExplanation,
                visibility: shareVisibility,
                fileResults: shareVisibility === 'full' ? p.fileResults : undefined,
                languageMode: 'mixed',
            };

            const res = await fetch('/api/save-scan', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            const data = await res.json();
            if (data.scanId) {
                const url = `${window.location.origin}/scan/${data.scanId}`;
                setShareLink(url);
            }
        } catch {
            console.error('Failed to save scan');
        } finally {
            setSaving(false);
        }
    }

    function copyLink() {
        if (!shareLink) return;
        navigator.clipboard.writeText(shareLink);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }

    return (
        <main className="analyze-main">
            {/* ── Navbar ── */}
            <nav className="cv-nav">
                <div className="cv-nav-logo" onClick={() => router.push('/')}>
                    <span className="cv-logo-dot" />
                    CodeVitals
                </div>
                <div className="cv-nav-actions">
                    {user && (
                        <button className="nav-back-btn" onClick={() => router.push('/dashboard')}>
                            <BarChart2 size={14} /> Dashboard
                        </button>
                    )}
                    <button className="nav-back-btn" onClick={() => router.push('/')}>
                        <ArrowLeft size={14} /> New Analysis
                    </button>
                    <ThemeToggle />
                </div>
            </nav>

            {/* ── Header ── */}
            <div className="analyze-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <h1 className="analyze-title">Project Report</h1>
                    <span className="mode-badge mode-quick">Mixed Deep + Quick Modes</span>
                </div>
                <div className="analyze-issue-summary">
                    <span className="pill pill-clean">{project.totalFiles} files</span>
                    <span className="pill pill-clean">{project.totalLines.toLocaleString()} lines</span>
                    {project.topImprovements.length > 0 && (
                        <span className="pill pill-medium">{project.topImprovements.length} areas to improve</span>
                    )}
                    <button className="share-trigger-btn" onClick={() => setShowShareModal(true)}>
                        <Share2 size={13} /> Share Report
                    </button>
                </div>
            </div>

            <div className="correctness-row">
                <div className={`glass-card correctness-card ${correctnessFailedCount > 0 ? 'correctness-fail' : (correctnessUnknownCount > 0 ? 'correctness-unknown' : 'correctness-pass')}`}>
                    <h2 className="card-title">Correctness Gate</h2>
                    <div className="correctness-status-line">
                        <span className="correctness-pill">
                            {correctnessFailedCount > 0 ? 'Fail' : (correctnessUnknownCount > 0 ? 'Partially checked' : 'Pass')}
                        </span>
                        <span className="correctness-subtext">
                            ZIP file-level correctness status
                        </span>
                    </div>
                    <p className="correctness-warning">
                        {correctnessFailedCount > 0
                            ? `${correctnessFailedCount} file${correctnessFailedCount > 1 ? 's' : ''} failed syntax checks.`
                            : 'No syntax failures found in checked files.'}
                    </p>
                    <p className="correctness-subtext">
                        Coverage in this scan: {deepFileCount} deep files checked, {quickFileCount} quick files not yet syntax-checked.
                    </p>
                </div>
            </div>

            {/* ── Score + AI ── */}
            <div className="top-row">
                <div className="glass-card score-card">
                    <h2 className="card-title">Project Health</h2>
                    <ScoreGauge score={project.projectScore} grade={project.projectGrade} />
                    <p className="project-summary-text">{project.summary}</p>
                    <div className="score-meta">
                        <div className="score-meta-item">
                            <span className="meta-label">Files</span>
                            <span className="meta-value">{project.totalFiles}</span>
                        </div>
                        <div className="score-meta-item">
                            <span className="meta-label">Functions</span>
                            <span className="meta-value">{project.totalFunctions}</span>
                        </div>
                        <div className="score-meta-item">
                            <span className="meta-label">Lines</span>
                            <span className="meta-value">{project.totalLines.toLocaleString()}</span>
                        </div>
                    </div>
                </div>

                <div className="glass-card ai-card">
                    <h2 className="card-title">AI Insight</h2>
                    <AIInsight explanation={project.aiExplanation} />
                </div>
            </div>

            {/* ── Category Scores ── */}
            <div className="glass-card category-section">
                <h2 className="card-title">
                    <TrendingUp size={16} /> Category Breakdown
                </h2>
                <div className="category-bars">
                    {catItems.map(cat => (
                        <div key={cat.label} className="cat-bar-item">
                            <div className="cat-bar-header">
                                <span className="cat-bar-label">{cat.label}</span>
                                <span className="cat-bar-score" style={{ color: barColor(cat.value) }}>{cat.value}</span>
                            </div>
                            <div className="cat-bar-track">
                                <div className="cat-bar-fill" style={{ width: `${cat.value}%`, background: barColor(cat.value) }} />
                            </div>
                            <span className="cat-bar-hint">{cat.hint}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* ── Top Improvements ── */}
            {project.topImprovements.length > 0 && (
                <div className="glass-card improvements-section">
                    <h2 className="card-title">
                        Here are the areas that would give you the biggest improvement
                    </h2>
                    <div className="improvements-list">
                        {project.topImprovements.map((imp, i) => (
                            <div key={i} className="improvement-item">
                                <div className="improvement-rank">#{i + 1}</div>
                                <div className="improvement-body">
                                    <div className="improvement-area">{imp.area}</div>
                                    <p className="improvement-desc">{imp.description}</p>
                                    <div className="improvement-meta">
                                        <span className="improvement-files">{imp.affectedFiles} file{imp.affectedFiles > 1 ? 's' : ''} affected</span>
                                        <span className="improvement-gain">~+{imp.potentialGain} pts potential</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ── File Breakdown ── */}
            <div className="glass-card file-table-section">
                <h2 className="card-title">File Breakdown</h2>
                <div className="file-table-wrap">
                    <table className="file-table">
                        <thead>
                            <tr>
                                <th>File</th><th>Score</th><th>Grade</th><th>Mode</th><th>Top Insight</th>
                            </tr>
                        </thead>
                        <tbody>
                            {project.fileResults.map((file, i) => (
                                <tr key={i} className={file.score < 60 ? 'row-warn' : ''}>
                                    <td className="file-name">{file.filename}</td>
                                    <td className="file-score">
                                        {scoreIcon(file.score)}
                                        <span style={{ color: barColor(file.score) }}>{file.score}</span>
                                    </td>
                                    <td>
                                        <span className="file-grade-badge" style={{ color: gradeColor[file.grade], borderColor: `${gradeColor[file.grade]}40`, background: `${gradeColor[file.grade]}12` }}>
                                            {file.grade}
                                        </span>
                                    </td>
                                    <td>
                                        <span className={`mode-chip ${file.mode}`}>
                                            {file.mode === 'deep' ? '🔬 Deep' : '⚡ Quick'}
                                        </span>
                                    </td>
                                    <td className="file-top-issue">
                                        {file.topIssue ? file.topIssue.slice(0, 80) + (file.topIssue.length > 80 ? '…' : '') : '—'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ── CTA ── */}
            <div className="analyze-cta">
                <button className="analyze-btn" onClick={() => router.push('/')}>
                    <RefreshCw size={15} /> Analyze Another Project
                </button>
            </div>

            <footer className="cv-footer">CodeVitals · AI-powered code health analysis</footer>

            {/* ── Share Modal ── */}
            {showShareModal && (
                <div className="modal-overlay" onClick={() => setShowShareModal(false)}>
                    <div className="modal-card" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <span className="modal-title"><Share2 size={16} /> Share Report</span>
                            <button className="modal-close" onClick={() => setShowShareModal(false)}>
                                <X size={16} />
                            </button>
                        </div>

                        <p className="modal-desc">Choose what viewers can see in the shared link.</p>

                        <div className="modal-visibility-toggle">
                            <button
                                className={`vis-btn ${shareVisibility === 'summary' ? 'active' : ''}`}
                                onClick={() => setShareVisibility('summary')}
                            >
                                <strong>Summary</strong>
                                <span>Score, categories, top improvements</span>
                            </button>
                            <button
                                className={`vis-btn ${shareVisibility === 'full' ? 'active' : ''}`}
                                onClick={() => setShareVisibility('full')}
                            >
                                <strong>Full Report</strong>
                                <span>Includes file-by-file breakdown</span>
                            </button>
                        </div>

                        {shareLink ? (
                            <div className="modal-link-box">
                                <span className="modal-link-text">{shareLink}</span>
                                <button className="modal-copy-btn" onClick={copyLink}>
                                    {copied ? <><Check size={13} /> Copied!</> : <><Share2 size={13} /> Copy</>}
                                </button>
                            </div>
                        ) : (
                            <button
                                className="analyze-btn"
                                style={{ width: '100%', marginTop: 8 }}
                                onClick={handleShare}
                                disabled={saving}
                            >
                                {saving ? 'Generating link…' : 'Generate Share Link'}
                            </button>
                        )}

                        {!user && (
                            <p className="modal-signin-hint">
                                💡 <Link href="/sign-in">Sign in</Link> to save this scan to your dashboard and track progress over time.
                            </p>
                        )}
                    </div>
                </div>
            )}
        </main>
    );
}
