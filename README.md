# ping-runner
Pings indexnow and ping-o-matic for new items in rss feeds from listed sites.

## Setup and Deployment Instructions

This guide walks you through setting up and deploying a Deno Deploy script for multi-site IndexNow and Ping-O-Matic submission.

### How to Set Up

This script uses **Environment Variables** for storing configuration of API keys and site details, and **Deno KV (Key-Value Store)** for persistent storage of `SITE_CONFIG` and `lastCheckedTime` for each feed. It handles multiple feeds, checks for new *and* updated posts, and pings both IndexNow and Ping-O-Matic.

1.  **Centralized Configuration (`SITE_CONFIG` Environment Variable):**
    Instead of hardcoding each site's details, we'll use a single JSON string stored in a Deno Deploy environment variable named `SITE_CONFIG`. This makes it easy to add or modify sites without redeploying code.

    * Each object in the `SITE_CONFIG` array represents a single feed you want to monitor.
    * `id`: A unique identifier for the feed (e.g., "myblog-en", "news-ja"). Used for Deno KV storage.
    * `host`: The domain of the site for IndexNow.
    * `feedUrl`: The URL of the JSON feed.
    * `indexNowKeyEnv`: The **name of the environment variable** where the IndexNow API key for this site is stored (e.g., `"INDEXNOW_API_KEY_YOURSITE1"`). This allows you to have different IndexNow keys if needed, or share one across feeds for the same domain.
    * `pingOMatic`: An object containing details for Ping-O-Matic.
        * `title`: The title of your blog/site.
        * `blogUrl`: The main URL of your blog/site.
        * `rssUrl`: The URL of your RSS feed.

2.  **Deno KV (Key-Value Store):**
    * `Deno.openKv()` is used to get a connection to Deno Deploy's built-in, persistent key-value store.
    * `getLastChecked` and `setLastChecked` functions use KV to store the timestamp of the last successful check for *each individual feed ID*. This ensures that if the script runs again, it only processes posts published/updated since the *last time that specific feed was checked*.

3.  **`isPostNewOrUpdated` Function:**
    * This function checks for both `date_published` (or similar) and `date_modified` (or `updated_at`).
    * It compares the post's date against the `lastCheckedTime` retrieved from Deno KV.
    * **Adjust the `publishedDate` and `updatedDate` lines** within this function to accurately parse dates from *your specific JSON feed formats*. Look for fields like `date_published`, `published`, `date`, `modified`, `updated_at`, etc.

4.  **`pingPingOMatic` Function:**
    * Takes the `siteConfig` object directly to access `title`, `blogUrl`, and `rssUrl`.
    * Constructs the Ping-O-Matic URL with `encodeURIComponent` for safety.
    * Pings Ping-O-Matic with a `GET` request.

5.  **Main Execution Flow:**
    * The `addEventListener("fetch", ...)` block is the entry point for Deno Deploy.
    * It fetches the `SITE_CONFIG` environment variable, parses it as JSON.
    * It then iterates through each configured site/feed and calls `processFeed` for each. `Promise.all` allows them to run concurrently, speeding things up.

### Deployment Steps

1.  **Confirm `main.ts`:** update the `main.ts` file.

2.  **Inspect Your JSON Feeds and Adjust Dates:**
    * Go to each of your JSON feed URLs.
    * Examine the structure of a typical post object.
    * Identify the fields that contain the **original publication date** and any **last updated/modified date**.
    * **Modify the `isPostNewOrUpdated` function** in `main.ts` to correctly extract these dates. For example:
        ```javascript
        const publishedDate = new Date(post.published_at_iso8601); // Example: if your field is 'published_at_iso8601'
        const updatedDate = new Date(post.last_modified_date);     // Example: if your field is 'last_modified_date'
        ```

