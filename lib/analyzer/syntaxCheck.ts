import { spawnSync } from 'node:child_process';
import type { CorrectnessResult, Grade, SyntaxErrorDetail } from './types';

type SyntaxCheckLanguage = 'py' | 'go';

function gradeFromScore(score: number): Grade {
    if (score >= 90) return 'Excellent';
    if (score >= 70) return 'Good';
    if (score >= 50) return 'Fair';
    return 'Critical';
}

function toSyntaxError(message: string): SyntaxErrorDetail {
    const match = message.match(/:(\d+):(?:(\d+):)?\s*(.*)$/);
    if (!match) return { message };
    return {
        line: Number(match[1]),
        column: match[2] ? Number(match[2]) : undefined,
        message: match[3] || message,
    };
}

function runPythonSyntaxCheck(code: string): CorrectnessResult {
    const script = 'import ast,sys; ast.parse(sys.stdin.read())';
    const res = spawnSync('python3', ['-c', script], {
        input: code,
        encoding: 'utf8',
        timeout: 3000,
    });

    if (res.error) return { status: 'unknown', syntaxErrors: [] };
    if (res.status === 0) return { status: 'pass', syntaxErrors: [] };

    const stderr = (res.stderr || '').trim();
    return {
        status: 'fail',
        syntaxErrors: [{ message: stderr || 'Python syntax error' }],
    };
}

function runGoSyntaxCheck(code: string): CorrectnessResult {
    const res = spawnSync('gofmt', ['-e'], {
        input: code,
        encoding: 'utf8',
        timeout: 3000,
    });

    if (res.error) return { status: 'unknown', syntaxErrors: [] };
    if (res.status === 0) return { status: 'pass', syntaxErrors: [] };

    const stderr = (res.stderr || '').trim();
    const lines = stderr.split('\n').filter(Boolean);
    return {
        status: 'fail',
        syntaxErrors: lines.length > 0 ? lines.map(toSyntaxError) : [{ message: 'Go syntax error' }],
    };
}

export function checkSyntaxByLanguage(code: string, language: string): CorrectnessResult {
    const normalized = language.toLowerCase();
    if (normalized === 'py' || normalized === 'python') return runPythonSyntaxCheck(code);
    if (normalized === 'go' || normalized === 'golang') return runGoSyntaxCheck(code);
    return { status: 'unknown', syntaxErrors: [] };
}

export function applyCorrectnessCap(score: number, correctness: CorrectnessResult): { score: number; grade: Grade } {
    const adjusted = correctness.status === 'fail' ? Math.min(score, 60) : score;
    return { score: adjusted, grade: gradeFromScore(adjusted) };
}
