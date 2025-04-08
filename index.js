cd ~/Downloads/boba_chummy_webhook_fixed_final
# Overwrite index.js with whatever is in your clipboard
pbpaste > index.js
# Stage, commit, and push
git add index.js
git commit -m "Update index.js with WhatsApp Cloud API support"
git push origin main
