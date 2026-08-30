async function run() {
  try {
    new URL('https://filgijcfhgqlirzhvwho.supabase.co\n/rest/v1');
    console.log("URL is ok");
  } catch(e) {
    console.error("URL parse error:", e.message);
  }
}
run();
