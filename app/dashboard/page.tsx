'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useUser, UserButton } from '@clerk/nextjs';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { BarChart2, TrendingUp, Clock, Share2, Plus, Trash2 } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import ThemeToggle from '@/components/ThemeToggle';

type ScanSummary = {
    _id: string;
    scanId: string;
    projectName: string;
    projectScore: number;
    grade: string;
    categoryScores: { readability: number; maintainability: number; cleanliness: number; structure: number };
    totalFiles: number;
    totalLines: number;
    languageMode: string;
    aiSummary: string;
    visibility: string;
    createdAt: number;
};

function gradeColor(g: string) {
    if (g === 'Excellent') return '#22c55e';
    if (g === 'Good') return '#3b82f6';
    if (g === 'Fair') return '#f59e0b';
    return '#ef4444';
}

function timeAgo(ts: number) {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
}

function groupByProject(scans: ScanSummary[]): Map<string, ScanSummary[]> {
    const map = new Map<string, ScanSummary[]>();
    for (const scan of scans) {
        const list = map.get(scan.projectName) ?? [];
        list.push(scan);
        map.set(scan.projectName, list);
    }
    return map;
}

export default function DashboardPage() {
    const { user, isLoaded } = useUser();
    const router = useRouter();
    const [selectedProject, setSelectedProject] = useState<string | null>(null);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [deletingProject, setDeletingProject] = useState(false);
    const [mounted, setMounted] = useState(false);
    const deleteProjectScans = useMutation(api.scans.deleteProjectScans);

    // Hydration guard — prevents Date.now() mismatch crash
    useEffect(() => { setMounted(true); }, []);

    const scans = useQuery(
        api.scans.getScansByUser,
        isLoaded && user ? { userId: user.id } : 'skip'
    ) as ScanSummary[] | undefined;

    useEffect(() => {
        if (isLoaded && !user) router.push('/');
    }, [isLoaded, user, router]);

    if (!isLoaded || !user) {
        return (
            <div className="analyze-loading">
                <div className="loading-ring" />
                <span>Loading dashboard…</span>
            </div>
        );
    }

    if (!scans || !mounted) {
        return (
            <div className="analyze-loading">
                <div className="loading-ring" />
                <span>Fetching your scan history…</span>
            </div>
        );
    }

    const projectGroups = groupByProject(scans);
    const projectNames = Array.from(projectGroups.keys());
    const activeProject = selectedProject ?? projectNames[0] ?? null;
    const activeScans = activeProject
        ? [...(projectGroups.get(activeProject) ?? [])].reverse()  // oldest first
        : [];
    const latestScan = activeScans.length > 0 ? activeScans[activeScans.length - 1] : null;
    const previousScan = activeScans.length > 1 ? activeScans[activeScans.length - 2] : null;
    const scoreDelta = latestScan && previousScan
        ? latestScan.projectScore - previousScan.projectScore
        : null;

    const chartData = activeScans.map((s, i) => ({
        name: `#${i + 1}`,
        score: s.projectScore,
        date: new Date(s.createdAt).toLocaleDateString(),
    }));

    function copyShareLink(scanId: string) {
        const url = `${window.location.origin}/scan/${scanId}`;
        navigator.clipboard.writeText(url);
        setCopiedId(scanId);
        setTimeout(() => setCopiedId(null), 2000);
    }

    async function handleDeleteProject() {
        if (!user || !activeProject) return;
        const ok = window.confirm(`Delete all scans for "${activeProject}"? This cannot be undone.`);
        if (!ok) return;
        setDeletingProject(true);
        try {
            await deleteProjectScans({ userId: user.id, projectName: activeProject });
            setSelectedProject(null);
        } finally {
            setDeletingProject(false);
        }
    }

    return (
        <main className="analyze-main">
            <nav className="cv-nav">
                <div className="cv-nav-logo" onClick={() => router.push('/')}>
                    <span className="cv-logo-dot" />
                    Codentia
                </div>
                <div className="cv-nav-actions">
                    <button className="nav-back-btn" onClick={() => router.push('/')}>
                        <Plus size={14} /> New Analysis
                    </button>
                    <ThemeToggle />
                    <span className="dash-user">{user.firstName ?? user.emailAddresses[0]?.emailAddress}</span>
                    <UserButton afterSignOutUrl="/" />
                </div>
            </nav>

            <div className="analyze-header">
                <h1 className="analyze-title">
                    <BarChart2 size={22} style={{ display: 'inline', marginRight: 8 }} />
                    Dashboard
                </h1>
                <div className="analyze-issue-summary">
                    <span className="pill pill-clean">{scans.length} total scans</span>
                    <span className="pill pill-clean">{projectNames.length} projects</span>
                </div>
            </div>

            {scans.length === 0 ? (
                <div className="dash-empty">
                    <BarChart2 size={40} color="var(--text-muted)" />
                    <h2>No scans yet</h2>
                    <p>Analyze a project to start tracking your code health over time.</p>
                    <button className="analyze-btn" style={{ marginTop: 16 }} onClick={() => router.push('/')}>
                        <Plus size={15} /> Analyze Your First Project
                    </button>
                </div>
            ) : (
                <div className="dash-layout">
                    {/* Sidebar */}
                    <aside className="dash-sidebar">
                        <p className="dash-sidebar-label">Projects</p>
                        {projectNames.map((name) => {
                            const pScans = projectGroups.get(name)!;
                            const latest = pScans[0];
                            return (
                                <button
                                    key={name}
                                    className={`dash-project-btn ${activeProject === name ? 'active' : ''}`}
                                    onClick={() => setSelectedProject(name)}
                                >
                                    <span className="dash-project-name">{name}</span>
                                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                        <span className="dash-project-score" style={{ color: gradeColor(latest.grade) }}>
                                            {latest.projectScore}
                                        </span>
                                        <span className="dash-project-count">{pScans.length} scan{pScans.length > 1 ? 's' : ''}</span>
                                    </div>
                                </button>
                            );
                        })}
                    </aside>

                    {/* Main */}
                    <div className="dash-content">
                        {activeProject && latestScan && (
                            <>
                                {/* Evolution banner */}
                                {scoreDelta !== null && (
                                    <div className={`dash-evolution-banner ${scoreDelta >= 0 ? 'positive' : 'negative'}`}>
                                        <TrendingUp size={15} />
                                        {scoreDelta > 0
                                            ? `${activeProject} improved ${scoreDelta} points since the last scan. Momentum is building! 🚀`
                                            : scoreDelta < 0
                                                ? `Score dipped ${Math.abs(scoreDelta)} points. Reviewing the flagged areas could bring it back up.`
                                                : `Score held steady since the last scan. Solid consistency.`}
                                    </div>
                                )}

                                {/* Score + Categories */}
                                <div className="dash-row">
                                    <div className="glass-card dash-current-card">
                                        <h2 className="card-title">Latest Health Score</h2>
                                        <div className="dash-big-score" style={{ color: gradeColor(latestScan.grade) }}>
                                            {latestScan.projectScore}
                                        </div>
                                        <div className="dash-grade" style={{ color: gradeColor(latestScan.grade) }}>
                                            {latestScan.grade}
                                        </div>
                                        <p className="dash-ai-summary">{latestScan.aiSummary}</p>
                                        <div className="dash-meta">
                                            <span><Clock size={11} style={{ display: 'inline' }} /> {timeAgo(latestScan.createdAt)}</span>
                                            <span>{latestScan.totalFiles} files</span>
                                        </div>
                                    </div>

                                    <div className="glass-card dash-category-card">
                                        <h2 className="card-title">Category Scores</h2>
                                        {Object.entries(latestScan.categoryScores).map(([key, val]) => (
                                            <div key={key} className="cat-bar-item" style={{ marginBottom: 14 }}>
                                                <div className="cat-bar-header">
                                                    <span className="cat-bar-label" style={{ textTransform: 'capitalize' }}>{key}</span>
                                                    <span className="cat-bar-score" style={{
                                                        color: val >= 80 ? '#22c55e' : val >= 60 ? '#f59e0b' : '#ef4444'
                                                    }}>{val}</span>
                                                </div>
                                                <div className="cat-bar-track">
                                                    <div className="cat-bar-fill" style={{
                                                        width: `${val}%`,
                                                        background: val >= 80 ? '#22c55e' : val >= 60 ? '#f59e0b' : '#ef4444',
                                                    }} />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Trend chart */}
                                {chartData.length > 1 && (
                                    <div className="glass-card dash-chart-card">
                                        <h2 className="card-title">
                                            <TrendingUp size={15} style={{ display: 'inline', marginRight: 6 }} />
                                            Score Over Time — {activeProject}
                                        </h2>
                                        <ResponsiveContainer width="100%" height={200}>
                                            <LineChart data={chartData}>
                                                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                                                <XAxis dataKey="name" tick={{ fill: 'var(--text-muted)', fontSize: 12 }} />
                                                <YAxis domain={[0, 100]} tick={{ fill: 'var(--text-muted)', fontSize: 12 }} />
                                                <Tooltip
                                                    contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 }}
                                                    labelStyle={{ color: 'var(--text-muted)' }}
                                                    itemStyle={{ color: '#818cf8' }}
                                                />
                                                <Line
                                                    type="monotone"
                                                    dataKey="score"
                                                    stroke="#818cf8"
                                                    strokeWidth={2}
                                                    dot={{ r: 4, fill: '#818cf8' }}
                                                    activeDot={{ r: 6 }}
                                                />
                                            </LineChart>
                                        </ResponsiveContainer>
                                    </div>
                                )}

                                {/* Scan history */}
                                <div className="glass-card">
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
                                        <h2 className="card-title" style={{ marginBottom: 0 }}>Scan History</h2>
                                        <button
                                            className="dash-icon-btn dash-icon-btn--danger"
                                            title="Delete all scans for this project"
                                            onClick={handleDeleteProject}
                                            disabled={deletingProject}
                                        >
                                            <Trash2 size={14} />
                                            {deletingProject ? 'Deleting…' : 'Delete Project History'}
                                        </button>
                                    </div>
                                    <div className="dash-scan-list">
                                        {[...activeScans].reverse().map((scan) => (
                                            <div key={scan.scanId} className="dash-scan-item">
                                                <div className="dash-scan-score" style={{ color: gradeColor(scan.grade) }}>
                                                    {scan.projectScore}
                                                </div>
                                                <div className="dash-scan-body">
                                                    <div className="dash-scan-grade" style={{ color: gradeColor(scan.grade) }}>
                                                        {scan.grade}
                                                    </div>
                                                    <div className="dash-scan-meta">
                                                        <Clock size={11} style={{ display: 'inline' }} /> {timeAgo(scan.createdAt)}
                                                        &nbsp;·&nbsp;{scan.totalFiles} files&nbsp;·&nbsp;{scan.languageMode}
                                                    </div>
                                                </div>
                                                <div className="dash-scan-actions">
                                                    <button
                                                        className="dash-icon-btn"
                                                        title="Copy share link"
                                                        onClick={() => copyShareLink(scan.scanId)}
                                                    >
                                                        {copiedId === scan.scanId ? '✓' : <Share2 size={14} />}
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            <footer className="cv-footer">Codentia · Your code health over time</footer>
        </main>
    );
}