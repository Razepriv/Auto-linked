import { auth } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

/**
 * BFF proxy: forwards tRPC calls from the Next.js client to the Express backend.
 * Injects the authenticated user's ID and email via trusted headers.
 * Express trusts these headers because only this proxy sends them (validated by X-Proxy-Secret).
 */

const BACKEND_URL =
  process.env.BACKEND_URL ?? "http://localhost:4000";

const PROXY_SECRET = process.env.PROXY_SECRET ?? "dev-proxy-secret";

async function handler(req: NextRequest) {
  const session = await auth();

  // Build the backend URL, preserving the tRPC path
  const url = new URL(req.url);
  const trpcPath = url.pathname.replace("/api/trpc", "");
  const backendUrl = `${BACKEND_URL}/trpc${trpcPath}${url.search}`;

  // Forward headers, adding auth context
  const headers = new Headers(req.headers);
  headers.set("x-proxy-secret", PROXY_SECRET);
  headers.delete("host");

  if (session?.user) {
    headers.set("x-user-id", session.user.id);
    headers.set("x-user-email", session.user.email ?? "");
    headers.set("x-user-name", session.user.name ?? "");
  }

  const body = req.method !== "GET" ? await req.arrayBuffer() : undefined;

  const backendResponse = await fetch(backendUrl, {
    method: req.method,
    headers,
    body,
  });

  const responseBody = await backendResponse.arrayBuffer();

  return new NextResponse(responseBody, {
    status: backendResponse.status,
    statusText: backendResponse.statusText,
    headers: {
      "content-type":
        backendResponse.headers.get("content-type") ?? "application/json",
    },
  });
}

export const GET = handler;
export const POST = handler;
