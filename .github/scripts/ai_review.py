"""PR 변경을 BAZE AI로 리뷰하고 줄 단위 댓글로 남긴다.

.github/workflows/ai_code_review.yml에서 실행한다. 표준 라이브러리만 사용.

로컬 확인 (레포 맨 위 폴더에서):
    python .github/scripts/ai_review.py --dry-run
    - BAZE_API_KEY가 없으면: AI를 부르지 않고 PR 개요와 묶음만 출력
    - BAZE_API_KEY, MODEL이 있으면: AI 리뷰 결과를 댓글 대신 화면에 출력

선택 환경 변수:
    MAX_TOKENS        AI 답의 최대 토큰 (기본 16000. 추론 모델은 생각에 쓴 토큰도 여기서 빠짐)
    REASONING_EFFORT  low | medium | high. 비우면 보내지 않음 (지원하는 모델만)
    JSON_SCHEMA       1이면 답을 JSON 스키마로 강제 (지원하는 모델만)
"""
import json
import os
import re
import subprocess
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

INSTRUCTIONS_PATH = ".github/ai-review-instructions.md"
SKIP_FILES = {"pnpm-lock.yaml", "package-lock.json", "yarn.lock"}  # 자동 생성 파일은 리뷰하지 않음
SEVERITIES = ("High", "Medium", "Low")
SEVERITY_ICON = {"High": "🔴", "Medium": "🟠", "Low": "🟡"}  # 댓글에 표시할 때만 붙임 (AI 답에는 없음)
DEFAULT_BAZE_URL = "https://api.baze.co/v1/gateway"
HUNK_HEADER = re.compile(r"^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@")
MAX_BODY = 60000  # GitHub 리뷰 본문 길이 제한(65536자)보다 여유 있게
IDLE_TIMEOUT = 120  # 스트리밍 중 이 시간 동안 아무것도 안 오면 끊긴 것으로 봄
PROGRESS_EVERY = 10  # 진행 상황 출력 간격(초)

# JSON_SCHEMA=1일 때 AI 답을 이 형식으로 강제 (strict 모드는 모든 키 필수 + 추가 키 금지)
RESPONSE_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["summary", "comments"],
    "properties": {
        "summary": {"type": "string"},
        "comments": {"type": "array", "items": {
            "type": "object",
            "additionalProperties": False,
            "required": ["path", "line", "severity", "title", "body"],
            "properties": {
                "path": {"type": "string"},
                "line": {"type": "integer"},
                "severity": {"type": "string", "enum": list(SEVERITIES)},
                "title": {"type": "string"},
                "body": {"type": "string"},
            },
        }},
    },
}


class ApiError(Exception):
    """재시도 후에도 실패한 API 호출. 메시지에 서버가 보낸 에러 내용이 들어 있다."""


def log(message):
    """진행 상황은 stderr로 바로 출력 (Actions 로그에 실시간으로 보이게)."""
    print(message, file=sys.stderr, flush=True)


def git(*args):
    """git 명령을 실행하고 출력을 돌려준다. 한글 경로가 깨지지 않게 quotepath를 끈다."""
    return subprocess.run(
        ["git", "-c", "core.quotepath=off", *args],
        check=True, capture_output=True, text=True, encoding="utf-8", errors="replace",
    ).stdout


def http_json(method, url, headers, data=None, timeout=60):
    """JSON을 보내고 JSON 응답을 dict로 돌려준다. 실패하면 HTTPError 등 예외."""
    body = None if data is None else json.dumps(data).encode()
    request = Request(url, data=body, method=method, headers={
        "Content-Type": "application/json", "User-Agent": "byzantine-ai-review", **headers,
    })
    with urlopen(request, timeout=timeout) as response:
        return json.loads(response.read())


def with_retry(call, label):
    """call()을 실행한다. 429·5xx·연결 실패면 한 번만 다시 시도하고, 그래도 실패하면 ApiError."""
    for attempt in (1, 2):
        try:
            return call()
        except HTTPError as e:
            detail = e.read().decode(errors="replace")[:500]
            if attempt == 2 or e.code not in (429, 502, 503, 504):
                raise ApiError(f"{label}: HTTP {e.code} {detail}") from None
            try:  # 429는 Retry-After만큼 기다림. 없으면(크레딧 예약 한도 6005) 1분
                wait = int(e.headers.get("Retry-After") or (60 if e.code == 429 else 10))
            except ValueError:
                wait = 60
            log(f"{label}: HTTP {e.code}, {wait}초 뒤 다시 시도")
        except (URLError, OSError) as e:  # 연결 실패, 응답이 IDLE_TIMEOUT 동안 끊김
            if attempt == 2:
                raise ApiError(f"{label}: 연결 실패 {e}") from None
            wait = 10
            log(f"{label}: 연결 실패({e}), {wait}초 뒤 다시 시도")
        time.sleep(wait)


