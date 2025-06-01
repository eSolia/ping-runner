// main.js - Deno Deploy script for multi-site IndexNow and Ping-O-Matic submission
import './cron.ts'

// --- Configuration via Environment Variables ---
// These values should be set in your Deno Deploy project settings.
// For example:
// INDEXNOW_API_KEY_YOURSITE1 = "YOUR_INDEXNOW_API_KEY_HERE_FOR_SITE1"
// SITE_CONFIG = `
//   [
//     {
//       "id": "site1-en",
//       "host": "your-site1.com",
//       "feedUrl": "https://your-site1.com/feed.en.json",
//       "indexNowKeyEnv": "INDEXNOW_API_KEY_YOURSITE1",
//       "pingOMatic": {
//         "title": "Your Site 1 English Blog",
//         "blogUrl": "https://your-site1.com/en/",
//         "rssUrl": "https://your-site1.com/feed.en.xml"
//       }
//     },
//     {
//       "id": "site1-ja",
//       "host": "your-site1.com",
//       "feedUrl": "https://your-site1.com/feed.ja.json",
//       "indexNowKeyEnv": "INDEXNOW_API_KEY_YOURSITE1",
//       "pingOMatic": {
//         "title": "Your Site 1 Japanese Blog",
//         "blogUrl": "https://your-site1.com/ja/",
//         "rssUrl": "https://your-site1.com/feed.ja.xml"
//       }
//     },
//     {
//       "id": "site2-en",
//       "host": "your-site2.com",
//       "feedUrl": "https://your-site2.com/feed.json",
//       "indexNowKeyEnv": "INDEXNOW_API_KEY_YOURSITE2", // Assuming you might have different keys per site
//       "pingOMatic": {
//         "title": "Your Site 2 Blog",
//         "blogUrl": "https://your-site2.com/",
//         "rssUrl": "https://your-site2.com/feed.xml"
//       }
//     }
//   ]
// `

// --- Constants ---
const TWENTY_FOUR_HOURS_IN_MS = 24 * 60 * 60 * 1000;
const LAST_CHECK_KEY_PREFIX = "last_check_"; // Prefix for Deno KV keys

// --- Deno KV (Key-Value Store) for persistence ---
// Deno Deploy has a built-in KV store, perfect for storing the last checked timestamp.
const kv = await Deno.openKv();

// --- Helper Function to fetch JSON ---
async function fetchJsonFeed(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error(`Error fetching JSON feed from ${url}:`, error);
    return null;
  }
}

// --- Helper Function to get last checked timestamp ---
async function getLastChecked(feedId) {
  const result = await kv.get([LAST_CHECK_KEY_PREFIX + feedId]);
  return result.value ? new Date(result.value) : null;
}

// --- Helper Function to set last checked timestamp ---
async function setLastChecked(feedId, timestamp) {
  await kv.set([LAST_CHECK_KEY_PREFIX + feedId], timestamp.toISOString());
}

// --- Helper Function to check if a post is new or updated ---
function isPostNewOrUpdated(post, lastCheckedTime) {
  // IMPORTANT: Adapt these date fields to match your JSON feed's structure.
  // Common fields: 'date_published', 'published', 'date', 'updated_at', 'modified'
  const publishedDate = new Date(post.date_published || post.published || post.date);
  const updatedDate = new Date(post.date_modified || post.updated_at || publishedDate); // Use published date if no explicit updated date

  const currentTime = Date.now();

  // If there's no lastCheckedTime (first run), consider anything within 24h as new
  if (!lastCheckedTime) {
    return (currentTime - publishedDate.getTime()) <= TWENTY_FOUR_HOURS_IN_MS;
  }

  // Check if published or updated after the last check
  return (publishedDate.getTime() > lastCheckedTime.getTime()) || (updatedDate.getTime() > lastCheckedTime.getTime());
}

// --- Function to ping IndexNow ---
async function pingIndexNow(host, apiKey, urls) {
  if (urls.length === 0) {
    console.log(`[${host}] No new URLs for IndexNow.`);
    return;
  }

  const payload = {
    host: host,
    key: apiKey,
    urlList: urls.map(url => ({ loc: url }))
  };

  try {
    const response = await fetch("https://api.indexnow.org/IndexNow", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      console.log(`[${host}] Successfully pinged IndexNow with ${urls.length} URLs.`);
    } else {
      const errorText = await response.text();
      console.error(`[${host}] Failed to ping IndexNow. Status: ${response.status}, Response: ${errorText}`);
    }
  } catch (error) {
    console.error(`[${host}] Error pinging IndexNow:`, error);
  }
}

