// ===============================
// CONFIG
// ===============================
// Update this URL each time Cloudflare restarts (Terminal E)
// Edit directly on GitHub: https://github.com/Medi-Edu/Medical-Imaging/blob/main/app.js
const API_BASE = "https://list-detective-booth-small.trycloudflare.com";

const POLL_MS = 1500;

// ===============================
// CONVERSATION HISTORY
// ===============================
// Keeps the last N turns (user + assistant) to send with each request.
// This lets the LLM understand follow-up questions like "explain more".
const MAX_HISTORY_TURNS = 3;   // = last 3 question+answer pairs
let conversationHistory = [];  // [{ role: "user"|"assistant", content: "..." }]

function addToHistory(role, content) {
  conversationHistory.push({ role, content });
  // Keep only last MAX_HISTORY_TURNS * 2 messages (user + assistant per turn)
  if (conversationHistory.length > MAX_HISTORY_TURNS * 2) {
    conversationHistory = conversationHistory.slice(-MAX_HISTORY_TURNS * 2);
  }
}

// ===============================
// HELPERS
// ===============================
function qs(id) { return document.getElementById(id); }

function appendMsg(type, text) {
  const div = document.createElement("div");
  div.className = `msg ${type}`;
  div.textContent = text;
  qs("chatLog").appendChild(div);
  qs("chatLog").scrollTop = qs("chatLog").scrollHeight;
}

function getVideoParam() {
  const params = new URLSearchParams(window.location.search);
  return params.get("video") || "lecture01.mp4";
}

function getPausedTimeSeconds() {
  const player = qs("player");
  return player ? player.currentTime : null;
}

function setAvatarState(state, label) {
  const avatar = qs("avatar");
  avatar.classList.remove("listening", "thinking");
  if (state) avatar.classList.add(state);
  if (label) qs("statusText").textContent = label;
}

// ===============================
// LOAD VIDEO
// ===============================
document.addEventListener("DOMContentLoaded", () => {
  const player    = qs("player");
  const videoFile = getVideoParam();
  player.src = `${API_BASE}/media/${encodeURIComponent(videoFile)}`;
  player.load();
});

// ===============================
// MODAL CONTROL
// ===============================
document.addEventListener("DOMContentLoaded", () => {
  const modal  = qs("qaModal");
  const player = qs("player");

  player.addEventListener("pause", () => modal.classList.remove("hidden"));
  qs("closeModal").onclick = () => modal.classList.add("hidden");
});

// ===============================
// TAB SWITCH
// ===============================
document.addEventListener("DOMContentLoaded", () => {
  const chatPane  = qs("chatPane");
  const voicePane = qs("voicePane");

  qs("tabChat").onclick = () => {
    chatPane.classList.remove("hidden");
    voicePane.classList.add("hidden");
    qs("tabChat").classList.add("active");
    qs("tabVoice").classList.remove("active");
  };

  qs("tabVoice").onclick = () => {
    voicePane.classList.remove("hidden");
    chatPane.classList.add("hidden");
    qs("tabVoice").classList.add("active");
    qs("tabChat").classList.remove("active");
  };
});

// ===============================
// API CALLS  (all include conversation_history)
// ===============================
async function askLLM(questionText) {
  const r = await fetch(`${API_BASE}/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      question:             questionText,
      current_time:         getPausedTimeSeconds(),
      conversation_history: conversationHistory,   // ← send history
    })
  });
  if (!r.ok) throw new Error(`/ask failed: ${r.status} ${await r.text()}`);
  return r.json();
}

async function askLLMAvatar(questionText) {
  const r = await fetch(`${API_BASE}/ask_avatar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      question:             questionText,
      current_time:         getPausedTimeSeconds(),
      conversation_history: conversationHistory,   // ← send history
    })
  });
  if (!r.ok) throw new Error(`/ask_avatar failed: ${r.status} ${await r.text()}`);
  return r.json();
}

