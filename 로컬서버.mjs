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

const server = createServer(async (req, res) => {
  try {
    // 주소에서 경로만 꺼내 한글을 원래 글자로 되돌립니다
    const reqUrl = new URL(req.url, `http://${HOST}`);
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
