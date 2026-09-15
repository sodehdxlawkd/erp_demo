/* ============================================================
   🎓 교육용 가상 인사총무 ERP — 로컬 개발 서버
   ------------------------------------------------------------
   앱이 data/가상_인사총무.json 을 실제로 읽으려면 http:// 주소가
   필요합니다. 파일을 그냥 더블클릭하면(file://) 브라우저 보안 정책상
   외부 파일을 못 읽기 때문입니다.

   실행:  node 로컬서버.mjs
   중지:  터미널에서 Ctrl + C

   외부 패키지를 설치하지 않습니다. Node 기본 기능만 사용합니다.
   이 서버는 내 컴퓨터(127.0.0.1)에서만 접속됩니다.
   ============================================================ */

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const HOST = '127.0.0.1';
const START_PORT = Number(process.env.PORT) || 8123;
const INDEX = 'index.html';                       // 시작 화면
const APP   = '인사총무ERP_교육용가상자료.html';   // 실제 앱

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mjs' : 'text/javascript; charset=utf-8',
  '.js'  : 'text/javascript; charset=utf-8',
  '.css' : 'text/css; charset=utf-8',
  '.md'  : 'text/plain; charset=utf-8',
  '.png' : 'image/png',
  '.svg' : 'image/svg+xml',
  '.ico' : 'image/x-icon'
};

/* ── AI(Gemini) 연결 시험 ─────────────────────────────────────
   ⚠️ API 키는 이 서버 안에만 둡니다. 브라우저로 절대 내려보내지 않습니다.
      HTML에 키를 넣으면 페이지 소스에 그대로 노출되기 때문입니다.
   ⚠️ 그래서 이 기능은 로컬 서버로 열었을 때만 작동합니다.
      더블클릭(file://)이나 인터넷 배포본에서는 조용히 '사용 불가'로 표시됩니다.
   ------------------------------------------------------------ */

const AI_MODEL = 'gemini-3.6-flash';                   // 기본 모델
const AI_BASE  = 'https://generativelanguage.googleapis.com/v1beta';

