#!/usr/bin/env bash
# publish.sh — Build and publish knight1988/dockge to Docker Hub.
# Builds its own :base and :build-healthcheck base images, then the release image.
# The upstream Dockerfile is NOT modified; FROM-overrides are injected via --build-context.
#
# Usage:
#   ./publish.sh [--skip-base] [--version X.Y.Z] [--help]
#
# Environment overrides:
#   IMAGE      — Docker Hub repo (default: knight1988/dockge)
#   PLATFORMS  — comma-separated buildx platforms
#                (default: linux/amd64,linux/arm64,linux/arm/v7)
#   VERSION    — image version tag (default: read from package.json)

set -euo pipefail

###############################################################################
# Defaults
###############################################################################
IMAGE="${IMAGE:-knight1988/dockge}"
PLATFORMS="${PLATFORMS:-linux/amd64,linux/arm64,linux/arm/v7}"
SKIP_BASE=false

# Resolve script directory so we can be called from any CWD.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

###############################################################################
# Argument parsing
###############################################################################
while [[ $# -gt 0 ]]; do
    case "$1" in
        --skip-base)
            SKIP_BASE=true
            shift
            ;;
        --version)
            VERSION="${2:?'--version requires a value'}"
            shift 2
            ;;
        --help|-h)
            cat <<'EOF'
Usage: ./publish.sh [OPTIONS]

Options:
  --skip-base          Skip (re)building :base and :build-healthcheck images.
                       Use on iterative releases when the base layers haven't changed.
  --version X.Y.Z      Override the version tag (default: read from package.json).
  --help               Show this help.

Environment variables (alternative to flags):
  IMAGE      Docker Hub repo         (default: knight1988/dockge)
  PLATFORMS  Buildx target platforms (default: linux/amd64,linux/arm64,linux/arm/v7)
  VERSION    Version tag             (default: package.json version field)

Full publish (first run):
  ./publish.sh

Faster re-release (base images unchanged):
  ./publish.sh --skip-base
EOF
            exit 0
            ;;
        *)
            echo "Unknown option: $1" >&2
            echo "Run './publish.sh --help' for usage." >&2
            exit 1
            ;;
    esac
done

###############################################################################
# Move to repo root
###############################################################################
cd "$SCRIPT_DIR"

###############################################################################
# Resolve version
###############################################################################
if [[ -z "${VERSION:-}" ]]; then
    VERSION="$(node -p "JSON.parse(require('fs').readFileSync('./package.json','utf8')).version")"
fi
echo "📦  Image   : $IMAGE"
echo "🏷   Version : $VERSION"
echo "🖥   Platforms: $PLATFORMS"
echo "⏭   Skip base: $SKIP_BASE"
echo

###############################################################################
# Pre-flight checks
###############################################################################

# 1. Docker daemon must be running.
if ! docker info > /dev/null 2>&1; then
    echo "❌  Docker daemon is not running. Start Docker and try again." >&2
    exit 1
fi

# 2. Ensure a docker-container buildx builder (required for multi-arch + --push).
BUILDER_NAME="${BUILDX_BUILDER:-}"
if [[ -z "$BUILDER_NAME" ]]; then
    # Check whether the currently active builder uses the docker-container driver.
    CURRENT_DRIVER="$(docker buildx inspect 2>/dev/null | awk '/^Driver:/ {print $2}')"
    if [[ "$CURRENT_DRIVER" != "docker-container" ]]; then
        BUILDER_NAME="dockge-publish"
        echo "🔧  Creating multi-arch buildx builder '$BUILDER_NAME' …"
        docker buildx create --name "$BUILDER_NAME" --driver docker-container \
            --use --bootstrap
        echo
    fi
fi

# 3. Soft login warning (we don't gate on this; the push will surface the real error).
if ! docker info 2>/dev/null | grep -q "Username:"; then
    echo "⚠️   No Docker Hub login detected. Run 'docker login' before publishing."
    echo "    Continuing — the push step will fail if credentials are missing."
    echo
fi

###############################################################################
# Step 1: Build frontend
###############################################################################
echo "════════════════════════════════════════════════════════════"
echo "▶  Step 1/4  Building frontend …"
echo "════════════════════════════════════════════════════════════"
npm run build:frontend
echo

###############################################################################
# Step 2: Build :base image (node + docker-cli + tsx)
###############################################################################
if [[ "$SKIP_BASE" == "false" ]]; then
    echo "════════════════════════════════════════════════════════════"
    echo "▶  Step 2/4  Building $IMAGE:base …"
    echo "════════════════════════════════════════════════════════════"
    docker buildx build \
        --platform "$PLATFORMS" \
        -t "$IMAGE:base" \
        -f ./docker/Base.Dockerfile \
        . \
        --push
    echo

    ###############################################################################
    # Step 3: Build :build-healthcheck image (Go healthcheck binary)
    ###############################################################################
    echo "════════════════════════════════════════════════════════════"
    echo "▶  Step 3/4  Building $IMAGE:build-healthcheck …"
    echo "════════════════════════════════════════════════════════════"
    docker buildx build \
        --platform "$PLATFORMS" \
        -t "$IMAGE:build-healthcheck" \
        -f ./docker/BuildHealthCheck.Dockerfile \
        . \
        --push
    echo
else
    echo "ℹ️   Skipping base image builds (--skip-base)."
    echo
fi

###############################################################################
# Step 4: Build the release image
# --build-context redirects the hardcoded 'louislam/dockge:*' FROM references
# inside docker/Dockerfile to our own published images, without editing the file.
###############################################################################
echo "════════════════════════════════════════════════════════════"
echo "▶  Step 4/4  Building $IMAGE:latest + $IMAGE:$VERSION …"
echo "════════════════════════════════════════════════════════════"
docker buildx build \
    --platform "$PLATFORMS" \
    --build-context "louislam/dockge:base=docker-image://$IMAGE:base" \
    --build-context "louislam/dockge:build-healthcheck=docker-image://$IMAGE:build-healthcheck" \
    -t "$IMAGE:latest" \
    -t "$IMAGE:$VERSION" \
    --target release \
    -f ./docker/Dockerfile \
    . \
    --push
echo

###############################################################################
# Done
###############################################################################
echo "════════════════════════════════════════════════════════════"
echo "✅  All images pushed successfully!"
echo "════════════════════════════════════════════════════════════"
if [[ "$SKIP_BASE" == "false" ]]; then
    echo "  docker pull $IMAGE:base"
    echo "  docker pull $IMAGE:build-healthcheck"
fi
echo "  docker pull $IMAGE:latest"
echo "  docker pull $IMAGE:$VERSION"
echo
echo "Inspect multi-arch manifest:"
echo "  docker buildx imagetools inspect $IMAGE:latest"
