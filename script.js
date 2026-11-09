
const CONFIG = {
  apiEndpoint: "/api/chat",
  healthEndpoint: "/api/health",
  maxHistory: 16,
  requestTimeout: 120000
};

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

let chats = JSON.parse(localStorage.getItem("neo_chats") || "[]");
let currentChatId = null;
let isGenerating = false;

function saveChats() {
  localStorage.setItem("neo_chats", JSON.stringify(chats));
}

function createId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function getNeoPassword() {
  let password = sessionStorage.getItem("neo_access_password");

  while (!password) {
    password = prompt("Enter your NEO access password:");

    if (password === null) return null;

    password = password.trim();

    if (password) {
      sessionStorage.setItem("neo_access_password", password);
    }
  }

  return password;
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

function formatMessage(text) {
  return escapeHTML(text).replace(/\n/g, "<br>");
}

function getCurrentChat() {
  return chats.find(chat => chat.id === currentChatId);
}

function createChat() {
  const chat = {
    id: createId(),
    title: "New chat",
    messages: [],
    updatedAt: Date.now()
  };

  chats.unshift(chat);
  currentChatId = chat.id;

  saveChats();
  renderChat();
  renderHistory();
}

function renderHistory() {
  if (!elements.chatHistory) return;

  elements.chatHistory.innerHTML = "";

  chats.forEach(chat => {
    const item = document.createElement("button");

    item.className = "history-item";
    item.textContent = chat.title;
    item.type = "button";

    if (chat.id === currentChatId) {
      item.classList.add("active");
    }

    item.addEventListener("click", () => {
      currentChatId = chat.id;
      renderChat();
      renderHistory();

      elements.sidebar?.classList.remove("open");
    });

    elements.chatHistory.appendChild(item);
  });
}

function renderMessage(message) {
  const wrapper = document.createElement("div");
  wrapper.className = `message ${message.role}`;

  const avatar = document.createElement("div");
  avatar.className = "message-avatar";
  avatar.textContent = message.role === "user" ? "You" : "N";

  const content = document.createElement("div");
  content.className = "message-content";
  content.innerHTML = formatMessage(message.content);

  wrapper.appendChild(avatar);
  wrapper.appendChild(content);

  elements.messages.appendChild(wrapper);
}

function renderChat() {
  const chat = getCurrentChat();

  elements.messages.innerHTML = "";

  if (!chat || chat.messages.length === 0) {
    elements.welcomeScreen.style.display = "flex";
    elements.conversation.style.display = "none";
    return;
  }

  elements.welcomeScreen.style.display = "none";
  elements.conversation.style.display = "block";

  chat.messages.forEach(renderMessage);
}

function setLoading(loading) {
  isGenerating = loading;

  if (elements.sendButton) {
    elements.sendButton.disabled = loading;
  }

  if (elements.messageInput) {
    elements.messageInput.disabled = loading;
  }

  if (elements.connectionStatus) {
    elements.connectionStatus.textContent = loading
      ? "NEO is thinking..."
      : "Ready";
  }
}

function showTyping() {
  const typing = document.createElement("div");

  typing.id = "neoTyping";
  typing.className = "message assistant";
  typing.innerHTML = `
    <div class="message-avatar">N</div>
    <div class="message-content">NEO is thinking...</div>
  `;

  elements.messages.appendChild(typing);
}

async function checkConnection() {
  try {
    const response = await fetch(CONFIG.healthEndpoint);

    if (!response.ok) throw new Error("API unavailable");

    const data = await response.json();

    if (elements.connectionStatus) {
      elements.connectionStatus.textContent =
        data.status === "ok" ? "API online" : "API unavailable";
    }
  } catch {
    if (elements.connectionStatus) {
      elements.connectionStatus.textContent = "API offline";
    }
  }
}

async function sendMessage(text) {
  if (isGenerating || !text.trim()) return;

  const password = getNeoPassword();

  if (!password) return;

  if (!currentChatId || !getCurrentChat()) {
    createChat();
  }

  const chat = getCurrentChat();

  chat.messages.push({
    role: "user",
    content: text.trim()
  });

  if (chat.messages.length === 1) {
    chat.title = text.trim().slice(0, 35);
  }

  saveChats();
  renderChat();
  renderHistory();

  elements.welcomeScreen.style.display = "none";
  elements.conversation.style.display = "block";

  setLoading(true);
  showTyping();

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    CONFIG.requestTimeout
  );

  try {
    const response = await fetch(CONFIG.apiEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-neo-access": password
      },
      body: JSON.stringify({
        messages: chat.messages
          .slice(-CONFIG.maxHistory)
          .map(message => ({
            role: message.role,
            content: message.content
          }))
      }),
      signal: controller.signal
    });

    if (response.status === 401) {
      sessionStorage.removeItem("neo_access_password");
      throw new Error("Incorrect password. Refresh and enter it again.");
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || "NEO server error.");
    }

    const data = await response.json();

    const reply =
      data.reply ||
      data.choices?.[0]?.message?.content;

    if (!reply) {
      throw new Error("NEO returned an empty response.");
    }

    chat.messages.push({
      role: "assistant",
      content: reply
    });

    chat.updatedAt = Date.now();
    saveChats();

  } catch (error) {
    const message = error.name === "AbortError"
      ? "Request timed out. Check your phone's model server and tunnel."
      : error.message;

    chat.messages.push({
      role: "assistant",
      content: "Error: " + message
    });

    saveChats();

  } finally {
    clearTimeout(timeout);
    setLoading(false);
    renderChat();
    renderHistory();

    if (elements.messageInput) {
      elements.messageInput.disabled = false;
      elements.messageInput.focus();
    }
  }
}

elements.chatForm?.addEventListener("submit", event => {
  event.preventDefault();

  const text = elements.messageInput.value.trim();

  if (!text || isGenerating) return;

  elements.messageInput.value = "";
  sendMessage(text);
});

elements.newChat?.addEventListener("click", createChat);

elements.menuButton?.addEventListener("click", () => {
  elements.sidebar?.classList.toggle("open");
});

elements.settingsButton?.addEventListener("click", () => {
  alert("NEO AI Chat\nPowered by Llama 3.2 1B");
});

document.querySelectorAll(".suggestion-card").forEach(card => {
  card.addEventListener("click", () => {
    const prompt = card.dataset.prompt;

    if (prompt) sendMessage(prompt);
  });
});

if (chats.length > 0) {
  currentChatId = chats[0].id;
} else {
  createChat();
}

renderChat();
renderHistory();
checkConnection();
