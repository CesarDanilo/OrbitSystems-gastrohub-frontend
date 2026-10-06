export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 font-bold tracking-tight">
      <svg aria-hidden viewBox="0 0 32 32" className="size-8">
        <rect width="32" height="32" rx="9" fill="var(--brand)" />
        <path d="M8 13.5c0-3.6 3.6-6 8-6s8 2.4 8 6H8Z" fill="var(--brand-fg)" />
        <rect
          x="7"
          y="15.5"
          width="18"
          height="2.5"
          rx="1.25"
          fill="var(--brand-fg)"
          opacity=".75"
        />
        <path d="M8 20h16c0 2.5-2 4.5-4.5 4.5h-7C10 24.5 8 22.5 8 20Z" fill="var(--brand-fg)" />
      </svg>
      {!compact && <span className="text-lg">Hamburguerias</span>}
    </span>
  );
}
