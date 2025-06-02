Deno.cron("Run every day at 1am", "0 1 * * *", () => {
  console.log("It's 1am, time to run the daily task!");
});

