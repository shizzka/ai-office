"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/authStore";

export default function OfficePage() {
  const router = useRouter();
  const { user, isLoading, checkAuth } = useAuthStore();

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    if (isLoading) return;
    if (user?.role === "admin") {
      router.push("/office/admin");
    } else {
      router.push("/office/stream");
    }
  }, [user, isLoading, router]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-[#9ba1b5]">Redirecting...</div>
    </div>
  );
}
