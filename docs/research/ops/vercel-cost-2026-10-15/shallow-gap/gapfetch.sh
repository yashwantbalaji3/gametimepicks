if ! git cat-file -e "$BASE^{commit}" 2>/dev/null; then
    # GTP-SHALLOW-GAP-FETCH: Vercel clones --depth=10, so after a run of ignored deployments the last deployed
    # SHA can fall outside the clone. git diff of two commits needs only their two trees, not the history
    # between them, so fetch exactly that one commit (depth 1, no tags) from the public repository URL and
    # compare as usual (the repository is public). No credentials are used. Any failure (private repo, network, timeout, unknown SHA)
    # leaves the original fail-safe in place: build.
    _url="${GTP_GAP_FETCH_URL:-}"   # test fixtures only; production derives the URL below
    if [ -z "$_url" ] && [ "${VERCEL_GIT_PROVIDER:-}" = "github" ] && [ -n "${VERCEL_GIT_REPO_OWNER:-}" ] && [ -n "${VERCEL_GIT_REPO_SLUG:-}" ]; then
        _url="https://github.com/${VERCEL_GIT_REPO_OWNER}/${VERCEL_GIT_REPO_SLUG}.git"
    fi
    _to=""; command -v timeout >/dev/null 2>&1 && _to="timeout ${GTP_GAP_FETCH_TIMEOUT:-90}"
    _t0=$(date +%s)
    if [ -n "$_url" ] && GIT_TERMINAL_PROMPT=0 $_to git fetch --quiet --no-tags --depth=1 "$_url" "$BASE" 2>/dev/null \
        && git cat-file -e "$BASE^{commit}" 2>/dev/null; then
        echo "[ignore-build] previous deployed SHA $BASE was outside the depth-10 clone — fetched it alone in $(( $(date +%s) - _t0 ))s; comparing trees"
    else
        echo "[ignore-build] previous deployed SHA $BASE not in clone and could not be fetched (shallow gap / force push / no network) — building"
        exit 1
    fi
fi
