
module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({
      status: "error",
      message: "Method not allowed"
    });
  }

  return res.status(200).json({
    status: "ok",
    app: "NEO AI Chat",
    timestamp: new Date().toISOString()
  });
};