def stream_chat(url, payload, label):
    """스트리밍(SSE)으로 답을 조각조각 받아 이어 붙인다.

    답을 다 만들 때까지 기다리지 않고 만드는 대로 받으므로, 게이트웨이가 오래 기다리다 끊는(502) 일이 없다.
    반환: (답 본문, 사용 토큰 수)
    """
    request = Request(url, data=json.dumps(payload).encode(), method="POST", headers={
        "Content-Type": "application/json",
        "Accept": "text/event-stream",
        "User-Agent": "byzantine-ai-review",
        "Authorization": f"Bearer {os.environ['BAZE_API_KEY']}",
    })
    content, thinking, tokens = [], 0, 0
    started = last_log = time.monotonic()
    with urlopen(request, timeout=IDLE_TIMEOUT) as response:
        for raw in response:
            line = raw.decode("utf-8", errors="replace").strip()
            if not line.startswith("data:"):
                continue  # 빈 줄, 연결 유지용 주석 등
            data = line[5:].strip()
            if data == "[DONE]":
                break
            try:
                event = json.loads(data)
            except ValueError:
                continue
            if event.get("error"):  # 스트림이 시작된 뒤의 오류는 이렇게 온다
                raise ApiError(f"{label}: 스트림 중 오류 {event['error']}")

            tokens = (event.get("usage") or {}).get("total_tokens") or tokens
            for choice in event.get("choices") or []:
                delta = choice.get("delta") or {}
                content.append(delta.get("content") or "")
                thinking += len(delta.get("reasoning_content") or delta.get("reasoning") or "")

            now = time.monotonic()
            if now - last_log >= PROGRESS_EVERY:
                log(f"{label} 받는 중… {now - started:.0f}초, 답 {sum(map(len, content))}자, 생각 {thinking}자")
                last_log = now
    return "".join(content), tokens


def get_diff(base_ref):
    """1. 이 PR에서 바뀐 부분만 diff로 가져온다 (갈라진 지점부터 PR 브랜치까지)."""
    return git("diff", "--no-color", "--no-ext-diff", f"origin/{base_ref}...HEAD")


def parse_diff(diff):
    """2. diff를 파일별로 나누고 줄 번호를 붙인다.

    반환: [{"path", "rows": 줄 번호 붙인 diff 줄 목록, "commentable": {댓글 가능한 줄 번호}}, ...]
    삭제된 파일, 바이너리 파일, SKIP_FILES는 제외한다.
    """
    files, current, in_hunk, line_no = [], None, False, 0
    for raw in diff.splitlines():
        if raw.startswith("diff --git "):
            current = {"path": None, "rows": [], "commentable": set()}
            files.append(current)
            in_hunk = False
            continue
        if current is None:
            continue
        hunk = HUNK_HEADER.match(raw)
        if hunk:
            in_hunk, line_no = True, int(hunk.group(1))
            current["rows"].append("")  # 덩어리 사이 구분용 빈 줄
        elif not in_hunk:
            if raw.startswith("+++ "):
                path = raw[4:].strip().strip('"')
                current["path"] = None if path == "/dev/null" else path.removeprefix("b/")
        elif raw.startswith("+"):
            current["rows"].append(f"{line_no:>5} + {raw[1:]}")
            current["commentable"].add(line_no)
            line_no += 1
        elif raw.startswith("-"):
            current["rows"].append(f"{'':>5} - {raw[1:]}")
        elif raw.startswith(" ") or raw == "":
            current["rows"].append(f"{line_no:>5}   {raw[1:]}")
            current["commentable"].add(line_no)  # 바뀐 줄 주변의 그대로인 줄도 댓글 가능
            line_no += 1
        # "\ No newline at end of file" 같은 줄은 무시

    return [
        f for f in files
        if f["path"] and f["commentable"] and os.path.basename(f["path"]) not in SKIP_FILES
    ]


def make_chunks(files, chunk_lines, max_calls):
    """3. 경로 순으로 정렬해 chunk_lines 이하 묶음으로 나눈다.

    chunk_lines보다 큰 파일은 여러 조각으로 자른다.
    반환: (묶음 텍스트 목록, 리뷰하지 못한 파일 경로 목록)
    """
    pieces = []  # (경로, 텍스트, 줄 수)
    for f in sorted(files, key=lambda f: f["path"]):
        for start in range(0, len(f["rows"]), chunk_lines):
            part = f["rows"][start:start + chunk_lines]
            title = f["path"] if start == 0 else f"{f['path']} (이어서)"
            pieces.append((f["path"], f"### {title}\n" + "\n".join(part), len(part)))

    chunks, size = [], 0
    for piece in pieces:
        if chunks and size + piece[2] <= chunk_lines:
            chunks[-1].append(piece)
            size += piece[2]
        else:
            chunks.append([piece])
            size = piece[2]

    skipped = sorted({path for chunk in chunks[max_calls:] for path, _, _ in chunk})
    texts = ["\n\n".join(text for _, text, _ in chunk) for chunk in chunks[:max_calls]]
    return texts, skipped


