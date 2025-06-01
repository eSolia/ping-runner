// main.ts - Deno Deploy script for multi-site IndexNow and Ping-O-Matic submission
import './cron.ts'; // Assuming cron.ts handles scheduling logic separately, if needed by you

// --- Type Definitions ---
// Define interfaces for the structure of your configuration and post data
interface PingOMaticConfig {
  title: string;
  blogUrl: string;
  rssUrl: string;
}

export interface SiteConfig { // Exported in case cron.ts needs it
  id: string;
  host: string;
  feedUrl: string;
  indexNowKeyEnv: string; // This will be the name of the env variable holding the actual key
  pingOMatic?: PingOMaticConfig; // '?' makes it optional
}

// Define a basic structure for your JSON feed items (posts)
// You might need to expand this based on your actual feed structure
interface Post {
  url?: string; // Optional, as you have a warning if it's missing
  date_published?: string;
  published?: string;
  date?: string;
  date_modified?: string;
  updated_at?: string;
  [key: string]: unknown; // Allow for other unknown properties
}

interface JsonFeed {
  version: string;
  title: string;
  home_page_url: string;
  feed_url: string;
  items: Post[];
  // Add other properties from your feed if necessary
}

// --- Constants ---
const TWENTY_FOUR_HOURS_IN_MS: number = 24 * 60 * 60 * 1000;
const LAST_CHECK_KEY_PREFIX: string = "last_check_"; // Prefix for Deno KV keys

// --- Deno KV (Key-Value Store) for persistence ---
const kv: Deno.Kv = await Deno.openKv();

// --- Helper Function to fetch JSON ---
async function fetchJsonFeed(url: string): Promise<JsonFeed | null> {
  try {
    const response: Response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return (await response.json()) as JsonFeed; // Type assertion
  } catch (error: unknown) {
    console.error(`Error fetching JSON feed from ${url}:`, error);
    return null;
  }
}

// --- Helper Function to get last checked timestamp ---
async function getLastChecked(feedId: string): Promise<Date | null> {
  const result: Deno.KvEntryMaybe<string> = await kv.get([LAST_CHECK_KEY_PREFIX + feedId]);
  return result.value ? new Date(result.value) : null;
}

// --- Helper Function to set last checked timestamp ---
async function setLastChecked(feedId: string, timestamp: Date): Promise<void> {
  await kv.set([LAST_CHECK_KEY_PREFIX + feedId], timestamp.toISOString());
}

// --- Helper Function to check if a post is new or updated ---
function isPostNewOrUpdated(post: Post, lastCheckedTime: Date | null): boolean {
  // IMPORTANT: Adapt these date fields to match your JSON feed's structure.
  const publishedDate: Date = new Date(
    (post.date_published || post.published || post.date) as string,
  );
  const updatedDate: Date = new Date(
    (post.date_modified || post.updated_at || publishedDate.toISOString()) as string,
  ); // Fallback to publishedDate's ISO string if no explicit updated date

  const currentTime: number = Date.now();

  if (!lastCheckedTime) {
    return (currentTime - publishedDate.getTime()) <= TWENTY_FOUR_HOURS_IN_MS;
  }

  return (publishedDate.getTime() > lastCheckedTime.getTime()) ||
         (updatedDate.getTime() > lastCheckedTime.getTime());
}

// --- Function to ping IndexNow ---
async function pingIndexNow(host: string, apiKey: string, urls: string[]): Promise<void> {
  if (urls.length === 0) {
    console.log(`[${host}] No new URLs for IndexNow.`);
    return;
  }

  const payload = {
    host: host,
    key: apiKey,
    urlList: urls.map((url: string) => ({ loc: url })),
  };

  try {
    const response: Response = await fetch("https://api.indexnow.org/IndexNow", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      console.log(`[${host}] Successfully pinged IndexNow with ${urls.length} URLs.`);
    } else {
      const errorText: string = await response.text();
      console.error(
        `[${host}] Failed to ping IndexNow. Status: ${response.status}, Response: ${errorText}`,
      );
    }
  } catch (error: unknown) {
    console.error(`[${host}] Error pinging IndexNow:`, error);
  }
}

