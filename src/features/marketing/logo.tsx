export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 font-bold tracking-tight">
      <svg aria-hidden viewBox="0 0 32 32" className="size-8">
        <rect width="32" height="32" rx="9" fill="var(--brand)" />
        <circle cx="16" cy="9" r="1.75" fill="var(--brand-fg)" />
        <path d="M7 20.5c0-5 4-9 9-9s9 4 9 9H7Z" fill="var(--brand-fg)" />
        <rect
          x="5.5"
          y="22"
          width="21"
          height="2.5"
          rx="1.25"
          fill="var(--brand-fg)"
          opacity=".75"
        />
      </svg>
      {!compact && <span className="text-lg">GastroHub</span>}
    </span>
  );
}
