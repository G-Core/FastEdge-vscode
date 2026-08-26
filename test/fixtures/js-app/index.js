async function eventHandler(event) {
  return new Response(`fixture ok: ${event.request.url}`, { status: 200 });
}

addEventListener("fetch", (event) => {
  event.respondWith(eventHandler(event));
});