3.  **Set Environment Variables in Deno Deploy:**

    * **`SITE_CONFIG`**:
        * Go to your Deno Deploy project settings.
        * Find "Environment Variables".
        * Add a new variable named `SITE_CONFIG`.
        * For its value, paste the entire JSON array from the `Configuration` section above, filled in with your actual site details. **Make sure it's valid JSON.**
        * Example (make sure it's a single line or properly escaped if pasting into a text field that doesn't handle newlines):
            ```json
            [{"id": "site1-en", "host": "your-site1.com", "feedUrl": "https://your-site1.com/feed.en.json", "indexNowKeyEnv": "INDEXNOW_API_KEY_1", "pingOMatic": {"title": "Your Site 1 English Blog", "blogUrl": "https://your-site1.com/en/", "rssUrl": "https://your-site1.com/feed.en.xml"}}, {"id": "site1-ja", "host": "your-site1.com", "feedUrl": "https://your-site1.com/feed.ja.json", "indexNowKeyEnv": "INDEXNOW_API_KEY_1", "pingOMatic": {"title": "Your Site 1 Japanese Blog", "blogUrl": "https://your-site1.com/ja/", "rssUrl": "https://your-site1.com/feed.ja.xml"}}]
            ```
            Tip: Write this JSON in a text editor first, then copy-paste it.

    * **IndexNow API Keys**:
        * For *each unique IndexNow API key* you have, add a separate environment variable.
        * For example, if `SITE_CONFIG` uses `INDEXNOW_API_KEY_1` and `INDEXNOW_API_KEY_2`, you'll need to create two environment variables:
            * `INDEXNOW_API_KEY_1 = "YOUR_ACTUAL_KEY_FOR_SITE1"`
            * `INDEXNOW_API_KEY_2 = "YOUR_ACTUAL_KEY_FOR_SITE2"`
        * Mark these as "Secret" in Deno Deploy for security.

4.  **Redeploy:** Once environment variables are set, Deno Deploy should automatically trigger a redeployment. If not, manually redeploy your project.

5.  **Set Up Cron Job:**
    * In your Deno Deploy project settings, configure a cron job to run this script at your desired interval (e.g., once every 24 hours). The cron URL will be your deployed project's main URL.

### Testing Locally (Optional)

You can test this script locally with Deno, though interacting with Deno KV for local testing can be a bit more involved as it uses a local database file.

To test the core logic (fetching feeds, identifying posts):

1.  **Create a `.env` file** in the same directory as `main.ts`:
    ```
    SITE_CONFIG='[{"id": "site1-en", "host": "your-site1.com", "feedUrl": "https://your-site1.com/feed.en.json", "indexNowKeyEnv": "INDEXNOW_API_KEY_1", "pingOMatic": {"title": "Your Site 1 English Blog", "blogUrl": "https://your-site1.com/en/", "rssUrl": "https://your-site1.com/feed.en.xml"}}]'
    INDEXNOW_API_KEY_1="YOUR_ACTUAL_KEY_FOR_SITE1"
    # Add other site configs and API keys as needed
    ```
    *Note the single quotes around the JSON string for `SITE_CONFIG`.*

2.  **Add local execution block** (temporarily) at the end of `main.ts`:
    ```javascript
    // To run locally for testing (optional):
    if (import.meta.main) {
      // For local testing, we need to manually call the main logic
      // without relying on the 'fetch' event listener.
      // Deno KV will create a local 'kv.sqlite' file for persistence.
      (async () => {
        try {
          // Manually load environment variables for local testing
          // Deno Deploy handles this automatically
          const { load } = await import("https://deno.land/std@0.203.0/dotenv/mod.ts");
          await load({export: true});

          const siteConfigJson = Deno.env.get("SITE_CONFIG");
          if (!siteConfigJson) {
            console.error("Local: Environment variable 'SITE_CONFIG' is not set.");
            return;
          }

          const siteConfigs = JSON.parse(siteConfigJson);
          if (!Array.isArray(siteConfigs) || siteConfigs.length === 0) {
            console.error("Local: SITE_CONFIG is not a valid array or is empty.");
            return;
          }

          const processingPromises = siteConfigs.map(config => processFeed(config));
          await Promise.all(processingPromises);

          console.log("Local: All site feeds processed.");
        } catch (error) {
          console.error("Local: Error during test run:", error);
        } finally {
          kv.close(); // Close KV connection after testing
        }
      })();
    }
    ```
    *You'll need `allow-read`, `allow-env`, and `allow-net` permissions.*

3.  **Run with Deno:**
    ```bash
    deno run --allow-net --allow-env --allow-read main.ts
    ```
    Observe the console output for any errors or successful pings.

Now you can manage your site pings from Deno Deploy!

* * * 

Okay, let's convert your `main.js` to `main.ts`! You're making a great move by learning TypeScript; it adds a powerful layer of safety and clarity to your JavaScript projects.

