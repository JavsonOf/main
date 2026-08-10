#!/bin/bash

# OpenRouter Spawn CLI Installation & Hermes GCP Deployment
# Install spawn CLI
curl -fsSL https://openrouter.ai/labs/spawn/cli/install.sh | bash

# Verify installation
spawn --version

# Login to GCP
gcloud auth login
gcloud config set project $1

# Deploy Hermes on GCP
spawn hermes gcp

echo "✅ Hermes deployment started on GCP!"
