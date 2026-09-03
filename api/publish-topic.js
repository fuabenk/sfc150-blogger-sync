/**
 * POST /api/publish-topic
 * Dipanggil dari browser (template forum) setelah topik baru
 * tersimpan di Firestore. Endpoint ini yang bicara ke Blogger API
 * memakai kredensial OAuth yang tersimpan aman sebagai Environment
 * Variable di Vercel (tidak pernah dikirim ke browser).
 */

const { google } = require("googleapis");

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getBloggerClient() {
  const oauth2Client = new google.auth.OAuth2(
    process.env.BLOGGER_CLIENT_ID,
    process.env.BLOGGER_CLIENT_SECRET
  );
  oauth2Client.setCredentials({
    refresh_token: process.env.BLOGGER_REFRESH_TOKEN,
  });
  return google.blogger({ version: "v3", auth: oauth2Client });
}

module.exports = async function handler(req, res) {
  const allowedOrigin = process.env.ALLOWED_ORIGIN || "*";

  res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Sync-Secret");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  // Kunci sederhana supaya endpoint ini tidak bisa dipakai sembarangan
  // orang untuk spam post ke blog Anda.
  if (req.headers["x-sync-secret"] !== process.env.SYNC_SECRET) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { topicId, title, content, category, authorName, forumUrl } =
    req.body || {};

  if (!topicId || !title || !content) {
    res.status(400).json({ error: "Data topik tidak lengkap" });
    return;
  }

  const forumThreadUrl = `${forumUrl}/?topic=${topicId}#forum`;

  const contentHtml =
    "<p><strong>" +
    escapeHtml(authorName || "Member") +
    "</strong> membuka diskusi di kategori <em>" +
    escapeHtml(category || "Umum") +
    "</em> di SFC150 Forum.</p>" +
    "<p>" +
    escapeHtml(content).replace(/\n/g, "<br/>") +
    "</p>" +
    '<p><a href="' +
    forumThreadUrl +
    '">Baca dan ikut balas diskusi ini di forum SFC150 &raquo;</a></p>';

  try {
    const blogger = getBloggerClient();

    const result = await blogger.posts.insert({
      blogId: process.env.BLOG_ID,
      requestBody: {
        title,
        content: contentHtml,
        labels: [category || "Umum", "SFC150", "Forum"],
      },
    });

    res.status(200).json({
      blogPostId: result.data.id,
      blogPostUrl: result.data.url,
    });
  } catch (err) {
    console.error("Gagal publish ke Blogger:", err.message);
    res.status(500).json({ error: "Gagal publish ke Blogger" });
  }
};
