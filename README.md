# ping-runner
Pings indexnow and ping-o-matic for new items in rss feeds from listed sites.

## Setup and Deployment Instructions

This guide walks you through setting up and deploying a Deno Deploy script for multi-site IndexNow and Ping-O-Matic submission.

### How to Set Up

This script uses **Environment Variables** for configuration and **Deno KV (Key-Value Store)** for persistent storage of `SITE_CONFIG` and `lastCheckedTime` for each feed.

1.  **Review `main.js`:**
    * The `main.js` in the root of the project is the script that Deno Deploy will run, to check your feeds and ping ping-o-matic.

2.  **Inspect Your JSON Feeds and Adjust Date Fields (Crucial):**
    * Go to each of your JSON feed URLs and inspect the structure of a typical post object.
    * Identify the fields that contain the **original publication date** and any **last updated/modified date**.
    * **Modify the `isPostNewOrUpdated` function** within `main.js` to correctly extract these dates. For example:
        ```javascript
        function isPostNewOrUpdated(post, lastCheckedTime) {
          // IMPORTANT: Adapt these date fields to match your JSON feed's structure.
          // Common fields: 'date_published', 'published', 'date', 'updated_at', 'modified'
          const publishedDate = new Date(post.date_published || post.published || post.date || post.your_custom_pub_field);
          const updatedDate = new Date(post.date_modified || post.updated_at || post.your_custom_mod_field || publishedDate);

          const currentTime = Date.now();

          if (!lastCheckedTime) {
            return (currentTime - publishedDate.getTime()) <= (24 * 60 * 60 * 1000); // TWENTY_FOUR_HOURS_IN_MS
          }
          return (publishedDate.getTime() > lastCheckedTime.getTime()) || (updatedDate.getTime() > lastCheckedTime.getTime());
        }
        ```
        *Ensure the date strings are in a format that `new Date()` can parse (e.g., ISO 8601 like `YYYY-MM-DDTHH:mm:ssZ`).*

3.  **Set Environment Variables in Deno Deploy:**

    * Access your Deno Deploy project settings.
    * Navigate to "Environment Variables" (or similar if they renamed it).

    * **IndexNow API Keys**:
        * For *each unique IndexNow API key* you have, add a separate environment variable.
        * The names of these variables should match what you'll define in your `SITE_CONFIG` (e.g., `INDEXNOW_API_KEY_YOURSITE1`).
        * Set their values to your actual IndexNow keys.
        * Mark these variables as **Secret**.

4.  **Initial Deno KV Setup (Crucial):**
    * When you first deploy this, your Deno KV will be empty. The UI will initially show an empty configuration.
    * **To populate it:**
        1.  Deploy your project to Deno Deploy.
        2.  Access your deployed Deno Deploy URL with `/admin` appended (e.g., `https://your-project.deno.dev/admin`).
        3.  You will be prompted for Basic Authentication. Enter the `ADMIN_USERNAME` and `ADMIN_PASSWORD` you set in the environment variables.
        4.  On the loaded page, you will see a large textarea. Paste your `SITE_CONFIG` JSON (the array of site objects defined below, filled in with your actual site details) into this textarea.
        5.  Click "Save Configuration". This action will write the configuration data into Deno KV, making it persistent.

    * **`SITE_CONFIG` JSON Structure Example:**
        (This entire JSON array will be the content you paste into the textarea in the Deno Deploy Admin UI)

        ```json
        [
          {
            "id": "site1-en",
            "host": "your-site1.com",
            "feedUrl": "[https://your-site1.com/feed.en.json](https://your-site1.com/feed.en.json)",
            "indexNowKeyEnv": "INDEXNOW_API_KEY_YOURSITE1",
            "pingOMatic": {
              "title": "Your Site 1 English Blog",
              "blogUrl": "[https://your-site1.com/en/](https://your-site1.com/en/)",
              "rssUrl": "[https://your-site1.com/feed.en.xml](https://your-site1.com/feed.en.xml)"
            }
          },
          {
            "id": "site1-ja",
            "host": "your-site1.com",
            "feedUrl": "[https://your-site1.com/feed.ja.json](https://your-site1.com/feed.ja.json)",
            "indexNowKeyEnv": "INDEXNOW_API_KEY_YOURSITE1",
            "pingOMatic": {
              "title": "Your Site 1 Japanese Blog",
              "blogUrl": "[https://your-site1.com/ja/](https://your-site1.com/ja/)",
              "rssUrl": "[https://your-site1.com/feed.ja.xml](https://your-site1.com/feed.ja.xml)"
            }
          },
          {
            "id": "site2-en",
            "host": "your-site2.com",
            "feedUrl": "[https://your-site2.com/feed.json](https://your-site2.com/feed.json)",
            "indexNowKeyEnv": "INDEXNOW_API_KEY_YOURSITE2",
            "pingOMatic": {
              "title": "Your Site 2 Blog",
              "blogUrl": "[https://your-site2.com/](https://your-site2.com/)",
              "rssUrl": "[https://your-site2.com/feed.xml](https://your-site2.com/feed.xml)"
            }
          }
        ]
        ```

        *Replace the placeholder values (`your-site1.com`, `https://your-site1.com/feed.en.json`, `INDEXNOW_API_KEY_YOURSITE1`, etc.) with your actual site details.*

