"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const links = [
  { href: "/", label: "工作台" },
  { href: "/history", label: "记录" },
  { href: "/ai", label: "AI" },
] as const;

export function AppNav() {
  const pathname = usePathname();
  return (
    <header className="paper-desk border-b border-foreground/10">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <Link href="/" className="font-heading text-lg tracking-tight">
          试玩邀
        </Link>
        <nav className="flex rounded-full bg-card p-1 ring-1 ring-foreground/10">
          {links.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "rounded-full px-4 py-1.5 text-sm transition-colors",
                  active ? "bg-primary text-primary-foreground" : "hover:bg-muted",
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
