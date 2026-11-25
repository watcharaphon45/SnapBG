import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SnapBG — Client-Side AI Background Remover",
  description:
    "Remove image backgrounds 100% locally in your browser with AI. Zero uploads, complete privacy, powered by WebGPU and WebAssembly.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased bg-white text-slate-900 min-h-screen">
        {children}
      </body>
    </html>
  );
}
