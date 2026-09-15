/* ============================================================
   🎓 교육용 가상 인사총무 ERP — 버셀 배포용 사본 만들기
   ------------------------------------------------------------
   왜 필요한가:
   버셀은 한글(비ASCII) 파일명을 주소로 찾지 못해 404를 냅니다.
   그렇다고 원본 파일명을 영문으로 바꾸면, 파일명 자체가
   PRD §8의 '교육용 가상 자료 표시 4곳' 중 하나라 규칙이 깨집니다.

   그래서 원본은 한글 그대로 두고, 배포할 때만 이 스크립트가
   dist/ 폴더에 영문 이름 사본을 만듭니다.
   내 PC에서 더블클릭·로컬서버로 여는 방식은 전혀 달라지지 않습니다.

   실행:  node vercel-build.mjs      (버셀이 배포할 때 자동 실행)
   ============================================================ */

import { mkdirSync, copyFileSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';

const OUT = 'dist';

// 한글 이름 → 영문 이름. 파일명이 '교육용 가상 자료'임을 영문으로도 남깁니다.
const RENAME = {
  '인사총무ERP_교육용가상자료.html': 'edu-fictional-hr-erp.html',
  'data/가상_인사총무.json'        : 'data/edu-fictional-hr-data.json',
  '데이터안내.md'                  : 'data-guide.md',
  '확인예시.md'                    : 'check-example.md',
  '레퍼런스.md'                    : 'reference.md',
  '배포안내.md'                    : 'deploy-guide.md'
};

// 이름을 바꾸지 않고 그대로 올리는 파일 (이미 영문)
const ASIS = ['index.html', 'PRD.md', 'DESIGN.md'];

// 안에 든 링크·경로까지 고쳐야 하는 파일 (HTML만)
const PATCH = new Set(['index.html', '인사총무ERP_교육용가상자료.html']);

rmSync(OUT, { recursive: true, force: true });

function put(to, body){
  const path = join(OUT, to);
  mkdirSync(dirname(path), { recursive: true });
  typeof body === 'string' ? writeFileSync(path, body, 'utf8') : copyFileSync(body, path);
}

/* 파일 안의 경로를 새 이름으로 바꿉니다.
   HTML에는 한글이 그대로 적힌 곳과 %EC%9D%B8… 식으로 인코딩된 곳이 둘 다 있어
   두 가지 표기를 모두 찾아 바꿉니다. */
function patch(text){
  for (const [from, to] of Object.entries(RENAME)) {
    text = text.split(from).join(to);
    text = text.split(encodeURI(from)).join(to);
    text = text.split(from.split('/').map(encodeURIComponent).join('/')).join(to);
  }
  return text;
}

const done = [];
for (const [from, to] of Object.entries(RENAME)) {
  put(to, PATCH.has(from) ? patch(readFileSync(from, 'utf8')) : from);
  done.push(`${from}  →  ${to}`);
}
for (const f of ASIS) {
  put(f, PATCH.has(f) ? patch(readFileSync(f, 'utf8')) : f);
  done.push(`${f}  (이름 그대로)`);
}

console.log('배포용 사본을 만들었습니다 — ' + OUT + '/');
done.forEach(l => console.log('  ' + l));