def pr_overview(base_ref):
    """4. 모든 묶음에 붙일 PR 개요: 제목·설명, 커밋 메시지, 바뀐 파일 전체 목록."""
    title, body = "", ""
    event_path = os.environ.get("GITHUB_EVENT_PATH")
    if event_path:
        with open(event_path, encoding="utf-8") as f:
            pr = json.load(f).get("pull_request") or {}
        title, body = pr.get("title") or "", (pr.get("body") or "")[:3000]

    commits = git("log", "--no-merges", "--format=- %s", f"origin/{base_ref}..HEAD").splitlines()[:100]
    stats = []
    for line in git("diff", "--numstat", f"origin/{base_ref}...HEAD").splitlines():
        added, removed, path = line.split("\t", 2)
        stats.append(f"- {path} (+{added} -{removed})")

    return "\n".join([
        "## PR 개요",
        f"제목: {title}",
        f"설명:\n{body}",
        "",
        "커밋:", *commits,
        "",
        "바뀐 파일 전체 (이번 요청에는 이 중 일부만 들어 있을 수 있음):", *stats,
    ])


def parse_answer(content):
    """AI 답에서 JSON을 꺼낸다. 코드 블록(```json)으로 감싸도 처리한다.

    JSON이 아니면 받은 글 전체를 요약으로 쓴다.
    """
    start, end = content.find("{"), content.rfind("}")
    try:
        data = json.loads(content[start:end + 1])
        if isinstance(data, dict) and isinstance(data.get("comments", []), list):
            return {"summary": str(data.get("summary", "")).strip(), "comments": data.get("comments") or []}
    except ValueError:
        pass
    return {"summary": content.strip(), "comments": []}


def ask_ai(instructions, overview, chunk, model, label):
    """4. 묶음 하나를 BAZE에 보내고 답을 받는다.

    반환: ({"summary": str, "comments": [{"path", "line", "severity", "title", "body"}]}, 사용 토큰 수)
    """
    url = os.environ.get("BAZE_URL", DEFAULT_BAZE_URL).rstrip("/") + "/chat/completions/"
    payload = {
        "model": model,
        "stream": True,
        "stream_options": {"include_usage": True},  # 마지막 조각에 사용량을 넣어 달라는 설정
        "max_tokens": int(os.environ.get("MAX_TOKENS") or 16000),
        "messages": [
            {"role": "system", "content": instructions},
            {"role": "user", "content": f"{overview}\n\n## 리뷰할 변경 (줄 번호 붙은 diff)\n{chunk}"},
        ],
    }
    if os.environ.get("REASONING_EFFORT"):
        payload["reasoning_effort"] = os.environ["REASONING_EFFORT"]
    if os.environ.get("JSON_SCHEMA") == "1":
        payload["response_format"] = {
            "type": "json_schema",
            "json_schema": {"name": "code_review", "strict": True, "schema": RESPONSE_SCHEMA},
        }

    content, tokens = with_retry(lambda: stream_chat(url, payload, label), label)
    return parse_answer(content), tokens


def collect(answers, files):
    """5. 묶음별 답을 모은다. 댓글 가능한 줄이 아니면 기타 지적으로 옮긴다.

    반환: (요약, 줄 댓글 목록, 기타 지적 목록)
    """
    commentable = {f["path"]: f["commentable"] for f in files}
    summaries, comments, extra, seen = [], [], [], set()

    for i, answer in enumerate(answers, 1):
        if answer["summary"]:
            summaries.append(answer["summary"] if len(answers) == 1 else f"**묶음 {i}**\n{answer['summary']}")

        for c in answer["comments"]:
            if not isinstance(c, dict):
                continue
            path = str(c.get("path", "")).strip()
            try:
                line = int(c.get("line"))
            except (TypeError, ValueError):
                line = None
            severity = c.get("severity") if c.get("severity") in SEVERITIES else "Medium"
            title = str(c.get("title", "")).strip() or "지적"
            text = str(c.get("body", "")).strip()

            if (path, line, title) in seen:  # 같은 지적이 여러 묶음에서 나오면 한 번만
                continue
            seen.add((path, line, title))

            if line in commentable.get(path, ()):
                comments.append({"path": path, "line": line, "side": "RIGHT",
                                 "body": f"**[{severity} {SEVERITY_ICON[severity]}] {title}**\n\n{text}"})
            else:
                where = f"{path}:{line}" if line else path
                extra.append(f"- `{where}` **[{severity} {SEVERITY_ICON[severity]}] {title}** {text}")

    return "\n\n".join(summaries), comments, extra


