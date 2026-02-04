// ===============================
// CONFIG
// ===============================
const API_BASE = "http://h100-litjan2024.bme.rpi.edu:9000";


// ===============================
// LOAD VIDEO
// ===============================
const params = new URLSearchParams(window.location.search);
const videoFile = params.get("video");

const player = document.getElementById("player");
player.src = `${API_BASE}/media/${videoFile}`;

// ===============================
// MODAL CONTROL
// ===============================
const modal = document.getElementById("qaModal");

player.addEventListener("pause", () => {
  modal.classList.remove("hidden");
});

document.getElementById("closeModal").onclick = () => {
  modal.classList.add("hidden");
};

// ===============================
// TAB SWITCH
// ===============================
const chatPane = document.getElementById("chatPane");
const voicePane = document.getElementById("voicePane");

document.getElementById("tabChat").onclick = () => {
  chatPane.classList.remove("hidden");
  voicePane.classList.add("hidden");
};

document.getElementById("tabVoice").onclick = () => {
  voicePane.classList.remove("hidden");
  chatPane.classList.add("hidden");
};

// ===============================
// TEXT → AVATAR
// ===============================
document.getElementById("sendBtn").onclick = async () => {
  const q = document.getElementById("chatQ").value.trim();
  if (!q) return;

  document.getElementById("statusText").textContent = "Thinking…";

  const res = await fetch(`${API_BASE}/avatar_tts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: q })
  });

  const data = await res.json();
  pollAvatar(data.task_id);
};

// ===============================
// VOICE RECORD
// ===============================
let recorder, audioChunks = [];

document.getElementById("recBtn").onclick = async () => {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  recorder = new MediaRecorder(stream);
  audioChunks = [];

  recorder.ondataavailable = e => audioChunks.push(e.data);
  recorder.onstop = sendVoice;

  recorder.start();
  document.getElementById("recStatus").textContent = "Recording…";

  setTimeout(() => recorder.stop(), 4000);
};

async function sendVoice() {
  document.getElementById("recStatus").textContent = "Processing…";

  const blob = new Blob(audioChunks, { type: "audio/webm" });
  const form = new FormData();
  form.append("audio_file", blob, "audio.webm");

  const r = await fetch(`${API_BASE}/transcribe`, {
    method: "POST",
    body: form
  });

  const { text } = await r.json();
  if (text) askText(text);
}

function askText(text) {
  document.getElementById("chatQ").value = text;
  document.getElementById("sendBtn").click();
}

// ===============================
// POLL AVATAR JOB
// ===============================
async function pollAvatar(taskId) {
  const interval = setInterval(async () => {
    const r = await fetch(`${API_BASE}/job_status/${taskId}`);
    const data = await r.json();

    if (data.state === "SUCCESS") {
      clearInterval(interval);
      playAvatar(data.result.video_url);
    }
  }, 3000);
}

// ===============================
// PLAY AVATAR VIDEO
// ===============================
function playAvatar(url) {
  const avatar = document.getElementById("avatar");
  avatar.innerHTML = `
    <video id="avatarVideo" autoplay controls
      src="${API_BASE}${url}">
    </video>
  `;
  document.getElementById("statusText").textContent = "Speaking";

  avatar.querySelector("video").onended = () => {
    avatar.innerHTML = `<img src="avatar1.png" />`;
    document.getElementById("statusText").textContent = "Idle";
  };
}
