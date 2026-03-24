"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { lecturesAPI, analysisAPI, chatAPI, exportAPI } from "@/lib/api";
import { Lecture, TranscriptData, ChatMessage } from "@/types";
import ReactMarkdown from "react-markdown";
import {
    FileText, BarChart3, BookOpen, Key, HelpCircle, Layers, Zap, MessageSquare,
    Upload, Mic, Brain, CheckCircle2, Clock, ArrowLeft, Download,
    FileDown, FileCode, File, Database, Globe, Users, Calendar, Timer, FileEdit,
    Send, Bot, User, X, Sparkles, ClipboardList, PenLine, FlipHorizontal, ListChecks, Target, Lightbulb
} from "lucide-react";

// ── Helpers ──

function StatusBadge({ status }: { status: string }) {
    const labels: Record<string, string> = {
        uploading: "Uploading", transcribing: "Transcribing", summarizing: "Summarizing",
        processing_rag: "Building Q&A", completed: "Completed", failed: "Failed",
    };
    const isProcessing = !["completed", "failed"].includes(status);
    return (
        <span className={`badge badge-${status} ${isProcessing ? "badge-processing" : ""}`}>
            <span className="badge-dot" />{labels[status] || status}
        </span>
    );
}

function formatTimestamp(sec: number) {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
}

function MarkdownRenderer({ content }: { content: string }) {
    return (
        <div className="markdown-content" style={{ animation: "fadeIn 0.4s ease" }}>
            <ReactMarkdown
                components={{
                    h1: ({ children }) => <h1 className="text-2xl font-bold mb-4">{children}</h1>,
                    h2: ({ children }) => <h2 className="text-xl font-semibold mt-6 mb-3">{children}</h2>,
                    h3: ({ children }) => <h3 className="text-lg font-medium mt-4 mb-2">{children}</h3>,
                    p: ({ children }) => <p className="mb-3 text-gray-300">{children}</p>,
                    li: ({ children }) => <li className="ml-4 list-disc mb-1">{children}</li>,
                    strong: ({ children }) => <strong className="text-white font-semibold">{children}</strong>,
                }}
            >
                {content}
            </ReactMarkdown>
        </div>
    );
}

type Flashcard = {
    front: string;
    back: string;
};

function stripListPrefix(line: string) {
    return line.replace(/^[-*]\s+/, "").replace(/^\d+[.)]\s+/, "").trim();
}

