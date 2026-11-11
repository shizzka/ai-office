import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Пульт — DCM Lab",
  description: "Очереди Щит и Смета: состояние, ревью и управление DCM Lab.",
  openGraph: { title: "Пульт — DCM Lab", description: "Состояние очередей DCM Lab", type: "website", locale: "ru_RU" },
  twitter: { title: "Пульт — DCM Lab", description: "Состояние очередей DCM Lab" },
  robots: { index: false, follow: false },
};

export default function PultLayout({ children }: { children: React.ReactNode }) { return children; }
