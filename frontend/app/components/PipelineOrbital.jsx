"use client";
import { useState, useEffect, useRef } from "react";

/* ════════════════════ DESIGN TOKENS (mirrors page.js) ════════════════════ */
const C = {
  bg: "#FCFBF8", surface: "#FDFCFB", surfaceAlt: "#F4F0E6",
  border: "#E4E0DB", borderLight: "#F0EBE6",
  text: "#141C2E", textMd: "#585F6E", textLt: "#A1A4AB",
  accent: "#1892EA", accentLight: "#E4F2FD", accentMd: "#6AB5F1",
};
const F = {
  body: "var(--font-inter), -apple-system, sans-serif",
  mono: "var(--font-mono), 'Menlo', monospace",
};

/* ════════════════════ COMPONENT ════════════════════
 * Light-theme port of the 21st dev radial orbital timeline.
 * - Auto-rotates around a central hub
 * - Click a node to expand its detail card; related nodes pulse
 * - Click outside to collapse and resume auto-rotation
 */
export default function PipelineOrbital({ stages, height = 520, initialExpandedId = null }) {
  const [expandedId, setExpandedId] = useState(null);
  const [rotationAngle, setRotationAngle] = useState(0);
  const [autoRotate, setAutoRotate] = useState(true);
  const [pulseIds, setPulseIds] = useState({});
  const containerRef = useRef(null);
  const orbitRef = useRef(null);

  // Auto-expand a stage when opened with initialExpandedId (from topbar click).
  useEffect(() => {
    if (initialExpandedId == null) return;
    const idx = stages.findIndex((s) => s.id === initialExpandedId);
    if (idx === -1) return;
    const related = stages.find((s) => s.id === initialExpandedId)?.relatedIds || [];
    const next = {};
    related.forEach((rid) => { next[rid] = true; });
    setExpandedId(initialExpandedId);
    setPulseIds(next);
    setAutoRotate(false);
    const targetAngle = (idx / stages.length) * 360;
    setRotationAngle(270 - targetAngle);
  }, [initialExpandedId, stages]);

  useEffect(() => {
    if (!autoRotate) return;
    const t = setInterval(() => {
      setRotationAngle((a) => Number(((a + 0.25) % 360).toFixed(3)));
    }, 50);
    return () => clearInterval(t);
  }, [autoRotate]);

  const handleContainerClick = (e) => {
    if (e.target === containerRef.current || e.target === orbitRef.current) {
      setExpandedId(null);
      setPulseIds({});
      setAutoRotate(true);
    }
  };

  const toggleItem = (id) => {
    if (expandedId === id) {
      setExpandedId(null);
      setPulseIds({});
      setAutoRotate(true);
      return;
    }
    setExpandedId(id);
    setAutoRotate(false);
    const related = stages.find((s) => s.id === id)?.relatedIds || [];
    const next = {};
    related.forEach((rid) => { next[rid] = true; });
    setPulseIds(next);
    // Snap rotation so the clicked node moves to the top of the ring.
    const idx = stages.findIndex((s) => s.id === id);
    const targetAngle = (idx / stages.length) * 360;
    setRotationAngle(270 - targetAngle);
  };

  const calcPosition = (index, total) => {
    const angle = ((index / total) * 360 + rotationAngle) % 360;
    const radius = 180;
    const rad = (angle * Math.PI) / 180;
    const x = radius * Math.cos(rad);
    const y = radius * Math.sin(rad);
    const zIndex = Math.round(100 + 50 * Math.cos(rad));
    const opacity = Math.max(0.55, Math.min(1, 0.55 + 0.45 * ((1 + Math.sin(rad)) / 2)));
    return { x, y, zIndex, opacity };
  };

  return (
    <div
      ref={containerRef}
      onClick={handleContainerClick}
      style={{
        position: "relative",
        width: "100%",
        height,
        background: C.surface,
        border: `1px solid ${C.border}`,
        borderRadius: 16,
        overflow: "hidden",
        userSelect: "none",
      }}
    >
      {/* Top-left caption */}
      <div style={{
        position: "absolute", top: 18, left: 22, zIndex: 10,
        display: "flex", flexDirection: "column", gap: 2,
      }}>
        <div style={{ fontSize: 11, fontFamily: F.mono, color: C.textLt, letterSpacing: ".06em" }}>
          PIPELINE FLOW
        </div>
        <div style={{ fontSize: 14, fontFamily: F.body, fontWeight: 600, color: C.text }}>
          Click any stage to explore
        </div>
      </div>

      {/* Top-right hint */}
      <div style={{
        position: "absolute", top: 22, right: 22, zIndex: 10,
        fontSize: 10, fontFamily: F.mono, color: C.textLt, letterSpacing: ".06em",
      }}>
        {autoRotate ? "AUTO-ROTATE ON" : "PAUSED — CLICK BG TO RESUME"}
      </div>

      {/* Orbit stage */}
      <div
        ref={orbitRef}
        style={{
          position: "absolute", inset: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          perspective: "1000px",
        }}
      >
        {/* Outer orbit ring */}
        <div style={{
          position: "absolute",
          width: 380, height: 380, borderRadius: "50%",
          border: `1px dashed ${C.border}`,
          pointerEvents: "none",
        }} />
        <div style={{
          position: "absolute",
          width: 240, height: 240, borderRadius: "50%",
          border: `1px solid ${C.borderLight}`,
          pointerEvents: "none",
        }} />

        {/* Center hub */}
        <div style={{
          position: "absolute",
          width: 68, height: 68, borderRadius: "50%",
          background: `radial-gradient(circle at 30% 30%, ${C.accentMd}, ${C.accent})`,
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 5,
          boxShadow: `0 4px 18px ${C.accent}33`,
        }}>
          <div style={{
            position: "absolute", inset: -10, borderRadius: "50%",
            border: `1.5px solid ${C.accent}55`,
            animation: "orbitPing 2.2s cubic-bezier(0,0,0.2,1) infinite",
          }} />
          <div style={{
            position: "absolute", inset: -20, borderRadius: "50%",
            border: `1.5px solid ${C.accent}33`,
            animation: "orbitPing 2.2s cubic-bezier(0,0,0.2,1) 0.6s infinite",
          }} />
          <div style={{
            width: 28, height: 28, borderRadius: "50%",
            background: "#ffffff", opacity: 0.9,
          }} />
        </div>

        {/* Stage nodes */}
        {stages.map((stage, i) => {
          const pos = calcPosition(i, stages.length);
          const isExpanded = expandedId === stage.id;
          const isPulsing = !!pulseIds[stage.id];
          const isRelated = isPulsing;

          const nodeBg = isExpanded
            ? C.accent
            : isRelated ? C.accentLight : C.surface;
          const nodeBorder = isExpanded
            ? C.accent
            : isRelated ? C.accent : C.border;
          const nodeColor = isExpanded ? "#fff" : C.text;

          return (
            <div
              key={stage.id}
              style={{
                position: "absolute",
                transform: `translate(${pos.x}px, ${pos.y}px)`,
                zIndex: isExpanded ? 200 : pos.zIndex,
                opacity: isExpanded ? 1 : pos.opacity,
                transition: "transform .7s, opacity .7s",
                cursor: "pointer",
              }}
              onClick={(e) => { e.stopPropagation(); toggleItem(stage.id); }}
            >
              {/* Node bubble */}
              <div
                style={{
                  width: 46, height: 46, borderRadius: "50%",
                  background: nodeBg,
                  border: `2px solid ${nodeBorder}`,
                  color: nodeColor,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontFamily: F.body, fontWeight: 700, fontSize: 14,
                  transform: isExpanded ? "scale(1.25)" : "scale(1)",
                  transition: "transform .3s, background .3s, border-color .3s",
                  boxShadow: isExpanded
                    ? `0 6px 20px ${C.accent}33`
                    : isRelated ? `0 0 0 4px ${C.accentLight}` : "0 1px 4px rgba(0,0,0,.04)",
                  animation: isRelated ? "orbitPulse 1.4s ease-in-out infinite" : "none",
                  position: "relative",
                }}
              >
                <StageIcon kind={stage.icon} active={isExpanded} />
              </div>

              {/* Label under the node */}
              <div style={{
                position: "absolute",
                top: 56, left: "50%", transform: "translateX(-50%)",
                whiteSpace: "nowrap",
                fontSize: 11, fontFamily: F.body, fontWeight: 600,
                color: isExpanded ? C.accent : C.textMd,
                letterSpacing: ".03em",
                transition: "color .3s",
              }}>
                {stage.title}
              </div>

              {/* Expanded detail card */}
              {isExpanded && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    position: "absolute",
                    top: 88, left: "50%", transform: "translateX(-50%)",
                    width: 260,
                    background: C.surface,
                    border: `1px solid ${C.border}`,
                    borderRadius: 12,
                    padding: 14,
                    boxShadow: "0 12px 40px rgba(26,26,24,.12)",
                    animation: "slideUp .3s ease both",
                  }}
                >
                  {/* Connector line */}
                  <div style={{
                    position: "absolute",
                    top: -12, left: "50%", transform: "translateX(-50%)",
                    width: 1, height: 12, background: C.border,
                  }} />
                  <div style={{
                    display: "flex", justifyContent: "space-between",
                    alignItems: "center", marginBottom: 8,
                  }}>
                    <span style={{
                      fontSize: 9, fontFamily: F.mono, fontWeight: 700,
                      letterSpacing: ".08em",
                      color: C.accent, background: C.accentLight,
                      padding: "3px 8px", borderRadius: 4,
                    }}>
                      STAGE {i + 1}
                    </span>
                    <span style={{
                      fontSize: 10, fontFamily: F.mono, color: C.textLt,
                    }}>
                      {stage.duration || ""}
                    </span>
                  </div>

                  <div style={{
                    fontSize: 14, fontFamily: F.body, fontWeight: 700,
                    color: C.text, marginBottom: 4,
                  }}>
                    {stage.title}
                  </div>
                  <div style={{
                    fontSize: 12, fontFamily: F.body, color: C.textMd,
                    lineHeight: 1.55,
                  }}>
                    {stage.description}
                  </div>

                  {stage.relatedIds?.length > 0 && (
                    <div style={{
                      marginTop: 10, paddingTop: 10,
                      borderTop: `1px solid ${C.borderLight}`,
                    }}>
                      <div style={{
                        fontSize: 9, fontFamily: F.mono, fontWeight: 700,
                        letterSpacing: ".08em", color: C.textLt,
                        marginBottom: 6,
                      }}>
                        CONNECTED STAGES
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {stage.relatedIds.map((rid) => {
                          const r = stages.find((s) => s.id === rid);
                          if (!r) return null;
                          return (
                            <button
                              key={rid}
                              onClick={(e) => { e.stopPropagation(); toggleItem(rid); }}
                              style={{
                                display: "inline-flex", alignItems: "center", gap: 4,
                                background: "transparent",
                                border: `1px solid ${C.border}`,
                                color: C.textMd,
                                padding: "3px 8px", borderRadius: 4,
                                fontSize: 10, fontFamily: F.body, fontWeight: 500,
                                cursor: "pointer",
                                transition: "all .2s",
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.background = C.accentLight;
                                e.currentTarget.style.borderColor = C.accent;
                                e.currentTarget.style.color = C.accent;
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.background = "transparent";
                                e.currentTarget.style.borderColor = C.border;
                                e.currentTarget.style.color = C.textMd;
                              }}
                            >
                              {r.title} &rarr;
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ════════════════════ INLINE SVG ICONS ════════════════════
 * One path per stage — keeps the bundle zero-dependency.
 */
function StageIcon({ kind, active }) {
  const stroke = active ? "#fff" : C.textMd;
  const size = 18;
  const common = {
    width: size, height: size, viewBox: "0 0 24 24",
    fill: "none", stroke, strokeWidth: 2,
    strokeLinecap: "round", strokeLinejoin: "round",
  };
  switch (kind) {
    case "upload":
      return (
        <svg {...common}>
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
      );
    case "normalize":
      return (
        <svg {...common}>
          <line x1="4" y1="7" x2="20" y2="7" />
          <line x1="4" y1="12" x2="14" y2="12" />
          <line x1="4" y1="17" x2="18" y2="17" />
        </svg>
      );
    case "dedupe":
      return (
        <svg {...common}>
          <rect x="3" y="3" width="13" height="13" rx="2" />
          <rect x="8" y="8" width="13" height="13" rx="2" />
        </svg>
      );
    case "enrich":
      return (
        <svg {...common}>
          <polygon points="12 2 15 8.5 22 9.3 17 14 18.5 21 12 17.5 5.5 21 7 14 2 9.3 9 8.5 12 2" />
        </svg>
      );
    case "score":
      return (
        <svg {...common}>
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
      );
    case "export":
      return (
        <svg {...common}>
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
      );
    default:
      return null;
  }
}
