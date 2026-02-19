// ===============================
// CONFIG
// ===============================
// ✅ MUST be HTTPS when using GitHub Pages (HTTPS)
const API_BASE = "https://montgomery-bizrate-referrals-glance.trycloudflare.com";

// Polling
const POLL_MS = 1500;

// Voice recording
//const RECORD_MS = 30000;

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
  const v = params.get("video");
  return v || "lecture01.mp4";
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
const player = qs("player");
const videoFile = getVideoParam();

// video served by backend under /media (already mounted)
// ✅ must be https base
player.src = `${API_BASE}/media/${encodeURIComponent(videoFile)}`;

// ===============================
// MODAL CONTROL
// ===============================
const modal = qs("qaModal");

player.addEventListener("pause", () => {
  modal.classList.remove("hidden");
});

qs("closeModal").onclick = () => {
  modal.classList.add("hidden");
  // resume playback is optional; comment out if you want to keep paused
  // player.play();
};

// ===============================
// TAB SWITCH
// ===============================
const chatPane = qs("chatPane");
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

// ===============================
// FAST TEXT ANSWER (LLM) — /ask
// ===============================
async function askLLM(questionText) {
  const payload = {
    question: questionText,
    current_time: getPausedTimeSeconds()
  };

  const r = await fetch(`${API_BASE}/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!r.ok) {
    const t = await r.text();
    throw new Error(`ask failed: ${r.status} ${t}`);
  }
  return await r.json(); // {answer, context}
}

// ===============================
// AVATAR JOB — /avatar_tts
// IMPORTANT: send ANSWER text (not the question)
// ===============================
async function enqueueAvatarFromText(answerText) {
  const r = await fetch(`${API_BASE}/avatar_tts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: answerText })
  });

  if (!r.ok) {
    const t = await r.text();
    throw new Error(`avatar_tts failed: ${r.status} ${t}`);
  }
  return await r.json(); // {task_id, status, job_id, audio_path}
}

async function pollJob(taskId) {
  return new Promise((resolve, reject) => {
    const timer = setInterval(async () => {
      try {
        const r = await fetch(`${API_BASE}/job_status/${taskId}`);
        const data = await r.json();

        if (data.state === "SUCCESS") {
          clearInterval(timer);
          resolve(data.result); // {video_url, wav_path, ...}
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

let lastAvatarCleanup = null;

function playAvatarVideo(videoUrl, audioPath = null) {
  const avatar = qs("avatar");

  avatar.innerHTML = `
    <video id="avatarVideo"
           autoplay
           controls
           playsinline
           src="${API_BASE}${videoUrl}">
    </video>
  `;

  const v = document.getElementById("avatarVideo");

  lastAvatarCleanup = {
    video_url: videoUrl,
    audio_path: audioPath
  };

  qs("statusText").textContent = "Speaking";

  v.addEventListener("ended", async () => {
    qs("statusText").textContent = "Cleaning up…";

    if (!lastAvatarCleanup) return;

    try {
      await fetch(`${API_BASE}/delete_video`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(lastAvatarCleanup)
      });
    } catch (e) {
      console.warn("Cleanup failed:", e);
    } finally {
      lastAvatarCleanup = null;
      qs("statusText").textContent = "Idle";
    }
  });
}



// ===============================
// CHAT: Send (FAST) + optional Avatar button
// ===============================
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
    qs("statusText").textContent = "Idle";
  } catch (e) {
    appendMsg("a", `Error: ${e.message}`);
    qs("statusText").textContent = "Idle";
  }
};

// Chat “Avatar” button: generate avatar for the last answer
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
    setAvatarState(null, "Idle");
    appendMsg("a", `Avatar error: ${e.message}`);
  }
};

// Enter key sends chat
qs("chatQ").addEventListener("keydown", (e) => {
  if (e.key === "Enter") qs("sendBtn").click();
});

// ===============================
// VOICE: record -> /transcribe -> /ask -> /avatar_tts(answer)
// ===============================
// ===============================
// VOICE: SAFE RECORDING PIPELINE
// ===============================
let recorder = null;
let audioChunks = [];
let recording = false;
let processingVoice = false;
let micStream = null;

qs("recBtn").onclick = async () => {
  if (recording || processingVoice) {
    console.warn("Voice pipeline busy — ignoring click");
    return;
  }

  try {
          //micStream = await navigator.mediaDevices.getUserMedia({ audio: true });

            micStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });

          
          // ✅ Force a stable, backend-friendly codec
          const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
            ? "audio/webm;codecs=opus"
            : "audio/webm";
          
          recorder = new MediaRecorder(micStream, { mimeType });
          
          audioChunks = [];
          recording = true;
          
          recorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) {
              audioChunks.push(e.data);
            }
          };
          ;

    recorder.onstop = async () => {
      recording = false;
      processingVoice = true;

      // 🔒 fully stop mic
      micStream.getTracks().forEach(t => t.stop());
      micStream = null;

      try {
        setAvatarState("listening", "Transcribing…");
        qs("recStatus").textContent = "Transcribing…";

        const blob = new Blob(audioChunks, { type: recorder.mimeType });

        audioChunks = []; // important

        const form = new FormData();
        form.append("audio_file", blob, "audio.webm");

        const tr = await fetch(`${API_BASE}/transcribe`, {
          method: "POST",
          body: form
        });
        if (!tr.ok) throw new Error(`transcribe failed: ${tr.status}`);

        const { text } = await tr.json();
        if (!text || text.trim().length < 2) {
          qs("recStatus").textContent = "No speech detected.";
          setAvatarState(null, "Idle");
          processingVoice = false;
          return;
        }

        appendMsg("q", `Q (voice): ${text}`);

        setAvatarState("thinking", "Thinking…");
        qs("recStatus").textContent = "Thinking…";
        const ans = await askLLM(text);
        lastAnswerText = ans.answer;
        appendMsg("a", `A: ${ans.answer}`);

        setAvatarState("thinking", "Generating avatar…");
        qs("recStatus").textContent = "Generating avatar…";
        const job = await enqueueAvatarFromText(ans.answer);
        const result = await pollJob(job.task_id);

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
    qs("recStatus").textContent = "Recording…";
    setAvatarState("listening", "Listening…");

    // auto-stop after RECORD_MS
  //  setTimeout(() => {
    //  if (recorder && recorder.state === "recording") {
      //  recorder.stop();
     // }
   // }, RECORD_MS);
      qs("stopRecBtn").onclick = () => {
        if (recorder && recorder.state === "recording") {
          recorder.stop();
          qs("recStatus").textContent = "Stopping…";
        }
      };  

  } catch (e) {
    qs("recStatus").textContent = `Mic error: ${e.message}`;
    recording = false;
    processingVoice = false;
  }
};

// Stop/Resume controls for avatar video (optional)
qs("speakStopBtn").onclick = () => {
  const v = document.getElementById("avatarVideo");
  if (v) v.pause();
};
qs("speakResumeBtn").onclick = () => {
  const v = document.getElementById("avatarVideo");
  if (v) v.play();
};
