import type { Metadata } from "next";

export const metadata: Metadata = { title: "Доска задач — DCM Lab · job-hunter" };

export default function BoardLayout({ children }: { children: React.ReactNode }) {
  return children;
}