async function enqueueAvatarFromText(answerText) {
  const r = await fetch(`${API_BASE}/avatar_tts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: answerText })
  });
  if (!r.ok) throw new Error(`/avatar_tts failed: ${r.status} ${await r.text()}`);
  return r.json();
}

async function pollJob(taskId) {
  return new Promise((resolve, reject) => {
    const timer = setInterval(async () => {
      try {
        const r    = await fetch(`${API_BASE}/job_status/${taskId}`);
        const data = await r.json();
        if (data.state === "SUCCESS") { clearInterval(timer); resolve(data.result); }
        else if (data.state === "FAILURE") { clearInterval(timer); reject(new Error(JSON.stringify(data))); }
      } catch (e) { clearInterval(timer); reject(e); }
    }, POLL_MS);
  });
}

// ===============================
// AVATAR VIDEO PLAYBACK
// ===============================
let lastAvatarCleanup = null;

function playAvatarVideo(videoUrl, audioPath = null) {
  const avatar = qs("avatar");
  avatar.innerHTML = `
    <video id="avatarVideo" autoplay controls playsinline
           src="${API_BASE}${videoUrl}"></video>
  `;
  lastAvatarCleanup = { video_url: videoUrl, audio_path: audioPath };
  qs("statusText").textContent = "Speaking";

  const v = document.getElementById("avatarVideo");
  v.addEventListener("ended", async () => {
    qs("statusText").textContent = "Cleaning up…";
    if (!lastAvatarCleanup) return;
    try {
      await fetch(`${API_BASE}/delete_video`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(lastAvatarCleanup)
      });
    } catch (e) { console.warn("Cleanup failed:", e); }
    finally { lastAvatarCleanup = null; qs("statusText").textContent = "Idle"; }
  });
}

// ===============================
// WHISPER HALLUCINATION FIX
// ===============================
function cleanTranscript(raw) {
  if (!raw || raw.trim().length < 2) return "";
  let text = raw.trim();

  // Level 1: phrase-level comma-separated repetitions
  const phrases = text.split(/,\s+/);
  const seenPhrases = new Set();
  const dedupedPhrases = [];
  for (const ph of phrases) {
    const key = ph.trim().toLowerCase().replace(/\s+/g, " ");
    if (!key || seenPhrases.has(key)) continue;
    seenPhrases.add(key);
    dedupedPhrases.push(ph.trim());
  }
  text = dedupedPhrases.join(", ");

  // Level 2: sentence-level repetitions
  const sentences     = text.split(/(?<=[.?!])\s+/);
  const seenSentences = new Set();
  const dedupedSents  = [];
  for (const s of sentences) {
    const key = s.trim().toLowerCase().slice(0, 40);
    if (!key || seenSentences.has(key)) continue;
    seenSentences.add(key);
    dedupedSents.push(s.trim());
  }
  text = dedupedSents.join(" ");

  // Level 3: n-gram repetition detection
  const words = text.split(/\s+/);
  if (words.length > 12) {
    const ngramCount = {};
    const N = 6;
    for (let i = 0; i <= words.length - N; i++) {
      const gram = words.slice(i, i + N).join(" ").toLowerCase();
      ngramCount[gram] = (ngramCount[gram] || 0) + 1;
      if (ngramCount[gram] > 2) {
        text = words.slice(0, i).join(" ");
        if (text && !text.match(/[.?!]$/)) text += ".";
        break;
      }
    }
  }

  return text.trim();
}

// ===============================
// CHAT: Send → /ask (detailed answer + save to history)
// ===============================
let lastQuestion = null;

document.addEventListener("DOMContentLoaded", () => {

  qs("sendBtn").onclick = async () => {
    const q = qs("chatQ").value.trim();
    if (!q) return;
    lastQuestion = q;
    appendMsg("q", `Q: ${q}`);
    qs("chatQ").value = "";

    try {
      qs("statusText").textContent = "Thinking…";
      const data = await askLLM(q);

      // Save this turn to history BEFORE the next request
      addToHistory("user",      q);
      addToHistory("assistant", data.answer);

      appendMsg("a", `A: ${data.answer}`);
      qs("statusText").textContent = "Idle";
    } catch (e) {
      appendMsg("a", `Error: ${e.message}`);
      qs("statusText").textContent = "Idle";
    }
  };

  // ===============================
  // CHAT: Avatar button → /ask_avatar (short answer)
  // ===============================
  qs("sendAvatarBtn").onclick = async () => {
    if (!lastQuestion) {
      appendMsg("a", "No question yet — click Send first.");
      return;
    }
    try {
      setAvatarState("thinking", "Generating avatar answer…");
      const avatarData  = await askLLMAvatar(lastQuestion);
      const shortAnswer = avatarData.answer;

      setAvatarState("thinking", "Generating avatar video…");
      const job    = await enqueueAvatarFromText(shortAnswer);
      const result = await pollJob(job.task_id);

      setAvatarState(null, "Speaking");
      playAvatarVideo(result.video_url);
    } catch (e) {
      setAvatarState(null, "Idle");
      appendMsg("a", `Avatar error: ${e.message}`);
    }
  };

  qs("chatQ").addEventListener("keydown", (e) => {
    if (e.key === "Enter") qs("sendBtn").click();
  });

  // ===============================
  // VOICE: record → /transcribe → /ask_avatar → /avatar_tts
  // ===============================
  let recorder        = null;
  let audioChunks     = [];
  let recording       = false;
  let processingVoice = false;
  let micStream       = null;

  qs("stopRecBtn").onclick = () => {
    if (recorder && recorder.state === "recording") {
      recorder.stop();
      qs("recStatus").textContent = "Stopping…";
    }
  };

  qs("recBtn").onclick = async () => {
    if (recording || processingVoice) return;

    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";

      recorder    = new MediaRecorder(micStream, { mimeType });
      audioChunks = [];
      recording   = true;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) audioChunks.push(e.data);
      };

      recorder.onstop = async () => {
        recording = false;
        processingVoice = true;
        micStream.getTracks().forEach(t => t.stop());
        micStream = null;

        try {
          // Step 1: Transcribe
          setAvatarState("listening", "Transcribing…");
          qs("recStatus").textContent = "Transcribing…";

          const blob = new Blob(audioChunks, { type: recorder.mimeType });
          audioChunks = [];
          const form = new FormData();
          form.append("audio_file", blob, "audio.webm");

          const tr = await fetch(`${API_BASE}/transcribe`, { method: "POST", body: form });
          if (!tr.ok) throw new Error(`transcribe failed: ${tr.status}`);
          const { text: rawText } = await tr.json();

          // Step 2: Clean hallucinations
          const cleanedText = cleanTranscript(rawText);
          if (!cleanedText || cleanedText.length < 3) {
            qs("recStatus").textContent = "No speech detected. Please try again.";
            setAvatarState(null, "Idle");
            processingVoice = false;
            return;
          }

          appendMsg("q", `Q (voice): ${cleanedText}`);
          lastQuestion = cleanedText;

          // Step 3: Short avatar answer via /ask_avatar (with history)
          setAvatarState("thinking", "Thinking…");
          qs("recStatus").textContent = "Thinking…";
          const avatarAns = await askLLMAvatar(cleanedText);

          // Save voice turn to history too
          addToHistory("user",      cleanedText);
          addToHistory("assistant", avatarAns.answer);

          appendMsg("a", `A: ${avatarAns.answer}`);

          // Step 4: Generate avatar video
          setAvatarState("thinking", "Generating avatar…");
          qs("recStatus").textContent = "Generating avatar…";
          const job    = await enqueueAvatarFromText(avatarAns.answer);
          const result = await pollJob(job.task_id);

          // Step 5: Play
          setAvatarState(null, "Speaking");
          qs("recStatus").textContent = "Playing";
          playAvatarVideo(result.video_url);

        } catch (e) {
          qs("recStatus").textContent = `Error: ${e.message}`;
          setAvatarState(null, "Idle");
        } finally {
          processingVoice = false;
        }
      };

      recorder.start();
      qs("recStatus").textContent = "Recording… (click Stop when done)";
      setAvatarState("listening", "Listening…");

    } catch (e) {
      qs("recStatus").textContent = `Mic error: ${e.message}`;
      recording = false;
      processingVoice = false;
    }
  };

  qs("speakStopBtn").onclick   = () => { const v = document.getElementById("avatarVideo"); if (v) v.pause(); };
  qs("speakResumeBtn").onclick = () => { const v = document.getElementById("avatarVideo"); if (v) v.play();  };

}); // end DOMContentLoaded
