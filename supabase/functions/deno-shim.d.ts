// The edge functions run on Deno. This declares the two Deno APIs they use so
// that `npm run typecheck:functions` can check them with the project's TypeScript.
declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};
