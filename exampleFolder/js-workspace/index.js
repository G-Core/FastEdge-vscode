async function eventHandler(event) {
  const request = event.request;
  return new Response(
    `Main Javascript Workspace Project: You made a request to ${request.url}`
  );
}
addEventListener("fetch", (event) => {
  event.respondWith(eventHandler(event));
});