The core difference between JavaScript (`.js`) and TypeScript (`.ts`) is **type checking**. TypeScript allows you to explicitly define the **types** of your variables, function parameters, and return values. This helps catch errors *before* you even run your code, leading to more robust and maintainable applications. Deno natively supports TypeScript, so it's a seamless experience.

Here's your `main.ts` with type annotations and some explanation:

---

```typescript
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
```

---

### What's Changed and Why

1.  **File Extension:**
    * Changed `main.js` to `main.ts`. This tells Deno (and your code editor) to treat the file as a TypeScript file and apply type checking.

2.  **Type Definitions (Interfaces):**
    * **`PingOMaticConfig`**: Defines the expected shape of the `pingOMatic` object.
    * **`SiteConfig`**: Defines the structure for each site's configuration. Notice `pingOMatic?: PingOMaticConfig;` – the `?` makes `pingOMatic` an **optional** property, meaning a `SiteConfig` object might or might not have it. This is good for flexibility if some sites don't use Ping-O-Matic.
    * **`Post`**: Defines the expected properties for an individual post item in your JSON feed. I've added optional `?` for `url`, `date_published`, etc., because your code already handles their potential absence. `[key: string]: unknown;` is a way to tell TypeScript that this object might have other properties whose types you don't explicitly know or need to check.
    * **`JsonFeed`**: Defines the overall structure of your JSON feed.
    * **Why?** Interfaces are the cornerstone of TypeScript. They allow you to describe the "contract" for your data shapes. This helps TypeScript understand what properties are available on an object and their types, preventing typos (e.g., `post.urlz` would be caught) and making the code more readable.

3.  **Type Annotations (`: Type`):**
    * You'll see `: string`, `: number`, `: Date | null`, `: Promise<void>`, `: SiteConfig[]`, etc., added after variable declarations and function parameters.
    * **`const TWENTY_FOUR_HOURS_IN_MS: number = ...`**: Explicitly states `TWENTY_FOUR_HOURS_IN_MS` is a number.
    * **`url: string`**: The `url` parameter of `fetchJsonFeed` must be a string.
    * **`: Promise<JsonFeed | null>`**: The `fetchJsonFeed` function promises to return either a `JsonFeed` object or `null`.
    * **`error: unknown`**: When catching errors in `try...catch` blocks, TypeScript defaults to `unknown` because an error can be of any type.
    * **`event: FetchEvent`**: In the `addEventListener("fetch", ...)` callback, the `event` object is specifically a `FetchEvent` in Deno Deploy's context.
    * **Why?** These annotations tell TypeScript the expected type. If you try to pass a number to a function expecting a string, or assign a string to a variable meant for a number, TypeScript will flag it as an error *before runtime*. This is invaluable for preventing bugs.

4.  **Type Assertions (`as Type`):**
    * `return (await response.json()) as JsonFeed;` in `fetchJsonFeed`.
    * `const publishedDate: Date = new Date((post.date_published || post.published || post.date) as string);`
    * **Why?** Sometimes, TypeScript's inference isn't enough, or you know more about the type than TypeScript can automatically deduce. `response.json()` returns `Promise<any>`, but you know it will be a `JsonFeed`. `new Date()` expects a `string` (among other types), and while `post.date_published` etc. might be `undefined`, the `||` operator ensures that *if* a value is present, it will be a string. The `as string` tells TypeScript, "Trust me, if there's a value here, it's a string."

5.  **Handling `undefined` and `null`:**
    * TypeScript's strict null checks are often enabled by default (especially in Deno). This means variables can't be `null` or `undefined` unless explicitly declared (e.g., `Date | null`).
    * You'll see more explicit checks like `if (!siteConfig.pingOMatic)` to handle optional properties gracefully, which is a good practice anyway.

### Benefits of TypeScript

* **Early Bug Detection:** Catch typos, type mismatches, and common programming errors during development, not at runtime.
* **Improved Readability:** Type annotations act as documentation, making it easier for you and others to understand what data a function expects and returns.
* **Better Tooling:** Code editors (like VS Code) use TypeScript to provide much richer autocompletion, refactoring tools, and inline error checking.
* **Easier Refactoring:** When you change a type or property name, TypeScript helps you find all places in your codebase that need updating.
* **Scalability:** For larger projects, TypeScript helps manage complexity by enforcing structure and consistency.

Now, you can save this as `main.ts` and deploy it to Deno Deploy. Deno will automatically transpile (convert) the TypeScript to JavaScript before running it.

Let me know if you have any questions about specific type annotations or TypeScript concepts!
