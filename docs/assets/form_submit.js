async function recordFormSubmission(form_name = null, form_data = []) {
  const url = "https://trigger-2gb-616502391258.us-central1.run.app";
  const action = "site_form";

  // ✅ Normalize and validate
  if (!form_name || typeof form_name !== "string" || form_name.trim() === "") {
    console.warn("⚠️ Form submission skipped: invalid or missing form_name.");
    return { ok: false, skipped: true, reason: "invalid_form_name" };
  }

  if (!Array.isArray(form_data)) {
    form_data = [form_data]; // auto-wrap single object/value
  }

  if (form_data.length === 0) {
    console.warn("⚠️ Form submission skipped: form_data is empty.");
    return { ok: false, skipped: true, reason: "empty_form_data" };
  }

  const args = { form_name, form_data };

  try {
    const res = await fetch(url, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ action, args })
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Request failed (${res.status}): ${text}`);
    }

    const data = await res.json().catch(() => ({}));
    console.log("✅ Trigger success:", data);
    return data;
  } catch (err) {
    console.error("❌ Trigger failed:", err.message);
    return { ok: false, error: err.message };
  }
}

// Example usage:
// recordFormSubmission("retailer_signup", [{ field: "email", value: "test@example.com" }]);