function parseFlashcards(content: string): Flashcard[] {
    const normalized = content.replace(/\r/g, "").trim();
    if (!normalized) return [];

    const cards: Flashcard[] = [];
    const blocks = normalized.split(/\n\s*\n+/);

    blocks.forEach((block) => {
        const cleaned = block
            .replace(/^#{1,6}\s+/gm, "")
            .replace(/\*\*/g, "")
            .trim();

        const qaMatch = cleaned.match(
            /(?:^|\n)(?:Q(?:uestion)?|Front|Term|Prompt)\s*[:\-]\s*([\s\S]*?)(?:\n+)(?:A(?:nswer)?|Back|Definition|Response)\s*[:\-]\s*([\s\S]*)$/i,
        );

        if (qaMatch) {
            const front = qaMatch[1].trim();
            const back = qaMatch[2].trim();
            if (front && back) cards.push({ front, back });
            return;
        }

        const lines = cleaned.split("\n").map((line) => line.trim()).filter(Boolean);
        if (lines.length >= 2) {
            const first = stripListPrefix(lines[0]);
            const second = stripListPrefix(lines[1]);
            if (first && second) cards.push({ front: first, back: second });
        }
    });

    return cards;
}

function FlashcardsRenderer({ content }: { content: string }) {
    const cards = useMemo(() => parseFlashcards(content), [content]);
    const [flipped, setFlipped] = useState<Record<string, boolean>>({});

    const toggleFlip = (cardKey: string) => {
        setFlipped((prev) => ({ ...prev, [cardKey]: !prev[cardKey] }));
    };

    if (cards.length === 0) {
        return <MarkdownRenderer content={content} />;
    }

    return (
        <div className="flashcards-grid" style={{ animation: "fadeIn 0.35s ease" }}>
            {cards.map((card, index) => {
                const cardKey = `${index}-${card.front.slice(0, 24)}`;
                return (
                <button
                    key={cardKey}
                    type="button"
                    className={`flashcard ${flipped[cardKey] ? "is-flipped" : ""}`}
                    onClick={() => toggleFlip(cardKey)}
                    aria-label={`Flashcard ${index + 1}`}
                >
                    <span className="flashcard-inner">
                        <span className="flashcard-face flashcard-front">
                            <span className="flashcard-chip">Front</span>
                            <span className="flashcard-content">{card.front}</span>
                            <span className="flashcard-hint">Click to flip</span>
                        </span>
                        <span className="flashcard-face flashcard-back">
                            <span className="flashcard-chip">Back</span>
                            <span className="flashcard-content">{card.back}</span>
                            <span className="flashcard-hint">Click to flip back</span>
                        </span>
                    </span>
                </button>
                );
            })}
        </div>
    );
}

function AnalysisSkeleton() {
    return (
        <div className="analysis-loading">
            {[100, 80, 60, 90, 45, 70].map((w, i) => (
                <div key={i} className="skeleton-line" style={{ width: `${w}%`, animationDelay: `${i * 0.15}s` }} />
            ))}
        </div>
    );
}

// ── Translation Bar ──
const LANGUAGES = [
    { key: "hinglish", label: "Hinglish" },
    { key: "hindi", label: "Hindi" },
    { key: "gujarati", label: "Gujarati" },
    { key: "marathi", label: "Marathi" },
    { key: "tamil", label: "Tamil" },
    { key: "bengali", label: "Bengali" },
];

function TranslateBar({
    lectureId, content, translatedContent, translating, onTranslate, onClear,
}: {
    lectureId: string; content: string; translatedContent: string | null;
    translating: boolean; onTranslate: (lang: string) => void; onClear: () => void;
}) {
    if (!content) return null;
    return (
        <div className="translate-bar">
            <div className="translate-bar-inner">
                <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", fontWeight: 500, display: "inline-flex", alignItems: "center", gap: 4 }}><Globe size={13} /> Translate:</span>
                <div className="translate-pills">
                    {LANGUAGES.map((lang) => (
                        <button key={lang.key} className="translate-pill" onClick={() => onTranslate(lang.key)} disabled={translating}>
                            {lang.label}
                        </button>
                    ))}
                </div>
                {translating && (
                    <span style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.78rem", color: "var(--primary-400)" }}>
                        <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Translating...
                    </span>
                )}
                {translatedContent && !translating && (
                    <button className="translate-pill" onClick={onClear} style={{ background: "rgba(239,68,68,0.12)", color: "var(--danger-400)" }}>
                        <X size={12} /> Show Original
                    </button>
                )}
            </div>
        </div>
    );
}

// ── Tabs ──
const TABS = [
    { key: "transcript", label: "Transcript", icon: FileText },
    { key: "summary", label: "Summary", icon: BarChart3 },
    { key: "notes", label: "Notes", icon: BookOpen },
    { key: "keywords", label: "Keywords", icon: Key },
    { key: "questions", label: "Q&A Gen", icon: HelpCircle },
    { key: "topics", label: "Topics", icon: Layers },
    { key: "highlights", label: "Highlights", icon: Zap },
    { key: "chat", label: "Ask AI", icon: MessageSquare },
];

const SUMMARY_FORMATS = [
    { key: "short", label: "Short", icon: Zap, desc: "3-5 sentences" },
    { key: "bullet", label: "Bullet", icon: ClipboardList, desc: "Key bullet points" },
    { key: "detailed", label: "Detailed", icon: FileEdit, desc: "Full structured" },
    { key: "exam", label: "Exam", icon: Target, desc: "Exam-focused" },
    { key: "concept", label: "Concept", icon: Lightbulb, desc: "Concept map" },
];

const QUESTION_TYPES = [
    { key: "mcq", label: "MCQs", desc: "10 multiple choice", icon: PenLine, color: "#6366f1" },
    { key: "short", label: "Short Answer", desc: "10 short questions", icon: FileEdit, color: "#8b5cf6" },
    { key: "long", label: "Long Answer", desc: "5 detailed questions", icon: FileText, color: "#a855f7" },
    { key: "flashcards", label: "Flashcards", desc: "15 study cards", icon: FlipHorizontal, color: "#ec4899" },
    { key: "mixed", label: "Full Test", desc: "Complete practice test", icon: ListChecks, color: "#10b981" },
];

export default function LectureDetailPage() {
    const params = useParams();
    const router = useRouter();
    const lectureId = params.id as string;

    const [lecture, setLecture] = useState<Lecture | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState("transcript");
    const [error, setError] = useState("");

    const [analysisCache, setAnalysisCache] = useState<Record<string, string>>({});
    const [analysisLoading, setAnalysisLoading] = useState<string | null>(null);
    const [summaryFormat, setSummaryFormat] = useState("detailed");
    const [questionType, setQuestionType] = useState("mixed");
    const [cachedFlags, setCachedFlags] = useState<Record<string, boolean>>({});

    const [translateCache, setTranslateCache] = useState<Record<string, string>>({});
    const [translating, setTranslating] = useState(false);
    const [activeTranslation, setActiveTranslation] = useState<string | null>(null);

    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [chatInput, setChatInput] = useState("");
    const [chatLoading, setChatLoading] = useState(false);
    const chatEndRef = useRef<HTMLDivElement>(null);

    const [exportOpen, setExportOpen] = useState(false);
    const [exportLoading, setExportLoading] = useState<string | null>(null);

    const fetchLecture = useCallback(async () => {
        try { const res = await lecturesAPI.get(lectureId); setLecture(res.data); }
        catch { setError("Failed to load knowledge item"); } finally { setLoading(false); }
    }, [lectureId]);

    useEffect(() => { fetchLecture(); }, [fetchLecture]);

    useEffect(() => {
        if (lecture && !["completed", "failed"].includes(lecture.status)) {
            const interval = setInterval(fetchLecture, 5000);
            return () => clearInterval(interval);
        }
    }, [lecture, fetchLecture]);

    useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

    const transcriptData: TranscriptData | null = lecture?.transcript_json
        ? (() => { try { return JSON.parse(lecture.transcript_json); } catch { return null; } })()
        : null;

    const availableTabs = TABS.filter((tab) => {
        if (tab.key === "transcript") return !!lecture?.transcript_text;
        if (tab.key === "chat") return lecture?.status === "completed";
        return !!lecture?.transcript_text;
    });

    useEffect(() => { setActiveTranslation(null); }, [activeTab, summaryFormat, questionType]);

    const fetchAnalysis = async (type: string, format?: string) => {
        const cacheKey = `${type}_${format || "default"}`;
        if (analysisCache[cacheKey]) return;
        setAnalysisLoading(cacheKey);
        try {
            let res;
            switch (type) {
                case "summary": res = await analysisAPI.summary(lectureId, format || "detailed"); break;
                case "notes": res = await analysisAPI.notes(lectureId); break;
                case "keywords": res = await analysisAPI.keywords(lectureId); break;
                case "questions": res = await analysisAPI.questions(lectureId, format || "mixed"); break;
                case "topics": res = await analysisAPI.topics(lectureId); break;
                case "highlights": res = await analysisAPI.highlights(lectureId); break;
                default: return;
            }
            setAnalysisCache((prev) => ({ ...prev, [cacheKey]: res.data.content }));
            if (res.data.cached) setCachedFlags((prev) => ({ ...prev, [cacheKey]: true }));
        } catch (err: unknown) {
            const axErr = err as { response?: { data?: { detail?: string } } };
            setAnalysisCache((prev) => ({ ...prev, [cacheKey]: `Error: ${axErr.response?.data?.detail || "Failed to load"}` }));
        } finally { setAnalysisLoading(null); }
    };

    useEffect(() => {
        if (!lecture?.transcript_text) return;
        if (activeTab === "summary") fetchAnalysis("summary", summaryFormat);
        if (activeTab === "notes") fetchAnalysis("notes");
        if (activeTab === "keywords") fetchAnalysis("keywords");
        if (activeTab === "questions") fetchAnalysis("questions", questionType);
        if (activeTab === "topics") fetchAnalysis("topics");
        if (activeTab === "highlights") fetchAnalysis("highlights");
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab, summaryFormat, questionType, lecture?.transcript_text]);

    const handleTranslate = async (lang: string) => {
        const currentCacheKey = activeTab === "summary" ? `summary_${summaryFormat}` : activeTab === "questions" ? `questions_${questionType}` : `${activeTab}_default`;
        const content = analysisCache[currentCacheKey] || lecture?.summary_text || lecture?.transcript_text || "";
        if (!content) return;
        const translationKey = `${currentCacheKey}_${lang}`;
        if (translateCache[translationKey]) { setActiveTranslation(translationKey); return; }
        setTranslating(true);
        try {
            const res = await analysisAPI.translate(lectureId, content, lang);
            setTranslateCache((prev) => ({ ...prev, [translationKey]: res.data.content }));
            setActiveTranslation(translationKey);
        } catch { /* ignore */ }
        finally { setTranslating(false); }
    };

    const handleChat = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!chatInput.trim() || chatLoading) return;
        const question = chatInput.trim();
        setChatInput("");
        setMessages((prev) => [...prev, { id: Date.now().toString(), role: "user", content: question, timestamp: new Date() }]);
        setChatLoading(true);
        try {
            const res = await chatAPI.ask(lectureId, question);
            setMessages((prev) => [...prev, { id: (Date.now() + 1).toString(), role: "assistant", content: res.data.answer, sources: res.data.sources, timestamp: new Date() }]);
        } catch {
            setMessages((prev) => [...prev, { id: (Date.now() + 1).toString(), role: "assistant", content: "Sorry, something went wrong.", timestamp: new Date() }]);
        } finally { setChatLoading(false); }
    };

    const handleExport = async (format: string) => {
        setExportOpen(false);
        setExportLoading(format);
        try {
            let res;
            if (format === "pdf") res = await exportAPI.pdf(lectureId);
            else if (format === "markdown") res = await exportAPI.markdown(lectureId);
            else if (format === "txt") res = await exportAPI.txt(lectureId);
            else res = await exportAPI.json(lectureId);
            const blob = new Blob([res.data]);
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${lecture?.title || "knowledge_item"}.${format === "markdown" ? "md" : format}`;
            a.click();
            URL.revokeObjectURL(url);
        } catch { /* ignore */ }
        finally { setExportLoading(null); }
    };

    useEffect(() => {
        if (exportOpen) {
            const handleClick = () => setExportOpen(false);
            setTimeout(() => document.addEventListener("click", handleClick), 0);
            return () => document.removeEventListener("click", handleClick);
        }
    }, [exportOpen]);

    if (loading) return <div className="loading-screen"><div className="spinner spinner-lg" /><p>Loading knowledge item...</p></div>;
    if (error || !lecture) return <div className="loading-screen"><p style={{ color: "var(--danger-400)" }}>{error || "Not found"}</p><button className="btn btn-secondary" onClick={() => router.push("/dashboard")}><ArrowLeft size={16} /> Back</button></div>;

    const currentCacheKey = activeTab === "summary" ? `summary_${summaryFormat}` : activeTab === "questions" ? `questions_${questionType}` : `${activeTab}_default`;

    const getDisplayContent = (originalContent: string): string => {
        if (activeTranslation && translateCache[activeTranslation]) return translateCache[activeTranslation];
        return originalContent;
    };

    return (
        <div style={{ animation: "fadeIn 0.4s ease" }}>
            {/* ── Header ── */}
            <div className="lecture-header" style={{ animation: "slideInLeft 0.4s ease" }}>
                <div className="lecture-header-info">
                    <button className="btn btn-ghost btn-sm" onClick={() => router.push("/dashboard")} style={{ marginBottom: "8px" }}><ArrowLeft size={14} /> Back to Dashboard</button>
                    <h1 className="page-title" style={{ fontSize: "1.6rem" }}>{lecture.title}</h1>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: "10px", flexWrap: "wrap" }}>
                        <StatusBadge status={lecture.status} />
                        {lecture.created_at && <span style={{ fontSize: "0.82rem", color: "var(--text-muted)", display: "inline-flex", alignItems: "center", gap: 4 }}><Calendar size={13} /> {new Date(lecture.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>}
                        {transcriptData && (
                            <>
                                <span style={{ fontSize: "0.82rem", color: "var(--text-muted)", display: "inline-flex", alignItems: "center", gap: 4 }}><Timer size={13} /> {Math.ceil(transcriptData.duration_seconds / 60)} min</span>
                                <span style={{ fontSize: "0.82rem", color: "var(--text-muted)", display: "inline-flex", alignItems: "center", gap: 4 }}><FileEdit size={13} /> {transcriptData.word_count.toLocaleString()} words</span>
                                <span style={{ fontSize: "0.82rem", color: "var(--text-muted)", display: "inline-flex", alignItems: "center", gap: 4 }}><Globe size={13} /> {transcriptData.detected_language?.toUpperCase()}</span>
                                {Object.keys(transcriptData.speaker_labels).length > 1 && (
                                    <span style={{ fontSize: "0.82rem", color: "var(--text-muted)", display: "inline-flex", alignItems: "center", gap: 4 }}><Users size={13} /> {Object.keys(transcriptData.speaker_labels).length} speakers</span>
                                )}
                            </>
                        )}
                    </div>
                </div>
                <div className="lecture-header-actions">
                    {lecture.status === "completed" && (
                        <div className="export-dropdown" onClick={(e) => e.stopPropagation()}>
                            <button className="btn btn-secondary btn-sm" onClick={() => setExportOpen(!exportOpen)}>
                                {exportLoading ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> : <Download size={14} />} Export
                            </button>
                            {exportOpen && (
                                <div className="export-menu">
                                    <button className="export-menu-item" onClick={() => handleExport("pdf")}><FileDown size={15} /> PDF</button>
                                    <button className="export-menu-item" onClick={() => handleExport("markdown")}><FileCode size={15} /> Markdown</button>
                                    <button className="export-menu-item" onClick={() => handleExport("txt")}><File size={15} /> Text</button>
                                    <button className="export-menu-item" onClick={() => handleExport("json")}><Database size={15} /> JSON</button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* ── Processing ── */}
            {!["completed", "failed"].includes(lecture.status) && (
                <div className="card" style={{ marginBottom: "24px", animation: "scaleIn 0.4s ease", background: "linear-gradient(135deg, var(--bg-card), var(--bg-elevated))" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                        <div className="spinner" />
                        <div>
                            <h4 style={{ marginBottom: "4px", fontSize: "0.95rem" }}>
                                {lecture.status === "uploading" && <><Upload size={15} style={{ display: "inline", verticalAlign: "-2px" }} /> Uploading your file...</>}
                                {lecture.status === "transcribing" && <><Mic size={15} style={{ display: "inline", verticalAlign: "-2px" }} /> Transcribing with Deepgram AI...</>}
                                {lecture.status === "summarizing" && <><FileEdit size={15} style={{ display: "inline", verticalAlign: "-2px" }} /> Generating summary with Groq AI...</>}
                                {lecture.status === "processing_rag" && <><Brain size={15} style={{ display: "inline", verticalAlign: "-2px" }} /> Building Q&A knowledge index...</>}
                            </h4>
                            <p style={{ color: "var(--text-muted)", fontSize: "0.82rem", margin: 0 }}>Auto-refreshes every 5 seconds.</p>
                        </div>
                    </div>
                    <div className="processing-stages" style={{ marginTop: "18px" }}>
                        {[
                            { key: "transcribing", label: "Transcribe", done: !!lecture.transcript_text },
                            { key: "summarizing", label: "Summarize", done: !!lecture.summary_text },
                            { key: "processing_rag", label: "Q&A Index", done: lecture.status === "completed" },
                        ].map((step, i) => (
                            <div key={step.key} className={`stage ${step.done ? "done" : lecture.status === step.key ? "active" : ""}`} style={{ animation: "fadeIn 0.3s ease", animationDelay: `${i * 0.1}s`, animationFillMode: "both" }}>
                                {step.done ? <CheckCircle2 size={13} style={{ display: "inline", verticalAlign: "-2px" }} /> : lecture.status === step.key ? <Clock size={13} style={{ display: "inline", verticalAlign: "-2px" }} /> : "○"} {step.label}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {lecture.status === "failed" && (
                <div className="alert alert-error" style={{ marginBottom: "24px", animation: "scaleIn 0.3s ease" }}>{lecture.summary_text}</div>
            )}

            {/* ── Tabs ── */}
            {availableTabs.length > 0 && (
                <>
                    <div className="tabs" style={{ animation: "fadeIn 0.3s ease" }}>
                        {availableTabs.map((tab, i) => {
                            const Icon = tab.icon;
                            return (
                                <button key={tab.key} className={`tab-btn ${activeTab === tab.key ? "active" : ""}`} onClick={() => setActiveTab(tab.key)} style={{ animation: "fadeIn 0.3s ease", animationDelay: `${i * 0.04}s`, animationFillMode: "both" }}>
                                    <span className="tab-icon"><Icon size={15} /></span> {tab.label}
                                </button>
                            );
                        })}
                    </div>

                    <div className="tab-panel" style={{ animation: "fadeIn 0.35s ease" }}>

                        {/* TRANSCRIPT */}
                        {activeTab === "transcript" && (
                            <div className="card" style={{ animation: "scaleIn 0.3s ease" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                                    <h3 style={{ fontSize: "1rem", fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}><FileText size={16} /> Full Transcript</h3>
                                </div>
                                <TranslateBar lectureId={lectureId} content={lecture?.transcript_text || ""} translatedContent={activeTranslation ? translateCache[activeTranslation] : null} translating={translating} onTranslate={handleTranslate} onClear={() => setActiveTranslation(null)} />
                                {activeTranslation && translateCache[activeTranslation] ? (
                                    <div className="transcript-content"><MarkdownRenderer content={translateCache[activeTranslation]} /></div>
                                ) : transcriptData && transcriptData.utterances.length > 0 ? (
                                    <div className="transcript-content">
                                        {Object.keys(transcriptData.speaker_labels).length > 1 && (
                                            <div style={{ marginBottom: "18px", display: "flex", gap: "10px", flexWrap: "wrap", padding: "12px 14px", background: "var(--bg-surface)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)" }}>
                                                <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", fontWeight: 600 }}>Speakers:</span>
                                                {Object.entries(transcriptData.speaker_labels).map(([id, label]) => (
                                                    <span key={id} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.8rem" }}>
                                                        <span className={`utterance-speaker speaker-${id}`} style={{ width: 20, height: 20, fontSize: "0.6rem" }}>{parseInt(id) + 1}</span>
                                                        <span style={{ color: "var(--text-secondary)" }}>{label}</span>
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                        {transcriptData.utterances.map((utt, i) => (
                                            <div key={i} className="utterance" style={{ animation: "fadeIn 0.2s ease", animationDelay: `${Math.min(i * 0.03, 0.6)}s`, animationFillMode: "both" }}>
                                                <span className={`utterance-speaker speaker-${utt.speaker}`}>{utt.speaker + 1}</span>
                                                <span className="utterance-time">{formatTimestamp(utt.start)}</span>
                                                <span className="utterance-text">{utt.text}</span>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="transcript-content">{lecture?.transcript_text || "No transcript."}</div>
                                )}
                            </div>
                        )}

                        {/* SUMMARY */}
                        {activeTab === "summary" && (
                            <div className="card" style={{ animation: "scaleIn 0.3s ease" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px", flexWrap: "wrap", gap: "10px" }}>
                                    <h3 style={{ fontSize: "1rem", fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}><BarChart3 size={16} /> Summary</h3>
                                    {cachedFlags[currentCacheKey] && <span className="badge" style={{ background: "rgba(16,185,129,0.12)", color: "var(--accent-400)", fontSize: "0.7rem" }}><Sparkles size={11} /> Cached</span>}
                                </div>
                                <div className="sub-tabs">{SUMMARY_FORMATS.map((f) => {
                                    const FIcon = f.icon;
                                    return <button key={f.key} className={`sub-tab ${summaryFormat === f.key ? "active" : ""}`} onClick={() => setSummaryFormat(f.key)}><FIcon size={13} /> {f.label}</button>;
                                })}</div>
                                <TranslateBar lectureId={lectureId} content={analysisCache[`summary_${summaryFormat}`] || ""} translatedContent={activeTranslation ? translateCache[activeTranslation] : null} translating={translating} onTranslate={handleTranslate} onClear={() => setActiveTranslation(null)} />
                                {analysisLoading === `summary_${summaryFormat}` ? <AnalysisSkeleton /> : (
                                    <MarkdownRenderer content={getDisplayContent(analysisCache[`summary_${summaryFormat}`] || lecture?.summary_text || "Select a format.")} />
                                )}
                            </div>
                        )}

                        {/* NOTES */}
                        {activeTab === "notes" && (
                            <div className="card" style={{ animation: "scaleIn 0.3s ease" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                                    <h3 style={{ fontSize: "1rem", fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}><BookOpen size={16} /> Auto-Generated Notes</h3>
                                    {cachedFlags["notes_default"] && <span className="badge" style={{ background: "rgba(16,185,129,0.12)", color: "var(--accent-400)", fontSize: "0.7rem" }}><Sparkles size={11} /> Cached</span>}
                                </div>
                                <TranslateBar lectureId={lectureId} content={analysisCache["notes_default"] || ""} translatedContent={activeTranslation ? translateCache[activeTranslation] : null} translating={translating} onTranslate={handleTranslate} onClear={() => setActiveTranslation(null)} />
                                {analysisLoading === "notes_default" ? <AnalysisSkeleton /> : (
                                    <MarkdownRenderer content={getDisplayContent(analysisCache["notes_default"] || "Loading...")} />
                                )}
                            </div>
                        )}

                        {/* KEYWORDS */}
                        {activeTab === "keywords" && (
                            <div className="card" style={{ animation: "scaleIn 0.3s ease" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                                    <h3 style={{ fontSize: "1rem", fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}><Key size={16} /> Keywords & Concepts</h3>
                                    {cachedFlags["keywords_default"] && <span className="badge" style={{ background: "rgba(16,185,129,0.12)", color: "var(--accent-400)", fontSize: "0.7rem" }}><Sparkles size={11} /> Cached</span>}
                                </div>
                                <TranslateBar lectureId={lectureId} content={analysisCache["keywords_default"] || ""} translatedContent={activeTranslation ? translateCache[activeTranslation] : null} translating={translating} onTranslate={handleTranslate} onClear={() => setActiveTranslation(null)} />
                                {analysisLoading === "keywords_default" ? <AnalysisSkeleton /> : (
                                    <MarkdownRenderer content={getDisplayContent(analysisCache["keywords_default"] || "Loading...")} />
                                )}
                            </div>
                        )}

                        {/* QUESTIONS */}
                        {activeTab === "questions" && (
                            <div style={{ animation: "scaleIn 0.3s ease" }}>
                                <div className="qa-type-grid">
                                    {QUESTION_TYPES.map((q, i) => {
                                        const QIcon = q.icon;
                                        return (
                                            <button
                                                key={q.key}
                                                className={`qa-type-card ${questionType === q.key ? "active" : ""}`}
                                                onClick={() => setQuestionType(q.key)}
                                                style={{
                                                    animation: "scaleIn 0.3s ease", animationDelay: `${i * 0.06}s`, animationFillMode: "both",
                                                    borderColor: questionType === q.key ? q.color : "var(--border-subtle)",
                                                    background: questionType === q.key ? `${q.color}10` : "var(--bg-card)",
                                                }}
                                            >
                                                <span className="qa-type-icon" style={{ background: `${q.color}20`, color: q.color }}><QIcon size={18} /></span>
                                                <div className="qa-type-info">
                                                    <span className="qa-type-label">{q.label}</span>
                                                    <span className="qa-type-desc">{q.desc}</span>
                                                </div>
                                                {questionType === q.key && <span style={{ fontSize: "0.7rem", color: q.color }}>●</span>}
                                            </button>
                                        );
                                    })}
                                </div>
                                <div className="card" style={{ marginTop: "16px" }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
                                        <h3 style={{ fontSize: "1rem", fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
                                            {(() => { const q = QUESTION_TYPES.find((q) => q.key === questionType); const QI = q?.icon || FileText; return <><QI size={16} /> {q?.label}</>; })()}
                                        </h3>
                                        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                                            {cachedFlags[`questions_${questionType}`] && <span className="badge" style={{ background: "rgba(16,185,129,0.12)", color: "var(--accent-400)", fontSize: "0.7rem" }}><Sparkles size={11} /> Cached</span>}
                                        </div>
                                    </div>
                                    <TranslateBar lectureId={lectureId} content={analysisCache[`questions_${questionType}`] || ""} translatedContent={activeTranslation ? translateCache[activeTranslation] : null} translating={translating} onTranslate={handleTranslate} onClear={() => setActiveTranslation(null)} />
                                    {analysisLoading === `questions_${questionType}` ? <AnalysisSkeleton /> : (
                                        questionType === "flashcards"
                                            ? <FlashcardsRenderer content={getDisplayContent(analysisCache[`questions_${questionType}`] || "Select a question type above.")} />
                                            : <MarkdownRenderer content={getDisplayContent(analysisCache[`questions_${questionType}`] || "Select a question type above.")} />
                                    )}
                                </div>
                            </div>
                        )}

                        {/* TOPICS */}
                        {activeTab === "topics" && (
                            <div className="card" style={{ animation: "scaleIn 0.3s ease" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                                    <h3 style={{ fontSize: "1rem", fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}><Layers size={16} /> Topic Segmentation</h3>
                                    {cachedFlags["topics_default"] && <span className="badge" style={{ background: "rgba(16,185,129,0.12)", color: "var(--accent-400)", fontSize: "0.7rem" }}><Sparkles size={11} /> Cached</span>}
                                </div>
                                <TranslateBar lectureId={lectureId} content={analysisCache["topics_default"] || ""} translatedContent={activeTranslation ? translateCache[activeTranslation] : null} translating={translating} onTranslate={handleTranslate} onClear={() => setActiveTranslation(null)} />
                                {analysisLoading === "topics_default" ? <AnalysisSkeleton /> : (
                                    <MarkdownRenderer content={getDisplayContent(analysisCache["topics_default"] || "Loading...")} />
                                )}
                            </div>
                        )}

                        {/* HIGHLIGHTS */}
                        {activeTab === "highlights" && (
                            <div className="card" style={{ animation: "scaleIn 0.3s ease" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                                    <h3 style={{ fontSize: "1rem", fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}><Zap size={16} /> Smart Highlights</h3>
                                    {cachedFlags["highlights_default"] && <span className="badge" style={{ background: "rgba(16,185,129,0.12)", color: "var(--accent-400)", fontSize: "0.7rem" }}><Sparkles size={11} /> Cached</span>}
                                </div>
                                <TranslateBar lectureId={lectureId} content={analysisCache["highlights_default"] || ""} translatedContent={activeTranslation ? translateCache[activeTranslation] : null} translating={translating} onTranslate={handleTranslate} onClear={() => setActiveTranslation(null)} />
                                {analysisLoading === "highlights_default" ? <AnalysisSkeleton /> : (
                                    <MarkdownRenderer content={getDisplayContent(analysisCache["highlights_default"] || "Loading...")} />
                                )}
                            </div>
                        )}

                        {/* CHAT */}
                        {activeTab === "chat" && (
                            <div className="card chat-container" style={{ animation: "scaleIn 0.3s ease" }}>
                                <div className="chat-messages">
                                    {messages.length === 0 ? (
                                        <div className="chat-welcome" style={{ animation: "float 3s ease-in-out infinite" }}>
                                            <div className="chat-welcome-icon"><MessageSquare size={36} /></div>
                                            <h3 style={{ marginBottom: "8px", fontSize: "1.05rem" }}>Ask about this knowledge item</h3>
                                            <p style={{ fontSize: "0.88rem", maxWidth: "400px", margin: "0 auto" }}>AI-powered answers using RAG with Cohere embeddings and Groq.</p>
                                            <div style={{ display: "flex", gap: "8px", justifyContent: "center", marginTop: "16px", flexWrap: "wrap" }}>
                                                {["What are the main topics?", "Explain the key concepts", "Summarize in simple terms"].map((q) => (
                                                    <button key={q} className="sub-tab" onClick={() => setChatInput(q)} style={{ cursor: "pointer" }}>{q}</button>
                                                ))}
                                            </div>
                                        </div>
                                    ) : (
                                        messages.map((msg, i) => (
                                            <div key={msg.id} className={`chat-message chat-message-${msg.role}`} style={{ animation: "fadeIn 0.3s ease", animationDelay: `${i * 0.05}s`, animationFillMode: "both" }}>
                                                <div className="chat-avatar">{msg.role === "user" ? <User size={16} /> : <Bot size={16} />}</div>
                                                <div className="chat-bubble">
                                                    {msg.role === "assistant" ? (
                                                        <div className="chat-markdown">
                                                            <ReactMarkdown>{msg.content}</ReactMarkdown>
                                                        </div>
                                                    ) : (
                                                        msg.content.split("\n").map((line, j) => (
                                                            <span key={j}>{line}{j < msg.content.split("\n").length - 1 && <br />}</span>
                                                        ))
                                                    )}
                                                </div>
                                            </div>
                                        ))
                                    )}
                                    {chatLoading && (
                                        <div className="chat-message chat-message-assistant" style={{ animation: "fadeIn 0.2s ease" }}>
                                            <div className="chat-avatar"><Bot size={16} /></div>
                                            <div className="chat-bubble chat-typing"><div className="chat-typing-dot" /><div className="chat-typing-dot" /><div className="chat-typing-dot" /></div>
                                        </div>
                                    )}
                                    <div ref={chatEndRef} />
                                </div>
                                <form className="chat-input-area" onSubmit={handleChat}>
                                    <input className="chat-input" type="text" placeholder="Ask anything about this document or meeting..." value={chatInput} onChange={(e) => setChatInput(e.target.value)} disabled={chatLoading} />
                                    <button type="submit" className="chat-send-btn" disabled={!chatInput.trim() || chatLoading}>
                                        {chatLoading ? <span className="spinner" style={{ width: 16, height: 16, borderWidth: 2, borderColor: "rgba(255,255,255,0.3)", borderTopColor: "white" }} /> : <Send size={18} />}
                                    </button>
                                </form>
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
