export async function uploadMetaToGCS(
  metaObj,
  path,
  {
    endpoint = "https://trigger-2gb-616502391258.us-central1.run.app",
    action = "meta_to_return",
    headers = { "Content-Type": "application/json" },
    timeoutMs = 10000,
    vrbs = 1
  } = {}
) {
  // Basic validation
  if (!metaObj || typeof metaObj !== "object") {
    throw new Error("metaToGCS: META must be a non-null object");
  }
  if (!path || typeof path !== "string") {
    throw new Error("metaToGCS: PATH must be a non-empty string");
  }

  const payload = {action, args: { META: metaObj, PATH: path }};

  if (vrbs > 0) {console.log("metaToGCS: POST", endpoint, "| payload:", payload);}

  // Timeout support
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  let resp;
  try {
    resp = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: ac.signal
    });
  } catch (err) {
    clearTimeout(t);
    console.error("metaToGCS: network error:", err?.message || err);
    throw new Error(`metaToGCS: network error: ${String(err?.message || err)}`);
  }
  clearTimeout(t);

  // Handle non-2xx responses
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    console.error("metaToGCS: HTTP error", resp.status, text);
    throw new Error(`metaToGCS: HTTP ${resp.status}${text ? ` - ${text}` : ""}`);
  }
  return true;
}
