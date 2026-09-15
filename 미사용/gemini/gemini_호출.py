"""
Gemini API 호출 예제 (파이썬)

참고 문서: https://ai.google.dev/gemini-api/docs/get-started?hl=ko

준비
  1) pip install -U google-genai
  2) 프로젝트 폴더에 .env 파일을 만들고 아래 한 줄을 넣습니다.
        GEMINI_API_KEY=여기에_키를_붙여넣기

실행
  python gemini/gemini_호출.py
  python gemini/gemini_호출.py "물어보고 싶은 내용"
"""

import os
import sys
from pathlib import Path

# Windows 기본 콘솔(cp949)은 이모지를 출력하지 못해 오류가 납니다.
for stream in (sys.stdout, sys.stderr):
    try:
        stream.reconfigure(encoding="utf-8")
    except (AttributeError, OSError):
        pass

# ── 설정 ────────────────────────────────────────────────
MODEL = "gemini-3.6-flash"
DEFAULT_PROMPT = "인사총무 담당자에게 ERP가 왜 필요한지 세 줄로 설명해줘."

# .env 는 이 파일의 상위 폴더(프로젝트 루트)에 있습니다
ENV_PATH = Path(__file__).resolve().parent.parent / ".env"


def load_api_key() -> str:
    """.env 에서 API 키를 읽습니다. 환경변수가 이미 있으면 그것을 먼저 씁니다."""

    # 1) 이미 환경변수로 설정돼 있으면 그대로 사용
    for name in ("GEMINI_API_KEY", "GOOGLE_API_KEY"):
        if os.environ.get(name):
            return os.environ[name]

    # 2) .env 파일 읽기
    if not ENV_PATH.exists():
        sys.exit(f"❌ .env 파일이 없습니다: {ENV_PATH}\n"
                 f"   파일을 만들고 다음 한 줄을 넣어주세요:\n"
                 f"   GEMINI_API_KEY=여기에_키")

    for raw in ENV_PATH.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue

        if "=" in line:                        # 정상 형식: 이름=값
            name, _, value = line.partition("=")
            if name.strip() in ("GEMINI_API_KEY", "GOOGLE_API_KEY"):
                return value.strip().strip('"').strip("'")
        else:                                  # 값만 덩그러니 있는 경우 (변수 이름 없음)
            return line

    sys.exit("❌ .env 안에서 GEMINI_API_KEY 를 찾지 못했습니다.")


def main() -> None:
    api_key = load_api_key()

    try:
        from google import genai
    except ImportError:
        sys.exit("❌ google-genai 패키지가 없습니다.\n"
                 "   설치:  pip install -U google-genai")

    prompt = " ".join(sys.argv[1:]) or DEFAULT_PROMPT

    print(f"모델   : {MODEL}")
    print(f"질문   : {prompt}")
    print("-" * 60)

    client = genai.Client(api_key=api_key)

    try:
        interaction = client.interactions.create(model=MODEL, input=prompt)
    except Exception as err:
        sys.exit(f"❌ 호출 실패: {type(err).__name__}: {err}")

    print(interaction.output_text)


if __name__ == "__main__":
    main()
