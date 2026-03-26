'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useUser, UserButton } from '@clerk/nextjs';
import { Loader2, Zap, ShieldCheck, TrendingUp, ChevronRight, Upload, FileCode, BarChart2, LogIn } from 'lucide-react';
import type { AnalysisResult } from '@/lib/analyzer/types';
import ThemeToggle from '@/components/ThemeToggle';

// ─── Language config ──────────────────────────────────────────────────────────

const DEEP_LANGS = [
  { id: 'ts', label: 'TypeScript' },
  { id: 'js', label: 'JavaScript' },
];
const QUICK_LANGS = [
  { id: 'py', label: 'Python' },
  { id: 'java', label: 'Java' },
  { id: 'go', label: 'Go' },
  { id: 'cpp', label: 'C++' },
  { id: 'cs', label: 'C#' },
  { id: 'rs', label: 'Rust' },
  { id: 'rb', label: 'Ruby' },
  { id: 'other', label: 'Other' },
];

const PLACEHOLDERS: Record<string, string> = {
  ts: `// TypeScript — Deep Analysis\nfunction processData(data: UserData) {\n  if (data) {\n    if (data.users) {\n      for (const user of data.users) {\n        if (user.active && user.role === 'admin') {\n          console.log('admin found');\n        }\n      }\n    }\n  }\n}`,
  js: `// JavaScript — Deep Analysis\nfunction processData(data) {\n  if (data && data.users) {\n    for (let i = 0; i < data.users.length; i++) {\n      if (data.users[i].active) {\n        console.log('found');\n      }\n    }\n  }\n}`,
  py: `# Python — Quick Scan\ndef process_data(data):\n    if data:\n        if data.get('users'):\n            for user in data['users']:\n                if user['active']:\n                    if user['role'] == 'admin':\n                        print('admin found')`,
  go: `// Go — Quick Scan\nfunc processData(data Data) {\n    if data.Users != nil {\n        for _, user := range data.Users {\n            if user.Active && user.Role == "admin" {\n                fmt.Println("admin found")\n            }\n        }\n    }\n}`,
  java: `// Java — Quick Scan\npublic class Demo {\n  // triggers: public_field\n  public int x = 1;\n\n  public void run() {\n    try {\n      throw new Exception(\"boom\");\n    } catch (Exception e) {} // triggers: generic_exception + empty_catch\n  }\n}`,
  cpp: `// C++ — Quick Scan\n#include <iostream>\nusing namespace std; // triggers: using_namespace_std\n\nclass Demo {\npublic:\n  void run() {\n    // triggers: raw_pointer (new)\n    int* p = new int(5);\n    (void)p;\n  }\n\n  // triggers: empty_destructor\n  ~Demo() {}\n};`,
  cs: `// C# — Quick Scan\npublic void ProcessData(Data data) {\n    if (data?.Users != null) {\n        foreach (var user in data.Users) {\n            if (user.IsActive && user.Role == "admin") {\n                Console.WriteLine("admin found");\n            }\n        }\n    }\n}`,
  rs: `// Rust — Quick Scan\nfn process_data(data: &Data) {\n    if let Some(users) = &data.users {\n        for user in users {\n            if user.active && user.role == "admin" {\n                println!("admin found");\n            }\n        }\n    }\n}`,
  other: `// Paste your code here for a Quick Scan health check`,
};

