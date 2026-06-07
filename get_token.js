// Run this ONCE locally to get your YouTube refresh token.
// node scripts/get_token.js
//
// You need: Node.js installed on your computer.
// Steps:
//   1. Fill in YOUR_CLIENT_ID and YOUR_CLIENT_SECRET from Google Cloud Console
//   2. Run: node scripts/get_token.js
//   3. Open the URL it prints → authorize → paste the code back
//   4. Copy the refresh_token into your GitHub Secrets as YT_REFRESH_TOKEN

const https = require('https');
const readline = require('readline');

const CLIENT_ID     = process.env.YT_CLIENT_ID     || 'YOUR_CLIENT_ID';
const CLIENT_SECRET = process.env.YT_CLIENT_SECRET || 'YOUR_CLIENT_SECRET';
const REDIRECT_URI  = 'urn:ietf:wg:oauth:2.0:oob';
const SCOPE         = 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube';

const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=code&scope=${encodeURIComponent(SCOPE)}&access_type=offline&prompt=consent`;

console.log('\n=== YouTube OAuth Token Generator ===\n');
console.log('1. Open this URL in your browser:\n');
console.log(authUrl);
console.log('\n2. Authorize the app with your YouTube channel account');
console.log('3. Paste the authorization code below:\n');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.question('Authorization code: ', async (code) => {
  rl.close();
  const body = `code=${encodeURIComponent(code.trim())}&client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}&redirect_uri=${REDIRECT_URI}&grant_type=authorization_code`;
  const req = https.request({
    hostname: 'oauth2.googleapis.com',
    path: '/token',
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': body.length }
  }, res => {
    let data = '';
    res.on('data', c => data += c);
    res.on('end', () => {
      const parsed = JSON.parse(data);
      if (parsed.refresh_token) {
        console.log('\n✅ SUCCESS!\n');
        console.log('Add these to GitHub Secrets:');
        console.log(`YT_REFRESH_TOKEN = ${parsed.refresh_token}`);
        console.log('\nKeep this token secret — it gives upload access to your channel.');
      } else {
        console.log('\n❌ Error:', data);
      }
    });
  });
  req.write(body);
  req.end();
});
