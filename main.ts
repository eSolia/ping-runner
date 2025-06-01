// main.ts - Deno Deploy script for multi-site IndexNow and Ping-O-Matic submission
// main.ts - Deno Deploy script for multi-site IndexNow and Ping-O-Matic submission
import './cron.ts'; // Assuming cron.ts handles scheduling logic separately

// --- Type Definitions ---
// Define interfaces for the structure of your configuration and post data
interface PingOMaticConfig {
  title: string;
  blogUrl: string;
  rssUrl: string;
}

interface SiteConfig {
  id: string;
  host: string;
  feedUrl: string;
  indexNowKeyEnv: string;
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
  // Add other properties you might access, e.g., title: string; content_html: string;
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
// Deno.Kv will infer its type, but explicitly typing helps clarity
const kv: Deno.Kv = await Deno.openKv();

// --- Helper Function to fetch JSON ---
async function fetchJsonFeed(url: string): Promise<JsonFeed | null> {
  try {
    const response: Response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    // Type assertion 'as JsonFeed' because fetch().json() returns Promise<any>
    return (await response.json()) as JsonFeed;
  } catch (error: unknown) { // Use 'unknown' for caught errors as they can be anything
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
  // Using 'as string' to tell TypeScript these properties are expected to be strings
  const publishedDate: Date = new Date(
    (post.date_published || post.published || post.date) as string,
  );
  const updatedDate: Date = new Date(
    (post.date_modified || post.updated_at || publishedDate.toISOString()) as string,
  ); // Fallback to publishedDate's ISO string

  const currentTime: number = Date.now();

  // If there's no lastCheckedTime (first run), consider anything within 24h as new
  if (!lastCheckedTime) {
    return (currentTime - publishedDate.getTime()) <= TWENTY_FOUR_HOURS_IN_MS;
  }

  // Check if published or updated after the last check
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
  // Check if pingOMatic property exists and is not undefined
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

  // URL-encode all parameters
  const encodedTitle: string = encodeURIComponent(title);
  const encodedBlogUrl: string = encodeURIComponent(blogUrl);
  const encodedRssUrl: string = encodeURIComponent(rssUrl);

  const pingUrl: string =
    `https://pingomatic.com/ping/?title=${encodedTitle}&blogurl=${encodedBlogUrl}&rssurl=${encodedRssUrl}&chk_blogs=on&chk_feedburner=on&chk_tailrank=on&chk_superfeedr=on`;

  try {
    const response: Response = await fetch(pingUrl, { method: "GET" });

    if (response.ok) {
      const responseText: string = await response.text();
      // pingPingOMatic does not take updatedPostUrl as parameter in this implementation
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
  const currentRunTime: Date = new Date(); // Capture time at the start of this run

  const feed: JsonFeed | null = await fetchJsonFeed(siteConfig.feedUrl);

  if (!feed || !feed.items || feed.items.length === 0) {
    console.log(`[${siteConfig.id}] Could not fetch feed or feed is empty.`);
    return;
  }

  const urlsToIndexNow: string[] = [];
  let hasUpdatedPostsForPingOMatic: boolean = false; // Flag to decide if we need to ping Ping-O-Matic

  for (const post of feed.items) {
    if (isPostNewOrUpdated(post, lastCheckedTime)) {
      if (post.url) {
        urlsToIndexNow.push(post.url);
        hasUpdatedPostsForPingOMatic = true; // Mark that at least one post was new/updated
      } else {
        console.warn(
          `[${siteConfig.id}] Post found without a 'url' field. Skipping for IndexNow/Ping-O-Matic:`,
          post,
        );
      }
    }
  }

  // Get the IndexNow API key from environment variables
  const indexNowApiKey: string | undefined = Deno.env.get(siteConfig.indexNowKeyEnv);
  if (!indexNowApiKey) {
    console.error(
      `[${siteConfig.id}] IndexNow API key not found for environment variable: ${siteConfig.indexNowKeyEnv}. Skipping IndexNow ping.`,
    );
  } else {
    await pingIndexNow(siteConfig.host, indexNowApiKey, urlsToIndexNow);
  }

  // Ping Ping-O-Matic only if there were new/updated posts
  if (hasUpdatedPostsForPingOMatic && siteConfig.pingOMatic) {
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
addEventListener("fetch", async (event: FetchEvent) => {
  event.respondWith(
    new Response("Deno Deploy Multi-Site IndexNow/Ping-O-Matic checker running...", { status: 200 }),
  );

  try {
    const siteConfigJson: string | undefined = Deno.env.get("SITE_CONFIG");
    if (!siteConfigJson) {
      console.error("Environment variable 'SITE_CONFIG' is not set. Please configure your site feeds.");
      return;
    }

    const siteConfigs: SiteConfig[] = JSON.parse(siteConfigJson);

    if (!Array.isArray(siteConfigs) || siteConfigs.length === 0) {
      console.error("SITE_CONFIG is not a valid array or is empty.");
      return;
    }

    // Process each site/feed concurrently
    const processingPromises: Promise<void>[] = siteConfigs.map(
      (config: SiteConfig) => processFeed(config),
    );
    await Promise.all(processingPromises);

    console.log("All site feeds processed.");
  } catch (error: unknown) {
    console.error("Error in main execution loop:", error);
  }
});
