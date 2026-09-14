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
import { readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
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

/* ── DART 공시 API 중계 ──────────────────────────────────────
   ⚠️ API 키는 이 서버에만 두고, 브라우저로 절대 내려보내지 않습니다.
      HTML에 키를 넣으면 페이지 소스에 그대로 노출됩니다.
   ⚠️ DART OpenAPI 는 CORS 헤더를 주지 않아 브라우저에서 직접
      호출할 수 없습니다. 그래서 이 서버가 대신 호출해 전달합니다.
   ------------------------------------------------------------ */

const DART_BASE = 'https://opendart.fss.or.kr/api';

// 허용된 API 주소만 중계합니다 (임의 주소 호출 방지)
const DART_ENDPOINTS = new Set([
  'stockTotqySttus','tesstkAcqsDspsSttus','alotMatter','irdsSttus','detScritsIsuAcmslt',
  'entrprsBilScritsNrdmpBlce','srtpdPsndbtNrdmpBlce','cprndNrdmpBlce','newCaplScritsNrdmpBlce',
  'cndlCaplScritsNrdmpBlce','pssrpCptalUseDtls','prvsrpCptalUseDtls','accnutAdtorNmNdAdtOpinion',
  'adtServcCnclsSttus','accnutAdtorNonAdtServcCnclsSttus','outcmpnyDrctrNdChangeSttus',
  'hyslrSttus','hyslrChgSttus','mrhlSttus','exctvSttus','empSttus','unrstExctvMendngSttus',
  'drctrAdtAllMendngSttusGmtsckConfmAmount','drctrAdtAllMendngSttusMendngPymntamtTyCl',
  'indvdlByPay','indvdlByPayV2','otrCprInvstmntSttus'
]);

function readEnv(){
  try{
    return Object.fromEntries(
      readFileSync(join(ROOT, '.env'), 'utf8').split(/\r?\n/)
        .filter(l => l.includes('=') && !l.trim().startsWith('#'))
        .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
    );
  }catch{ return {}; }
}
const DART_KEY = process.env.DART_API_KEY || readEnv().DART_API_KEY || '';

/* ── 회사 고유번호 목록 (회사명으로 찾기) ──────────────────
   DART가 주는 corpCode.zip 안의 XML을 풀어 메모리에 담아 둡니다.
   약 10만 건이라 처음 한 번만 몇 초 걸리고, 이후에는 즉시 응답합니다.  */
let corpList = null, corpLoading = null;

function unzipFirstEntry(buf){
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('ZIP 형식이 아닙니다');
  const cd = buf.readUInt32LE(eocd + 16);
  const method   = buf.readUInt16LE(cd + 10);
  const compSize = buf.readUInt32LE(cd + 20);
  const lh       = buf.readUInt32LE(cd + 42);
  const start    = lh + 30 + buf.readUInt16LE(lh + 26) + buf.readUInt16LE(lh + 28);
  const data     = buf.subarray(start, start + compSize);
  return method === 0 ? data : inflateRawSync(data);
}

async function loadCorpList(){
  if (corpList) return corpList;
  if (corpLoading) return corpLoading;
  corpLoading = (async () => {
    console.log('  회사 목록을 내려받는 중… (처음 한 번만, 몇 초 걸립니다)');
    const r = await fetch(`${DART_BASE}/corpCode.xml?crtfc_key=${DART_KEY}`);
    const xml = unzipFirstEntry(Buffer.from(await r.arrayBuffer())).toString('utf8');
    // 구조: <list><corp_code>·<corp_name>·<corp_eng_name>·<stock_code>·<modify_date></list>
    const unesc = s => s.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>')
                        .replace(/&quot;/g,'"').replace(/&apos;/g,"'");
    const out = [];
    const re = /<corp_code>(.*?)<\/corp_code>\s*<corp_name>([\s\S]*?)<\/corp_name>\s*<corp_eng_name>([\s\S]*?)<\/corp_eng_name>\s*<stock_code>(.*?)<\/stock_code>/g;
    let m;
    while ((m = re.exec(xml))) {
      out.push({ code: m[1].trim(), name: unesc(m[2]).trim(), eng: unesc(m[3]).trim(), stock: m[4].trim() });
    }
    corpList = out;
    console.log(`  회사 목록 준비 완료 — ${out.length.toLocaleString('ko-KR')}건`);
    return out;
  })();
  return corpLoading;
}

function sendJson(res, code, obj){
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

async function handleApi(req, res, url){
  if (!DART_KEY) return sendJson(res, 500,
    { error: '.env 에서 DART_API_KEY 를 찾지 못했습니다. GEMINI_API_KEY 처럼 이름=값 형식으로 넣어주세요.' });

  // 회사명으로 고유번호 찾기
  if (url.pathname === '/api/corp-search') {
    const q = (url.searchParams.get('q') || '').trim();
    if (q.length < 1) return sendJson(res, 400, { error: '검색어를 입력해 주세요.' });
    try{
      const list = await loadCorpList();
      const listed = url.searchParams.get('listed') === '1';
      const lower = q.toLowerCase();
      // 한글명·영문명·종목코드 어느 쪽으로 쳐도 찾히게 합니다
      // (예: 네이버 → NAVER, 035420 → NAVER)
      const hit = list.filter(c =>
        (c.name.includes(q) || c.eng.toLowerCase().includes(lower) || c.stock === q)
        && (!listed || c.stock));
      // 이름이 정확히 일치 → 상장사 → 이름 짧은 순
      hit.sort((a, b) =>
        (b.name === q) - (a.name === q) ||
        (b.stock ? 1 : 0) - (a.stock ? 1 : 0) ||
        a.name.length - b.name.length);
      return sendJson(res, 200, { count: hit.length, list: hit.slice(0, 30) });
    }catch(e){ return sendJson(res, 502, { error: '회사 목록을 불러오지 못했습니다: ' + e.message }); }
  }

  // 정기보고서 주요정보 중계
  const m = url.pathname.match(/^\/api\/dart\/([A-Za-z0-9]+)$/);
  if (m) {
    const ep = m[1];
    if (!DART_ENDPOINTS.has(ep)) return sendJson(res, 400, { error: `허용되지 않은 API: ${ep}` });

    const qs = new URLSearchParams({ crtfc_key: DART_KEY });
    for (const k of ['corp_code', 'bsns_year', 'reprt_code']) {
      const v = url.searchParams.get(k);
      if (!v) return sendJson(res, 400, { error: `${k} 값이 필요합니다.` });
      qs.set(k, v);
    }
    try{
      const r = await fetch(`${DART_BASE}/${ep}.json?${qs}`);
      const body = await r.text();
      res.writeHead(r.status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(body);
    }catch(e){ return sendJson(res, 502, { error: 'DART 호출 실패: ' + e.message }); }
  }

  return sendJson(res, 404, { error: '없는 API 주소입니다: ' + url.pathname });
}

const server = createServer(async (req, res) => {
  try {
    // 주소에서 경로만 꺼내 한글을 원래 글자로 되돌립니다
    const reqUrl = new URL(req.url, `http://${HOST}`);

    // /api/... 는 파일이 아니라 DART 중계로 처리합니다
    if (reqUrl.pathname.startsWith('/api/')) return handleApi(req, res, reqUrl);

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
