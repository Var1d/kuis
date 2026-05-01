// ============================================================
//  PRAKTIKUM 7 - WebSocket & Testing
//  Game: Kuis Rebutan Pengetahuan Umum
//  Server: Node.js + Hono + @hono/node-ws
//  Farid Dhiya Fairuz - 247006111058
// ============================================================

import { Hono } from "hono";
import { createNodeWebSocket } from "@hono/node-ws";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";

const app = new Hono();
const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

// ─── Konstanta ───────────────────────────────────────────────
const ANSWER_TIME_LIMIT = 15; // detik untuk menjawab setelah buzz

// ─── State Game ─────────────────────────────────────────────
const clients  = new Map(); // ws.raw → { ws, username, role, score }
let isSessionOpen = false;  // true = soal aktif, player bisa buzz
let isAnswerPhase = false;  // true = ada winner, menunggu jawaban via chat
let currentQuestion = null;
let winner    = null;       // username pemenang buzz
let winnerRaw = null;       // ws.raw pemenang buzz
let pendingAnswer = null;   // jawaban yang menunggu validasi host
let roundNumber  = 0;
let answerTimer  = null;    // setTimeout untuk countdown jawaban
let tickInterval = null;    // setInterval untuk countdown detik

// Bank soal
const questionBank = [
  { q: "Siapa Leader dari KPOP Idol Group Hearts2Hearts?",       a: "Jiwoo" },
  { q: "Siapa Idol Perempuan pertama dari Indonesia di SM?",     a: "Carmen" },
  { q: "Siapa Main Dancer Hearts2Hearts?",                       a: "Juun" },
  { q: "Siapa Maknae Hearts2Hearts?",                            a: "Yeon" },
  { q: "Kapan Hearts2Hearts debut?",                             a: "24 Februari 2024" },
  { q: "Ada berapa jumlah anggota Hearts2Hearts?",               a: "8" },
  { q: "Siapa Member yang pernah menjadi MC Music Core di H2h?", a: "A-na" },
  { q: "Siapa Trainee dengan durasi terlama Hearts2Hearts?",     a: "Yuha" },
  { q: "Siapa Center Hearts2Hearts?",                            a: "Ian" },
  { q: "Siapa member H2H yang pernah tinggal di Kanada?",        a: "Stella" },
];

let usedQuestions = [];

function getNextQuestion() {
  const remaining = questionBank.filter((_, i) => !usedQuestions.includes(i));
  if (remaining.length === 0) { usedQuestions = []; return getNextQuestion(); }
  const idx = Math.floor(Math.random() * remaining.length);
  const originalIdx = questionBank.indexOf(remaining[idx]);
  usedQuestions.push(originalIdx);
  return remaining[idx];
}

// ─── Helpers ────────────────────────────────────────────────
function broadcast(data) {
  const payload = JSON.stringify(data);
  for (const [, c] of clients) { try { c.ws.send(payload); } catch (_) {} }
}

function sendTo(rawKey, data) {
  const c = clients.get(rawKey);
  if (c) { try { c.ws.send(JSON.stringify(data)); } catch (_) {} }
}

function getScoreboard() {
  return [...clients.values()]
    .filter((c) => c.role === "player")
    .map((c)   => ({ username: c.username, score: c.score }))
    .sort((a, b) => b.score - a.score);
}

// ─── Timer jawaban ───────────────────────────────────────────
function clearTimers() {
  if (answerTimer)  { clearTimeout(answerTimer);  answerTimer  = null; }
  if (tickInterval) { clearInterval(tickInterval); tickInterval = null; }
}

function startAnswerTimer() {
  clearTimers();

  let secondsLeft = ANSWER_TIME_LIMIT;

  // Tick setiap detik
  tickInterval = setInterval(() => {
    secondsLeft--;
    broadcast({ type: "ANSWER_TICK", secondsLeft });
    if (secondsLeft <= 0) clearInterval(tickInterval);
  }, 1000);

  // Timeout utama
  answerTimer = setTimeout(() => {
    clearTimers();
    if (!isAnswerPhase) return; // sudah dijawab lebih dulu

    const timedOutPlayer = winner;
    console.log(`[TIMER] ${timedOutPlayer} kehabisan waktu!`);

    isAnswerPhase = false;
    isSessionOpen = false;
    winner    = null;
    winnerRaw = null;

    broadcast({
      type: "ANSWER_TIMEOUT",
      player: timedOutPlayer,
      answer: currentQuestion.a,
      message: `⏰ Waktu habis! ${timedOutPlayer} tidak menjawab. Jawaban: "${currentQuestion.a}"`,
      scoreboard: getScoreboard(),
    });
  }, ANSWER_TIME_LIMIT * 1000);
}