5.  **Redeploy:**
    * After you've set all the necessary environment variables, ensure your Deno Deploy project is redeployed. This will pick up the new environment variables.

6.  **Set Up Cron Job:**
    * In your Deno Deploy project settings, configure a cron job to run this script at your desired interval (e.g., once every 24 hours).
    * The **cron URL** should be your deployed project's root URL (e.g., `https://your-project.deno.dev/`). This URL will trigger the feed processing logic.

7.  **Access the Admin UI:**
    * To view and edit your `SITE_CONFIG` at any time, navigate to `https://your-project.deno.dev/admin` in your web browser.
    * You will be prompted for the basic authentication credentials (`ADMIN_USERNAME` and `ADMIN_PASSWORD`).

This comprehensive setup should give you a powerful and flexible way to manage your site pings from Deno Deploy with a convenient web UI.

* * * 

You're welcome! That's an excellent idea to consolidate the pings for multiple sites and languages, and adding Ping-O-Matic is a smart move for broader visibility.

Here's an adapted Deno Deploy script that handles multiple feeds, checks for new *and* updated posts, and pings both IndexNow and Ping-O-Matic.

We'll use Deno Deploy's **Environment Variables** feature to store sensitive data (like API keys) and configuration (like your site details), which is a best practice for security and flexibility.

```javascript
// main.js - Deno Deploy script for multi-site IndexNow and Ping-O-Matic submission

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
```

### Key Changes and How to Set Up

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
        * `rssUrl`: The URL of your RSS feed (Ping-O-Matic often uses this).

2.  **Deno KV (Key-Value Store):**
    * `Deno.openKv()` is used to get a connection to Deno Deploy's built-in, persistent key-value store.
    * `getLastChecked` and `setLastChecked` functions now use KV to store the timestamp of the last successful check for *each individual feed ID*. This ensures that if the script runs again, it only processes posts published/updated since the *last time that specific feed was checked*.

3.  **`isPostNewOrUpdated` Function:**
    * This function is enhanced to check for both `date_published` (or similar) and `date_modified` (or `updated_at`).
    * It compares the post's date against the `lastCheckedTime` retrieved from Deno KV.
    * **Crucially, you still need to adjust the `publishedDate` and `updatedDate` lines** within this function to accurately parse dates from *your specific JSON feed formats*. Look for fields like `date_published`, `published`, `date`, `modified`, `updated_at`, etc.

4.  **`pingPingOMatic` Function:**
    * Takes the `siteConfig` object directly to access `title`, `blogUrl`, and `rssUrl`.
    * Constructs the Ping-O-Matic URL with `encodeURIComponent` for safety.
    * Pings Ping-O-Matic with a `GET` request.

5.  **Main Execution Flow:**
    * The `addEventListener("fetch", ...)` block is the entry point for Deno Deploy.
    * It fetches the `SITE_CONFIG` environment variable, parses it as JSON.
    * It then iterates through each configured site/feed and calls `processFeed` for each. `Promise.all` allows them to run concurrently, speeding things up.

### Deployment Steps (Revised)

1.  **Update `main.js`:** Copy and paste the new code into your `main.js` file.

