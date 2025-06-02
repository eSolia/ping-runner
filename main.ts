// main.ts - Deno Deploy script for multi-site IndexNow and Ping-O-Matic submission
// Import cron to schedule
import './cron.ts';
// Import decodeBase64 for basic auth
import { decodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";

// --- Type Definitions ---
interface PingOMaticConfig {
  title: string;
  blogUrl: string;
  rssUrl: string;
}

export interface SiteConfig {
  id: string;
  host: string;
  feedUrl: string;
  indexNowKeyEnv: string;
  pingOMatic?: PingOMaticConfig;
  webSubHubUrl?: string; // Optional: URL of the WebSub hub to notify
}

interface Post {
  url?: string;
  date_published?: string;
  published?: string;
  date?: string;
  date_modified?: string;
  updated_at?: string;
  [key: string]: unknown;
}

interface JsonFeed {
  version: string;
  title: string;
  home_page_url: string;
  feed_url: string;
  items: Post[];
}

// --- Constants ---
const TWENTY_FOUR_HOURS_IN_MS: number = 240 * 60 * 60 * 1000;
const LAST_CHECK_KEY_PREFIX: string = "last_check_";
const SITE_CONFIG_KV_KEY = ["site_configs"]; // Key for storing all site configs in Deno KV

// --- Deno KV (Key-Value Store) for persistence ---
const kv: Deno.Kv = await Deno.openKv();

// --- KV Helper Functions for Site Config ---
async function getSiteConfigs(): Promise<SiteConfig[]> {
  const result: Deno.KvEntryMaybe<SiteConfig[]> = await kv.get(SITE_CONFIG_KV_KEY);
  return result.value || [];
}

async function setSiteConfigs(configs: SiteConfig[]): Promise<void> {
  await kv.set(SITE_CONFIG_KV_KEY, configs);
}

// --- Helper Function to fetch JSON ---
async function fetchJsonFeed(url: string): Promise<JsonFeed | null> {
  try {
    const response: Response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return (await response.json()) as JsonFeed;
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
  const publishedDate: Date = new Date(
    (post.date_published || post.published || post.date) as string,
  );
  const updatedDate: Date = new Date(
    (post.date_modified || post.updated_at || publishedDate.toISOString()) as string,
  );

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

  // --- START DEBUG ---
  console.log(`[${host}] IndexNow Payload for debugging: ${JSON.stringify(payload, null, 2)}`);
  // --- END DEBUG ---

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

// Function to notify Google's public websub hub
async function notifyWebSubHub(feedUrl: string, hubUrl: string = "https://pubsubhubbub.appspot.com/publish"): Promise<void> {
  const params = new URLSearchParams({
    'hub.mode': 'publish',
    'hub.url': feedUrl
  });

  try {
    const response = await fetch(hubUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (response.ok) {
      console.log(`Successfully notified WebSub hub (${hubUrl}) for feed: ${feedUrl}`);
    } else {
      const errorText = await response.text();
      console.error(`Failed to notify WebSub hub (${hubUrl}) for feed: ${feedUrl}. Status: ${response.status}, Response: ${errorText}`);
    }
  } catch (error: unknown) {
    console.error(`Error notifying WebSub hub (${hubUrl}) for feed: ${feedUrl}:`, error);
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

  // After other pings, if there were updates
  if (hasUpdatedPostsForPingOMatic) { // Reusing this flag to indicate *any* updates
    if (siteConfig.pingOMatic) {
        await pingPingOMatic(siteConfig);
    }
    // Notify WebSub hub if configured
    if (siteConfig.webSubHubUrl) {
      await notifyWebSubHub(siteConfig.feedUrl, siteConfig.webSubHubUrl);
    }
  } else {
    console.log(`[${siteConfig.id}] No new or updated posts.`); // Updated message
  }

  await setLastChecked(siteConfig.id, currentRunTime);
  console.log(`[${siteConfig.id}] Processing complete. Last checked timestamp updated.`);
}

// --- Basic Authentication Helper ---
function basicAuth(request: Request): Response | null {
  const ADMIN_USERNAME = Deno.env.get("ADMIN_USERNAME");
  const ADMIN_PASSWORD = Deno.env.get("ADMIN_PASSWORD");

  if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
    console.error("ADMIN_USERNAME or ADMIN_PASSWORD environment variables are not set for Basic Auth.");
    return new Response("Server configuration error: Admin credentials not set.", { status: 500 });
  }

  const authHeader = request.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Basic ")) {
    return new Response("Unauthorized", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="Admin"' },
    });
  }

  const encoded = authHeader.substring(6); // "Basic ".length is 6
  // CORRECTED USAGE: decodeBase64 instead of decode
  const decoded = new TextDecoder().decode(decodeBase64(encoded));
  const [username, password] = decoded.split(":");

  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    return null; // Authorized
  } else {
    return new Response("Unauthorized", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="Admin"' },
    });
  }
}

