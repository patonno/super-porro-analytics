const fetch = require('node-fetch');
async function run() {
  const res = await fetch("https://gamma-api.polymarket.com/events");
  const data = await res.json();
  console.log(data.length);
}
run();
