#!/bin/sh

if [ -z "$REACT_APP_SERVER_BASE_URL" ]; then
  echo "Error: REACT_APP_SERVER_BASE_URL is not set."
  exit 1
fi

echo "Injecting runtime environment variables into index.html..."

# REACT_APP_CRM_AI_BASE_URL is optional (unlike the server base URL above): when
# unset it is injected as an empty string, and the CRM AI panel then renders a
# "not configured" notice instead of calling an unknown origin.
CONFIG_BLOCK=$(cat << EOF
    <script id="twenty-env-config">
      window._env_ = {
        REACT_APP_SERVER_BASE_URL: "$REACT_APP_SERVER_BASE_URL",
        REACT_APP_CRM_AI_BASE_URL: "$REACT_APP_CRM_AI_BASE_URL"
      };
    </script>
    <!-- END: Twenty Config -->
EOF
)
# Use sed to replace the config block in index.html
# Using pattern space to match across multiple lines
echo "$CONFIG_BLOCK" | sed -i.bak '
  /<!-- BEGIN: Twenty Config -->/,/<!-- END: Twenty Config -->/{
    /<!-- BEGIN: Twenty Config -->/!{
      /<!-- END: Twenty Config -->/!d
    }
    /<!-- BEGIN: Twenty Config -->/r /dev/stdin
    /<!-- END: Twenty Config -->/d
  }
' build/index.html
rm -f build/index.html.bak
