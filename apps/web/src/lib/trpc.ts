"use client";

import { createTRPCReact, httpBatchLink } from "@trpc/react-query";
import type { AppRouter } from "@auto-linked/server/trpc";

export const trpc = createTRPCReact<AppRouter>();

function getBaseUrl(): string {
  // Client-side: relative URL goes through Next.js BFF proxy at /api/trpc
  if (typeof window !== "undefined") return "";
  // SSR: also route through the Next.js server itself
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return `http://localhost:${process.env.PORT ?? 3000}`;
}

export function getTrpcClient() {
  return trpc.createClient({
    links: [
      httpBatchLink({
        url: `${getBaseUrl()}/api/trpc`,
        headers() {
          return {
            "x-trpc-source": "nextjs-react",
          };
        },
      }),
    ],
  });
}
