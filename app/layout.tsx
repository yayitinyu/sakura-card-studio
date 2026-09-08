import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Sakura Card Studio",
  description: "角色与世界的创作工作台",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
