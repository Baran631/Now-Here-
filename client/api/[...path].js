const API_BASE_URL = "https://now-here.onrender.com";

export default async function handler(request, response) {
  const path = Array.isArray(request.query.path) ? request.query.path.join("/") : request.query.path || "";
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
    response.send(upstreamBody);
  } catch {
    response.status(502).json({ message: "API proxy upstream sunucusuna ulasamadı." });
  }
}
