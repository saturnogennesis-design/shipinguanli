import type { Metadata } from "next";
import "./globals.css";
import { BusinessContextProvider } from "./business-context";

export const metadata: Metadata = {
  title: "内容中台｜公司短视频管理平台",
  description: "局域网内的视频、图文、商品、审核与发布管理平台。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body><BusinessContextProvider>{children}</BusinessContextProvider></body></html>;
}
