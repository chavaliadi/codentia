'use client';

import { use } from 'react';
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { useRouter } from 'next/navigation';
import { ArrowLeft, TrendingUp } from 'lucide-react';
import ScoreGauge from '@/components/analyzer/ScoreGauge';
import ThemeToggle from '@/components/ThemeToggle';
import type { Grade } from '@/lib/analyzer/types';
import type { FileResult } from '@/lib/analyzer/aggregate';

type ScanData = {
    scanId: string;
    projectName: string;
    projectScore: number;
    grade: string;
    categoryScores: { readability: number; maintainability: number; cleanliness: number; structure: number };
    totalFiles: number;
    totalLines: number;
    totalFunctions: number;
    topImprovements: string;
    aiSummary: string;
    languageMode: string;
    visibility: string;
    createdAt: number;
    fileResults?: string;
};

function barColor(v: number) {
    if (v >= 80) return '#22c55e';
    if (v >= 60) return '#f59e0b';
    return '#f87171';
}

function gradeColor(g: string) {
    if (g === 'Excellent') return '#22c55e';
    if (g === 'Good') return '#3b82f6';
    if (g === 'Fair') return '#f59e0b';
    return '#ef4444';
}

export default function ScanSharePage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const router = useRouter();

    const scan = useQuery(api.scans.getScanById, { scanId: id }) as ScanData | null | undefined;

    if (scan === undefined) {
        return (
            <div className="analyze-loading">
                <div className="loading-ring" />
                <span>Loading shared report…</span>
            </div>
        );
    }

    if (scan === null) {
        return (
            <div className="analyze-loading">
                <p style={{ color: 'var(--text-muted)', textAlign: 'center' }}>
                    This scan report was not found or may have been removed.
                </p>
                <button className="nav-back-btn" style={{ marginTop: 16 }} onClick={() => router.push('/')}>
                    <ArrowLeft size={14} /> Back to CodeVitals
                </button>
            </div>
        );
    }

    const topImprovements = JSON.parse(scan.topImprovements ?? '[]');
    const fileResults: FileResult[] = scan.fileResults ? JSON.parse(scan.fileResults) : [];
    const scanDate = new Date(scan.createdAt).toLocaleDateString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric'
    });

    const getGrade = (s: number): string => {
        if (s >= 90) return 'Excellent';
        if (s >= 70) return 'Good';
        if (s >= 50) return 'Fair';
        return 'Critical';
    };

    const catGrades = Object.entries(scan.categoryScores).map(([key, val]) => {
        let label = '';
        if (key === 'readability') label = 'Readability';
        else if (key === 'maintainability') label = 'Maintainability';
        else if (key === 'cleanliness') label = 'Cleanliness';
        else if (key === 'structure') label = 'Structure';
        return { name: label, score: val, grade: getGrade(val) };
    });

    const strengthsMap: Record<string, string> = {
        Readability: 'Excellent nesting structure and concise functions make this codebase highly readable and easy to scan.',
        Maintainability: 'Clean complexity metrics and code block uniqueness reduce overall maintenance overhead.',
        Cleanliness: 'Clean import organization with no dead references or unused modules cluttering the workspace.',
        Structure: 'Optimized module balance and file size constraints keep the package directory architecture simple.',
    };

    const topStrengths = [...catGrades]
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
        .map(c => ({
            name: c.name,
            desc: strengthsMap[c.name] || 'Excellent metrics across key areas.'
        }));

    return (
        <main className="analyze-main">
            {/* Navbar */}
            <nav className="cv-nav">
                <div className="cv-nav-logo" onClick={() => router.push('/')}>
                    <span className="cv-logo-dot" />
                    CodeVitals
                </div>
                <div className="cv-nav-actions">
                    <span className="cv-nav-badge">Shared Report</span>
                    <ThemeToggle />
                    <button className="nav-back-btn" onClick={() => router.push('/')}>
                        Try CodeVitals Free →
                    </button>
                </div>
            </nav>

            {/* Header */}
            <div className="analyze-header">
                <div>
                    <h1 className="analyze-title">{scan.projectName}</h1>
                    <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
                        Scanned {scanDate} · {scan.totalFiles} files · {scan.totalLines.toLocaleString()} lines
                    </p>
                </div>
                <div className="analyze-issue-summary">
                    <span className={`pill pill-${scan.grade === 'Excellent' || scan.grade === 'Good' ? 'clean' : 'medium'}`}>
                        {scan.grade}
                    </span>
                    <span className="pill pill-clean">{scan.languageMode} mode</span>
                </div>
            </div>

            {/* Score + Categories */}
            <div className="top-row">
                <div className="glass-card score-card">
                    <h2 className="card-title">Health Score</h2>
                    <ScoreGauge score={scan.projectScore} grade={scan.grade as Grade} />
                    <p className="project-summary-text">{scan.aiSummary}</p>
                    <div className="score-meta">
                        <div className="score-meta-item">
                            <span className="meta-label">Files</span>
                            <span className="meta-value">{scan.totalFiles}</span>
                        </div>
                        <div className="score-meta-item">
                            <span className="meta-label">Functions</span>
                            <span className="meta-value">{scan.totalFunctions}</span>
                        </div>
                        <div className="score-meta-item">
                            <span className="meta-label">Lines</span>
                            <span className="meta-value">{scan.totalLines.toLocaleString()}</span>
                        </div>
                    </div>
                </div>

                {/* Category bars */}
                <div className="glass-card">
                    <h2 className="card-title">
                        <TrendingUp size={15} /> Category Breakdown
                    </h2>
                    <div className="category-bars">
                        {Object.entries(scan.categoryScores).map(([key, val]) => (
                            <div key={key} className="cat-bar-item">
                                <div className="cat-bar-header">
                                    <span className="cat-bar-label" style={{ textTransform: 'capitalize' }}>{key}</span>
                                    <span className="cat-bar-score" style={{ color: barColor(val) }}>
                                        {getGrade(val)} ({val})
                                    </span>
                                </div>
                                <div className="cat-bar-track">
                                    <div className="cat-bar-fill" style={{ width: `${val}%`, background: barColor(val) }} />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Top Strengths */}
            {topStrengths.length > 0 && (
                <div className="glass-card improvements-section" style={{ borderLeft: '3px solid #22c55e' }}>
                    <h2 className="card-title" style={{ color: '#22c55e' }}>Top Project Strengths</h2>
                    <div className="improvements-list">
                        {topStrengths.map((str, i) => (
                            <div key={i} className="improvement-item">
                                <div className="improvement-rank" style={{ background: 'rgba(34, 197, 94, 0.1)', color: '#22c55e' }}>✓</div>
                                <div className="improvement-body">
                                    <div className="improvement-area">{str.name}</div>
                                    <p className="improvement-desc">{str.desc}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Top Improvements */}
            {topImprovements.length > 0 && (
                <div className="glass-card improvements-section">
                    <h2 className="card-title">Areas That Would Give the Biggest Improvement</h2>
                    <div className="improvements-list">
                        {topImprovements.map((imp: { area: string; description: string; affectedFiles: number; potentialGain: number }, i: number) => (
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

            {/* File Breakdown (only if visibility === 'full') */}
            {scan.visibility === 'full' && fileResults.length > 0 && (
                <div className="glass-card file-table-section">
                    <h2 className="card-title">File Breakdown</h2>
                    <div className="file-table-wrap">
                        <table className="file-table">
                            <thead>
                                <tr>
                                    <th>File</th>
                                    <th>Score</th>
                                    <th>Grade</th>
                                    <th>Mode</th>
                                </tr>
                            </thead>
                            <tbody>
                                {fileResults.map((file, i) => (
                                    <tr key={i}>
                                        <td className="file-name">{file.filename}</td>
                                        <td className="file-score">
                                            <span style={{ color: barColor(file.score), fontWeight: 700 }}>{file.score}</span>
                                        </td>
                                        <td>
                                            <span className="file-grade-badge" style={{
                                                color: gradeColor(file.grade),
                                                borderColor: `${gradeColor(file.grade)}40`,
                                                background: `${gradeColor(file.grade)}12`,
                                            }}>
                                                {file.grade}
                                            </span>
                                        </td>
                                        <td>
                                            <span className={`mode-chip ${file.mode}`}>
                                                {file.mode === 'deep' ? '🔬 Deep' : '⚡ Quick'}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* CTA */}
            <div className="analyze-cta" style={{ textAlign: 'center' }}>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
                    Want to scan your own project?
                </p>
                <button className="analyze-btn" onClick={() => router.push('/')}>
                    Try CodeVitals Free — No Sign Up Required
                </button>
            </div>

            <footer className="cv-footer">
                CodeVitals · AI-powered code health analysis
            </footer>
        </main>
    );
}
