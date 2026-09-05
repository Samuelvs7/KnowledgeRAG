"""Fetch a GitHub repository as a ZIP archive over HTTPS.

We deliberately avoid shelling out to `git`: GitHub serves a downloadable zip
of any ref via codeload, and the existing ingestion pipeline already knows how
to process a ZIP. So "ingest from URL" == download zipball -> reuse pipeline.

Public repositories need no token. Private repositories require a token with
`repo` scope, supplied per-request or via the GITHUB_TOKEN environment setting.
"""
from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from typing import Optional

import httpx

from config import settings

logger = logging.getLogger(__name__)

_GITHUB_URL_RE = re.compile(
    r"""^(?:https?://)?                 # optional scheme
        (?:[\w.-]+@)?                    # optional user@ (e.g. git@ scp-like form)
        (?:www\.)?github\.com[/:]        # host
        (?P<owner>[\w.-]+)/
        (?P<repo>[\w.-]+?)
        (?:\.git)?                       # optional .git suffix
        (?:/tree/(?P<branch>[^/\s#?]+))? # optional /tree/<branch>
        (?:[/#?].*)?$                    # ignore any trailing path/query/hash
    """,
    re.VERBOSE,
)

# Bare "owner/repo" shorthand (strict charset so it can't swallow a full host).
_SHORTHAND_RE = re.compile(r"^(?P<owner>[\w.-]+)/(?P<repo>[\w.-]+?)(?:\.git)?$")


class GitHubFetchError(Exception):
    """Raised when a repository cannot be located or downloaded."""


@dataclass
class RepoArchive:
    content: bytes
    owner: str
    repo: str
    branch: str
    source_url: str


def parse_github_url(url: str) -> tuple[str, str, Optional[str]]:
    """Return (owner, repo, branch|None) from a variety of GitHub URL forms."""
    raw = (url or "").strip()
    if not raw:
        raise GitHubFetchError("No repository URL was provided.")

    match = _GITHUB_URL_RE.match(raw) or _SHORTHAND_RE.match(raw)
    if not match:
        raise GitHubFetchError(
            "That doesn't look like a GitHub repository URL. "
            "Use a form like https://github.com/owner/repo."
        )

    groups = match.groupdict()
    owner = groups["owner"]
    repo = groups["repo"]
    branch = groups.get("branch")
    return owner, repo, branch


def _auth_headers(token: Optional[str]) -> dict[str, str]:
    effective = token or settings.github_token
    headers = {"Accept": "application/vnd.github+json", "User-Agent": "KnowledgeRAG"}
    if effective:
        headers["Authorization"] = f"Bearer {effective}"
    return headers


async def _resolve_default_branch(
    client: httpx.AsyncClient, owner: str, repo: str, token: Optional[str]
) -> str:
    """Ask the GitHub API for the repo's default branch."""
    resp = await client.get(
        f"https://api.github.com/repos/{owner}/{repo}",
        headers=_auth_headers(token),
    )
    if resp.status_code == 404:
        raise GitHubFetchError(
            f"Repository {owner}/{repo} was not found. "
            "If it is private, provide a GitHub access token."
        )
    if resp.status_code in (401, 403):
        raise GitHubFetchError(
            "GitHub denied access to this repository. It may be private or rate-limited; "
            "provide a token with 'repo' scope."
        )
    resp.raise_for_status()
    return resp.json().get("default_branch") or "main"


async def _download_zip(
    client: httpx.AsyncClient, owner: str, repo: str, branch: str, token: Optional[str]
) -> Optional[bytes]:
    """Stream a branch zipball from codeload, enforcing the size cap. None if the branch is absent."""
    url = f"https://codeload.github.com/{owner}/{repo}/zip/refs/heads/{branch}"
    async with client.stream("GET", url, headers=_auth_headers(token)) as resp:
        if resp.status_code == 404:
            return None
        if resp.status_code in (401, 403):
            raise GitHubFetchError(
                "GitHub denied access to this repository archive. "
                "Provide a token with 'repo' scope for private repositories."
            )
        resp.raise_for_status()

        cap = settings.max_repo_zip_bytes
        buffer = bytearray()
        async for chunk in resp.aiter_bytes():
            buffer.extend(chunk)
            if len(buffer) > cap:
                raise GitHubFetchError(
                    f"Repository archive exceeds the {cap // (1024 * 1024)} MB limit. "
                    "Try a smaller repository or a specific subdirectory."
                )
        return bytes(buffer)


async def fetch_repo_zip(
    url: str, *, branch: Optional[str] = None, token: Optional[str] = None
) -> RepoArchive:
    """Resolve a GitHub URL and download its archive as ZIP bytes."""
    owner, repo, url_branch = parse_github_url(url)
    requested_branch = branch or url_branch

    timeout = httpx.Timeout(settings.storage_timeout_seconds, connect=15.0)
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
        # Candidate branches to try, in order.
        candidates: list[str] = []
        if requested_branch:
            candidates.append(requested_branch)
        else:
            try:
                candidates.append(await _resolve_default_branch(client, owner, repo, token))
            except GitHubFetchError:
                raise
            except Exception:
                logger.info("[GITHUB] default-branch lookup failed for %s/%s; trying common names", owner, repo)
            for fallback in ("main", "master"):
                if fallback not in candidates:
                    candidates.append(fallback)

        last_tried: list[str] = []
        for candidate in candidates:
            last_tried.append(candidate)
            content = await _download_zip(client, owner, repo, candidate, token)
            if content is not None:
                logger.info("[GITHUB] Downloaded %s/%s@%s (%d bytes)", owner, repo, candidate, len(content))
                return RepoArchive(
                    content=content,
                    owner=owner,
                    repo=repo,
                    branch=candidate,
                    source_url=f"https://github.com/{owner}/{repo}",
                )

    raise GitHubFetchError(
        f"Could not download {owner}/{repo}. Tried branch(es): {', '.join(last_tried) or 'none'}. "
        "Check the URL and branch name."
    )