def post_review(body, comments):
    """6. PR 리뷰 하나로 올린다 (event: COMMENT). 줄 댓글이 거부되면 요약만 다시 올린다."""
    api = os.environ.get("GITHUB_API_URL", "https://api.github.com")
    url = f"{api}/repos/{os.environ['REPO']}/pulls/{os.environ['PR_NUMBER']}/reviews"
    headers = {
        "Authorization": f"Bearer {os.environ['GH_TOKEN']}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    payload = {"commit_id": os.environ["HEAD_SHA"], "event": "COMMENT", "body": body, "comments": comments}
    try:
        http_json("POST", url, headers, payload)
    except HTTPError as e:
        if e.code != 422 or not comments:
            raise
        # 줄 위치가 하나라도 틀리면 GitHub가 리뷰 전체를 거부한다 → 줄 댓글을 본문 목록으로 옮겨 다시 올림
        print(f"줄 댓글이 거부되어 요약만 올립니다: {e.read().decode(errors='replace')}", file=sys.stderr)
        listed = "\n".join(f"- `{c['path']}:{c['line']}` {c['body'].replace(chr(10) * 2, ' ')}" for c in comments)
        payload.update(body=f"{body}\n\n### 줄 댓글 (위치를 찾지 못해 목록으로 대신함)\n{listed}"[:MAX_BODY],
                       comments=[])
        http_json("POST", url, headers, payload)


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    dry_run = "--dry-run" in sys.argv
    base_ref = os.environ.get("BASE_REF", "develop")
    chunk_lines = int(os.environ.get("CHUNK_LINES", "1000"))
    max_calls = int(os.environ.get("MAX_CALLS", "5"))
    model = os.environ.get("MODEL", "")

    files = parse_diff(get_diff(base_ref))
    if not files:
        print("리뷰할 변경이 없습니다.")
        return
    chunks, skipped = make_chunks(files, chunk_lines, max_calls)
    overview = pr_overview(base_ref)

    if dry_run and not os.environ.get("BAZE_API_KEY"):  # 키 없이 묶음만 확인
        print(overview)
        for i, chunk in enumerate(chunks, 1):
            print(f"\n===== 묶음 {i} =====\n{chunk}")
        print(f"\n리뷰하지 못한 파일: {skipped or '없음'}")
        return
    if not model:
        sys.exit("MODEL이 비어 있습니다. 레포 Settings → Variables에 AI_MODEL_CHEAP, AI_MODEL_STRONG을 등록하세요.")

    with open(INSTRUCTIONS_PATH, encoding="utf-8") as f:
        instructions = f.read()

    answers, total_tokens, started = [], 0, time.monotonic()
    try:
        for i, chunk in enumerate(chunks, 1):
            label = f"묶음 {i}/{len(chunks)}"
            log(f"{label} 요청 ({model}, {chunk.count(chr(10)) + 1}줄)")
            chunk_started = time.monotonic()
            answer, tokens = ask_ai(instructions, overview, chunk, model, label)
            answers.append(answer)
            total_tokens += tokens
            log(f"{label} 완료 {time.monotonic() - chunk_started:.0f}초, 지적 {len(answer['comments'])}개")
    except ApiError as e:
        sys.exit(f"BAZE 호출 실패 - {e}")
    summary, comments, extra = collect(answers, files)

    parts = ["## AI 코드 리뷰", summary or "요약 없음"]
    if extra:
        parts += ["### 기타 지적", "\n".join(extra)]
    if skipped:
        parts += ["### 리뷰하지 못한 파일 (호출 상한 초과)", "\n".join(f"- `{p}`" for p in skipped)]
    sha = os.environ.get("HEAD_SHA", "")[:7]
    footer = [f"모델 `{model}`", f"커밋 `{sha}`", f"묶음 {len(chunks)}개", f"줄 댓글 {len(comments)}개",
              f"{time.monotonic() - started:.0f}초"]
    if total_tokens:
        footer.append(f"토큰 {total_tokens:,}")
    parts.append("<sub>" + " · ".join(footer) + "</sub>")
    body = "\n\n".join(parts)[:MAX_BODY]

    if dry_run:
        print(body)
        print(json.dumps(comments, ensure_ascii=False, indent=2))
    else:
        post_review(body, comments)


if __name__ == "__main__":
    main()
