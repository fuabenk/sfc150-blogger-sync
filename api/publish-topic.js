/**
 * POST /api/publish-topic
 * Menangani DUA event:
 *  - event tidak ada / "topic"  -> buat post Blogger baru (topik baru)
 *  - event === "reply"          -> update post Blogger yang sudah ada
 *                                   (tambahkan balasan ke akhir isi post)
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
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Sync-Secret, X-Requested-From");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  // 1) Cek secret
  if (req.headers["x-sync-secret"] !== process.env.SYNC_SECRET) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  // 2) Cek origin (lapis kedua, karena secret selalu terlihat di View Source)
  const requestedFrom = req.headers["x-requested-from"] || "";
  if (process.env.ALLOWED_ORIGIN && requestedFrom !== process.env.ALLOWED_ORIGIN) {
    res.status(403).json({ error: "Forbidden origin" });
    return;
  }

  const body = req.body || {};
  const event = body.event || "topic";

  try {
    const blogger = getBloggerClient();

    if (event === "reply") {
      // ==== UPDATE POST YANG SUDAH ADA ====
      const { blogPostId, topicTitle, replyContent, authorName, forumUrl, topicId } = body;

      if (!blogPostId) {
        res.status(400).json({ error: "blogPostId wajib diisi untuk event reply" });
        return;
      }

      const existing = await blogger.posts.get({
        blogId: process.env.BLOG_ID,
        postId: blogPostId,
      });

      const replySnippet =
        '<hr/><p><strong>' +
        escapeHtml(authorName || "Member") +
        "</strong> membalas:</p><p>" +
        escapeHtml(replyContent).replace(/\n/g, "<br/>") +
        "</p>";

      const updatedContent = (existing.data.content || "") + replySnippet;

      const result = await blogger.posts.patch({
        blogId: process.env.BLOG_ID,
        postId: blogPostId,
        requestBody: {
          content: updatedContent,
        },
      });

      res.status(200).json({
        updated: true,
        blogPostId: result.data.id,
        blogPostUrl: result.data.url,
      });
      return;
    }

    // ==== BUAT POST BARU (topik baru) ====
    const { topicId, title, content, category, authorName, forumUrl } = body;

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
    console.error("Gagal sync ke Blogger:", err.message);
    res.status(500).json({ error: "Gagal sync ke Blogger" });
  }
};