// --- Function to ping Ping-O-Matic ---
async function pingPingOMatic(siteConfig, updatedPostUrl) {
  const { title, blogUrl, rssUrl } = siteConfig.pingOMatic;
  if (!title || !blogUrl || !rssUrl) {
    console.warn(`[${siteConfig.id}] Missing Ping-O-Matic configuration (title, blogUrl, or rssUrl). Skipping.`);
    return;
  }

  // URL-encode all parameters
  const encodedTitle = encodeURIComponent(title);
  const encodedBlogUrl = encodeURIComponent(blogUrl);
  const encodedRssUrl = encodeURIComponent(rssUrl);

  // Ping-O-Matic often uses XML-RPC POST, but their GET endpoint is simpler for this use case
  // The GET endpoint is typically for manual use or simple scripts.
  // If you experience issues, a more robust solution might involve XML-RPC POST.
  const pingUrl = `https://pingomatic.com/ping/?title=${encodedTitle}&blogurl=${encodedBlogUrl}&rssurl=${encodedRssUrl}&chk_blogs=on&chk_feedburner=on&chk_tailrank=on&chk_superfeedr=on`;

  try {
    const response = await fetch(pingUrl, { method: "GET" }); // Ping-O-Matic's GET endpoint works fine for simple pings

    if (response.ok) {
      const responseText = await response.text();
      console.log(`[${siteConfig.id}] Successfully pinged Ping-O-Matic for updated post: ${updatedPostUrl}. Response: ${responseText.substring(0, 100)}...`);
    } else {
      const errorText = await response.text();
      console.error(`[${siteConfig.id}] Failed to ping Ping-O-Matic. Status: ${response.status}, Response: ${errorText}`);
    }
  } catch (error) {
    console.error(`[${siteConfig.id}] Error pinging Ping-O-Matic:`, error);
  }
}

// --- Main execution function for a single feed ---
async function processFeed(siteConfig) {
  console.log(`Processing feed for ${siteConfig.id} (${siteConfig.feedUrl})...`);

  const lastCheckedTime = await getLastChecked(siteConfig.id);
  const currentRunTime = new Date(); // Capture time at the start of this run

  const feed = await fetchJsonFeed(siteConfig.feedUrl);

  if (!feed || !feed.items || feed.items.length === 0) {
    console.log(`[${siteConfig.id}] Could not fetch feed or feed is empty.`);
    return;
  }

  const urlsToIndexNow = [];
  let hasUpdatedPostsForPingOMatic = false; // Flag to decide if we need to ping Ping-O-Matic

  for (const post of feed.items) {
    if (isPostNewOrUpdated(post, lastCheckedTime)) {
      if (post.url) {
        urlsToIndexNow.push(post.url);
        hasUpdatedPostsForPingOMatic = true; // Mark that at least one post was new/updated
      } else {
        console.warn(`[${siteConfig.id}] Post found without a 'url' field. Skipping for IndexNow/Ping-O-Matic:`, post);
      }
    }
  }

  // Get the IndexNow API key from environment variables
  const indexNowApiKey = Deno.env.get(siteConfig.indexNowKeyEnv);
  if (!indexNowApiKey) {
    console.error(`[${siteConfig.id}] IndexNow API key not found for environment variable: ${siteConfig.indexNowKeyEnv}. Skipping IndexNow ping.`);
  } else {
    await pingIndexNow(siteConfig.host, indexNowApiKey, urlsToIndexNow);
  }

  // Ping Ping-O-Matic only if there were new/updated posts
  if (hasUpdatedPostsForPingOMatic && siteConfig.pingOMatic) {
    // Ping-O-Matic just needs a general ping for the blog, not individual URLs
    await pingPingOMatic(siteConfig);
  } else {
      console.log(`[${siteConfig.id}] No new or updated posts for Ping-O-Matic.`);
  }

  // Update the last checked timestamp only if the feed was successfully processed
  await setLastChecked(siteConfig.id, currentRunTime);
  console.log(`[${siteConfig.id}] Processing complete. Last checked timestamp updated.`);
}

// --- Deno Deploy Entry Point ---
// This will run the main function when the script is deployed and executed by the cron job.
addEventListener("fetch", async (event) => {
  event.respondWith(new Response("Deno Deploy Multi-Site IndexNow/Ping-O-Matic checker running...", { status: 200 }));

  try {
    const siteConfigJson = Deno.env.get("SITE_CONFIG");
    if (!siteConfigJson) {
      console.error("Environment variable 'SITE_CONFIG' is not set. Please configure your site feeds.");
      return;
    }

    const siteConfigs = JSON.parse(siteConfigJson);

    if (!Array.isArray(siteConfigs) || siteConfigs.length === 0) {
      console.error("SITE_CONFIG is not a valid array or is empty.");
      return;
    }

    // Process each site/feed concurrently
    const processingPromises = siteConfigs.map(config => processFeed(config));
    await Promise.all(processingPromises);

    console.log("All site feeds processed.");

  } catch (error) {
    console.error("Error in main execution loop:", error);
  }
});