// --- Admin UI Rendering ---
function renderAdminPage(configs: SiteConfig[]): Response {
  const configJson = JSON.stringify(configs, null, 2); // Pretty print JSON

  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Deno Deploy Site Config Admin</title>
        <style>
            body { font-family: sans-serif; margin: 20px; background-color: #f4f4f4; color: #333; }
            h1 { color: #0056b3; }
            textarea {
                width: 90%;
                height: 400px;
                padding: 10px;
                margin-bottom: 10px;
                border: 1px solid #ccc;
                border-radius: 4px;
                font-family: monospace;
                white-space: pre;
                overflow-wrap: normal;
                overflow-x: auto;
            }
            button {
                padding: 10px 20px;
                background-color: #007bff;
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
            }
            button:hover { background-color: #0056b3; }
            .message {
                margin-top: 15px;
                padding: 10px;
                border-radius: 4px;
                font-weight: bold;
            }
            .success { background-color: #d4edda; color: #155724; border-color: #c3e6cb; }
            .error { background-color: #f8d7da; color: #721c24; border-color: #f5c6cb; }
        </style>
    </head>
    <body>
        <h1>Deno Deploy Site Configuration</h1>
        <p>Edit the JSON below to manage your site configurations. Save changes to update Deno KV.</p>
        <form id="configForm" method="POST" action="/update">
            <textarea id="siteConfig" name="siteConfig">${configJson}</textarea>
            <br>
            <button type="submit">Save Configuration</button>
        </form>
        <div id="message" class="message"></div>

        <script>
            const form = document.getElementById('configForm');
            const messageDiv = document.getElementById('message');

            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                messageDiv.textContent = '';
                messageDiv.className = 'message';

                try {
                    const textarea = document.getElementById('siteConfig');
                    const configData = textarea.value;

                    // Basic JSON validation before sending
                    try {
                        JSON.parse(configData);
                    } catch (jsonError) {
                        messageDiv.textContent = 'JSON Syntax Error: ' + jsonError.message;
                        messageDiv.classList.add('error');
                        return;
                    }

                    const response = await fetch('/update', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: configData
                    });

                    if (response.ok) {
                        const responseText = await response.text();
                        messageDiv.textContent = 'Configuration saved successfully! ' + responseText;
                        messageDiv.classList.add('success');
                    } else {
                        const errorText = await response.text();
                        messageDiv.textContent = 'Failed to save configuration: ' + response.status + ' ' + errorText;
                        messageDiv.classList.add('error');
                    }
                } catch (error) {
                    messageDiv.textContent = 'An unexpected error occurred: ' + error.message;
                    messageDiv.classList.add('error');
                }
            });
        </script>
    </body>
    </html>
  `;
  return new Response(html, {
    headers: { "Content-Type": "text/html" },
  });
}

// --- Deno Deploy Entry Point ---
addEventListener("fetch", async (event: FetchEvent) => {
  const request = event.request;
  const url = new URL(request.url);

  console.log(`[${new Date().toISOString()}] Request received: ${request.method} ${url.pathname}`);

  // --- Admin UI Routes ---
  if (url.pathname === "/admin") {
    const authResponse = basicAuth(request);
    if (authResponse) {
      event.respondWith(authResponse);
      return;
    }
    const currentConfigs = await getSiteConfigs();
    event.respondWith(renderAdminPage(currentConfigs));
    return;
  }

  if (url.pathname === "/update" && request.method === "POST") {
    const authResponse = basicAuth(request);
    if (authResponse) {
      event.respondWith(authResponse);
      return;
    }

    try {
      const newConfigs: SiteConfig[] = await request.json(); // Expect JSON payload
      if (!Array.isArray(newConfigs)) {
        throw new Error("Invalid JSON: Expected an array of site configurations.");
      }
      await setSiteConfigs(newConfigs);
      console.log(`[${new Date().toISOString()}] Site configurations updated successfully in Deno KV.`);
      event.respondWith(new Response("Configuration saved successfully", { status: 200 }));
    } catch (error: unknown) {
      console.error(`[${new Date().toISOString()}] Error updating configurations:`, error);
      event.respondWith(
        new Response(`Error: ${(error as Error).message || "Invalid configuration format."}`, { status: 400 }),
      );
    }
    return;
  }

  // --- Main Cron Job Execution (for '/') ---
  if (url.pathname === "/") {
    // Respond immediately for cron jobs, then run background task
    event.respondWith(
      new Response("Deno Deploy Multi-Site IndexNow/Ping-O-Matic checker running... (Check logs for details)", { status: 200 }),
    );

    console.log(`[${new Date().toISOString()}] Starting background processing for cron job.`);

    try {
      const siteConfigs: SiteConfig[] = await getSiteConfigs(); // Read from KV

      if (!Array.isArray(siteConfigs) || siteConfigs.length === 0) {
        console.warn(`[${new Date().toISOString()}] No site configurations found in Deno KV. Skipping cron job processing.`);
        return;
      }

      console.log(`[${new Date().toISOString()}] Retrieved ${siteConfigs.length} site configurations from Deno KV.`);

      const processingPromises: Promise<void>[] = siteConfigs.map(
        (config: SiteConfig) => processFeed(config),
      );
      await Promise.all(processingPromises);

      console.log(`[${new Date().toISOString()}] All site feeds processed.`);
    } catch (error: unknown) {
      console.error(`[${new Date().toISOString()}] Error in main cron execution loop:`, error);
      if (error instanceof Error) {
          console.error(error.stack);
      }
    }
    return;
  }

  // Handle other unknown paths
  event.respondWith(new Response("Not Found", { status: 404 }));
});