2.  **Inspect Your JSON Feeds and Adjust Dates:**
    * Go to each of your JSON feed URLs.
    * Examine the structure of a typical post object.
    * Identify the fields that contain the **original publication date** and any **last updated/modified date**.
    * **Modify the `isPostNewOrUpdated` function** in `main.js` to correctly extract these dates. For example:
        ```javascript
        const publishedDate = new Date(post.published_at_iso8601); // Example: if your field is 'published_at_iso8601'
        const updatedDate = new Date(post.last_modified_date);     // Example: if your field is 'last_modified_date'
        ```
        If you only have a single `date` field, use that for both `publishedDate` and `updatedDate` variables, or remove the `updatedDate` logic if updates aren't tracked.

3.  **Set Environment Variables in Deno Deploy:**

    * **`SITE_CONFIG`**:
        * Go to your Deno Deploy project settings.
        * Find "Environment Variables".
        * Add a new variable named `SITE_CONFIG`.
        * For its value, paste the entire JSON array from the `Configuration` section above, filled in with your actual site details. **Make sure it's valid JSON.**
        * Example (make sure it's a single line or properly escaped if pasting into a text field that doesn't handle newlines):
            ```json
            [{"id": "site1-en", "host": "your-site1.com", "feedUrl": "https://your-site1.com/feed.en.json", "indexNowKeyEnv": "INDEXNOW_API_KEY_YOURSITE1", "pingOMatic": {"title": "Your Site 1 English Blog", "blogUrl": "https://your-site1.com/en/", "rssUrl": "https://your-site1.com/feed.en.xml"}}, {"id": "site1-ja", "host": "your-site1.com", "feedUrl": "https://your-site1.com/feed.ja.json", "indexNowKeyEnv": "INDEXNOW_API_KEY_YOURSITE1", "pingOMatic": {"title": "Your Site 1 Japanese Blog", "blogUrl": "https://your-site1.com/ja/", "rssUrl": "https://your-site1.com/feed.ja.xml"}}]
            ```
            It's usually easier to write this JSON in a text editor first, then copy-paste it.

    * **IndexNow API Keys**:
        * For *each unique IndexNow API key* you have, add a separate environment variable.
        * For example, if `SITE_CONFIG` uses `INDEXNOW_API_KEY_YOURSITE1` and `INDEXNOW_API_KEY_YOURSITE2`, you'll need to create two environment variables:
            * `INDEXNOW_API_KEY_YOURSITE1 = "YOUR_ACTUAL_KEY_FOR_SITE1"`
            * `INDEXNOW_API_KEY_YOURSITE2 = "YOUR_ACTUAL_KEY_FOR_SITE2"`
        * Mark these as "Secret" in Deno Deploy for security.

4.  **Redeploy:** Once environment variables are set, Deno Deploy should automatically trigger a redeployment. If not, manually redeploy your project.

5.  **Set Up Cron Job:**
    * In your Deno Deploy project settings, configure a cron job to run this script at your desired interval (e.g., once every 24 hours). The cron URL will be your deployed project's main URL.

### Testing Locally (Optional, but Recommended)

You can test this script locally with Deno, though interacting with Deno KV for local testing can be a bit more involved as it uses a local database file.

To test the core logic (fetching feeds, identifying posts):

1.  **Create a `.env` file** in the same directory as `main.js`:
    ```
    SITE_CONFIG='[{"id": "site1-en", "host": "your-site1.com", "feedUrl": "https://your-site1.com/feed.en.json", "indexNowKeyEnv": "INDEXNOW_API_KEY_YOURSITE1", "pingOMatic": {"title": "Your Site 1 English Blog", "blogUrl": "https://your-site1.com/en/", "rssUrl": "https://your-site1.com/feed.en.xml"}}]'
    INDEXNOW_API_KEY_YOURSITE1="YOUR_ACTUAL_KEY_FOR_SITE1"
    # Add other site configs and API keys as needed
    ```
    *Note the single quotes around the JSON string for `SITE_CONFIG`.*

2.  **Add local execution block** (temporarily) at the end of `main.js`:
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
    deno run --allow-net --allow-env --allow-read main.js
    ```
    Observe the console output for any errors or successful pings.

This comprehensive setup should give you a powerful and flexible way to manage your site pings from Deno Deploy!
