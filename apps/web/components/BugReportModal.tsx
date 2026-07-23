"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { buildBugReportUrl } from "../lib/bugReport";
import { XIcon } from "./icons";

interface BugReportModalProps {
  onClose: () => void;
  t: (key: any) => string;
}

export function BugReportModal({ onClose, t }: BugReportModalProps) {
  const pathname = usePathname();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    const url = buildBugReportUrl({ title: title.trim(), description, pathname: pathname ?? "" });
    window.open(url, "_blank", "noopener,noreferrer");
    onClose();
  }

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1100,
        backdropFilter: "blur(2px)",
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "90%",
          maxWidth: "480px",
          backgroundColor: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: "16px",
          boxShadow: "0 10px 25px rgba(0, 0, 0, 0.2)",
          padding: "20px",
          display: "flex",
          flexDirection: "column",
          maxHeight: "80vh",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
          <h3 style={{ margin: 0, fontSize: "16px", fontWeight: "600" }}>{t("navBugReport")}</h3>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              padding: "4px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--color-text-muted)",
              borderRadius: "50%",
              width: "28px",
              height: "28px",
              minHeight: "auto",
            }}
          >
            <XIcon size={16} />
          </button>
        </div>

        <p style={{ margin: "0 0 16px", fontSize: "12px", color: "var(--color-text-muted)", lineHeight: 1.5 }}>
          {t("bugReportHint")}
        </p>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "10px", overflow: "auto" }}>
          <div>
            <label style={{ fontSize: "13px", display: "block", marginBottom: "4px" }}>{t("bugReportTitleLabel")}</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("bugReportTitlePlaceholder")}
              autoFocus
              required
              style={{ width: "100%" }}
            />
          </div>
          <div>
            <label style={{ fontSize: "13px", display: "block", marginBottom: "4px" }}>{t("bugReportDescLabel")}</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("bugReportDescPlaceholder")}
              rows={5}
              style={{ width: "100%", resize: "vertical" }}
            />
          </div>
          <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
            <button type="submit" disabled={!title.trim()} style={{ flex: 1 }}>
              {t("bugReportSubmit")}
            </button>
            <button type="button" className="btn-secondary" onClick={onClose} style={{ flex: 1 }}>
              {t("cancel")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
