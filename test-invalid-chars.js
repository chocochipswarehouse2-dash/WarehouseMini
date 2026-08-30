async function run() {
  try {
    await fetch('https://filgijcfhgqlirzhvwho.supabase.co\n/rest/v1');
  } catch(e) {
    console.error("Caught error:", e.message);
  }
}
run();
