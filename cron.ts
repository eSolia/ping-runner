Deno.cron("Run every day at 1am", "0 1 * * *", () => {
  console.log("Hello, cron!");
});

