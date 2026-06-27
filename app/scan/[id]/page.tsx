'use client';

import { use } from 'react';
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { useRouter } from 'next/navigation';
import { ArrowLeft, TrendingUp } from 'lucide-react';
import ScoreGauge from '@/components/analyzer/ScoreGauge';
import ThemeToggle from '@/components/ThemeToggle';
import Mermaid from '@/components/analyzer/Mermaid';
import type { Grade } from '@/lib/analyzer/types';
import type { FileResult } from '@/lib/analyzer/types';

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
    visibility: 'summary' | 'full';
    createdAt: number;
    fileResults?: string;
    architectureInsights?: string;
    rootCauseClusters?: string;
    topFixes?: string;
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
                    <ArrowLeft size={14} /> Back to Codentia
                </button>
            </div>
        );
    }

    const topImprovements = JSON.parse(scan.topImprovements ?? '[]');
    const fileResults: FileResult[] = scan.fileResults ? JSON.parse(scan.fileResults) : [];
    const architectureInsights = scan.architectureInsights ? JSON.parse(scan.architectureInsights) : null;
    const rootCauseClusters = scan.rootCauseClusters ? JSON.parse(scan.rootCauseClusters) : [];
    const topFixes = scan.topFixes ? JSON.parse(scan.topFixes) : [];
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
                    Codentia
                </div>
                <div className="cv-nav-actions">
                    <span className="cv-nav-badge">Shared Report</span>
                    <ThemeToggle />
                    <button className="nav-back-btn" onClick={() => router.push('/')}>
                        Try Codentia Free →
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

            {/* Prioritized Refactoring Plan (only if visibility === 'full') */}
            {scan.visibility === 'full' && topFixes && topFixes.length > 0 && (
                <div className="glass-card top-fixes-section">
                    <h2 className="card-title">🎯 Prioritized Refactoring Plan</h2>
                    <p className="section-subtitle">Ranked issues and recommended steps generated dynamically by structural models.</p>
                    <div className="top-fixes-list">
                        {topFixes.map((fix: { rank: number; title: string; impact: string; description: string }) => (
                            <div key={fix.rank} className={`top-fix-item impact-${fix.impact.toLowerCase()}`}>
                                <div className="top-fix-rank">#{fix.rank}</div>
                                <div className="top-fix-body">
                                    <div className="top-fix-header">
                                        <h3 className="top-fix-title">{fix.title}</h3>
                                        <span className={`impact-badge ${fix.impact.toLowerCase()}`}>
                                            {fix.impact} Impact
                                        </span>
                                    </div>
                                    <p className="top-fix-desc">{fix.description}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

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

            {/* Architecture Insights (only if visibility === 'full') */}
            {scan.visibility === 'full' && architectureInsights && (
                <div className="architecture-grid">
                    <div className="glass-card mermaid-card">
                        <h2 className="card-title">🔌 Module Dependency Graph</h2>
                        <p className="section-subtitle">Visualizing import couplings. Highlighted cycles and god modules are included.</p>
                        <Mermaid chart={architectureInsights.mermaidGraph} />
                    </div>

                    <div className="glass-card insights-card">
                        <h2 className="card-title">🔬 Structural Findings</h2>
                        
                        {architectureInsights.cycles && architectureInsights.cycles.length > 0 ? (
                            <div className="insight-block danger">
                                <h3 className="insight-block-title">🔄 Circular Dependencies ({architectureInsights.cycles.length})</h3>
                                <p className="insight-block-desc">Cyclical imports make code brittle and hard to test. Consider breaking these loops:</p>
                                <ul className="cycles-list">
                                    {architectureInsights.cycles.map((cycle: string[], idx: number) => (
                                        <li key={idx} className="cycle-item">
                                            {cycle.map((c) => c.split('/').pop()).join(' ➔ ')}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ) : (
                            <div className="insight-block success">
                                <h3 className="insight-block-title">✓ No Circular Dependencies</h3>
                                <p className="insight-block-desc">All module imports flow in a clean, acyclic direction.</p>
                            </div>
                        )}

                        {architectureInsights.godFiles && architectureInsights.godFiles.length > 0 && (
                            <div className="insight-block warning">
                                <h3 className="insight-block-title">⚖ God Files ({architectureInsights.godFiles.length})</h3>
                                <p className="insight-block-desc">Modules with very high complexity and coupling that act as central hubs:</p>
                                <ul className="god-files-list">
                                    {architectureInsights.godFiles.map((file: string, idx: number) => (
                                        <li key={idx} className="god-file-item">
                                            <strong>{file.split('/').pop()}</strong> <span className="text-muted">({file})</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {architectureInsights.deadCode && architectureInsights.deadCode.length > 0 && (
                            <div className="insight-block info">
                                <h3 className="insight-block-title">👻 Unreferenced Files ({architectureInsights.deadCode.length})</h3>
                                <p className="insight-block-desc">Files not imported by any other project module (excluding app entry points):</p>
                                <ul className="dead-code-list">
                                    {architectureInsights.deadCode.map((file: string, idx: number) => (
                                        <li key={idx} className="dead-code-item">
                                            <strong>{file.split('/').pop()}</strong> <span className="text-muted">({file})</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Root Cause Clusters (only if visibility === 'full') */}
            {scan.visibility === 'full' && rootCauseClusters && rootCauseClusters.length > 0 && (
                <div className="glass-card clusters-section">
                    <h2 className="card-title">📁 Directory Issue Clusters</h2>
                    <p className="section-subtitle">Groups of related issues identified within specific subdirectories.</p>
                    <div className="clusters-grid">
                        {rootCauseClusters.map((cluster: { folder: string; issueCount: number; architecturalTip: string; affectedFiles: string[]; categories: string[] }, idx: number) => (
                            <div key={idx} className="cluster-card-item">
                                <div className="cluster-header">
                                    <h3 className="cluster-folder">{cluster.folder}</h3>
                                    <span className="cluster-badge">{cluster.issueCount} issue{cluster.issueCount > 1 ? 's' : ''}</span>
                                </div>
                                <div className="cluster-details">
                                    <p className="cluster-tip">💡 {cluster.architecturalTip || 'Simplify code structure inside this directory.'}</p>
                                    <div className="cluster-meta-info">
                                        <strong>Affected files:</strong> {cluster.affectedFiles.join(', ')}
                                    </div>
                                    <div className="cluster-meta-info">
                                        <strong>Refined categories:</strong> {cluster.categories.map(c => c.replace(/_/g, ' ')).join(', ')}
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
                    Try Codentia Free — No Sign Up Required
                </button>
            </div>

            <footer className="cv-footer">
                Codentia · AI-powered code health analysis
            </footer>
        </main>
    );
}
