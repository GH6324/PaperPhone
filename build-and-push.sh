#!/usr/bin/env bash
# build-and-push.sh — Build Docker images and push to Docker Hub
# Usage: DOCKER_HUB_USER=yourname TAG=v1.0.0 bash build-and-push.sh

set -euo pipefail

DOCKER_HUB_USER="${DOCKER_HUB_USER:?Set DOCKER_HUB_USER=your-dockerhub-username}"
TAG="${TAG:-latest}"

SERVER_IMAGE="${DOCKER_HUB_USER}/paperphone-server:${TAG}"
CLIENT_IMAGE="${DOCKER_HUB_USER}/paperphone-client:${TAG}"

echo "🔨 Building server: $SERVER_IMAGE"
docker build \
  --platform linux/amd64,linux/arm64 \
  -t "$SERVER_IMAGE" \
  ./server

echo "🔨 Building client: $CLIENT_IMAGE"
docker build \
  --platform linux/amd64,linux/arm64 \
  -t "$CLIENT_IMAGE" \
  ./client

echo "📤 Pushing $SERVER_IMAGE"
docker push "$SERVER_IMAGE"

echo "📤 Pushing $CLIENT_IMAGE"
docker push "$CLIENT_IMAGE"

echo "✅ Done!"
echo ""
echo "Deploy on a server with:"
echo "  DOCKER_HUB_USER=$DOCKER_HUB_USER TAG=$TAG docker compose up -d"
