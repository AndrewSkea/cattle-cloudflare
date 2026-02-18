#!/bin/bash

ACCOUNT_ID="1a34ffafef19e32e29f2bd9b7e57446d"
PROJECT_NAME="cattle-management"
ENV_VAR_KEY="NEXT_PUBLIC_API_URL"
ENV_VAR_VALUE="https://cattle-management-api.andrewskea-as.workers.dev"

echo "Setting up environment variable for Cloudflare Pages..."
echo "Project: $PROJECT_NAME"
echo "Variable: $ENV_VAR_KEY=$ENV_VAR_VALUE"

# Use wrangler to get the API token
TOKEN=$(grep oauth_token ~/.wrangler/config/default.toml | cut -d'"' -f2)

if [ -z "$TOKEN" ]; then
  echo "Error: Could not find OAuth token in wrangler config"
  echo "Please set the environment variable manually in Cloudflare Dashboard:"
  echo ""
  echo "1. Go to: https://dash.cloudflare.com/1a34ffafef19e32e29f2bd9b7e57446d/pages/view/cattle-management/settings/environment-variables"
  echo "2. Click 'Add variable' under 'Production'"
  echo "3. Set:"
  echo "   - Variable name: NEXT_PUBLIC_API_URL"
  echo "   - Value: https://cattle-management-api.andrewskea-as.workers.dev"
  echo "4. Click 'Save'"
  exit 1
fi

curl -X PATCH \
  "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/pages/projects/$PROJECT_NAME" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  --data '{
    "deployment_configs": {
      "production": {
        "env_vars": {
          "NEXT_PUBLIC_API_URL": {
            "value": "'"$ENV_VAR_VALUE"'"
          }
        }
      }
    }
  }'

echo ""
echo "Environment variable has been set!"
