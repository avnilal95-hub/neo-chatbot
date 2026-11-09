
module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  const {
    LLAMA_BASE_URL,
    NEO_API_KEY,
    NEO_ACCESS_PASSWORD
  } = process.env;

  if (!LLAMA_BASE_URL || !NEO_API_KEY || !NEO_ACCESS_PASSWORD) {
    return res.status(500).json({
      error: "Server environment variables are missing."
    });
  }

  const suppliedPassword = req.headers["x-neo-access"];

  if (
    typeof suppliedPassword !== "string" ||
    suppliedPassword !== NEO_ACCESS_PASSWORD
  ) {
    return res.status(401).json({
      error: "Incorrect access password."
    });
  }

  if (
    typeof LLAMA_BASE_URL !== "string" ||
    !/^https:\/\//i.test(LLAMA_BASE_URL) &&
    !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(LLAMA_BASE_URL)
  ) {
    return res.status(500).json({
      error: "Invalid Llama server URL."
    });
  }

  const messages = req.body?.messages;

  if (
    !Array.isArray(messages) ||
    messages.length === 0 ||
    messages.length > 16
  ) {
    return res.status(400).json({
      error: "Invalid message history."
    });
  }

  const validMessages = [];

  for (const message of messages) {
    if (
      !message ||
      !["user", "assistant"].includes(message.role) ||
      typeof message.content !== "string" ||
      message.content.length === 0 ||
      message.content.length > 8000
    ) {
      return res.status(400).json({
        error: "Invalid message format."
      });
    }

    validMessages.push({
      role: message.role,
      content: message.content
    });
  }

  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, 90000);

  try {
    const baseUrl = LLAMA_BASE_URL.replace(/\/+$/, "");

    const response = await fetch(
      `${baseUrl}/v1/chat/completions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${NEO_API_KEY}`
        },
        body: JSON.stringify({
          model: "llama-3.2-1b",
          messages: validMessages,
          temperature: 0.7,
          max_tokens: 512,
          stream: false
        }),
        signal: controller.signal
      }
    );

    if (!response.ok) {
      return res.status(502).json({
        error: "Llama server returned an error.",
        upstreamStatus: response.status
      });
    }

    const data = await response.json();

    const reply = data.choices?.[0]?.message?.content;

    if (typeof reply !== "string" || !reply.trim()) {
      return res.status(502).json({
        error: "Llama returned an empty response."
      });
    }

    return res.status(200).json({
      reply: reply.trim()
    });

  } catch (error) {
    return res.status(502).json({
      error: error.name === "AbortError"
        ? "Llama request timed out."
        : "Could not connect to the Llama server."
    });

  } finally {
    clearTimeout(timeout);
  }
};

