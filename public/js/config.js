// Only used when the site is hosted WITHOUT the Node server (e.g. GitHub Pages).
// In that "static mode" edits are saved as a local draft in the admin's own browser
// and exported as JSON — so this gate is just a convenience, not real security.
// Real protection comes from running server.js (see README).
//
// Default static-mode password: family-admin
// To change it:  node -e "console.log(require('crypto').createHash('sha256').update('vansh-static-salt:'+process.argv[1]).digest('hex'))" "your-password"
export const STATIC_PASSWORD_SHA256 = '9bbf5629be6a842995eddc9579e85e0b091ceb9de545104e9a0c535736ddb23e';
export const STATIC_SALT = 'vansh-static-salt:';
