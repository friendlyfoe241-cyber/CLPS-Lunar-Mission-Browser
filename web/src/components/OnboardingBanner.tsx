"use client"

import { useEffect, useState } from "react"

const STORAGE_KEY = "lunasight_onboarded_v1"

/** Short, dismissible orientation banner shown on a person's first visit.
 *  Explains what the tool is for in plain language before they hit any
 *  jargon. Remembers the dismissal in localStorage so it doesn't nag on
 *  return visits; if localStorage is unavailable (e.g. private browsing)
 *  it simply shows once per page load instead of crashing. */
export default function OnboardingBanner() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // One-time check of a persisted dismissal flag. Starts hidden (matching
    // the server-rendered markup) and only reveals itself post-mount if the
    // person hasn't dismissed it before — so there's no hydration mismatch.
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of a persisted flag, not a state sync loop
      if (!window.localStorage.getItem(STORAGE_KEY)) setVisible(true)
    } catch {
      setVisible(true)
    }
  }, [])

  const dismiss = () => {
    setVisible(false)
    try {
      window.localStorage.setItem(STORAGE_KEY, "1")
    } catch {
      // localStorage unavailable — nothing to persist, just hide for this session
    }
  }

  if (!visible) return null

  return (
    <div className="luna-panel flex flex-col gap-2 border-[var(--accent)]/40 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="text-[13px] font-semibold text-[var(--foreground)]">
          Welcome to LunaSight 👋
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss welcome message"
          className="shrink-0 rounded px-1.5 text-[13px] text-[var(--dim)] hover:text-[var(--foreground)]"
        >
          ✕
        </button>
      </div>
      <p className="text-[12px] text-[var(--muted)]">
        This tool helps you check, for any lunar south-pole landing site, when the Sun will be up
        (power) and when the site can talk directly to Earth (communication) — using real NASA
        terrain and orbital data.
      </p>
      <ul className="ml-4 list-disc text-[12px] text-[var(--muted)]">
        <li>
          Pick a site from the list on the left, click one on the map, or spin the{" "}
          <strong className="text-[var(--foreground)]">3D Globe</strong> view.
        </li>
        <li>
          The card above the map gives you the quick answer — click{" "}
          <span className="text-[var(--accent)]">“Show details”</span> anywhere for the full numbers.
        </li>
        <li>Use the clock and date range on the left to see how conditions change over time.</li>
      </ul>
      <button
        type="button"
        onClick={dismiss}
        className="self-start rounded border border-[var(--accent)] px-2 py-1 text-[11px] text-[var(--accent)] hover:bg-[var(--accent)]/10"
      >
        Got it
      </button>
    </div>
  )
}
