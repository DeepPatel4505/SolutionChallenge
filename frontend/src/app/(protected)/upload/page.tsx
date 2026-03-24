"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { lecturesAPI } from "@/lib/api";
import {
    Mic,
    FileText,
    CheckCircle2,
    FolderOpen,
    Upload,
    ArrowUpFromLine,
} from "lucide-react";

type UploadMode = "media" | "document";

export default function UploadPage() {
    const router = useRouter();
    const fileRef = useRef<HTMLInputElement>(null);
    const [mode, setMode] = useState<UploadMode>("media");
    const [title, setTitle] = useState("");
    const [file, setFile] = useState<File | null>(null);
    const [dragActive, setDragActive] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState("");

    const isValidForMode = useCallback((f: File, selectedMode: UploadMode) => {
        const name = (f.name || "").toLowerCase();
        const isDoc =
            name.endsWith(".pdf") ||
            name.endsWith(".docx") ||
            name.endsWith(".pptx");
        const isMedia =
            f.type.startsWith("audio/") || f.type.startsWith("video/");
        return selectedMode === "media" ? isMedia : isDoc;
    }, []);

    const handleDrop = useCallback(
        (e: React.DragEvent) => {
            e.preventDefault();
            setDragActive(false);
            const f = e.dataTransfer.files[0];
            if (f && isValidForMode(f, mode)) {
                setFile(f);
                if (!title) setTitle(f.name.replace(/\.[^/.]+$/, ""));
                setError("");
            } else if (f) {
                setError(
                    mode === "media"
                        ? "Please upload an audio/video file."
                        : "Please upload a PDF, DOCX, or PPTX file.",
                );
            }
        },
        [title, mode, isValidForMode],
    );

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0];
        if (f && isValidForMode(f, mode)) {
            setFile(f);
            if (!title) setTitle(f.name.replace(/\.[^/.]+$/, ""));
            setError("");
        } else if (f) {
            setFile(null);
            setError(
                mode === "media"
                    ? "Please choose an audio/video file."
                    : "Please choose a PDF, DOCX, or PPTX file.",
            );
        }
    };

    const handleModeChange = (nextMode: UploadMode) => {
        setMode(nextMode);
        setFile(null);
        setError("");
    };

    const handleUpload = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!file || !title.trim()) return;

        setError("");
        setUploading(true);

        try {
            // STEP 1: get upload URL from backend
            const formData = new FormData();
            formData.append("title", title.trim());
            formData.append("filename", file.name);

            const res = await lecturesAPI.uploadurl(formData);

            const { upload_url, path, lecture_id } = res.data;

            // STEP 2: upload file directly to storage
            await fetch(upload_url, {
                method: "PUT",
                body: file,
            });

            // STEP 3: confirm upload
            const confirmData = new FormData();
            confirmData.append("lecture_id", lecture_id);
            confirmData.append("path", path);
            await lecturesAPI.confirmupload(confirmData);

            // redirect
            router.push(`/lecture/${lecture_id}`);
        } catch (err: any) {
            setError(err?.message || "Upload failed");
            setUploading(false);
        }
    };

    return (
        <div>
            <div className="page-header">
                <h1 className="page-title">Upload Knowledge</h1>
                <p className="page-subtitle">
                    Choose upload type: Audio/Video or Document (PDF/DOCX/PPTX)
                </p>
            </div>

            <div className="card" style={{ maxWidth: "640px" }}>
                <div style={{ marginBottom: "20px" }}>
                    <label
                        className="form-label"
                        style={{ marginBottom: "10px" }}
                    >
                        Upload Type
                    </label>
                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns: "1fr 1fr",
                            gap: "10px",
                        }}
                    >
                        <button
                            type="button"
                            className="btn"
                            onClick={() => handleModeChange("media")}
                            style={{
                                justifyContent: "center",
                                background:
                                    mode === "media"
                                        ? "var(--primary-600)"
                                        : "var(--bg-surface)",
                                color:
                                    mode === "media"
                                        ? "#fff"
                                        : "var(--text-primary)",
                                border: "1px solid var(--border-subtle)",
                            }}
                        >
                            <Mic size={16} /> Audio / Video
                        </button>
                        <button
                            type="button"
                            className="btn"
                            onClick={() => handleModeChange("document")}
                            style={{
                                justifyContent: "center",
                                background:
                                    mode === "document"
                                        ? "var(--primary-600)"
                                        : "var(--bg-surface)",
                                color:
                                    mode === "document"
                                        ? "#fff"
                                        : "var(--text-primary)",
                                border: "1px solid var(--border-subtle)",
                            }}
                        >
                            <FileText size={16} /> PDF / DOCX / PPTX
                        </button>
                    </div>
                    <p
                        style={{
                            marginTop: "10px",
                            color: "var(--text-muted)",
                            fontSize: "0.85rem",
                        }}
                    >
                        {mode === "media"
                            ? "Use this for meetings, calls, or internal walkthrough videos."
                            : "Use this for company docs/slides. We extract text and process it like a transcript."}
                    </p>
                </div>

                <form onSubmit={handleUpload}>
                    <div
                        className="form-group"
                        style={{ marginBottom: "20px" }}
                    >
                        <label className="form-label">
                            Knowledge Item Title
                        </label>
                        <input
                            className="input"
                            type="text"
                            placeholder="e.g. Q2 Roadmap Review / Sales Playbook"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            required
                        />
                    </div>

                    <div
                        className={`upload-zone ${dragActive ? "active" : ""}`}
                        onDrop={handleDrop}
                        onDragOver={(e) => {
                            e.preventDefault();
                            setDragActive(true);
                        }}
                        onDragLeave={() => setDragActive(false)}
                        onClick={() => fileRef.current?.click()}
                    >
                        <input
                            ref={fileRef}
                            type="file"
                            accept={
                                mode === "media"
                                    ? "audio/*,video/*"
                                    : ".pdf,.docx,.pptx"
                            }
                            onChange={handleFileChange}
                            hidden
                        />
                        {file ? (
                            <>
                                <span className="upload-zone-icon">
                                    <CheckCircle2 size={40} color="#34d399" />
                                </span>
                                <h3>{file.name}</h3>
                                <p>
                                    {(file.size / 1024 / 1024).toFixed(1)} MB •
                                    Click to change
                                </p>
                            </>
                        ) : (
                            <>
                                <span className="upload-zone-icon">
                                    <FolderOpen size={40} color="#818cf8" />
                                </span>
                                <h3>Drop your file here or click to browse</h3>
                                <p>
                                    {mode === "media"
                                        ? "MP3, WAV, MP4, WebM, MOV • Max 25MB"
                                        : "PDF, DOCX, PPTX • Max 25MB"}
                                </p>
                            </>
                        )}
                    </div>

                    {error && (
                        <div
                            className="alert alert-error"
                            style={{ marginTop: "16px" }}
                        >
                            {error}
                        </div>
                    )}

                    <div
                        style={{
                            display: "flex",
                            gap: "12px",
                            marginTop: "24px",
                        }}
                    >
                        <button
                            type="submit"
                            className="btn btn-primary btn-lg"
                            disabled={!file || !title.trim() || uploading}
                            style={{ flex: 1 }}
                        >
                            {uploading ? (
                                <>
                                    <span
                                        className="spinner"
                                        style={{
                                            width: 18,
                                            height: 18,
                                            borderWidth: 2,
                                        }}
                                    />{" "}
                                    Processing...
                                </>
                            ) : (
                                <>
                                    <ArrowUpFromLine size={18} /> Upload &amp;
                                    Process
                                </>
                            )}
                        </button>
                    </div>
                </form>

                <div
                    style={{
                        textAlign: "center",
                        marginTop: "20px",
                        color: "var(--text-muted)",
                        fontSize: "0.85rem",
                    }}
                >
                    Or{" "}
                    <Link
                        href="/record"
                        style={{ color: "var(--primary-400)" }}
                    >
                        <Mic
                            size={13}
                            style={{ display: "inline", verticalAlign: "-2px" }}
                        />{" "}
                        record a meeting directly
                    </Link>
                </div>
            </div>
        </div>
    );
}
