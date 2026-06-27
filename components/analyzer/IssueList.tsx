'use client';

import { useState } from 'react';
import type { Issue, Severity } from '@/lib/analyzer/types';
import { AlertTriangle, AlertCircle, Zap, Copy, Layers, FileX, Sparkles } from 'lucide-react';
import SuggestFixModal from './SuggestFixModal';

interface IssueListProps {
    issues: Issue[];
    code?: string;
    language?: string;
    estimatedImprovement?: number;
    onRerun?: () => void;
}

const severityConfig: Record<Severity, { label: string; color: string; bg: string }> = {
    high: { label: 'Worth Fixing', color: '#f87171', bg: '#ef444412' },
    medium: { label: 'Nice to Fix', color: '#fbbf24', bg: '#f59e0b12' },
    low: { label: 'Minor Polish', color: '#9ca3af', bg: '#6b728012' },
};

const typeIcons: Record<string, React.ReactNode> = {
    complexity: <Zap size={15} />,
    length: <Layers size={15} />,
    nesting: <AlertTriangle size={15} />,
    duplication: <Copy size={15} />,
    unused_imports: <FileX size={15} />,
};

const typeLabels: Record<string, string> = {
    complexity: 'Complexity',
    length: 'Function Length',
    nesting: 'Deep Nesting',
    duplication: 'Repeated Logic',
    unused_imports: 'Unused Import',
};

// Issue types where AI suggestion adds real value
const SUGGEST_FIX_TYPES = new Set(['complexity', 'length', 'nesting']);
const DEEP_LANGUAGES = new Set(['js', 'ts']);

export default function IssueList({ issues, code = '', language = 'ts', estimatedImprovement, onRerun }: IssueListProps) {
    const [activeModal, setActiveModal] = useState<Issue | null>(null);
    const isDeep = DEEP_LANGUAGES.has(language);

    if (issues.length === 0) {
        return (
            <div className="issue-list-empty">
                <AlertCircle size={20} color="#22c55e" />
                <span>Looks great — no refinements needed here!</span>
            </div>
        );
    }

    // Group issues by priority
    const quickWins = issues.filter(i => i.priority === 'quick-win');
    const structural = issues.filter(i => i.priority === 'structural');

    const renderIssue = (issue: Issue, idx: number) => {
        const sev = severityConfig[issue.severity];
        const canSuggest = SUGGEST_FIX_TYPES.has(issue.type);
        const priorityBadge = issue.priority === 'quick-win' ? '⚡ Quick Win' : '🔧 Structural';

        return (
            <div
                key={idx}
                className="issue-item"
                style={{ borderLeft: `3px solid ${sev.color}`, background: sev.bg }}
            >
                <div className="issue-header">
                    <span className="issue-type-badge" style={{ color: sev.color }}>
                        {typeIcons[issue.type]}
                        {typeLabels[issue.type] ?? issue.type}
                    </span>
                    <span className="issue-priority-badge">
                        {priorityBadge}
                    </span>
                    {issue.confidence !== undefined && (
                        <span className={`issue-confidence-badge ${(issue.confidence ?? 100) >= 90 ? 'high' : 'medium'}`} title={`Confidence: ${issue.confidence}% (Method: ${issue.method || 'Unknown'})`}>
                            🎯 {issue.confidence}% ({issue.method || 'Static'})
                        </span>
                    )}
                    <span className="issue-severity" style={{ color: sev.color }}>
                        {sev.label}
                    </span>
                    {issue.line && (
                        <span className="issue-line">Line {issue.line}</span>
                    )}
                    {canSuggest && (
                        <button
                            className={`suggest-fix-btn${!isDeep ? ' disabled' : ''}`}
                            onClick={() => isDeep && setActiveModal(issue)}
                            title={isDeep
                                ? 'Get an AI-suggested fix for this issue'
                                : 'Available for JS/TS Deep Analysis only'}
                            aria-disabled={!isDeep}
                        >
                            <Sparkles size={12} />
                            Suggest Fix
                        </button>
                    )}
                </div>
                <p className="issue-message">{issue.message}</p>
            </div>
        );
    };

    return (
        <>
            <div className="issue-list">
                {estimatedImprovement && estimatedImprovement > 0 && (
                    <div className="estimated-improvement-banner">
                        <span style={{ fontWeight: 500 }}>Estimated improvement if quick wins are addressed:</span>
                        <span style={{ fontSize: '16px', fontWeight: 600, color: '#22c55e' }}>+{estimatedImprovement.toFixed(1)} pts</span>
                    </div>
                )}

                {quickWins.length > 0 && (
                    <>
                        <div className="issue-group-header">
                            <Zap size={16} />
                            <span>Quick Wins</span>
                            <span className="issue-group-count">{quickWins.length}</span>
                        </div>
                        {quickWins.map((issue, idx) => renderIssue(issue, idx))}
                    </>
                )}

                {structural.length > 0 && (
                    <>
                        <div className="issue-group-header">
                            <Layers size={16} />
                            <span>Structural Refactors</span>
                            <span className="issue-group-count">{structural.length}</span>
                        </div>
                        {structural.map((issue, idx) => renderIssue(issue, idx + quickWins.length))}
                    </>
                )}
            </div>

            {activeModal && (
                <SuggestFixModal
                    issue={activeModal}
                    codeSnippet={code}
                    language={language}
                    onClose={() => setActiveModal(null)}
                    onRerun={onRerun}
                />
            )}
        </>
    );
}
