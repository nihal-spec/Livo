import Link from "next/link";
import { Suspense } from "react";
import { FolderHeart, Sparkles } from "lucide-react";
import { AuthStatus } from "@/components/patterns/AuthStatus.js";

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2" aria-label="Livo home">
      <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
          <path d="M4 11.5 12 5l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5h-5v5H5a1 1 0 0 1-1-1v-7.5Z" strokeLinejoin="round" />
        </svg>
      </span>
      <span className="text-lg font-bold tracking-tight text-ink">Livo</span>
    </Link>
  );
}

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        <Logo />
        <nav className="flex items-center gap-1 sm:gap-2">
          <Link
            href="/intake"
            className="hidden items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 sm:inline-flex"
          >
            <Sparkles className="h-4 w-4 text-brand-600" aria-hidden />
            Describe your trip
          </Link>
          <Link
            href="/plans"
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            <FolderHeart className="h-4 w-4 text-brand-600" aria-hidden />
            My plans
          </Link>
          <Suspense fallback={null}>
            <AuthStatus />
          </Suspense>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-10 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Logo />
          <span className="hidden sm:inline">Know what living near work will actually cost, before you move.</span>
        </div>
        <p>Kochi · Every price shows where it came from.</p>
      </div>
    </footer>
  );
}
