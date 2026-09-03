/**
 * POST /api/delete-topic
 */

const { google } = require("googleapis");

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

  if (req.headers["x-sync-secret"] !== process.env.SYNC_SECRET) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const requestedFrom = req.headers["x-requested-from"] || "";
  if (process.env.ALLOWED_ORIGIN && requestedFrom !== process.env.ALLOWED_ORIGIN) {
    res.status(403).json({ error: "Forbidden origin" });
    return;
  }

  const { blogPostId } = req.body || {};

  if (!blogPostId) {
    res.status(200).json({ skipped: true });
    return;
  }

  try {
    const blogger = getBloggerClient();

    await blogger.posts.delete({
      blogId: process.env.BLOG_ID,
      postId: blogPostId,
    });

    res.status(200).json({ deleted: true });
  } catch (err) {
    console.error("Gagal hapus post Blogger:", err.message);
    res.status(500).json({ error: "Gagal hapus post Blogger" });
  }
};
