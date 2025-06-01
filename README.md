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