// ─── Static client ───────────────────────────────────────────
app.use("/client", serveStatic({ path: "./public/index.html" }));

// ─── WebSocket ───────────────────────────────────────────────
app.get("/ws", upgradeWebSocket(() => ({

  onOpen(_, ws) {
    clients.set(ws.raw, { ws, username: "Anon", role: null, score: 0 });
    console.log(`[+] Client terhubung. Total: ${clients.size}`);
  },

  onMessage(event, ws) {
    const client = clients.get(ws.raw);
    if (!client) return;
    let data;
    try { data = JSON.parse(event.data); } catch { return; }

    // JOIN_HOST
    if (data.type === "JOIN_HOST") {
      const existing = [...clients.values()].find((c) => c.role === "host");
      if (existing && existing.ws.raw !== ws.raw) {
        sendTo(ws.raw, { type: "ERROR", message: "Sudah ada host aktif!" });
        return;
      }
      client.username = data.username || "Host";
      client.role = "host";
      console.log(`[HOST] ${client.username}`);
      sendTo(ws.raw, { type: "HOST_CONFIRMED", username: client.username });
      broadcast({ type: "INFO", message: `🎤 ${client.username} siap menjadi Host!`, scoreboard: getScoreboard() });
    }

    // JOIN_PLAYER
    if (data.type === "JOIN_PLAYER") {
      client.username = data.username || "Player";
      client.role = "player";
      client.score = 0;
      console.log(`[PLAYER] ${client.username}`);
      sendTo(ws.raw, { type: "PLAYER_CONFIRMED", username: client.username });
      broadcast({ type: "INFO", message: `🙋 ${client.username} bergabung!`, scoreboard: getScoreboard() });
    }

    // START_SESSION (host only)
    if (data.type === "START_SESSION") {
      if (client.role !== "host") return;
      clearTimers();
      currentQuestion = getNextQuestion();
      roundNumber++;
      isSessionOpen = true;
      isAnswerPhase = false;
      winner    = null;
      winnerRaw = null;

      // Kirim soal ke setiap role. Host menerima jawaban benar sejak awal,
      // sementara player hanya menerima pertanyaan.
      for (const [rawKey, c] of clients) {
        const payload = {
          type: "SESSION_STARTED",
          round: roundNumber,
          question: currentQuestion.q,
          scoreboard: getScoreboard(),
        };
        if (c.role === "host") {
          payload.correctAnswer = currentQuestion.a;
        }
        sendTo(rawKey, payload);
      }

      console.log(`[GAME] Ronde #${roundNumber}: "${currentQuestion.q}" | Jawaban: "${currentQuestion.a}"`);
    }

    // BUZZ (player only, saat soal aktif & belum ada winner)
    if (data.type === "BUZZ") {
      if (!isSessionOpen || isAnswerPhase || winner || client.role !== "player") return;
      winner    = client.username;
      winnerRaw = ws.raw;
      isSessionOpen = false;
      isAnswerPhase = true;
      console.log(`[BUZZ] ${winner}`);
      broadcast({
        type: "BUZZ_ACCEPTED",
        winner,
        timeLimit: ANSWER_TIME_LIMIT,
        message: `⚡ ${winner} BUZZ! Ketik jawaban dalam ${ANSWER_TIME_LIMIT} detik!`,
      });
      startAnswerTimer();
    }

    // SEND_ANSWER (hanya pemenang buzz)
    if (data.type === "SEND_ANSWER") {
      if (!isAnswerPhase || client.username !== winner) return;
      const rawAnswer = (data.text || "").trim();
      if (!rawAnswer) return;

      clearTimers();
      isAnswerPhase = false;
      const answeredBy = winner;
      
      // Simpan jawaban untuk validasi host
      pendingAnswer = { player: answeredBy, text: rawAnswer };
      winner    = null;
      winnerRaw = null;

      // Kirim ke Host dengan jawaban terlihat + tombol validasi
      for (const [rawKey, c] of clients) {
        if (c.role === "host") {
          sendTo(rawKey, {
            type: "PENDING_ANSWER",
            player: answeredBy,
            answer: rawAnswer,
            correctAnswer: currentQuestion.a,
            message: `📝 ${answeredBy} menjawab: "${rawAnswer}"`,
          });
        } else {
          // Player lain hanya lihat chat tanpa jawaban
          sendTo(rawKey, {
            type: "CHAT_MESSAGE",
            from: answeredBy,
            text: "Jawaban dikirim! Menunggu validasi Host...",
            isAnswer: true,
            isPending: true,
          });
        }
      }
    }

    // JUDGE (host only) - validasi jawaban player
    if (data.type === "JUDGE") {
      if (client.role !== "host") return;
      if (!pendingAnswer) {
        sendTo(ws.raw, { type: "ERROR", message: "Tidak ada jawaban yang perlu divalidasi!" });
        return;
      }

      const isCorrect = data.verdict === "benar";
      const answeredBy = pendingAnswer.player;
      const playerClient = [...clients.values()].find((c) => c.username === answeredBy && c.role === "player");

      if (isCorrect && playerClient) {
        playerClient.score += 10;
      }

      // Broadcast hasil ke semua
      broadcast({
        type: "ANSWER_RESULT",
        correct: isCorrect,
        player: answeredBy,
        answer: currentQuestion.a,
        message: isCorrect 
          ? `✅ BENAR! +10 poin untuk ${answeredBy}!` 
          : `❌ SALAH! — Jawaban yang benar: "${currentQuestion.a}"`,
        judgedBy: client.username,
        scoreboard: getScoreboard(),
      });

      console.log(`[JUDGE] ${client.username} menilai ${answeredBy} → ${isCorrect ? "BENAR" : "SALAH"}`);
      pendingAnswer = null;
    }

    // NEXT_ROUND (host only)
    if (data.type === "NEXT_ROUND") {
      if (client.role !== "host") return;
      clearTimers();
      isSessionOpen = false;
      isAnswerPhase = false;
      winner    = null;
      winnerRaw = null;
      broadcast({ type: "WAITING", message: "⏳ Menunggu Host membuka sesi berikutnya...", scoreboard: getScoreboard() });
    }

    // RESET_SCORES (host only)
    if (data.type === "RESET_SCORES") {
      if (client.role !== "host") return;
      clearTimers();
      roundNumber = 0;
      usedQuestions = [];
      isSessionOpen = false;
      isAnswerPhase = false;
      winner    = null;
      winnerRaw = null;
      for (const [, c] of clients) { if (c.role === "player") c.score = 0; }
      broadcast({ type: "SCORES_RESET", message: "🔄 Semua skor direset!", scoreboard: getScoreboard() });
    }
  },

  onClose(_, ws) {
    const client = clients.get(ws.raw);
    if (!client) return;

    // Jika pemenang buzz disconnect sebelum menjawab → batalkan soal
    if (isAnswerPhase && ws.raw === winnerRaw) {
      clearTimers();
      const name = client.username;
      isAnswerPhase = false;
      isSessionOpen = false;
      winner    = null;
      winnerRaw = null;
      clients.delete(ws.raw);
      broadcast({ type: "INFO", message: `💨 ${name} disconnect sebelum menjawab! Soal dibatalkan.`, scoreboard: getScoreboard() });
    } else {
      console.log(`[-] ${client.username} (${client.role}) terputus`);
      clients.delete(ws.raw);
      broadcast({ type: "INFO", message: `👋 ${client.username} meninggalkan game.`, scoreboard: getScoreboard() });
    }
  },
})));

// ─── Start ───────────────────────────────────────────────────
const server = serve({ fetch: app.fetch, port: 3000 }, (info) => {
  console.log("╔════════════════════════════════════════╗");
  console.log("║   🎮 KUIS REBUTAN WebSocket Server     ║");
  console.log(`║   http://localhost:${info.port}/client          ║`);
  console.log("╚════════════════════════════════════════╝");
});

injectWebSocket(server);
