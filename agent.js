// Kids TV Shorts Agent - GitHub Actions Runner
// Reads queue.json, generates content via Gemini (3 slots),
// creates video prompts, and uploads to YouTube automatically.

const fs = require('fs');
const https = require('https');

// ─── CONFIG ──────────────────────────────────────────────────────────────────

const AI_SLOTS = [
  { name: 'Slot A (Script)',    key: process.env.GEMINI_KEY_A, purpose: 'script'    },
  { name: 'Slot B (Voiceover)', key: process.env.GEMINI_KEY_B, purpose: 'voiceover' },
  { name: 'Slot C (SEO/Meta)',  key: process.env.GEMINI_KEY_C, purpose: 'metadata'  },
];

const VID_SLOTS = [
  { name: 'Gen 1', key: process.env.VID_KEY_1, service: process.env.VID_SVC_1 || 'luma' },
  { name: 'Gen 2', key: process.env.VID_KEY_2, service: process.env.VID_SVC_2 || 'kling' },
  { name: 'Gen 3', key: process.env.VID_KEY_3, service: process.env.VID_SVC_3 || 'haiper' },
];

const YT = {
  clientId:     process.env.YT_CLIENT_ID,
  clientSecret: process.env.YT_CLIENT_SECRET,
  refreshToken: process.env.YT_REFRESH_TOKEN,
};

const LOG_FILE   = 'output_log.json';
const QUEUE_FILE = 'queue.json';

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function httpsRequest(options, body = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch(e) { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

function log(msg) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${msg}`);
}

function readQueue() {
  if (!fs.existsSync(QUEUE_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf8')); }
  catch(e) { return []; }
}

function writeQueue(q) {
  fs.writeFileSync(QUEUE_FILE, JSON.stringify(q, null, 2));
}

function appendLog(entry) {
  let logs = [];
  if (fs.existsSync(LOG_FILE)) {
    try { logs = JSON.parse(fs.readFileSync(LOG_FILE, 'utf8')); } catch(e) {}
  }
  logs.unshift({ ...entry, timestamp: new Date().toISOString() });
  if (logs.length > 50) logs = logs.slice(0, 50);
  fs.writeFileSync(LOG_FILE, JSON.stringify(logs, null, 2));
}

// ─── PICK AI SLOT (rotate by availability) ───────────────────────────────────

function pickAiSlot(preferredSlot = 'auto') {
  if (preferredSlot !== 'auto') {
    const idx = { A: 0, B: 1, C: 2 }[preferredSlot] ?? 0;
    if (AI_SLOTS[idx].key) return AI_SLOTS[idx];
  }
  return AI_SLOTS.find(s => s.key) || AI_SLOTS[0];
}

function pickVidSlot(preferredSlot = 'auto') {
  if (preferredSlot !== 'auto') {
    const idx = parseInt(preferredSlot) - 1;
    if (VID_SLOTS[idx]?.key) return VID_SLOTS[idx];
  }
  return VID_SLOTS.find(s => s.key) || VID_SLOTS[0];
}

// ─── GEMINI CALL ─────────────────────────────────────────────────────────────

async function callGemini(apiKey, prompt) {
  if (!apiKey) throw new Error('No Gemini API key available for this slot');
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.8, maxOutputTokens: 1500 }
  };
  const res = await httpsRequest({
    hostname: 'generativelanguage.googleapis.com',
    path: `/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, body);
  if (res.status !== 200) throw new Error(`Gemini error ${res.status}: ${JSON.stringify(res.body)}`);
  const text = res.body?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return text;
}

// ─── CONTENT GENERATION ──────────────────────────────────────────────────────

async function generateScript(slot, topic, cat) {
  log(`[Slot ${slot.name}] Generating script for: ${topic}`);
  const raw = await callGemini(slot.key, `
You are a professional kids YouTube Shorts creator. Write an engaging, safe, fun video script for children aged 2-8.

Topic: ${topic}
Category: ${cat}

Return ONLY valid JSON (no markdown, no backticks):
{
  "hook": "Opening 5 seconds that grabs attention",
  "body": "Main content, 30-40 seconds, fun facts or story",
  "cta": "Call to action: subscribe, like, comment",
  "fullScript": "Complete word-for-word script combining hook + body + CTA"
}`);
  const clean = raw.replace(/```json|```/g, '').trim();
  return JSON.parse(clean);
}

async function generateVoiceover(slot, script) {
  log(`[Slot ${slot.name}] Generating voiceover version`);
  const raw = await callGemini(slot.key, `
Rewrite this kids video script in a warm, slow, enthusiastic narration style for children aged 2-8.
Add [PAUSE] markers where the narrator should pause. Keep it simple and fun.

Script: ${script.fullScript}

Return ONLY valid JSON:
{
  "narration": "full narration-ready text with pauses marked",
  "ttsDuration": "estimated seconds as a number"
}`);
  const clean = raw.replace(/```json|```/g, '').trim();
  return JSON.parse(clean);
}

async function generateMetadata(slot, topic, cat, script) {
  log(`[Slot ${slot.name}] Generating SEO metadata`);
  const raw = await callGemini(slot.key, `
You are a YouTube SEO expert for kids content. Generate optimized metadata for this Shorts video.

Topic: ${topic}
Category: ${cat}
Script summary: ${script.hook}

Return ONLY valid JSON:
{
  "title": "YouTube title max 60 chars, keyword-rich, engaging",
  "description": "2-3 sentence description with keywords, include #Shorts",
  "tags": ["tag1","tag2","tag3","tag4","tag5","tag6","tag7","tag8","tag9","tag10"],
  "hashtags": "#KidsTV #Shorts #Children #KidsVideos #Educational",
  "videoPrompt": "Detailed text-to-video AI prompt: bright colorful cartoon animation, safe for kids, 9:16 vertical aspect ratio, cheerful characters, no text overlays, smooth motion. Topic: ${topic}"
}`);
  const clean = raw.replace(/```json|```/g, '').trim();
  return JSON.parse(clean);
}

