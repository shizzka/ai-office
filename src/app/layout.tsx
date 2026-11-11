import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Office — DCM Lab и job-hunter",
  description: "Рабочая команда DCM Lab и job-hunter: статусы, конвейер и ревью.",
  icons: {
    icon: "/favicon.ico",
  },
  openGraph: {
    title: "AI Office — DCM Lab и job-hunter",
    description: "Рабочая команда DCM Lab и job-hunter: статусы, конвейер и ревью.",
    type: "website",
    locale: "ru_RU",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru" className="dark">
      <body className="antialiased min-h-screen bg-[#0f1117] text-[#e4e6f0]">
        {children}
      </body>
    </html>
  );
}
