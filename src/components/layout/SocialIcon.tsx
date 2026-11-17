/** Simple social glyphs (lucide no longer ships brand icons). Unknown networks fall back to the name's first letter. */
export function SocialIcon({ name, className = "size-[18px]" }: { name: string; className?: string }) {
  const n = name.toLowerCase();
  const common = { "aria-hidden": true, className, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;
  if (n.includes("instagram"))
    return (
      <svg {...common}>
        <rect x="3" y="3" width="18" height="18" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="17.5" cy="6.5" r="0.6" fill="currentColor" />
      </svg>
    );
  if (n.includes("facebook"))
    return (
      <svg {...common}>
        <path d="M15 3h-2.5A3.5 3.5 0 0 0 9 6.5V10H6.5v3.5H9V21h3.5v-7.5H15l.5-3.5h-3V7a1 1 0 0 1 1-1H15z" />
      </svg>
    );
  if (n.includes("youtube"))
    return (
      <svg {...common}>
        <rect x="2.5" y="5.5" width="19" height="13" rx="4" />
        <path d="m10.5 9.5 4 2.5-4 2.5z" fill="currentColor" />
      </svg>
    );
  if (n.includes("linkedin"))
    return (
      <svg {...common}>
        <rect x="3" y="3" width="18" height="18" rx="3" />
        <path d="M8 10.5V16M8 7.5v.01M12 16v-5.5M12 13a2.5 2.5 0 0 1 5 0v3" />
      </svg>
    );
  return (
    <span aria-hidden="true" className="text-sm font-bold">
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}
