import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Notebook RAG | Assignment 03",
  description: "A NotebookLM-style RAG app for document-grounded question answering.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