// ─── YOUTUBE UPLOAD ──────────────────────────────────────────────────────────

async function getYouTubeToken() {
  if (!YT.clientId || !YT.clientSecret || !YT.refreshToken) {
    throw new Error('YouTube credentials not configured. Add YT_CLIENT_ID, YT_CLIENT_SECRET, YT_REFRESH_TOKEN to GitHub Secrets.');
  }
  const res = await httpsRequest({
    hostname: 'oauth2.googleapis.com',
    path: '/token',
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  }, `client_id=${YT.clientId}&client_secret=${YT.clientSecret}&refresh_token=${YT.refreshToken}&grant_type=refresh_token`);
  if (!res.body.access_token) throw new Error('Failed to get YouTube access token: ' + JSON.stringify(res.body));
  return res.body.access_token;
}

async function uploadToYouTube(accessToken, metadata, videoUrl = null) {
  log('Uploading metadata to YouTube...');

  // If no video URL (video gen not connected yet), create a scheduled placeholder
  // and log the video prompt for manual video upload
  const snippet = {
    title: metadata.title,
    description: metadata.description + '\n\n' + metadata.hashtags,
    tags: metadata.tags,
    categoryId: '28', // Science & Technology (use 24 for Entertainment)
    defaultLanguage: 'en',
  };

  // Note: Full binary video upload requires multipart upload with the video file.
  // This posts the metadata and returns the insert URL.
  // In production, add your video file download + multipart upload here.
  const res = await httpsRequest({
    hostname: 'www.googleapis.com',
    path: '/youtube/v3/videos?part=snippet,status',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`
    }
  }, {
    snippet,
    status: {
      privacyStatus: 'public',
      selfDeclaredMadeForKids: true,  // COPPA compliance - critical for kids content
      embeddable: true,
      publicStatsViewable: true
    }
  });

  return res.body;
}

// ─── MAIN AGENT LOOP ─────────────────────────────────────────────────────────

async function main() {
  log('=== Kids TV Shorts Agent starting ===');

  const queue = readQueue();
  const pending = queue.filter(item => item.status === 'pending');

  if (!pending.length) {
    log('No pending items in queue. Exiting.');
    return;
  }

  // Process up to 3 videos per run (daily limit)
  const toProcess = pending.slice(0, 3);
  log(`Processing ${toProcess.length} video(s) from queue`);

  let accessToken = null;
  try {
    accessToken = await getYouTubeToken();
    log('YouTube token obtained successfully');
  } catch(e) {
    log('WARNING: YouTube upload disabled - ' + e.message);
  }

  for (const item of toProcess) {
    log(`--- Processing: ${item.topic} ---`);
    item.status = 'running';
    writeQueue(queue);

    try {
      const aiSlot    = pickAiSlot(item.aiSlot);
      const scriptSlot = AI_SLOTS.find(s => s.purpose === 'script' && s.key) || aiSlot;
      const voiceSlot  = AI_SLOTS.find(s => s.purpose === 'voiceover' && s.key) || aiSlot;
      const metaSlot   = AI_SLOTS.find(s => s.purpose === 'metadata' && s.key) || aiSlot;
      const vidSlot    = pickVidSlot(item.vidSlot);

      // Step 1: Generate script (Slot A)
      const script = await generateScript(scriptSlot, item.topic, item.cat);

      // Step 2: Generate voiceover (Slot B)
      const voiceover = await generateVoiceover(voiceSlot, script);

      // Step 3: Generate metadata + video prompt (Slot C)
      const metadata = await generateMetadata(metaSlot, item.topic, item.cat, script);

      log(`Video prompt ready for ${vidSlot.name} (${vidSlot.service}): ${metadata.videoPrompt.substring(0, 80)}...`);

      // Step 4: Upload to YouTube
      let ytResult = null;
      if (accessToken) {
        ytResult = await uploadToYouTube(accessToken, metadata);
        log(`YouTube upload result: ${JSON.stringify(ytResult).substring(0, 100)}`);
      }

      item.status = 'done';
      item.completedAt = new Date().toISOString();
      item.output = { script: script.hook, title: metadata.title, tags: metadata.tags, videoPrompt: metadata.videoPrompt };

      appendLog({
        topic: item.topic,
        cat: item.cat,
        status: 'done',
        title: metadata.title,
        script: script.fullScript,
        narration: voiceover.narration,
        videoPrompt: metadata.videoPrompt,
        tags: metadata.tags,
        hashtags: metadata.hashtags,
        youtubeResult: ytResult,
        aiSlot: aiSlot.name,
        vidSlot: vidSlot.name,
      });

      log(`✅ Done: "${metadata.title}"`);
    } catch(e) {
      log(`❌ Error processing "${item.topic}": ${e.message}`);
      item.status = 'pending'; // retry next run
      item.lastError = e.message;
      appendLog({ topic: item.topic, status: 'error', error: e.message });
    }

    writeQueue(queue);
    // Small delay between videos to respect API rate limits
    await new Promise(r => setTimeout(r, 3000));
  }

  log('=== Agent run complete ===');
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
