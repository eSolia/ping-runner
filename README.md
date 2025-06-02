# ping-runner
Runs on Deno Deploy using its KV store. Pings indexnow, ping-o-matic and webSub for new items in rss feeds from listed sites.

## Setup and Deployment Instructions

This guide walks you through setting up and deploying a Deno Deploy script for multi-site IndexNow,  Ping-O-Matic and webSub submission.

### Background

This script uses **Environment Variables** for storing configuration of API keys and site details, and **Deno KV (Key-Value Store)** for persistent storage of `SITE_CONFIG` and `lastCheckedTime` for each feed. It handles multiple feeds, checks for new *and* updated posts, and pings IndexNow, Ping-O-Matic and webSub.

1.  **Deno Deploy Project Environment Variables:**
    Store the following in the env vars for your project: 

    * ADMIN_USERNAME, ADMIN_PASSWORD - credentials to log into the /admin screen
    * INDEXNOW_API_ESOLIABLOG_1 etc - the indexnow api key (add as many as needed, and enter their names in the SITE_CONFIG array in /admin as needed)

2.  **Deno KV (Key-Value Store):**
    * `Deno.openKv()` is used to get a connection to Deno Deploy's built-in, persistent key-value store.
    * `getLastChecked` and `setLastChecked` functions use KV to store the timestamp of the last successful check for *each individual feed ID*. This ensures that if the script runs again, it only processes posts published/updated since the *last time that specific feed was checked*.
    * Each object in the `SITE_CONFIG` array represents a single feed you want to monitor.
      * `id`: A unique identifier for the feed (e.g., "myblog-en", "news-ja"). Used for Deno KV storage.
      * `host`: The domain of the site for IndexNow.
      * `feedUrl`: The URL of the JSON feed.
      * `indexNowKeyEnv`: The **name of the environment variable** where the IndexNow API key for this site is stored (e.g., `"INDEXNOW_API_KEY_YOURSITE1"`). This allows you to have different IndexNow keys if needed, or share one across feeds for the same domain.
      * `pingOMatic`: An object containing details for Ping-O-Matic.
          * `title`: The title of your blog/site.
          * `blogUrl`: The main URL of your blog/site.
          * `rssUrl`: The URL of your RSS feed.

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

1. **Create a Deno Deploy Project:** log into your Deno Deploy account, create a project and link it to github. Select `main.ts` as the entrypoint. 

2.  **Confirm `main.ts`:** inspect the feeds you'll monitor, then update the `main.ts` file, updating the `isPostNewOrUpdated` function to correctly extract the dates in your actual feeds. The script covers a lot of what you'll typically find but you never know. 

3.  **Set Environment Variables in Deno Deploy Project Settings:** admin screen basic auth credentials as mentioned above, and as many indexnow keys as needed for what you'll store in `SITE_CONFIG`.

4.  **Run Admin Screen and Add SITE_CONFIG:** check your Deno Deploy project's URL, access it with `/admin`, fill the array of objects and save. See the samples in the root of this project. Make the indexnow variable names match what you stored in your env vars.   

5.  **Redeploy:** Once environment variables are set, Deno Deploy should automatically trigger a redeployment. If not, manually redeploy your project.

6.  **Set Up Cron Job:** the `main.ts` calls `cron.ts`, which contains a cron definition. Edit as needed, being aware that your account could be flagged for abuse if you cause it to run too often. If you're posting once or twice a week, then a once-daily cron run is more than enough. 

Now you can manage your site pings from Deno Deploy!

* * * 

## Comments about Typescript

The `main.ts` is written in TypeScript. The core difference between JavaScript (`.js`) and TypeScript (`.ts`) is **type checking**. TypeScript allows you to explicitly define the **types** of your variables, function parameters, and return values. This helps catch errors *before* you even run your code, leading to more robust and maintainable applications. Deno natively supports TypeScript, so it's a seamless experience.

### Notes

1.  **File Extension:**
    * Main executable is `main.ts`. This tells Deno (and your code editor) to treat the file as a TypeScript file and apply type checking.

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

