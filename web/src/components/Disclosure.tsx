"use client"

import { useState, type ReactNode } from "react"

interface DisclosureProps {
  title: ReactNode
  defaultOpen?: boolean
  children: ReactNode
  /** Optional content always shown next to the title, even when collapsed
   *  (e.g. a one-line plain-language summary of what's inside). */
  summary?: ReactNode
}

/** A labeled, collapsible section. Nothing inside `children` is ever
 *  removed from the page — it's only hidden until the person clicks to
 *  expand it, so no information is lost, it's just not shown by default. */
export default function Disclosure({ title, defaultOpen = false, children, summary }: DisclosureProps) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 rounded py-0.5 text-left hover:opacity-90"
      >
        <span className="term">{title}</span>
        <span className="flex items-center gap-2">
          {summary}
          <span className="whitespace-nowrap text-[10px] text-[var(--accent)]">
            {open ? "Hide details −" : "Show details +"}
          </span>
        </span>
      </button>
      {open && <div className="pt-1.5">{children}</div>}
    </div>
  )
}
