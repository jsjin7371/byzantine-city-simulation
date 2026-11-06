"""PR 변경을 BAZE AI로 리뷰하고 줄 단위 댓글로 남긴다.

.github/workflows/ai_code_review.yml에서 실행한다. 표준 라이브러리만 사용.
로컬 확인: python .github/scripts/ai_review.py --dry-run  (댓글 없이 결과만 출력)
"""
import json
import os
import subprocess
import sys
from urllib.request import Request, urlopen

INSTRUCTIONS_PATH = ".github/ai-review-instructions.md"
SKIP_FILES = {"pnpm-lock.yaml", "package-lock.json", "yarn.lock"}  # 자동 생성 파일은 리뷰하지 않음


def get_diff(base_ref):
    """1. 이 PR에서 바뀐 부분만 diff로 가져온다 (git diff origin/base...HEAD)."""
    raise NotImplementedError


def parse_diff(diff):
    """2. diff를 파일별로 나누고 줄 번호를 붙인다.

    반환: [{"path", "text": 줄 번호 붙인 diff, "lines": 줄 수, "commentable": {줄 번호, ...}}, ...]
    SKIP_FILES는 제외한다.
    """
    raise NotImplementedError


def make_chunks(files, chunk_lines, max_calls):
    """3. 경로 순으로 정렬해 chunk_lines 이하 묶음으로 나눈다.

    반환: (묶음 목록, 리뷰하지 못한 파일 경로 목록)
    """
    raise NotImplementedError


def pr_overview(files):
    """4. 모든 묶음에 붙일 PR 개요: 제목·설명(GITHUB_EVENT_PATH), 커밋 메시지, 바뀐 파일 목록."""
    raise NotImplementedError


def ask_ai(instructions, overview, chunk):
    """4. 묶음 하나를 BAZE에 보내고 답을 dict로 받는다.

    반환: {"summary": str, "comments": [{"path", "line", "severity", "title", "body"}]}
    JSON이 아니면 {"summary": 받은 글, "comments": []}
    """
    raise NotImplementedError


def collect(answers, files):
    """5. 묶음별 답을 모은다. 댓글 가능한 줄이 아니면 기타 지적으로 옮긴다.

    반환: (요약, 줄 댓글 목록, 기타 지적 목록)
    """
    raise NotImplementedError


def post_review(body, comments):
    """6. PR 리뷰 하나로 올린다 (event: COMMENT). 거부되면 줄 댓글 없이 요약만 다시 올린다."""
    raise NotImplementedError


def main():
    dry_run = "--dry-run" in sys.argv

    files = parse_diff(get_diff(os.environ["BASE_REF"]))
    chunks, skipped = make_chunks(files, int(os.environ["CHUNK_LINES"]), int(os.environ["MAX_CALLS"]))

    with open(INSTRUCTIONS_PATH, encoding="utf-8") as f:
        instructions = f.read()
    overview = pr_overview(files)
    answers = [ask_ai(instructions, overview, chunk) for chunk in chunks]

    summary, comments, extra = collect(answers, files)
    body = summary  # TODO: 기타 지적, 리뷰하지 못한 파일(skipped), 모델 이름을 덧붙임

    if dry_run:
        print(body)
        print(json.dumps(comments, ensure_ascii=False, indent=2))
    else:
        post_review(body, comments)


if __name__ == "__main__":
    main()
