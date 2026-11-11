import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "AI Office — DCM Lab и job-hunter",
};

export default function StreamLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
