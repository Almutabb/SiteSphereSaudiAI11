import { useState, useRef, useCallback } from "react";

const OPENAI_API_KEY = "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";
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

const GOLD = "#C9A84C";
const GOLD_DARK = "#A8873A";
const GOLD_LIGHT = "#E2C06A";

const RISK_COLORS = {
  CRITICAL: { bg: "#FF0000", text: "#FFFFFF", label: "CRITICAL" },
  HIGH:     { bg: "#CC4400", text: "#FFFFFF", label: "HIGH" },
  MEDIUM:   { bg: "#C9A84C", text: "#000000", label: "MEDIUM" },
  LOW:      { bg: "#00AA44", text: "#FFFFFF", label: "LOW" },
};

function riskColor(level) {
  return RISK_COLORS[level] || { bg: "#555555", text: "#FFFFFF", label: level || "UNKNOWN" };
}

function cleanText(text) {
  if (!text) return "";
  return text.replace(/[*#`_~]/g, "").replace(/\n{3,}/g, "\n\n").trim();
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function parseAnalysis(text, fileName) {
  const get = (label) => {
    const re = new RegExp(label + ":[\\s\\r\\n]+([\\s\\S]*?)(?=\\n[A-Z ]+:|$)", "i");
    const m = text.match(re);
    return m ? m[1].trim() : "Not specified";
  };
  return {
    fileName,
    violationTitle: get("VIOLATION TITLE"),
    violationDescription: get("VIOLATION DESCRIPTION"),
    regulatoryReference: get("REGULATORY REFERENCE"),
    riskLevel: get("RISK LEVEL").toUpperCase(),
    riskJustification: get("RISK JUSTIFICATION"),
    requiredAction: get("REQUIRED ACTION"),
    immediateStopWork: get("IMMEDIATE STOP-WORK").toUpperCase().startsWith("YES"),
  };
}
async function analyseImage(base64, mediaType, fileName) {
  const systemPrompt = "You are a certified industrial safety auditor specialising in OSHA and HCIS standards. Analyse the provided construction site photo and produce a structured audit report. Respond ONLY in plain text. No asterisks, no hashtags, no markdown, no bullet dashes.";

  const userPrompt = [
    "Audit this construction site photo and use this exact format:",
    "",
    "VIOLATION TITLE:",
    "concise title max 10 words",
    "",
    "VIOLATION DESCRIPTION:",
    "2-3 sentences describing exactly what is visually wrong",
    "",
    "REGULATORY REFERENCE:",
    "specific OSHA or HCIS standard number and name",
    "",
    "RISK LEVEL:",
    "one of CRITICAL or HIGH or MEDIUM or LOW",
    "",
    "RISK JUSTIFICATION:",
    "1-2 sentences explaining the risk level",
    "",
    "REQUIRED ACTION:",
    "clear actionable corrective steps in 2-3 sentences",
    "",
    "IMMEDIATE STOP-WORK:",
    "YES or NO",
  ].join("\n");

  const response = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + OPENAI_API_KEY,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      max_tokens: 1000,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: "data:" + mediaType + ";base64," + base64 } },
            { type: "text", text: userPrompt },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message || "API error " + response.status);
  }

  const data = await response.json();
  const raw = data.choices?.[0]?.message?.content || "";
  return parseAnalysis(cleanText(raw), fileName);
}

