"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { isLoggedIn } from "@/lib/api";


export default function Home() {
  const router = useRouter();


  useEffect(() => {

    if (isLoggedIn()) {
      router.replace("/chat");
    } else {
      router.replace("/login");
    }

  }, [router]);

  

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-950 text-white">

      <div className="text-gray-400">
        Loading...
      </div>

    </main>
  );
}