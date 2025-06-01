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

1.  **Confirm `main.js`:** update the `main.js` file.

2.  **Inspect Your JSON Feeds and Adjust Dates:**
    * Go to each of your JSON feed URLs.
    * Examine the structure of a typical post object.
    * Identify the fields that contain the **original publication date** and any **last updated/modified date**.
    * **Modify the `isPostNewOrUpdated` function** in `main.js` to correctly extract these dates. For example:
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

1.  **Create a `.env` file** in the same directory as `main.js`:
    ```
    SITE_CONFIG='[{"id": "site1-en", "host": "your-site1.com", "feedUrl": "https://your-site1.com/feed.en.json", "indexNowKeyEnv": "INDEXNOW_API_KEY_1", "pingOMatic": {"title": "Your Site 1 English Blog", "blogUrl": "https://your-site1.com/en/", "rssUrl": "https://your-site1.com/feed.en.xml"}}]'
    INDEXNOW_API_KEY_1="YOUR_ACTUAL_KEY_FOR_SITE1"
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

Now you can manage your site pings from Deno Deploy!
