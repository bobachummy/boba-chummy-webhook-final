cd ~/Downloads/boba_chummy_webhook_fixed_final

# Overwrite index.js with whatever is in your clipboard
pbpaste > index.js

# Verify that the first line is now "require('dotenv').config();" (and not "git add" or "cd")
head -n 1 index.js

# Stage, commit, and push
git add index.js
git commit -m "Fix index.js: load server code instead of shell commands"
git push origin main
