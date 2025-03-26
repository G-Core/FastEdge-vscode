/// <reference types="@gcoredev/fastedge-sdk-js" />

interface Test {
  hello: string;
}

async function eventHandler(event: FetchEvent): Promise<Response> {
  const request = event.request;
  const testObj: Test = {
    hello: "world",
  };
  testObj.keith = 89;
  return new Response(
    `Main Workspace Project: You made a request to ${request.url} >> ${testObj.fred}`
  );
}

addEventListener("fetch", (event: FetchEvent) => {
  event.respondWith(eventHandler(event));
});
