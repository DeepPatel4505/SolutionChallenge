"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { lecturesAPI } from "@/lib/api";
import { Lecture } from "@/types";
import { BookOpen, CheckCircle2, Clock, Plus, Calendar, Trash2, Upload, Mic } from "lucide-react";

function StatusBadge({ status }: { status: string }) {
    const labels: Record<string, string> = {
        uploading: "Uploading", transcribing: "Transcribing", summarizing: "Summarizing",
        processing_rag: "Indexing", completed: "Completed", failed: "Failed",
    };
    const isProcessing = !["completed", "failed"].includes(status);
    return (
        <span className={`badge badge-${status} ${isProcessing ? "badge-processing" : ""}`}>
            <span className="badge-dot" />
            {labels[status] || status}
        </span>
    );
}

export default function DashboardPage() {
    const router = useRouter();
    const [lectures, setLectures] = useState<Lecture[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchLectures = useCallback(async () => {
        try {
            const response = await lecturesAPI.list();
            setLectures(response.data.lectures || []);
        } catch {
            /* ignore */
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchLectures();
    }, [fetchLectures]);

    useEffect(() => {
        const hasProcessing = lectures.some((l) => !["completed", "failed"].includes(l.status));
        if (hasProcessing) {
            const interval = setInterval(fetchLectures, 5000);
            return () => clearInterval(interval);
        }
    }, [lectures, fetchLectures]);

    const handleDelete = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if (!confirm("Delete this knowledge item?")) return;
        try {
            await lecturesAPI.delete(id);
            setLectures((prev) => prev.filter((l) => l.id !== id));
        } catch { /* ignore */ }
    };

    const completedCount = lectures.filter((l) => l.status === "completed").length;
    const processingCount = lectures.filter((l) => !["completed", "failed"].includes(l.status)).length;

    if (loading) {
        return <div className="loading-screen"><div className="spinner spinner-lg" /><p>Loading...</p></div>;
    }

    return (
        <div>
            <div className="page-header">
                <h1 className="page-title">Dashboard</h1>
                <p className="page-subtitle">Manage documents, meetings, and AI-generated knowledge</p>
            </div>

            <div className="dashboard-stats">
                <div className="stat-card">
                    <span className="stat-icon-wrap" style={{ background: "rgba(99,102,241,0.12)", color: "#818cf8" }}><BookOpen size={22} /></span>
                    <div><div className="stat-value">{lectures.length}</div><div className="stat-label">Total Knowledge Items</div></div>
                </div>
                <div className="stat-card">
                    <span className="stat-icon-wrap" style={{ background: "rgba(16,185,129,0.12)", color: "#34d399" }}><CheckCircle2 size={22} /></span>
                    <div><div className="stat-value">{completedCount}</div><div className="stat-label">Completed</div></div>
                </div>
                <div className="stat-card">
                    <span className="stat-icon-wrap" style={{ background: "rgba(251,191,36,0.12)", color: "#fbbf24" }}><Clock size={22} /></span>
                    <div><div className="stat-value">{processingCount}</div><div className="stat-label">Processing</div></div>
                </div>
                <div className="stat-card" style={{ cursor: "pointer" }} onClick={() => router.push("/upload")}>
                    <span className="stat-icon-wrap" style={{ background: "rgba(168,85,247,0.12)", color: "#a855f7" }}><Plus size={22} /></span>
                    <div><div className="stat-value" style={{ fontSize: "1rem" }}>New</div><div className="stat-label">Upload / Meeting</div></div>
                </div>
            </div>

            {lectures.length === 0 ? (
                <div className="empty-state">
                    <span className="empty-state-icon"><BookOpen size={48} strokeWidth={1.5} /></span>
                    <h3>No knowledge items yet</h3>
                    <p>Upload docs/media or record a meeting to build your internal knowledge base.</p>
                    <div style={{ display: "flex", gap: "10px", justifyContent: "center" }}>
                        <button className="btn btn-primary" onClick={() => router.push("/upload")}><Upload size={16} /> Upload</button>
                        <button className="btn btn-secondary" onClick={() => router.push("/record")}><Mic size={16} /> Record Meeting</button>
                    </div>
                </div>
            ) : (
                <div className="lectures-grid">
                    {lectures.map((lecture) => (
                        <div key={lecture.id} className="lecture-card" onClick={() => router.push(`/lecture/${lecture.id}`)}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                                <div className="lecture-card-title">{lecture.title}</div>
                                <StatusBadge status={lecture.status} />
                            </div>
                            <div className="lecture-card-meta">
                                <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Calendar size={13} /> {lecture.created_at ? new Date(lecture.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}</span>
                            </div>
                            {lecture.status === "failed" && lecture.summary_text && (
                                <div className="alert alert-error" style={{ fontSize: "0.78rem", padding: "8px 12px", marginTop: "4px" }}>
                                    {lecture.summary_text.slice(0, 120)}...
                                </div>
                            )}
                            <div className="lecture-card-actions">
                                <button className="btn btn-danger btn-sm" onClick={(e) => handleDelete(e, lecture.id)}><Trash2 size={14} /> Delete</button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
