"use client"

/** A small "?" badge that reveals a plain-language explanation on hover or
 *  keyboard focus. Used to explain a technical term right where it appears,
 *  instead of requiring a separate "simple mode" that hides the real data. */
export default function InfoTip({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex items-center align-middle">
      <span
        tabIndex={0}
        role="note"
        aria-label={text}
        className="ml-1 inline-flex h-3.5 w-3.5 shrink-0 cursor-help items-center justify-center rounded-full border border-[var(--dim)] text-[9px] font-semibold leading-none text-[var(--dim)] outline-none transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)] focus-visible:border-[var(--accent)] focus-visible:text-[var(--accent)]"
      >
        ?
      </span>
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 top-full z-30 mt-1.5 w-52 -translate-x-1/2 rounded-md border border-[var(--border)] bg-[var(--panel-2)] p-2 text-[11px] font-normal normal-case leading-snug tracking-normal text-[var(--foreground)] opacity-0 shadow-lg transition-opacity duration-100 group-hover:opacity-100 group-focus-within:opacity-100"
      >
        {text}
      </span>
    </span>
  )
}