/* .env 에서 키를 읽습니다. 값은 메모리에만 두고 어디에도 출력하지 않습니다. */
function readApiKey(){
  for (const name of ['GEMINI_API_KEY', 'GOOGLE_API_KEY']) {
    if (process.env[name]) return process.env[name].trim();
  }
  for (const file of ['.env', join('미사용', '.env')]) {   // 예전 위치도 찾아 줍니다
    const path = join(ROOT, file);
    if (!existsSync(path)) continue;
    const lines = readFileSync(path, 'utf8').split(/\r?\n/).map(l => l.trim())
      .filter(l => l && !l.startsWith('#'));

    // ① 정상 형식: GEMINI_API_KEY=값
    for (const line of lines) {
      const i = line.indexOf('=');
      if (i < 0) continue;
      const name = line.slice(0, i).trim();
      if (name === 'GEMINI_API_KEY' || name === 'GOOGLE_API_KEY') {
        return line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
      }
    }
    // ② 이름 없이 키 값만 덩그러니 적힌 줄 (gemini/gemini_호출.py 와 같은 처리)
    const bare = lines.find(l => !l.includes('=') && l.length >= 20);
    if (bare) return bare.replace(/^["']|["']$/g, '');
  }
  return '';
}
const AI_KEY = readApiKey();

function sendJson(res, code, obj){
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

/* 모델 이름이 바뀌어도 동작하도록, 404가 나면 쓸 수 있는 모델을 찾아 다시 시도합니다 */
let aiModelInUse = AI_MODEL;
async function pickModel(){
  const r = await fetch(`${AI_BASE}/models`, { headers: { 'x-goog-api-key': AI_KEY } });
  if (!r.ok) return null;
  const j = await r.json();
  const usable = (j.models || []).filter(m => (m.supportedGenerationMethods || []).includes('generateContent'));
  const pick = usable.find(m => m.name.includes('flash')) || usable[0];
  return pick ? pick.name.replace(/^models\//, '') : null;
}

async function callGemini(question){
  const body = JSON.stringify({ contents: [{ parts: [{ text: question }] }] });
  const ask = model => fetch(`${AI_BASE}/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': AI_KEY, 'Content-Type': 'application/json' },
    body
  });

  let r = await ask(aiModelInUse);
  if (r.status === 404) {                       // 모델 이름이 맞지 않을 때만 한 번 더
    const found = await pickModel();
    if (found) { aiModelInUse = found; r = await ask(found); }
  }

  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    // 구글이 돌려준 오류 메시지만 전달합니다 (키는 포함되지 않습니다)
    throw new Error(j?.error?.message || `호출 실패 (HTTP ${r.status})`);
  }
  const text = (j.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('').trim();
  if (!text) throw new Error('응답은 왔지만 내용이 비어 있습니다.');
  return text;
}

async function handleAi(req, res, url){
  // 키가 있는지만 알려줍니다. 키 자체는 절대 내려보내지 않습니다.
  if (url.pathname === '/api/ai/status') {
    return sendJson(res, 200, { 준비됨: Boolean(AI_KEY), 모델: aiModelInUse });
  }

  if (url.pathname === '/api/ai/ask' && req.method === 'POST') {
    if (!AI_KEY) return sendJson(res, 503, {
      error: '.env 에서 GEMINI_API_KEY 를 찾지 못했습니다. 프로젝트 폴더의 .env 에 ' +
             'GEMINI_API_KEY=키 형식으로 한 줄 넣어주세요.' });

    let raw = '';
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > 4000) return sendJson(res, 413, { error: '질문이 너무 깁니다.' });
    }
    let question = '';
    try { question = (JSON.parse(raw || '{}').question || '').trim(); }
    catch { return sendJson(res, 400, { error: '요청 형식이 잘못되었습니다.' }); }
    if (!question) return sendJson(res, 400, { error: '질문을 입력해 주세요.' });

    const started = Date.now();
    try {
      const answer = await callGemini(question);
      return sendJson(res, 200, { 모델: aiModelInUse, 답변: answer, 걸린시간: Date.now() - started });
    } catch (err) {
      return sendJson(res, 502, { error: err.message });
    }
  }

  return sendJson(res, 404, { error: '없는 API 주소입니다: ' + url.pathname });
}

const server = createServer(async (req, res) => {
  try {
    // 주소에서 경로만 꺼내 한글을 원래 글자로 되돌립니다
    const reqUrl = new URL(req.url, `http://${HOST}`);

    // /api/... 는 파일이 아니라 AI 연결 시험으로 처리합니다
    if (reqUrl.pathname.startsWith('/api/')) return handleAi(req, res, reqUrl);

    let path = decodeURIComponent(reqUrl.pathname);
    if (path === '/' ) path = '/' + INDEX;

    // 브라우저가 자동으로 찾는 탭 아이콘 — 없어도 정상이므로 조용히 응답
    if (path === '/favicon.ico') { res.writeHead(204); return res.end(); }

    // 상위 폴더로 빠져나가려는 요청 차단 (../ 같은 것)
    const target = normalize(join(ROOT, path));
    if (!target.startsWith(ROOT.endsWith(sep) ? ROOT : ROOT + sep)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('403 — 이 폴더 밖은 열 수 없습니다');
    }

    const info = await stat(target).catch(() => null);
    if (!info || !info.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end(`404 — 파일을 찾을 수 없습니다: ${path}`);
    }

    const body = await readFile(target);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(target).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store'          // 고친 내용이 바로 보이게
    });
    res.end(body);
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('500 — ' + err.message);
  }
});

// 포트가 이미 쓰이고 있으면 다음 번호로 최대 20번까지 시도합니다
let port = START_PORT;
server.on('error', err => {
  if (err.code === 'EADDRINUSE' && port < START_PORT + 20) {
    console.log(`포트 ${port} 사용 중 → ${port + 1} 시도`);
    server.listen(++port, HOST);
  } else {
    console.error('서버를 켤 수 없습니다:', err.message);
    process.exit(1);
  }
});

server.listen(port, HOST, () => {
  console.log('');
  console.log('  🎓 교육용 가상 인사총무 ERP — 로컬 서버 실행 중');
  console.log('  ' + '─'.repeat(52));
  console.log(`  주소 : http://${HOST}:${port}/`);
  console.log('  폴더 : ' + ROOT);
  console.log('  중지 : Ctrl + C');
  console.log('');
  console.log(`  시작 화면 : ${INDEX}`);
  console.log(`  앱 바로가기: http://${HOST}:${port}/${encodeURIComponent(APP)}`);
  console.log('  이 주소로 열면 data/가상_인사총무.json 을 실제로 읽습니다.');
  console.log('');
});
