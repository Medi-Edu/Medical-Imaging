// ===============================
// CONFIG
// ===============================
// ✅ MUST be HTTPS when using GitHub Pages (HTTPS)
const API_BASE = "https://stewart-franklin-broader-cosmetics.trycloudflare.com";
// ==================================================
// ==================================================
// CONSTANTS
// ==================================================
const POLL_MS   = 1500;  // Job polling interval
const RECORD_MS = 4500;  // Voice recording duration



// ==================================================
// HELPERS
// ==================================================
function qs(id) {
  return document.getElementById(id);
}

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



// ==================================================
// VIDEO LOAD
// ==================================================
const player = qs("player");
const videoFile = getVideoParam();

// video served by backend under /media (HTTPS required)
player.src = `${API_BASE}/media/${encodeURIComponent(videoFile)}`;



// ==================================================
// MODAL CONTROL
// ==================================================
const modal = qs("qaModal");

player.addEventListener("pause", () => {
  modal.classList.remove("hidden");
});

qs("closeModal").onclick = () => {
  modal.classList.add("hidden");
  // player.play(); // optional
};



// ==================================================
// TAB SWITCHING
// ==================================================
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



// ==================================================
// LLM QUERY — /ask
// ==================================================
async function askLLM(questionText) {
  const payload = {
    question: questionText,
    current_time: getPausedTimeSeconds(),
  };

  const r = await fetch(`${API_BASE}/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!r.ok) {
    const t = await r.text();
    throw new Error(`ask failed: ${r.status} ${t}`);
  }

  return await r.json(); // { answer, context }
}



// ==================================================
// AVATAR JOB — /avatar_tts
// ==================================================
async function enqueueAvatarFromText(answerText) {
  const r = await fetch(`${API_BASE}/avatar_tts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: answerText }),
  });

  if (!r.ok) {
    const t = await r.text();
    throw new Error(`avatar_tts failed: ${r.status} ${t}`);
  }

  return await r.json(); // { task_id, ... }
}

async function pollJob(taskId) {
  return new Promise((resolve, reject) => {
    const timer = setInterval(async () => {
      try {
        const r = await fetch(`${API_BASE}/job_status/${taskId}`);
        const data = await r.json();

        if (data.state === "SUCCESS") {
          clearInterval(timer);
          resolve(data.result);
        } else if (data.state === "FAILURE") {
          clearInterval(timer);
          reject(new Error(JSON.stringify(data)));
        }
      } catch (e) {
        clearInterval(timer);
        reject(e);
      }
    }, POLL_MS);
  });
}



// ==================================================
// AVATAR VIDEO PLAYBACK + CLEANUP
// ==================================================
let lastAvatarCleanup = null;

function playAvatarVideo(videoUrl, audioPath = null) {
  const avatar = qs("avatar");

  avatar.innerHTML = `
    <video id="avatarVideo" autoplay controls playsinline
           src="${API_BASE}${videoUrl}">
    </video>
  `;

  const v = qs("avatarVideo");

  lastAvatarCleanup = {
    video_url: videoUrl,
    audio_path: audioPath,
  };

  qs("statusText").textContent = "Speaking";

  v.addEventListener("ended", async () => {
    qs("statusText").textContent = "Cleaning up…";

    if (!lastAvatarCleanup) return;

    try {
      await fetch(`${API_BASE}/delete_video`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(lastAvatarCleanup),
      });
    } catch (e) {
      console.warn("Cleanup failed:", e);
    } finally {
      lastAvatarCleanup = null;
      qs("statusText").textContent = "Idle";
    }
  });
}



// ==================================================
// CHAT PIPELINE
// ==================================================
let lastAnswerText = null;

qs("sendBtn").onclick = async () => {
  const q = qs("chatQ").value.trim();
  if (!q) return;

  appendMsg("q", `Q: ${q}`);
  qs("chatQ").value = "";

  try {
    qs("statusText").textContent = "Thinking…";
    const data = await askLLM(q);
    lastAnswerText = data.answer;
    appendMsg("a", `A: ${data.answer}`);
  } catch (e) {
    appendMsg("a", `Error: ${e.message}`);
  } finally {
    qs("statusText").textContent = "Idle";
  }
};

qs("sendAvatarBtn").onclick = async () => {
  if (!lastAnswerText) {
    appendMsg("a", "No answer yet — click Send first.");
    return;
  }

  try {
    setAvatarState("thinking", "Generating avatar…");
    const job = await enqueueAvatarFromText(lastAnswerText);
    const result = await pollJob(job.task_id);
    setAvatarState(null, "Speaking");
    playAvatarVideo(result.video_url);
  } catch (e) {
    appendMsg("a", `Avatar error: ${e.message}`);
    setAvatarState(null, "Idle");
  }
};

qs("chatQ").addEventListener("keydown", (e) => {
  if (e.key === "Enter") qs("sendBtn").click();
});



// ==================================================
// VOICE PIPELINE
// ==================================================
let recorder = null;
let audioChunks = [];
let recording = false;
let processingVoice = false;
let micStream = null;

qs("recBtn").onclick = async () => {
  if (recording || processingVoice) return;

  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    recorder = new MediaRecorder(micStream);
    audioChunks = [];
    recording = true;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunks.push(e.data);
    };

    recorder.onstop = async () => {
      recording = false;
      processingVoice = true;
      micStream.getTracks().forEach(t => t.stop());
      micStream = null;

      try {
        setAvatarState("listening", "Transcribing…");
        qs("recStatus").textContent = "Transcribing…";

        const blob = new Blob(audioChunks, { type: "audio/webm" });
        audioChunks = [];

        const form = new FormData();
        form.append("audio_file", blob, "audio.webm");

        const tr = await fetch(`${API_BASE}/transcribe`, {
          method: "POST",
          body: form,
        });

        if (!tr.ok) throw new Error(`transcribe failed: ${tr.status}`);

        const { text } = await tr.json();
        if (!text || text.trim().length < 2) return;

        appendMsg("q", `Q (voice): ${text}`);

        const ans = await askLLM(text);
        lastAnswerText = ans.answer;
        appendMsg("a", `A: ${ans.answer}`);

        const job = await enqueueAvatarFromText(ans.answer);
        const result = await pollJob(job.task_id);
        playAvatarVideo(result.video_url);

      } catch (e) {
        qs("recStatus").textContent = `Error: ${e.message}`;
      } finally {
        processingVoice = false;
        setAvatarState(null, "Idle");
      }
    };

    recorder.start();
    setAvatarState("listening", "Listening…");
    qs("recStatus").textContent = "Recording…";

    setTimeout(() => {
      if (recorder && recorder.state === "recording") recorder.stop();
    }, RECORD_MS);

  } catch (e) {
    qs("recStatus").textContent = `Mic error: ${e.message}`;
    recording = false;
    processingVoice = false;
  }
};



// ==================================================
// AVATAR PLAYBACK CONTROLS (OPTIONAL)
// ==================================================
qs("speakStopBtn").onclick = () => {
  const v = qs("avatarVideo");
  if (v) v.pause();
};

qs("speakResumeBtn").onclick = () => {
  const v = qs("avatarVideo");
  if (v) v.play();
};
