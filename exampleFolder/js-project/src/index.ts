/// <reference types="@gcoredev/fastedge-sdk-js" />

async function eventHandler(event: FetchEvent): Promise<Response> {
  const request = event.request;
  return new Response(
    `Main Workspace Project: You made a request to ${request.url}`
  );
}

addEventListener("fetch", (event: FetchEvent) => {
  event.respondWith(eventHandler(event));
});
