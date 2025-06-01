Deno.cron("ping runner cron", "*/5 * * * *", () => {
  console.log("running a ping every 5 minutes");
});
