import type { Metadata } from "next";
import { Geist_Mono, Noto_Sans_SC, Noto_Serif_SC } from "next/font/google";

import { AppNav } from "@/components/app-nav";
import { Providers } from "@/components/providers";
import "./globals.css";

const sans = Noto_Sans_SC({
  variable: "--font-sans-family",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
});

const heading = Noto_Serif_SC({
  variable: "--font-heading-family",
  subsets: ["latin"],
  weight: ["600", "700"],
  display: "swap",
});

const mono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "试玩邀",
  description: "按游戏管理试玩邀请：AI 起草，用你自己的邮箱发出。",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="zh-CN"
      className={`${sans.variable} ${heading.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Providers>
          <div className="flex min-h-full flex-col">
            <AppNav />
            <div className="flex-1">{children}</div>
          </div>
        </Providers>
      </body>
    </html>
  );
}