async function generatePDF(findings, imageDataURLs) {
  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const critCount = findings.filter((f) => f.riskLevel === "CRITICAL").length;
  const highCount = findings.filter((f) => f.riskLevel === "HIGH").length;
  const medCount  = findings.filter((f) => f.riskLevel === "MEDIUM").length;
  const lowCount  = findings.filter((f) => f.riskLevel === "LOW").length;

  const findingPages = findings.map((f, i) => {
    const rc = riskColor(f.riskLevel);
    const img = imageDataURLs[i] || "";
    const stopBadge = f.immediateStopWork
      ? '<div style="background:#FF0000;color:#fff;font-size:13px;font-weight:900;padding:10px 20px;display:inline-block;margin-bottom:24px;">IMMEDIATE STOP-WORK REQUIRED</div>'
      : "";
    return [
      '<div class="page finding-page">',
      '<div class="page-header">',
      '<div class="header-logo">SAFE<span>SPHERE</span></div>',
      '<div class="header-right">',
      '<div class="header-label">SAFETY AUDIT REPORT</div>',
      '<div class="header-sub">Finding ' + (i + 1) + ' of ' + findings.length + '</div>',
      '</div></div>',
      '<div class="finding-number">FINDING ' + String(i + 1).padStart(2, "0") + '</div>',
      '<div class="finding-title">' + f.violationTitle.toUpperCase() + '</div>',
      stopBadge,
      '<div class="two-col">',
      '<div class="photo-box">',
      img ? '<img src="' + img + '" style="width:100%;height:100%;object-fit:cover;" />' : '<div style="color:#666;font-size:12px;padding:20px;">NO IMAGE</div>',
      '<div class="photo-label">' + f.fileName + '</div>',
      '</div>',
      '<div class="meta-box">',
      '<div class="risk-badge" style="background:' + rc.bg + ';color:' + rc.text + ';">RISK LEVEL: ' + rc.label + '</div>',
      '<div class="meta-row"><span class="meta-label">REF</span><span class="meta-val">' + f.regulatoryReference + '</span></div>',
      f.immediateStopWork ? '<div class="meta-row"><span class="meta-label">STOP WORK</span><span class="meta-val" style="color:#FF0000;font-weight:900;">YES</span></div>' : '',
      '</div></div>',
      '<div class="section-grid">',
      '<div class="section-card"><div class="section-label">VIOLATION DESCRIPTION</div><div class="section-body">' + f.violationDescription + '</div></div>',
      '<div class="section-card"><div class="section-label">RISK JUSTIFICATION</div><div class="section-body">' + f.riskJustification + '</div></div>',
      '<div class="section-card wide"><div class="section-label">REQUIRED CORRECTIVE ACTION</div><div class="section-body action-body">' + f.requiredAction + '</div></div>',
      '</div>',
      '<div class="page-footer">',
      '<span>SAFESPHERE AI AUDIT SYSTEM</span>',
      '<span>CONFIDENTIAL</span>',
      '<span>' + today + '</span>',
      '</div></div>',
    ].join("");
  }).join("");

  const coverHtml = [
    '<div class="page cover">',
    '<div class="cover-accent"></div>',
    '<div class="cover-body">',
    '<div class="cover-logo">SAFE<span>SPHERE</span></div>',
    '<div class="cover-tagline">AI-Powered Industrial Safety Auditing System</div>',
    '<div class="cover-title">Construction Site Safety Audit Report</div>',
    '<div class="cover-subtitle">Automated Violation Analysis — OSHA / HCIS Compliance</div>',
    '<div class="cover-stats">',
    '<div class="stat-card"><div class="stat-number" style="color:#ccc;">' + findings.length + '</div><div class="stat-label">Total</div></div>',
    '<div class="stat-card"><div class="stat-number" style="color:#FF0000;">' + critCount + '</div><div class="stat-label">Critical</div></div>',
    '<div class="stat-card"><div class="stat-number" style="color:#CC4400;">' + highCount + '</div><div class="stat-label">High</div></div>',
    '<div class="stat-card"><div class="stat-number" style="color:#C9A84C;">' + medCount + '</div><div class="stat-label">Medium</div></div>',
    '<div class="stat-card"><div class="stat-number" style="color:#00AA44;">' + lowCount + '</div><div class="stat-label">Low</div></div>',
    '</div>',
    '<div class="cover-meta">',
    '<div class="cover-meta-row"><span class="cover-meta-key">Report Date</span><span class="cover-meta-val">' + today + '</span></div>',
    '<div class="cover-meta-row"><span class="cover-meta-key">Standards Applied</span><span class="cover-meta-val">OSHA 29 CFR 1926 / HCIS</span></div>',
    '<div class="cover-meta-row"><span class="cover-meta-key">Classification</span><span class="cover-meta-val">CONFIDENTIAL</span></div>',
    '</div></div></div>',
  ].join("");

  const css = [
    "@import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;700;900&family=Barlow:wght@400;500;600&display=swap');",
    "*{box-sizing:border-box;margin:0;padding:0;}",
    "body{background:#1a1a1a;font-family:'Barlow',sans-serif;}",
    ".page{width:210mm;min-height:297mm;background:#0d0d0d;color:#e8e8e8;margin:0 auto 20px;page-break-after:always;position:relative;overflow:hidden;}",
    ".cover{display:flex;flex-direction:column;}",
    ".cover-accent{height:8px;background:linear-gradient(90deg,#C9A84C,#A8873A);}",
    ".cover-body{padding:60px 56px;flex:1;display:flex;flex-direction:column;}",
    ".cover-logo{font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:56px;letter-spacing:6px;color:#fff;margin-bottom:4px;}",
    ".cover-logo span{color:#C9A84C;}",
    ".cover-tagline{font-size:11px;letter-spacing:5px;color:#888;text-transform:uppercase;margin-bottom:40px;}",
    ".cover-title{font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:48px;line-height:1;color:#fff;text-transform:uppercase;margin-bottom:12px;}",
    ".cover-subtitle{font-size:13px;letter-spacing:4px;color:#C9A84C;text-transform:uppercase;margin-bottom:40px;}",
    ".cover-stats{display:flex;gap:16px;margin-bottom:40px;}",
    ".stat-card{flex:1;padding:16px;border:1px solid #333;}",
    ".stat-number{font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:40px;line-height:1;}",
    ".stat-label{font-size:10px;letter-spacing:3px;color:#888;text-transform:uppercase;margin-top:4px;}",
    ".cover-meta{margin-top:auto;}",
    ".cover-meta-row{display:flex;justify-content:space-between;padding:10px 0;border-top:1px solid #222;}",
    ".cover-meta-key{font-size:10px;letter-spacing:3px;color:#555;text-transform:uppercase;}",
    ".cover-meta-val{font-size:12px;color:#aaa;}",
    ".page-header{display:flex;justify-content:space-between;align-items:center;padding:20px 32px;background:#111;border-bottom:3px solid #C9A84C;}",
    ".header-logo{font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:22px;letter-spacing:4px;color:#fff;}",
    ".header-logo span{color:#C9A84C;}",
    ".header-label{font-size:9px;letter-spacing:4px;color:#C9A84C;text-transform:uppercase;}",
    ".header-sub{font-size:11px;color:#666;margin-top:2px;text-align:right;}",
    ".finding-number{padding:20px 32px 0;font-weight:900;font-size:11px;letter-spacing:5px;color:#C9A84C;}",
    ".finding-title{padding:6px 32px 16px;font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:30px;color:#fff;line-height:1.05;}",
    ".two-col{display:flex;padding:0 32px 16px;gap:16px;}",
    ".photo-box{width:200px;height:150px;flex-shrink:0;background:#111;border:1px solid #333;position:relative;overflow:hidden;}",
    ".photo-label{position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,0.75);font-size:8px;color:#aaa;padding:4px 6px;}",
    ".meta-box{flex:1;display:flex;flex-direction:column;gap:10px;}",
    ".risk-badge{font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:16px;letter-spacing:3px;padding:8px 14px;display:inline-block;}",
    ".meta-row{display:flex;gap:12px;align-items:flex-start;}",
    ".meta-label{font-size:9px;letter-spacing:3px;color:#555;text-transform:uppercase;min-width:64px;}",
    ".meta-val{font-size:12px;color:#ccc;line-height:1.4;}",
    ".section-grid{padding:0 32px;display:grid;grid-template-columns:1fr 1fr;gap:10px;}",
    ".section-card{background:#111;border:1px solid #222;border-left:3px solid #C9A84C;padding:12px 14px;}",
    ".section-card.wide{grid-column:1/-1;border-left-color:#FF0000;}",
    ".section-label{font-size:9px;letter-spacing:3px;color:#C9A84C;text-transform:uppercase;margin-bottom:6px;font-weight:700;}",
    ".section-body{font-size:11px;color:#ccc;line-height:1.6;}",
    ".action-body{font-size:11px;color:#e8e8e8;font-weight:500;}",
    ".page-footer{position:absolute;bottom:0;left:0;right:0;display:flex;justify-content:space-between;padding:10px 32px;background:#050505;border-top:1px solid #222;font-size:8px;letter-spacing:2px;color:#444;text-transform:uppercase;}",
    "@media print{body{background:#0d0d0d;}.page{margin:0;page-break-after:always;}}",
  ].join("");

  const html = '<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>SafeSphere Audit Report</title><style>' + css + '</style></head><body>' + coverHtml + findingPages + '</body></html>';
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank");
  if (win) { win.focus(); setTimeout(() => win.print(), 1500); }
}
export default function SafeSphereAuditor() {
  const [files, setFiles] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [status, setStatus] = useState("idle");
  const [findings, setFindings] = useState([]);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [dragging, setDragging] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const inputRef = useRef();

  const handleFiles = useCallback(async (newFiles) => {
    const accepted = Array.from(newFiles).filter((f) => f.type.startsWith("image/"));
    if (!accepted.length) return;
    setFiles(accepted);
    const urls = await Promise.all(accepted.map(fileToDataURL));
    setPreviews(urls);
    setFindings([]);
    setStatus("idle");
    setErrorMsg("");
  }, []);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const removeFile = (i) => {
    setFiles((f) => f.filter((_, idx) => idx !== i));
    setPreviews((p) => p.filter((_, idx) => idx !== i));
  };

  const runAudit = async () => {
    if (!files.length) return;
    setStatus("analysing");
    setFindings([]);
    setErrorMsg("");
    setProgress({ current: 0, total: files.length });
    const results = [];
    for (let i = 0; i < files.length; i++) {
      setProgress({ current: i + 1, total: files.length });
      try {
        const b64 = await fileToBase64(files[i]);
        const result = await analyseImage(b64, files[i].type || "image/jpeg", files[i].name);
        results.push(result);
      } catch (err) {
        results.push({
          fileName: files[i].name,
          violationTitle: "Analysis Failed",
          violationDescription: err.message,
          regulatoryReference: "N/A",
          riskLevel: "UNKNOWN",
          riskJustification: "Could not process image.",
          requiredAction: "Re-upload or check image format.",
          immediateStopWork: false,
        });
      }
    }
    setFindings(results);
    setStatus("done");
  };

  const counts = findings.reduce((acc, f) => {
    acc[f.riskLevel] = (acc[f.riskLevel] || 0) + 1;
    return acc;
  }, {});
  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", color: "#e0e0e0", fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif" }}>

      <header style={{ background: "#0d0d0d", borderBottom: "3px solid " + GOLD, padding: "20px 32px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: "36px", fontWeight: 900, letterSpacing: "6px", color: "#fff", lineHeight: 1 }}>
            SAFE<span style={{ color: GOLD }}>SPHERE</span>
          </div>
          <div style={{ fontSize: "10px", letterSpacing: "5px", color: "#555", marginTop: "4px" }}>AI INDUSTRIAL SAFETY AUDITOR — POWERED BY GPT-4o</div>
        </div>
        <div style={{ fontSize: "9px", letterSpacing: "3px", color: GOLD, border: "1px solid " + GOLD, padding: "6px 12px" }}>OSHA · HCIS · ISO 45001</div>
      </header>

      <div style={{ padding: "32px", maxWidth: "960px", margin: "0 auto" }}>

        {status !== "done" && (
          <div
            style={{ border: "2px dashed " + (dragging ? GOLD : "#333"), background: dragging ? "#1a1500" : "#111", borderRadius: "2px", padding: "60px 40px", textAlign: "center", cursor: "pointer", transition: "all 0.2s", marginBottom: "24px" }}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
          >
            <input ref={inputRef} type="file" multiple accept="image/*" style={{ display: "none" }} onChange={(e) => handleFiles(e.target.files)} />
            <div style={{ fontSize: "40px", marginBottom: "12px", color: GOLD }}>⬆</div>
            <div style={{ fontSize: "22px", fontWeight: 900, letterSpacing: "4px", color: "#fff", marginBottom: "8px" }}>DROP SITE PHOTOS HERE</div>
            <div style={{ fontSize: "12px", letterSpacing: "2px", color: "#555" }}>
              {files.length > 0 ? files.length + " image" + (files.length > 1 ? "s" : "") + " selected" : "JPEG, PNG, WEBP — Multiple files accepted"}
            </div>
          </div>
        )}

        {previews.length > 0 && status !== "done" && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", marginBottom: "24px" }}>
            {previews.map((src, i) => (
              <div key={i} style={{ position: "relative", width: "120px", border: "1px solid #222", background: "#111", overflow: "hidden" }}>
                <img src={src} alt="" style={{ width: "120px", height: "80px", objectFit: "cover", display: "block" }} />
                <div style={{ fontSize: "9px", color: "#555", padding: "4px 6px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{files[i]?.name}</div>
                <button style={{ position: "absolute", top: "4px", right: "4px", background: "rgba(0,0,0,0.8)", color: GOLD, border: "none", cursor: "pointer", fontSize: "10px", padding: "2px 5px" }}
                  onClick={(e) => { e.stopPropagation(); removeFile(i); }}>X</button>
              </div>
            ))}
          </div>
        )}

        {files.length > 0 && status === "idle" && (
          <button
            style={{ width: "100%", padding: "20px", background: "linear-gradient(90deg," + GOLD + "," + GOLD_DARK + ")", color: "#000", border: "none", cursor: "pointer", fontSize: "18px", fontWeight: 900, letterSpacing: "4px", display: "flex", alignItems: "center", justifyContent: "center", gap: "12px", fontFamily: "'Barlow Condensed',Arial,sans-serif", marginBottom: "24px" }}
            onClick={runAudit}
          >
            RUN AI SAFETY AUDIT — {files.length} IMAGE{files.length > 1 ? "S" : ""}
          </button>
        )}

        {status === "analysing" && (
          <div style={{ background: "#111", border: "1px solid #222", padding: "32px", textAlign: "center", marginBottom: "24px" }}>
            <div style={{ fontSize: "14px", fontWeight: 900, letterSpacing: "4px", color: GOLD, marginBottom: "16px" }}>
              ANALYSING IMAGE {progress.current} OF {progress.total}
            </div>
            <div style={{ height: "6px", background: "#222", borderRadius: "3px", overflow: "hidden", marginBottom: "12px" }}>
              <div style={{ height: "100%", background: "linear-gradient(90deg," + GOLD + "," + GOLD_DARK + ")", transition: "width 0.4s ease", width: (progress.total ? (progress.current / progress.total) * 100 : 0) + "%" }} />
            </div>
            <div style={{ fontSize: "10px", letterSpacing: "3px", color: "#444" }}>AI auditing in progress — please wait</div>
          </div>
        )}

        {errorMsg && (
          <div style={{ background: "#200", border: "1px solid #FF0000", color: "#FF8888", padding: "20px", fontSize: "13px", marginBottom: "24px" }}>{errorMsg}</div>
        )}

        {status === "done" && findings.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

            <div style={{ background: "#111", border: "1px solid #222", padding: "20px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px", borderLeft: "4px solid " + GOLD }}>
              <div style={{ fontSize: "16px", fontWeight: 900, letterSpacing: "3px", color: "#fff" }}>
                AUDIT COMPLETE — {findings.length} FINDING{findings.length > 1 ? "S" : ""}
              </div>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {Object.entries(RISK_COLORS).map(([level, col]) => counts[level] ? (
                  <div key={level} style={{ padding: "4px 12px", fontSize: "11px", fontWeight: 900, letterSpacing: "2px", background: col.bg, color: col.text }}>
                    {counts[level]} {level}
                  </div>
                ) : null)}
              </div>
            </div>

            {findings.map((f, i) => {
              const rc = riskColor(f.riskLevel);
              return (
                <div key={i} style={{ background: "#0f0f0f", border: "1px solid #1e1e1e", borderLeft: "4px solid " + GOLD, overflow: "hidden" }}>
                  <div style={{ padding: "16px 20px", background: "#111", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px" }}>
                    <div>
                      <div style={{ fontSize: "9px", letterSpacing: "4px", color: GOLD, marginBottom: "4px" }}>FINDING {String(i + 1).padStart(2, "0")}</div>
                      <div style={{ fontSize: "20px", fontWeight: 900, color: "#fff", letterSpacing: "1px", textTransform: "uppercase" }}>{f.violationTitle}</div>
                    </div>
                    <div style={{ padding: "6px 14px", fontSize: "12px", fontWeight: 900, letterSpacing: "2px", whiteSpace: "nowrap", background: rc.bg, color: rc.text }}>{rc.label}</div>
                  </div>
                  <div style={{ display: "flex" }}>
                    <div style={{ width: "180px", flexShrink: 0, background: "#000", position: "relative", overflow: "hidden", minHeight: "140px" }}>
                      {previews[i] && <img src={previews[i]} alt="" style={{ width: "180px", height: "140px", objectFit: "cover", display: "block" }} />}
                      <div style={{ fontSize: "8px", color: "#444", padding: "4px 6px", background: "#050505", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.fileName}</div>
                    </div>
                    <div style={{ flex: 1, padding: "16px 20px", display: "flex", flexDirection: "column", gap: "12px" }}>
                      <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                        <span style={{ fontSize: "8px", letterSpacing: "3px", color: GOLD, textTransform: "uppercase", minWidth: "100px" }}>REGULATORY REF</span>
                        <span style={{ fontSize: "12px", color: "#ccc" }}>{f.regulatoryReference}</span>
                      </div>
                      {f.immediateStopWork && (
                        <div style={{ background: "#FF0000", color: "#fff", fontSize: "10px", fontWeight: 900, letterSpacing: "2px", padding: "4px 10px", display: "inline-block", width: "fit-content" }}>IMMEDIATE STOP-WORK</div>
                      )}
                      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                        <span style={{ fontSize: "8px", letterSpacing: "3px", color: GOLD, textTransform: "uppercase" }}>VIOLATION</span>
                        <div style={{ fontSize: "12px", color: "#aaa", lineHeight: 1.6 }}>{f.violationDescription}</div>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                        <span style={{ fontSize: "8px", letterSpacing: "3px", color: GOLD, textTransform: "uppercase" }}>REQUIRED ACTION</span>
                        <div style={{ fontSize: "12px", color: GOLD_LIGHT, lineHeight: 1.6 }}>{f.requiredAction}</div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            <button
              style={{ width: "100%", padding: "18px", background: "#0d0d0d", color: GOLD, border: "2px solid " + GOLD, cursor: "pointer", fontSize: "16px", fontWeight: 900, letterSpacing: "3px", display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", fontFamily: "'Barlow Condensed',Arial,sans-serif", marginTop: "8px" }}
              onClick={() => generatePDF(findings, previews)}
            >
              DOWNLOAD FULL AUDIT REPORT (PDF)
            </button>
            <div style={{ textAlign: "center", fontSize: "10px", color: "#444", letterSpacing: "2px", marginTop: "8px" }}>
              A print-ready report will open — use Print then Save as PDF
            </div>
            <button
              style={{ background: "transparent", color: "#444", border: "1px solid #222", cursor: "pointer", padding: "12px 24px", fontSize: "12px", letterSpacing: "3px", fontFamily: "'Barlow Condensed',Arial,sans-serif", alignSelf: "center", marginTop: "8px" }}
              onClick={() => { setFiles([]); setPreviews([]); setFindings([]); setStatus("idle"); }}
            >
              NEW AUDIT
            </button>
          </div>
        )}
      </div>
    </div>
  );
}