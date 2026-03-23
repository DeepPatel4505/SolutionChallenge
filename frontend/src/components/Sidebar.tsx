"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { LayoutDashboard, Upload, Mic, BarChart3, LogOut, Menu, X } from "lucide-react";

const navLinks = [
    { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
    { href: "/upload", icon: Upload, label: "Upload Knowledge" },
    { href: "/record", icon: Mic, label: "Record Meeting" },
    { href: "/analytics", icon: BarChart3, label: "Knowledge Analytics" },
];

export default function Sidebar() {
    const pathname = usePathname();
    const router = useRouter();
    const [isOpen, setIsOpen] = useState(false);
    const [userEmail, setUserEmail] = useState("");

    useEffect(() => {
        const email = localStorage.getItem("user_email") || "";
        setUserEmail(email);
    }, []);

    const handleLogout = () => {
        localStorage.removeItem("token");
        localStorage.removeItem("user_email");
        router.push("/login");
    };

    return (
        <>
            <button className="sidebar-toggle" onClick={() => setIsOpen(!isOpen)}>
                {isOpen ? <X size={20} /> : <Menu size={20} />}
            </button>

            <div className={`sidebar-overlay ${isOpen ? "open" : ""}`} onClick={() => setIsOpen(false)} />

            <aside className={`sidebar ${isOpen ? "open" : ""}`}>
                <div className="sidebar-logo">KnowledgeFlow</div>

                <nav className="sidebar-nav">
                    <div className="sidebar-section-title">Main</div>
                    {navLinks.map((link) => {
                        const Icon = link.icon;
                        return (
                            <Link
                                key={link.href}
                                href={link.href}
                                className={`sidebar-link ${pathname === link.href ? "active" : ""}`}
                                onClick={() => setIsOpen(false)}
                            >
                                <span className="sidebar-link-icon"><Icon size={18} /></span>
                                {link.label}
                            </Link>
                        );
                    })}
                </nav>

                <div className="sidebar-footer">
                    {userEmail && (
                        <div className="sidebar-user" style={{ marginBottom: "12px" }}>
                            <div className="sidebar-avatar">{userEmail[0]?.toUpperCase()}</div>
                            <div className="sidebar-user-info">
                                <div className="sidebar-user-email">{userEmail}</div>
                            </div>
                        </div>
                    )}
                    <button className="btn btn-ghost btn-sm" style={{ width: "100%" }} onClick={handleLogout}>
                        <LogOut size={16} /> Sign Out
                    </button>
                </div>
            </aside>
        </>
    );
}
