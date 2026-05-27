/* global process */
import { Buffer } from "node:buffer";

const API_BASE_URL = (
  process.env.API_BASE_URL ||
  process.env.VITE_API_BASE_URL ||
  process.env.VITE_API_URL ||
  "https://now-here-jvmt.onrender.com"
).replace(/\/$/, "");

export default async function handler(request, response) {
  const rawPath = Array.isArray(request.query.path) ? request.query.path[0] : request.query.path;
  const path = String(rawPath || "").replace(/^\/+/, "");

  if (!path) {
    return response.status(400).json({ message: "Proxy path eksik." });
  }

  const query = new URLSearchParams(request.query);
  query.delete("path");

  const targetUrl = `${API_BASE_URL}/api/${path}${query.toString() ? `?${query}` : ""}`;
  const headers = new Headers();

  for (const [key, value] of Object.entries(request.headers)) {
    const lowerKey = key.toLowerCase();
    if (["host", "origin", "referer", "connection", "content-length"].includes(lowerKey)) continue;
    if (Array.isArray(value)) {
      headers.set(key, value.join(","));
    } else if (value) {
      headers.set(key, value);
    }
  }

  try {
    const body = ["GET", "HEAD"].includes(request.method)
      ? undefined
      : await new Promise((resolve, reject) => {
          const chunks = [];
          request.on("data", (chunk) => chunks.push(chunk));
          request.on("end", () => resolve(Buffer.concat(chunks)));
          request.on("error", reject);
        });

    const upstream = await fetch(targetUrl, {
      method: request.method,
      headers,
      body,
    });

    response.status(upstream.status);
    upstream.headers.forEach((value, key) => {
      if (!["content-encoding", "content-length", "transfer-encoding"].includes(key.toLowerCase())) {
        response.setHeader(key, value);
      }
    });

    const upstreamBody = Buffer.from(await upstream.arrayBuffer());
    return response.send(upstreamBody);
  } catch {
    return response.status(502).json({ message: "API proxy upstream sunucusuna ulasamadı." });
  }
}
