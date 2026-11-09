
"use strict";

const MAX_MESSAGES = 16;
const MAX_MESSAGE_LENGTH = 8000;
const REQUEST_TIMEOUT = 90000;

module.exports = async function handler(req, res) {
    // Only allow POST requests
    if (req.method !== "POST") {
        res.setHeader("Allow", "POST");
        return res.status(405).json({
            error: "Method not allowed"
        });
    }

    // Environment variables
    const {
        LLAMA_BASE_URL,
        NEO_API_KEY,
        NEO_ACCESS_PASSWORD
    } = process.env;

    if (!LLAMA_BASE_URL || !NEO_API_KEY || !NEO_ACCESS_PASSWORD) {
        return res.status(500).json({
            error: "NEO server is not configured."
        });
    }

    // Check website access password
    const accessPassword = req.headers["x-neo-access"];

    if (
        typeof accessPassword !== "string" ||
        accessPassword !== NEO_ACCESS_PASSWORD
    ) {
        return res.status(401).json({
            error: "Invalid NEO access password."
        });
    }

    // Validate request body
    const messages = req.body?.messages;

    if (!Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({
            error: "A message history is required."
        });
    }

    if (messages.length > MAX_MESSAGES) {
        return res.status(400).json({
            error: "Too many messages."
        });
    }

    const validMessages = [];

    for (const message of messages) {
        if (
            !message ||
            !["user", "assistant"].includes(message.role) ||
            typeof message.content !== "string" ||
            !message.content.trim() ||
            message.content.length > MAX_MESSAGE_LENGTH
        ) {
            return res.status(400).json({
                error: "Invalid message format."
            });
        }

        validMessages.push({
            role: message.role,
            content: message.content.trim()
        });
    }

    // Validate the configured model server URL
    let baseUrl;

    try {
        baseUrl = new URL(LLAMA_BASE_URL);

        if (
            baseUrl.protocol !== "https:" &&
            baseUrl.hostname !== "localhost" &&
            baseUrl.hostname !== "127.0.0.1"
        ) {
            throw new Error("HTTPS required");
        }
    } catch {
        return res.status(500).json({
            error: "Invalid Llama server URL."
        });
    }

    // Prepare upstream request
    const endpoint =
        baseUrl.toString().replace(/\/+$/, "") +
        "/v1/chat/completions";

    const controller = new AbortController();

    const timeout = setTimeout(
        () => controller.abort(),
        REQUEST_TIMEOUT
    );

    try {
        const response = await fetch(endpoint, {
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
        });

        if (!response.ok) {
            console.error(
                "Llama server returned status:",
                response.status
            );

            return res.status(502).json({
                error: "The Llama server could not process the request."
            });
        }

        const data = await response.json();

        const reply =
            data?.choices?.[0]?.message?.content;

        if (typeof reply !== "string" || !reply.trim()) {
            return res.status(502).json({
                error: "Llama returned an empty response."
            });
        }

        return res.status(200).json({
            reply: reply.trim()
        });

    } catch (error) {
        console.error(
            "NEO upstream error:",
            error.name
        );

        if (error.name === "AbortError") {
            return res.status(504).json({
                error: "NEO took too long to respond."
            });
        }

        return res.status(502).json({
            error: "Could not connect to the Llama server."
        });

    } finally {
        clearTimeout(timeout);
    }
};
