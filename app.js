// ===============================
// CONFIG
// ===============================
// ✅ MUST be HTTPS when using GitHub Pages (HTTPS)
const API_BASE = "https://stewart-franklin-broader-cosmetics.trycloudflare.com";
// ==================================================
// CONSTANTS
// ==================================================
const POLL_MS = 1500;
const RECORD_MS = 4500;

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
// LOAD LECTURE VIDEO
// ===============================
const player = qs("player");
player.src = `${API_BASE}/media/lecture01.mp4`;

// ===============================
// ASK LLM
// ===============================
async function askLLM(questionText) {
  const r = await fetch(`${API_BASE}/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      question: questionText,
      current_time: getPausedTimeSeconds()
    })
  });

  if (!r.ok) throw new Error(await r.text());
  return await r.json(); // { answer, context }
}

// ===============================
// AVATAR JOB
// ===============================
async function enqueueAvatarFromText(answerText) {
  const r = await fetch(`${API_BASE}/avatar_tts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: answerText })
  });

  if (!r.ok) throw new Error(await r.text());
  return await r.json(); // { task_id, audio_path }
}

async function pollJob(taskId) {
  return new Promise((resolve, reject) => {
    const timer = setInterval(async () => {
      const r = await fetch(`${API_BASE}/job_status/${taskId}`);
      const data = await r.json();

      if (data.state === "SUCCESS") {
        clearInterval(timer);
        resolve(data.result); // { video_url, wav_path }
      }
      if (data.state === "FAILURE") {
        clearInterval(timer);
        reject(data);
      }
    }, POLL_MS);
  });
}

let lastAvatarCleanup = null;

function playAvatarVideo(videoUrl, audioPath) {
  qs("avatar").innerHTML = `
    <video id="avatarVideo" autoplay controls playsinline
      src="${API_BASE}${videoUrl}">
    </video>
  `;

  lastAvatarCleanup = { video_url: videoUrl, audio_path: audioPath };
  qs("statusText").textContent = "Speaking";

  qs("avatarVideo").addEventListener("ended", async () => {
    qs("statusText").textContent = "Cleaning up…";
    await fetch(`${API_BASE}/delete_video`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(lastAvatarCleanup)
    });
    lastAvatarCleanup = null;
    qs("statusText").textContent = "Idle";
  });
}

// ===============================
// CHAT
// ===============================
let lastAnswerText = null;

qs("sendBtn").onclick = async () => {
  const q = qs("chatQ").value.trim();
  if (!q) return;

  appendMsg("q", `Q: ${q}`);
  qs("chatQ").value = "";

  const data = await askLLM(q);
  lastAnswerText = data.answer;
  appendMsg("a", `A: ${data.answer}`);
};

qs("sendAvatarBtn").onclick = async () => {
  if (!lastAnswerText) return;
  setAvatarState("thinking", "Generating avatar…");

  const job = await enqueueAvatarFromText(lastAnswerText);
  const result = await pollJob(job.task_id);
  playAvatarVideo(result.video_url, result.wav_path);
};

// ===============================
// 🎤 VOICE (FIXED)
// ===============================
let recorder = null;
let audioChunks = [];
let micStream = null;
let processingVoice = false;

qs("recBtn").onclick = async () => {
  if (processingVoice) return;
  processingVoice = true;

  micStream = await navigator.mediaDevices.getUserMedia({ audio: true });



  let mimeType = "audio/webm;codecs=opus";
   if (!MediaRecorder.isTypeSupported(mimeType)) {
  mimeType = "audio/ogg;codecs=opus";
}

recorder = new MediaRecorder(micStream, { mimeType });


  audioChunks = [];

  recorder.ondataavailable = e => {
    if (e.data.size > 0) audioChunks.push(e.data);
  };

  recorder.onstop = async () => {
    micStream.getTracks().forEach(t => t.stop());

    const blob = new Blob(audioChunks, {
      type: "audio/webm;codecs=opus"
    });

    const form = new FormData();
    form.append("audio_file", blob, "audio.webm");

    const tr = await fetch(`${API_BASE}/transcribe`, {
      method: "POST",
      body: form
    });

    const { text } = await tr.json();

    if (!text || text.length < 2) {
      qs("recStatus").textContent = "No speech detected.";
      processingVoice = false;
      return;
    }

    appendMsg("q", `Q (voice): ${text}`);

    const ans = await askLLM(text);
    lastAnswerText = ans.answer;
    appendMsg("a", `A: ${ans.answer}`);

    const job = await enqueueAvatarFromText(ans.answer);
    const result = await pollJob(job.task_id);
    playAvatarVideo(result.video_url, result.wav_path);

    processingVoice = false;
  };

  recorder.start();
  qs("recStatus").textContent = "Recording…";

  setTimeout(() => recorder.stop(), RECORD_MS);
};

