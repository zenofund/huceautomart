interface WatermarkOverlayProps {
  text?: string;
}

const POSITIONS = [
  { left: "24%", top: "30%" },
  { left: "72%", top: "22%" },
  { left: "22%", top: "68%" },
  { left: "70%", top: "72%" },
];

export function WatermarkOverlay({ text = "HUCE AUTOMART" }: WatermarkOverlayProps) {
  return (
    <div
      aria-hidden
      className="absolute inset-0 pointer-events-none overflow-hidden select-none z-10"
    >
      {POSITIONS.map((pos, i) => (
        <span
          key={i}
          className="absolute text-white/25 font-black uppercase tracking-[4px] whitespace-nowrap"
          style={{
            left: pos.left,
            top: pos.top,
            transform: "translate(-50%, -50%) rotate(-32deg)",
            fontSize: "clamp(7px, 1.4vw, 13px)",
            textShadow: "0 1px 3px rgba(0,0,0,0.45), 0 0 8px rgba(0,0,0,0.2)",
            fontFamily: "system-ui, -apple-system, sans-serif",
          }}
        >
          {text}
        </span>
      ))}
    </div>
  );
}
