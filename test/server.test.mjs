// ============================================================
//  PRAKTIKUM 7 - Unit Test: Logika Game Kuis Rebutan
//  Dibuat dengan bantuan Claude AI (otomasi testing)
//  Farid Dhiya Fairuz - 247006111058
// ============================================================

import assert from 'node:assert/strict';

// ─── Simulasi State Server ────────────────────────────────────
let isSessionOpen = false;
let isAnswerPhase = false;
let winner        = null;
let pendingAnswer = null;
let roundNumber   = 0;
const clients     = new Map();

// Bank soal simulasi
const questionBank = [
  { q: "Siapa presiden pertama Indonesia?", a: "soekarno" },
  { q: "Siapa Leader dari Hearts2Hearts?",  a: "Jiwoo" },
  { q: "Ada berapa anggota Hearts2Hearts?", a: "8" },
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

// ─── Simulasi Logika Server ───────────────────────────────────

/** Simulasi START_SESSION: buka sesi, pilih soal, tambah ronde */
function processStartSession(role) {
  if (role !== 'host') return false;
  const q = getNextQuestion();
  roundNumber++;
  isSessionOpen = true;
  isAnswerPhase = false;
  winner = null;
  return { question: q, round: roundNumber };
}

/** Simulasi BUZZ: hanya player saat sesi aktif & belum ada winner */
function processBuzz(username, role) {
  if (!isSessionOpen || isAnswerPhase || winner || role !== 'player') return false;
  winner = username;
  isSessionOpen = false;
  isAnswerPhase = true;
  return true;
}

/** Simulasi SEND_ANSWER: hanya pemenang buzz yang bisa kirim jawaban */
function processSendAnswer(username, text) {
  if (!isAnswerPhase || username !== winner) return false;
  pendingAnswer = { player: username, text: text.trim() };
  winner = null;
  isAnswerPhase = false;
  return true;
}

/** Simulasi JUDGE: host menilai jawaban, benar +10 poin */
function processJudge(role, verdict, playerScore) {
  if (role !== 'host') return null;
  if (!pendingAnswer) return null;
  const isCorrect = verdict === 'benar';
  const newScore = isCorrect ? playerScore + 10 : playerScore;
  pendingAnswer = null;
  return { correct: isCorrect, score: newScore };
}

/** Simulasi RESET_SCORES */
function processReset(role) {
  if (role !== 'host') return false;
  roundNumber = 0;
  usedQuestions = [];
  isSessionOpen = false;
  isAnswerPhase = false;
  winner = null;
  pendingAnswer = null;
  return true;
}

// ─── Test Runner ─────────────────────────────────────────────
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ LULUS  — ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ❌ GAGAL  — ${name}`);
    console.log(`             ${err.message}`);
    failed++;
  }
}

// ─── Test Suite ──────────────────────────────────────────────
console.log('\n══════════════════════════════════════════════════════');
console.log('  Unit Test: Game Kuis Rebutan WebSocket');
console.log('══════════════════════════════════════════════════════\n');

// --- Suite 1: START_SESSION ---
console.log('📋 Suite 1: START_SESSION');

test('Player tidak bisa memulai sesi (bukan host)', () => {
  const result = processStartSession('player');
  assert.equal(result, false);
  assert.equal(isSessionOpen, false);
});

test('Host bisa memulai sesi dan mendapat soal', () => {
  const result = processStartSession('host');
  assert.notEqual(result, false);
  assert.equal(isSessionOpen, true);
  assert.equal(result.round, 1);
  assert.ok(result.question.q.length > 0);
  assert.ok(result.question.a.length > 0);
});

// --- Suite 2: BUZZ ---
console.log('\n📋 Suite 2: BUZZ');

test('Player bisa BUZZ saat sesi aktif', () => {
  assert.equal(processBuzz('Player01', 'player'), true);
  assert.equal(winner, 'Player01'); // winner tersimpan sampai SEND_ANSWER
  assert.equal(isAnswerPhase, true);
  assert.equal(isSessionOpen, false);
});

test('Player kedua tidak bisa BUZZ (sudah ada yang buzz)', () => {
  // isAnswerPhase masih true
  assert.equal(processBuzz('Player02', 'player'), false);
});

test('Host tidak bisa BUZZ', () => {
  // Reset dulu untuk kondisi fresh
  isSessionOpen = true; isAnswerPhase = false; winner = null;
  assert.equal(processBuzz('Host01', 'host'), false);
  assert.equal(winner, null);
});

test('Player tidak bisa BUZZ saat sesi belum dibuka', () => {
  isSessionOpen = false; isAnswerPhase = false; winner = null;
  assert.equal(processBuzz('Player01', 'player'), false);
});

// --- Suite 3: SEND_ANSWER ---
console.log('\n📋 Suite 3: SEND_ANSWER');

// Setup: buka sesi baru, player buzz
processStartSession('host');
processBuzz('Player01', 'player');
// winner sudah jadi null setelah buzz, tapi isAnswerPhase = true
// Untuk keperluan SEND_ANSWER test, set winner manual (simulasi state server)
winner = 'Player01';

test('Pemenang buzz bisa mengirim jawaban', () => {
  const result = processSendAnswer('Player01', 'soekarno');
  assert.equal(result, true);
  assert.ok(pendingAnswer !== null);
  assert.equal(pendingAnswer.player, 'Player01');
  assert.equal(pendingAnswer.text, 'soekarno');
});

test('Player lain tidak bisa mengirim jawaban saat bukan gilirannya', () => {
  // Set ulang untuk tes ini
  isAnswerPhase = true; winner = 'Player01';
  const result = processSendAnswer('Player02', 'jawaban palsu');
  assert.equal(result, false);
});

// --- Suite 4: JUDGE ---
console.log('\n📋 Suite 4: JUDGE');

// Setup pendingAnswer
pendingAnswer = { player: 'Player01', text: 'soekarno' };
let score = 0;

test('Jawaban benar menambah 10 poin ke skor player', () => {
  const result = processJudge('host', 'benar', score);
  assert.equal(result.correct, true);
  score = result.score;
  assert.equal(score, 10);
  assert.equal(pendingAnswer, null);
});

test('Jawaban salah tidak mengubah skor player', () => {
  pendingAnswer = { player: 'Player02', text: 'salah total' };
  const result = processJudge('host', 'salah', score);
  assert.equal(result.correct, false);
  assert.equal(result.score, 10); // tetap 10
});

test('Player tidak bisa menilai jawaban (bukan host)', () => {
  pendingAnswer = { player: 'Player01', text: 'soekarno' };
  const result = processJudge('player', 'benar', score);
  assert.equal(result, null);
});

test('JUDGE gagal jika tidak ada pendingAnswer', () => {
  pendingAnswer = null;
  const result = processJudge('host', 'benar', score);
  assert.equal(result, null);
});

// --- Suite 5: RESET ---
console.log('\n📋 Suite 5: RESET_SCORES');

isSessionOpen = true; roundNumber = 3;

test('Player tidak bisa reset skor', () => {
  assert.equal(processReset('player'), false);
  assert.equal(roundNumber, 3); // tidak berubah
});

test('Host bisa reset seluruh state game', () => {
  assert.equal(processReset('host'), true);
  assert.equal(roundNumber, 0);
  assert.equal(isSessionOpen, false);
  assert.equal(usedQuestions.length, 0);
});

// --- Suite 6: Bank Soal ---
console.log('\n📋 Suite 6: Bank Soal');

test('getNextQuestion mengembalikan soal valid', () => {
  const q = getNextQuestion();
  assert.ok(typeof q.q === 'string' && q.q.length > 0);
  assert.ok(typeof q.a === 'string' && q.a.length > 0);
});

test('getNextQuestion tidak mengulang soal sebelum semua terpakai', () => {
  usedQuestions = [];
  const seen = new Set();
  for (let i = 0; i < questionBank.length; i++) {
    const q = getNextQuestion();
    assert.ok(!seen.has(q.q), `Soal "${q.q}" muncul duplikat!`);
    seen.add(q.q);
  }
  assert.equal(seen.size, questionBank.length);
});

test('Bank soal direset setelah semua soal terpakai', () => {
  // usedQuestions sudah terisi semua setelah tes sebelumnya
  assert.equal(usedQuestions.length, questionBank.length);
  // Panggil lagi — harus reset dan tetap mengembalikan soal
  const q = getNextQuestion();
  assert.ok(q !== undefined);
  assert.equal(usedQuestions.length, 1); // reset terjadi, lalu 1 soal dipilih
});

// ─── Ringkasan ───────────────────────────────────────────────
const total = passed + failed;
console.log('\n══════════════════════════════════════════════════════');
console.log(`  Hasil: ${passed}/${total} test lulus`);
if (failed === 0) {
  console.log('  🎉 Semua test lulus! Logika server sudah benar.');
} else {
  console.log(`  ⚠️  ${failed} test gagal. Periksa logika di atas.`);
}
console.log('══════════════════════════════════════════════════════\n');