const FEATURES = [
  {
    icon: <Zap size={20} />,
    title: 'Deep Analysis for JS/TS',
    desc: 'Real AST-based metrics — cyclomatic complexity, nesting depth, duplication. Not AI guessing.',
  },
  {
    icon: <ShieldCheck size={20} />,
    title: 'Quick Scan for Any Language',
    desc: 'Python, Go, Java, C++, Rust, C# and more. Pattern-based health check that works for any stack.',
  },
  {
    icon: <TrendingUp size={20} />,
    title: 'AI Coaching — Not Judging',
    desc: 'Llama 3 70B starts with what\'s working, then suggests the most impactful improvement in plain language.',
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function HomePage() {
  const [tab, setTab] = useState<'paste' | 'zip'>('paste');
  const [code, setCode] = useState('');
  const [language, setLanguage] = useState('ts');
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [projectName, setProjectName] = useState('');
  const router = useRouter();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { user, isLoaded } = useUser();

  const isDeep = language === 'ts' || language === 'js';
  const placeholder = PLACEHOLDERS[language] ?? PLACEHOLDERS.other;

  // ── Paste & Analyze ──
  async function handleAnalyze() {
    if (!code.trim()) {
      setError('Please paste some code to analyze.');
      textareaRef.current?.focus();
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, language }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Analysis failed. Try again.'); return; }
      sessionStorage.setItem('cv_result', JSON.stringify(data as AnalysisResult));
      sessionStorage.setItem('cv_lang', language);
      sessionStorage.setItem('cv_code', code);
      sessionStorage.setItem('cv_language_mode', isDeep ? 'deep' : 'quick');
      sessionStorage.removeItem('cv_saved');
      router.push('/analyze');
    } catch {
      setError('Network error. Make sure the dev server is running.');
    } finally {
      setLoading(false);
    }
  }

  // ── ZIP Upload ──
  async function handleZipUpload() {
    if (!zipFile) { setError('Please select a .zip file.'); return; }
    setError('');
    setLoading(true);
    try {
      const form = new FormData();
      form.append('file', zipFile);
      const res = await fetch('/api/analyze-zip', { method: 'POST', body: form });
      let data: unknown = null;
      try { data = await res.json(); } catch { /* non-JSON error page (e.g., 413) */ }
      if (!res.ok) {
        if (res.status === 413) {
          setError('ZIP is too large for deployed analysis. Keep it under 4MB or upload a smaller subset.');
        } else {
          const parsed = data as { error?: string } | null;
          setError(parsed?.error ?? 'Analysis failed. Try again.');
        }
        return;
      }
      sessionStorage.setItem('cv_project', JSON.stringify(data));
      sessionStorage.setItem('cv_project_name', projectName.trim() || zipFile.name.replace('.zip', ''));
      sessionStorage.setItem('cv_language_mode', 'mixed');
      sessionStorage.removeItem('cv_saved');
      router.push('/project');
    } catch {
      setError('Network error. Make sure the dev server is running.');
    } finally {
      setLoading(false);
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f?.name.endsWith('.zip')) setZipFile(f);
    else setError('Please drop a .zip file.');
  }

  return (
    <main className="home-main">
      {/* ── Navbar ───────────────────────────────────────────────────── */}
      <nav className="cv-nav">
        <div className="cv-nav-logo" onClick={() => router.push('/')}>
          <span className="cv-logo-dot" />
          CodeVitals
        </div>
        <div className="cv-nav-actions">
          <span className="cv-nav-badge">Beta</span>
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

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="hero-section">
        <div className="hero-chip">
          <Zap size={13} /> Code Health · Multi-Language · AI Insights
        </div>
        <h1 className="hero-title">
          Know Your Code&apos;s
          <br />
          <span className="hero-gradient">Health Score</span>
        </h1>
        <p className="hero-sub">
          Deep analysis for JS/TS projects. Quick scan for Python, Go, Java, C++, Rust and more.
          Paste a snippet or upload your whole project as a ZIP. Maintainability and correctness are reported separately.
        </p>
      </section>

      {/* ── Analyzer Box ─────────────────────────────────────────────── */}
      <section className="analyzer-box">

        {/* Tab toggle */}
        <div className="tab-toggle">
          <button
            className={`tab-btn ${tab === 'paste' ? 'active' : ''}`}
            onClick={() => setTab('paste')}
          >
            <FileCode size={15} /> Paste Code
          </button>
          <button
            className={`tab-btn ${tab === 'zip' ? 'active' : ''}`}
            onClick={() => setTab('zip')}
          >
            <Upload size={15} /> Upload ZIP
          </button>
        </div>

        {/* ── Paste Tab ── */}
        {tab === 'paste' && (
          <>
            <div className="analyzer-controls">
              {/* Deep mode section */}
              <div className="lang-group">
                <span className="lang-group-label">
                  🔬 Deep Analysis
                </span>
                <div className="lang-toggle">
                  {DEEP_LANGS.map(l => (
                    <button
                      key={l.id}
                      className={`lang-btn ${language === l.id ? 'active' : ''}`}
                      onClick={() => setLanguage(l.id)}
                    >
                      {l.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Quick scan section */}
              <div className="lang-group">
                <span className="lang-group-label">
                  ⚡ Quick Scan
                </span>
                <div className="lang-toggle">
                  {QUICK_LANGS.map(l => (
                    <button
                      key={l.id}
                      className={`lang-btn ${language === l.id ? 'active' : ''}`}
                      onClick={() => setLanguage(l.id)}
                    >
                      {l.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <textarea
              ref={textareaRef}
              className="code-textarea"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={placeholder}
              spellCheck={false}
              rows={16}
            />

            {error && <p className="analyzer-error">{error}</p>}

            <button className="analyze-btn" onClick={handleAnalyze} disabled={loading}>
              {loading ? (
                <><Loader2 size={16} className="spin" /> Analyzing…</>
              ) : (
                <>Analyze Code <ChevronRight size={16} /></>
              )}
            </button>

            <p className="analyzer-hint">
              {isDeep
                ? '🔬 Deep Analysis — includes syntax-aware correctness gate for JS/TS'
                : '⚡ Quick Scan — structural health check (+ syntax gate for Python/Go)'}
              {' · '}Max 100KB
            </p>
          </>
        )}

        {/* ── ZIP Tab ── */}
        {tab === 'zip' && (
          <>
            {/* Project name input */}
            <div className="zip-project-name-row">
              <input
                className="zip-project-name-input"
                type="text"
                placeholder="Project name (optional — e.g. MyApp Backend)"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                maxLength={60}
              />
            </div>

            <div
              className={`zip-dropzone ${dragOver ? 'drag-over' : ''} ${zipFile ? 'has-file' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".zip"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) setZipFile(f);
                }}
              />
              <Upload size={32} className="dropzone-icon" />
              {zipFile ? (
                <>
                  <p className="dropzone-filename">{zipFile.name}</p>
                  <p className="dropzone-sub">{(zipFile.size / 1024).toFixed(0)} KB · Click to change</p>
                </>
              ) : (
                <>
                  <p className="dropzone-text">Drop your .zip here or click to browse</p>
                  <p className="dropzone-sub">
                    Supports .js .ts .tsx .py .java .go .cpp .cs .rs .rb · Max 4MB · Up to 50 files
                  </p>
                </>
              )}
            </div>

            <div className="zip-mode-info">
              <div className="zip-mode-chip deep">🔬 JS/TS files get Deep Analysis</div>
              <div className="zip-mode-chip quick">⚡ All other languages get Quick Scan</div>
            </div>

            {error && <p className="analyzer-error">{error}</p>}

            <button
              className="analyze-btn"
              onClick={handleZipUpload}
              disabled={loading || !zipFile}
            >
              {loading ? (
                <><Loader2 size={16} className="spin" /> Analyzing Project…</>
              ) : (
                <>Analyze Project <ChevronRight size={16} /></>
              )}
            </button>

            <p className="analyzer-hint">
              node_modules, .next, dist, and build folders are automatically excluded
            </p>
          </>
        )}
      </section>

      {/* ── Features ──────────────────────────────────────────────────── */}
      <section className="features-section">
        {FEATURES.map((f) => (
          <div key={f.title} className="feature-card">
            <div className="feature-icon">{f.icon}</div>
            <h3 className="feature-title">{f.title}</h3>
            <p className="feature-desc">{f.desc}</p>
          </div>
        ))}
      </section>

      {/* ── Footer ───────────────────────────────────────────────────── */}
      <footer className="cv-footer">
        CodeVitals · Deep analysis for JS/TS · Quick scan for any stack
      </footer>
    </main>
  );
}