// --- Function to ping Ping-O-Matic ---
async function pingPingOMatic(siteConfig: SiteConfig): Promise<void> {
  if (!siteConfig.pingOMatic) {
    console.warn(`[${siteConfig.id}] Ping-O-Matic configuration is missing. Skipping.`);
    return;
  }

  const { title, blogUrl, rssUrl } = siteConfig.pingOMatic;
  if (!title || !blogUrl || !rssUrl) {
    console.warn(
      `[${siteConfig.id}] Missing Ping-O-Matic configuration (title, blogUrl, or rssUrl). Skipping.`,
    );
    return;
  }

  const encodedTitle: string = encodeURIComponent(title);
  const encodedBlogUrl: string = encodeURIComponent(blogUrl);
  const encodedRssUrl: string = encodeURIComponent(rssUrl);

  const pingUrl: string =
    `https://pingomatic.com/ping/?title=${encodedTitle}&blogurl=${encodedBlogUrl}&rssurl=${encodedRssUrl}&chk_blogs=on&chk_feedburner=on&chk_tailrank=on&chk_superfeedr=on`;

  try {
    const response: Response = await fetch(pingUrl, { method: "GET" });

    if (response.ok) {
      const responseText: string = await response.text();
      console.log(
        `[${siteConfig.id}] Successfully pinged Ping-O-Matic. Response: ${
          responseText.substring(0, 100)
        }...`,
      );
    } else {
      const errorText: string = await response.text();
      console.error(
        `[${siteConfig.id}] Failed to ping Ping-O-Matic. Status: ${response.status}, Response: ${errorText}`,
      );
    }
  } catch (error: unknown) {
    console.error(`[${siteConfig.id}] Error pinging Ping-O-Matic:`, error);
  }
}

// --- Main execution function for a single feed ---
async function processFeed(siteConfig: SiteConfig): Promise<void> {
  console.log(`Processing feed for ${siteConfig.id} (${siteConfig.feedUrl})...`);

  const lastCheckedTime: Date | null = await getLastChecked(siteConfig.id);
  const currentRunTime: Date = new Date();

  const feed: JsonFeed | null = await fetchJsonFeed(siteConfig.feedUrl);

  if (!feed || !feed.items || feed.items.length === 0) {
    console.log(`[${siteConfig.id}] Could not fetch feed or feed is empty.`);
    return;
  }

  const urlsToIndexNow: string[] = [];
  let hasUpdatedPostsForPingOMatic: boolean = false;

  for (const post of feed.items) {
    if (isPostNewOrUpdated(post, lastCheckedTime)) {
      if (post.url) {
        urlsToIndexNow.push(post.url);
        hasUpdatedPostsForPingOMatic = true;
      } else {
        console.warn(
          `[${siteConfig.id}] Post found without a 'url' field. Skipping for IndexNow/Ping-O-Matic:`,
          post,
        );
      }
    }
  }

  const indexNowApiKey: string | undefined = Deno.env.get(siteConfig.indexNowKeyEnv);
  if (!indexNowApiKey) {
    console.error(
      `[${siteConfig.id}] IndexNow API key not found for environment variable: ${siteConfig.indexNowKeyEnv}. Skipping IndexNow ping.`,
    );
  } else {
    await pingIndexNow(siteConfig.host, indexNowApiKey, urlsToIndexNow);
  }

  if (hasUpdatedPostsForPingOMatic && siteConfig.pingOMatic) {
    await pingPingOMatic(siteConfig);
  } else {
    console.log(`[${siteConfig.id}] No new or updated posts for Ping-O-Matic.`);
  }

  await setLastChecked(siteConfig.id, currentRunTime);
  console.log(`[${siteConfig.id}] Processing complete. Last checked timestamp updated.`);
}

// --- Deno Deploy Entry Point ---
addEventListener("fetch", async (event: FetchEvent) => {
  event.respondWith(
    new Response("Deno Deploy Multi-Site IndexNow/Ping-O-Matic checker running... (Check logs)", { status: 200 }),
  );

  console.log(`[${new Date().toISOString()}] Fetch event received. Starting background processing.`);

  try {
    // THIS IS THE KEY PART FOR THIS VERSION: Read SITE_CONFIG from an environment variable
    const siteConfigJson: string | undefined = Deno.env.get("SITE_CONFIG");
    if (!siteConfigJson) {
      console.error(`[${new Date().toISOString()}] Environment variable 'SITE_CONFIG' is NOT set. Please configure your site feeds.`);
      return; // Stop execution if no config is found
    }

    const siteConfigs: SiteConfig[] = JSON.parse(siteConfigJson);

    if (!Array.isArray(siteConfigs) || siteConfigs.length === 0) {
      console.error(`[${new Date().toISOString()}] SITE_CONFIG is not a valid JSON array or is empty.`);
      return; // Stop execution if config is invalid
    }

    console.log(`[${new Date().toISOString()}] Retrieved ${siteConfigs.length} site configurations from environment variable.`);

    const processingPromises: Promise<void>[] = siteConfigs.map(
      (config: SiteConfig) => processFeed(config),
    );
    await Promise.all(processingPromises);

    console.log(`[${new Date().toISOString()}] All site feeds processed.`);
  } catch (error: unknown) {
    console.error(`[${new Date().toISOString()}] Error in main execution loop:`, error);
    if (error instanceof Error) {
        console.error(error.stack); // Log full stack for detailed errors
    }
  }
});
