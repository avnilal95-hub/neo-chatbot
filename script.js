
"use strict";

/* =================================
   NEO AI CHAT - MAIN JAVASCRIPT
================================= */

const CONFIG = {
    apiEndpoint: "/api/chat",
    maxHistory: 16,
    requestTimeout: 120000,
    storageKey: "neo_chat_history",
    activeChatKey: "neo_active_chat"
};

/* =================================
   DOM ELEMENTS
================================= */

const elements = {
    sidebar: document.getElementById("sidebar"),
    newChat: document.getElementById("newChat"),
    chatHistory: document.getElementById("chatHistory"),
    settingsButton: document.getElementById("settingsButton"),
    menuButton: document.getElementById("menuButton"),
    connectionStatus: document.getElementById("connectionStatus"),
    conversation: document.getElementById("conversation"),
    welcomeScreen: document.getElementById("welcomeScreen"),
    messages: document.getElementById("messages"),
    chatForm: document.getElementById("chatForm"),
    messageInput: document.getElementById("messageInput"),
    sendButton: document.getElementById("sendButton")
};

/* =================================
   APPLICATION STATE
================================= */

let chats = loadChats();
let activeChatId = localStorage.getItem(CONFIG.activeChatKey);
let isGenerating = false;
let abortController = null;

/* =================================
   STORAGE
================================= */

function loadChats() {
    try {
        const saved = JSON.parse(
            localStorage.getItem(CONFIG.storageKey) || "[]"
        );

        return Array.isArray(saved) ? saved : [];
    } catch {
        return [];
    }
}

function saveChats() {
    try {
        localStorage.setItem(
            CONFIG.storageKey,
            JSON.stringify(chats)
        );
    } catch (error) {
        console.error("Unable to save chats:", error);
    }
}

function getActiveChat() {
    return chats.find(chat => chat.id === activeChatId);
}

function createChat() {
    const chat = {
        id: crypto.randomUUID(),
        title: "New conversation",
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now()
    };

    chats.unshift(chat);
    activeChatId = chat.id;

    localStorage.setItem(CONFIG.activeChatKey, activeChatId);

    saveChats();
    renderChatHistory();
    renderMessages();

    elements.messageInput.focus();

    return chat;
}

/* =================================
   CHAT HISTORY SIDEBAR
================================= */

function renderChatHistory() {
    if (!elements.chatHistory) return;

    elements.chatHistory.replaceChildren();

    chats.forEach(chat => {
        const button = document.createElement("button");

        button.type = "button";
        button.className = "history-item";
        button.textContent = chat.title;

        button.style.cssText = `
            width:100%;
            display:block;
            text-align:left;
            padding:11px 12px;
            margin-bottom:5px;
            border-radius:10px;
            color:#c9c1dc;
            background:${chat.id === activeChatId ? "#211a35" : "transparent"};
            border:none;
            cursor:pointer;
            overflow:hidden;
            text-overflow:ellipsis;
            white-space:nowrap;
            font-size:13px;
        `;

        button.addEventListener("click", () => {
            if (isGenerating) return;

            activeChatId = chat.id;

            localStorage.setItem(
                CONFIG.activeChatKey,
                activeChatId
            );

            renderChatHistory();
            renderMessages();

            if (window.innerWidth <= 700) {
                elements.sidebar?.classList.remove("open");
            }
        });

        elements.chatHistory.appendChild(button);
    });
}

/* =================================
   MESSAGE RENDERING
================================= */

function renderMessages() {
    const chat = getActiveChat();

    elements.messages.replaceChildren();

    if (!chat || chat.messages.length === 0) {
        elements.welcomeScreen.hidden = false;
        return;
    }

    elements.welcomeScreen.hidden = true;

    chat.messages.forEach(message => {
        addMessageToScreen(
            message.role,
            message.content
        );
    });

    scrollToBottom();
}

function addMessageToScreen(role, content) {
    const wrapper = document.createElement("div");

    wrapper.className = `message ${role === "user" ? "user" : "assistant"}`;

    const avatar = document.createElement("div");
    avatar.className = "message-avatar";
    avatar.textContent = role === "user" ? "U" : "N";

    const messageContent = document.createElement("div");
    messageContent.className = "message-content";
    messageContent.textContent = content;

    wrapper.append(avatar, messageContent);
    elements.messages.appendChild(wrapper);

    return messageContent;
}

function scrollToBottom() {
    elements.conversation.scrollTo({
        top: elements.conversation.scrollHeight,
        behavior: "smooth"
    });
}

/* =================================
   CONNECTION STATUS
================================= */

function setConnectionStatus(status) {
    const labels = {
        online: "Connected",
        offline: "Offline",
        loading: "Connecting...",
        busy: "NEO is thinking..."
    };

    if (elements.connectionStatus) {
        elements.connectionStatus.textContent =
            labels[status] || "Unknown";

        elements.connectionStatus.style.background =
            status === "online" ? "#48d69b" :
            status === "offline" ? "#e05b72" :
            "#e5ae50";
    }
}

async function checkConnection() {
    try {
        const response = await fetch("/api/health", {
            cache: "no-store"
        });

        setConnectionStatus(
            response.ok ? "online" : "offline"
        );
    } catch {
        setConnectionStatus("offline");
    }
}

/* =================================
   INPUT MANAGEMENT
================================= */

function resizeInput() {
    elements.messageInput.style.height = "auto";

    elements.messageInput.style.height =
        Math.min(elements.messageInput.scrollHeight, 150) + "px";
}

elements.messageInput.addEventListener("input", resizeInput);

elements.messageInput.addEventListener("keydown", event => {
    if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();

        if (!isGenerating) {
            elements.chatForm.requestSubmit();
        }
    }
});

/* =================================
   SEND MESSAGE
================================= */

async function sendMessage(text) {
    text = text.trim();

    if (!text || isGenerating) return;

    let chat = getActiveChat();

    if (!chat) {
        chat = createChat();
    }

    chat.messages.push({
        role: "user",
        content: text
    });

    if (chat.messages.length === 1) {
        chat.title = text.slice(0, 35) +
            (text.length > 35 ? "..." : "");
    }

    chat.updatedAt = Date.now();

    saveChats();

    elements.welcomeScreen.hidden = true;

    addMessageToScreen("user", text);

    const assistantBubble = addMessageToScreen(
        "assistant",
        "NEO is thinking..."
    );

    elements.messageInput.value = "";
    resizeInput();

    setGeneratingState(true);

    const history = chat.messages.slice(-CONFIG.maxHistory);

    abortController = new AbortController();

    const timeout = setTimeout(
        () => abortController.abort(),
        CONFIG.requestTimeout
    );

    try {
        setConnectionStatus("busy");

        const response = await fetch(CONFIG.apiEndpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                messages: history
            }),
            signal: abortController.signal
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));

            throw new Error(
                errorData.error || `Server error: ${response.status}`
            );
        }

        const data = await response.json();

        const reply =
            data.reply ||
            data.choices?.[0]?.message?.content;

        if (typeof reply !== "string" || !reply.trim()) {
            throw new Error("NEO returned an empty response.");
        }

        assistantBubble.textContent = reply;

        chat.messages.push({
            role: "assistant",
            content: reply
        });

        chat.updatedAt = Date.now();

        saveChats();
        renderChatHistory();

        setConnectionStatus("online");

    } catch (error) {
        console.error("NEO error:", error);

        const errorMessage =
            error.name === "AbortError"
                ? "Request timed out. Please try again."
                : error.message || "Something went wrong.";

        assistantBubble.textContent =
            "⚠️ " + errorMessage;

        setConnectionStatus("offline");

    } finally {
        clearTimeout(timeout);
        abortController = null;

        setGeneratingState(false);
        scrollToBottom();
        elements.messageInput.focus();
    }
}

/* =================================
   GENERATION STATE
================================= */

function setGeneratingState(state) {
    isGenerating = state;

    elements.sendButton.disabled = state;
    elements.messageInput.disabled = state;

    elements.sendButton.textContent = state ? "…" : "↑";

    if (!state) {
        setConnectionStatus("online");
    }
}

/* =================================
   FORM SUBMISSION
================================= */

elements.chatForm.addEventListener("submit", event => {
    event.preventDefault();

    sendMessage(elements.messageInput.value);
});

/* =================================
   NEW CHAT
================================= */

elements.newChat.addEventListener("click", () => {
    if (isGenerating) {
        abortController?.abort();
    }

    createChat();

    if (window.innerWidth <= 700) {
        elements.sidebar?.classList.remove("open");
    }
});

/* =================================
   SUGGESTION CARDS
================================= */

document.querySelectorAll(".suggestion-card").forEach(card => {
    card.addEventListener("click", () => {
        const prompt = card.dataset.prompt;

        if (!prompt || isGenerating) return;

        sendMessage(prompt);
    });
});

/* =================================
   MOBILE SIDEBAR
================================= */

elements.menuButton?.addEventListener("click", () => {
    elements.sidebar?.classList.toggle("open");
});

/* =================================
   SETTINGS
================================= */

elements.settingsButton?.addEventListener("click", () => {
    alert(
        "NEO Settings\n\n" +
        "Model: Llama 3.2 1B\n" +
        "Device: Redmi 13C 5G\n" +
        "Storage: Browser local storage"
    );
});

/* =================================
   INITIALIZATION
================================= */

function initializeNEO() {
    if (!chats.length) {
        createChat();
    } else if (!getActiveChat()) {
        activeChatId = chats[0].id;

        localStorage.setItem(
            CONFIG.activeChatKey,
            activeChatId
        );
    }

    renderChatHistory();
    renderMessages();

    checkConnection();
}

initializeNEO();

console.log("NEO AI Chat initialized.");
